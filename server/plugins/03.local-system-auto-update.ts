import { normalizePlantel } from '../utils/auth-session'
import {
  isLocalSystemAutoUpdateEnabled,
  isLocalSystemRuntime,
  localSystemAutoUpdateIntervalMs,
  requestLocalSystemManager,
} from '../utils/local-system-manager'

type ManagerStatus = {
  updateAvailable?: boolean
  available?: { sha?: string } | null
  operation?: { running?: boolean; phase?: string } | null
}

type SchedulerState = {
  timer: ReturnType<typeof setTimeout> | null
  running: boolean
  lastAttemptSha: string
  lastFailureAt: number
}

const schedulerKey = '__auroraLocalAutoUpdateScheduler'
const globalState = globalThis as typeof globalThis & { [schedulerKey]?: SchedulerState }

const configuredPlantelMatchesAgent = () => {
  const localPlantel = normalizePlantel(process.env.LOCAL_SYSTEM_PLANTEL)
  const agentPlantel = normalizePlantel(process.env.AGENT_ID)
  return Boolean(localPlantel && agentPlantel && agentPlantel === localPlantel)
}

export default defineNitroPlugin((nitroApp) => {
  if (!isLocalSystemRuntime() || !isLocalSystemAutoUpdateEnabled() || !configuredPlantelMatchesAgent()) return
  if (globalState[schedulerKey]) return

  const state: SchedulerState = {
    timer: null,
    running: false,
    lastAttemptSha: '',
    lastFailureAt: 0,
  }
  globalState[schedulerKey] = state

  const intervalMs = localSystemAutoUpdateIntervalMs()
  const failureBackoffMs = Math.max(intervalMs, 15 * 60 * 1000)

  const schedule = (delay: number) => {
    if (state.timer) clearTimeout(state.timer)
    state.timer = setTimeout(run, delay)
    state.timer.unref?.()
  }

  const run = async () => {
    if (state.running) {
      schedule(intervalMs)
      return
    }

    state.running = true
    try {
      const status = await requestLocalSystemManager<ManagerStatus>('/status', { refresh: true })
      const targetSha = String(status?.available?.sha || '').trim()
      const operationRunning = Boolean(status?.operation?.running)
      if (!status?.updateAvailable || !targetSha || operationRunning) return

      const recentlyFailed = state.lastAttemptSha === targetSha
        && state.lastFailureAt > 0
        && Date.now() - state.lastFailureAt < failureBackoffMs
      if (recentlyFailed) return

      state.lastAttemptSha = targetSha
      state.lastFailureAt = 0
      try {
        await requestLocalSystemManager('/update', { method: 'POST' })
        console.info(`[LocalAutoUpdate] ${JSON.stringify({ event: 'accepted', targetSha })}`)
      } catch (error: any) {
        if (Number(error?.statusCode || error?.status || 0) !== 409) {
          state.lastFailureAt = Date.now()
          console.error(`[LocalAutoUpdate] ${JSON.stringify({
            event: 'failed',
            targetSha,
            message: String(error?.message || 'No se pudo iniciar la actualización automática.')
          })}`)
        }
      }
    } catch (error: any) {
      console.error(`[LocalAutoUpdate] ${JSON.stringify({
        event: 'status-failed',
        message: String(error?.message || 'No se pudo consultar la actualización disponible.')
      })}`)
    } finally {
      state.running = false
      schedule(intervalMs)
    }
  }

  schedule(Math.min(30000, intervalMs))

  nitroApp.hooks.hook('close', () => {
    if (state.timer) clearTimeout(state.timer)
    delete globalState[schedulerKey]
  })
})
