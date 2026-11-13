<template>
  <Transition name="server-connectivity">
    <section v-if="notice" class="server-connectivity-ribbon" role="status" aria-live="polite" aria-atomic="true">
      <span class="server-connectivity-icon" aria-hidden="true"><LucideWifiOff :size="16" :stroke-width="2.2" /></span>
      <p>{{ notice }}</p>
      <span class="server-connectivity-separator" aria-hidden="true"></span>
      <img
        v-if="!logoUnavailable"
        class="server-connectivity-logo"
        src="https://upload.wikimedia.org/wikipedia/commons/b/bf/Logo_TotalPlay.svg"
        alt="Totalplay"
        @error="logoUnavailable = true"
      />
      <span v-else class="server-connectivity-wordmark" aria-label="Totalplay">Total<span>p</span><span>l</span><span>a</span><span>y</span></span>
    </section>
  </Transition>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { LucideWifiOff } from 'lucide-vue-next'
import {
  createConnectivitySignal,
  advanceConnectivitySignal,
  connectivityNoticeText,
  classifyConnectivityProbes
} from '~/utils/serverConnectivitySignal.mjs'

const POLL_INTERVAL_MS = 15000
const REQUEST_TIMEOUT_MS = 4500
const STORAGE_KEY = 'aurora-casita01-connectivity-v1'
const localRuntime = String(useRuntimeConfig().public.localSystemMode || '').toLowerCase() === 'true'
const logoUnavailable = ref(false)
const state = ref(createConnectivitySignal(''))
const notice = computed(() => connectivityNoticeText(state.value))
const controllers = new Set()
let stopped = false
let running = false
let timer = null

const localDay = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const readHistory = () => {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}
const saveHistory = (next) => {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ day: next.day, episodes: next.episodes, active: next.active })) } catch {}
}

const probe = async (url, crossOrigin = false) => {
  const controller = new AbortController()
  controllers.add(controller)
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: crossOrigin ? 'omit' : 'same-origin',
      ...(crossOrigin ? { mode: 'no-cors' } : {}),
      signal: controller.signal
    })
    if (crossOrigin) return response.ok || response.type === 'opaque'
    if (!response.ok) return false
    const payload = await response.json()
    return payload?.ok === true
  } catch {
    return false
  } finally {
    window.clearTimeout(timeout)
    controllers.delete(controller)
  }
}

const poll = async () => {
  if (stopped || running || localRuntime) return
  running = true
  try {
    if (document.visibilityState === 'hidden') return
    const nonce = Date.now()
    const auroraReachable = await probe(`/api/connectivity/ping?_=${nonce}`)
    let outcome = 'up'
    if (!auroraReachable) {
      outcome = 'unknown'
      if (navigator.onLine !== false) {
        // Require two independent host failures while the browser still has Internet.
        // This avoids blaming Totalplay for a failing Aurora endpoint or a user's own Wi-Fi.
        const [relayReachable, independentInternetReachable] = await Promise.all([
          probe(`https://bridge.casitaapps.com/health?_=${nonce}`, true),
          probe(`https://www.gstatic.com/generate_204?_=${nonce}`, true)
        ])
        outcome = classifyConnectivityProbes({ auroraReachable, relayReachable, independentInternetReachable })
      }
    }
    if (stopped) return
    state.value = advanceConnectivitySignal(state.value, outcome, localDay())
    saveHistory(state.value)
  } finally {
    running = false
    if (!stopped) schedule()
  }
}
const schedule = (delay = POLL_INTERVAL_MS) => {
  if (timer !== null) window.clearTimeout(timer)
  if (!stopped) timer = window.setTimeout(poll, delay)
}
const recheck = () => {
  if (!stopped && document.visibilityState !== 'hidden') schedule(0)
}

onMounted(() => {
  if (localRuntime) return
  state.value = createConnectivitySignal(localDay(), readHistory())
  document.addEventListener('visibilitychange', recheck)
  window.addEventListener('online', recheck)
  schedule(0)
})
onBeforeUnmount(() => {
  stopped = true
  if (timer !== null) window.clearTimeout(timer)
  controllers.forEach(controller => controller.abort())
  controllers.clear()
  document.removeEventListener('visibilitychange', recheck)
  window.removeEventListener('online', recheck)
})
</script>

<style scoped>
.server-connectivity-ribbon {
  position: relative;
  z-index: 19;
  box-sizing: border-box;
  display: flex;
  width: 100%;
  min-height: 44px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 11px;
  padding: 8px 29px 8px 16px;
  border-bottom: 1px solid rgba(216, 170, 101, .34);
  background: linear-gradient(90deg, #fffdf9 6%, #fff9ec 100%);
  box-shadow: 0 7px 20px rgba(127, 83, 21, .045);
  color: #7f4f23;
}
.server-connectivity-ribbon::before {
  position: absolute;
  top: 0;
  right: 0;
  width: 210px;
  height: 2px;
  background: linear-gradient(90deg, transparent, #e9b15c, #e68f61);
  content: '';
}
.server-connectivity-ribbon p {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.45;
  text-align: right;
  letter-spacing: -.012em;
}
.server-connectivity-icon {
  display: grid;
  width: 27px;
  height: 27px;
  flex: 0 0 27px;
  place-items: center;
  border: 1px solid #f1ddbb;
  border-radius: 9px;
  background: #fff7e6;
  color: #b77e37;
}
.server-connectivity-separator {
  width: 1px;
  height: 19px;
  flex: 0 0 1px;
  background: #e9dcc8;
}
.server-connectivity-logo {
  width: 96px;
  height: 26px;
  flex: 0 0 96px;
  object-fit: contain;
}
.server-connectivity-wordmark {
  flex: 0 0 auto;
  color: #666971;
  font-size: 15px;
  font-weight: 850;
  letter-spacing: -.04em;
}
.server-connectivity-wordmark span:nth-child(1) { color: #57b6d5; }
.server-connectivity-wordmark span:nth-child(2) { color: #a7c51b; }
.server-connectivity-wordmark span:nth-child(3) { color: #f1b517; }
.server-connectivity-wordmark span:nth-child(4) { color: #c62a32; }
.server-connectivity-enter-active, .server-connectivity-leave-active { transition: opacity .32s ease, transform .32s cubic-bezier(.2,.8,.2,1), margin .32s ease; }
.server-connectivity-enter-from, .server-connectivity-leave-to { opacity: 0; transform: translateY(-8px); }
@media (max-width: 680px) {
  .server-connectivity-ribbon { gap: 8px; padding: 9px 13px; }
  .server-connectivity-ribbon p { font-size: 11px; text-align: left; }
  .server-connectivity-logo { width: 73px; height: 23px; flex-basis: 73px; }
  .server-connectivity-icon { width: 25px; height: 25px; flex-basis: 25px; }
}
@media (prefers-reduced-motion: reduce) {
  .server-connectivity-enter-active, .server-connectivity-leave-active { transition: none; }
}
</style>
