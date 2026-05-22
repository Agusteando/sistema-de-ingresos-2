<template>
  <main class="login-page">
    <div class="login-orb login-orb-one" />
    <div class="login-orb login-orb-two" />
    <div class="login-grid">
      <section class="login-hero" aria-label="Sistema de Ingresos">
        <div class="hero-badge">
          <span class="hero-badge-icon">↗</span>
          Acceso institucional seguro
        </div>

        <img
          src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp"
          alt="IECS IEDIS"
          class="hero-logo"
        />

        <div>
          <p class="hero-kicker">Sistema de Ingresos</p>
          <h1 class="hero-title">Entra con tu cuenta Google Workspace.</h1>
          <p class="hero-copy">
            El acceso usa tu correo institucional. El sistema valida tu identidad, resuelve tu plantel y prepara tu sesión antes de abrir el panel.
          </p>
        </div>

        <div class="state-card" aria-live="polite">
          <div class="state-card-header">
            <span class="state-dot" :class="{ active: isBusy, error: authPhase === 'error' }" />
            <div>
              <p class="state-title">{{ currentPhase.title }}</p>
              <p class="state-description">{{ currentPhase.description }}</p>
            </div>
          </div>

          <ol class="login-steps">
            <li
              v-for="step in loginSteps"
              :key="step.id"
              class="login-step"
              :class="step.state"
            >
              <span class="step-marker">
                <span v-if="step.state === 'done'">✓</span>
                <span v-else-if="step.state === 'active'" class="step-spinner" />
                <span v-else>{{ step.index }}</span>
              </span>
              <span>{{ step.label }}</span>
            </li>
          </ol>
        </div>
      </section>

      <section class="login-card" :aria-busy="isBusy ? 'true' : 'false'">
        <div class="card-topline">
          <span class="card-icon">▣</span>
          <span>Inicio de sesión</span>
        </div>

        <h2>Bienvenido</h2>
        <p class="login-subtitle">Selecciona el plantel local y continúa con tu cuenta institucional.</p>

        <div class="plantel-box">
          <div class="plantel-header">
            <label for="plantel-login">Plantel</label>
            <span>Base local</span>
          </div>

          <select
            id="plantel-login"
            v-model="selectedPlantel"
            class="plantel-select"
            :disabled="isBusy"
            @change="persistSelectedPlantel"
          >
            <option v-for="plantel in PLANTELES_LIST" :key="plantel" :value="plantel">
              {{ plantel }}
            </option>
          </select>

          <p>Este plantel define la base local que se usará al crear y preparar tu sesión.</p>
        </div>

        <div class="google-area">
          <div
            class="google-button-shell"
            :class="{ busy: isBusy }"
            @pointerdown.capture="markGoogleIntent"
          >
            <div id="google-btn" class="google-button-target" />
            <div v-if="isBusy" class="google-busy-layer">
              <span class="inline-spinner" />
              <span>{{ currentPhase.short }}</span>
            </div>
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

        <div v-if="errorMsg" class="login-alert" role="alert">
          <strong>No se pudo iniciar sesión.</strong>
          <span>{{ errorMsg }}</span>
        </div>

        <div class="session-detail">
          <span>Dominio permitido</span>
          <strong>@casitaiedis.edu.mx</strong>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useCookie, useRoute, useRuntimeConfig } from '#app'
import { PLANTELES_LIST } from '~/utils/constants'

definePageMeta({ layout: false })

const PHASES = {
  loadingGoogle: {
    title: 'Preparando Google Workspace',
    short: 'Cargando Google',
    description: 'Estamos cargando el botón oficial de Google para iniciar sesión.'
  },
  ready: {
    title: 'Listo para iniciar sesión',
    short: 'Listo',
    description: 'Elige tu plantel y usa tu cuenta institucional para continuar.'
  },
  google: {
    title: 'Esperando confirmación de Google',
    short: 'Esperando Google',
    description: 'Completa la selección de cuenta en Google. No cierres esta ventana.'
  },
  server: {
    title: 'Validando identidad y acceso',
    short: 'Validando acceso',
    description: 'El servidor está verificando tu cuenta, tu dominio y tu configuración de acceso.'
  },
  session: {
    title: 'Preparando sesión',
    short: 'Preparando sesión',
    description: 'Estamos resolviendo plantel, permisos y destino inicial.'
  },
  redirecting: {
    title: 'Abriendo el sistema',
    short: 'Entrando',
    description: 'Tu sesión quedó lista. Te estamos redirigiendo al panel correspondiente.'
  },
  error: {
    title: 'Inicio detenido',
    short: 'Error',
    description: 'Revisa el mensaje de error y vuelve a intentarlo.'
  }
}

const PHASE_ORDER = ['loadingGoogle', 'google', 'server', 'session', 'redirecting']

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
const currentPhase = computed(() => PHASES[authPhase.value] || PHASES.ready)
const loginSteps = computed(() => [
  { id: 'google', index: 1, label: 'Google Workspace', state: stepState(1) },
  { id: 'identity', index: 2, label: 'Identidad y dominio', state: stepState(2) },
  { id: 'access', index: 3, label: 'Permisos y plantel', state: stepState(3) },
  { id: 'dashboard', index: 4, label: 'Entrada al sistema', state: stepState(4) }
])

const stepState = (step) => {
  if (authPhase.value === 'error') return 'pending'
  if (step < currentStepIndex.value) return 'done'
  if (step === currentStepIndex.value) return 'active'
  return 'pending'
}

const setPhase = (phase, stepIndex = currentStepIndex.value) => {
  authPhase.value = phase
  currentStepIndex.value = stepIndex
}

const getErrorMessage = (error) => {
  const message = error?.data?.message || error?.statusMessage || error?.message || ''

  if (message) return message
  return 'Credenciales no autorizadas, cuenta no institucional o plantel no disponible.'
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
    errorMsg.value = 'No se pudo cargar Google Workspace. Recarga la página.'
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
      shape: 'pill',
      text: 'signin_with',
      width: Math.min(360, buttonTarget.offsetWidth || 360)
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
    errorMsg.value = 'No se pudo cargar Google Workspace. Verifica conexión y recarga la página.'
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
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 2rem;
  color: #162641;
  background:
    radial-gradient(circle at 20% 10%, rgba(142, 193, 83, 0.18), transparent 26rem),
    radial-gradient(circle at 82% 74%, rgba(28, 169, 158, 0.13), transparent 28rem),
    linear-gradient(135deg, #fbfdfc 0%, #f5f8fb 52%, #ffffff 100%);
}

.login-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(22px);
  opacity: 0.8;
  pointer-events: none;
}

.login-orb-one {
  top: -7rem;
  left: -6rem;
  width: 22rem;
  height: 22rem;
  background: rgba(142, 193, 83, 0.22);
}

.login-orb-two {
  right: -8rem;
  bottom: -8rem;
  width: 28rem;
  height: 28rem;
  background: rgba(57, 127, 232, 0.11);
}

.login-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(380px, 0.95fr);
  width: min(100%, 1040px);
  min-height: 640px;
  overflow: hidden;
  border: 1px solid rgba(223, 230, 239, 0.92);
  border-radius: 34px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 28px 75px rgba(22, 38, 65, 0.13);
  backdrop-filter: blur(20px);
}

.login-hero {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 2rem;
  padding: 3rem;
  background:
    linear-gradient(145deg, rgba(234, 248, 231, 0.96), rgba(255, 255, 255, 0.62)),
    radial-gradient(circle at 20% 30%, rgba(101, 167, 68, 0.16), transparent 18rem);
}

.hero-badge,
.card-topline {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 0.55rem;
  border: 1px solid rgba(101, 167, 68, 0.22);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.76);
  padding: 0.45rem 0.75rem;
  color: #326c32;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.hero-badge-icon,
.card-icon {
  display: inline-flex;
  width: 1.35rem;
  height: 1.35rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(101, 167, 68, 0.14);
  color: #2f8132;
}

.hero-logo {
  width: 154px;
  height: auto;
  object-fit: contain;
}

.hero-kicker {
  margin: 0 0 0.75rem;
  color: #19823a;
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-title {
  margin: 0;
  max-width: 520px;
  color: #11213c;
  font-size: clamp(2.4rem, 5vw, 4.6rem);
  font-weight: 950;
  line-height: 0.95;
  letter-spacing: -0.055em;
}

.hero-copy {
  margin: 1.25rem 0 0;
  max-width: 520px;
  color: #607089;
  font-size: 0.98rem;
  font-weight: 600;
  line-height: 1.65;
}

.state-card {
  border: 1px solid rgba(223, 230, 239, 0.88);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.82);
  padding: 1.1rem;
  box-shadow: 0 16px 38px rgba(22, 38, 65, 0.07);
}

.state-card-header {
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
}

.state-dot {
  margin-top: 0.35rem;
  width: 0.75rem;
  height: 0.75rem;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #65a744;
  box-shadow: 0 0 0 6px rgba(101, 167, 68, 0.12);
}

.state-dot.active {
  animation: pulseDot 1.2s ease-in-out infinite;
}

.state-dot.error {
  background: #ff4d38;
  box-shadow: 0 0 0 6px rgba(255, 77, 56, 0.12);
}

.state-title {
  margin: 0;
  color: #182a47;
  font-size: 0.92rem;
  font-weight: 900;
}

.state-description {
  margin: 0.25rem 0 0;
  color: #66728a;
  font-size: 0.78rem;
  font-weight: 650;
  line-height: 1.45;
}

.login-steps {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.65rem;
  margin: 1rem 0 0;
  padding: 0;
  list-style: none;
}

.login-step {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.45rem;
  border: 1px solid rgba(223, 230, 239, 0.82);
  border-radius: 14px;
  background: #ffffff;
  padding: 0.55rem;
  color: #7a879b;
  font-size: 0.68rem;
  font-weight: 800;
}

.login-step.done {
  border-color: rgba(101, 167, 68, 0.24);
  color: #39743b;
  background: rgba(234, 248, 231, 0.72);
}

.login-step.active {
  border-color: rgba(57, 127, 232, 0.28);
  color: #245fac;
  background: rgba(237, 246, 255, 0.88);
}

.step-marker {
  display: inline-flex;
  width: 1.25rem;
  height: 1.25rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #f1f5f9;
  font-size: 0.62rem;
  font-weight: 950;
}

.login-step.done .step-marker {
  background: #65a744;
  color: #ffffff;
}

.login-step.active .step-marker {
  background: #397fe8;
  color: #ffffff;
}

.step-spinner,
.inline-spinner {
  display: inline-block;
  width: 0.8rem;
  height: 0.8rem;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 999px;
  animation: spin 0.75s linear infinite;
}

.login-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 3rem;
  border-left: 1px solid rgba(223, 230, 239, 0.78);
  background: rgba(255, 255, 255, 0.96);
}

.login-card h2 {
  margin: 1.15rem 0 0.35rem;
  color: #11213c;
  font-size: 2.35rem;
  font-weight: 950;
  letter-spacing: -0.045em;
}

.login-subtitle {
  margin: 0 0 1.6rem;
  color: #66728a;
  font-size: 0.92rem;
  font-weight: 650;
  line-height: 1.55;
}

.plantel-box {
  border: 1px solid rgba(223, 230, 239, 0.95);
  border-radius: 22px;
  background: linear-gradient(180deg, #ffffff, #fbfdfc);
  padding: 1rem;
  box-shadow: 0 12px 28px rgba(22, 38, 65, 0.05);
}

.plantel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.55rem;
}

.plantel-header label {
  color: #182a47;
  font-size: 0.76rem;
  font-weight: 950;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.plantel-header span {
  color: #6b7b92;
  font-size: 0.72rem;
  font-weight: 800;
}

.plantel-select {
  width: 100%;
  height: 46px;
  border: 1px solid #dfe6ef;
  border-radius: 16px;
  background: #ffffff;
  padding: 0 0.85rem;
  color: #2d6b31;
  font-size: 0.92rem;
  font-weight: 900;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.plantel-select:focus {
  border-color: rgba(101, 167, 68, 0.78);
  box-shadow: 0 0 0 4px rgba(101, 167, 68, 0.13);
}

.plantel-select:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.plantel-box p {
  margin: 0.65rem 0 0;
  color: #7a879b;
  font-size: 0.73rem;
  font-weight: 700;
  line-height: 1.45;
}

.google-area {
  margin-top: 1rem;
}

.google-button-shell {
  position: relative;
  display: flex;
  min-height: 54px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid rgba(223, 230, 239, 0.95);
  border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 14px 30px rgba(22, 38, 65, 0.08);
}

.google-button-shell.busy {
  border-color: rgba(57, 127, 232, 0.24);
}

.google-button-target {
  display: flex;
  width: 100%;
  justify-content: center;
}

.google-busy-layer {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  background: rgba(255, 255, 255, 0.94);
  color: #245fac;
  font-size: 0.84rem;
  font-weight: 900;
  backdrop-filter: blur(4px);
}

.retry-button {
  width: 100%;
  height: 42px;
  margin-top: 0.75rem;
  border: 1px solid rgba(101, 167, 68, 0.32);
  border-radius: 999px;
  background: rgba(234, 248, 231, 0.72);
  color: #2f6f39;
  font-size: 0.82rem;
  font-weight: 900;
}

.login-alert {
  display: grid;
  gap: 0.25rem;
  margin-top: 1rem;
  border: 1px solid rgba(255, 77, 56, 0.2);
  border-radius: 18px;
  background: rgba(255, 241, 240, 0.95);
  padding: 0.85rem 1rem;
  color: #a23a2b;
  font-size: 0.8rem;
  font-weight: 750;
  line-height: 1.45;
}

.login-alert strong {
  font-size: 0.82rem;
  font-weight: 950;
}

.session-detail {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1rem;
  border-top: 1px solid rgba(223, 230, 239, 0.9);
  padding-top: 1rem;
  color: #6b7b92;
  font-size: 0.75rem;
  font-weight: 800;
}

.session-detail strong {
  color: #2f6f39;
  font-weight: 950;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulseDot {
  0%, 100% { transform: scale(1); opacity: 0.92; }
  50% { transform: scale(1.25); opacity: 0.65; }
}

@media (max-width: 900px) {
  .login-page {
    padding: 1rem;
    align-items: flex-start;
  }

  .login-grid {
    grid-template-columns: 1fr;
    min-height: auto;
  }

  .login-hero,
  .login-card {
    padding: 2rem;
  }

  .login-card {
    border-left: 0;
    border-top: 1px solid rgba(223, 230, 239, 0.78);
  }

  .login-steps {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .login-page {
    padding: 0;
  }

  .login-grid {
    min-height: 100vh;
    border-radius: 0;
  }

  .login-hero,
  .login-card {
    padding: 1.5rem;
  }

  .hero-title {
    font-size: 2.45rem;
  }

  .login-steps {
    grid-template-columns: 1fr;
  }
}
</style>
