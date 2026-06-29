import { executeStatementTransaction, query, runWithBridgeAgentId, type SqlStatement } from '../../../utils/db'
import { normalizeCicloKey } from '../../../../shared/utils/ciclo'
import { assertStockAvailableForConcept } from '../../../utils/conceptos-stock'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const user = event.context.user

  if (!user?.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'Solo super admin puede cambiar el concepto de un documento.' })
  }

  const documento = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const conceptoId = Number(body?.conceptoId)
  const cicloKey = normalizeCicloKey(body?.ciclo)

  if (!documento || !conceptoId) {
    throw createError({ statusCode: 400, message: 'Documento y concepto requeridos.' })
  }

  const [doc] = await query<any[]>(`
    SELECT
      D.documento,
      D.matricula,
      D.concepto,
      D.conceptoNombre,
      D.ciclo,
      D.estatus,
      B.plantel
    FROM documentos D
    LEFT JOIN base B ON B.matricula = D.matricula
    WHERE D.documento = ?
    LIMIT 1
  `, [documento])

  if (!doc) {
    throw createError({ statusCode: 404, message: 'Documento no encontrado.' })
  }

  if (String(doc.estatus || '').toLowerCase() !== 'activo') {
    throw createError({ statusCode: 409, message: 'El documento no esta activo.' })
  }

  const effectiveCiclo = normalizeCicloKey(doc.ciclo || cicloKey)

  const [activePeriod] = await query<any[]>(`
    SELECT id
    FROM documento_concepto_periodos
    WHERE documento = ? AND estatus = 'Activo'
    LIMIT 1
  `, [documento])

  if (activePeriod) {
    throw createError({
      statusCode: 409,
      message: 'Este documento tiene ajustes por mes. Use Ajustar concepto para conservar el historial.',
    })
  }

  const [concepto] = await query<any[]>(`
    SELECT id, concepto
    FROM conceptos
    WHERE id = ? AND ciclo = ?
    LIMIT 1
  `, [conceptoId, effectiveCiclo])

  if (!concepto) {
    throw createError({ statusCode: 404, message: 'Concepto no encontrado para el ciclo del documento.' })
  }

  if (String(doc.concepto) === String(concepto.id) && String(doc.conceptoNombre || '') === String(concepto.concepto || '')) {
    return { success: true, unchanged: true, documento }
  }

  await assertStockAvailableForConcept({ conceptoId: concepto.id, plantel: doc.plantel, quantity: 1, operation: 'cambiar a este concepto' })

  const pagos = await query<any[]>(`
    SELECT folio
    FROM referenciasdepago
    WHERE documento = ?
    ORDER BY folio ASC
  `, [documento])

  const folios = pagos.map((row) => String(row.folio)).filter(Boolean)
  const foliosText = folios.join(',')
  const affectedRefs = folios.length
  const usuario = user?.name || user?.email || 'Sistema'

  const statements: SqlStatement[] = [
    {
      sql: `
        INSERT INTO documento_concepto_correcciones (
          documento,
          matricula,
          ciclo,
          concepto_anterior,
          concepto_nombre_anterior,
          concepto_nuevo,
          concepto_nombre_nuevo,
          referencias_afectadas,
          folios_afectados,
          usuario
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        documento,
        doc.matricula,
        effectiveCiclo,
        doc.concepto,
        doc.conceptoNombre,
        concepto.id,
        concepto.concepto,
        affectedRefs,
        foliosText,
        usuario,
      ],
    },
    {
      sql: `UPDATE documentos SET concepto = ?, conceptoNombre = ? WHERE documento = ?`,
      params: [concepto.id, concepto.concepto, documento],
    },
    {
      sql: `UPDATE referenciasdepago SET concepto = ?, conceptoNombre = ? WHERE documento = ?`,
      params: [concepto.id, concepto.concepto, documento],
    },
  ]

  await executeStatementTransaction(statements)

  return {
    success: true,
    documento,
    concepto: concepto.id,
    conceptoNombre: concepto.concepto,
    referenciasAfectadas: affectedRefs,
  }
}))
