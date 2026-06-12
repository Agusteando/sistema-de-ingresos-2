import { runWithBridgeAgentId, query } from "../../../utils/db";
import { controlEscolarCentralQuery, getCentralTableColumns } from "../../../utils/control-escolar-central";
import {
  normalizeCicloForTipoIngreso,
  resolveTipoIngreso,
} from "../../../../shared/utils/tipoIngreso";
import {
  displayGrado,
  isInProjectedPlantelScopeForCiclo,
  normalizeGradoForPlantel,
  normalizeNivelEscolar,
  normalizePlantel,
  projectPlantelForNivel,
  resolveNivelEscolar,
} from "../../../../shared/utils/grado";

const escapeColumn = (column: string) => `\`${String(column).replace(/`/g, "``")}\``;
const canonicalMatriculaKey = (value: unknown) =>
  String(value || "")
    .trim()
    .toUpperCase();

const readOverrideRequested = (body: any) =>
  Object.prototype.hasOwnProperty.call(body || {}, "tipoIngresoOverrideActivo") ||
  Object.prototype.hasOwnProperty.call(body || {}, "tipoIngresoOverride");

const normalizeOverrideActive = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const raw = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "si", "sí", "yes", "activo", "active"].includes(raw);
};

const normalizeOverrideValue = (value: unknown) =>
  String(value || "externo").trim().toLowerCase() === "interno"
    ? "interno"
    : "externo";

const syncAcademicOverlay = async ({
  matricula,
  userEmail,
  plantel,
  nivel,
  grado,
  ciclo,
}: {
  matricula: string;
  userEmail?: string;
  plantel: string;
  nivel: string;
  grado: string;
  ciclo: string;
}) => {
  try {
    const columns = await getCentralTableColumns("matricula");
    if (!columns.has("matricula")) return;

    const entries = [
      { column: "plantel", value: plantel },
      { column: "nivel", value: nivel },
      { column: "grado", value: displayGrado(grado).toLowerCase() },
      { column: "ciclo", value: ciclo },
    ].filter((entry) => columns.has(entry.column));

    if (!entries.length) return;

    const [existing] = await controlEscolarCentralQuery<any[]>(
      `SELECT \`matricula\` FROM \`matricula\` WHERE UPPER(TRIM(\`matricula\`)) = ? LIMIT 1`,
      [canonicalMatriculaKey(matricula)],
    );

    if (existing) {
      const assignments = entries.map((entry) => `${escapeColumn(entry.column)} = ?`);
      const params = entries.map((entry) => entry.value);
      if (columns.has("updated_at")) assignments.push("`updated_at` = CURRENT_TIMESTAMP");
      if (columns.has("updated_by")) {
        assignments.push("`updated_by` = ?");
        params.push(userEmail || "sistema");
      }
      params.push(canonicalMatriculaKey(matricula));
      await controlEscolarCentralQuery(
        `UPDATE \`matricula\` SET ${assignments.join(", ")} WHERE UPPER(TRIM(\`matricula\`)) = ?`,
        params,
      );
      return;
    }

    const insertColumns = ["matricula", ...entries.map((entry) => entry.column)];
    const insertValues: unknown[] = [matricula, ...entries.map((entry) => entry.value)];
    if (columns.has("created_by")) {
      insertColumns.push("created_by");
      insertValues.push(userEmail || "sistema");
    }
    if (columns.has("updated_by")) {
      insertColumns.push("updated_by");
      insertValues.push(userEmail || "sistema");
    }
    await controlEscolarCentralQuery(
      `INSERT INTO \`matricula\` (${insertColumns.map(escapeColumn).join(", ")}) VALUES (${insertColumns.map(() => "?").join(", ")})`,
      insertValues,
    );
  } catch (error: any) {
    console.warn(
      "[Control Escolar] No se pudo sincronizar grado/ciclo en matricula central.",
      error?.message || error,
    );
  }
};

export default defineEventHandler(async (event) =>
  runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
    const matricula = String(event.context.params?.matricula || "").trim();
    if (!matricula)
      throw createError({ statusCode: 400, message: "Matrícula requerida" });

    const body = await readBody(event);
    const ingresoCiclo = normalizeCicloForTipoIngreso(body?.ciclo);
    if (!ingresoCiclo)
      throw createError({
        statusCode: 400,
        message: "Ciclo de ingreso inválido",
      });

    const user = event.context.user;
    const targetCiclo =
      normalizeCicloForTipoIngreso(body?.targetCiclo) || ingresoCiclo;
    const [student] = await query<any[]>(
      `
    SELECT
      base.matricula,
      base.plantel,
      base.nivel AS nivelBase,
      base.grado AS gradoBase,
      base.ciclo AS cicloBase,
      base.ciclo,
      IFNULL(TIO.override_activo, 0) AS tipoIngresoOverrideActivo,
      IFNULL(TIO.tipo_forzado, 'externo') AS tipoIngresoOverride
    FROM base
    LEFT JOIN student_tipo_ingreso_overrides TIO ON TIO.matricula = base.matricula
    WHERE base.matricula = ?
    LIMIT 1
  `,
      [matricula],
    );

    if (!student)
      throw createError({ statusCode: 404, message: "Alumno no encontrado" });

    const isScopedToActivePlantel =
      !user.isSuperAdmin ||
      (user.isSuperAdmin && user.active_plantel !== "GLOBAL");

    if (
      !isInProjectedPlantelScopeForCiclo(
        student.gradoBase,
        student.plantel,
        student.cicloBase,
        targetCiclo,
        student.nivelBase,
        isScopedToActivePlantel ? user.active_plantel : "GLOBAL",
      )
    ) {
      throw createError({
        statusCode: isScopedToActivePlantel ? 403 : 409,
        message: "No tienes acceso a este alumno en este ciclo",
      });
    }

    const currentNivel = resolveNivelEscolar(student.plantel, student.nivelBase);
    const requestedNivel = normalizeNivelEscolar(body?.targetNivel) || currentNivel;
    const targetPlantel = normalizePlantel(
      isScopedToActivePlantel ? user.active_plantel : student.plantel,
    );
    const placementPlantel = projectPlantelForNivel(
      targetPlantel || student.plantel,
      requestedNivel,
    );
    const requestedGrado = normalizeGradoForPlantel(
      body?.targetGrado || student.gradoBase,
      placementPlantel,
      requestedNivel,
    );

    if (!requestedNivel || !requestedGrado || !placementPlantel) {
      throw createError({
        statusCode: 400,
        message: "La posición académica seleccionada no es válida.",
      });
    }

    await query(
      `UPDATE base SET ciclo = ?, nivel = ?, grado = ?, plantel = ? WHERE matricula = ?`,
      [ingresoCiclo, requestedNivel, requestedGrado, placementPlantel, matricula],
    );

    const overrideRequested = readOverrideRequested(body);
    const overrideActive = normalizeOverrideActive(body?.tipoIngresoOverrideActivo);
    const overrideValue = normalizeOverrideValue(body?.tipoIngresoOverride);

    if (overrideRequested) {
      if (overrideActive) {
        await query(
          `INSERT INTO student_tipo_ingreso_overrides
             (matricula, override_activo, tipo_forzado, updated_by)
           VALUES (?, 1, ?, ?)
           ON DUPLICATE KEY UPDATE
             override_activo = VALUES(override_activo),
             tipo_forzado = VALUES(tipo_forzado),
             updated_by = VALUES(updated_by),
             updated_at = CURRENT_TIMESTAMP`,
          [matricula, overrideValue, user?.email || "sistema"],
        );
      } else {
        await query(
          `DELETE FROM student_tipo_ingreso_overrides WHERE matricula = ?`,
          [matricula],
        );
      }
    }

    await syncAcademicOverlay({
      matricula,
      userEmail: user?.email,
      plantel: placementPlantel,
      nivel: requestedNivel,
      grado: requestedGrado,
      ciclo: ingresoCiclo,
    });

    const effectiveOverrideActive = overrideRequested
      ? overrideActive
      : normalizeOverrideActive((student as any).tipoIngresoOverrideActivo);
    const effectiveOverrideValue = overrideRequested
      ? overrideValue
      : normalizeOverrideValue((student as any).tipoIngresoOverride);

    const tipoIngreso = resolveTipoIngreso(
      {
        ...student,
        plantel: placementPlantel,
        plantelBase: placementPlantel,
        nivelBase: requestedNivel,
        gradoBase: requestedGrado,
        ciclo: ingresoCiclo,
        cicloBase: ingresoCiclo,
        tipoIngresoOverrideActivo: effectiveOverrideActive ? 1 : 0,
        tipoIngresoOverride: effectiveOverrideValue,
      },
      targetCiclo,
    );

    return {
      success: true,
      student: {
        matricula,
        plantelBase: placementPlantel,
        plantel: placementPlantel,
        nivelBase: requestedNivel,
        nivel: requestedNivel,
        gradoBase: requestedGrado,
        grado: displayGrado(requestedGrado),
        ciclo: ingresoCiclo,
        cicloBase: ingresoCiclo,
        tipoIngresoOverrideActivo: effectiveOverrideActive ? 1 : 0,
        tipoIngresoOverride: effectiveOverrideValue,
        tipoIngreso,
      },
    };
  }),
);
