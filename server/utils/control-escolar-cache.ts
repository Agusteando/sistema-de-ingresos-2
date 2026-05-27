import crypto from "node:crypto";
import { controlEscolarCentralQuery, getControlEscolarCentralDb } from "./control-escolar-central";
import { query, runWithBridgeAgentId } from "./db";
import { normalizePlantel } from "./auth-session";
import { normalizeCicloKey } from "../../shared/utils/ciclo";
import { parseEnrollmentConceptIds } from "./enrollment-evidence";
import { previousCicloKey } from "../../shared/utils/tipoIngreso";

const CENTRAL_CACHE_CHUNK_SIZE = 350;
const CACHE_SCHEMA_CACHE_MS = 1000 * 60 * 5;
const ACTIVE_CACHE_MAX_ROWS = 25000;
const AUTO_REFRESH_MIN_AGE_MINUTES = 15;
const REFRESH_LOCK_TIMEOUT_MINUTES = 10;
const STAGE_MAX_AGE_HOURS = 2;

const REQUIRED_CONTROL_CACHE_TABLES = [
  "control_base_sources",
  "control_base_cache",
  "control_enrollment_evidence_cache",
  "control_base_cache_stage",
  "control_enrollment_evidence_cache_stage",
];

let cacheSchemaVerifiedAt = 0;

const normalizeText = (value: unknown, max = 255) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const sqlLiteral = (value: string) => `'${String(value).replace(/'/g, "''")}'`;
const escapeIdentifier = (value: string) =>
  `\`${String(value).replace(/`/g, "``")}\``;
const sourceIdForAgent = (agentId: string) =>
  `${normalizePlantel(agentId)}:MAIN`;

const assertBridgeAgentSelectable = (agentId: string) => {
  const config = useRuntimeConfig() as any;
  const transport = String(config.dbTransport || "direct").toLowerCase();
  const configuredAgentId = normalizePlantel(config.dbBridgeAgentId);
  const requestedAgentId = normalizePlantel(agentId);
  if (
    transport === "bridge" &&
    configuredAgentId &&
    configuredAgentId !== requestedAgentId
  ) {
    throw createError({
      statusCode: 409,
      message:
        "El cache central requiere selección dinámica de agentId. DB_BRIDGE_AGENT_ID está fijado y bloquearía el plantel solicitado.",
    });
  }
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

const computeHash = (value: unknown) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(value ?? null))
    .digest("hex");

const randomRefreshToken = () =>
  `${Date.now().toString(36)}-${crypto.randomBytes(10).toString("hex")}`;

const hasColumn = (columns: Set<string>, column: string) => columns.has(column);
const col = (alias: string, column: string) =>
  `${alias}.${escapeIdentifier(column)}`;
const expr = (
  columns: Set<string>,
  alias: string,
  column: string,
  fallback = "NULL",
) => (hasColumn(columns, column) ? col(alias, column) : fallback);
const nullIfTrim = (sql: string) => `NULLIF(TRIM(CAST(${sql} AS CHAR)), '')`;
const coalesceExpr = (...parts: Array<string | false | null | undefined>) => {
  const clean = parts.filter(Boolean) as string[];
  return clean.length ? `COALESCE(${clean.join(", ")})` : "NULL";
};
const selectAs = (sql: string, alias: string) =>
  `${sql} AS ${escapeIdentifier(alias)}`;

const idsToPipe = (value: unknown) => parseEnrollmentConceptIds(value).join("|");
const mergePipeIds = (...values: unknown[]) =>
  parseEnrollmentConceptIds(values).join("|");

export const ensureControlEscolarCacheSchema = async () => {
  if (
    cacheSchemaVerifiedAt &&
    Date.now() - cacheSchemaVerifiedAt < CACHE_SCHEMA_CACHE_MS
  )
    return;

  const placeholders = REQUIRED_CONTROL_CACHE_TABLES.map(() => "?").join(", ");
  const rows = await controlEscolarCentralQuery<
    Array<{ TABLE_NAME?: string; table_name?: string }>
  >(
    `SELECT TABLE_NAME
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN (${placeholders})`,
    REQUIRED_CONTROL_CACHE_TABLES,
  );
  const found = new Set(
    rows.map((row) => String(row.TABLE_NAME || row.table_name || "").trim()),
  );
  const missing = REQUIRED_CONTROL_CACHE_TABLES.filter(
    (table) => !found.has(table),
  );

  if (missing.length) {
    throw createError({
      statusCode: 500,
      message: `Faltan tablas centrales de Control Escolar: ${missing.join(", ")}. Ejecuta manualmente database/control-escolar-cache-schema.sql en la base central.`,
    });
  }

  cacheSchemaVerifiedAt = Date.now();
};

export const getControlBaseSourceId = (agentId: string) =>
  sourceIdForAgent(agentId);

export const ensureControlBaseSource = async (
  agentId: string,
  options: { machineId?: string } = {},
) => {
  await ensureControlEscolarCacheSchema();
  const plantel = normalizePlantel(agentId);
  const sourceId = sourceIdForAgent(agentId);
  await controlEscolarCentralQuery(
    `INSERT INTO control_base_sources (source_id, plantel, bridge_agent_id, machine_id, status)
     VALUES (?, ?, ?, ?, 'active')
     ON DUPLICATE KEY UPDATE
       plantel = VALUES(plantel),
       bridge_agent_id = VALUES(bridge_agent_id),
       machine_id = COALESCE(VALUES(machine_id), machine_id),
       status = 'active',
       updated_at = CURRENT_TIMESTAMP`,
    [
      sourceId,
      plantel,
      plantel,
      normalizeText(options.machineId || "", 120) || null,
    ],
  );
  return sourceId;
};

export type ControlCacheSourceMeta = {
  sourceId: string;
  plantel: string;
  bridgeAgentId: string;
  refreshStatus: string;
  refreshStartedAt: string | null;
  refreshFinishedAt: string | null;
  cacheRefreshedAt: string | null;
  cacheExpiresAt: string | null;
  cacheRowCount: number;
  evidenceRowCount: number;
  freshness: "empty" | "fresh" | "expired" | "refreshing";
  ageMs: number | null;
  message: string;
};

const toIsoOrNull = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  const time = date.getTime();
  return Number.isFinite(time) ? date.toISOString() : String(value);
};

const isRunningRefresh = (source: any) => {
  if (String(source?.refresh_status || "").toLowerCase() !== "running")
    return false;
  const started = source?.refresh_started_at
    ? new Date(source.refresh_started_at).getTime()
    : 0;
  if (!started) return true;
  return Date.now() - started < REFRESH_LOCK_TIMEOUT_MINUTES * 60 * 1000;
};

const resolveSourceFreshness = (source: any): ControlCacheSourceMeta => {
  const refreshed = source?.cache_refreshed_at
    ? new Date(source.cache_refreshed_at)
    : null;
  const expires = source?.cache_expires_at
    ? new Date(source.cache_expires_at)
    : null;
  const now = Date.now();
  const rows = Number(source?.cache_row_count || 0) || 0;
  let freshness: ControlCacheSourceMeta["freshness"] = "empty";

  if (refreshed && rows > 0) {
    freshness = expires && expires.getTime() >= now ? "fresh" : "expired";
  }
  if (freshness !== "fresh" && isRunningRefresh(source)) {
    freshness = "refreshing";
  }

  const ageMs = refreshed ? Math.max(0, now - refreshed.getTime()) : null;
  const message =
    freshness === "fresh"
      ? "Cache central vigente."
      : freshness === "refreshing"
        ? "Cache central actualizándose automáticamente."
        : freshness === "expired"
          ? "Cache central vencido; se debe usar bridge en vivo o bloquear lectura para evitar datos stale."
          : "No existe cache central vigente para este plantel.";

  return {
    sourceId: String(source?.source_id || ""),
    plantel: normalizePlantel(source?.plantel),
    bridgeAgentId: normalizeText(source?.bridge_agent_id, 120),
    refreshStatus: normalizeText(source?.refresh_status || "idle", 30),
    refreshStartedAt: toIsoOrNull(source?.refresh_started_at),
    refreshFinishedAt: toIsoOrNull(source?.refresh_finished_at),
    cacheRefreshedAt: toIsoOrNull(source?.cache_refreshed_at),
    cacheExpiresAt: toIsoOrNull(source?.cache_expires_at),
    cacheRowCount: rows,
    evidenceRowCount: Number(source?.evidence_row_count || 0) || 0,
    freshness,
    ageMs,
    message,
  };
};

export const readControlCacheSourceMeta = async (
  agentId: string,
): Promise<ControlCacheSourceMeta> => {
  const sourceId = await ensureControlBaseSource(agentId);
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT source_id, plantel, bridge_agent_id, refresh_status, refresh_started_at, refresh_finished_at,
            cache_refreshed_at, cache_expires_at, cache_row_count, evidence_row_count
     FROM control_base_sources
     WHERE source_id = ?
     LIMIT 1`,
    [sourceId],
  );
  return resolveSourceFreshness(
    rows[0] || {
      source_id: sourceId,
      plantel: normalizePlantel(agentId),
      bridge_agent_id: normalizePlantel(agentId),
      refresh_status: "idle",
    },
  );
};

const buildCacheSourcePayload = (
  meta: ControlCacheSourceMeta,
  rows: number,
) => ({
  sourceId: meta.sourceId,
  source: `central-cache:${meta.sourceId}.control_base_cache`,
  base: `central-cache:${meta.sourceId}.control_base_cache`,
  cacheFreshness: meta.freshness,
  cacheMessage: meta.message,
  cacheRows: rows,
  cacheRefreshDue: meta.freshness !== "fresh",
  cacheRefreshedAt: meta.cacheRefreshedAt,
  cacheExpiresAt: meta.cacheExpiresAt,
  cacheAgeMs: meta.ageMs,
});

export type CachedControlBaseRowsResult = {
  rows: any[];
  source: ReturnType<typeof buildCacheSourcePayload>;
  meta: ControlCacheSourceMeta;
};

const filterRowsBySearch = (rows: any[], search: string) => {
  const normalized = search.toLowerCase();
  if (!normalized) return rows;
  return rows.filter((row) =>
    [
      row.matricula,
      row.baseNombreCompleto,
      row.baseNombres,
      row.baseApellidoPaterno,
      row.baseApellidoMaterno,
      row.baseCurp,
      row.baseCorreo,
      row.baseTelefono,
      row.nombreCompleto,
      row.fullName,
    ].some((value) =>
      String(value || "")
        .toLowerCase()
        .includes(normalized),
    ),
  );
};

const filterConceptIds = (raw: unknown, enrollmentConceptIds: string[]) => {
  const conceptSet = new Set(parseEnrollmentConceptIds(enrollmentConceptIds));
  const ids = parseEnrollmentConceptIds(raw);
  return conceptSet.size
    ? ids.filter((id) => conceptSet.has(id)).join("|")
    : ids.join("|");
};

export const fetchCachedControlEscolarBaseRows = async (
  agentId: string,
  filters: any = {},
  scope: {
    cicloKey: string;
    previousCiclo: string;
    enrollmentConceptIds: string[];
  },
): Promise<CachedControlBaseRowsResult> => {
  await ensureControlEscolarCacheSchema();
  const meta = await readControlCacheSourceMeta(agentId);

  if (meta.freshness === "empty") {
    return { rows: [], source: buildCacheSourcePayload(meta, 0), meta };
  }

  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT C.source_id, C.matricula, C.plantel, C.base_payload, C.row_hash, C.refreshed_at,
            Cur.paid_concept_ids AS currentPaidConceptIds,
            Cur.charged_concept_ids AS currentChargedConceptIds,
            Prev.paid_concept_ids AS previousPaidConceptIds,
            Prev.charged_concept_ids AS previousChargedConceptIds,
            Hist.all_concept_ids AS historicalConceptIds
     FROM control_base_cache C
     LEFT JOIN control_enrollment_evidence_cache Cur
       ON Cur.source_id = C.source_id AND Cur.matricula = C.matricula AND Cur.ciclo = ?
     LEFT JOIN control_enrollment_evidence_cache Prev
       ON Prev.source_id = C.source_id AND Prev.matricula = C.matricula AND Prev.ciclo = ?
     LEFT JOIN (
       SELECT source_id, matricula, GROUP_CONCAT(DISTINCT all_concept_ids SEPARATOR '|') AS all_concept_ids
       FROM control_enrollment_evidence_cache
       WHERE source_id = ?
       GROUP BY source_id, matricula
     ) Hist ON Hist.source_id = C.source_id AND Hist.matricula = C.matricula
     WHERE C.source_id = ?
     ORDER BY C.plantel ASC, C.matricula ASC
     LIMIT ${ACTIVE_CACHE_MAX_ROWS + 1}`,
    [scope.cicloKey, scope.previousCiclo, meta.sourceId, meta.sourceId],
  );

  if (rows.length > ACTIVE_CACHE_MAX_ROWS) {
    throw createError({
      statusCode: 413,
      message: `El cache central excede el límite temporal de ${ACTIVE_CACHE_MAX_ROWS} alumnos para Control Escolar.`,
    });
  }

  const mapped = rows.map((row) => {
    const payload = safeJsonParse(row.base_payload) || {};
    const conceptoIdsPagados = filterConceptIds(
      row.currentPaidConceptIds,
      scope.enrollmentConceptIds,
    );
    const conceptoIdsCargados = filterConceptIds(
      row.currentChargedConceptIds,
      scope.enrollmentConceptIds,
    );
    const conceptoIdsPagadosPrevios = filterConceptIds(
      row.previousPaidConceptIds,
      scope.enrollmentConceptIds,
    );
    const conceptoIdsCargadosPrevios = filterConceptIds(
      row.previousChargedConceptIds,
      scope.enrollmentConceptIds,
    );
    const conceptoIdsHistoricos = filterConceptIds(
      row.historicalConceptIds,
      scope.enrollmentConceptIds,
    );

    return {
      ...payload,
      agentId: normalizePlantel(agentId),
      matricula: normalizeText(payload.matricula || row.matricula, 64),
      studentId: normalizeText(
        payload.studentId || payload.matricula || row.matricula,
        64,
      ),
      basePlantel: normalizeText(
        payload.basePlantel || row.plantel || agentId,
        40,
      ),
      rowHash: row.row_hash,
      cacheSourceId: row.source_id,
      cacheCachedAt: toIsoOrNull(row.refreshed_at),
      conceptoIdsPagados,
      conceptoIdsCargados,
      conceptoIdsPagadosPrevios,
      conceptoIdsCargadosPrevios,
      conceptoIdsCicloActual: mergePipeIds(
        conceptoIdsPagados,
        conceptoIdsCargados,
      ),
      conceptoIdsCicloPrevio: mergePipeIds(
        conceptoIdsPagadosPrevios,
        conceptoIdsCargadosPrevios,
      ),
      conceptoIdsHistoricos,
      conceptoIdsTodos: conceptoIdsHistoricos,
    };
  });

  const search = normalizeText(filters.search || filters.q || "", 80);
  const filtered = filterRowsBySearch(mapped, search);
  return {
    rows: filtered,
    source: buildCacheSourcePayload(meta, filtered.length),
    meta,
  };
};

export const fetchCachedControlEscolarBaseContext = async (
  agentId: string,
  matricula: string,
) => {
  await ensureControlEscolarCacheSchema();
  const meta = await readControlCacheSourceMeta(agentId);
  if (meta.freshness === "empty") return null;

  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT source_id, matricula, plantel, base_payload, row_hash, refreshed_at
     FROM control_base_cache
     WHERE source_id = ? AND matricula = ?
     LIMIT 1`,
    [meta.sourceId, normalizeText(matricula, 64)],
  );
  const row = rows[0];
  if (!row) return null;
  const payload = safeJsonParse(row.base_payload) || {};
  return {
    source: "cache" as const,
    sourceId: meta.sourceId,
    rowHash: row.row_hash as string,
    rawBase: payload,
    baseRow: {
      matricula: normalizeText(payload.matricula || row.matricula, 64),
      plantel: normalizeText(
        payload.plantelBaseOriginal ||
          payload.basePlantel ||
          row.plantel ||
          agentId,
        40,
      ),
      nivelBase: payload.rawBaseNivel || payload.baseNivel,
      gradoBase: payload.rawBaseGrado || payload.baseGrado,
      cicloBase: payload.baseCiclo,
      baseNivel: payload.rawBaseNivel || payload.baseNivel,
      baseGrado: payload.rawBaseGrado || payload.baseGrado,
      baseCiclo: payload.baseCiclo,
      basePlantel:
        payload.plantelBaseOriginal ||
        payload.basePlantel ||
        row.plantel ||
        agentId,
      rowHash: row.row_hash,
    },
  };
};

const fetchLocalColumns = async (tableName: string) => {
  const rows = await query<Array<{ Field: string }>>(
    `SHOW COLUMNS FROM ${escapeIdentifier(tableName)}`,
  );
  return new Set(rows.map((row) => row.Field));
};

const localTableExists = async (tableName: string) => {
  const rows = await query<any[]>(`SHOW TABLES LIKE ?`, [tableName]);
  return rows.length > 0;
};

const buildBaseSnapshotSelect = (agentId: string, columns: Set<string>) => {
  const baseNombreCompleto = hasColumn(columns, "nombreCompleto")
    ? nullIfTrim(col("b", "nombreCompleto"))
    : `NULLIF(TRIM(CONCAT_WS(' ', ${expr(columns, "b", "apellidoPaterno")}, ${expr(columns, "b", "apellidoMaterno")}, ${expr(columns, "b", "nombres")})), '')`;
  const updatedAt = coalesceExpr(
    expr(columns, "b", "updated_at"),
    expr(columns, "b", "updatedAt"),
    expr(columns, "b", "fecha_actualizacion"),
  );
  return [
    selectAs(sqlLiteral(normalizePlantel(agentId)), "agentId"),
    selectAs(col("b", "matricula"), "matricula"),
    selectAs(col("b", "matricula"), "studentId"),
    selectAs(
      coalesceExpr(
        nullIfTrim(expr(columns, "b", "plantel")),
        sqlLiteral(normalizePlantel(agentId)),
      ),
      "basePlantel",
    ),
    selectAs(
      coalesceExpr(
        nullIfTrim(expr(columns, "b", "plantel")),
        sqlLiteral(normalizePlantel(agentId)),
      ),
      "plantelBaseOriginal",
    ),
    selectAs(expr(columns, "b", "nombres"), "baseNombres"),
    selectAs(expr(columns, "b", "apellidoPaterno"), "baseApellidoPaterno"),
    selectAs(expr(columns, "b", "apellidoMaterno"), "baseApellidoMaterno"),
    selectAs(baseNombreCompleto, "baseNombreCompleto"),
    selectAs(expr(columns, "b", "curp"), "baseCurp"),
    selectAs(expr(columns, "b", "correo"), "baseCorreo"),
    selectAs(expr(columns, "b", "telefono"), "baseTelefono"),
    selectAs(expr(columns, "b", "grado"), "baseGrado"),
    selectAs(expr(columns, "b", "grado"), "rawBaseGrado"),
    selectAs(expr(columns, "b", "grupo"), "baseGrupo"),
    selectAs(expr(columns, "b", "nivel"), "baseNivel"),
    selectAs(expr(columns, "b", "nivel"), "rawBaseNivel"),
    selectAs(expr(columns, "b", "interno"), "baseInterno"),
    selectAs(expr(columns, "b", "estatus", sqlLiteral("Activo")), "baseEstatus"),
    selectAs(expr(columns, "b", "Nombre del padre o tutor"), "baseGuardian"),
    selectAs(expr(columns, "b", "direccion"), "baseDireccion"),
    selectAs(expr(columns, "b", "domicilio"), "baseDomicilio"),
    selectAs(updatedAt, "baseUpdatedAt"),
    selectAs(expr(columns, "b", "ciclo", "NULL"), "baseCiclo"),
  ];
};

const fetchLocalSnapshotBaseRows = async (agentId: string) => {
  const baseExists = await localTableExists("base");
  if (!baseExists)
    throw new Error("La tabla base no existe en el plantel seleccionado.");
  const columns = await fetchLocalColumns("base");
  if (!columns.has("matricula"))
    throw new Error("La tabla base no tiene columna matricula.");

  const fields = buildBaseSnapshotSelect(agentId, columns);
  const rows = await query<any[]>(
    `SELECT ${fields.join(",\n      ")}
     FROM base b
     WHERE b.matricula IS NOT NULL AND TRIM(CAST(b.matricula AS CHAR)) <> ''
     ORDER BY b.matricula ASC
     LIMIT ${ACTIVE_CACHE_MAX_ROWS + 1}`,
  );
  if (rows.length > ACTIVE_CACHE_MAX_ROWS) {
    throw new Error(
      `El plantel excede el límite temporal de ${ACTIVE_CACHE_MAX_ROWS} alumnos para cachear Control Escolar.`,
    );
  }
  return rows;
};

const fetchLocalEvidenceRows = async () => {
  const [documentosExists, referenciasExists] = await Promise.all([
    localTableExists("documentos"),
    localTableExists("referenciasdepago"),
  ]);
  const evidence = new Map<
    string,
    { paid: Set<string>; charged: Set<string>; all: Set<string> }
  >();

  const ensure = (matricula: unknown, ciclo: unknown) => {
    const m = normalizeText(matricula, 64);
    const c = normalizeCicloKey(String(ciclo || ""));
    if (!m || !c) return null;
    const key = `${m}\u0000${c}`;
    const current = evidence.get(key) || {
      paid: new Set<string>(),
      charged: new Set<string>(),
      all: new Set<string>(),
    };
    evidence.set(key, current);
    return { entry: current, matricula: m, ciclo: c, key };
  };

  if (referenciasExists) {
    const rows = await query<
      Array<{ matricula: string; ciclo: string; conceptIds: string }>
    >(`
      SELECT
        R.matricula,
        R.ciclo,
        GROUP_CONCAT(DISTINCT CAST(COALESCE(P.concepto_id, D.concepto, R.concepto) AS CHAR) SEPARATOR '|') AS conceptIds
      FROM referenciasdepago R
      LEFT JOIN documentos D ON D.documento = R.documento
      LEFT JOIN documento_concepto_periodos P
        ON P.documento = R.documento
        AND P.estatus = 'Activo'
        AND CAST(R.mes AS UNSIGNED) >= P.start_mes
        AND (P.end_mes IS NULL OR CAST(R.mes AS UNSIGNED) <= P.end_mes)
      WHERE R.estatus = 'Vigente'
        AND R.matricula IS NOT NULL
        AND R.ciclo IS NOT NULL
      GROUP BY R.matricula, R.ciclo
    `).catch(() => []);
    rows.forEach((row) => {
      const target = ensure(row.matricula, row.ciclo);
      if (!target) return;
      parseEnrollmentConceptIds(row.conceptIds).forEach((id) => {
        target.entry.paid.add(id);
        target.entry.all.add(id);
      });
    });
  }

  if (documentosExists) {
    const rows = await query<
      Array<{ matricula: string; ciclo: string; conceptIds: string }>
    >(`
      SELECT
        D.matricula,
        D.ciclo,
        GROUP_CONCAT(DISTINCT CAST(COALESCE(P.concepto_id, D.concepto) AS CHAR) SEPARATOR '|') AS conceptIds
      FROM documentos D
      LEFT JOIN documento_concepto_periodos P
        ON P.documento = D.documento
        AND P.estatus = 'Activo'
      WHERE D.estatus = 'Activo'
        AND (P.accion IS NULL OR P.accion <> 'cancelacion')
        AND D.matricula IS NOT NULL
        AND D.ciclo IS NOT NULL
      GROUP BY D.matricula, D.ciclo
    `).catch(() => []);
    rows.forEach((row) => {
      const target = ensure(row.matricula, row.ciclo);
      if (!target) return;
      parseEnrollmentConceptIds(row.conceptIds).forEach((id) => {
        target.entry.charged.add(id);
        target.entry.all.add(id);
      });
    });
  }

  return Array.from(evidence.entries()).map(([key, value]) => {
    const [matricula, ciclo] = key.split("\u0000");
    return {
      matricula,
      ciclo,
      paidConceptIds: Array.from(value.paid).join("|"),
      chargedConceptIds: Array.from(value.charged).join("|"),
      allConceptIds: Array.from(value.all).join("|"),
    };
  });
};

const normalizeLoadedBaseRow = (agentId: string, row: any) => {
  const plantel = normalizePlantel(agentId);
  const matricula = normalizeText(row?.matricula || row?.studentId, 64);
  const apellidoPaterno = normalizeText(
    row?.baseApellidoPaterno || row?.apellidoPaterno,
    120,
  );
  const apellidoMaterno = normalizeText(
    row?.baseApellidoMaterno || row?.apellidoMaterno,
    120,
  );
  const nombres = normalizeText(row?.baseNombres || row?.nombres, 160);
  const nombreCompleto =
    normalizeText(row?.baseNombreCompleto || row?.nombreCompleto || row?.fullName, 260) ||
    [apellidoPaterno, apellidoMaterno, nombres].filter(Boolean).join(" ");
  const basePlantel = normalizePlantel(
    row?.plantelBaseOriginal || row?.basePlantel || row?.plantel || plantel,
  );
  const rawBaseGrado = normalizeText(
    row?.rawBaseGrado || row?.gradoBase || row?.baseGrado || row?.grado,
    80,
  );
  const rawBaseNivel = normalizeText(
    row?.rawBaseNivel || row?.nivelBase || row?.baseNivel || row?.nivel,
    80,
  );

  return {
    ...row,
    agentId: plantel,
    matricula,
    studentId: normalizeText(row?.studentId || matricula, 64),
    basePlantel,
    plantelBaseOriginal: basePlantel,
    baseNombres: nombres,
    baseApellidoPaterno: apellidoPaterno,
    baseApellidoMaterno: apellidoMaterno,
    baseNombreCompleto: nombreCompleto,
    baseCurp: normalizeText(row?.baseCurp || row?.curp, 40),
    baseCorreo: normalizeText(row?.baseCorreo || row?.correo || row?.email, 180),
    baseTelefono: normalizeText(row?.baseTelefono || row?.telefono || row?.phone, 80),
    baseGrado: normalizeText(row?.baseGrado || rawBaseGrado, 80),
    rawBaseGrado,
    baseGrupo: normalizeText(row?.baseGrupo || row?.grupo || row?.group, 80),
    baseNivel: normalizeText(row?.baseNivel || rawBaseNivel, 80),
    rawBaseNivel,
    baseInterno: row?.baseInterno ?? row?.interno ?? null,
    baseEstatus: normalizeText(row?.baseEstatus || row?.estatus || row?.status || "Activo", 80),
    baseGuardian: normalizeText(row?.baseGuardian || row?.padre || row?.guardian, 220),
    baseDireccion: normalizeText(row?.baseDireccion || row?.direccion, 260),
    baseDomicilio: normalizeText(row?.baseDomicilio || row?.domicilio, 260),
    baseUpdatedAt: row?.baseUpdatedAt || row?.updatedAt || row?.updated_at || null,
    baseCiclo: normalizeCicloKey(row?.baseCiclo || row?.cicloBase || row?.ciclo || ""),
  };
};

const normalizeEvidenceRowsFromLoadedRows = (
  rows: any[],
  options: { cicloKey?: string; previousCiclo?: string } = {},
) => {
  const evidence = new Map<
    string,
    { paid: Set<string>; charged: Set<string>; all: Set<string> }
  >();
  const cicloKey = normalizeCicloKey(options.cicloKey || "2025");
  const previousCiclo = normalizeCicloKey(
    options.previousCiclo || previousCicloKey(cicloKey),
  );
  const ensure = (matricula: unknown, ciclo: unknown) => {
    const m = normalizeText(matricula, 64);
    const c = normalizeCicloKey(String(ciclo || ""));
    if (!m || !c) return null;
    const key = `${m}\u0000${c}`;
    const current = evidence.get(key) || {
      paid: new Set<string>(),
      charged: new Set<string>(),
      all: new Set<string>(),
    };
    evidence.set(key, current);
    return current;
  };

  rows.forEach((row) => {
    const matricula = row?.matricula || row?.studentId;
    const current = ensure(matricula, cicloKey);
    if (current) {
      parseEnrollmentConceptIds([row?.conceptoIdsPagados, row?.currentPaidConceptIds]).forEach((id) => {
        current.paid.add(id);
        current.all.add(id);
      });
      parseEnrollmentConceptIds([row?.conceptoIdsCargados, row?.currentChargedConceptIds]).forEach((id) => {
        current.charged.add(id);
        current.all.add(id);
      });
      parseEnrollmentConceptIds([
        row?.conceptoIdsCicloActual,
        row?.conceptoIdsHistoricos,
        row?.conceptoIdsTodos,
      ]).forEach((id) => current.all.add(id));
    }

    const previous = ensure(matricula, previousCiclo);
    if (previous) {
      parseEnrollmentConceptIds([row?.conceptoIdsPagadosPrevios, row?.previousPaidConceptIds]).forEach((id) => {
        previous.paid.add(id);
        previous.all.add(id);
      });
      parseEnrollmentConceptIds([row?.conceptoIdsCargadosPrevios, row?.previousChargedConceptIds]).forEach((id) => {
        previous.charged.add(id);
        previous.all.add(id);
      });
      parseEnrollmentConceptIds(row?.conceptoIdsCicloPrevio).forEach((id) =>
        previous.all.add(id),
      );
    }
  });

  return Array.from(evidence.entries()).map(([key, value]) => {
    const [matricula, ciclo] = key.split("\u0000");
    return {
      matricula,
      ciclo,
      paidConceptIds: Array.from(value.paid).join("|"),
      chargedConceptIds: Array.from(value.charged).join("|"),
      allConceptIds: Array.from(value.all).join("|"),
    };
  });
};

const insertStageBaseRows = async (
  sourceId: string,
  plantel: string,
  refreshToken: string,
  rows: any[],
) => {
  let updated = 0;
  for (let index = 0; index < rows.length; index += CENTRAL_CACHE_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + CENTRAL_CACHE_CHUNK_SIZE);
    const values: any[] = [];
    const placeholders = chunk
      .map((row) => {
        const payload = normalizeLoadedBaseRow(plantel, row);
        const matricula = normalizeText(payload.matricula, 64);
        if (!matricula) return "";
        const rowHash = computeHash(payload);
        values.push(
          sourceId,
          refreshToken,
          matricula,
          normalizePlantel(payload.basePlantel || plantel),
          JSON.stringify(payload),
          rowHash,
        );
        return `(?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
      })
      .filter(Boolean)
      .join(",");
    if (!placeholders) continue;
    await controlEscolarCentralQuery(
      `INSERT INTO control_base_cache_stage (source_id, refresh_token, matricula, plantel, base_payload, row_hash, staged_at)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         plantel = VALUES(plantel),
         base_payload = VALUES(base_payload),
         row_hash = VALUES(row_hash),
         staged_at = CURRENT_TIMESTAMP`,
      values,
    );
    updated += chunk.length;
  }
  return updated;
};

const insertStageEvidenceRows = async (
  sourceId: string,
  refreshToken: string,
  rows: any[],
) => {
  let updated = 0;
  for (let index = 0; index < rows.length; index += CENTRAL_CACHE_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + CENTRAL_CACHE_CHUNK_SIZE);
    const values: any[] = [];
    const placeholders = chunk
      .map((row) => {
        const matricula = normalizeText(row.matricula, 64);
        const ciclo = normalizeCicloKey(row.ciclo);
        if (!matricula || !ciclo) return "";
        values.push(
          sourceId,
          refreshToken,
          matricula,
          ciclo,
          idsToPipe(row.paidConceptIds),
          idsToPipe(row.chargedConceptIds),
          idsToPipe(row.allConceptIds),
        );
        return `(?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
      })
      .filter(Boolean)
      .join(",");
    if (!placeholders) continue;
    await controlEscolarCentralQuery(
      `INSERT INTO control_enrollment_evidence_cache_stage
         (source_id, refresh_token, matricula, ciclo, paid_concept_ids, charged_concept_ids, all_concept_ids, staged_at)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         paid_concept_ids = VALUES(paid_concept_ids),
         charged_concept_ids = VALUES(charged_concept_ids),
         all_concept_ids = VALUES(all_concept_ids),
         staged_at = CURRENT_TIMESTAMP`,
      values,
    );
    updated += chunk.length;
  }
  return updated;
};

const acquireRefreshLock = async (
  sourceId: string,
  refreshToken: string,
  minAgeMinutes: number,
) => {
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
       )
       AND (
         cache_refreshed_at IS NULL
         OR cache_refreshed_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? MINUTE)
         OR cache_expires_at IS NULL
         OR cache_expires_at < CURRENT_TIMESTAMP
       )`,
    [refreshToken, sourceId, minAgeMinutes],
  );
  return Number(result?.affectedRows || 0) > 0;
};

const promoteStageToActive = async (
  sourceId: string,
  refreshToken: string,
  rowCount: number,
  evidenceRowCount: number,
  minAgeMinutes: number,
) => {
  const db = getControlEscolarCentralDb();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(`DELETE FROM control_enrollment_evidence_cache WHERE source_id = ?`, [sourceId]);
    await connection.query(`DELETE FROM control_base_cache WHERE source_id = ?`, [sourceId]);
    await connection.query(
      `INSERT INTO control_base_cache (source_id, matricula, plantel, base_payload, row_hash, refreshed_at)
       SELECT source_id, matricula, plantel, base_payload, row_hash, CURRENT_TIMESTAMP
       FROM control_base_cache_stage
       WHERE source_id = ? AND refresh_token = ?`,
      [sourceId, refreshToken],
    );
    await connection.query(
      `INSERT INTO control_enrollment_evidence_cache
         (source_id, matricula, ciclo, paid_concept_ids, charged_concept_ids, all_concept_ids, refreshed_at)
       SELECT source_id, matricula, ciclo, paid_concept_ids, charged_concept_ids, all_concept_ids, CURRENT_TIMESTAMP
       FROM control_enrollment_evidence_cache_stage
       WHERE source_id = ? AND refresh_token = ?`,
      [sourceId, refreshToken],
    );
    await connection.query(
      `DELETE FROM control_base_cache_stage WHERE source_id = ?`,
      [sourceId],
    );
    await connection.query(
      `DELETE FROM control_enrollment_evidence_cache_stage WHERE source_id = ?`,
      [sourceId],
    );
    await connection.query(
      `UPDATE control_base_sources
       SET refresh_status = 'idle',
           refresh_token = NULL,
           refresh_finished_at = CURRENT_TIMESTAMP,
           cache_refreshed_at = CURRENT_TIMESTAMP,
           cache_expires_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE),
           cache_row_count = ?,
           evidence_row_count = ?,
           last_error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE source_id = ?`,
      [minAgeMinutes, rowCount, evidenceRowCount, sourceId],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const cleanupStageRows = async (sourceId: string, refreshToken?: string) => {
  const tokenClause = refreshToken ? " OR refresh_token = ?" : "";
  const params = refreshToken ? [sourceId, refreshToken] : [sourceId];
  await controlEscolarCentralQuery(
    `DELETE FROM control_base_cache_stage
     WHERE source_id = ?${tokenClause}
        OR staged_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${STAGE_MAX_AGE_HOURS} HOUR)`,
    params,
  ).catch(() => null);
  await controlEscolarCentralQuery(
    `DELETE FROM control_enrollment_evidence_cache_stage
     WHERE source_id = ?${tokenClause}
        OR staged_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${STAGE_MAX_AGE_HOURS} HOUR)`,
    params,
  ).catch(() => null);
};

const completeLockedControlEscolarCacheRefresh = async (
  sourceId: string,
  plantel: string,
  refreshToken: string,
  rows: any[],
  options: {
    triggerName?: string;
    minAgeMinutes?: number;
    cicloKey?: string;
    previousCiclo?: string;
  } = {},
) => {
  const minAgeMinutes = Math.max(
    1,
    Number(options.minAgeMinutes || AUTO_REFRESH_MIN_AGE_MINUTES) ||
      AUTO_REFRESH_MIN_AGE_MINUTES,
  );
  await cleanupStageRows(sourceId);
  const evidenceRows = normalizeEvidenceRowsFromLoadedRows(rows, {
    cicloKey: options.cicloKey,
    previousCiclo: options.previousCiclo,
  });
  const stagedRows = await insertStageBaseRows(sourceId, plantel, refreshToken, rows);
  const stagedEvidenceRows = await insertStageEvidenceRows(sourceId, refreshToken, evidenceRows);
  await promoteStageToActive(
    sourceId,
    refreshToken,
    stagedRows,
    stagedEvidenceRows,
    minAgeMinutes,
  );
  return {
    success: true,
    sourceId,
    plantel,
    totalRows: rows.length,
    updatedRows: stagedRows,
    evidenceRows: stagedEvidenceRows,
    triggerName: normalizeText(options.triggerName || "auto-plantel-load", 80),
  };
};

export const maybeRefreshControlEscolarCacheFromLoadedRows = async (
  agentId: string,
  rows: any[],
  options: {
    triggerName?: string;
    minAgeMinutes?: number;
    cicloKey?: string;
    previousCiclo?: string;
  } = {},
) => {
  const plantel = normalizePlantel(agentId);
  if (!plantel || plantel === "GLOBAL") {
    return { success: true, skipped: true, reason: "invalid_plantel" };
  }
  if (!Array.isArray(rows) || !rows.length) {
    return { success: true, skipped: true, reason: "empty_rows", plantel };
  }
  if (rows.length > ACTIVE_CACHE_MAX_ROWS) {
    throw new Error(
      `El plantel excede el límite temporal de ${ACTIVE_CACHE_MAX_ROWS} alumnos para cachear Control Escolar.`,
    );
  }

  await ensureControlEscolarCacheSchema();
  const sourceId = await ensureControlBaseSource(plantel);
  const minAgeMinutes = Math.max(
    1,
    Number(options.minAgeMinutes || AUTO_REFRESH_MIN_AGE_MINUTES) ||
      AUTO_REFRESH_MIN_AGE_MINUTES,
  );
  const refreshToken = randomRefreshToken();
  const lockAcquired = await acquireRefreshLock(sourceId, refreshToken, minAgeMinutes);
  if (!lockAcquired) {
    const cache = await readControlCacheSourceMeta(plantel).catch(() => null);
    return {
      success: true,
      skipped: true,
      reason: cache?.refreshStatus === "running" ? "refresh_already_running" : "cache_recent",
      sourceId,
      plantel,
      cache,
    };
  }

  try {
    return await completeLockedControlEscolarCacheRefresh(
      sourceId,
      plantel,
      refreshToken,
      rows,
      options,
    );
  } catch (error: any) {
    const message = String(
      error?.message || error || "No se pudo actualizar el cache central.",
    ).slice(0, 800);
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

export const maybePublishControlEscolarSnapshotFromBridge = async (
  agentId: string,
  options: { triggerName?: string; minAgeMinutes?: number } = {},
) => {
  const plantel = normalizePlantel(agentId);
  assertBridgeAgentSelectable(plantel);
  await ensureControlEscolarCacheSchema();
  const sourceId = await ensureControlBaseSource(plantel);
  const minAgeMinutes = Math.max(
    1,
    Number(options.minAgeMinutes || AUTO_REFRESH_MIN_AGE_MINUTES) ||
      AUTO_REFRESH_MIN_AGE_MINUTES,
  );
  const refreshToken = randomRefreshToken();
  const lockAcquired = await acquireRefreshLock(sourceId, refreshToken, minAgeMinutes);
  if (!lockAcquired) {
    const cache = await readControlCacheSourceMeta(plantel).catch(() => null);
    return {
      success: true,
      skipped: true,
      reason: cache?.refreshStatus === "running" ? "refresh_already_running" : "cache_recent",
      sourceId,
      plantel,
      cache,
    };
  }

  try {
    return await runWithBridgeAgentId(plantel, async () => {
      const rows = await fetchLocalSnapshotBaseRows(plantel);
      const evidenceRows = await fetchLocalEvidenceRows();
      const mergedRows = rows.map((row) => {
        const matricula = normalizeText(row.matricula, 64);
        const currentEvidence = evidenceRows.filter((e) => e.matricula === matricula);
        return {
          ...row,
          conceptoIdsHistoricos: mergePipeIds(
            ...currentEvidence.map((e) => e.allConceptIds),
          ),
        };
      });
      return await completeLockedControlEscolarCacheRefresh(
        sourceId,
        plantel,
        refreshToken,
        mergedRows,
        {
          ...options,
          triggerName: options.triggerName || "auto-bridge-live-read",
          minAgeMinutes,
        },
      );
    });
  } catch (error: any) {
    const message = String(
      error?.message || error || "No se pudo actualizar el cache central desde bridge.",
    ).slice(0, 800);
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

export const publishControlEscolarSnapshotFromBridge = maybePublishControlEscolarSnapshotFromBridge;
