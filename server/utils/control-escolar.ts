import { getBridgeAgentId, query, runWithBridgeAgentId } from "./db";
import {
  getTrustedAuthUser,
  normalizePlantel,
  type AuthSessionUser,
} from "./auth-session";
import { PLANTELES_LIST } from "../../utils/constants";
import { normalizeCicloKey } from "../../shared/utils/ciclo";
import {
  calculatePromotedGrado,
  displayGrado,
  normalizeNivelEscolar,
  plantelCandidatesForProjectedScope,
} from "../../shared/utils/grado";
import {
  previousCicloKey,
  resolveTipoIngreso,
} from "../../shared/utils/tipoIngreso";
import {
  getHistoricalEnrollmentConceptEvidence,
  parseEnrollmentConceptIds,
} from "./enrollment-evidence";
import { controlEscolarCentralQuery } from "./control-escolar-central";
import {
  fetchVerifiedControlEscolarScopeRows,
  maybeRefreshVerifiedControlEscolarScopeCache,
} from "./control-escolar-cache";
import { inferMexicanCurpIdentity, resolveControlEscolarCompleteness } from "../../shared/utils/studentPresentation";
import { buildParentSiblingSignature } from "../../shared/utils/parentSiblingMatch";
import { isControlEscolarNameField, toNameDisplayCase } from "../../shared/utils/nameCase";
import { writeControlEscolarExternalStudentView } from "./control-escolar-external-view";

export type ControlEscolarStudentRow = {
  agentId: string;
  plantel: string;
  basePlantel: string;
  studentId: string;
  matricula: string;
  fullName: string;
  nombreCompleto: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  curp: string;
  phone: string;
  email: string;
  status: string;
  statusSource: string;
  baja: number | null;
  motivoBaja: string;
  categoriaBaja: string;
  seguimientoBaja: string;
  program: string;
  nivel: string;
  grado: string;
  group: string;
  guardianName: string;
  fatherName: string;
  motherName: string;
  nombrePadre: string;
  apellidoPaternoPadre: string;
  apellidoMaternoPadre: string;
  nombreMadre: string;
  apellidoPaternoMadre: string;
  apellidoMaternoMadre: string;
  telefonoPadre: string;
  telefonoMadre: string;
  emailPadre: string;
  emailMadre: string;
  interno: string;
  servicio: string;
  address: string;
  photoUrl: string;
  overlayExists: boolean;
  missingFields: string[];
  updatedAt: string | null;
  cicloBase: string;
  plantelBaseOriginal: string;
  enrollmentState: string;
  currentEnrollmentConceptMatch: boolean;
  inscritoCicloActual: boolean;
  tipoIngreso: string;
  tipoIngresoValue: string;
  huskyPassUsername: string;
  huskyPassPlaintext: string;
  huskyPassAvailable: boolean;
  huskyPassEmail: string;
  parentSiblingSignature?: {
    fatherName: string;
    motherName: string;
    normalizedFatherName: string;
    normalizedMotherName: string;
    key: string;
    complete: boolean;
  };
};

type TableColumn = {
  Field: string;
  Type?: string;
  Null?: string;
  Key?: string;
  Default?: any;
  Extra?: string;
};

type MatriculaPatch = Record<string, any>;

type ControlEscolarSchema = {
  base: Set<string>;
  matricula: Set<string>;
  users: Set<string>;
  ingresos: boolean;
  loadedAt: number;
  centralAvailable: boolean;
  centralError: string;
  usersAvailable: boolean;
  usersError: string;
};

const PLANTEL_SET = new Set(PLANTELES_LIST.map(normalizePlantel));
const schemaCache = new Map<string, ControlEscolarSchema>();
const centralSchemaCache = new Map<
  string,
  { columns: Set<string>; loadedAt: number }
>();
const SCHEMA_CACHE_MS = 1000 * 60 * 5;
const MAX_LOCAL_ROWS = 25000;
const CENTRAL_CHUNK_SIZE = 600;

const stringifyScalar = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  if (Array.isArray(value)) return value.map(stringifyScalar).filter(Boolean).join(" / ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["label", "nombre", "name", "value", "servicio", "descripcion", "description", "text", "title"]) {
      const text = stringifyScalar(record[key]).trim();
      if (text) return text;
    }
    return "";
  }
  return "";
};
const normalizeKey = (value: unknown) => stringifyScalar(value).trim();
const normalizeText = (value: unknown, max = 255) =>
  normalizeKey(value).slice(0, max);
const normalizeNameText = (value: unknown, max = 255) =>
  toNameDisplayCase(normalizeText(value, max)).slice(0, max);
const normalizeUpper = (value: unknown, max = 255) =>
  normalizeText(value, max).toUpperCase();
const normalizeEmail = (value: unknown) =>
  normalizeText(value, 255).toLowerCase();
const normalizePhone = (value: unknown) =>
  normalizeText(value, 40)
    .replace(/[^0-9+()\-\s.]/g, "")
    .slice(0, 40);
const normalizeNullable = (value: unknown, max = 255) => {
  const text = normalizeText(value, max);
  return text || null;
};

const sqlLiteral = (value: string) => `'${String(value).replace(/'/g, "''")}'`;
const safeAlias = (value: string) => value.replace(/[^A-Za-z0-9_]/g, "");
const col = (alias: string, column: string) =>
  `${alias}.\`${column.replace(/`/g, "``")}\``;
const has = (columns: Set<string>, column: string) => columns.has(column);
const expr = (
  columns: Set<string>,
  alias: string,
  column: string,
  fallback = "NULL",
) => (has(columns, column) ? col(alias, column) : fallback);
const selectAs = (sql: string, alias: string) =>
  `${sql} AS ${safeAlias(alias)}`;
const nullIfTrim = (sql: string) => `NULLIF(TRIM(CAST(${sql} AS CHAR)), '')`;
const coalesceExpr = (...parts: Array<string | false | null | undefined>) => {
  const clean = parts.filter(Boolean) as string[];
  return clean.length ? `COALESCE(${clean.join(", ")})` : "NULL";
};
const escapeColumn = (column: string) => `\`${column.replace(/`/g, "``")}\``;

const getConfiguredBridgeAgentId = () => {
  const config = useRuntimeConfig() as any;
  return String(config.dbBridgeAgentId || "").trim();
};

const getTransport = () => {
  const config = useRuntimeConfig() as any;
  return String(config.dbTransport || "direct").toLowerCase();
};

export const assertControlEscolarDynamicBridge = (agentId: string) => {
  const configuredAgentId = getConfiguredBridgeAgentId();
  const requestedAgentId = normalizePlantel(agentId);
  if (
    getTransport() === "bridge" &&
    configuredAgentId &&
    normalizePlantel(configuredAgentId) !== requestedAgentId
  ) {
    const activeBridgeAgentId = normalizePlantel(getBridgeAgentId());
    if (activeBridgeAgentId === requestedAgentId) return;
    throw createError({
      statusCode: 409,
      statusMessage: "DB_BRIDGE_AGENT_FIXED",
      message:
        `El bridge de base está fijado en ${normalizePlantel(configuredAgentId)} y no permitió consultar ${requestedAgentId}.`,
      data: {
        code: "DB_BRIDGE_AGENT_FIXED",
        configuredAgentId: normalizePlantel(configuredAgentId),
        requestedAgentId,
        activeBridgeAgentId,
        action: "Aurora debe ejecutar la lectura con contexto dinámico de plantel o quitar DB_BRIDGE_AGENT_ID fijo para consultas multi-plantel.",
      },
    });
  }
};

const assertControlEscolarAccess = (
  user: Awaited<ReturnType<typeof getTrustedAuthUser>>,
) => {
  if (!user.isSuperAdmin && !user.hasControlEscolarRole) {
    throw createError({
      statusCode: 403,
      message: "No tiene los permisos necesarios.",
    });
  }
};

export const resolveControlEscolarAuth = async (
  event: any,
  requestedAgentId?: unknown,
) => {
  const user = await getTrustedAuthUser(event);
  assertControlEscolarAccess(user);

  const requested = normalizePlantel(requestedAgentId);
  const active = normalizePlantel(user.active_plantel);
  const allowedPlanteles = user.isSuperAdmin
    ? [...PLANTELES_LIST]
    : user.plantelesList.map(normalizePlantel);
  const agentId = requested || active;

  if (!agentId || agentId === "GLOBAL" || !PLANTEL_SET.has(agentId)) {
    throw createError({
      statusCode: 400,
      message:
        "Selecciona un plantel específico en el selector lateral para usar Control Escolar.",
    });
  }

  if (!allowedPlanteles.includes(agentId)) {
    throw createError({
      statusCode: 403,
      message: "El plantel solicitado no está dentro del alcance del usuario.",
    });
  }

  return { user, agentId };
};

export const listControlEscolarPlanteles = async (event: any) => {
  const user = await getTrustedAuthUser(event);
  assertControlEscolarAccess(user);

  const allowedPlanteles = user.isSuperAdmin
    ? [...PLANTELES_LIST]
    : user.plantelesList;

  const activePlantel = normalizePlantel(user.active_plantel);
  const selectedPlantel =
    activePlantel &&
    activePlantel !== "GLOBAL" &&
    allowedPlanteles.includes(activePlantel)
      ? activePlantel
      : "";

  return {
    user,
    activePlantel: selectedPlantel,
    planteles: allowedPlanteles.map((plantel) => ({
      agentId: plantel,
      plantel,
      label: plantel,
      selected: selectedPlantel === plantel,
    })),
  };
};

const localTableExists = async (tableName: string) => {
  const rows = await query<any[]>(`SHOW TABLES LIKE ?`, [tableName]);
  return rows.length > 0;
};

const localColumns = async (tableName: string) => {
  const rows = await query<TableColumn[]>(
    `SHOW COLUMNS FROM ${escapeColumn(tableName)}`,
  );
  return new Set(rows.map((row) => row.Field));
};

const getCentralMatriculaColumns = async () => {
  const cached = centralSchemaCache.get("matricula");
  if (cached && Date.now() - cached.loadedAt < SCHEMA_CACHE_MS)
    return cached.columns;

  const tableRows = await controlEscolarCentralQuery<any[]>(
    `SHOW TABLES LIKE 'matricula'`,
  );
  if (!tableRows.length) {
    throw createError({
      statusCode: 500,
      message:
        "La tabla matricula no existe en la base MySQL centralizada de Control Escolar.",
    });
  }

  const rows = await controlEscolarCentralQuery<TableColumn[]>(
    `SHOW COLUMNS FROM \`matricula\``,
  );
  const columns = new Set(rows.map((row) => row.Field));
  if (!columns.has("matricula")) {
    throw createError({
      statusCode: 500,
      message:
        "La tabla centralizada matricula no tiene columna matricula para unir contra base.",
    });
  }

  centralSchemaCache.set("matricula", { columns, loadedAt: Date.now() });
  return columns;
};

const getCentralOptionalTableColumns = async (tableName: string) => {
  const normalized = normalizeText(tableName, 80);
  if (!normalized) return new Set<string>();

  const cached = centralSchemaCache.get(normalized);
  if (cached && Date.now() - cached.loadedAt < SCHEMA_CACHE_MS)
    return cached.columns;

  const tableRows = await controlEscolarCentralQuery<any[]>(
    `SHOW TABLES LIKE ${sqlLiteral(normalized)}`,
  );
  if (!tableRows.length) return new Set<string>();

  const rows = await controlEscolarCentralQuery<TableColumn[]>(
    `SHOW COLUMNS FROM ${escapeColumn(normalized)}`,
  );
  const columns = new Set(rows.map((row) => row.Field));
  centralSchemaCache.set(normalized, { columns, loadedAt: Date.now() });
  return columns;
};

type ControlEscolarSchemaOptions = {
  requireCentral?: boolean;
  skipCentral?: boolean;
};

const toErrorMessage = (error: any) =>
  error?.data?.message ||
  error?.statusMessage ||
  error?.message ||
  "No se pudo consultar la base centralizada de Control Escolar.";

export const getControlEscolarSchema = async (
  agentId: string,
  options: ControlEscolarSchemaOptions = {},
): Promise<ControlEscolarSchema> => {
  const requireCentral = options.requireCentral !== false;
  const skipCentral = options.skipCentral === true;
  const cacheKey = `${normalizePlantel(agentId)}:${skipCentral ? "local" : "full"}`;
  const cached = schemaCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < SCHEMA_CACHE_MS) {
    if (requireCentral && !cached.centralAvailable) {
      schemaCache.delete(cacheKey);
    } else {
      return cached;
    }
  }

  const baseExists = await localTableExists("base");
  if (!baseExists) {
    throw createError({
      statusCode: 500,
      message: "La tabla base no existe en el plantel seleccionado.",
    });
  }

  const [baseColumns, ingresosExists] = await Promise.all([
    localColumns("base"),
    localTableExists("ingresos"),
  ]);

  if (!baseColumns.has("matricula")) {
    throw createError({
      statusCode: 500,
      message: "La tabla base no tiene columna matricula.",
    });
  }

  let matriculaColumns = new Set<string>();
  let usersColumns = new Set<string>();
  let centralAvailable = true;
  let centralError = "";
  let usersAvailable = false;
  let usersError = "";

  if (skipCentral) {
    centralAvailable = false;
    centralError = "";
  } else {
    try {
      matriculaColumns = await getCentralMatriculaColumns();
    } catch (error: any) {
      centralAvailable = false;
      centralError = toErrorMessage(error);
      if (requireCentral) throw error;
    }

    if (centralAvailable) {
      try {
        usersColumns = await getCentralOptionalTableColumns("users");
        usersAvailable =
          usersColumns.has("username") && usersColumns.has("plaintext");
      } catch (error: any) {
        usersAvailable = false;
        usersError = toErrorMessage(error);
      }
    }
  }

  const schema = {
    base: baseColumns,
    matricula: matriculaColumns,
    users: usersColumns,
    ingresos: ingresosExists,
    loadedAt: Date.now(),
    centralAvailable,
    centralError,
    usersAvailable,
    usersError,
  };
  schemaCache.set(cacheKey, schema);
  return schema;
};

const getControlEscolarCentralOnlySchema = async (
  agentId: string,
  options: { requireCentral?: boolean } = {},
): Promise<ControlEscolarSchema> => {
  const requireCentral = options.requireCentral !== false;
  const cacheKey = `${normalizePlantel(agentId)}:central-only`;
  const cached = schemaCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < SCHEMA_CACHE_MS) {
    if (requireCentral && !cached.centralAvailable)
      schemaCache.delete(cacheKey);
    else return cached;
  }

  let matriculaColumns = new Set<string>();
  let usersColumns = new Set<string>();
  let centralAvailable = true;
  let centralError = "";
  let usersAvailable = false;
  let usersError = "";

  try {
    matriculaColumns = await getCentralMatriculaColumns();
  } catch (error: any) {
    centralAvailable = false;
    centralError = toErrorMessage(error);
    if (requireCentral) throw error;
  }

  if (centralAvailable) {
    try {
      usersColumns = await getCentralOptionalTableColumns("users");
      usersAvailable =
        usersColumns.has("username") && usersColumns.has("plaintext");
    } catch (error: any) {
      usersAvailable = false;
      usersError = toErrorMessage(error);
    }
  }

  const schema = {
    base: new Set<string>(),
    matricula: matriculaColumns,
    users: usersColumns,
    ingresos: false,
    loadedAt: Date.now(),
    centralAvailable,
    centralError,
    usersAvailable,
    usersError,
  };
  schemaCache.set(cacheKey, schema);
  return schema;
};

const buildLocalBaseSelect = (agentId: string, baseColumns: Set<string>) => {
  const baseNombreCompleto = has(baseColumns, "nombreCompleto")
    ? nullIfTrim(col("b", "nombreCompleto"))
    : `NULLIF(TRIM(CONCAT_WS(' ', ${expr(baseColumns, "b", "apellidoPaterno")}, ${expr(baseColumns, "b", "apellidoMaterno")}, ${expr(baseColumns, "b", "nombres")})), '')`;
  const updatedAt = coalesceExpr(
    expr(baseColumns, "b", "updated_at"),
    expr(baseColumns, "b", "updatedAt"),
    expr(baseColumns, "b", "fecha_actualizacion"),
  );

  return [
    selectAs(sqlLiteral(agentId), "agentId"),
    selectAs(col("b", "matricula"), "matricula"),
    selectAs(col("b", "matricula"), "studentId"),
    selectAs(
      coalesceExpr(
        nullIfTrim(expr(baseColumns, "b", "plantel")),
        sqlLiteral(agentId),
      ),
      "basePlantel",
    ),
    selectAs(expr(baseColumns, "b", "nombres"), "baseNombres"),
    selectAs(expr(baseColumns, "b", "apellidoPaterno"), "baseApellidoPaterno"),
    selectAs(expr(baseColumns, "b", "apellidoMaterno"), "baseApellidoMaterno"),
    selectAs(baseNombreCompleto, "baseNombreCompleto"),
    selectAs(expr(baseColumns, "b", "curp"), "baseCurp"),
    selectAs(expr(baseColumns, "b", "correo"), "baseCorreo"),
    selectAs(expr(baseColumns, "b", "telefono"), "baseTelefono"),
    selectAs(expr(baseColumns, "b", "grado"), "baseGrado"),
    selectAs(expr(baseColumns, "b", "grupo"), "baseGrupo"),
    selectAs(expr(baseColumns, "b", "nivel"), "baseNivel"),
    selectAs(expr(baseColumns, "b", "interno"), "baseInterno"),
    selectAs(
      expr(baseColumns, "b", "estatus", sqlLiteral("Activo")),
      "baseEstatus",
    ),
    selectAs(
      expr(baseColumns, "b", "Nombre del padre o tutor"),
      "baseGuardian",
    ),
    selectAs(expr(baseColumns, "b", "direccion"), "baseDireccion"),
    selectAs(expr(baseColumns, "b", "domicilio"), "baseDomicilio"),
    selectAs(updatedAt, "baseUpdatedAt"),
  ];
};

type ControlEscolarOperatorScope = {
  cicloKey: string;
  previousCiclo: string;
  enrollmentConceptIds: string[];
  tipoIngresoConceptIds: string[];
};

const resolveOperatorScope = (
  filters: any = {},
): ControlEscolarOperatorScope => {
  const cicloKey = normalizeCicloKey(
    filters.ciclo || filters.cicloKey || filters.targetCiclo || "2025",
  );
  return {
    cicloKey,
    previousCiclo: previousCicloKey(cicloKey),
    enrollmentConceptIds: parseEnrollmentConceptIds(
      filters.concepts || filters.enrollmentConcepts || "",
    ),
    tipoIngresoConceptIds: parseEnrollmentConceptIds(
      filters.tipoConcepts || filters.tipoIngresoConcepts || "",
    ),
  };
};

const addCurrentEnrollmentScope = (
  whereParts: string[],
  params: any[],
  schema: ControlEscolarSchema,
  scope: ControlEscolarOperatorScope,
) => {
  const estatusExpr = expr(schema.base, "b", "estatus", sqlLiteral("Activo"));
  const cicloExpr = expr(schema.base, "b", "ciclo", "NULL");

  if (!scope.enrollmentConceptIds.length) {
    whereParts.push(`(${estatusExpr} = 'Activo' OR ${cicloExpr} = ?)`);
    params.push(scope.cicloKey);
    return;
  }

  const conceptPlaceholders = scope.enrollmentConceptIds
    .map(() => "?")
    .join(",");
  whereParts.push(`(
    ${estatusExpr} = 'Activo'
    OR ${cicloExpr} = ?
    OR EXISTS (
      SELECT 1
      FROM documentos DScope
      LEFT JOIN documento_concepto_periodos PScope
        ON PScope.documento = DScope.documento
        AND PScope.estatus = 'Activo'
      WHERE DScope.matricula = b.matricula
        AND DScope.ciclo = ?
        AND DScope.estatus = 'Activo'
        AND (PScope.accion IS NULL OR PScope.accion <> 'cancelacion')
        AND CAST(COALESCE(PScope.concepto_id, DScope.concepto) AS CHAR) IN (${conceptPlaceholders})
      LIMIT 1
    )
    OR EXISTS (
      SELECT 1
      FROM referenciasdepago RScope
      LEFT JOIN documentos DScopePaid ON DScopePaid.documento = RScope.documento
      LEFT JOIN documento_concepto_periodos PScopePaid
        ON PScopePaid.documento = RScope.documento
        AND PScopePaid.estatus = 'Activo'
        AND CAST(RScope.mes AS UNSIGNED) >= PScopePaid.start_mes
        AND (PScopePaid.end_mes IS NULL OR CAST(RScope.mes AS UNSIGNED) <= PScopePaid.end_mes)
      WHERE RScope.matricula = b.matricula
        AND RScope.ciclo = ?
        AND RScope.estatus = 'Vigente'
        AND CAST(COALESCE(PScopePaid.concepto_id, DScopePaid.concepto, RScope.concepto) AS CHAR) IN (${conceptPlaceholders})
      LIMIT 1
    )
  )`);
  params.push(
    scope.cicloKey,
    scope.cicloKey,
    ...scope.enrollmentConceptIds,
    scope.cicloKey,
    ...scope.enrollmentConceptIds,
  );
};

const rowHasCurrentEnrollmentEvidence = (
  row: any,
  enrollmentConceptIds: string[],
) => {
  const target = new Set(enrollmentConceptIds);
  if (!target.size) return false;
  return parseEnrollmentConceptIds([
    row.conceptoIdsPagados,
    row.conceptoIdsCargados,
    row.conceptoIdsCicloActual,
  ]).some((conceptId) => target.has(conceptId));
};

const resolveOperatorEnrollmentState = (
  row: any,
  scope: ControlEscolarOperatorScope,
  historicalConceptIds = "",
) => {
  const activeInBase = firstText(row.baseEstatus, "Activo") === "Activo";
  if (!scope.enrollmentConceptIds.length)
    return activeInBase ? "inscrito" : "baja";

  const hasCurrent = rowHasCurrentEnrollmentEvidence(
    row,
    scope.enrollmentConceptIds,
  );
  if (activeInBase && hasCurrent) return "inscrito";
  if (!activeInBase && hasCurrent) return "baja_inscrita";
  if (activeInBase) return "no_inscrito";
  return "baja";
};

const applyOperatorProjection = async (
  agentId: string,
  rows: any[],
  scope: ControlEscolarOperatorScope,
  options: { searchActive?: boolean } = {},
) => {
  const missingHistoricalFromRows = rows.some(
    (row) => typeof row.conceptoIdsHistoricos !== "string",
  );
  const historicalEnrollmentEvidence = missingHistoricalFromRows
    ? await getHistoricalEnrollmentConceptEvidence(
        rows.map((row) => row.matricula),
        scope.tipoIngresoConceptIds.length
          ? scope.tipoIngresoConceptIds
          : scope.enrollmentConceptIds,
      )
    : new Map<string, string>();

  return rows.flatMap((row) => {
    const sourcePlantel = firstText(row.plantelBase, row.basePlantel, agentId);
    const promoted = calculatePromotedGrado(
      row.baseGrado,
      sourcePlantel,
      row.baseCiclo,
      scope.cicloKey,
      row.baseNivel,
    );
    const hasCurrentEnrollmentEvidence = rowHasCurrentEnrollmentEvidence(
      row,
      scope.enrollmentConceptIds,
    );
    const baseCiclo = normalizeText(row.baseCiclo)
      ? normalizeCicloKey(row.baseCiclo)
      : "";
    const includedByOperatorScope =
      firstText(row.baseEstatus, "Activo") === "Activo" ||
      baseCiclo === scope.cicloKey ||
      hasCurrentEnrollmentEvidence;

    if (!options.searchActive && !includedByOperatorScope) return [];
    if (promoted.outOfScope && !hasCurrentEnrollmentEvidence) return [];

    const projectedPlantel =
      promoted.outOfScope && hasCurrentEnrollmentEvidence
        ? normalizePlantel(agentId)
        : normalizePlantel(promoted.plantel);

    if (
      !hasCurrentEnrollmentEvidence &&
      projectedPlantel !== normalizePlantel(agentId)
    )
      return [];

    const historicalConceptIds =
      typeof row.conceptoIdsHistoricos === "string"
        ? row.conceptoIdsHistoricos
        : historicalEnrollmentEvidence.get(
            String(row.matricula || "").trim(),
          ) || "";
    const tipoIngreso = resolveTipoIngreso(
      {
        ...row,
        plantel: sourcePlantel,
        plantelBase: sourcePlantel,
        cicloBase: row.baseCiclo,
        ciclo: row.baseCiclo,
        tipoIngresoEvidence: {
          targetCiclo: scope.cicloKey,
          previousCiclo: scope.previousCiclo,
          targetConceptIds: [
            row.conceptoIdsPagados,
            row.conceptoIdsCargados,
            row.conceptoIdsCicloActual,
          ],
          previousConceptIds: [
            row.conceptoIdsPagadosPrevios,
            row.conceptoIdsCargadosPrevios,
            row.conceptoIdsCicloPrevio,
          ],
          allConceptIds: [historicalConceptIds],
        },
      },
      scope.cicloKey,
      {
        enrollmentConcepts: scope.tipoIngresoConceptIds.length
          ? scope.tipoIngresoConceptIds
          : scope.enrollmentConceptIds,
      },
    );

    return [
      {
        ...row,
        plantelBaseOriginal: sourcePlantel,
        plantelBase: sourcePlantel,
        basePlantel: projectedPlantel || sourcePlantel,
        baseGrado: displayGrado(promoted.grado),
        baseNivel: promoted.nivel,
        conceptoIdsHistoricos: historicalConceptIds,
        currentEnrollmentConceptMatch: hasCurrentEnrollmentEvidence,
        inscritoCicloActual: hasCurrentEnrollmentEvidence,
        operatorEnrollmentState: resolveOperatorEnrollmentState(
          row,
          scope,
          historicalConceptIds,
        ),
        operatorTipoIngreso: tipoIngreso.value,
        operatorTipoIngresoSource: tipoIngreso.source,
      },
    ];
  });
};

type CycleConceptEvidence = {
  paid: Map<string, string>;
  charged: Map<string, string>;
};

const EVIDENCE_CHUNK_SIZE = 450;

const appendConceptIds = (
  target: Map<string, Set<string>>,
  matricula: unknown,
  rawConceptIds: unknown,
) => {
  const normalizedMatricula = normalizeText(matricula, 64);
  if (!normalizedMatricula) return;

  const conceptIds = parseEnrollmentConceptIds(rawConceptIds);
  if (!conceptIds.length) return;

  const current = target.get(normalizedMatricula) || new Set<string>();
  conceptIds.forEach((conceptId) => current.add(conceptId));
  target.set(normalizedMatricula, current);
};

const toPipeMap = (source: Map<string, Set<string>>) => {
  const result = new Map<string, string>();
  source.forEach((ids, matricula) =>
    result.set(matricula, Array.from(ids).join("|")),
  );
  return result;
};

const joinPipeIds = (...values: unknown[]) => {
  return parseEnrollmentConceptIds(values).join("|");
};

const fetchCycleConceptEvidence = async (
  matriculas: unknown[],
  cicloKey: string,
  enrollmentConceptIds: string[],
): Promise<CycleConceptEvidence> => {
  const uniqueMatriculas = Array.from(
    new Set(
      matriculas
        .map((matricula) => normalizeText(matricula, 64))
        .filter(Boolean),
    ),
  );
  const conceptIds = parseEnrollmentConceptIds(enrollmentConceptIds);
  const paid = new Map<string, Set<string>>();
  const charged = new Map<string, Set<string>>();

  if (!uniqueMatriculas.length || !conceptIds.length) {
    return { paid: new Map(), charged: new Map() };
  }

  for (
    let index = 0;
    index < uniqueMatriculas.length;
    index += EVIDENCE_CHUNK_SIZE
  ) {
    const chunk = uniqueMatriculas.slice(index, index + EVIDENCE_CHUNK_SIZE);
    const matriculaPlaceholders = chunk.map(() => "?").join(",");
    const conceptPlaceholders = conceptIds.map(() => "?").join(",");

    const paymentRows = await query<
      Array<{ matricula: string; conceptIds: string }>
    >(
      `
      SELECT
        R.matricula,
        GROUP_CONCAT(DISTINCT CAST(COALESCE(P.concepto_id, D.concepto, R.concepto) AS CHAR) SEPARATOR '|') AS conceptIds
      FROM referenciasdepago R
      LEFT JOIN documentos D ON D.documento = R.documento
      LEFT JOIN documento_concepto_periodos P
        ON P.documento = R.documento
        AND P.estatus = 'Activo'
        AND CAST(R.mes AS UNSIGNED) >= P.start_mes
        AND (P.end_mes IS NULL OR CAST(R.mes AS UNSIGNED) <= P.end_mes)
      WHERE R.ciclo = ?
        AND R.estatus = 'Vigente'
        AND R.matricula IN (${matriculaPlaceholders})
        AND CAST(COALESCE(P.concepto_id, D.concepto, R.concepto) AS CHAR) IN (${conceptPlaceholders})
      GROUP BY R.matricula
    `,
      [cicloKey, ...chunk, ...conceptIds],
    );

    paymentRows.forEach((row) =>
      appendConceptIds(paid, row.matricula, row.conceptIds),
    );

    const documentRows = await query<
      Array<{ matricula: string; conceptIds: string }>
    >(
      `
      SELECT
        D.matricula,
        GROUP_CONCAT(DISTINCT CAST(COALESCE(P.concepto_id, D.concepto) AS CHAR) SEPARATOR '|') AS conceptIds
      FROM documentos D
      LEFT JOIN documento_concepto_periodos P
        ON P.documento = D.documento
        AND P.estatus = 'Activo'
      WHERE D.ciclo = ?
        AND D.estatus = 'Activo'
        AND (P.accion IS NULL OR P.accion <> 'cancelacion')
        AND D.matricula IN (${matriculaPlaceholders})
        AND CAST(COALESCE(P.concepto_id, D.concepto) AS CHAR) IN (${conceptPlaceholders})
      GROUP BY D.matricula
    `,
      [cicloKey, ...chunk, ...conceptIds],
    );

    documentRows.forEach((row) =>
      appendConceptIds(charged, row.matricula, row.conceptIds),
    );
  }

  return { paid: toPipeMap(paid), charged: toPipeMap(charged) };
};

const fetchLocalBaseRows = async (
  agentId: string,
  schema: ControlEscolarSchema,
  filters: any = {},
) => {
  const scope = resolveOperatorScope(filters);
  const fields = buildLocalBaseSelect(agentId, schema.base);
  fields.push(selectAs(expr(schema.base, "b", "ciclo", "NULL"), "baseCiclo"));

  const params: any[] = [];
  const whereParts = ["1=1"];
  const plantelCandidates = plantelCandidatesForProjectedScope(agentId);
  if (plantelCandidates.length && schema.base.has("plantel")) {
    whereParts.push(
      `${col("b", "plantel")} IN (${plantelCandidates.map(() => "?").join(",")})`,
    );
    params.push(...plantelCandidates);
  }

  const search = normalizeText(filters.search || filters.q || "", 80);
  if (search) {
    const baseNameSearch = schema.base.has("nombreCompleto")
      ? col("b", "nombreCompleto")
      : `CONCAT_WS(' ', ${expr(schema.base, "b", "apellidoPaterno")}, ${expr(schema.base, "b", "apellidoMaterno")}, ${expr(schema.base, "b", "nombres")})`;
    const like = `%${search}%`;
    const searchParts = [
      `${baseNameSearch} LIKE ?`,
      `${col("b", "matricula")} LIKE ?`,
    ];
    params.push(like, like);
    ["curp", "correo", "telefono"].forEach((column) => {
      if (!schema.base.has(column)) return;
      searchParts.push(`${col("b", column)} LIKE ?`);
      params.push(like);
    });

    whereParts.push(`(${searchParts.join(" OR ")})`);
  }

  const rows = await query<any[]>(
    `
    SELECT ${fields.join(",\n      ")}
    FROM base b
    WHERE ${whereParts.join(" AND ")}
    ORDER BY baseEstatus = 'Activo' DESC, baseNombreCompleto ASC, b.matricula ASC
    LIMIT ${MAX_LOCAL_ROWS + 1}
  `,
    params,
  );

  if (rows.length > MAX_LOCAL_ROWS) {
    throw createError({
      statusCode: 413,
      message: `El plantel excede el límite temporal de ${MAX_LOCAL_ROWS} alumnos en base para Control Escolar. Usa búsqueda por nombre o matrícula.`,
    });
  }

  const [currentEvidence, previousEvidence] = await Promise.all([
    fetchCycleConceptEvidence(
      rows.map((row) => row.matricula),
      scope.cicloKey,
      scope.enrollmentConceptIds,
    ),
    fetchCycleConceptEvidence(
      rows.map((row) => row.matricula),
      scope.previousCiclo,
      scope.tipoIngresoConceptIds.length
        ? scope.tipoIngresoConceptIds
        : scope.enrollmentConceptIds,
    ),
  ]);

  const rowsWithEvidence = rows.map((row) => {
    const matricula = normalizeText(row.matricula, 64);
    const conceptoIdsPagados = currentEvidence.paid.get(matricula) || "";
    const conceptoIdsCargados = currentEvidence.charged.get(matricula) || "";
    const conceptoIdsPagadosPrevios =
      previousEvidence.paid.get(matricula) || "";
    const conceptoIdsCargadosPrevios =
      previousEvidence.charged.get(matricula) || "";

    return {
      ...row,
      conceptoIdsPagados,
      conceptoIdsCargados,
      conceptoIdsPagadosPrevios,
      conceptoIdsCargadosPrevios,
      conceptoIdsCicloActual: joinPipeIds(
        conceptoIdsPagados,
        conceptoIdsCargados,
      ),
      conceptoIdsCicloPrevio: joinPipeIds(
        conceptoIdsPagadosPrevios,
        conceptoIdsCargadosPrevios,
      ),
    };
  });

  return await applyOperatorProjection(agentId, rowsWithEvidence, scope, {
    searchActive: Boolean(search),
  });
};

const centralSelectColumns = (schema: ControlEscolarSchema) => {
  const wanted = [
    "matricula",
    "updated_at",
    "last_grade",
    "last_ciclo",
    "curp",
    "nombre_verificado",
    "apellido_paterno",
    "apellido_materno",
    "nombres",
    "grado",
    "grupo",
    "foto",
    "fecha_nacimiento",
    "nombre_padre",
    "apellido_paterno_padre",
    "apellido_materno_padre",
    "lugar_trabajo_padre",
    "puesto_padre",
    "email_padre",
    "correo_padre",
    "telefono_padre",
    "celular_padre",
    "nombre_madre",
    "apellido_paterno_madre",
    "apellido_materno_madre",
    "lugar_trabajo_madre",
    "puesto_madre",
    "email_madre",
    "correo_madre",
    "telefono_madre",
    "celular_madre",
    "verified",
    "nivel",
    "ciclo",
    "nombre_completo_alumno",
    "lugar_nacimiento",
      "talla",
    "peso",
    "tipo_sangre",
    "alergias",
    "certificado_medico_adjunto",
    "certificado_vacunacion_covid19_adjunto",
    "acta_nacimiento_adjunta",
    "curp_alumno_adjunto",
    "certificado_primaria_adjunto",
    "boleta_sexto_primaria_adjunta",
    "boleta_primero_secundaria_adjunta",
    "boleta_segundo_secundaria_adjunta",
    "estado_civil_padre",
    "fecha_nacimiento_padre",
    "ine_padre",
    "curp_padre",
    "estado_civil_madre",
    "fecha_nacimiento_madre",
    "ine_madre",
    "curp_madre",
    "domicilio_calle",
    "domicio_num",
    "domicilio_colonia",
    "domicilio_cp",
    "domicilio_municipio",
    "servicio",
    "eventual",
    "interno",
    "baja",
    "motivo_baja",
    "categoria_baja",
    "seguimiento_baja",
    "servicio_notas",
    "plantel",
    "nombre_padre_completo",
    "padre",
    "tutor",
    "padre_tutor",
    "ocupacion_padre",
    "ocupacion_tutor",
    "nombre_madre_completo",
    "madre",
    "ocupacion_madre",
    "direccion",
    "domicilio",
    "calle",
    "updatedAt",
    "fecha_actualizacion",
    "created_at",
  ];

  return wanted.filter((column) => schema.matricula.has(column));
};

const canonicalMatriculaKey = (value: unknown) => normalizeUpper(value, 64);

const fetchMatriculaOverlayMap = async (
  matriculas: string[],
  schema: ControlEscolarSchema,
) => {
  const unique = Array.from(
    new Set(
      matriculas
        .map((matricula) => canonicalMatriculaKey(matricula))
        .filter(Boolean),
    ),
  );
  const result = new Map<string, any>();
  if (!unique.length) return result;

  if (!schema.centralAvailable || !schema.matricula.has("matricula"))
    return result;

  const columns = centralSelectColumns(schema);
  if (!columns.includes("matricula")) columns.unshift("matricula");
  const selectSql = columns.map(escapeColumn).join(", ");

  for (let index = 0; index < unique.length; index += CENTRAL_CHUNK_SIZE) {
    const chunk = unique.slice(index, index + CENTRAL_CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = await controlEscolarCentralQuery<any[]>(
      `SELECT ${selectSql} FROM \`matricula\` WHERE UPPER(TRIM(\`matricula\`)) IN (${placeholders})`,
      chunk,
    );
    rows.forEach((row) => result.set(canonicalMatriculaKey(row.matricula), row));
  }

  return result;
};

const fetchHuskyPassMap = async (
  matriculas: string[],
  schema: ControlEscolarSchema,
) => {
  const unique = Array.from(
    new Set(
      matriculas
        .map((matricula) => canonicalMatriculaKey(matricula))
        .filter(Boolean),
    ),
  );
  const result = new Map<string, any>();
  if (!unique.length || !schema.usersAvailable) return result;

  const optionalColumns = ["email", "correo", "updated_at", "updatedAt"].filter(
    (column) => schema.users.has(column),
  );
  const selectColumns = ["username", "plaintext", ...optionalColumns];
  const selectSql = selectColumns.map(escapeColumn).join(", ");

  for (let index = 0; index < unique.length; index += CENTRAL_CHUNK_SIZE) {
    const chunk = unique.slice(index, index + CENTRAL_CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = await controlEscolarCentralQuery<any[]>(
      `SELECT ${selectSql} FROM \`users\` WHERE UPPER(TRIM(\`username\`)) IN (${placeholders})`,
      chunk,
    );
    rows.forEach((row) => result.set(canonicalMatriculaKey(row.username), row));
  }

  return result;
};

const fetchHuskyPassRow = async (
  matricula: string,
  schema: ControlEscolarSchema,
) => {
  if (!schema.usersAvailable) return null;
  const optionalColumns = ["email", "correo", "updated_at", "updatedAt"].filter(
    (column) => schema.users.has(column),
  );
  const selectColumns = ["username", "plaintext", ...optionalColumns];
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT ${selectColumns.map(escapeColumn).join(", ")} FROM \`users\` WHERE UPPER(TRIM(\`username\`)) = ? LIMIT 1`,
    [canonicalMatriculaKey(matricula)],
  );
  return rows[0] || null;
};

const truthyBaja = (value: unknown) => {
  const normalized = normalizeText(value).toLowerCase();
  return (
    value === true ||
    value === 1 ||
    ["1", "si", "sí", "true", "baja"].includes(normalized)
  );
};

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
};

const firstLower = (...values: unknown[]) => firstText(...values).toLowerCase();
const firstUpper = (...values: unknown[]) => firstText(...values).toUpperCase();
const normalizeEmailCandidate = (value: unknown) => firstLower(value).replace(/\s+/g, '');
const isUsableFamilyEmail = (value: unknown) => {
  const email = normalizeEmailCandidate(value);
  if (!email) return false;
  if (email.includes('@casita')) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};
const firstUsableEmail = (...values: unknown[]) => {
  for (const value of values) {
    const email = normalizeEmailCandidate(value);
    if (email && isUsableFamilyEmail(email)) return email;
  }
  return '';
};
const firstDisplayEmail = (...values: unknown[]) => {
  for (const value of values) {
    const email = normalizeEmailCandidate(value);
    if (email) return email;
  }
  return '';
};

const resolvePhotoUrl = (value: unknown) => {
  const raw = normalizeKey(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;

  const config = useRuntimeConfig() as any;
  const baseUrl = String(
    config.studentPhotoBaseUrl || "https://matricula.casitaapps.com",
  )
    .trim()
    .replace(/\/+$/, "");
  const normalized = raw.replace(/\\/g, "/").replace(/^\.\//, "");
  const path = normalized.startsWith("/")
    ? normalized
    : normalized.includes("/")
      ? `/${normalized}`
      : `/uploads/${normalized}`;
  return `${baseUrl}${path}`;
};

const normalizedPhoneDigits = (value: unknown) => normalizeText(value).replace(/\D/g, "");
const hasValidPhoneContact = (value: unknown) => normalizedPhoneDigits(value).length >= 10;
const hasPhoneContact = (student: any) =>
  Boolean(
    hasValidPhoneContact(student.phone) ||
    hasValidPhoneContact(student.telefono) ||
    hasValidPhoneContact(student.telefonoPadre) ||
    hasValidPhoneContact(student.telefonoMadre),
  );
const hasEmailContact = (student: any) =>
  Boolean(
    isUsableFamilyEmail(student.email) ||
    isUsableFamilyEmail(student.emailPadre) ||
    isUsableFamilyEmail(student.emailMadre),
  );
const fatherFullName = (student: any) =>
  firstText(
    student.fatherName,
    [student.nombrePadre, student.apellidoPaternoPadre, student.apellidoMaternoPadre]
      .map(normalizeText)
      .filter(Boolean)
      .join(' '),
    student.nombrePadreCompleto,
  );
const motherFullName = (student: any) =>
  firstText(
    student.motherName,
    [student.nombreMadre, student.apellidoPaternoMadre, student.apellidoMaternoMadre]
      .map(normalizeText)
      .filter(Boolean)
      .join(' '),
    student.nombreMadreCompleto,
  );
const hasFatherComplete = (student: any) =>
  Boolean(
    fatherFullName(student) &&
    hasValidPhoneContact(firstText(student.telefonoPadre, student.phone, student.telefono)) &&
    isUsableFamilyEmail(firstText(student.emailPadre, student.email)),
  );
const hasMotherComplete = (student: any) =>
  Boolean(
    motherFullName(student) &&
    hasValidPhoneContact(student.telefonoMadre) &&
    isUsableFamilyEmail(student.emailMadre),
  );
const hasTutorContact = (student: any) =>
  Boolean(hasFatherComplete(student) || hasMotherComplete(student));

const buildMissingFields = (row: any) => {
  const missing: string[] = [];
  if (!normalizeKey(row.curp)) missing.push("curp");
  if (!hasFatherComplete(row)) missing.push("padre");
  if (!hasMotherComplete(row)) missing.push("madre");
  return missing;
};

const hasNoPrimaryContact = (student: any) => {
  return (
    !hasPhoneContact(student) &&
    !hasEmailContact(student) &&
    !hasTutorContact(student)
  );
};

const isInscritoForControlProgress = (student: any) =>
  normalizeText(student?.enrollmentState || "").toLowerCase() === "inscrito";

const overlayStudentRow = (
  agentId: string,
  base: any,
  overlay?: any,
  huskyPass?: any,
): ControlEscolarStudentRow => {
  const hasOverlay = Boolean(overlay?.matricula);
  const nombres = normalizeNameText(firstText(overlay?.nombres, base.baseNombres));
  const apellidoPaterno = normalizeNameText(firstText(
    overlay?.apellido_paterno,
    base.baseApellidoPaterno,
  ));
  const apellidoMaterno = normalizeNameText(firstText(
    overlay?.apellido_materno,
    base.baseApellidoMaterno,
  ));
  const fullName = normalizeNameText(firstText(
    [apellidoPaterno, apellidoMaterno, nombres].filter(Boolean).join(" "),
    base.baseNombreCompleto,
  ));
  const fatherName = normalizeNameText(firstText(
    [
      overlay?.nombre_padre,
      overlay?.apellido_paterno_padre,
      overlay?.apellido_materno_padre,
    ]
      .map(normalizeNameText)
      .filter(Boolean)
      .join(" "),
    overlay?.nombre_padre_completo,
    overlay?.padre,
    overlay?.tutor,
    overlay?.padre_tutor,
  ));
  const motherName = normalizeNameText(firstText(
    [
      overlay?.nombre_madre,
      overlay?.apellido_paterno_madre,
      overlay?.apellido_materno_madre,
    ]
      .map(normalizeNameText)
      .filter(Boolean)
      .join(" "),
    overlay?.nombre_madre_completo,
    overlay?.madre,
  ));
  const updatedAt = firstText(
    overlay?.updated_at,
    overlay?.updatedAt,
    overlay?.fecha_actualizacion,
    overlay?.created_at,
    base.baseUpdatedAt,
  );
  const baja = hasOverlay && truthyBaja(overlay?.baja) ? 1 : 0;
  const status = baja ? "Baja" : firstText(base.baseEstatus, "Activo");
  const huskyPassUsername = normalizeText(huskyPass?.username, 64);
  const huskyPassPlaintext = normalizeText(huskyPass?.plaintext, 255);
  const huskyPassEmail = firstLower(huskyPass?.email, huskyPass?.correo);
  const parentSiblingSignature = hasOverlay ? buildParentSiblingSignature(overlay) : buildParentSiblingSignature({});

  const normalized: ControlEscolarStudentRow = {
    agentId: normalizePlantel(agentId),
    plantel: firstText(base.basePlantel, overlay?.plantel, agentId),
    basePlantel: firstText(base.basePlantel, agentId),
    studentId: normalizeText(base.studentId || base.matricula),
    matricula: normalizeText(base.matricula),
    fullName,
    nombreCompleto: fullName,
    nombres,
    apellidoPaterno,
    apellidoMaterno,
    curp: firstUpper(overlay?.curp, base.baseCurp).slice(0, 18),
    phone: firstText(overlay?.telefono_padre, overlay?.celular_padre, base.baseTelefono),
    email: firstDisplayEmail(overlay?.email_padre, overlay?.correo_padre, base.baseCorreo),
    status,
    statusSource: hasOverlay ? "matricula" : "base",
    baja,
    motivoBaja: normalizeText(overlay?.motivo_baja, 500),
    categoriaBaja: normalizeText(overlay?.categoria_baja),
    seguimientoBaja: normalizeText(overlay?.seguimiento_baja, 500),
    program: firstText(overlay?.servicio, base.baseNivel, overlay?.nivel),
    nivel: firstLower(base.baseNivel, overlay?.nivel),
    grado: firstLower(base.baseGrado, overlay?.grado),
    group: firstText(base.baseGrupo, overlay?.grupo),
    guardianName: normalizeNameText(firstText(fatherName, motherName, base.baseGuardian)),
    fatherName,
    motherName,
    nombrePadre: normalizeNameText(firstText(overlay?.nombre_padre, overlay?.nombre_padre_completo, overlay?.padre, overlay?.tutor, overlay?.padre_tutor)),
    apellidoPaternoPadre: normalizeNameText(overlay?.apellido_paterno_padre),
    apellidoMaternoPadre: normalizeNameText(overlay?.apellido_materno_padre),
    nombreMadre: normalizeNameText(firstText(overlay?.nombre_madre, overlay?.nombre_madre_completo, overlay?.madre)),
    apellidoPaternoMadre: normalizeNameText(overlay?.apellido_paterno_madre),
    apellidoMaternoMadre: normalizeNameText(overlay?.apellido_materno_madre),
    telefonoPadre: firstText(overlay?.telefono_padre, overlay?.celular_padre, base.baseTelefono),
    telefonoMadre: firstText(overlay?.telefono_madre, overlay?.celular_madre),
    emailPadre: firstDisplayEmail(overlay?.email_padre, overlay?.correo_padre, base.baseCorreo),
    emailMadre: firstDisplayEmail(overlay?.email_madre, overlay?.correo_madre),
    interno: firstText(overlay?.interno, base.baseInterno),
    servicio: normalizeText(overlay?.servicio),
    address: firstText(
      overlay?.direccion,
      overlay?.domicilio,
      overlay?.calle,
      base.baseDireccion,
      base.baseDomicilio,
    ),
    photoUrl: resolvePhotoUrl(overlay?.foto),
    overlayExists: hasOverlay,
    missingFields: [],
    updatedAt: updatedAt
      ? new Date(updatedAt).toISOString?.() || String(updatedAt)
      : null,
    cicloBase: normalizeText(base.baseCiclo),
    plantelBaseOriginal: normalizeText(
      base.plantelBaseOriginal || base.basePlantel,
    ),
    enrollmentState: normalizeText(base.operatorEnrollmentState || "inscrito"),
    currentEnrollmentConceptMatch: Boolean(base.currentEnrollmentConceptMatch),
    inscritoCicloActual: Boolean(base.inscritoCicloActual),
    tipoIngresoValue:
      normalizeText(base.operatorTipoIngreso || "").toLowerCase() === "interno"
        ? "interno"
        : "externo",
    tipoIngreso:
      normalizeText(base.operatorTipoIngreso || "").toLowerCase() === "interno"
        ? "Interno"
        : "Externo",
    huskyPassUsername,
    huskyPassPlaintext,
    huskyPassAvailable: Boolean(huskyPassUsername && huskyPassPlaintext),
    huskyPassEmail,
  };

  const derivedCurpIdentity = inferMexicanCurpIdentity(normalized.curp);

  Object.assign(normalized as any, {
    matriculaPlantel: normalizeText(overlay?.plantel),
    matriculaNivel: normalizeText(overlay?.nivel),
    matriculaGrado: normalizeText(overlay?.grado),
    matriculaGrupo: normalizeText(overlay?.grupo),
    academicPlacementSource: "base-projection",
    lastGrade: normalizeText(overlay?.last_grade),
    lastCiclo: normalizeText(overlay?.last_ciclo),
    nombreVerificado: normalizeNameText(overlay?.nombre_verificado),
    fechaNacimiento: derivedCurpIdentity.fechaNacimiento || normalizeText(overlay?.fecha_nacimiento),
    nombreCompletoAlumno: normalizeNameText(overlay?.nombre_completo_alumno),
    lugarNacimiento: normalizeText(overlay?.lugar_nacimiento),
    sexo: normalizeText(overlay?.sexo),
    talla: normalizeText(overlay?.talla),
    peso: normalizeText(overlay?.peso),
    tipoSangre: normalizeText(overlay?.tipo_sangre),
    alergias: normalizeText(overlay?.alergias),
    foto: normalizeText(overlay?.foto),
    direccion: firstText(overlay?.direccion, overlay?.domicilio, overlay?.calle),
    certificadoMedicoAdjunto: normalizeText(overlay?.certificado_medico_adjunto),
    certificadoVacunacionCovid19Adjunto: normalizeText(overlay?.certificado_vacunacion_covid19_adjunto),
    actaNacimientoAdjunta: normalizeText(overlay?.acta_nacimiento_adjunta),
    curpAlumnoAdjunto: normalizeText(overlay?.curp_alumno_adjunto),
    certificadoPrimariaAdjunto: normalizeText(overlay?.certificado_primaria_adjunto),
    boletaSextoPrimariaAdjunta: normalizeText(overlay?.boleta_sexto_primaria_adjunta),
    boletaPrimeroSecundariaAdjunta: normalizeText(overlay?.boleta_primero_secundaria_adjunta),
    boletaSegundoSecundariaAdjunta: normalizeText(overlay?.boleta_segundo_secundaria_adjunta),
    lugarTrabajoPadre: normalizeText(overlay?.lugar_trabajo_padre),
    puestoPadre: normalizeText(overlay?.puesto_padre),
    estadoCivilPadre: normalizeText(overlay?.estado_civil_padre),
    fechaNacimientoPadre: normalizeText(overlay?.fecha_nacimiento_padre),
    inePadre: normalizeText(overlay?.ine_padre),
    curpPadre: normalizeText(overlay?.curp_padre),
    lugarTrabajoMadre: normalizeText(overlay?.lugar_trabajo_madre),
    puestoMadre: normalizeText(overlay?.puesto_madre),
    estadoCivilMadre: normalizeText(overlay?.estado_civil_madre),
    fechaNacimientoMadre: normalizeText(overlay?.fecha_nacimiento_madre),
    ineMadre: normalizeText(overlay?.ine_madre),
    curpMadre: normalizeText(overlay?.curp_madre),
    domicilioCalle: normalizeText(overlay?.domicilio_calle),
    domicilioNumero: normalizeText(overlay?.domicilio_num || overlay?.domicio_num),
    domicilioNum: normalizeText(overlay?.domicilio_num || overlay?.domicio_num),
    domicioNum: normalizeText(overlay?.domicio_num || overlay?.domicilio_num),
    domicilioColonia: normalizeText(overlay?.domicilio_colonia),
    domicilioCp: normalizeText(overlay?.domicilio_cp),
    domicilioMunicipio: normalizeText(overlay?.domicilio_municipio),
    servicioNotas: normalizeText(overlay?.servicio_notas, 1000),
    parentSiblingSignature,
    eventual: firstText(overlay?.eventual),
    verified: firstText(overlay?.verified),
  });

  const completeness = resolveControlEscolarCompleteness(normalized, { honorEnrollmentState: true });
  normalized.missingFields = completeness.basic.missingFields;
  (normalized as any).missingLabels = completeness.basic.missingLabels;
  (normalized as any).completenessTiers = completeness;
  (normalized as any).completeMissingFields = completeness.complete.missingFields;
  (normalized as any).completeMissingLabels = completeness.complete.missingLabels;
  return normalized;
};

const compactRawRecord = (row: any) => {
  const result: Record<string, any> = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    if (typeof value === "string" && value.trim() === "") return;
    result[key] = value;
  });
  return result;
};

const fetchFullCentralMatriculaRow = async (matricula: string) => {
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT * FROM \`matricula\` WHERE UPPER(TRIM(\`matricula\`)) = ? LIMIT 1`,
    [canonicalMatriculaKey(matricula)],
  );
  return rows[0] || null;
};

export const fetchControlEscolarStudentDetail = async (
  agentId: string,
  matricula: string,
) => {
  const normalizedMatricula = normalizeText(matricula, 64);
  if (!normalizedMatricula) {
    throw createError({ statusCode: 400, message: "Matrícula inválida." });
  }

  // Emergency consistency mode: detail scope must come from the live bridge/base,
  // not from central cache, so Control Escolar matches the plantel bridge data.

  assertControlEscolarDynamicBridge(agentId);
  const schema = await getControlEscolarSchema(agentId, {
    requireCentral: false,
  });
  const fields = buildLocalBaseSelect(agentId, schema.base);
  const [baseRow] = await query<any[]>(
    `
    SELECT ${fields.join(",\n      ")}
    FROM base b
    WHERE b.matricula = ?
    LIMIT 1
  `,
    [normalizedMatricula],
  );

  if (!baseRow) {
    throw createError({
      statusCode: 404,
      message: "Alumno no encontrado en base para el plantel activo.",
    });
  }

  const rawBaseRows = await query<any[]>(
    `SELECT * FROM base WHERE matricula = ? LIMIT 1`,
    [normalizedMatricula],
  );
  let rawMatricula: any = null;
  let huskyPass: any = null;
  if (schema.centralAvailable) {
    try {
      rawMatricula = await fetchFullCentralMatriculaRow(normalizedMatricula);
    } catch (error: any) {
      console.warn(
        "[Control Escolar] centralized matricula detail overlay unavailable",
        {
          agentId,
          matricula: normalizedMatricula,
          error: toErrorMessage(error),
        },
      );
    }

    try {
      huskyPass = await fetchHuskyPassRow(normalizedMatricula, schema);
    } catch (error: any) {
      console.warn("[Control Escolar] husky pass detail lookup unavailable", {
        agentId,
        matricula: normalizedMatricula,
        error: toErrorMessage(error),
      });
    }
  }

  const normalized = overlayStudentRow(
    agentId,
    baseRow,
    rawMatricula,
    huskyPass,
  );
  return {
    ...normalized,
    readOnly: true,
    detailSource: rawMatricula ? "base+matricula" : "base",
    rawBase: compactRawRecord(rawBaseRows[0] || {}),
    rawMatricula: compactRawRecord(rawMatricula || {}),
    rawUsers: compactRawRecord(huskyPass || {}),
  };
};

const compareStudents = (
  a: ControlEscolarStudentRow,
  b: ControlEscolarStudentRow,
) => {
  const statusA = a.status === "Activo" ? 0 : 1;
  const statusB = b.status === "Activo" ? 0 : 1;
  if (statusA !== statusB) return statusA - statusB;
  return `${a.grado}|${a.group}|${a.fullName}|${a.matricula}`.localeCompare(
    `${b.grado}|${b.group}|${b.fullName}|${b.matricula}`,
    "es",
  );
};

type ControlEscolarLoadPhase = "base" | "enriched";

type ControlEscolarLoadedStudents = {
  students: ControlEscolarStudentRow[];
  source: {
    base: string;
    overlay: string;
    overlayAvailable: boolean;
    overlayError: string;
    localRows: number;
    overlayRows: number;
    enrichedRows: number;
    usersRows: number;
    phase: ControlEscolarLoadPhase;
    [key: string]: any;
  };
};

const resolveControlEscolarLoadPhase = (
  filters: any = {},
): ControlEscolarLoadPhase => {
  const phase = normalizeText(
    filters.phase || filters.stage || filters.mode,
    40,
  ).toLowerCase();
  return ["base", "local", "administrator", "admin"].includes(phase)
    ? "base"
    : "enriched";
};

const fetchAllNormalizedStudents = async (
  agentId: string,
  filters: any = {},
): Promise<ControlEscolarLoadedStudents> => {
  const requestStartedAt = Date.now();
  const phase = resolveControlEscolarLoadPhase(filters);
  const localOnly = phase === "base";
  const scope = resolveOperatorScope(filters);
  const search = normalizeText(filters.search || filters.q || "", 80);
  const diagnosticsSteps: any[] = [];

  const markStep = (
    key: string,
    label: string,
    startedAt: number,
    status = "ready",
    details: Record<string, any> = {},
  ) => {
    diagnosticsSteps.push({
      key,
      label,
      status,
      ms: Math.max(0, Date.now() - startedAt),
      ...details,
    });
  };

  const diagnosticsPayload = (flow: string, details: Record<string, any> = {}) => ({
    flow,
    agentId: normalizePlantel(agentId),
    phase,
    totalMs: Math.max(0, Date.now() - requestStartedAt),
    steps: diagnosticsSteps,
    ...details,
  });

  let centralSchema = await getControlEscolarCentralOnlySchema(agentId, {
    requireCentral: false,
  });

  const enrichRows = async (
    baseRows: any[],
    baseSource: string,
    flow: string,
    sourceExtras: Record<string, any> = {},
  ): Promise<ControlEscolarLoadedStudents> => {
    let overlayMap = new Map<string, any>();
    let huskyPassMap = new Map<string, any>();
    let overlayAvailable = centralSchema.centralAvailable;
    let overlayError = centralSchema.centralError;

    if (centralSchema.centralAvailable) {
      const overlayStartedAt = Date.now();
      try {
        overlayMap = await fetchMatriculaOverlayMap(
          baseRows.map((row) => row.matricula),
          centralSchema,
        );
        markStep("matricula-overlay", "Enriquecer con matricula", overlayStartedAt, "ready", {
          rows: overlayMap.size,
        });
      } catch (error: any) {
        overlayAvailable = false;
        overlayError = toErrorMessage(error);
        markStep("matricula-overlay", "Enriquecer con matricula", overlayStartedAt, "failed", {
          error: overlayError,
        });
        console.warn("[Control Escolar] centralized matricula overlay lookup unavailable", {
          agentId,
          localRows: baseRows.length,
          error: overlayError,
        });
      }

      const usersStartedAt = Date.now();
      try {
        huskyPassMap = await fetchHuskyPassMap(
          baseRows.map((row) => row.matricula),
          centralSchema,
        );
        markStep("husky-pass", "Consultar Husky Pass", usersStartedAt, "ready", {
          rows: huskyPassMap.size,
        });
      } catch (error: any) {
        markStep("husky-pass", "Consultar Husky Pass", usersStartedAt, "failed", {
          error: toErrorMessage(error),
        });
        console.warn("[Control Escolar] husky pass lookup unavailable", {
          agentId,
          localRows: baseRows.length,
          error: toErrorMessage(error),
        });
      }
    } else {
      markStep("matricula-overlay", "Enriquecer con matricula", requestStartedAt, "failed", {
        error: centralSchema.centralError || "central_unavailable",
      });
    }

    return {
      students: baseRows
        .map((row) => {
          const matriculaKey = canonicalMatriculaKey(row.matricula);
          return overlayStudentRow(
            agentId,
            row,
            overlayMap.get(matriculaKey),
            huskyPassMap.get(matriculaKey),
          );
        })
        .sort(compareStudents),
      source: {
        base: baseSource,
        overlay: "CONTROL_ESCOLAR_MYSQL.matricula",
        overlayAvailable,
        overlayError: overlayError || "",
        localRows: Math.min(baseRows.length, MAX_LOCAL_ROWS),
        overlayRows: overlayMap.size,
        enrichedRows: overlayMap.size,
        usersRows: huskyPassMap.size,
        phase: "enriched",
        ...sourceExtras,
        diagnostics: diagnosticsPayload(flow, {
          localRows: baseRows.length,
          overlayRows: overlayMap.size,
          usersRows: huskyPassMap.size,
          ...sourceExtras,
        }),
      },
    };
  };

  const readVerifiedCacheFallback = async (bridgeError: any): Promise<ControlEscolarLoadedStudents> => {
    const bridgeErrorMessage = toErrorMessage(bridgeError);
    if (localOnly) throw bridgeError;

    const cacheStartedAt = Date.now();
    try {
      const cached = await fetchVerifiedControlEscolarScopeRows(agentId, scope);
      if (cached.rows.length) {
        markStep("verified-cache", "Leer snapshot verificado por falla del bridge", cacheStartedAt, "ready", {
          rows: cached.rows.length,
          freshness: cached.source.cacheFreshness,
          scopeKey: cached.source.scopeKey,
          validation: cached.source.cacheValidation?.validation_status || "pass",
          bridgeError: bridgeErrorMessage,
        });
        return await enrichRows(
          cached.rows,
          cached.source.base,
          String(cached.source.cacheFreshness || "").includes("stale")
            ? "verified-cache-offline-fallback-stale-enriched"
            : "verified-cache-offline-fallback-enriched",
          {
            ...cached.source,
            cacheRows: cached.rows.length,
            bridgeFallback: true,
            bridgeError: bridgeErrorMessage,
          },
        );
      }
      markStep("verified-cache", "Leer snapshot verificado por falla del bridge", cacheStartedAt, "empty", {
        rows: 0,
        freshness: cached.source.cacheFreshness,
        reason: cached.source.cacheValidation?.reason || cached.source.cacheValidation?.status || "missing",
        scopeKey: cached.source.scopeKey,
        bridgeError: bridgeErrorMessage,
      });
    } catch (cacheError: any) {
      markStep("verified-cache", "Leer snapshot verificado por falla del bridge", cacheStartedAt, "failed", {
        error: toErrorMessage(cacheError),
        bridgeError: bridgeErrorMessage,
      });
      console.warn("[Control Escolar Cache] Offline snapshot fallback failed after bridge error.", {
        agentId,
        bridgeError: bridgeErrorMessage,
        cacheError: toErrorMessage(cacheError),
      });
    }

    throw bridgeError;
  };

  markStep(
    "verified-cache",
    "Snapshot verificado reservado como fallback",
    requestStartedAt,
    "skipped",
    {
      reason: localOnly ? "base_phase_uses_bridge" : "live_bridge_primary_snapshot_only_on_bridge_failure",
    },
  );

  let schema: ControlEscolarSchema | null = null;
  let localRows: any[] = [];

  try {
    assertControlEscolarDynamicBridge(agentId);
    const liveSchemaStartedAt = Date.now();
    schema = await getControlEscolarSchema(agentId, {
      requireCentral: false,
      skipCentral: localOnly,
    });
    centralSchema = localOnly ? schema : centralSchema.centralAvailable ? centralSchema : schema;
    markStep(
      "bridge-schema",
      "Validar bridge/base local",
      liveSchemaStartedAt,
      schema.centralAvailable || localOnly ? "ready" : "partial",
      {
        centralAvailable: schema.centralAvailable,
        error: schema.centralError || "",
      },
    );

    const liveBaseStartedAt = Date.now();
    localRows = await fetchLocalBaseRows(agentId, schema, filters);
    markStep("live-base-selector", "Leer base local por bridge", liveBaseStartedAt, "ready", {
      rows: localRows.length,
    });
  } catch (error: any) {
    markStep("live-base-selector", "Leer base local por bridge", requestStartedAt, "failed", {
      error: toErrorMessage(error),
    });
    console.warn("[Control Escolar] Live bridge read failed; trying verified snapshot fallback.", {
      agentId,
      message: toErrorMessage(error),
    });
    return await readVerifiedCacheFallback(error);
  }

  if (localRows.length > MAX_LOCAL_ROWS) {
    throw createError({
      statusCode: 413,
      message: `El plantel excede el límite temporal de ${MAX_LOCAL_ROWS} alumnos activos para Control Escolar. Ajusta la consulta antes de editar.`,
    });
  }

  if (localOnly) {
    return {
      students: localRows
        .map((row) => overlayStudentRow(agentId, row))
        .sort(compareStudents),
      source: {
        base: `bridge:${normalizePlantel(agentId)}.base`,
        overlay: "CONTROL_ESCOLAR_MYSQL.matricula",
        overlayAvailable: false,
        overlayError: "",
        localRows: Math.min(localRows.length, MAX_LOCAL_ROWS),
        overlayRows: 0,
        enrichedRows: 0,
        usersRows: 0,
        phase: "base",
        cacheFreshness: "live-bridge",
        cacheRefreshedAt: null,
        cacheExpiresAt: null,
        cacheRows: 0,
        cacheRefreshDue: false,
        diagnostics: diagnosticsPayload("live-bridge-base", {
          localRows: localRows.length,
          overlayRows: 0,
          usersRows: 0,
        }),
      },
    };
  }

  const cacheRefreshStartedAt = Date.now();
  if (!search) {
    try {
      const refreshResult = await maybeRefreshVerifiedControlEscolarScopeCache(
        agentId,
        scope,
        localRows,
        { triggerName: "live-bridge-control-escolar-read" },
      );
      markStep("cache-refresh", "Actualizar snapshot desde bridge live", cacheRefreshStartedAt, refreshResult?.skipped ? "skipped" : "ready", {
        rows: localRows.length,
        reason: refreshResult?.reason || "",
        scopeKey: refreshResult?.scopeKey || "",
        counts: refreshResult?.counts || null,
      });
    } catch (error: any) {
      markStep("cache-refresh", "Actualizar snapshot desde bridge live", cacheRefreshStartedAt, "failed", {
        error: toErrorMessage(error),
      });
      console.warn("[Control Escolar Cache] Verified snapshot refresh failed; live bridge result still served.", {
        agentId,
        message: toErrorMessage(error),
      });
    }
  } else {
    markStep("cache-refresh", "Actualizar snapshot desde bridge live", cacheRefreshStartedAt, "skipped", {
      reason: "search_result_not_cacheable",
    });
  }

  return await enrichRows(
    localRows,
    `bridge:${normalizePlantel(agentId)}.base`,
    "live-bridge-enriched",
    {
      cacheFreshness: "live-bridge",
      cacheRefreshedAt: null,
      cacheExpiresAt: null,
      cacheRows: 0,
    },
  );
};

const gradeOrderIndex = (value: unknown) => {
  const normalized = displayGrado(value).toLowerCase();
  const order = [
    "primero",
    "segundo",
    "tercero",
    "cuarto",
    "quinto",
    "sexto",
    "egresado",
  ];
  const index = order.indexOf(normalized);
  return index >= 0 ? index : order.length;
};

const compareAcademicGrade = (left: unknown, right: unknown) => {
  const leftIndex = gradeOrderIndex(left);
  const rightIndex = gradeOrderIndex(right);
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  return String(left || "").localeCompare(String(right || ""), "es");
};

const applyFilters = (students: ControlEscolarStudentRow[], filters: any) => {
  let result = students;

  const search = normalizeText(filters.search || filters.q || "", 80).toLowerCase();
  if (search) {
    result = result.filter((student) => {
      const haystack = [student.matricula, student.fullName, student.nombreCompleto, student.curp]
        .map((value) => normalizeText(value).toLowerCase())
        .join(" ");
      return haystack.includes(search);
    });
  }

  const status = normalizeText(filters.status || "");
  if (status && status !== "all" && status !== "todos") {
    if (status === "activos" || status === "active")
      result = result.filter((student) => student.status === "Activo");
    if (status === "inscritos")
      result = result.filter(
        (student) => student.enrollmentState === "inscrito",
      );
    if (status === "internos")
      result = result.filter(
        (student) =>
          student.enrollmentState === "inscrito" &&
          student.tipoIngresoValue === "interno",
      );
    if (status === "externos")
      result = result.filter(
        (student) =>
          student.enrollmentState === "inscrito" &&
          student.tipoIngresoValue !== "interno",
      );
    if (status === "no_inscritos")
      result = result.filter(
        (student) => student.enrollmentState === "no_inscrito",
      );
    if (status === "bajas" || status === "baja")
      result = result.filter(
        (student) =>
          student.status === "Baja" ||
          student.enrollmentState === "baja_inscrita" ||
          student.enrollmentState === "baja",
      );
    if (status === "sin_ficha" || status === "sin_ficha_matricula")
      result = result.filter((student) => !student.overlayExists);
    if (status === "sin_contacto") result = result.filter(hasNoPrimaryContact);
  }

  const grado = normalizeText(filters.grado || "").toLowerCase();
  if (grado && grado !== "all")
    result = result.filter((student) => student.grado.toLowerCase() === grado);

  const grupo = normalizeText(filters.group || filters.grupo || "");
  if (grupo && grupo !== "all")
    result = result.filter((student) => student.group === grupo);

  const quality = normalizeText(
    filters.quality || filters.calidad || filters.missing || "",
  );
  if (quality && quality !== "all") {
    result = result.filter(isInscritoForControlProgress);
    if (quality === "complete" || quality === "completo")
      result = result.filter((student) => student.missingFields.length === 0);
    if (quality === "incomplete" || quality === "incompleto")
      result = result.filter((student) => student.missingFields.length > 0);
    const hasMissing = (student: any, keys: string[]) =>
      keys.some((key) => student.missingFields.includes(key));
    const fatherKeys = ["padreNombre", "padreApellidoPaterno", "padreTelefono", "padreEmail"];
    const motherKeys = ["madreNombre", "madreApellidoPaterno", "madreTelefono", "madreEmail"];
    if (quality === "curp")
      result = result.filter((student) =>
        student.missingFields.includes("curp"),
      );
    if (quality === "padre" || quality === "father")
      result = result.filter((student) => hasMissing(student, fatherKeys));
    if (quality === "madre" || quality === "mother")
      result = result.filter((student) => hasMissing(student, motherKeys));
    if (quality === "phone" || quality === "telefono" || quality === "teléfono")
      result = result.filter((student) =>
        hasMissing(student, ["padreTelefono", "madreTelefono"]),
      );
    if (quality === "email")
      result = result.filter((student) =>
        hasMissing(student, ["padreEmail", "madreEmail"]),
      );
    if (quality === "guardian" || quality === "tutor")
      result = result.filter((student) => hasMissing(student, [...fatherKeys, ...motherKeys]));
    if (quality === "contact" || quality === "contacto")
      result = result.filter(hasNoPrimaryContact);
    if (
      quality === "overlay" ||
      quality === "sin_ficha" ||
      quality === "sin_ficha_matricula"
    )
      result = result.filter((student) => !student.overlayExists);
  }

  const recent = normalizeText(filters.recent || "");
  if (recent && recent !== "all") {
    const days =
      recent === "7d" ? 7 : recent === "30d" ? 30 : recent === "90d" ? 90 : 0;
    if (days > 0) {
      const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
      result = result.filter(
        (student) =>
          student.updatedAt &&
          new Date(student.updatedAt).getTime() >= threshold,
      );
    }
  }

  return result;
};

const buildCatalogs = (students: ControlEscolarStudentRow[]) => {
  const gruposPorGrado = students.reduce<Record<string, string[]>>(
    (acc, student) => {
      if (!student.grado || !student.group) return acc;
      if (!acc[student.grado]) acc[student.grado] = [];
      if (!acc[student.grado].includes(student.group))
        acc[student.grado].push(student.group);
      return acc;
    },
    {},
  );

  Object.keys(gruposPorGrado).forEach((grado) => {
    gruposPorGrado[grado].sort((a, b) => a.localeCompare(b, "es"));
  });

  return {
    niveles: Array.from(
      new Set(students.map((student) => student.nivel).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b, "es")),
    grados: Array.from(
      new Set(students.map((student) => student.grado).filter(Boolean)),
    ).sort(compareAcademicGrade),
    grupos: Array.from(
      new Set(students.map((student) => student.group).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b, "es")),
    gruposPorGrado,
  };
};

export const fetchControlEscolarStudents = async (
  agentId: string,
  filters: any,
) => {
  const page = Math.max(1, Number(filters.page || 1) || 1);
  const wantsAll = ["1", "true", "all", "snapshot", "index"].includes(
    String(filters.all || filters.mode || "").toLowerCase(),
  );
  const limit = wantsAll
    ? Math.min(
        MAX_LOCAL_ROWS,
        Math.max(1, Number(filters.limit || MAX_LOCAL_ROWS) || MAX_LOCAL_ROWS),
      )
    : Math.min(100, Math.max(8, Number(filters.limit || 25) || 25));
  const loaded = await fetchAllNormalizedStudents(agentId, filters);
  const allStudents = loaded.students;
  if (wantsAll && !normalizeText(filters.search || filters.q || "", 80)) {
    writeControlEscolarExternalStudentView(agentId, filters, allStudents, loaded.source).catch((error: any) => {
      console.warn("[Aurora External API] Warm student view publish failed.", {
        plantel: normalizePlantel(agentId),
        ciclo: normalizeText(filters.ciclo || filters.cicloKey || ""),
        message: error?.message || error
      });
    });
  }
  const filtered = applyFilters(
    allStudents,
    wantsAll
      ? {
          ...filters,
          search: "",
          status: "",
          quality: "",
          grado: "",
          group: "",
          grupo: "",
          recent: "",
        }
      : filters,
  );
  const offset = (page - 1) * limit;
  const data = wantsAll ? filtered : filtered.slice(offset, offset + limit);

  return {
    data,
    pagination: {
      page: wantsAll ? 1 : page,
      limit: wantsAll ? Math.max(data.length, 1) : limit,
      total: filtered.length,
      pages: wantsAll ? 1 : Math.max(1, Math.ceil(filtered.length / limit)),
    },
    catalogs: buildCatalogs(allStudents),
    source: loaded.source,
  };
};


export const refreshVerifiedControlEscolarCacheForScope = async (
  agentId: string,
  filters: any = {},
) => {
  const search = normalizeText(filters.search || filters.q || "", 80);
  if (search) return { success: true, skipped: true, reason: "search_result_not_cacheable" };
  const scope = resolveOperatorScope(filters);
  if (!scope.enrollmentConceptIds.length)
    return { success: true, skipped: true, reason: "missing_enrollment_concepts" };
  assertControlEscolarDynamicBridge(agentId);
  const schema = await getControlEscolarSchema(agentId, {
    requireCentral: false,
    skipCentral: false,
  });
  const liveRows = await fetchLocalBaseRows(agentId, schema, filters);
  return await maybeRefreshVerifiedControlEscolarScopeCache(agentId, scope, liveRows, {
    triggerName: "background-verified-cache-refresh",
  });
};


export const fetchControlEscolarSiblingsByParentNames = async (
  agentId: string,
  matricula: string,
  filters: any = {},
) => {
  const normalizedMatricula = canonicalMatriculaKey(matricula);
  if (!normalizedMatricula) {
    throw createError({ statusCode: 400, message: "Matrícula inválida." });
  }

  const loaded = await fetchAllNormalizedStudents(agentId, filters);
  const current = loaded.students.find(
    (student) => canonicalMatriculaKey(student.matricula) === normalizedMatricula,
  );

  if (!current) {
    return {
      siblings: [],
      source: "control-escolar-missing",
      match: null,
      sourceMeta: loaded.source,
    };
  }

  const signature = current.parentSiblingSignature || buildParentSiblingSignature(current as any);
  if (!signature.complete) {
    return {
      siblings: [],
      source: "control-escolar-parent-names-incomplete",
      match: {
        fatherName: signature.fatherName,
        motherName: signature.motherName,
        normalizedFatherName: signature.normalizedFatherName,
        normalizedMotherName: signature.normalizedMotherName,
      },
      sourceMeta: loaded.source,
    };
  }

  const siblings = loaded.students
    .filter((student) => canonicalMatriculaKey(student.matricula) !== normalizedMatricula)
    .filter((student) => (student.parentSiblingSignature || buildParentSiblingSignature(student as any)).key === signature.key)
    .sort(compareStudents)
    .map((student) => ({
      ...student,
      siblingMatchSource: "control-escolar-parent-names",
      siblingMatchReason: "Mismo padre y misma madre registrados",
    }));

  return {
    siblings,
    source: "control-escolar-parent-names",
    match: {
      fatherName: signature.fatherName,
      motherName: signature.motherName,
      normalizedFatherName: signature.normalizedFatherName,
      normalizedMotherName: signature.normalizedMotherName,
    },
    sourceMeta: loaded.source,
  };
};

export const fetchControlEscolarKpis = async (
  agentId: string,
  filters: any = {},
) => {
  const loaded = await fetchAllNormalizedStudents(agentId, filters);
  const students = loaded.students;
  const byNivel = new Map<string, number>();
  const byGrupo = new Map<string, number>();

  students.forEach((student) => {
    if (student.nivel)
      byNivel.set(student.nivel, (byNivel.get(student.nivel) || 0) + 1);
    const groupKey =
      [student.grado, student.group].filter(Boolean).join(" ") || student.group;
    if (groupKey) byGrupo.set(groupKey, (byGrupo.get(groupKey) || 0) + 1);
  });

  const active = students.filter(
    (student) => student.status === "Activo",
  ).length;
  const inscritos = students.filter(
    (student) => student.enrollmentState === "inscrito",
  ).length;
  const internos = students.filter(
    (student) =>
      student.enrollmentState === "inscrito" &&
      student.tipoIngresoValue === "interno",
  ).length;
  const externos = students.filter(
    (student) =>
      student.enrollmentState === "inscrito" &&
      student.tipoIngresoValue !== "interno",
  ).length;
  const noInscritos = students.filter(
    (student) => student.enrollmentState === "no_inscrito",
  ).length;
  const bajas = students.filter(
    (student) =>
      student.status === "Baja" ||
      student.enrollmentState === "baja_inscrita" ||
      student.enrollmentState === "baja",
  ).length;
  const sinFichaMatricula = students.filter(
    (student) => !student.overlayExists,
  ).length;
  const progressStudents = students.filter(isInscritoForControlProgress);
  const expedientesIncompletos = progressStudents.filter(
    (student) => student.missingFields.length > 0,
  ).length;
  const expedientesCompletos = progressStudents.filter(
    (student) => student.missingFields.length === 0,
  ).length;
  const sinContacto = progressStudents.filter(hasNoPrimaryContact).length;
  const missing = (field: string) =>
    progressStudents.filter((student) => student.missingFields.includes(field))
      .length;

  return {
    totalInscritos: inscritos,
    totalVisible: students.length,
    totalExpedientesEvaluados: progressStudents.length,
    expedientesCompletos,
    inscritos,
    internos,
    externos,
    noInscritos,
    activos: active,
    inactivos: students.length - active,
    bajas,
    sinFichaMatricula,
    nuevosOverlay: sinFichaMatricula,
    expedientesIncompletos,
    sinContacto,
    sinCurp: missing("curp"),
    sinPadre: progressStudents.filter((student) => ["padreNombre", "padreApellidoPaterno", "padreTelefono", "padreEmail"].some((field) => student.missingFields.includes(field))).length,
    sinMadre: progressStudents.filter((student) => ["madreNombre", "madreApellidoPaterno", "madreTelefono", "madreEmail"].some((field) => student.missingFields.includes(field))).length,
    sinTelefono: progressStudents.filter((student) => ["padreTelefono", "madreTelefono"].some((field) => student.missingFields.includes(field))).length,
    sinTutor: progressStudents.filter((student) => ["padreNombre", "padreApellidoPaterno", "madreNombre", "madreApellidoPaterno"].some((field) => student.missingFields.includes(field))).length,
    sinEmail: progressStudents.filter((student) => ["padreEmail", "madreEmail"].some((field) => student.missingFields.includes(field))).length,
    porNivel: Array.from(byNivel.entries()).map(([label, total]) => ({
      label,
      total,
    })),
    porGrupo: Array.from(byGrupo.entries())
      .map(([label, total]) => ({ label, total }))
      .slice(0, 18),
  };
};

const PATCH_FIELD_COLUMN_MAP: Record<string, string> = {
  nombres: "nombres",
  apellidoPaterno: "apellido_paterno",
  apellidoMaterno: "apellido_materno",
  curp: "curp",
  nombreVerificado: "nombre_verificado",
  nombreCompletoAlumno: "nombre_completo_alumno",
  lastGrade: "last_grade",
  lastCiclo: "last_ciclo",
  lugarNacimiento: "lugar_nacimiento",
  sexo: "sexo",
  talla: "talla",
  peso: "peso",
  tipoSangre: "tipo_sangre",
  alergias: "alergias",
  foto: "foto",
  emailPadre: "email_padre",
  emailMadre: "email_madre",
  telefonoPadre: "telefono_padre",
  telefonoMadre: "telefono_madre",
  interno: "interno",
  eventual: "eventual",
  verified: "verified",
  baja: "baja",
  motivoBaja: "motivo_baja",
  categoriaBaja: "categoria_baja",
  seguimientoBaja: "seguimiento_baja",
  nombrePadre: "nombre_padre",
  apellidoPaternoPadre: "apellido_paterno_padre",
  apellidoMaternoPadre: "apellido_materno_padre",
  lugarTrabajoPadre: "lugar_trabajo_padre",
  puestoPadre: "puesto_padre",
  estadoCivilPadre: "estado_civil_padre",
  fechaNacimientoPadre: "fecha_nacimiento_padre",
  inePadre: "ine_padre",
  curpPadre: "curp_padre",
  nombreMadre: "nombre_madre",
  apellidoPaternoMadre: "apellido_paterno_madre",
  apellidoMaternoMadre: "apellido_materno_madre",
  lugarTrabajoMadre: "lugar_trabajo_madre",
  puestoMadre: "puesto_madre",
  estadoCivilMadre: "estado_civil_madre",
  fechaNacimientoMadre: "fecha_nacimiento_madre",
  ineMadre: "ine_madre",
  curpMadre: "curp_madre",
  servicio: "servicio",
  servicioNotas: "servicio_notas",
  grado: "grado",
  grupo: "grupo",
  nivel: "nivel",
  ciclo: "ciclo",
  direccion: "direccion",
  domicilio: "domicilio",
  domicilioCalle: "domicilio_calle",
  domicilioNumero: "domicilio_num",
  domicilioNum: "domicilio_num",
  domicioNum: "domicio_num",
  domicilioColonia: "domicilio_colonia",
  domicilioCp: "domicilio_cp",
  domicilioMunicipio: "domicilio_municipio",
  certificadoMedicoAdjunto: "certificado_medico_adjunto",
  certificadoVacunacionCovid19Adjunto: "certificado_vacunacion_covid19_adjunto",
  actaNacimientoAdjunta: "acta_nacimiento_adjunta",
  curpAlumnoAdjunto: "curp_alumno_adjunto",
  certificadoPrimariaAdjunto: "certificado_primaria_adjunto",
  boletaSextoPrimariaAdjunta: "boleta_sexto_primaria_adjunta",
  boletaPrimeroSecundariaAdjunta: "boleta_primero_secundaria_adjunta",
  boletaSegundoSecundariaAdjunta: "boleta_segundo_secundaria_adjunta",
};

const ADVANCED_FILE_PATCH_FIELDS = new Set([
  "certificadoMedicoAdjunto",
  "certificadoVacunacionCovid19Adjunto",
  "actaNacimientoAdjunta",
  "curpAlumnoAdjunto",
  "certificadoPrimariaAdjunto",
  "boletaSextoPrimariaAdjunta",
  "boletaPrimeroSecundariaAdjunta",
  "boletaSegundoSecundariaAdjunta",
]);

const CONTROL_ESCOLAR_DIRECT_RESTRICTED_FIELDS = new Set([
  "nivel",
  "grado",
  "ciclo",
  "interno",
]);

const normalizePatchValue = (field: string, value: unknown) => {
  if (field === "curp" || field === "curpPadre" || field === "curpMadre") return normalizeUpper(value, 18) || null;
  if (field.toLowerCase().includes("email"))
    return normalizeEmail(value) || null;
  if (field.toLowerCase().includes("telefono"))
    return normalizePhone(value) || null;
  if (field === "sexo") {
    const normalized = normalizeUpper(value, 20);
    if (["M", "MUJER", "FEMENINO", "F"].includes(normalized)) return "M";
    if (["H", "HOMBRE", "MASCULINO"].includes(normalized)) return "H";
    return normalized || null;
  }
  if (isControlEscolarNameField(field)) return normalizeNameText(value, 255) || null;
  if (["baja", "interno", "eventual", "verified"].includes(field))
    return value === true ||
      value === 1 ||
      String(value).toLowerCase() === "true" ||
      String(value).toLowerCase() === "si" ||
      String(value).toLowerCase() === "sí" ||
      String(value) === "1"
      ? 1
      : 0;
  if (field === "grado" || field === "lastGrade")
    return normalizeText(value, 80) ? displayGrado(value).toLowerCase() : null;
  if (field === "nivel") return normalizeNivelEscolar(value) || null;
  if (field === "grupo") return normalizeText(value, 40) || null;
  if (field === "domicilioCp") return normalizeText(value, 12).replace(/\D/g, "").slice(0, 5) || null;
  if (ADVANCED_FILE_PATCH_FIELDS.has(field)) return normalizeNullable(value, 2048);
  if (["tipoSangre", "talla", "peso"].includes(field)) return normalizeNullable(value, 40);
  if (["fechaNacimientoPadre", "fechaNacimientoMadre"].includes(field)) return normalizeNullable(value, 40);
  if (
    field === "direccion" ||
    field === "domicilio" ||
    field === "servicioNotas" ||
    field === "seguimientoBaja" ||
    field === "motivoBaja" ||
    field === "alergias"
  )
    return normalizeNullable(value, 1000);
  return normalizeNullable(value, 255);
};

type EditableMatriculaEntry = {
  field: string;
  column: string;
  value: any;
};

const resolvePatchColumn = (field: string, schema: ControlEscolarSchema) => {
  if (field === "domicilioNumero" || field === "domicilioNum") {
    if (schema.matricula.has("domicilio_num")) return "domicilio_num";
    if (schema.matricula.has("domicio_num")) return "domicio_num";
  }
  return PATCH_FIELD_COLUMN_MAP[field];
};

const buildEditableMatriculaEntries = (
  body: MatriculaPatch,
  schema: ControlEscolarSchema,
  options: { rejectUnknown?: boolean; skipEmpty?: boolean } = {},
) => {
  const rejectUnknown = options.rejectUnknown !== false;
  const skipEmpty = options.skipEmpty === true;
  const requestedFields = Object.keys(body || {});
  const rejected = requestedFields.filter(
    (field) =>
      !Object.prototype.hasOwnProperty.call(PATCH_FIELD_COLUMN_MAP, field),
  );
  if (rejectUnknown && rejected.length) {
    throw createError({
      statusCode: 400,
      message: `Campos no permitidos para Control Escolar: ${rejected.join(", ")}`,
    });
  }

  let editableEntries = Object.entries(body || {})
    .filter(
      ([field, value]) =>
        Object.prototype.hasOwnProperty.call(PATCH_FIELD_COLUMN_MAP, field) &&
        (!skipEmpty || normalizeText(value, 1000) !== ""),
    )
    .map(([field, value]) => ({
      field,
      column: resolvePatchColumn(field, schema),
      value: normalizePatchValue(field, value),
    }))
    .filter((entry) => entry.column && schema.matricula.has(entry.column));

  const invalidCurp = editableEntries.find(
    (entry) =>
      ["curp", "curpPadre", "curpMadre"].includes(entry.field) &&
      entry.value &&
      !/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(String(entry.value)),
  );
  if (invalidCurp) {
    throw createError({
      statusCode: 400,
      message: `${invalidCurp.field === "curp" ? "CURP" : "CURP familiar"} inválida. Debe tener 18 caracteres con formato oficial.`,
    });
  }

  const curpEntry = editableEntries.find((entry) => entry.field === "curp" && entry.value);
  if (curpEntry) {
    const inferred = inferMexicanCurpIdentity(curpEntry.value);
    if (inferred.valid) {
      const derivedEntries: EditableMatriculaEntry[] = [];
      if (schema.matricula.has("fecha_nacimiento")) {
        derivedEntries.push({
          field: "fechaNacimientoDerivadaCurp",
          column: "fecha_nacimiento",
          value: inferred.fechaNacimiento,
        });
      }
      if (schema.matricula.has("sexo")) {
        derivedEntries.push({
          field: "sexoDerivadoCurp",
          column: "sexo",
          value: inferred.sexo,
        });
      }
      editableEntries = [
        ...editableEntries.filter((entry) => !["fecha_nacimiento", "sexo"].includes(entry.column)),
        ...derivedEntries,
      ];
    }
  }

  const invalidEmail = editableEntries.find(
    (entry) =>
      entry.field.toLowerCase().includes("email") &&
      entry.value &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(entry.value)),
  );
  if (invalidEmail) {
    throw createError({ statusCode: 400, message: "Correo electrónico inválido." });
  }

  const invalidPhone = editableEntries.find(
    (entry) => {
      if (!entry.field.toLowerCase().includes("telefono") || !entry.value) return false;
      let digits = String(entry.value).replace(/\D/g, "");
      if (digits.startsWith("521") && digits.length === 13) digits = digits.slice(3);
      else if (digits.startsWith("52") && digits.length === 12) digits = digits.slice(2);
      return digits.length !== 10;
    },
  );
  if (invalidPhone) {
    throw createError({ statusCode: 400, message: "Teléfono inválido. Usa al menos 10 dígitos." });
  }

  const invalidCp = editableEntries.find(
    (entry) => entry.field === "domicilioCp" && entry.value && String(entry.value).replace(/\D/g, "").length !== 5,
  );
  if (invalidCp) {
    throw createError({ statusCode: 400, message: "Código postal inválido. Usa 5 dígitos." });
  }

  return editableEntries;
};

const upsertMatriculaOverlay = async (
  agentId: string,
  normalizedMatricula: string,
  editableEntries: EditableMatriculaEntry[],
  user: AuthSessionUser,
  basePlantel: unknown,
  schema: ControlEscolarSchema,
) => {
  const [existing] = await controlEscolarCentralQuery<any[]>(
    `SELECT matricula FROM \`matricula\` WHERE UPPER(TRIM(\`matricula\`)) = ? LIMIT 1`,
    [canonicalMatriculaKey(normalizedMatricula)],
  );
  const auditContext = {
    user: user.email,
    agentId,
    matricula: normalizedMatricula,
    fields: editableEntries.map((entry) => entry.field),
  };

  if (existing) {
    const assignments = editableEntries.map(
      (entry) => `${escapeColumn(entry.column)} = ?`,
    );
    const params = [...editableEntries.map((entry) => entry.value)];
    if (schema.matricula.has("updated_at"))
      assignments.push("`updated_at` = CURRENT_TIMESTAMP");
    if (schema.matricula.has("updated_by")) {
      assignments.push("`updated_by` = ?");
      params.push(user.email);
    }
    params.push(canonicalMatriculaKey(normalizedMatricula));
    await controlEscolarCentralQuery(
      `UPDATE \`matricula\` SET ${assignments.join(", ")} WHERE UPPER(TRIM(\`matricula\`)) = ?`,
      params,
    );
  } else {
    const columns = ["matricula"];
    const values: any[] = [normalizedMatricula];

    if (schema.matricula.has("plantel")) {
      columns.push("plantel");
      values.push(normalizePlantel(basePlantel || agentId));
    }

    if (schema.matricula.has("created_by")) {
      columns.push("created_by");
      values.push(user.email);
    }

    if (schema.matricula.has("updated_by")) {
      columns.push("updated_by");
      values.push(user.email);
    }

    editableEntries.forEach((entry) => {
      if (!columns.includes(entry.column)) {
        columns.push(entry.column);
        values.push(entry.value);
      }
    });

    await controlEscolarCentralQuery(
      `INSERT INTO \`matricula\` (${columns.map(escapeColumn).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      values,
    );
  }

  console.info(
    "[Control Escolar] centralized matricula overlay updated",
    auditContext,
  );
};

const syncEditableFieldsToBase = async (
  normalizedMatricula: string,
  editableEntries: EditableMatriculaEntry[],
  schema: ControlEscolarSchema,
) => {
  const syncableColumns = new Set(["nivel", "grado", "grupo", "ciclo"]);
  const baseUpdates = editableEntries.filter(
    (entry) => syncableColumns.has(entry.column) && schema.base.has(entry.column),
  );
  if (!baseUpdates.length) return;
  const assignments = baseUpdates.map((entry) => `\`${entry.column}\` = ?`);
  const params = [...baseUpdates.map((entry) => entry.value), canonicalMatriculaKey(normalizedMatricula)];
  await query(
    `UPDATE base SET ${assignments.join(", ")} WHERE UPPER(TRIM(matricula)) = ?`,
    params,
  );
};

export const CONTROL_ESCOLAR_MATRICULA_IMPORT_FIELDS = [
  "matricula",
  "apellidoPaterno",
  "apellidoMaterno",
  "nombres",
  "curp",
  "nombreVerificado",
  "nombreCompletoAlumno",
  "lugarNacimiento",
  "talla",
  "peso",
  "tipoSangre",
  "alergias",
  "nivel",
  "grado",
  "ciclo",
  "lastGrade",
  "lastCiclo",
  "interno",
  "eventual",
  "verified",
  "servicio",
  "telefonoPadre",
  "telefonoMadre",
  "emailPadre",
  "emailMadre",
  "nombrePadre",
  "apellidoPaternoPadre",
  "apellidoMaternoPadre",
  "lugarTrabajoPadre",
  "puestoPadre",
  "estadoCivilPadre",
  "fechaNacimientoPadre",
  "inePadre",
  "curpPadre",
  "nombreMadre",
  "apellidoPaternoMadre",
  "apellidoMaternoMadre",
  "lugarTrabajoMadre",
  "puestoMadre",
  "estadoCivilMadre",
  "fechaNacimientoMadre",
  "ineMadre",
  "curpMadre",
  "direccion",
  "domicilioCalle",
  "domicilioNumero",
  "domicilioColonia",
  "domicilioCp",
  "domicilioMunicipio",
  "baja",
  "motivoBaja",
  "categoriaBaja",
  "seguimientoBaja",
  "servicioNotas",
  "certificadoMedicoAdjunto",
  "certificadoVacunacionCovid19Adjunto",
  "actaNacimientoAdjunta",
  "curpAlumnoAdjunto",
  "certificadoPrimariaAdjunto",
  "boletaSextoPrimariaAdjunta",
  "boletaPrimeroSecundariaAdjunta",
  "boletaSegundoSecundariaAdjunta",
];

export const CONTROL_ESCOLAR_MATRICULA_IMPORT_LABELS: Record<string, string> = {
  matricula: "Matrícula",
  apellidoPaterno: "Apellido paterno",
  apellidoMaterno: "Apellido materno",
  nombres: "Nombre(s)",
  curp: "CURP",
  nivel: "Nivel",
  grado: "Grado",
  grupo: "Grupo",
  interno: "Interno",
  servicio: "Servicio",
  telefonoPadre: "Teléfono padre",
  telefonoMadre: "Teléfono madre",
  emailPadre: "Email padre",
  emailMadre: "Email madre",
  nombrePadre: "Nombre padre",
  apellidoPaternoPadre: "Apellido paterno padre",
  apellidoMaternoPadre: "Apellido materno padre",
  nombreMadre: "Nombre madre",
  apellidoPaternoMadre: "Apellido paterno madre",
  apellidoMaternoMadre: "Apellido materno madre",
  direccion: "Dirección",
  baja: "Baja",
  motivoBaja: "Motivo baja",
  categoriaBaja: "Categoría baja",
  seguimientoBaja: "Seguimiento baja",
  nombreVerificado: "Nombre verificado",
  nombreCompletoAlumno: "Nombre completo alumno",
  lugarNacimiento: "Lugar nacimiento alumno",
  talla: "Talla",
  peso: "Peso",
  tipoSangre: "Tipo de sangre",
  alergias: "Alergias",
  ciclo: "Ciclo matrícula",
  lastGrade: "Último grado",
  lastCiclo: "Último ciclo",
  eventual: "Eventual",
  verified: "Verificado",
  servicioNotas: "Notas de servicio",
  lugarTrabajoPadre: "Lugar trabajo padre",
  puestoPadre: "Puesto padre",
  estadoCivilPadre: "Estado civil padre",
  fechaNacimientoPadre: "Fecha nacimiento padre",
  inePadre: "INE padre",
  curpPadre: "CURP padre",
  lugarTrabajoMadre: "Lugar trabajo madre",
  puestoMadre: "Puesto madre",
  estadoCivilMadre: "Estado civil madre",
  fechaNacimientoMadre: "Fecha nacimiento madre",
  ineMadre: "INE madre",
  curpMadre: "CURP madre",
  domicilioCalle: "Calle domicilio",
  domicilioNumero: "Número domicilio",
  domicilioColonia: "Colonia domicilio",
  domicilioCp: "CP domicilio",
  domicilioMunicipio: "Municipio domicilio",
  certificadoMedicoAdjunto: "Certificado médico adjunto",
  certificadoVacunacionCovid19Adjunto: "Certificado vacunación COVID-19",
  actaNacimientoAdjunta: "Acta nacimiento adjunta",
  curpAlumnoAdjunto: "CURP alumno adjunto",
  certificadoPrimariaAdjunto: "Certificado primaria adjunto",
  boletaSextoPrimariaAdjunta: "Boleta sexto primaria",
  boletaPrimeroSecundariaAdjunta: "Boleta primero secundaria",
  boletaSegundoSecundariaAdjunta: "Boleta segundo secundaria",

};

export const importControlEscolarMatriculaUpdates = async (
  agentId: string,
  rows: MatriculaPatch[],
  user: AuthSessionUser,
  filters: any = {},
) => {
  const schema = await getControlEscolarCentralOnlySchema(agentId, {
    requireCentral: true,
  });
  const scopeFilters = {
    ciclo: filters.ciclo,
    cicloKey: filters.cicloKey,
    targetCiclo: filters.targetCiclo,
    concepts: filters.concepts,
    enrollmentConcepts: filters.enrollmentConcepts,
  };
  const visibleScope = await fetchAllNormalizedStudents(agentId, scopeFilters);
  const visibleByMatricula = new Map(
    visibleScope.students.map((student) => [student.matricula, student]),
  );
  const summary = {
    processed: rows.length,
    updated: 0,
    skipped: 0,
    errors: [] as Array<{ row: number; matricula?: string; message: string }>,
  };

  for (const [index, row] of rows.entries()) {
    const normalizedMatricula = normalizeText(
      row.matricula || row.Matricula || row["Matrícula"],
      64,
    );
    if (!normalizedMatricula) {
      summary.skipped++;
      if (summary.errors.length < 50)
        summary.errors.push({ row: index + 2, message: "Falta matrícula." });
      continue;
    }

    const visibleStudent = visibleByMatricula.get(normalizedMatricula);
    if (!visibleStudent) {
      summary.skipped++;
      if (summary.errors.length < 50)
        summary.errors.push({
          row: index + 2,
          matricula: normalizedMatricula,
          message: "Alumno fuera del alcance visible del plantel/ciclo.",
        });
      continue;
    }

    try {
      const patch: MatriculaPatch = {};
      CONTROL_ESCOLAR_MATRICULA_IMPORT_FIELDS.forEach((field) => {
        if (field === "matricula") return;
        if (Object.prototype.hasOwnProperty.call(row, field))
          patch[field] = row[field];
      });
      const editableEntries = buildEditableMatriculaEntries(patch, schema, {
        rejectUnknown: false,
        skipEmpty: true,
      });
      if (!editableEntries.length) {
        summary.skipped++;
        if (summary.errors.length < 50)
          summary.errors.push({
            row: index + 2,
            matricula: normalizedMatricula,
            message: "Sin campos editables con valor para matricula central.",
          });
        continue;
      }
      await upsertMatriculaOverlay(
        agentId,
        normalizedMatricula,
        editableEntries,
        user,
        visibleStudent.plantel || visibleStudent.basePlantel || agentId,
        schema,
      );
      summary.updated++;
    } catch (error: any) {
      summary.skipped++;
      if (summary.errors.length < 50)
        summary.errors.push({
          row: index + 2,
          matricula: normalizedMatricula,
          message: toErrorMessage(error),
        });
    }
  }

  return summary;
};

export const updateControlEscolarStudent = async (
  agentId: string,
  matricula: string,
  body: MatriculaPatch,
  user: AuthSessionUser,
  filters: any = {},
) => {
  const normalizedMatricula = normalizeText(matricula, 64);
  if (!normalizedMatricula) {
    throw createError({ statusCode: 400, message: "Matrícula inválida." });
  }

  const schema = await getControlEscolarCentralOnlySchema(agentId, {
    requireCentral: true,
  });
  const scopeFilters = {
    ciclo: filters.ciclo,
    cicloKey: filters.cicloKey,
    targetCiclo: filters.targetCiclo,
    concepts: filters.concepts,
    enrollmentConcepts: filters.enrollmentConcepts,
  };
  const visibleScope = await fetchAllNormalizedStudents(agentId, scopeFilters);
  const normalizedMatriculaKey = canonicalMatriculaKey(normalizedMatricula);
  const visibleStudent = visibleScope.students.find(
    (student) => canonicalMatriculaKey(student.matricula) === normalizedMatriculaKey,
  );
  if (!visibleStudent) {
    throw createError({
      statusCode: 403,
      message:
        "El alumno no está dentro del alcance visible de Control Escolar para este ciclo y plantel.",
    });
  }

  const restrictedDirectFields = Object.keys(body || {}).filter((field) =>
    CONTROL_ESCOLAR_DIRECT_RESTRICTED_FIELDS.has(field),
  );
  if (restrictedDirectFields.length) {
    throw createError({
      statusCode: 400,
      message:
        "Nivel, grado, ciclo e interno se actualizan desde el flujo de grado y ciclo.",
    });
  }

  const editableEntries = buildEditableMatriculaEntries(body, schema, {
    rejectUnknown: true,
  });

  if (!editableEntries.length) {
    throw createError({
      statusCode: 400,
      message:
        "No hay campos editables disponibles en la tabla centralizada matricula para guardar.",
    });
  }

  await upsertMatriculaOverlay(
    agentId,
    normalizedMatricula,
    editableEntries,
    user,
    visibleStudent.plantel || visibleStudent.basePlantel || agentId,
    schema,
  );
  await syncEditableFieldsToBase(normalizedMatricula, editableEntries, schema);

  const result = await fetchControlEscolarStudents(agentId, {
    ...scopeFilters,
    search: normalizedMatricula,
    page: 1,
    limit: 10,
  });
  return {
    success: true,
    student:
      result.data.find(
        (student) => canonicalMatriculaKey(student.matricula) === normalizedMatriculaKey,
      ) ||
      result.data[0] ||
      null,
  };
};

export const runControlEscolar = async <T>(
  event: any,
  agentId: string,
  callback: () => Promise<T>,
) => {
  event.context.controlEscolarAgentId = agentId;
  return await runWithBridgeAgentId(agentId, callback);
};

export const fetchControlEscolarExportRows = async (
  agentId: string,
  filters: any,
) => {
  const loaded = await fetchAllNormalizedStudents(agentId, filters);
  return applyFilters(loaded.students, filters).slice(0, MAX_LOCAL_ROWS);
};
