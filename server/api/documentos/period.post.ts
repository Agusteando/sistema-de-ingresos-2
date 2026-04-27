import { executeStatementTransaction, query, type SqlStatement } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'

const toMesNumber = (value: unknown) => {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'ev') return 1
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

const countPlazos = (doc: any) => {
  const raw = doc?.plazo || doc?.meses
  if (!raw) return 1
  const str = String(raw).trim()

  if (str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str)
      return Array.isArray(parsed) ? Math.max(1, parsed.length) : 1
    } catch (e) {
      return 1
    }
  }

  if (str.includes(',')) {
    return Math.max(1, str.split(',').filter(Boolean).length)
  }

  return Math.max(1, Number.parseInt(str, 10) || 1)
}

const hasPaymentsFrom = async (documento: number, fromMes?: number) => {
  const params: any[] = [documento]
  let monthWhere = ''

  if (fromMes) {
    monthWhere = `AND (CASE WHEN mes = 'ev' THEN 1 ELSE CAST(mes AS UNSIGNED) END) >= ?`
    params.push(fromMes)
  }

  const [payment] = await query<any[]>(
    `
      SELECT folio
      FROM referenciasdepago
      WHERE documento = ? AND estatus = 'Vigente' ${monthWhere}
      LIMIT 1
    `,
    params
  )

  return Boolean(payment)
}

const periodBoundaryStatements = (documento: number, fromMes: number): SqlStatement[] => ([
  {
    sql: `
      UPDATE documento_concepto_periodos
      SET estatus = 'Inactivo'
      WHERE documento = ? AND estatus = 'Activo' AND start_mes >= ?
    `,
    params: [documento, fromMes]
  },
  {
    sql: `
      UPDATE documento_concepto_periodos
      SET end_mes = ?
      WHERE documento = ?
        AND estatus = 'Activo'
        AND start_mes < ?
        AND (end_mes IS NULL OR end_mes >= ?)
    `,
    params: [fromMes - 1, documento, fromMes, fromMes]
  }
])

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const user = event.context.user
  const documento = Number(body.documento)
  const action = String(body.action || '').trim()
  const cicloKey = normalizeCicloKey(body.ciclo)
  const fromMes = toMesNumber(body.fromMes)

  if (!documento || !action) {
    throw createError({ statusCode: 400, message: 'Documento y accion requeridos.' })
  }

  const [doc] = await query<any[]>(
    `SELECT documento, ciclo, meses, plazo, estatus FROM documentos WHERE documento = ? LIMIT 1`,
    [documento]
  )

  if (!doc) {
    throw createError({ statusCode: 404, message: 'Documento no encontrado.' })
  }

  if (String(doc.estatus).toLowerCase() !== 'activo') {
    throw createError({ statusCode: 409, message: 'El documento no esta activo.' })
  }

  const maxMes = countPlazos(doc)
  const normalizedFromMes = Math.min(Math.max(1, fromMes), maxMes)

  if (action === 'cancel_full') {
    if (await hasPaymentsFrom(documento)) {
      throw createError({ statusCode: 409, message: 'No se puede cancelar completo porque existen pagos vigentes.' })
    }

    await executeStatementTransaction([
      {
        sql: `UPDATE documentos SET estatus = 'Cancelado' WHERE documento = ?`,
        params: [documento]
      },
      {
        sql: `UPDATE documento_concepto_periodos SET estatus = 'Inactivo' WHERE documento = ?`,
        params: [documento]
      }
    ])

    return { success: true, action }
  }

  if (await hasPaymentsFrom(documento, normalizedFromMes)) {
    throw createError({ statusCode: 409, message: 'Seleccione un mes posterior a los pagos vigentes para conservar el historial.' })
  }

  if (action === 'cancel_from') {
    await executeStatementTransaction([
      ...periodBoundaryStatements(documento, normalizedFromMes),
      {
        sql: `
          INSERT INTO documento_concepto_periodos (
            documento, start_mes, end_mes, accion, estatus, created_by
          ) VALUES (?, ?, NULL, 'cancelacion', 'Activo', ?)
        `,
        params: [documento, normalizedFromMes, user?.name || 'Sistema']
      }
    ])

    return { success: true, action, fromMes: normalizedFromMes }
  }

  if (action === 'change') {
    const conceptoId = Number(body.conceptoId)

    if (!conceptoId) {
      throw createError({ statusCode: 400, message: 'Seleccione el nuevo concepto.' })
    }

    const [concepto] = await query<any[]>(
      `SELECT id, concepto, costo FROM conceptos WHERE id = ? AND ciclo = ? LIMIT 1`,
      [conceptoId, cicloKey]
    )

    if (!concepto) {
      throw createError({ statusCode: 404, message: 'Concepto no encontrado para el ciclo activo.' })
    }

    await executeStatementTransaction([
      ...periodBoundaryStatements(documento, normalizedFromMes),
      {
        sql: `
          INSERT INTO documento_concepto_periodos (
            documento, start_mes, end_mes, concepto_id, conceptoNombre, costo, accion, estatus, created_by
          ) VALUES (?, ?, NULL, ?, ?, ?, 'cambio', 'Activo', ?)
        `,
        params: [
          documento,
          normalizedFromMes,
          concepto.id,
          concepto.concepto,
          Number(concepto.costo || 0),
          user?.name || 'Sistema'
        ]
      }
    ])

    return { success: true, action, fromMes: normalizedFromMes }
  }

  throw createError({ statusCode: 400, message: 'Accion no soportada.' })
})
