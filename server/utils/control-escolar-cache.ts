import crypto from "node:crypto";
import { controlEscolarCentralQuery, getControlEscolarCentralDb } from "./control-escolar-central";
import { normalizePlantel } from "./auth-session";
import { parseEnrollmentConceptIds } from "./enrollment-evidence";

const CACHE_SCHEMA_CACHE_MS = 1000 * 60 * 5;
const CACHE_MAX_ROWS = 25000;
const REFRESH_LOCK_TIMEOUT_MINUTES = 10;
const STAGE_MAX_AGE_HOURS = 2;
const CACHE_VALID_MINUTES = 15;

const REQUIRED_CONTROL_CACHE_TABLES = [
  "control_base_sources",
  "control_base_scope_cache",
  "control_base_scope_cache_stage",
  "control_base_scope_validation",
];

let cacheSchemaVerifiedAt = 0;

const normalizeText = (value: unknown, max = 255) =>
  String(value ?? "")
    .trim()
    .slice(0, max);

const sourceIdForAgent = (agentId: string) => `${normalizePlantel(agentId)}:MAIN`;

const computeHash = (value: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");

const randomRefreshToken = () =>
  `${Date.now().toString(36)}-${crypto.randomBytes(10).toString("hex")}`;

const toIsoOrNull = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  const time = date.getTime();
  return Number.isFinite(time) ? date.toISOString() : String(value);
};

const safeJsonParse = (value: unknown) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
};

const sortedConceptIds = (value: unknown) =>
  Array.from(new Set(parseEnrollmentConceptIds(value))).sort((a, b) =>
    a.localeCompare(b, "es"),
  );

export type ControlEscolarScopeDescriptor = {
  cicloKey: string;
  previousCiclo: string;
  enrollmentConceptIds: string[];
  tipoIngresoConceptIds?: string[];
};

export const buildControlEscolarScopeDescriptor = (
  scope: ControlEscolarScopeDescriptor,
) => {
  const conceptIds = sortedConceptIds(scope.enrollmentConceptIds);
  const tipoIngresoConceptIds = sortedConceptIds(scope.tipoIngresoConceptIds || []);
  const payload = {
    cicloKey: normalizeText(scope.cicloKey, 20),
    previousCiclo: normalizeText(scope.previousCiclo, 20),
    enrollmentConceptIds: conceptIds,
    tipoIngresoConceptIds,
  };
  const conceptHash = computeHash([conceptIds, tipoIngresoConceptIds]).slice(0, 64);
  const scopeKey = computeHash(payload).slice(0, 64);
  return {
    ...payload,
    scopeKey,
    conceptHash,
    conceptIds,
    conceptIdsPipe: conceptIds.join("|"),
    cacheable: Boolean(payload.cicloKey && conceptIds.length),
  };
};

export const ensureControlEscolarCacheSchema = async () => {
  if (cacheSchemaVerifiedAt && Date.now() - cacheSchemaVerifiedAt < CACHE_SCHEMA_CACHE_MS) return;

  const placeholders = REQUIRED_CONTROL_CACHE_TABLES.map(() => "?").join(", ");
  const rows = await controlEscolarCentralQuery<Array<{ TABLE_NAME?: string; table_name?: string }>>(
    `SELECT TABLE_NAME
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN (${placeholders})`,
    REQUIRED_CONTROL_CACHE_TABLES,
  );
  const found = new Set(rows.map((row) => String(row.TABLE_NAME || row.table_name || "").trim()));
  const missing = REQUIRED_CONTROL_CACHE_TABLES.filter((table) => !found.has(table));
  if (missing.length) {
    throw createError({
      statusCode: 500,
      message: `Faltan tablas centrales de Control Escolar: ${missing.join(", ")}. Ejecuta manualmente el SQL de cache verificado en la base central.`,
    });
  }

  cacheSchemaVerifiedAt = Date.now();
};

export const getControlBaseSourceId = (agentId: string) => sourceIdForAgent(agentId);

export const ensureControlBaseSource = async (agentId: string) => {
  await ensureControlEscolarCacheSchema();
  const plantel = normalizePlantel(agentId);
  const sourceId = sourceIdForAgent(agentId);
  await controlEscolarCentralQuery(
    `INSERT INTO control_base_sources (source_id, plantel, bridge_agent_id, status)
     VALUES (?, ?, ?, 'active')
     ON DUPLICATE KEY UPDATE
       plantel = VALUES(plantel),
       bridge_agent_id = VALUES(bridge_agent_id),
       status = 'active',
       updated_at = CURRENT_TIMESTAMP`,
    [sourceId, plantel, plantel],
  );
  return sourceId;
};

const countScopeRows = (rows: any[]) => {
  const counts = {
    total: rows.length,
    inscritos: 0,
    noInscritos: 0,
    bajas: 0,
    bajaInscrita: 0,
  };
  rows.forEach((row) => {
    const state = normalizeText(row.operatorEnrollmentState || row.enrollmentState || "").toLowerCase();
    if (state === "inscrito") counts.inscritos += 1;
    else if (state === "no_inscrito") counts.noInscritos += 1;
    else if (state === "baja_inscrita") counts.bajaInscrita += 1;
    else if (state === "baja") counts.bajas += 1;
  });
  return counts;
};

const cachePayloadForRow = (row: any) => {
  const copy = { ...row };
  delete copy.photoUrl;
  delete copy.foto;
  delete copy.rawPhoto;
  return copy;
};

const sourcePayload = (args: {
  sourceId: string;
  scopeKey: string;
  freshness: string;
  rows: number;
  cacheRefreshedAt?: string | null;
  cacheExpiresAt?: string | null;
  validation?: any;
}) => ({
  sourceId: args.sourceId,
  scopeKey: args.scopeKey,
  source: `verified-cache:${args.sourceId}:${args.scopeKey}.control_base_scope_cache`,
  base: `verified-cache:${args.sourceId}:${args.scopeKey}.control_base_scope_cache`,
  cacheFreshness: args.freshness,
  cacheRows: args.rows,
  cacheRefreshDue: args.freshness !== "fresh",
  cacheRefreshedAt: args.cacheRefreshedAt || null,
  cacheExpiresAt: args.cacheExpiresAt || null,
  cacheValidation: args.validation || null,
});

export const fetchVerifiedControlEscolarScopeRows = async (
  agentId: string,
  scope: ControlEscolarScopeDescriptor,
) => {
  const descriptor = buildControlEscolarScopeDescriptor(scope);
  if (!descriptor.cacheable) {
    return {
      rows: [],
      source: sourcePayload({
        sourceId: sourceIdForAgent(agentId),
        scopeKey: descriptor.scopeKey,
        freshness: "disabled",
        rows: 0,
        validation: { status: "skipped", reason: "missing_enrollment_concepts" },
      }),
      meta: null,
    };
  }

  await ensureControlEscolarCacheSchema();
  const sourceId = await ensureControlBaseSource(agentId);
  const validationRows = await controlEscolarCentralQuery<any[]>(
    `SELECT source_id, scope_key, ciclo_key, previous_ciclo, concept_hash, concept_ids,
            validation_status, cache_refreshed_at, cache_expires_at, cache_row_count,
            live_total, cached_total, live_inscritos, cached_inscritos,
            live_no_inscritos, cached_no_inscritos, live_bajas, cached_bajas,
            live_baja_inscrita, cached_baja_inscrita, last_error
     FROM control_base_scope_validation
     WHERE source_id = ? AND scope_key = ? AND validation_status = 'pass'
     LIMIT 1`,
    [sourceId, descriptor.scopeKey],
  );
  const validation = validationRows[0];
  if (!validation || Number(validation.cache_row_count || 0) <= 0) {
    return {
      rows: [],
      source: sourcePayload({
        sourceId,
        scopeKey: descriptor.scopeKey,
        freshness: "empty",
        rows: 0,
        validation: validation || { status: "missing" },
      }),
      meta: validation || null,
    };
  }

  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT matricula, plantel, base_payload, row_hash, refreshed_at
     FROM control_base_scope_cache
     WHERE source_id = ? AND scope_key = ?
     ORDER BY plantel ASC, matricula ASC
     LIMIT ${CACHE_MAX_ROWS + 1}`,
    [sourceId, descriptor.scopeKey],
  );
  if (rows.length > CACHE_MAX_ROWS) {
    throw createError({
      statusCode: 413,
      message: `El cache verificado excede el límite temporal de ${CACHE_MAX_ROWS} alumnos para Control Escolar.`,
    });
  }

  const now = Date.now();
  const expiresAt = validation.cache_expires_at ? new Date(validation.cache_expires_at).getTime() : 0;
  const freshness = expiresAt && expiresAt >= now ? "fresh" : "stale-verified";
  const mapped = rows
    .map((row) => safeJsonParse(row.base_payload))
    .filter(Boolean)
    .map((payload: any) => ({
      ...payload,
      agentId: normalizePlantel(agentId),
      matricula: normalizeText(payload.matricula, 64),
      studentId: normalizeText(payload.studentId || payload.matricula, 64),
      cacheSourceId: sourceId,
      cacheScopeKey: descriptor.scopeKey,
    }));

  return {
    rows: mapped,
    source: sourcePayload({
      sourceId,
      scopeKey: descriptor.scopeKey,
      freshness,
      rows: mapped.length,
      cacheRefreshedAt: toIsoOrNull(validation.cache_refreshed_at),
      cacheExpiresAt: toIsoOrNull(validation.cache_expires_at),
      validation,
    }),
    meta: validation,
  };
};

const acquireRefreshLock = async (sourceId: string, refreshToken: string) => {
  const result: any = await controlEscolarCentralQuery(
    `UPDATE control_base_sources
     SET refresh_status = 'running',
         refresh_token = ?,
         refresh_started_at = CURRENT_TIMESTAMP,
         refresh_finished_at = NULL,
         last_error = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE source_id = ?
       AND (
         refresh_status <> 'running'
         OR refresh_started_at IS NULL
         OR refresh_started_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${REFRESH_LOCK_TIMEOUT_MINUTES} MINUTE)
       )`,
    [refreshToken, sourceId],
  );
  return Number(result?.affectedRows || 0) > 0;
};

const cleanupStageRows = async (sourceId: string, refreshToken?: string) => {
  const tokenClause = refreshToken ? " OR refresh_token = ?" : "";
  const params = refreshToken ? [sourceId, refreshToken] : [sourceId];
  await controlEscolarCentralQuery(
    `DELETE FROM control_base_scope_cache_stage
     WHERE source_id = ?${tokenClause}
        OR staged_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${STAGE_MAX_AGE_HOURS} HOUR)`,
    params,
  ).catch(() => null);
};

const insertStageRows = async (
  sourceId: string,
  refreshToken: string,
  scopeKey: string,
  rows: any[],
) => {
  let inserted = 0;
  for (let index = 0; index < rows.length; index += 300) {
    const chunk = rows.slice(index, index + 300);
    if (!chunk.length) continue;
    const values: any[] = [];
    const placeholders = chunk
      .map((row) => {
        const payload = cachePayloadForRow(row);
        values.push(
          sourceId,
          scopeKey,
          refreshToken,
          normalizeText(row.matricula, 64),
          normalizePlantel(row.basePlantel || row.plantel || ""),
          JSON.stringify(payload),
          computeHash(payload),
        );
        return "(?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)";
      })
      .join(",");
    await controlEscolarCentralQuery(
      `INSERT INTO control_base_scope_cache_stage
         (source_id, scope_key, refresh_token, matricula, plantel, base_payload, row_hash, staged_at)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         plantel = VALUES(plantel),
         base_payload = VALUES(base_payload),
         row_hash = VALUES(row_hash),
         staged_at = CURRENT_TIMESTAMP`,
      values,
    );
    inserted += chunk.length;
  }
  return inserted;
};

const readStagePayloadRows = async (sourceId: string, scopeKey: string, refreshToken: string) => {
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT base_payload
     FROM control_base_scope_cache_stage
     WHERE source_id = ? AND scope_key = ? AND refresh_token = ?
     LIMIT ${CACHE_MAX_ROWS + 1}`,
    [sourceId, scopeKey, refreshToken],
  );
  return rows.map((row) => safeJsonParse(row.base_payload)).filter(Boolean);
};

const validationMismatch = (live: ReturnType<typeof countScopeRows>, cached: ReturnType<typeof countScopeRows>) => {
  const keys = ["total", "inscritos", "noInscritos", "bajas", "bajaInscrita"] as const;
  return keys.filter((key) => live[key] !== cached[key]);
};

const writeValidation = async (
  sourceId: string,
  descriptor: ReturnType<typeof buildControlEscolarScopeDescriptor>,
  status: "pass" | "fail",
  live: ReturnType<typeof countScopeRows>,
  cached: ReturnType<typeof countScopeRows>,
  error = "",
) => {
  await controlEscolarCentralQuery(
    `INSERT INTO control_base_scope_validation
       (source_id, scope_key, ciclo_key, previous_ciclo, concept_hash, concept_ids,
        validation_status, cache_refreshed_at, cache_expires_at, cache_row_count,
        live_total, cached_total, live_inscritos, cached_inscritos,
        live_no_inscritos, cached_no_inscritos, live_bajas, cached_bajas,
        live_baja_inscrita, cached_baja_inscrita, last_error, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       ciclo_key = VALUES(ciclo_key),
       previous_ciclo = VALUES(previous_ciclo),
       concept_hash = VALUES(concept_hash),
       concept_ids = VALUES(concept_ids),
       validation_status = VALUES(validation_status),
       cache_refreshed_at = VALUES(cache_refreshed_at),
       cache_expires_at = VALUES(cache_expires_at),
       cache_row_count = VALUES(cache_row_count),
       live_total = VALUES(live_total),
       cached_total = VALUES(cached_total),
       live_inscritos = VALUES(live_inscritos),
       cached_inscritos = VALUES(cached_inscritos),
       live_no_inscritos = VALUES(live_no_inscritos),
       cached_no_inscritos = VALUES(cached_no_inscritos),
       live_bajas = VALUES(live_bajas),
       cached_bajas = VALUES(cached_bajas),
       live_baja_inscrita = VALUES(live_baja_inscrita),
       cached_baja_inscrita = VALUES(cached_baja_inscrita),
       last_error = VALUES(last_error),
       updated_at = CURRENT_TIMESTAMP`,
    [
      sourceId,
      descriptor.scopeKey,
      descriptor.cicloKey,
      descriptor.previousCiclo,
      descriptor.conceptHash,
      descriptor.conceptIdsPipe,
      status,
      CACHE_VALID_MINUTES,
      cached.total,
      live.total,
      cached.total,
      live.inscritos,
      cached.inscritos,
      live.noInscritos,
      cached.noInscritos,
      live.bajas,
      cached.bajas,
      live.bajaInscrita,
      cached.bajaInscrita,
      error.slice(0, 800),
    ],
  );
};

const promoteStageToActive = async (
  sourceId: string,
  scopeKey: string,
  refreshToken: string,
  rowCount: number,
) => {
  const db = getControlEscolarCentralDb();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `DELETE FROM control_base_scope_cache WHERE source_id = ? AND scope_key = ?`,
      [sourceId, scopeKey],
    );
    await connection.query(
      `INSERT INTO control_base_scope_cache
         (source_id, scope_key, matricula, plantel, base_payload, row_hash, refreshed_at)
       SELECT source_id, scope_key, matricula, plantel, base_payload, row_hash, CURRENT_TIMESTAMP
       FROM control_base_scope_cache_stage
       WHERE source_id = ? AND scope_key = ? AND refresh_token = ?`,
      [sourceId, scopeKey, refreshToken],
    );
    await connection.query(
      `DELETE FROM control_base_scope_cache_stage WHERE source_id = ? AND scope_key = ?`,
      [sourceId, scopeKey],
    );
    await connection.query(
      `UPDATE control_base_sources
       SET refresh_status = 'idle', refresh_token = NULL, refresh_finished_at = CURRENT_TIMESTAMP,
           last_error = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE source_id = ?`,
      [sourceId],
    );
    await connection.commit();
    return rowCount;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const maybeRefreshVerifiedControlEscolarScopeCache = async (
  agentId: string,
  scope: ControlEscolarScopeDescriptor,
  liveRows: any[],
  options: { triggerName?: string } = {},
) => {
  const descriptor = buildControlEscolarScopeDescriptor(scope);
  const plantel = normalizePlantel(agentId);
  if (!plantel || plantel === "GLOBAL") return { success: true, skipped: true, reason: "invalid_plantel" };
  if (!descriptor.cacheable) return { success: true, skipped: true, reason: "missing_enrollment_concepts" };
  if (!Array.isArray(liveRows) || !liveRows.length) return { success: true, skipped: true, reason: "empty_rows" };
  if (liveRows.length > CACHE_MAX_ROWS) throw new Error(`El plantel excede el límite temporal de ${CACHE_MAX_ROWS} alumnos para cachear Control Escolar.`);

  await ensureControlEscolarCacheSchema();
  const sourceId = await ensureControlBaseSource(plantel);
  const refreshToken = randomRefreshToken();
  const lockAcquired = await acquireRefreshLock(sourceId, refreshToken);
  if (!lockAcquired) return { success: true, skipped: true, reason: "refresh_already_running", sourceId, plantel };

  try {
    await cleanupStageRows(sourceId, refreshToken);
    const staged = await insertStageRows(sourceId, refreshToken, descriptor.scopeKey, liveRows);
    const stageRows = await readStagePayloadRows(sourceId, descriptor.scopeKey, refreshToken);
    const liveCounts = countScopeRows(liveRows);
    const cachedCounts = countScopeRows(stageRows);
    const mismatches = validationMismatch(liveCounts, cachedCounts);
    if (staged !== liveRows.length || mismatches.length) {
      const message = `Cache validation failed: staged=${staged}, live=${liveRows.length}, mismatches=${mismatches.join(",")}`;
      await writeValidation(sourceId, descriptor, "fail", liveCounts, cachedCounts, message);
      throw new Error(message);
    }

    await promoteStageToActive(sourceId, descriptor.scopeKey, refreshToken, staged);
    await writeValidation(sourceId, descriptor, "pass", liveCounts, cachedCounts, "");
    return {
      success: true,
      sourceId,
      plantel,
      scopeKey: descriptor.scopeKey,
      totalRows: liveRows.length,
      updatedRows: staged,
      counts: cachedCounts,
      triggerName: normalizeText(options.triggerName || "verified-live-bridge-read", 80),
    };
  } catch (error: any) {
    const message = String(error?.message || error || "No se pudo actualizar el cache verificado.").slice(0, 800);
    await cleanupStageRows(sourceId, refreshToken);
    await controlEscolarCentralQuery(
      `UPDATE control_base_sources
       SET refresh_status = 'idle', refresh_token = NULL, refresh_finished_at = CURRENT_TIMESTAMP,
           last_error = ?, updated_at = CURRENT_TIMESTAMP
       WHERE source_id = ? AND refresh_token = ?`,
      [message, sourceId, refreshToken],
    ).catch(() => null);
    throw error;
  }
};

// Backward-compatible exports used by plantel routes. They intentionally refuse
// request-shaped rows that are not canonical Control Escolar scope rows.
export const maybeRefreshControlEscolarCacheFromLoadedRows = async (
  agentId: string,
  rows: any[],
  options: { triggerName?: string; cicloKey?: string; previousCiclo?: string; enrollmentConceptIds?: string[] } = {},
) => {
  const looksCanonical = Array.isArray(rows) && rows.every((row) => row && typeof row.operatorEnrollmentState === "string");
  if (!looksCanonical) return { success: true, skipped: true, reason: "not_canonical_control_escolar_scope" };
  return maybeRefreshVerifiedControlEscolarScopeCache(
    agentId,
    {
      cicloKey: options.cicloKey || "",
      previousCiclo: options.previousCiclo || "",
      enrollmentConceptIds: options.enrollmentConceptIds || [],
    },
    rows,
    { triggerName: options.triggerName },
  );
};

export const maybePublishControlEscolarSnapshotFromBridge = async () => ({
  success: true,
  skipped: true,
  reason: "disabled_use_verified_live_read_seed",
});

export const publishControlEscolarSnapshotFromBridge = maybePublishControlEscolarSnapshotFromBridge;

export const readControlCacheSourceMeta = async (agentId: string) => {
  await ensureControlEscolarCacheSchema();
  const sourceId = await ensureControlBaseSource(agentId);
  const validations = await controlEscolarCentralQuery<any[]>(
    `SELECT scope_key, ciclo_key, previous_ciclo, concept_ids, validation_status,
            cache_refreshed_at, cache_expires_at, cache_row_count,
            live_total, cached_total, live_inscritos, cached_inscritos,
            live_no_inscritos, cached_no_inscritos, live_bajas, cached_bajas,
            live_baja_inscrita, cached_baja_inscrita, last_error
     FROM control_base_scope_validation
     WHERE source_id = ?
     ORDER BY cache_refreshed_at DESC
     LIMIT 10`,
    [sourceId],
  );
  const sourceRows = await controlEscolarCentralQuery<any[]>(
    `SELECT source_id, plantel, bridge_agent_id, refresh_status, refresh_started_at,
            refresh_finished_at, last_error
     FROM control_base_sources
     WHERE source_id = ?
     LIMIT 1`,
    [sourceId],
  );
  const source = sourceRows[0] || {};
  return {
    sourceId,
    plantel: normalizePlantel(agentId),
    bridgeAgentId: normalizePlantel(agentId),
    refreshStatus: normalizeText(source.refresh_status || "idle", 30),
    refreshStartedAt: toIsoOrNull(source.refresh_started_at),
    refreshFinishedAt: toIsoOrNull(source.refresh_finished_at),
    lastError: normalizeText(source.last_error || "", 800),
    scopes: validations.map((row) => ({
      scopeKey: row.scope_key,
      cicloKey: row.ciclo_key,
      previousCiclo: row.previous_ciclo,
      conceptIds: row.concept_ids,
      validationStatus: row.validation_status,
      cacheRefreshedAt: toIsoOrNull(row.cache_refreshed_at),
      cacheExpiresAt: toIsoOrNull(row.cache_expires_at),
      cacheRowCount: Number(row.cache_row_count || 0),
      liveTotal: Number(row.live_total || 0),
      cachedTotal: Number(row.cached_total || 0),
      liveInscritos: Number(row.live_inscritos || 0),
      cachedInscritos: Number(row.cached_inscritos || 0),
      liveNoInscritos: Number(row.live_no_inscritos || 0),
      cachedNoInscritos: Number(row.cached_no_inscritos || 0),
      liveBajas: Number(row.live_bajas || 0),
      cachedBajas: Number(row.cached_bajas || 0),
      liveBajaInscrita: Number(row.live_baja_inscrita || 0),
      cachedBajaInscrita: Number(row.cached_baja_inscrita || 0),
      lastError: row.last_error || "",
    })),
  };
};
