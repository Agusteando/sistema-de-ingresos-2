import { runWithBridgeAgentId, query } from "../../../utils/db";
import { controlEscolarCentralQuery, getCentralTableColumns } from "../../../utils/control-escolar-central";
import {
  normalizeCicloForTipoIngreso,
  resolveTipoIngreso,
} from "../../../../shared/utils/tipoIngreso";
import {
  calculateBasePlacementForTargetPosition,
  calculatePromotedGrado,
  displayGrado,
  isInProjectedPlantelScopeForCiclo,
  normalizeGradoForPlantel,
  normalizeNivelEscolar,
  normalizePlantel,
  resolveNivelEscolar,
} from "../../../../shared/utils/grado";

const escapeColumn = (column: string) => `\`${String(column).replace(/`/g, "``")}\``;
const canonicalMatriculaKey = (value: unknown) =>
  String(value || "")
    .trim()
    .toUpperCase();

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
    SELECT matricula, plantel, nivel AS nivelBase, grado AS gradoBase, ciclo AS cicloBase, ciclo
    FROM base
    WHERE matricula = ?
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

    const currentProjection = calculatePromotedGrado(
      student.gradoBase,
      student.plantel,
      student.cicloBase,
      targetCiclo,
      student.nivelBase,
    );
    const requestedNivel =
      normalizeNivelEscolar(body?.targetNivel) ||
      (currentProjection.nivel === "Egresado"
        ? resolveNivelEscolar(student.plantel, student.nivelBase)
        : currentProjection.nivel);
    const requestedGrado = normalizeGradoForPlantel(
      body?.targetGrado || currentProjection.grado,
      currentProjection.plantel || student.plantel,
      requestedNivel,
    );
    const targetPlantel = normalizePlantel(
      isScopedToActivePlantel
        ? user.active_plantel
        : currentProjection.plantel || student.plantel,
    );
    const basePlacement = calculateBasePlacementForTargetPosition(
      requestedNivel,
      requestedGrado,
      ingresoCiclo,
      targetCiclo,
      targetPlantel || currentProjection.plantel || student.plantel,
    );

    if (
      basePlacement.outOfScope ||
      !basePlacement.nivel ||
      !basePlacement.grado ||
      !basePlacement.plantel
    ) {
      throw createError({
        statusCode: 400,
        message:
          "La posición elegida no corresponde con el ciclo de ingreso seleccionado.",
      });
    }

    if (
      !isInProjectedPlantelScopeForCiclo(
        basePlacement.grado,
        basePlacement.plantel,
        ingresoCiclo,
        targetCiclo,
        basePlacement.nivel,
        isScopedToActivePlantel ? user.active_plantel : "GLOBAL",
      )
    ) {
      throw createError({
        statusCode: isScopedToActivePlantel ? 403 : 409,
        message:
          "La posición elegida queda fuera del plantel activo en este ciclo.",
      });
    }

    await query(
      `UPDATE base SET ciclo = ?, nivel = ?, grado = ?, plantel = ? WHERE matricula = ?`,
      [
        ingresoCiclo,
        basePlacement.nivel,
        basePlacement.grado,
        basePlacement.plantel,
        matricula,
      ],
    );

    await syncAcademicOverlay({
      matricula,
      userEmail: user?.email,
      plantel: basePlacement.plantel,
      nivel: basePlacement.nivel,
      grado: basePlacement.grado,
      ciclo: ingresoCiclo,
    });

    const projected = calculatePromotedGrado(
      basePlacement.grado,
      basePlacement.plantel,
      ingresoCiclo,
      targetCiclo,
      basePlacement.nivel,
    );
    const tipoIngreso = resolveTipoIngreso(
      {
        ...student,
        plantel: basePlacement.plantel,
        plantelBase: basePlacement.plantel,
        nivelBase: basePlacement.nivel,
        gradoBase: basePlacement.grado,
        ciclo: ingresoCiclo,
        cicloBase: ingresoCiclo,
      },
      targetCiclo,
    );

    return {
      success: true,
      student: {
        matricula,
        plantelBase: basePlacement.plantel,
        plantel: projected.plantel,
        nivelBase: basePlacement.nivel,
        nivel: projected.nivel,
        gradoBase: basePlacement.grado,
        grado: displayGrado(projected.grado),
        ciclo: ingresoCiclo,
        cicloBase: ingresoCiclo,
        tipoIngreso,
      },
    };
  }),
);
