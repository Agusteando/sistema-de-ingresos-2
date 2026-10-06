import { ensureCurrentTalleresSnapshotPlantel } from './talleres-snapshot'

// A refresh failure must not turn an already committed financial write into a
// failed request. Report the pending follow-up explicitly so operators can retry
// synchronization without creating or cancelling the financial record again.
export const refreshTalleresAfterCommittedWrite = async (input: {
  plantel: unknown
  ciclo: string
  shouldRefresh: boolean
  documento: number
  requestId?: string
}) => {
  if (!input.shouldRefresh) return { success: true, skipped: true, reason: 'not_talleres_servicios' }
  try {
    return await ensureCurrentTalleresSnapshotPlantel({ plantel: input.plantel, ciclo: input.ciclo, force: true })
  } catch (error: any) {
    console.warn('[FinancialWrite] Documento confirmado; sincronización de Talleres pendiente', {
      documento: input.documento, requestId: input.requestId || null,
      plantel: input.plantel, ciclo: input.ciclo,
      code: error?.statusMessage || error?.code || 'TALLERES_REFRESH_FAILED',
    })
    return { success: false, pending: true, reason: 'committed_write_refresh_failed', requestId: input.requestId || null }
  }
}
