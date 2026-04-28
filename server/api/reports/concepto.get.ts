import { query } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { isOutOfScopeForPlantelCiclo } from '../../../shared/utils/grado'

const firstQueryValue = (value: unknown) => {
  if (Array.isArray(value)) return firstQueryValue(value[0])
  return value === null || value === undefined ? '' : String(value).trim()
}

export default defineEventHandler(async (event) => {
  const { conceptoId, inicio, fin, plantel, ciclo = '2025' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const id = Number(firstQueryValue(conceptoId))
  const user = event.context.user

  if (!id) {
    throw createError({ statusCode: 400, message: 'Seleccione un concepto.' })
  }

  const [concepto] = await query<any[]>(`
    SELECT id, concepto, costo, description, plantel, eventual, plazo, ciclo
    FROM conceptos
    WHERE id = ? AND ciclo = ?
    LIMIT 1
  `, [id, cicloKey])

  if (!concepto) {
    throw createError({ statusCode: 404, message: 'Concepto no encontrado para el ciclo activo.' })
  }

  let where = `
    r.estatus = 'Vigente'
    AND r.ciclo = ?
    AND (
      r.conceptoNombre = ?
      OR (CAST(d.concepto AS CHAR) = ? AND r.conceptoNombre = d.conceptoNombre)
      OR EXISTS (
        SELECT 1
        FROM documento_concepto_periodos p
        WHERE p.documento = r.documento
          AND p.estatus = 'Activo'
          AND p.concepto_id = ?
          AND p.conceptoNombre = r.conceptoNombre
      )
    )
  `
  const params: any[] = [cicloKey, concepto.concepto, String(concepto.id), concepto.id]
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

  if (user.role !== 'global' || user.active_plantel !== 'GLOBAL') {
    where += ' AND r.plantel = ?'
    params.push(user.active_plantel)
  } else if (plantelValue) {
    where += ' AND r.plantel = ?'
    params.push(plantelValue)
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
      r.conceptoNombre,
      r.monto,
      r.formaDePago,
      r.plantel,
      A.grado as gradoBase,
      A.ciclo as cicloBase,
      COALESCE(A.plantel, r.plantel) as scopePlantel
    FROM referenciasdepago r
    LEFT JOIN documentos d ON d.documento = r.documento
    LEFT JOIN base A ON A.matricula = r.matricula
    WHERE ${where}
    ORDER BY r.fecha DESC, r.folio DESC
  `, params)

  const rows = rawRows.filter(row => (
    !isOutOfScopeForPlantelCiclo(row.gradoBase, row.scopePlantel, row.cicloBase, cicloKey)
  ))

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
    resumen: {
      total,
      transacciones: rows.length,
      alumnos: Array.from(alumnos).filter(Boolean).length,
      formasPago,
      planteles
    }
  }
})
