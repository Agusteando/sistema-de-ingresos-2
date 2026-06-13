import { runWithBridgeAgentId, query, executeStatementTransaction, type SqlStatement } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { isInProjectedPlantelScopeForCiclo } from '../../../shared/utils/grado'
import { isWholeMoney } from '../../utils/monto-final'
import { normalizeBecaTypes } from '../../utils/becaTypes'
import { numeroALetras } from '../../utils/numberToWords'
import { appendConceptMappedServicioToMatricula } from '../../utils/talleres-servicios'

const clampMotivo = (value: unknown) => {
  const text = String(value || '').trim()
  return text ? text.slice(0, 1200) : null
}


const truthyFlag = (value: unknown) => ['1', 'true', 'si', 'sí', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())

const parsePositiveMoney = (value: unknown) => {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 0
  return Math.max(0, Number(amount.toFixed(2)))
}

const spanishMonths = [
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  'Enero', 'Febrero', 'Marzo', 'Abril',
  'Mayo', 'Junio', 'Julio', 'Agosto'
]

const buildDepuracionPeriods = (meses: number, eventual: boolean) => {
  if (eventual) return [{ mes: 'ev', mesLabel: 'Cargo Único' }]

  return Array.from({ length: meses }, (_, index) => ({
    mes: String(index + 1),
    mesLabel: spanishMonths[index] || `Mensualidad ${index + 1}`
  }))
}

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  const cicloKey = normalizeCicloKey(body.ciclo)
  const user = event.context.user

  const [studentRef] = await query<any[]>(
    `SELECT matricula, nombreCompleto, plantel, nivel as nivelBase, grado as gradoBase, ciclo as cicloBase FROM base WHERE matricula = ? LIMIT 1`,
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

  const pagoRealizadoEnOtroPlantel = truthyFlag(body.pagoRealizadoEnOtroPlantel)
  const eventual = truthyFlag(body.eventual)
  const userName = user?.name || 'Sistema'
  const plantel = studentRef.plantel || user?.active_plantel || 'PT'
  const instituto = (plantel === 'PT' || plantel === 'PM' || plantel === 'SM') ? 1 : 0
  const cartaFecha = body.generarCartaBeca && becaTipos.length ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null
  let depuracionMontoSolicitado = 0
  let depuracionTotalDocumento = 0

  if (pagoRealizadoEnOtroPlantel && montoFinal > 0) {
    const periods = buildDepuracionPeriods(meses, eventual)
    depuracionTotalDocumento = Number((montoFinal * periods.length).toFixed(2))
    depuracionMontoSolicitado = body.montoPagadoOtroPlantel == null
      ? depuracionTotalDocumento
      : parsePositiveMoney(body.montoPagadoOtroPlantel)

    if (depuracionMontoSolicitado <= 0) {
      throw createError({ statusCode: 400, message: 'Ingresa el monto pagado en otro plantel.' })
    }

    if (depuracionMontoSolicitado > depuracionTotalDocumento + 0.009) {
      throw createError({ statusCode: 400, message: 'El monto pagado en otro plantel no puede ser mayor al total del documento.' })
    }
  }

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
      cartaFecha,
      cicloKey,
      eventual ? 1 : 0
    ]
  }

  const [documentResult] = await executeStatementTransaction<any>([documentStatement])
  const documento = Number(documentResult?.insertId || 0)

  if (!documento) {
    throw createError({ statusCode: 500, message: 'No se pudo confirmar el documento creado.' })
  }

  let depuracionMontoAplicado = 0
  let depuracionSaldoPendiente = 0
  let depuracionReferencias = 0

  if (pagoRealizadoEnOtroPlantel && montoFinal > 0) {
    const periods = buildDepuracionPeriods(meses, eventual)
    const totalDocumento = depuracionTotalDocumento || Number((montoFinal * periods.length).toFixed(2))
    let remainingDepuracion = depuracionMontoSolicitado || totalDocumento
    const referenceRows = [] as Array<{ period: { mes: string, mesLabel: string }, amount: number }>

    for (const period of periods) {
      if (remainingDepuracion <= 0.009) break
      const amount = Number(Math.min(montoFinal, remainingDepuracion).toFixed(2))
      if (amount <= 0) continue
      referenceRows.push({ period, amount })
      remainingDepuracion = Number((remainingDepuracion - amount).toFixed(2))
    }

    depuracionMontoAplicado = Number(referenceRows.reduce((sum, row) => sum + row.amount, 0).toFixed(2))
    depuracionSaldoPendiente = Number(Math.max(0, totalDocumento - depuracionMontoAplicado).toFixed(2))
    depuracionReferencias = referenceRows.length

    if (!referenceRows.length) {
      throw createError({ statusCode: 400, message: 'No hay monto pagado en otro plantel para registrar.' })
    }

    const valueGroups = referenceRows.map(() => `(
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NULL, NULL
    )`).join(',')
    const referenceParams = referenceRows.flatMap(({ period, amount }) => {
      const saldoDespues = Number(Math.max(0, montoFinal - amount).toFixed(2))
      return [
        body.matricula,
        documento,
        period.mes,
        period.mesLabel,
        studentRef.nombreCompleto || body.matricula,
        String(body.conceptoId),
        conceptoNombre,
        amount,
        numeroALetras(amount),
        montoFinal,
        montoFinal,
        saldoDespues,
        0,
        amount,
        0,
        userName,
        'Pago realizado en otro plantel',
        plantel,
        instituto,
        cicloKey,
        'Vigente',
        1,
        userName,
        new Date()
      ]
    })

    try {
      await executeStatementTransaction([{
        sql: `
          INSERT INTO referenciasdepago (
            matricula,
            documento,
            mes,
            mesReal,
            nombreCompleto,
            concepto,
            conceptoNombre,
            monto,
            montoLetra,
            importeTotal,
            saldoAntes,
            saldoDespues,
            pagos,
            pagosDespues,
            recargo,
            usuario,
            formaDePago,
            plantel,
            instituto,
            ciclo,
            estatus,
            depurado,
            depurado_por,
            depurado_fecha,
            fecha,
            fecha_original,
            fecha_modificada_at,
            fecha_modificada_por
          ) VALUES ${valueGroups}
        `,
        params: referenceParams
      }])
    } catch (error: any) {
      try {
        await query(
          `DELETE FROM documentos
           WHERE documento = ?
             AND matricula = ?
             AND ciclo = ?
             AND NOT EXISTS (SELECT 1 FROM referenciasdepago WHERE documento = ?)`,
          [documento, body.matricula, cicloKey, documento]
        )
      } catch (cleanupError: any) {
        console.warn('[Documentos] No se pudo revertir documento tras fallo de depuración por otro plantel.', {
          documento,
          matricula: body.matricula,
          message: cleanupError?.message || cleanupError
        })
      }

      throw createError({
        statusCode: 500,
        message: 'No se pudo registrar el pago realizado en otro plantel. El documento no fue confirmado; vuelve a intentar.',
        cause: error
      })
    }
  }
  
  let servicioSync: any = { ok: true, mapped: false, changed: false, servicio: null }
  try {
    servicioSync = await appendConceptMappedServicioToMatricula({
      matricula: body.matricula,
      conceptoId: body.conceptoId,
      ciclo: cicloKey,
      plantel,
      userEmail: user?.email || userName,
    })
  } catch (error: any) {
    console.warn('[Documentos] Documento creado; no se pudo anexar taller/servicio a matricula.servicio.', {
      documento,
      matricula: body.matricula,
      conceptoId: body.conceptoId,
      message: error?.message || error
    })
    servicioSync = { ok: false, mapped: false, changed: false, servicio: null, message: error?.message || 'servicio_sync_failed' }
  }

  return {
    success: true,
    documento,
    depurado: pagoRealizadoEnOtroPlantel && depuracionMontoAplicado > 0,
    depuradoMonto: depuracionMontoAplicado,
    depuradoSaldoPendiente: depuracionSaldoPendiente,
    depuradoParcial: pagoRealizadoEnOtroPlantel && depuracionMontoAplicado > 0 && depuracionSaldoPendiente > 0,
    depuradoReferencias: depuracionReferencias,
    servicio: servicioSync,
    becaCartaUrl: body.generarCartaBeca && becaTipos.length
      ? `/api/documentos/${documento}/beca-carta?ciclo=${encodeURIComponent(cicloKey)}`
      : null
  }
}))
