import { query } from './db'
import { normalizeCicloKey } from '../../shared/utils/ciclo'
import {
  calculatePromotedGrado,
  displayGrado,
  isInProjectedPlantelScopeForCiclo,
  plantelCandidatesForProjectedScope,
} from '../../shared/utils/grado'
import { hydrateFinancialConceptNames, resolveFinancialConcept } from './financial-concept'

const firstQueryValue = (value: unknown) => {
  if (Array.isArray(value)) return firstQueryValue(value[0])
  return value === null || value === undefined ? '' : String(value).trim()
}

export const loadConceptReport = async (user: any, filters: Record<string, unknown>) => {
  const { conceptoId, inicio, fin, plantel, ciclo = '2025' } = filters || {}
  const cicloKey = normalizeCicloKey(ciclo as any)
  const id = Number(firstQueryValue(conceptoId))

  if (!id) {
    throw createError({ statusCode: 400, message: 'Seleccione un concepto.' })
  }

  const resolvedConcept = await resolveFinancialConcept({ conceptoId: id, ciclo: cicloKey })
  const [bridgeMetadata] = await query<any[]>(`
    SELECT id, concepto, costo, description, plantel, eventual, plazo, ciclo
    FROM conceptos
    WHERE id = ?
    LIMIT 1
  `, [id]).catch(() => [])
  const concepto = {
    ...(bridgeMetadata || {}),
    id: resolvedConcept.id,
    concepto: resolvedConcept.concepto,
    costo: bridgeMetadata?.costo ?? resolvedConcept.costo,
    ciclo: bridgeMetadata?.ciclo || resolvedConcept.ciclo || cicloKey,
  }

  let where = `
    r.estatus = 'Vigente'
    AND COALESCE(r.depurado, 0) = 0
    AND r.ciclo = ?
    AND CAST(r.concepto AS CHAR) = ?
  `
  const params: any[] = [cicloKey, String(concepto.id)]
  const inicioValue = firstQueryValue(inicio)
  const finValue = firstQueryValue(fin)
  const plantelValue = firstQueryValue(plantel)

  if (inicioValue) {
    where += ' AND DATE(r.fecha) >= ?'
    params.push(inicioValue)
  }

  if (finValue) {
    where += ' AND DATE(r.fecha) <= ?'
    params.push(finValue)
  }

  const scopePlantel = (!user.isSuperAdmin || user.active_plantel !== 'GLOBAL')
    ? user.active_plantel
    : plantelValue

  if (scopePlantel) {
    const plantelCandidates = plantelCandidatesForProjectedScope(scopePlantel)
    where += ` AND COALESCE(A.plantel, r.plantel) IN (${plantelCandidates.map(() => '?').join(',')})`
    params.push(...plantelCandidates)
  }

  const rawRows = await query<any[]>(`
    SELECT
      r.folio,
      r.fecha,
      r.matricula,
      r.documento,
      r.mes,
      r.mesReal,
      r.nombreCompleto,
      r.concepto,
      r.conceptoNombre,
      r.monto,
      r.formaDePago,
      r.plantel,
      r.ciclo,
      A.grado as gradoBase,
      A.nivel as nivelBase,
      A.ciclo as cicloBase,
      COALESCE(A.plantel, r.plantel) as scopePlantel
    FROM referenciasdepago r
    LEFT JOIN base A ON A.matricula = r.matricula
    WHERE ${where}
    ORDER BY r.fecha DESC, r.folio DESC
  `, params)

  const rows = rawRows
    .filter(row => (
      isInProjectedPlantelScopeForCiclo(
        row.gradoBase,
        row.scopePlantel,
        row.cicloBase,
        cicloKey,
        row.nivelBase,
        scopePlantel || 'GLOBAL',
      )
    ))
    .map((row) => {
      const hasBaseGrade = String(row.gradoBase ?? '').trim() !== ''
      const projected = hasBaseGrade
        ? calculatePromotedGrado(row.gradoBase, row.scopePlantel, row.cicloBase, cicloKey, row.nivelBase)
        : null

      return {
        ...row,
        ciclo: cicloKey,
        grado: projected ? displayGrado(projected.grado) : '',
        nivel: projected?.nivel || '',
        plantelProyectado: projected?.plantel || row.scopePlantel || row.plantel || '',
      }
    })

  await hydrateFinancialConceptNames(rows, { ciclo: cicloKey })

  const formasPagoMap = new Map<string, number>()
  const plantelesMap = new Map<string, number>()
  const alumnos = new Set<string>()
  let total = 0

  rows.forEach((row) => {
    const monto = Number(row.monto || 0)
    const formaDePago = String(row.formaDePago || 'Sin forma de pago')
    const rowPlantel = String(row.plantel || 'Sin plantel')

    total += monto
    alumnos.add(String(row.matricula || ''))
    formasPagoMap.set(formaDePago, (formasPagoMap.get(formaDePago) || 0) + monto)
    plantelesMap.set(rowPlantel, (plantelesMap.get(rowPlantel) || 0) + monto)
  })

  const formasPago = Array.from(formasPagoMap.entries())
    .map(([formaDePago, total]) => ({ formaDePago, total }))
    .sort((a, b) => Number(b.total || 0) - Number(a.total || 0))

  const planteles = Array.from(plantelesMap.entries())
    .map(([plantel, total]) => ({ plantel, total }))
    .sort((a, b) => Number(b.total || 0) - Number(a.total || 0))

  return {
    concepto,
    rows,
    filtros: {
      plantel: scopePlantel || '',
      ciclo: cicloKey,
      inicio: inicioValue,
      fin: finValue,
    },
    resumen: {
      total,
      transacciones: rows.length,
      alumnos: Array.from(alumnos).filter(Boolean).length,
      formasPago,
      planteles,
    },
  }
}
