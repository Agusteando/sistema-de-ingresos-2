import { normalizeCicloKey } from '../../shared/utils/ciclo'
import {
  academicPositionAtIndex,
  academicPositionIndex,
  calculatePromotedGrado,
  displayGrado,
  nivelFromMatricula,
  nivelFromPlantel,
  normalizePlantel,
} from '../../shared/utils/grado'

export type FinancialAcademicPlacement = {
  nivel: string
  grado: string
}

/**
 * Resolve the academic label used by financial surfaces without ever exposing
 * the raw `base.nivel` value. The school level comes from the canonical
 * plantel/matricula rules and grade progression is projected to the ledger
 * movement's cycle when the base placement contains enough information.
 */
export const resolveFinancialAcademicPlacement = (
  row: Record<string, any> = {},
  targetCycle: unknown = row.ciclo,
): FinancialAcademicPlacement => {
  const basePlantel = normalizePlantel(row.basePlantel)
  const ledgerPlantel = normalizePlantel(row.plantel)
  const scopePlantel = normalizePlantel(row.scopePlantel)
  const academicPlantel = basePlantel || ledgerPlantel || scopePlantel
  const sourceNivel = academicPlantel
    ? nivelFromPlantel(academicPlantel)
    : nivelFromMatricula(row.matricula)

  const hasBaseGrade = String(row.gradoBase ?? '').trim() !== ''
  if (!hasBaseGrade) {
    return { nivel: sourceNivel, grado: '' }
  }

  const baseYear = Number.parseInt(normalizeCicloKey(row.cicloBase), 10)
  const targetYear = Number.parseInt(normalizeCicloKey(targetCycle), 10)

  // Financial history can point to a cycle before the placement stored in
  // `base`. Reconstruct it over the same canonical academic sequence used by
  // the rest of Aurora instead of exposing the cycle or leaving grade blank.
  if (Number.isFinite(baseYear) && Number.isFinite(targetYear) && targetYear < baseYear) {
    const sourceIndex = academicPositionIndex(sourceNivel, row.gradoBase)
    const historicalPosition = sourceIndex >= 0
      ? academicPositionAtIndex(sourceIndex + (targetYear - baseYear))
      : null

    return historicalPosition
      ? { nivel: historicalPosition.nivel, grado: displayGrado(historicalPosition.grado) }
      : { nivel: sourceNivel, grado: '' }
  }

  const projected = calculatePromotedGrado(
    row.gradoBase,
    academicPlantel,
    row.cicloBase,
    targetCycle,
    sourceNivel,
  )

  return {
    nivel: projected.nivel || sourceNivel,
    grado: displayGrado(projected.grado),
  }
}

export const omitRawFinancialAcademicFields = <T extends Record<string, any>>(row: T) => {
  const {
    nivelBase: _nivelBase,
    gradoBase: _gradoBase,
    cicloBase: _cicloBase,
    basePlantel: _basePlantel,
    ...safe
  } = row
  return safe
}
