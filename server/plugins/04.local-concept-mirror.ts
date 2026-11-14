import { isLocalSystemRuntime } from '../utils/local-system-manager'
import { refreshLocalConceptMirror } from '../utils/local-concept-mirror'
const key = '__auroraCampusConceptMirrorTimer'
const shared = globalThis as typeof globalThis & { [key]?: ReturnType<typeof setTimeout> }
export default defineNitroPlugin((nitroApp) => {
  if (!isLocalSystemRuntime() || shared[key]) return
  let closed = false
  const run = async () => {
    if (closed) return
    try { await refreshLocalConceptMirror() } catch { /* Last local snapshot stays available. */ }
    if (!closed) { shared[key] = setTimeout(run, 5 * 60 * 1000); shared[key]?.unref?.() }
  }
  shared[key] = setTimeout(run, 15000)
  shared[key]?.unref?.()
  nitroApp.hooks.hook('close', () => { closed = true; if (shared[key]) clearTimeout(shared[key]); delete shared[key] })
})
