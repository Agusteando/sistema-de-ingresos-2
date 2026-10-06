import { assertAuroraExternalApiToken } from '../../../../../utils/external-api-auth'
import { getDbTransport, runWithBridgeAgentId } from '../../../../../utils/db'
import { readPm1152Ledger } from '../pm1152.get'
import { reconcilePm1152 } from '../../../../../utils/pm1152-reconciliation'
import { refreshTalleresAfterCommittedWrite } from '../../../../../utils/financial-write-followup'

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  if (Date.now() >= Date.parse('2026-10-08T06:00:00Z')) throw createError({ statusCode: 410, message: 'La ventana de corrección de este incidente terminó.' })
  const body = await readBody(event)
  if (body?.action !== 'apply' || !/^[a-f0-9]{64}$/.test(String(body?.expectedFingerprint || ''))) {
    throw createError({ statusCode: 400, message: 'Se requiere la acción explícita y la huella de la evidencia.' })
  }
  return await runWithBridgeAgentId(getDbTransport() === 'bridge' ? 'PM' : undefined, async () => {
    const ledger = await readPm1152Ledger(event)
    const result = await reconcilePm1152(ledger, body.expectedFingerprint, event.context.auroraRequestId || '')
    const after = await readPm1152Ledger(event)
    // Retain the surviving service membership; cancelling a duplicate must not
    // remove the valid canonical TE subscription from Control Escolar.
    const snapshotRefresh = await refreshTalleresAfterCommittedWrite({ plantel: 'PM', ciclo: '2026', shouldRefresh: result.applied, documento: result.canonical, requestId: event.context.auroraRequestId })
    return { ok: true, version: 'pm1152-reconciled-v1', ...result, requestId: event.context.auroraRequestId || null, snapshotRefresh, after }
  })
})
