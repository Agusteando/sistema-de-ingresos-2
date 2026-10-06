import { runWithBridgeAgentId, query, type SqlStatement } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { isWholeMoney } from '../../utils/monto-final'
import { normalizeBecaTypes } from '../../utils/becaTypes'
import { appendConceptMappedServicioToMatricula } from '../../utils/talleres-servicios'
import { assertStockAvailableForConcept } from '../../utils/conceptos-stock'
import { resolveFinancialConcept } from '../../utils/financial-concept'
import { createDocumentWithRequest } from '../../utils/document-creation'
import { refreshTalleresAfterCommittedWrite } from '../../utils/financial-write-followup'
import { documentMonthsFromStart, parseDocumentMonths, serializeDocumentMonths } from '../../../shared/utils/documentMonths'

const clampMotivo = (value: unknown) => {
  const text = String(value || '').trim()
  return text ? text.slice(0, 1200) : null
}


export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  const cicloKey = normalizeCicloKey(body.ciclo)
  const user = event.context.user

  const [studentRef] = await query<any[]>(
    `SELECT plantel FROM base WHERE matricula = ? LIMIT 1`,
    [body.matricula]
  )

  if (!studentRef) {
    throw createError({ statusCode: 404, message: 'Alumno no encontrado.' })
  }

  const conceptoRef = await resolveFinancialConcept({
    conceptoId: body.conceptoId,
    ciclo: cicloKey,
  })
  const conceptoNombre = conceptoRef.concepto
  const eventual = Boolean(conceptoRef.eventual)
  const configuredMonths = eventual ? [1] : parseDocumentMonths(conceptoRef.plazo, 1)
  const requestedStartMonth = eventual
    ? 1
    : Number.parseInt(String(body.mesInicio ?? configuredMonths[0] ?? 1), 10)

  if (!eventual && (!Number.isInteger(requestedStartMonth) || !configuredMonths.includes(requestedStartMonth))) {
    throw createError({ statusCode: 400, message: 'El mes de inicio no pertenece al periodo configurado para este concepto.' })
  }

  const documentMonths = eventual
    ? [1]
    : documentMonthsFromStart(configuredMonths, requestedStartMonth)
  const meses = documentMonths.length
  const plazoLegacy = serializeDocumentMonths(documentMonths)
  const costo = Number(body.costo || 0)
  const montoFinal = Number(body.montoFinal)
  const { selected: becaTipos, invalid: invalidBecaTipos } = normalizeBecaTypes(body.becaTipos)
  if (invalidBecaTipos.length) {
    throw createError({ statusCode: 400, message: `Tipo de beca inválido: ${invalidBecaTipos.join(', ')}` })
  }
  const becaTiposCsv = becaTipos.join(', ') || null
  const becaMotivo = clampMotivo(body.becaMotivo)
  const becaMonto = Math.max(0, costo - montoFinal)
  const becaPorcentaje = costo > 0 ? Number(((becaMonto * 100) / costo).toFixed(2)) : 0

  if (!isWholeMoney(montoFinal)) {
    throw createError({ statusCode: 400, message: 'El monto final debe ser un numero entero, sin decimales.' })
  }

  if (becaTipos.length && montoFinal > costo) {
    throw createError({ statusCode: 400, message: 'El monto final no puede ser mayor al costo del concepto cuando se registra una beca.' })
  }

  const userName = user?.name || 'Sistema'
  const plantel = studentRef.plantel || user?.active_plantel || 'PT'
  const cartaFecha = body.generarCartaBeca && becaTipos.length ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null

  const documentStatement: SqlStatement = {
    sql: `
      INSERT INTO documentos (
        concepto, conceptoNombre, matricula, costo, montoFinal, plazo, meses,
        beca, becaNombre, becaTipos, becaMotivo, becaMonto, becaPorcentaje,
        becaCartaGenerada, becaCartaFecha, ciclo, eventual, responsable, estatus
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Admin', 'Activo')
    `,
    params: [
      conceptoRef.id,
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
      cartaFecha,
      cicloKey,
      eventual ? 1 : 0
    ]
  }

  const { documento, replayed } = await createDocumentWithRequest({
    statement: documentStatement,
    requestKey: body.requestKey,
    payload: { matricula: body.matricula, ciclo: cicloKey, concepto: conceptoRef.id, costo, montoFinal,
      plazo: plazoLegacy, eventual, becaTipos: becaTiposCsv, becaMotivo, carta: Boolean(body.generarCartaBeca) },
    matricula: body.matricula, ciclo: cicloKey, actor: user?.email || userName,
    requestId: event.context.auroraRequestId || '',
    beforeCreate: () => assertStockAvailableForConcept({ conceptoId: conceptoRef.id, plantel, quantity: 1, operation: 'crear este cargo' }),
  })

  if (!documento) {
    throw createError({ statusCode: 500, message: 'No se pudo confirmar el documento creado.' })
  }

  let servicioSync: any = { ok: true, mapped: false, changed: false, servicio: null }
  try {
    servicioSync = await appendConceptMappedServicioToMatricula({
      matricula: body.matricula,
      conceptoId: conceptoRef.id,
      ciclo: cicloKey,
      plantel,
      userEmail: user?.email || userName,
    })
  } catch (error: any) {
    console.warn('[Documentos] Documento creado; no se pudo anexar taller/servicio a matricula.servicio.', {
      documento,
      matricula: body.matricula,
      conceptoId: conceptoRef.id,
      message: error?.message || error
    })
    servicioSync = { ok: false, mapped: false, changed: false, servicio: null, message: error?.message || 'servicio_sync_failed' }
  }

  const snapshotRefresh = await refreshTalleresAfterCommittedWrite({
    plantel, ciclo: cicloKey, documento, requestId: event.context.auroraRequestId,
    shouldRefresh: Boolean(servicioSync?.mapped || servicioSync?.ok === false),
  })
  console.info('[Documentos] Alta confirmada', { documento, replayed, matricula: body.matricula,
    requestKey: body.requestKey || null, requestId: event.context.auroraRequestId || null })

  return {
    success: true,
    documento,
    replayed,
    requestId: event.context.auroraRequestId || null,
    mesesAplicables: eventual ? ['ev'] : documentMonths,
    mesInicio: eventual ? null : documentMonths[0],
    servicio: servicioSync,
    snapshotRefresh,
    becaCartaUrl: body.generarCartaBeca && becaTipos.length
      ? `/api/documentos/${documento}/beca-carta?ciclo=${encodeURIComponent(cicloKey)}`
      : null
  }
}))
