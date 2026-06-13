import {
  executeStatementTransaction,
  query,
  runWithBridgeAgentId,
  type SqlStatement,
} from '../../../utils/db'
import { isWholeMoney, legacyProjectedAmount } from '../../../utils/monto-final'
import { normalizeCicloKey } from '../../../../shared/utils/ciclo'
import { isInProjectedPlantelScopeForCiclo } from '../../../../shared/utils/grado'

const countDocumentPeriods = (doc: any) => {
  const raw = doc?.plazo || doc?.meses
  if (!raw) return 1
  const value = String(raw).trim()

  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? Math.max(1, parsed.length) : 1
    } catch {
      return 1
    }
  }

  if (value.includes(',')) {
    return Math.max(1, value.split(',').filter(Boolean).length)
  }

  return Math.max(1, Number.parseInt(value, 10) || 1)
}

const monthNumber = (value: unknown) => {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'ev') return 1
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

const normalizedReason = (value: unknown) => {
  const reason = String(value || '').trim().toLowerCase()
  const allowed = new Set([
    'beca_historica',
    'convenio_no_registrado',
    'monto_incorrecto',
    'otro',
  ])
  return allowed.has(reason) ? reason : ''
}

export default defineEventHandler(async (event) =>
  runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
    const user = event.context.user
    const documento = Number(getRouterParam(event, 'id'))
    const body = await readBody(event)
    const montoFinal = Number(body?.montoFinal)
    const motivo = normalizedReason(body?.motivo)

    if (!documento || !isWholeMoney(montoFinal) || montoFinal <= 0) {
      throw createError({
        statusCode: 400,
        message: 'Documento y monto mensual válido requeridos.',
      })
    }

    if (!motivo) {
      throw createError({
        statusCode: 400,
        message: 'Selecciona el motivo de la corrección.',
      })
    }

    const [doc] = await query<any[]>(
      `
        SELECT
          D.documento, D.matricula, D.concepto, D.conceptoNombre, D.costo,
          D.montoFinal, D.ciclo, D.meses, D.plazo, D.eventual, D.estatus,
          D.beca, D.becaMonto, D.becaPorcentaje,
          B.plantel, B.nivel AS nivelBase, B.grado AS gradoBase, B.ciclo AS cicloBase
        FROM documentos D
        LEFT JOIN base B ON B.matricula = D.matricula
        WHERE D.documento = ?
        LIMIT 1
      `,
      [documento],
    )

    if (!doc) {
      throw createError({ statusCode: 404, message: 'Documento no encontrado.' })
    }

    if (String(doc.estatus || '').trim().toLowerCase() !== 'activo') {
      throw createError({ statusCode: 409, message: 'El documento no está activo.' })
    }

    const totalMonths = countDocumentPeriods(doc)
    if (String(doc.eventual || '') === '1' || totalMonths <= 1) {
      throw createError({
        statusCode: 409,
        message: 'Esta corrección está disponible para documentos recurrentes.',
      })
    }

    const cicloKey = normalizeCicloKey(doc.ciclo)
    const scopedToPlantel = !user?.isSuperAdmin || user?.active_plantel !== 'GLOBAL'

    if (
      scopedToPlantel &&
      (!doc.plantel ||
        !isInProjectedPlantelScopeForCiclo(
          doc.gradoBase,
          doc.plantel,
          doc.cicloBase,
          cicloKey,
          doc.nivelBase,
          user?.active_plantel,
        ))
    ) {
      throw createError({
        statusCode: 403,
        message: 'Alumno fuera del alcance del plantel activo.',
      })
    }

    const payments = await query<any[]>(
      `
        SELECT mes, monto, depurado, formaDePago, folio
        FROM referenciasdepago
        WHERE documento = ?
          AND LOWER(TRIM(CAST(estatus AS CHAR))) = 'vigente'
        ORDER BY fecha ASC, folio ASC
      `,
      [documento],
    )

    const paymentsByMonth = new Map<number, number>()
    for (const payment of payments) {
      const month = monthNumber(payment?.mes)
      const amount = Number(payment?.monto || 0)
      if (!Number.isFinite(amount) || amount <= 0) continue
      paymentsByMonth.set(month, Number(((paymentsByMonth.get(month) || 0) + amount).toFixed(2)))
    }

    const minimumAllowed = Math.max(0, ...paymentsByMonth.values())
    if (montoFinal + 0.009 < minimumAllowed) {
      const blockingMonths = Array.from(paymentsByMonth.entries())
        .filter(([, paid]) => paid > montoFinal + 0.009)
        .map(([mes, paid]) => ({ mes, pagado: paid }))

      throw createError({
        statusCode: 409,
        message: `El monto no puede ser menor a $${minimumAllowed.toFixed(2)} porque ya existen pagos registrados.`,
        data: { minimumAllowed, blockingMonths },
      })
    }

    const periods = await query<any[]>(
      `
        SELECT id, start_mes, end_mes, concepto_id, conceptoNombre, costo, montoFinal, accion, estatus
        FROM documento_concepto_periodos
        WHERE documento = ?
          AND LOWER(TRIM(CAST(estatus AS CHAR))) = 'activo'
        ORDER BY start_mes ASC, id ASC
      `,
      [documento],
    )

    const activeMonths = Array.from({ length: totalMonths }, (_, index) => index + 1)
      .filter((month) => !periods.some((period) => {
        if (String(period?.accion || '').trim().toLowerCase() !== 'cancelacion') return false
        const start = Number(period.start_mes || 1)
        const end = period.end_mes == null ? Number.POSITIVE_INFINITY : Number(period.end_mes)
        return month >= start && month <= end
      }))

    const previousDocumentAmount = doc.montoFinal == null
      ? legacyProjectedAmount(doc.costo, doc.beca)
      : Number(doc.montoFinal)
    const activeChangePeriods = periods.filter(
      (period) => String(period?.accion || '').trim().toLowerCase() === 'cambio',
    )
    const previousAmounts = [
      previousDocumentAmount,
      ...activeChangePeriods.map((period) =>
        period.montoFinal == null
          ? legacyProjectedAmount(period.costo ?? doc.costo, doc.beca)
          : Number(period.montoFinal),
      ),
    ].filter((value) => Number.isFinite(value))

    const unchanged = previousAmounts.length > 0 && previousAmounts.every(
      (value) => Math.abs(Number(value) - montoFinal) < 0.009,
    )

    if (unchanged) {
      return {
        success: true,
        unchanged: true,
        documento,
        montoFinal,
      }
    }

    const costo = Number(doc.costo || 0)
    const becaMonto = Math.max(0, costo - montoFinal)
    const becaPorcentaje = costo > 0
      ? Number(((becaMonto * 100) / costo).toFixed(2))
      : 0
    const createdBy = user?.name || user?.email || 'Sistema'
    const paidTotal = Number(
      Array.from(paymentsByMonth.values())
        .reduce((sum, value) => sum + value, 0)
        .toFixed(2),
    )

    const statements: SqlStatement[] = [
      {
        sql: `
          UPDATE documentos
          SET montoFinal = ?, beca = ?, becaMonto = ?, becaPorcentaje = ?
          WHERE documento = ?
            AND LOWER(TRIM(CAST(estatus AS CHAR))) = 'activo'
        `,
        params: [
          montoFinal,
          String(becaPorcentaje),
          becaMonto,
          becaPorcentaje,
          documento,
        ],
      },
      {
        sql: `
          UPDATE documento_concepto_periodos
          SET montoFinal = ?
          WHERE documento = ?
            AND LOWER(TRIM(CAST(estatus AS CHAR))) = 'activo'
            AND LOWER(TRIM(CAST(accion AS CHAR))) = 'cambio'
        `,
        params: [montoFinal, documento],
      },
      {
        sql: `
          INSERT INTO documento_monto_correcciones (
            documento, matricula, ciclo, monto_anterior, monto_nuevo,
            mensualidades_afectadas, pago_maximo_mensual, pagos_totales,
            periodos_actualizados, motivo, detalle_anterior, usuario
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        params: [
          documento,
          doc.matricula,
          cicloKey,
          previousDocumentAmount,
          montoFinal,
          activeMonths.length,
          minimumAllowed,
          paidTotal,
          activeChangePeriods.length,
          motivo,
          JSON.stringify({
            documento: {
              montoFinal: doc.montoFinal,
              beca: doc.beca,
              becaMonto: doc.becaMonto,
              becaPorcentaje: doc.becaPorcentaje,
            },
            periodos: activeChangePeriods.map((period) => ({
              id: period.id,
              startMes: period.start_mes,
              endMes: period.end_mes,
              conceptoId: period.concepto_id,
              conceptoNombre: period.conceptoNombre,
              costo: period.costo,
              montoFinal: period.montoFinal,
            })),
          }),
          createdBy,
        ],
      },
    ]

    await executeStatementTransaction(statements)

    return {
      success: true,
      documento,
      montoAnterior: previousDocumentAmount,
      montoFinal,
      mensualidadesAfectadas: activeMonths.length,
      pagosTotales: paidTotal,
      pagoMaximoMensual: minimumAllowed,
      periodosActualizados: activeChangePeriods.length,
    }
  }),
)
