import { runWithBridgeAgentId, query } from '../../utils/db'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { syncCancelledConceptMappedServicioOnMatricula } from '../../utils/talleres-servicios'
import { ensureCurrentTalleresSnapshotPlantel } from '../../utils/talleres-snapshot'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const id = Number(event.context.params?.id)
  if (!id) {
    throw createError({ statusCode: 400, message: 'Identificador de documento no proporcionado.' })
  }

  const [doc] = await query<any[]>(
    `
      SELECT D.documento, D.matricula, D.concepto, D.ciclo, D.estatus, B.plantel
      FROM documentos D
      LEFT JOIN base B ON B.matricula = D.matricula
      WHERE D.documento = ?
      LIMIT 1
    `,
    [id]
  )

  if (!doc) {
    throw createError({ statusCode: 404, message: 'Documento no encontrado.' })
  }

  const [associatedPayment] = await query<any[]>(
    `
      SELECT folio
      FROM referenciasdepago
      WHERE documento = ? AND estatus = 'Vigente'
      LIMIT 1
    `,
    [id]
  )

  if (associatedPayment) {
    throw createError({ statusCode: 409, message: 'Bloqueo de eliminación: Existen pagos vigentes aplicados a este concepto.' })
  }

  const [activePeriod] = await query<any[]>(
    `
      SELECT concepto_id, accion
      FROM documento_concepto_periodos
      WHERE documento = ? AND estatus = 'Activo'
      ORDER BY start_mes DESC, id DESC
      LIMIT 1
    `,
    [id]
  )
  const previousConceptoId = String(activePeriod?.accion || '').toLowerCase() === 'cambio' && Number(activePeriod?.concepto_id || 0)
    ? Number(activePeriod.concepto_id)
    : Number(doc.concepto || 0)
  const cicloKey = normalizeCicloKey(doc.ciclo)

  await query(
    `UPDATE documentos SET estatus = 'Cancelado' WHERE documento = ?`,
    [id]
  )

  let servicioSync: any = { ok: true, mapped: false, changed: false, previousServicio: null }
  try {
    servicioSync = await syncCancelledConceptMappedServicioOnMatricula({
      matricula: doc.matricula,
      previousConceptoId,
      ciclo: cicloKey,
      plantel: doc.plantel,
      userEmail: event.context.user?.email || event.context.user?.name || 'Sistema',
    })
  } catch (error: any) {
    console.warn('[Documentos] Documento cancelado; no se pudo reconciliar Talleres.', {
      documento: id,
      matricula: doc.matricula,
      previousConceptoId,
      message: error?.message || error,
    })
    servicioSync = { ok: false, mapped: false, changed: false, previousServicio: null, message: error?.message || 'servicio_sync_failed' }
  }

  let snapshotRefresh: any = { success: true, skipped: true, reason: 'not_talleres_servicios' }
  if (servicioSync?.mapped || servicioSync?.previousServicio || servicioSync?.ok === false) {
    snapshotRefresh = await ensureCurrentTalleresSnapshotPlantel({ plantel: doc.plantel, ciclo: cicloKey, force: true })
  }

  return { success: true, servicio: servicioSync, snapshotRefresh }
}))
