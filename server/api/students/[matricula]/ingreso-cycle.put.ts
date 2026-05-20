import { runWithBridgeAgentId, query } from "../../../utils/db";
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
