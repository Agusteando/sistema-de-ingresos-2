import { query } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { isOutOfScopeForPlantelCiclo } from '../../../shared/utils/grado'
import { isWholeMoney } from '../../utils/monto-final'

const toMesNumber = (value: unknown) => {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'ev') return 1
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const user = event.context.user
  const documento = Number(body.documento)
  const montoFinal = Number(body.montoFinal)
  const cicloKey = normalizeCicloKey(body.ciclo)
  const mesNumber = toMesNumber(body.mes)

  if (!documento) throw createError({ statusCode: 400, message: 'Documento requerido.' })
  if (!isWholeMoney(montoFinal)) {
    throw createError({ statusCode: 400, message: 'El monto final debe ser un numero entero, sin decimales.' })
  }

  const [doc] = await query<any[]>(`
    SELECT
      D.documento, D.matricula, D.ciclo, D.estatus, D.montoFinal,
      B.plantel, B.grado as gradoBase, B.ciclo as cicloBase
    FROM documentos D
    LEFT JOIN base B ON B.matricula = D.matricula
    WHERE D.documento = ? AND D.ciclo = ?
    LIMIT 1
  `, [documento, cicloKey])

  if (!doc) throw createError({ statusCode: 404, message: 'Documento no encontrado.' })
  if (String(doc.estatus).toLowerCase() !== 'activo') {
    throw createError({ statusCode: 409, message: 'El documento no esta activo.' })
  }

  if (user.role !== 'global' || (user.role === 'global' && user.active_plantel !== 'GLOBAL')) {
    if (String(doc.plantel || '') !== String(user.active_plantel || '')) {
      throw createError({ statusCode: 403, message: 'Alumno fuera del plantel activo.' })
    }
  }

  if (isOutOfScopeForPlantelCiclo(doc.gradoBase, doc.plantel, doc.cicloBase, cicloKey)) {
    throw createError({ statusCode: 409, message: 'Alumno fuera del alcance del plantel para este ciclo.' })
  }

  const [period] = await query<any[]>(`
    SELECT id, accion, montoFinal
    FROM documento_concepto_periodos
    WHERE documento = ?
      AND estatus = 'Activo'
      AND start_mes <= ?
      AND (end_mes IS NULL OR end_mes >= ?)
    ORDER BY start_mes DESC, id DESC
    LIMIT 1
  `, [documento, mesNumber, mesNumber])

  if (period?.accion === 'cancelacion') {
    throw createError({ statusCode: 409, message: 'El cargo esta cancelado.' })
  }

  if (period?.accion === 'cambio') {
    if (period.montoFinal !== null && period.montoFinal !== undefined) {
      throw createError({ statusCode: 409, message: 'Este monto final ya fue definido.' })
    }
    const result = await query<any>(`
      UPDATE documento_concepto_periodos
      SET montoFinal = ?
      WHERE id = ? AND montoFinal IS NULL
    `, [montoFinal, period.id])
    if (!result?.affectedRows) throw createError({ statusCode: 409, message: 'Este monto final ya fue definido.' })
    return { success: true, target: 'periodo', montoFinal }
  }

  if (doc.montoFinal !== null && doc.montoFinal !== undefined) {
    throw createError({ statusCode: 409, message: 'Este monto final ya fue definido.' })
  }

  const result = await query<any>(`
    UPDATE documentos
    SET montoFinal = ?
    WHERE documento = ? AND montoFinal IS NULL
  `, [montoFinal, documento])

  if (!result?.affectedRows) throw createError({ statusCode: 409, message: 'Este monto final ya fue definido.' })

  return { success: true, target: 'documento', montoFinal }
})
