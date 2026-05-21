import { runWithBridgeAgentId, query } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { isInProjectedPlantelScopeForCiclo } from '../../../shared/utils/grado'
import { isWholeMoney } from '../../utils/monto-final'

const BECA_TYPE_OPTIONS = new Set([
  'coaborador',
  'dres',
  'hermanos',
  'promoción',
  'SEP mercadotecnia'
])

const normalizeBecaTypes = (value: unknown) => {
  const raw = Array.isArray(value)
    ? value
    : String(value || '').split(',')

  const selected = raw
    .map((item) => String(item || '').trim())
    .filter(Boolean)

  const invalid = selected.filter((item) => !BECA_TYPE_OPTIONS.has(item))
  if (invalid.length) {
    throw createError({ statusCode: 400, message: `Tipo de beca inválido: ${invalid.join(', ')}` })
  }

  return [...new Set(selected)]
}

const clampMotivo = (value: unknown) => {
  const text = String(value || '').trim()
  return text ? text.slice(0, 1200) : null
}

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  const cicloKey = normalizeCicloKey(body.ciclo)
  const user = event.context.user

  const [studentRef] = await query<any[]>(
    `SELECT matricula, plantel, nivel as nivelBase, grado as gradoBase, ciclo as cicloBase FROM base WHERE matricula = ? LIMIT 1`,
    [body.matricula]
  )

  if (!studentRef) {
    throw createError({ statusCode: 404, message: 'Alumno no encontrado.' })
  }

  const isScopedToActivePlantel = !user.isSuperAdmin || (user.isSuperAdmin && user.active_plantel !== 'GLOBAL')
  const isProjectedInScope = isInProjectedPlantelScopeForCiclo(
    studentRef.gradoBase,
    studentRef.plantel,
    studentRef.cicloBase,
    cicloKey,
    studentRef.nivelBase,
    isScopedToActivePlantel ? user.active_plantel : 'GLOBAL'
  )

  if (!isProjectedInScope) {
    throw createError({ statusCode: isScopedToActivePlantel ? 403 : 409, message: 'Alumno fuera del alcance del plantel para este ciclo.' })
  }
  
  const [conceptoRef] = await query<any[]>(`SELECT concepto FROM conceptos WHERE id = ?`, [body.conceptoId])
  const conceptoNombre = conceptoRef ? conceptoRef.concepto : 'Cargo'
  const meses = Math.max(1, Number(body.meses) || 1)
  const plazoLegacy = Array.from({ length: meses }, (_, i) => i + 1).join(',')
  const costo = Number(body.costo || 0)
  const montoFinal = Number(body.montoFinal)
  const becaTipos = normalizeBecaTypes(body.becaTipos)
  const becaTiposCsv = becaTipos.join(',') || null
  const becaMotivo = clampMotivo(body.becaMotivo)
  const becaMonto = Math.max(0, costo - montoFinal)
  const becaPorcentaje = costo > 0 ? Number(((becaMonto * 100) / costo).toFixed(2)) : 0

  if (!isWholeMoney(montoFinal)) {
    throw createError({ statusCode: 400, message: 'El monto final debe ser un numero entero, sin decimales.' })
  }

  if (becaTipos.length && montoFinal > costo) {
    throw createError({ statusCode: 400, message: 'El monto final no puede ser mayor al costo del concepto cuando se registra una beca.' })
  }

  const result = await query<any>(`
    INSERT INTO documentos (
      concepto, conceptoNombre, matricula, costo, montoFinal, plazo, meses,
      beca, becaNombre, becaTipos, becaMotivo, becaMonto, becaPorcentaje,
      becaCartaGenerada, becaCartaFecha, ciclo, eventual, responsable, estatus
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Admin', 'Activo')
  `, [
    body.conceptoId,
    conceptoNombre,
    body.matricula,
    costo,
    montoFinal,
    plazoLegacy,
    meses,
    String(becaPorcentaje || 0),
    becaTiposCsv,
    becaTiposCsv,
    becaMotivo,
    becaMonto,
    becaPorcentaje,
    body.generarCartaBeca && becaTipos.length ? 1 : 0,
    body.generarCartaBeca && becaTipos.length ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
    cicloKey,
    body.eventual ? 1 : 0
  ])
  
  return {
    success: true,
    documento: result.insertId,
    becaCartaUrl: body.generarCartaBeca && becaTipos.length
      ? `/api/documentos/${result.insertId}/beca-carta?ciclo=${encodeURIComponent(cicloKey)}`
      : null
  }
}))
