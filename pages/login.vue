<template>
  <main class="login-page">
    <section class="login-shell" aria-label="Inicio de sesión Aurora">
      <aside class="brand-panel" aria-label="Aurora">
        <div class="brand-content">
          <img
            src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp"
            alt="IECS IEDIS"
            class="brand-logo"
          />

          <img
            src="/aurora-logo.png"
            alt="Aurora"
            class="brand-system-logo"
          />

          <div class="brand-copy">
            <h1>Entra con tu cuenta institucional</h1>
            <p>Accede con tu correo institucional de Google Workspace.</p>
          </div>

          <div class="secure-card">
            <span class="secure-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 3.5 5.5 6.2v5.3c0 4.1 2.7 7.8 6.5 9 3.8-1.2 6.5-4.9 6.5-9V6.2L12 3.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
                <path d="m9.2 12 1.8 1.8 3.9-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <span>
              <strong>Acceso seguro</strong>
              <small>Tus credenciales están protegidas.</small>
            </span>
          </div>
        </div>
      </aside>

      <section class="auth-panel" :aria-busy="isBusy ? 'true' : 'false'">
        <div class="auth-content">
          <div class="auth-kicker">
            <span aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M7 10V8a5 5 0 0 1 10 0v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                <rect x="5" y="10" width="14" height="10" rx="2.5" stroke="currentColor" stroke-width="2" />
                <path d="M12 14v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </span>
            Inicio de sesión
          </div>

          <h2>Bienvenido</h2>
          <p class="auth-subtitle">Continúa con tu cuenta institucional.</p>

          <label class="plantel-field" for="plantel-login">
            <span>Plantel</span>
            <select
              id="plantel-login"
              v-model="selectedPlantel"
              :disabled="isBusy"
              @change="persistSelectedPlantel"
            >
              <option v-for="plantel in PLANTELES_LIST" :key="plantel" :value="plantel">
                {{ plantel }}
              </option>
            </select>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </label>

          <div class="google-card">
            <div
              v-show="authPhase === 'loadingGoogle' || isBusy"
              class="google-busy-row"
              aria-live="polite"
            >
              <span class="button-spinner" />
              <span>{{ primaryButtonText }}</span>
            </div>

            <div
              class="google-native-shell"
              :class="{ inactive: authPhase === 'loadingGoogle' || isBusy }"
              @pointerdown.capture="markGoogleIntent"
            >
              <div id="google-btn" />
            </div>
          </div>

          <p v-if="statusText" class="status-line" aria-live="polite">
            <span class="status-dot" />
            {{ statusText }}
          </p>

          <div v-if="errorMsg" class="login-alert" role="alert">
            <strong>No se pudo iniciar sesión.</strong>
            <span>{{ errorMsg }}</span>
          </div>

          <button
            v-if="authPhase === 'error'"
            type="button"
            class="retry-button"
            @click="resetLoginState"
          >
            Intentar de nuevo
          </button>
        </div>
      </section>
    </section>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useCookie, useRoute, useRuntimeConfig } from '#app'
import { PLANTELES_LIST } from '~/utils/constants'

definePageMeta({ layout: false })

const PHASES = {
  loadingGoogle: {
    button: 'Cargando Google',
    status: 'Preparando acceso con Google.'
  },
  ready: {
    button: 'Continuar con Google',
    status: ''
  },
  google: {
    button: 'Continúa en Google',
    status: 'Selecciona tu cuenta institucional.'
  },
  server: {
    button: 'Validando cuenta',
    status: 'Estamos validando tu acceso.'
  },
  session: {
    button: 'Preparando acceso',
    status: 'Estamos preparando tu sesión.'
  },
  redirecting: {
    button: 'Entrando',
    status: 'Abriendo el sistema.'
  },
  error: {
    button: 'Continuar con Google',
    status: ''
  }
}

const errorMsg = ref('')
const authPhase = ref('loadingGoogle')
const currentStepIndex = ref(0)
const config = useRuntimeConfig()
const route = useRoute()
let googleIntentTimer = null

const bridgeAgentCookie = useCookie('db_bridge_agent_id', {
  path: '/',
  maxAge: 86400 * 7,
  sameSite: 'lax'
})

const defaultPlantel = String(config.public.defaultPlantel || 'PT')
const routePlantel = String(route.query.plantel || route.query.agentId || '').trim().toUpperCase()

const selectedPlantel = ref(
  PLANTELES_LIST.includes(routePlantel)
    ? routePlantel
    : (bridgeAgentCookie.value && PLANTELES_LIST.includes(String(bridgeAgentCookie.value))
        ? String(bridgeAgentCookie.value)
        : defaultPlantel)
)

const isBusy = computed(() => ['google', 'server', 'session', 'redirecting'].includes(authPhase.value))
const primaryButtonText = computed(() => (PHASES[authPhase.value] || PHASES.ready).button)
const statusText = computed(() => (PHASES[authPhase.value] || PHASES.ready).status)

const setPhase = (phase, stepIndex = currentStepIndex.value) => {
  authPhase.value = phase
  currentStepIndex.value = stepIndex
}

const getErrorMessage = (error) => {
  const message = error?.data?.message || error?.statusMessage || error?.message || ''

  if (message) return message
  return 'No pudimos validar tu cuenta. Inténtalo de nuevo.'
}

const clearGoogleIntentTimer = () => {
  if (googleIntentTimer) {
    window.clearTimeout(googleIntentTimer)
    googleIntentTimer = null
  }
}

const persistSelectedPlantel = () => {
  bridgeAgentCookie.value = selectedPlantel.value

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('db_bridge_agent_id', selectedPlantel.value)
  }
}

const loadPersistedPlantel = () => {
  if (routePlantel && PLANTELES_LIST.includes(routePlantel)) {
    selectedPlantel.value = routePlantel
    persistSelectedPlantel()
    return
  }

  if (bridgeAgentCookie.value && PLANTELES_LIST.includes(String(bridgeAgentCookie.value))) {
    selectedPlantel.value = String(bridgeAgentCookie.value)
    persistSelectedPlantel()
    return
  }

  if (typeof localStorage !== 'undefined') {
    const stored = String(localStorage.getItem('db_bridge_agent_id') || '').trim().toUpperCase()

    if (PLANTELES_LIST.includes(stored)) {
      selectedPlantel.value = stored
      persistSelectedPlantel()
      return
    }
  }

  if (!PLANTELES_LIST.includes(selectedPlantel.value)) {
    selectedPlantel.value = defaultPlantel
  }

  persistSelectedPlantel()
}

const markGoogleIntent = () => {
  if (authPhase.value !== 'ready' && authPhase.value !== 'error') return

  errorMsg.value = ''
  setPhase('google', 1)
  clearGoogleIntentTimer()
  googleIntentTimer = window.setTimeout(() => {
    if (authPhase.value === 'google') {
      setPhase('ready', 0)
    }
  }, 45000)
}

const resetLoginState = () => {
  errorMsg.value = ''
  clearGoogleIntentTimer()
  setPhase(window.google?.accounts?.id ? 'ready' : 'loadingGoogle', 0)
}

const initializeGoogle = () => {
  if (!window.google?.accounts?.id) {
    errorMsg.value = 'No se pudo cargar Google. Recarga la página.'
    setPhase('error', 0)
    return
  }

  window.google.accounts.id.initialize({
    client_id: config.public.googleClientId,
    callback: async (response) => {
      clearGoogleIntentTimer()
      errorMsg.value = ''
      persistSelectedPlantel()
      setPhase('server', 2)

      try {
        const result = await $fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'x-db-agent-id': selectedPlantel.value
          },
          body: {
            credential: response.credential,
            plantel: selectedPlantel.value
          }
        })

        setPhase('session', 3)
        setPhase('redirecting', 4)
        window.location.href = result?.redirectTo || '/'
      } catch (e) {
        errorMsg.value = getErrorMessage(e)
        setPhase('error', 0)
      }
    }
  })

  const buttonTarget = document.getElementById('google-btn')
  if (!buttonTarget) {
    window.requestAnimationFrame(initializeGoogle)
    return
  }

  buttonTarget.innerHTML = ''
  window.google.accounts.id.renderButton(
    buttonTarget,
    {
      theme: 'outline',
      size: 'large',
      shape: 'rectangular',
      text: 'continue_with',
      logo_alignment: 'left',
      width: Math.max(320, Math.min(420, Math.round(buttonTarget.getBoundingClientRect().width || 420)))
    }
  )

  if (!errorMsg.value) setPhase('ready', 0)
}

onMounted(() => {
  loadPersistedPlantel()

  if (!config.public.googleClientId) {
    errorMsg.value = 'Credenciales de Google no configuradas.'
    setPhase('error', 0)
    return
  }

  const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]')

  if (existingScript && window.google?.accounts?.id) {
    initializeGoogle()
    return
  }

  setPhase('loadingGoogle', 0)
  const script = existingScript || document.createElement('script')
  script.src = 'https://accounts.google.com/gsi/client'
  script.async = true
  script.defer = true
  script.onload = initializeGoogle
  script.onerror = () => {
    errorMsg.value = 'No se pudo cargar Google. Verifica tu conexión y recarga la página.'
    setPhase('error', 0)
  }

  if (!existingScript) document.head.appendChild(script)
})

onBeforeUnmount(() => {
  clearGoogleIntentTimer()
})
</script>
<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 2rem;
  color: #12213d;
  background:
    radial-gradient(circle at 10% 12%, rgba(147, 196, 125, 0.14), transparent 24rem),
    radial-gradient(circle at 88% 82%, rgba(36, 127, 68, 0.07), transparent 20rem),
    #fbfdff;
}

.login-shell {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: min(100%, 1260px);
  min-height: 720px;
  overflow: hidden;
  border: 1px solid #dbe3ec;
  border-radius: 30px;
  background: #ffffff;
  box-shadow: 0 24px 60px rgba(15, 32, 62, 0.11);
}

.brand-panel {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-right: 1px solid #dbe3ec;
  background:
    radial-gradient(circle at 95% 34%, rgba(255, 255, 255, 0.52) 0 7.4rem, transparent 7.55rem),
    radial-gradient(circle at 94% 34%, rgba(255, 255, 255, 0.26) 0 15rem, transparent 15.15rem),
    linear-gradient(145deg, #eef9eb 0%, #f7fbf4 56%, #edf7e8 100%);
}

.brand-panel::before,
.brand-panel::after {
  content: '';
  position: absolute;
  border-radius: 999px;
  pointer-events: none;
}

.brand-panel::before {
  width: 32rem;
  height: 32rem;
  right: -15rem;
  bottom: -14rem;
  background: rgba(255, 255, 255, 0.28);
}

.brand-panel::after {
  width: 17rem;
  height: 17rem;
  right: -5rem;
  top: 8rem;
  border: 2.4rem solid rgba(255, 255, 255, 0.16);
}

.brand-content {
  position: relative;
  z-index: 1;
  width: min(100%, 390px);
  display: flex;
  min-height: 500px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
}

.brand-logo {
  display: block;
  width: 165px;
  height: auto;
  align-self: center;
}

.brand-system-logo {
  display: block;
  width: min(100%, 420px);
  height: auto;
  margin: 1.1rem auto 0;
  align-self: center;
  object-fit: contain;
}

.brand-copy {
  margin-top: 3.8rem;
}

.brand-kicker {
  margin: 0 0 1.55rem;
  color: #1c7b2f;
  font-size: 0.9rem;
  font-weight: 950;
  line-height: 1;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.brand-copy h1 {
  margin: 0;
  max-width: 390px;
  color: #12213d;
  font-size: clamp(2.65rem, 3.2vw, 3.45rem);
  font-weight: 950;
  line-height: 1.12;
  letter-spacing: -0.055em;
}

.brand-copy p:not(.brand-kicker) {
  margin: 1.45rem 0 0;
  max-width: 360px;
  color: #66758f;
  font-size: 1.04rem;
  font-weight: 600;
  line-height: 1.62;
}

.secure-card {
  display: inline-flex;
  align-items: center;
  gap: 0.95rem;
  min-width: 335px;
  border: 1px solid #dbe3ec;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.86);
  padding: 1rem 1.15rem;
  box-shadow: 0 12px 26px rgba(15, 32, 62, 0.055);
}

.secure-icon {
  display: inline-grid;
  width: 32px;
  height: 32px;
  place-items: center;
  flex: 0 0 auto;
  color: #23843f;
}

.secure-icon svg,
.auth-kicker svg {
  width: 100%;
  height: 100%;
}

.secure-card strong {
  display: block;
  color: #12213d;
  font-size: 0.94rem;
  font-weight: 950;
}

.secure-card small {
  display: block;
  margin-top: 0.18rem;
  color: #66758f;
  font-size: 0.88rem;
  font-weight: 650;
}

.auth-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  padding: 2rem;
}

.auth-content {
  width: min(100%, 430px);
}

.auth-kicker {
  display: inline-flex;
  align-items: center;
  gap: 0.8rem;
  margin-bottom: 2.85rem;
  color: #1f7f31;
  font-size: 0.9rem;
  font-weight: 950;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.auth-kicker span {
  display: inline-grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 999px;
  background: #e9f4e7;
  color: #23843f;
}

.auth-kicker svg {
  width: 18px;
  height: 18px;
}

.auth-content h2 {
  margin: 0;
  color: #12213d;
  font-size: 2.45rem;
  font-weight: 950;
  line-height: 1;
  letter-spacing: -0.055em;
}

.auth-subtitle {
  margin: 1.15rem 0 2.2rem;
  color: #65748b;
  font-size: 1rem;
  font-weight: 650;
  line-height: 1.45;
}

.plantel-field {
  position: relative;
  display: block;
  min-height: 86px;
  border: 1px solid #dbe3ec;
  border-radius: 18px;
  background: #ffffff;
  padding: 1.05rem 3.5rem 1rem 1.35rem;
  box-shadow: 0 10px 24px rgba(15, 32, 62, 0.04);
}

.plantel-field span {
  display: block;
  margin-bottom: 0.72rem;
  color: #4d586b;
  font-size: 0.78rem;
  font-weight: 950;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}

.plantel-field select {
  display: block;
  width: 100%;
  border: 0;
  appearance: none;
  background: transparent;
  color: #20762f;
  font: inherit;
  font-size: 1.28rem;
  font-weight: 950;
  line-height: 1.1;
  outline: none;
}

.plantel-field svg {
  position: absolute;
  right: 1.45rem;
  top: 50%;
  width: 18px;
  height: 18px;
  color: #217832;
  transform: translateY(-50%);
  pointer-events: none;
}

.plantel-field:focus-within {
  border-color: rgba(35, 132, 63, 0.55);
  box-shadow: 0 0 0 4px rgba(35, 132, 63, 0.09);
}

.google-card {
  position: relative;
  margin-top: 1.7rem;
  min-height: 48px;
}

.google-native-shell {
  display: flex;
  width: 100%;
  min-height: 44px;
  align-items: center;
}

.google-native-shell.inactive {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
}

#google-btn {
  width: 100%;
  min-height: 44px;
}

#google-btn :deep(div),
#google-btn :deep(iframe) {
  width: 100% !important;
  max-width: 100% !important;
}

.google-busy-row {
  display: flex;
  min-height: 54px;
  align-items: center;
  gap: 0.85rem;
  border: 1px solid #dbe3ec;
  border-radius: 15px;
  background: #ffffff;
  padding: 0 1.15rem;
  color: #236aad;
  font-size: 0.98rem;
  font-weight: 850;
  box-shadow: 0 10px 24px rgba(15, 32, 62, 0.04);
}

.button-spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 3px solid currentColor;
  border-top-color: transparent;
  border-radius: 999px;
  animation: spin 0.8s linear infinite;
}

.status-line {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 1.35rem;
  margin: 0.85rem 0 0;
  color: #517088;
  font-size: 0.86rem;
  font-weight: 750;
}

.status-dot {
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: #23843f;
  box-shadow: 0 0 0 5px rgba(35, 132, 63, 0.12);
}

.login-alert {
  display: grid;
  gap: 0.28rem;
  margin-top: 1rem;
  border: 1px solid rgba(218, 62, 48, 0.2);
  border-radius: 16px;
  background: #fff4f1;
  padding: 0.95rem 1rem;
  color: #a83c2f;
  font-size: 0.86rem;
  font-weight: 700;
  line-height: 1.45;
}

.login-alert strong {
  font-size: 0.88rem;
  font-weight: 950;
}

.retry-button {
  width: 100%;
  height: 48px;
  margin-top: 0.9rem;
  border: 1px solid rgba(35, 132, 63, 0.28);
  border-radius: 15px;
  background: #edf8eb;
  color: #1f7f31;
  font-size: 0.92rem;
  font-weight: 950;
}


@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1180px) {
  .login-page {
    padding: 1.25rem;
  }

  .login-shell {
    min-height: 650px;
  }

  .brand-content {
    width: min(100%, 350px);
  }

  .brand-copy h1 {
    font-size: 2.8rem;
  }
}

@media (max-width: 900px) {
  .login-page {
    padding: 1rem;
    place-items: start center;
  }

  .login-shell {
    grid-template-columns: 1fr;
    min-height: auto;
  }

  .brand-panel {
    min-height: 370px;
    border-right: 0;
    border-bottom: 1px solid #dbe3ec;
  }

  .brand-content {
    min-height: 275px;
    padding: 2.4rem 1.75rem;
  }

  .brand-copy {
    margin-top: 1.7rem;
  }

  .secure-card {
    min-width: 0;
    width: 100%;
  }

  .auth-panel {
    padding: 2.5rem 1.75rem;
  }
}

@media (max-width: 560px) {
  .login-page {
    padding: 0;
  }

  .login-shell {
    border-radius: 0;
    border-left: 0;
    border-right: 0;
  }

  .brand-panel {
    min-height: auto;
  }

  .brand-content {
    padding: 2rem 1.25rem;
  }

  .brand-logo {
    width: 148px;
  }

  .brand-kicker,
  .auth-kicker {
    font-size: 0.78rem;
  }

  .brand-copy h1 {
    font-size: 2.35rem;
  }

  .brand-copy p:not(.brand-kicker),
  .auth-subtitle {
    font-size: 0.96rem;
  }

  .auth-panel {
    padding: 2rem 1.25rem;
  }

  .auth-kicker {
    margin-bottom: 2.1rem;
  }

  .auth-content h2 {
    font-size: 2.1rem;
  }

  .plantel-field {
    min-height: 78px;
  }
}
</style>
