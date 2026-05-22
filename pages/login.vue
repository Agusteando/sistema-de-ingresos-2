<template>
  <main class="login-page">
    <section class="login-shell" aria-label="Inicio de sesión Sistema de Ingresos">
      <aside class="brand-panel" aria-label="Sistema de Ingresos">
        <div class="brand-content">
          <img
            src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp"
            alt="IECS IEDIS"
            class="brand-logo"
          />

          <div class="brand-copy">
            <p class="brand-kicker">Sistema de Ingresos</p>
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
          <p class="auth-subtitle">Selecciona el plantel y continúa con tu cuenta institucional.</p>

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
            <button
              type="button"
              class="google-visual-button"
              :class="{ busy: isBusy || authPhase === 'loadingGoogle' }"
              :disabled="authPhase === 'loadingGoogle' || authPhase === 'error'"
              tabindex="-1"
              aria-hidden="true"
            >
              <span v-if="authPhase === 'loadingGoogle' || isBusy" class="button-spinner" />
              <span v-else class="google-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z" />
                </svg>
              </span>
              <span>{{ primaryButtonText }}</span>
              <svg v-if="!isBusy && authPhase !== 'loadingGoogle'" class="button-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>

            <div
              class="google-button-target"
              :class="{ hidden: authPhase === 'loadingGoogle' || authPhase === 'error' || isBusy }"
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

          <p class="domain-note">
            <span aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 3.5 5.5 6.2v5.3c0 4.1 2.7 7.8 6.5 9 3.8-1.2 6.5-4.9 6.5-9V6.2L12 3.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
                <path d="m9.4 12.1 1.7 1.7 3.5-3.7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            Usa tu correo <strong>@casitaiedis.edu.mx</strong>
          </p>
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
  if (!buttonTarget) return

  buttonTarget.innerHTML = ''
  window.google.accounts.id.renderButton(
    buttonTarget,
    {
      theme: 'outline',
      size: 'large',
      shape: 'rectangular',
      text: 'continue_with',
      width: Math.min(520, buttonTarget.offsetWidth || 420)
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
  padding: 3rem;
  color: #12213d;
  background:
    radial-gradient(circle at 12% 12%, rgba(147, 196, 125, 0.18), transparent 28rem),
    radial-gradient(circle at 84% 82%, rgba(36, 127, 68, 0.08), transparent 24rem),
    #fbfdff;
}

.login-shell {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: min(100%, 1675px);
  min-height: 948px;
  overflow: hidden;
  border: 1px solid #dbe3ec;
  border-radius: 38px;
  background: #ffffff;
  box-shadow: 0 28px 80px rgba(15, 32, 62, 0.12);
}

.brand-panel {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-right: 1px solid #dbe3ec;
  background:
    radial-gradient(circle at 93% 34%, rgba(255, 255, 255, 0.52) 0 9.5rem, transparent 9.65rem),
    radial-gradient(circle at 92% 34%, rgba(255, 255, 255, 0.28) 0 19rem, transparent 19.2rem),
    linear-gradient(145deg, #eef9eb 0%, #f7fbf4 54%, #edf7e8 100%);
}

.brand-panel::before,
.brand-panel::after {
  content: '';
  position: absolute;
  border-radius: 999px;
  pointer-events: none;
}

.brand-panel::before {
  width: 44rem;
  height: 44rem;
  right: -20rem;
  bottom: -18rem;
  background: rgba(255, 255, 255, 0.28);
}

.brand-panel::after {
  width: 22rem;
  height: 22rem;
  right: -6rem;
  top: 10rem;
  border: 3rem solid rgba(255, 255, 255, 0.18);
}

.brand-content {
  position: relative;
  z-index: 1;
  width: min(100%, 475px);
  display: flex;
  min-height: 620px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
}

.brand-logo {
  display: block;
  width: 207px;
  height: auto;
  align-self: center;
  margin-top: 0.5rem;
}

.brand-copy {
  margin-top: 5rem;
}

.brand-kicker {
  margin: 0 0 2rem;
  color: #1c7b2f;
  font-size: 1.05rem;
  font-weight: 950;
  line-height: 1;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.brand-copy h1 {
  margin: 0;
  max-width: 460px;
  color: #12213d;
  font-size: clamp(3.35rem, 4.15vw, 4.65rem);
  font-weight: 950;
  line-height: 1.12;
  letter-spacing: -0.055em;
}

.brand-copy p:not(.brand-kicker) {
  margin: 2rem 0 0;
  max-width: 430px;
  color: #66758f;
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.65;
}

.secure-card {
  display: inline-flex;
  align-items: center;
  gap: 1.15rem;
  min-width: 410px;
  border: 1px solid #dbe3ec;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.86);
  padding: 1.35rem 1.55rem;
  box-shadow: 0 15px 32px rgba(15, 32, 62, 0.06);
}

.secure-icon {
  display: inline-grid;
  width: 38px;
  height: 38px;
  place-items: center;
  flex: 0 0 auto;
  color: #23843f;
}

.secure-icon svg,
.auth-kicker svg,
.domain-note svg {
  width: 100%;
  height: 100%;
}

.secure-card strong {
  display: block;
  color: #12213d;
  font-size: 1.03rem;
  font-weight: 950;
}

.secure-card small {
  display: block;
  margin-top: 0.25rem;
  color: #66758f;
  font-size: 0.98rem;
  font-weight: 650;
}

.auth-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
}

.auth-content {
  width: min(100%, 615px);
}

.auth-kicker {
  display: inline-flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 3.75rem;
  color: #1f7f31;
  font-size: 1.08rem;
  font-weight: 950;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.auth-kicker span {
  display: inline-grid;
  width: 51px;
  height: 51px;
  place-items: center;
  border-radius: 999px;
  background: #e9f4e7;
  color: #23843f;
}

.auth-kicker svg {
  width: 22px;
  height: 22px;
}

.auth-content h2 {
  margin: 0;
  color: #12213d;
  font-size: 2.95rem;
  font-weight: 950;
  line-height: 1;
  letter-spacing: -0.055em;
}

.auth-subtitle {
  margin: 1.55rem 0 3.05rem;
  color: #65748b;
  font-size: 1.19rem;
  font-weight: 650;
  line-height: 1.45;
}

.plantel-field {
  position: relative;
  display: block;
  min-height: 116px;
  border: 1px solid #dbe3ec;
  border-radius: 22px;
  background: #ffffff;
  padding: 1.42rem 4.3rem 1.3rem 1.95rem;
  box-shadow: 0 12px 28px rgba(15, 32, 62, 0.04);
}

.plantel-field span {
  display: block;
  margin-bottom: 1.12rem;
  color: #4d586b;
  font-size: 0.92rem;
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
  font-size: 1.53rem;
  font-weight: 950;
  line-height: 1.1;
  outline: none;
}

.plantel-field svg {
  position: absolute;
  right: 2rem;
  top: 50%;
  width: 20px;
  height: 20px;
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
  margin-top: 2.65rem;
  border: 1px solid #dbe3ec;
  border-radius: 22px;
  background: #ffffff;
  box-shadow: 0 12px 28px rgba(15, 32, 62, 0.04);
}

.google-visual-button {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 42px 1fr 28px;
  width: 100%;
  min-height: 84px;
  align-items: center;
  gap: 1.15rem;
  border: 0;
  border-radius: 22px;
  background: transparent;
  padding: 0 1.85rem;
  color: #1a2334;
  font: inherit;
  font-size: 1.12rem;
  font-weight: 850;
  text-align: left;
}

.google-visual-button.busy {
  grid-template-columns: 28px 1fr;
  color: #236aad;
}

.google-icon {
  display: inline-grid;
  width: 34px;
  height: 34px;
  place-items: center;
}

.google-icon svg {
  width: 34px;
  height: 34px;
}

.button-arrow {
  width: 22px;
  height: 22px;
  justify-self: end;
  color: #17243a;
}

.google-button-target {
  position: absolute;
  inset: 0;
  z-index: 3;
  opacity: 0.01;
}

.google-button-target.hidden {
  pointer-events: none;
}

.google-button-target :deep(div),
.google-button-target :deep(iframe) {
  width: 100% !important;
  max-width: none !important;
  height: 100% !important;
}

#google-btn {
  width: 100%;
  height: 100%;
}

.button-spinner {
  display: inline-block;
  width: 22px;
  height: 22px;
  border: 3px solid currentColor;
  border-top-color: transparent;
  border-radius: 999px;
  animation: spin 0.8s linear infinite;
}

.status-line {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-height: 1.45rem;
  margin: 1.05rem 0 0;
  color: #517088;
  font-size: 0.92rem;
  font-weight: 750;
}

.status-dot {
  display: inline-block;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  background: #23843f;
  box-shadow: 0 0 0 5px rgba(35, 132, 63, 0.12);
}

.login-alert {
  display: grid;
  gap: 0.28rem;
  margin-top: 1.15rem;
  border: 1px solid rgba(218, 62, 48, 0.2);
  border-radius: 18px;
  background: #fff4f1;
  padding: 1rem 1.1rem;
  color: #a83c2f;
  font-size: 0.88rem;
  font-weight: 700;
  line-height: 1.45;
}

.login-alert strong {
  font-size: 0.9rem;
  font-weight: 950;
}

.retry-button {
  width: 100%;
  height: 52px;
  margin-top: 1rem;
  border: 1px solid rgba(35, 132, 63, 0.28);
  border-radius: 16px;
  background: #edf8eb;
  color: #1f7f31;
  font-size: 0.96rem;
  font-weight: 950;
}

.domain-note {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  margin: 2.35rem 0 0;
  color: #66758f;
  font-size: 1.02rem;
  font-weight: 750;
}

.domain-note span {
  display: inline-grid;
  width: 25px;
  height: 25px;
  place-items: center;
  color: #24843f;
}

.domain-note strong {
  color: #1f7f31;
  font-weight: 950;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1180px) {
  .login-page {
    padding: 1.5rem;
  }

  .login-shell {
    min-height: 760px;
  }

  .brand-content,
  .auth-content {
    width: min(100%, 470px);
  }

  .brand-copy h1 {
    font-size: 3.25rem;
  }

  .auth-content h2 {
    font-size: 2.6rem;
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
    min-height: 430px;
    border-right: 0;
    border-bottom: 1px solid #dbe3ec;
  }

  .brand-content {
    min-height: 320px;
    padding: 3rem 2rem;
  }

  .brand-copy {
    margin-top: 2rem;
  }

  .secure-card {
    min-width: 0;
    width: 100%;
  }

  .auth-panel {
    padding: 3rem 2rem;
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
    padding: 2.25rem 1.25rem;
  }

  .brand-logo {
    width: 160px;
  }

  .brand-kicker,
  .auth-kicker {
    font-size: 0.82rem;
  }

  .brand-copy h1 {
    font-size: 2.55rem;
  }

  .brand-copy p:not(.brand-kicker),
  .auth-subtitle {
    font-size: 1rem;
  }

  .auth-panel {
    padding: 2.25rem 1.25rem;
  }

  .auth-kicker {
    margin-bottom: 2.4rem;
  }

  .auth-content h2 {
    font-size: 2.25rem;
  }

  .plantel-field,
  .google-visual-button {
    min-height: 76px;
  }
}
</style>
