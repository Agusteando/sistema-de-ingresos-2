import { controlEscolarCentralQuery, getCentralTableColumns } from '../utils/control-escolar-central'
import { query, getDbTransport } from '../utils/db'
import { isLocalSystemRuntime } from '../utils/local-system-manager'
import { clearQueuedStudentRestore, readQueuedStudentRestores, isCentralTransportFailure } from '../utils/local-student-restore-outbox'
import { plantelCandidatesForProjectedScope } from '../../shared/utils/grado'

const key = '__auroraLocalRestoreReconciler'
const globalState = globalThis as typeof globalThis & { [key]?: ReturnType<typeof setTimeout> }

export default defineNitroPlugin((nitroApp) => {
  if (!isLocalSystemRuntime() || getDbTransport() !== 'direct' || globalState[key]) return
  let closed = false
  const run = async () => {
    if (closed) return
    try {
      for (const pending of await readQueuedStudentRestores()) {
        try {
          const local = await query<any[]>(
            'SELECT estatus, plantel FROM base WHERE UPPER(TRIM(matricula)) = ? LIMIT 1', [pending.matricula]
          )
          if (!local[0] || String(local[0].estatus || '').toLowerCase().trim() !== 'activo') {
            // A new local withdrawal supersedes the old offline restoration.
            console.warn('[AuroraLocalRestoreOutbox]', { event: 'local-status-conflict', matricula: pending.matricula, plantel: pending.plantel })
            continue
          }
          const allowed = plantelCandidatesForProjectedScope(pending.plantel)
          if (!allowed.includes(String(local[0].plantel || '').trim().toUpperCase())) continue
          const centralColumns = await getCentralTableColumns('matricula')
          const revisionColumn = ['updated_at', 'fecha_actualizacion', 'fecha_modificacion'].find(column => centralColumns.has(column))
          const revisionSelect = revisionColumn ? `, \`${revisionColumn}\` AS revision_at` : ''
          const rows = await controlEscolarCentralQuery<any[]>(
            `SELECT matricula, plantel, baja, motivo_baja, categoria_baja, seguimiento_baja${revisionSelect} FROM matricula WHERE UPPER(TRIM(matricula)) = ? LIMIT 1`,
            [pending.matricula]
          )
          const central = rows[0]
          if (!central || !allowed.includes(String(central.plantel || '').trim().toUpperCase())) {
            console.warn('[AuroraLocalRestoreOutbox]', { event: 'central-scope-conflict', matricula: pending.matricula })
            continue
          }
          if (Number(central.baja || 0) === 0) {
            await clearQueuedStudentRestore(pending.matricula, pending.plantel)
            continue
          }
          // If a newer withdrawal was recorded centrally, never revert it.
          if (revisionColumn && central.revision_at && new Date(central.revision_at).getTime() > new Date(pending.requestedAt).getTime()) {
            console.warn('[AuroraLocalRestoreOutbox]', { event: 'central-newer-than-intent', matricula: pending.matricula })
            continue
          }
          const revisionGuard = revisionColumn && central.revision_at ? ` AND \`${revisionColumn}\` <=> ?` : ''
          const changed = await controlEscolarCentralQuery<any>(
            `UPDATE matricula SET baja = 0, motivo_baja = NULL, categoria_baja = NULL, seguimiento_baja = NULL
             WHERE UPPER(TRIM(matricula)) = ? AND plantel = ? AND baja = ?
             AND (motivo_baja <=> ?) AND (categoria_baja <=> ?) AND (seguimiento_baja <=> ?)${revisionGuard}`,
            [pending.matricula, central.plantel, central.baja, central.motivo_baja ?? null, central.categoria_baja ?? null, central.seguimiento_baja ?? null, ...(revisionGuard ? [central.revision_at] : [])]
          )
          if (Number(changed?.affectedRows || 0) !== 1) {
            console.warn('[AuroraLocalRestoreOutbox]', { event: 'central-concurrent-change', matricula: pending.matricula })
            continue
          }
          await clearQueuedStudentRestore(pending.matricula, pending.plantel)
          console.info('[AuroraLocalRestoreOutbox]', { event: 'central-reconciled', matricula: pending.matricula, plantel: pending.plantel })
        } catch (error) {
          console.warn('[AuroraLocalRestoreOutbox]', { event: 'retry-pending', matricula: pending.matricula, message: String((error as Error)?.message || error) })
          // Do not retry the rest of the queue against a known disconnected server.
          if (isCentralTransportFailure(error)) break
        }
      }
    } catch (error) { console.error('[AuroraLocalRestoreOutbox]', { event: 'scan-failed', error: String((error as Error)?.message || error) }) }
    finally { if (!closed) { globalState[key] = setTimeout(run, 5 * 60 * 1000); globalState[key]?.unref?.() } }
  }
  globalState[key] = setTimeout(run, 30000)
  globalState[key]?.unref?.()
  nitroApp.hooks.hook('close', () => { closed = true; if (globalState[key]) clearTimeout(globalState[key]); delete globalState[key] })
})
