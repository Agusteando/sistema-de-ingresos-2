import dayjs from 'dayjs'
import { executeStatementTransaction, query, type SqlStatement } from '../../utils/db'
import { numeroALetras } from '../../utils/numberToWords'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { isOutOfScopeForPlantelCiclo } from '../../../shared/utils/grado'
import { isWholeMoney, parseNullableMoney } from '../../utils/monto-final'

const normalizePaymentMethod = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const toMesNumber = (value: unknown) => {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'ev') return 1
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { matricula, pagos, formaDePago, ciclo = '2025', lateFeeActive = true } = body
  const cicloKey = normalizeCicloKey(ciclo)
  const user = event.context.user

  if (!matricula || !pagos || !pagos.length) {
    throw createError({ statusCode: 400, message: 'Faltan parámetros obligatorios.' })
  }

  if (normalizePaymentMethod(formaDePago) === 'depuracion') {
    throw createError({ statusCode: 400, message: 'La depuración requiere autorización por código.' })
  }

  const [studentRef] = await query<any[]>(
    `SELECT * FROM base WHERE matricula = ? LIMIT 1`,
    [matricula]
  )

  if (!studentRef) {
    throw createError({ statusCode: 404, message: 'Alumno no encontrado.' })
  }

  const nombreCompleto = studentRef.nombreCompleto
  const plantel = studentRef.plantel || 'PT'

  if (user.role !== 'global' || (user.role === 'global' && user.active_plantel !== 'GLOBAL')) {
    if (String(plantel || '') !== String(user.active_plantel || '')) {
      throw createError({ statusCode: 403, message: 'Alumno fuera del plantel activo.' })
    }
  }

  if (isOutOfScopeForPlantelCiclo(studentRef.grado, plantel, studentRef.ciclo, cicloKey)) {
    throw createError({ statusCode: 409, message: 'Alumno fuera del alcance del plantel para este ciclo.' })
  }

  const instituto = (plantel === 'PT' || plantel === 'PM' || plantel === 'SM') ? 1 : 0
  const statements: SqlStatement[] = []
  const finalAmountByTarget = new Map<string, number>()
  const today = dayjs()

  for (const p of pagos) {
    const requestedAmount = Number(p.montoPagado || 0)
    if (requestedAmount <= 0) continue

    const documento = Number(p.documento)
    const mes = String(p.mes || '').trim()
    if (!documento || !mes) {
      throw createError({ statusCode: 400, message: 'Cada pago debe apuntar a un documento y mes.' })
    }

    const [doc] = await query<any[]>(`
      SELECT documento, matricula, costo, montoFinal, meses, plazo, beca, ciclo, conceptoNombre, eventual, estatus
      FROM documentos
      WHERE documento = ? AND matricula = ? AND ciclo = ? AND estatus = 'Activo'
      LIMIT 1
    `, [documento, matricula, cicloKey])

    if (!doc) {
      throw createError({ statusCode: 409, message: 'El pago contiene un documento que no existe para este alumno.' })
    }

    const mesNumber = toMesNumber(mes)
    const [period] = await query<any[]>(`
      SELECT id, documento, start_mes, end_mes, concepto_id, conceptoNombre, costo, montoFinal, accion, estatus
      FROM documento_concepto_periodos
      WHERE documento = ?
        AND estatus = 'Activo'
        AND start_mes <= ?
        AND (end_mes IS NULL OR end_mes >= ?)
      ORDER BY start_mes DESC, id DESC
      LIMIT 1
    `, [documento, mesNumber, mesNumber])

    if (period?.accion === 'cancelacion') {
      throw createError({ statusCode: 409, message: 'El pago contiene un concepto cancelado.' })
    }

    const periodIsChangedConcept = period?.accion === 'cambio'
    const targetKey = periodIsChangedConcept ? `period:${period.id}` : `doc:${doc.documento}`
    let finalAmount = periodIsChangedConcept ? parseNullableMoney(period.montoFinal) : parseNullableMoney(doc.montoFinal)

    if (finalAmount === null && finalAmountByTarget.has(targetKey)) {
      finalAmount = finalAmountByTarget.get(targetKey) as number
    }

    if (finalAmount === null) {
      if (!isWholeMoney(p.montoFinal)) {
        throw createError({ statusCode: 400, message: 'Define el monto final sin decimales antes de registrar el pago.' })
      }
      finalAmount = Number(p.montoFinal)
      finalAmountByTarget.set(targetKey, finalAmount)
      statements.push(periodIsChangedConcept
        ? {
            sql: `UPDATE documento_concepto_periodos SET montoFinal = ? WHERE id = ? AND montoFinal IS NULL`,
            params: [finalAmount, period.id]
          }
        : {
            sql: `UPDATE documentos SET montoFinal = ? WHERE documento = ? AND montoFinal IS NULL`,
            params: [finalAmount, doc.documento]
          })
    }

    const pagosDelMes = await query<any[]>(`
      SELECT monto, recargo, formaDePago, depurado
      FROM referenciasdepago
      WHERE matricula = ?
        AND documento = ?
        AND ciclo = ?
        AND estatus = 'Vigente'
        AND (mes = ? OR mes = ?)
    `, [matricula, documento, cicloKey, mes, String(mesNumber)])

    const resuelto = pagosDelMes.reduce((sum, row) => sum + Number(row.monto || 0), 0)
    let subtotal = Number(finalAmount)
    let saldoAntes = Math.max(0, subtotal - resuelto)

    const isEventual = String(doc.eventual) === '1'
    const hasRecargoManual = pagosDelMes.some(row => String(row.recargo) === '1')
    const monthOffset = mesNumber > 5 ? (mesNumber - 6) : (mesNumber + 6)
    const limitDate = dayjs().year(today.year()).month(monthOffset).date(12)
    const isLate = today.isAfter(limitDate)

    if (String(lateFeeActive) !== 'false' && !isEventual && (hasRecargoManual || (isLate && saldoAntes > 10))) {
      subtotal = Math.trunc(Number(finalAmount) * 1.1)
      saldoAntes = Math.max(0, subtotal - resuelto)
    }

    if (requestedAmount > saldoAntes + 0.009) {
      throw createError({ statusCode: 400, message: 'El monto excede el saldo del documento seleccionado.' })
    }

    const montoDecimal = Number(requestedAmount.toFixed(2))
    const letra = numeroALetras(montoDecimal)
    const conceptoNombre = period?.conceptoNombre || doc.conceptoNombre

    statements.push({
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
          estatus
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        matricula,
        documento,
        mes,
        p.mesLabel,
        nombreCompleto,
        String(documento),
        conceptoNombre,
        montoDecimal,
        letra,
        subtotal,
        saldoAntes,
        Math.max(0, saldoAntes - montoDecimal),
        resuelto,
        resuelto + montoDecimal,
        subtotal > Number(finalAmount) ? 1 : 0,
        user?.name || 'Sistema',
        formaDePago,
        plantel,
        instituto,
        cicloKey,
        'Vigente'
      ]
    })
  }

  if (!statements.some(statement => /INSERT INTO referenciasdepago/i.test(statement.sql))) {
    throw createError({ statusCode: 400, message: 'No hay pagos validos para registrar.' })
  }

  const results = await executeStatementTransaction<any>(statements)
  const resultFolios = results.map(result => Number(result.insertId)).filter(Boolean)

  return { success: true, folios: resultFolios }
})
