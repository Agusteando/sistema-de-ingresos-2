const HEARTBEAT_INTERVAL_MS = 30_000

export default defineNuxtPlugin((nuxtApp) => {
  const heartbeat = async () => {
    if (!useCookie('auth_email').value) return
    try {
      await $fetch('/api/auth/online/heartbeat', {
        method: 'POST',
        retry: 0
      })
    } catch {
      // Presence is best-effort and must never interrupt normal Aurora usage.
    }
  }

  const heartbeatWhenVisible = () => {
    if (document.visibilityState === 'visible') void heartbeat()
  }

  void heartbeat()
  window.setInterval(() => void heartbeat(), HEARTBEAT_INTERVAL_MS)
  document.addEventListener('visibilitychange', heartbeatWhenVisible)
  window.addEventListener('online', heartbeatWhenVisible)
  window.addEventListener('focus', heartbeatWhenVisible)
  nuxtApp.hook('page:finish', () => void heartbeat())
})
