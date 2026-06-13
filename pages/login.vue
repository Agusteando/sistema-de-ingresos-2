<template>
  <main class="login-page">
    <section class="login-shell" aria-label="Inicio de sesión institucional">
      <aside class="brand-panel" aria-label="Acceso institucional">
        <div class="brand-content">
          <img
            src="/brand/iecs-iedis-logo.png"
            alt="IECS IEDIS"
            class="brand-logo"
          />

          <img
            src="/aurora-logo.png"
            alt="AURORA - Administración Unificada de Recursos, Operación y Registro Académico"
            class="brand-system-logo"
          />

          <div class="brand-copy">
            <h1>
              Inicia sesión con tu<br>
              <span>cuenta</span> institucional
            </h1>
            <p>Accede a AURORA de forma segura con tu cuenta institucional de Google Workspace.</p>
          </div>

          <div class="secure-card">
            <span class="secure-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 3.5 5.5 6.2v5.3c0 4.1 2.7 7.8 6.5 9 3.8-1.2 6.5-4.9 6.5-9V6.2L12 3.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
                <path d="m9.2 12 1.8 1.8 3.9-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <span class="secure-copy">
              <strong>Acceso seguro</strong>
              <small>
                Tus credenciales están protegidas.<br>
                Usamos Google para mantener tu información segura.
              </small>
            </span>
          </div>
        </div>
      </aside>

      <section class="auth-panel" :aria-busy="isBusy ? 'true' : 'false'">
        <div class="auth-content">
          <div class="auth-kicker">
            <span aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" stroke-width="2" />
                <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </span>
            Inicio de sesión
          </div>

          <h2>Bienvenido</h2>
          <p class="auth-subtitle">Continúa con tu cuenta institucional.</p>

          <div ref="plantelSelectRef" class="plantel-field">
            <span id="plantel-login-label" class="plantel-label">Plantel</span>
            <div class="plantel-picker" :class="{ open: plantelMenuOpen }">
              <button
                id="plantel-login"
                type="button"
                class="plantel-select-shell plantel-select-button"
                :disabled="isBusy"
                aria-haspopup="listbox"
                :aria-expanded="plantelMenuOpen ? 'true' : 'false'"
                aria-labelledby="plantel-login-label plantel-login-value"
                @click="togglePlantelMenu"
                @keydown.down.prevent="openPlantelMenu"
                @keydown.enter.prevent="togglePlantelMenu"
                @keydown.space.prevent="togglePlantelMenu"
                @keydown.esc.prevent="closePlantelMenu"
              >
                <span class="plantel-current">
                  <span id="plantel-login-value" class="plantel-current-code">{{ selectedPlantel }}</span>
                  <span class="plantel-current-status" :class="`status-${selectedPlantelStatus.status}`">
                    <span class="plantel-status-dot" aria-hidden="true" />
                    {{ selectedPlantelStatus.message }}
                  </span>
                </span>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>

              <div
                v-if="plantelMenuOpen"
                class="plantel-options"
                role="listbox"
                aria-labelledby="plantel-login-label"
              >
                <button
                  v-for="plantel in PLANTELES_LIST"
                  :key="plantel"
                  type="button"
                  class="plantel-option"
                  :class="{
                    selected: plantel === selectedPlantel,
                    offline: getPlantelStatus(plantel).status === 'offline'
                  }"
                  role="option"
                  :aria-selected="plantel === selectedPlantel ? 'true' : 'false'"
                  @click="selectPlantel(plantel)"
                >
                  <span class="plantel-option-main">
                    <span class="plantel-option-code">{{ plantel }}</span>
                    <span class="plantel-option-message" :class="`status-${getPlantelStatus(plantel).status}`">
                      <span class="plantel-status-dot" aria-hidden="true" />
                      {{ getPlantelStatus(plantel).message }}
                    </span>
                  </span>
                  <span class="plantel-option-chip" :class="`status-${getPlantelStatus(plantel).status}`">
                    {{ getPlantelStatus(plantel).label }}
                  </span>
                </button>
              </div>
            </div>

            <p v-if="selectedPlantelStatus.status === 'offline'" class="plantel-status-note">
              <span aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 9v4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  <path d="M12 17h.01" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
                  <path d="M10.3 4.2 2.8 17.1A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.9L13.7 4.2a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
                </svg>
              </span>
              <span>{{ offlinePlantelNote }}</span>
            </p>
          </div>

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
              v-show="authPhase !== 'loadingGoogle' && !isBusy"
              class="google-design-button"
              aria-hidden="true"
            >
              <span class="google-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
                  <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.54 10.54 0 0 0 12 1 11 11 0 0 0 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38Z" />
                </svg>
              </span>
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

          <div
            v-if="errorMsg"
            class="login-alert"
            :class="{ 'agent-unavailable': agentUnavailableError }"
            role="alert"
          >
            <strong>{{ loginErrorTitle }}</strong>
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


          <section class="updates-panel" aria-label="Actualizaciones del sistema">
            <div class="updates-summary">
              <span class="updates-title-group">
                <span class="updates-label">Actualizaciones</span>
                <span class="updates-meta">Última actualización {{ updatesLatestLabel }}</span>
              </span>
              <span class="updates-count-group">
                <span v-if="updatesPending" class="updates-loading-dot" aria-hidden="true" />
                <strong>{{ updatesTotalLabel }}</strong>
              </span>
            </div>

            <div class="updates-preview" aria-label="Últimas actualizaciones">
              <div v-if="updatesError" class="updates-empty compact">{{ updatesError }}</div>
              <div v-else-if="updatesPending && !loginUpdates.updates.length" class="updates-empty compact">Cargando actualizaciones…</div>
              <template v-else>
                <a
                  v-for="update in latestThreeUpdates"
                  :key="`preview-${update.sha || `${update.repo}-${update.date}-${update.title}`}`"
                  class="update-item compact"
                  :href="update.url || update.repoUrl || undefined"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span class="update-topline">
                    <span class="update-repo">{{ update.relativeDateLabel }}</span>
                    <span v-if="update.isNew" class="update-new">NUEVO</span>
                  </span>
                  <strong>{{ update.title }}</strong>
                </a>
              </template>
            </div>

            <button
              v-if="loginUpdates.updates.length > 3"
              type="button"
              class="updates-more-button"
              @click="updatesModalOpen = true"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M14 4h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M20 4 10 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M11 5H7a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              Ver más actualizaciones
            </button>
          </section>

          <p class="policy-line">
            <span class="policy-secure">
              <span class="policy-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 3.5 5.5 6.2v5.3c0 4.1 2.7 7.8 6.5 9 3.8-1.2 6.5-4.9 6.5-9V6.2L12 3.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
                  <path d="m9.5 12.1 1.6 1.6 3.5-3.7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              Plataforma segura, estable y siempre disponible para ti.
            </span>

            <span class="policy-support">
              <span>¿Necesitas ayuda?</span>
              <a href="mailto:soporte@casitaiedis.edu.mx">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 13a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  <path d="M4 13v3a2 2 0 0 0 2 2h1v-7H6a2 2 0 0 0-2 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
                  <path d="M20 13v3a2 2 0 0 1-2 2h-1v-7h1a2 2 0 0 1 2 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
                  <path d="M14 20h2a4 4 0 0 0 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
                Contactar soporte
              </a>
            </span>
          </p>
        </div>
      </section>
    </section>

  <div v-if="updatesModalOpen" class="updates-modal-backdrop" @click.self="updatesModalOpen = false">
    <section class="updates-modal" role="dialog" aria-modal="true" aria-label="Historial de actualizaciones">
      <header class="updates-modal-header">
        <div>
          <span class="updates-modal-kicker">Actualizaciones</span>
          <h2>{{ updatesTotalLabel }}</h2>
          <p>Última actualización {{ updatesLatestLabel }}</p>
        </div>
        <button type="button" class="updates-modal-close" aria-label="Cerrar" @click="updatesModalOpen = false">
          ×
        </button>
      </header>

      <label class="updates-search updates-modal-search" for="login-updates-modal-search">
        <span aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="m21 21-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2" />
          </svg>
        </span>
        <input
          id="login-updates-modal-search"
          v-model="updatesSearch"
          type="search"
          placeholder="Buscar actualización"
          autocomplete="off"
        >
      </label>

      <div class="updates-modal-list">
        <a
          v-for="update in filteredUpdates"
          :key="`modal-${update.sha || `${update.repo}-${update.date}-${update.title}`}`"
          class="update-item"
          :href="update.url || update.repoUrl || undefined"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="update-topline">
            <span class="update-repo">{{ update.relativeDateLabel }}</span>
            <span v-if="update.isNew" class="update-new">NUEVO</span>
          </span>
          <strong>{{ update.title }}</strong>
          <small>
            {{ update.shortSha }}
          </small>
        </a>
      </div>
    </section>
  </div>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useCookie, useRoute, useRuntimeConfig } from '#app'
import { PLANTELES_LIST } from '~/utils/constants'
import { usePlantelAgentStatuses } from '~/composables/usePlantelAgentStatuses'

definePageMeta({ layout: false })

const PHASES = {
  loadingGoogle: {
    button: 'Cargando Google Workspace',
    status: 'Preparando acceso con Google.'
  },
  ready: {
    button: 'Continuar con Google Workspace',
    status: ''
  },
  google: {
    button: 'Continúa en Google Workspace',
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
    button: 'Continuar con Google Workspace',
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

const plantelSelectRef = ref(null)
const plantelMenuOpen = ref(false)
const { getPlantelStatus, loadPlantelStatuses } = usePlantelAgentStatuses()

const selectedPlantelStatus = computed(() => getPlantelStatus(selectedPlantel.value))
const offlinePlantelNote = computed(() => (
  'Puedes continuar con Google. Solo las funciones financieras que dependen del equipo local requerirán que el plantel esté en línea.'
))
const agentUnavailableError = computed(() => /La base del plantel no est[aá] disponible|fuera de l[ií]nea|conectividad del equipo/i.test(errorMsg.value))
const loginErrorTitle = computed(() => (
  agentUnavailableError.value ? 'El plantel seleccionado está fuera de línea.' : 'No se pudo iniciar sesión.'
))

const isBusy = computed(() => ['server', 'session', 'redirecting'].includes(authPhase.value))
const primaryButtonText = computed(() => (PHASES[authPhase.value] || PHASES.ready).button)
const statusText = computed(() => (PHASES[authPhase.value] || PHASES.ready).status)

const updatesOpen = ref(false)
const updatesPending = ref(false)
const updatesError = ref('')
const updatesSearch = ref('')
const updatesModalOpen = ref(false)
useModalEscape(() => { updatesModalOpen.value = false }, { enabled: updatesModalOpen })
const loginUpdates = ref({
  ok: false,
  configured: false,
  totalCount: 0,
  lastUpdatedLabel: 'sin datos',
  updates: []
})
const updatesNumberFormatter = new Intl.NumberFormat('es-MX')

const updatesTotalLabel = computed(() => (
  updatesPending.value && !loginUpdates.value.totalCount
    ? 'Cargando'
    : updatesNumberFormatter.format(Number(loginUpdates.value.totalCount || 0))
))
const updatesLatestLabel = computed(() => loginUpdates.value.lastUpdatedLabel || 'sin datos')
const filteredUpdates = computed(() => {
  const query = updatesSearch.value.trim().toLowerCase()
  const updates = Array.isArray(loginUpdates.value.updates) ? loginUpdates.value.updates : []

  if (!query) return updates

  return updates.filter((update) => {
    const haystack = [update.title, update.description, update.repo, update.shortSha]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(query)
  })
})
const filteredUpdatesPreview = computed(() => filteredUpdates.value.slice(0, 3))
const latestThreeUpdates = computed(() => (Array.isArray(loginUpdates.value.updates) ? loginUpdates.value.updates : []).slice(0, 3))

const toggleUpdatesPanel = () => {
  updatesOpen.value = !updatesOpen.value
}

const loadLoginUpdates = async () => {
  updatesPending.value = true
  updatesError.value = ''

  try {
    const result = await $fetch('/api/login/updates')
    loginUpdates.value = result || loginUpdates.value

    if (result?.error) {
      updatesError.value = result.error
    }
  } catch (error) {
    updatesError.value = error?.data?.message || error?.message || 'No se pudieron cargar las actualizaciones.'
  } finally {
    updatesPending.value = false
  }
}

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

const openPlantelMenu = () => {
  if (isBusy.value) return

  plantelMenuOpen.value = true
  loadPlantelStatuses({ force: true })
}

const closePlantelMenu = () => {
  plantelMenuOpen.value = false
}

const togglePlantelMenu = () => {
  if (plantelMenuOpen.value) {
    closePlantelMenu()
    return
  }

  openPlantelMenu()
}

const selectPlantel = (plantel) => {
  if (!PLANTELES_LIST.includes(plantel)) return

  selectedPlantel.value = plantel
  errorMsg.value = ''
  persistSelectedPlantel()
  closePlantelMenu()
  loadPlantelStatuses({ force: true, plantel })
}

const handleDocumentPointerDown = (event) => {
  if (!plantelMenuOpen.value || !plantelSelectRef.value) return
  if (plantelSelectRef.value.contains(event.target)) return

  closePlantelMenu()
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
  const buttonWidth = Math.round(buttonTarget.getBoundingClientRect().width || 456)

  window.google.accounts.id.renderButton(
    buttonTarget,
    {
      theme: 'outline',
      size: 'large',
      shape: 'rectangular',
      text: 'continue_with',
      logo_alignment: 'left',
      width: Math.max(240, Math.min(520, buttonWidth))
    }
  )

  if (!errorMsg.value) setPhase('ready', 0)
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  loadPersistedPlantel()
  loadPlantelStatuses({ force: true, plantel: selectedPlantel.value })
  loadLoginUpdates()

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
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  clearGoogleIntentTimer()
})
</script>

<style scoped>
.login-page {
  --login-page-y: clamp(10px, 1.65dvh, 18px);
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--login-page-y) clamp(12px, 1.6vw, 26px);
  color: #14223d;
  background:
    radial-gradient(circle at 50% 0%, rgba(33, 62, 116, 0.05), transparent 25rem),
    linear-gradient(135deg, #f8fbfc 0%, #f5f8fa 52%, #fbfdfb 100%);
}

.login-shell {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: min(100%, 1530px);
  height: min(860px, calc(100dvh - var(--login-page-y) - var(--login-page-y)));
  min-height: 0;
  overflow: hidden;
  border: 1px solid #dbe4ec;
  border-radius: 13px;
  background: #ffffff;
  box-shadow: 0 26px 78px rgba(15, 32, 62, 0.12);
}

.brand-panel {
  position: relative;
  display: flex;
  justify-content: center;
  overflow: hidden;
  border-right: 1px solid rgba(219, 228, 236, 0.78);
  background:
    radial-gradient(circle at 99% 50%, transparent 0 8.5rem, rgba(226, 241, 219, 0.58) 8.6rem 12.1rem, transparent 12.2rem),
    radial-gradient(circle at 100% 51%, transparent 0 21.2rem, rgba(213, 236, 203, 0.45) 21.3rem 25.6rem, transparent 25.7rem),
    radial-gradient(circle at 10% 108%, rgba(151, 194, 129, 0.28), transparent 13rem),
    linear-gradient(145deg, #f5fbf3 0%, #f8fcf6 56%, #edf8e9 100%);
}

.brand-panel::before,
.brand-panel::after {
  content: '';
  position: absolute;
  pointer-events: none;
}

.brand-panel::before {
  left: -8px;
  bottom: -10px;
  width: 240px;
  height: 178px;
  opacity: 0.38;
  background-image: radial-gradient(circle, rgba(111, 166, 86, 0.32) 0 3px, transparent 3.8px);
  background-size: 27px 27px;
}

.brand-panel::after {
  top: 199px;
  right: 83px;
  width: 116px;
  height: 64px;
  opacity: 0.4;
  background-image:
    radial-gradient(circle, rgba(72, 132, 74, 0.36) 0 3px, transparent 3.7px),
    radial-gradient(circle, rgba(72, 132, 74, 0.28) 0 2px, transparent 2.8px);
  background-position: 0 0, 52px 28px;
  background-size: 72px 42px, 62px 40px;
}

.brand-content {
  position: relative;
  z-index: 1;
  display: flex;
  width: min(100%, clamp(400px, 31.5vw, 480px));
  height: 100%;
  flex-direction: column;
  align-items: flex-start;
  padding: clamp(44px, 7.6dvh, 88px) 0 clamp(42px, 7dvh, 91px);
}

.brand-logo {
  display: block;
  width: clamp(150px, 12.7vw, 194px);
  height: auto;
  align-self: center;
  object-fit: contain;
}

.brand-system-logo {
  display: block;
  width: clamp(330px, 31.4vw, 480px);
  max-width: 100%;
  height: auto;
  margin: clamp(24px, 4.3dvh, 44px) auto 0;
  object-fit: contain;
}

.brand-copy {
  width: 100%;
  margin-top: auto;
  margin-bottom: clamp(20px, 3.5dvh, 38px);
}

.brand-copy h1 {
  margin: 0;
  color: #14223d;
  font-size: clamp(2rem, 4.6dvh, 2.55rem);
  font-weight: 850;
  line-height: 1.22;
  letter-spacing: -0.035em;
}

.brand-copy h1 span {
  color: #218138;
}

.brand-copy p {
  max-width: 426px;
  margin: clamp(14px, 2.35dvh, 24px) 0 0;
  color: #546076;
  font-size: clamp(14.5px, 1.08vw, 16.5px);
  font-weight: 650;
  line-height: 1.6;
  letter-spacing: 0.004em;
}

.secure-card {
  display: inline-flex;
  align-items: center;
  gap: clamp(14px, 1.35vw, 20px);
  width: min(424px, 100%);
  min-height: clamp(94px, 14.2dvh, 135px);
  border: 1px solid rgba(219, 228, 236, 0.8);
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.86);
  padding: clamp(17px, 2.35dvh, 24px) clamp(20px, 1.85vw, 28px);
  box-shadow: 0 18px 42px rgba(29, 57, 95, 0.055);
  backdrop-filter: blur(6px);
}

.secure-icon {
  display: inline-grid;
  width: clamp(50px, 6.9dvh, 70px);
  height: clamp(50px, 6.9dvh, 70px);
  place-items: center;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #e4f4df;
  color: #21843a;
}

.secure-icon svg {
  width: clamp(26px, 3.5dvh, 34px);
  height: clamp(26px, 3.5dvh, 34px);
}

.secure-copy {
  display: block;
}

.secure-card strong {
  display: block;
  color: #16243f;
  font-size: clamp(15.5px, 1.1vw, 17px);
  font-weight: 850;
  line-height: 1.35;
}

.secure-card small {
  display: block;
  margin-top: clamp(6px, 1.1dvh, 9px);
  color: #4f5b70;
  font-size: clamp(13.2px, 0.96vw, 14.8px);
  font-weight: 600;
  line-height: 1.48;
}

.auth-panel {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow: hidden;
  background: #ffffff;
  padding: clamp(20px, 3.4dvh, 30px) clamp(28px, 2.7vw, 40px) clamp(18px, 3dvh, 28px);
}

.auth-content {
  display: flex;
  width: min(100%, 616px);
  height: 100%;
  flex-direction: column;
  transform: none;
}

.auth-kicker {
  display: inline-flex;
  align-items: center;
  gap: clamp(16px, 1.55vw, 24px);
  margin-bottom: clamp(16px, 3.9dvh, 36px);
  color: #218239;
  font-size: clamp(12px, 0.9vw, 13.5px);
  font-weight: 850;
  line-height: 1;
  letter-spacing: 0.32em;
  text-transform: uppercase;
}

.auth-kicker span {
  display: inline-grid;
  width: clamp(36px, 5.4dvh, 50px);
  height: clamp(36px, 5.4dvh, 50px);
  place-items: center;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #e8f5e4;
  color: #21843a;
}

.auth-kicker svg {
  width: clamp(17px, 2.35dvh, 22px);
  height: clamp(17px, 2.35dvh, 22px);
}

.auth-content h2 {
  margin: 0;
  color: #14223d;
  font-size: clamp(2.25rem, 6dvh, 3.45rem);
  font-weight: 850;
  line-height: 1.02;
  letter-spacing: -0.045em;
}

.auth-subtitle {
  margin: clamp(10px, 1.65dvh, 15px) 0 clamp(20px, 4.25dvh, 42px);
  color: #667185;
  font-size: clamp(15px, 1.1vw, 17px);
  font-weight: 700;
  line-height: 1.4;
}

.plantel-field {
  position: relative;
  display: block;
}

.plantel-label {
  display: block;
  margin-bottom: clamp(7px, 1.2dvh, 10px);
  color: #16243f;
  font-size: clamp(14px, 0.98vw, 15px);
  font-weight: 850;
  line-height: 1.25;
}

.plantel-picker {
  position: relative;
}

.plantel-select-shell {
  position: relative;
  display: flex;
  width: 100%;
  height: clamp(58px, 8.15dvh, 77px);
  align-items: center;
  border: 1px solid #d8e0ea;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92), 0 8px 22px rgba(15, 32, 62, 0.035);
}

.plantel-select-button {
  justify-content: space-between;
  gap: 16px;
  padding: 0 clamp(18px, 1.55vw, 24px) 0 clamp(18px, 1.45vw, 22px);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.plantel-select-button:disabled {
  cursor: not-allowed;
  opacity: 0.72;
}

.plantel-select-button svg {
  width: 18px;
  height: 18px;
  color: #14223d;
  flex: 0 0 auto;
  transition: transform 0.18s ease;
}

.plantel-picker.open .plantel-select-button svg {
  transform: rotate(180deg);
}

.plantel-select-shell:focus-visible,
.plantel-picker.open .plantel-select-shell {
  border-color: rgba(33, 130, 57, 0.56);
  box-shadow: 0 0 0 4px rgba(33, 130, 57, 0.08), 0 8px 22px rgba(15, 32, 62, 0.04);
  outline: none;
}

.plantel-current {
  display: grid;
  min-width: 0;
  gap: clamp(5px, 0.85dvh, 8px);
}

.plantel-current-code {
  color: #218239;
  font-size: clamp(15.5px, 1.08vw, 17px);
  font-weight: 850;
  line-height: 1;
}

.plantel-current-status,
.plantel-option-message {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
  color: #667185;
  font-size: clamp(12px, 0.86vw, 13px);
  font-weight: 730;
  line-height: 1.25;
}

.plantel-status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #a7b1c0;
  box-shadow: 0 0 0 4px rgba(167, 177, 192, 0.16);
  flex: 0 0 auto;
}

.status-online {
  color: #218239;
}

.status-online .plantel-status-dot,
.plantel-option-message.status-online .plantel-status-dot {
  background: #21843a;
  box-shadow: 0 0 0 4px rgba(33, 132, 58, 0.13);
}

.status-offline {
  color: #bd3a32;
}

.status-offline .plantel-status-dot,
.plantel-option-message.status-offline .plantel-status-dot {
  background: #c7443c;
  box-shadow: 0 0 0 4px rgba(199, 68, 60, 0.13);
}

.status-unknown {
  color: #788296;
}

.plantel-options {
  position: absolute;
  z-index: 10;
  top: calc(100% + 10px);
  left: 0;
  right: 0;
  display: grid;
  max-height: 312px;
  overflow-y: auto;
  gap: 4px;
  border: 1px solid #dbe4ec;
  border-radius: 16px;
  background: #ffffff;
  padding: 8px;
  box-shadow: 0 24px 54px rgba(15, 32, 62, 0.14);
}

.plantel-option {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  padding: 12px 13px;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.plantel-option:hover,
.plantel-option.selected {
  background: #f4faf2;
}

.plantel-option.offline:hover,
.plantel-option.offline.selected {
  background: #fff7f6;
}

.plantel-option-main {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.plantel-option-code {
  color: #14223d;
  font-size: 15px;
  font-weight: 850;
  line-height: 1;
}

.plantel-option-message {
  white-space: normal;
}

.plantel-option-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 83px;
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 6px 9px;
  font-size: 11px;
  font-weight: 850;
  line-height: 1;
}

.plantel-option-chip.status-online {
  background: #eaf7e6;
  color: #218239;
}

.plantel-option-chip.status-offline {
  background: #fff1ef;
  color: #bd3a32;
}

.plantel-option-chip.status-unknown {
  background: #f1f4f8;
  color: #657083;
}

.plantel-status-note {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: clamp(8px, 1.3dvh, 12px) 0 0;
  border: 1px solid rgba(199, 68, 60, 0.18);
  border-radius: 13px;
  background: #fff8f7;
  padding: clamp(9px, 1.45dvh, 12px) 14px;
  color: #7f4039;
  font-size: clamp(11.6px, 0.83vw, 12.75px);
  font-weight: 720;
  line-height: 1.36;
}

.plantel-status-note span:first-child {
  display: inline-grid;
  width: 18px;
  height: 18px;
  place-items: center;
  flex: 0 0 auto;
  color: #c7443c;
  transform: translateY(1px);
}

.plantel-status-note svg {
  width: 18px;
  height: 18px;
}

.google-card {
  position: relative;
  width: 100%;
  height: clamp(58px, 8dvh, 75px);
  margin-top: clamp(16px, 2.85dvh, 28px);
}

.google-design-button,
.google-busy-row {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  border: 1px solid #d8e0ea;
  border-radius: 12px;
  background: #ffffff;
  color: #17263f;
  font-size: clamp(15.5px, 1.1vw, 17px);
  font-weight: 750;
  line-height: 1;
  box-shadow: 0 8px 22px rgba(15, 32, 62, 0.035);
}

.google-design-button {
  justify-content: center;
  gap: clamp(32px, 5vw, 76px);
  padding: 0 clamp(22px, 2vw, 30px);
}

.google-mark {
  display: inline-grid;
  width: clamp(22px, 2.75dvh, 26px);
  height: clamp(22px, 2.75dvh, 26px);
  place-items: center;
  flex: 0 0 auto;
  margin-left: -48px;
}

.google-mark svg {
  display: block;
  width: 100%;
  height: 100%;
}

.google-native-shell {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 13px;
  opacity: 0.01;
  cursor: pointer;
}

.google-native-shell.inactive {
  opacity: 0;
  pointer-events: none;
}

#google-btn {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
}

#google-btn :deep(div),
#google-btn :deep(iframe) {
  max-width: 100%;
}

#google-btn :deep(iframe) {
  transform: scaleY(1.58);
  transform-origin: center;
}

.google-busy-row {
  gap: 15px;
  justify-content: center;
  padding: 0 24px;
  color: #2869a8;
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
  gap: 10px;
  min-height: 20px;
  margin: clamp(8px, 1.55dvh, 14px) 0 0;
  color: #526b82;
  font-size: 13px;
  font-weight: 750;
}

.status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #21843a;
  box-shadow: 0 0 0 5px rgba(33, 132, 58, 0.12);
}

.login-alert {
  display: grid;
  gap: 5px;
  margin-top: 16px;
  border: 1px solid rgba(218, 62, 48, 0.2);
  border-radius: 14px;
  background: #fff4f1;
  padding: 15px 16px;
  color: #a83c2f;
  font-size: 13.5px;
  font-weight: 700;
  line-height: 1.45;
}

.login-alert.agent-unavailable {
  border-color: rgba(199, 68, 60, 0.2);
  background: #fff8f7;
  color: #863d36;
}

.login-alert strong {
  font-size: 14px;
  font-weight: 850;
}

.retry-button {
  width: 100%;
  height: 52px;
  margin-top: 14px;
  border: 1px solid rgba(33, 132, 58, 0.28);
  border-radius: 13px;
  background: #edf8eb;
  color: #218239;
  font-size: 14.5px;
  font-weight: 850;
  cursor: pointer;
}


.updates-panel {
  margin-top: clamp(16px, 3.15dvh, 32px);
  overflow: hidden;
  border: 1px solid rgba(33, 130, 57, 0.16);
  border-radius: 13px;
  background: linear-gradient(135deg, rgba(241, 250, 238, 0.96), rgba(247, 252, 255, 0.96));
  box-shadow: 0 14px 30px rgba(22, 36, 63, 0.055);
}

.updates-summary {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: clamp(14px, 2.25dvh, 21px) 21px clamp(8px, 1.35dvh, 12px);
}

.updates-title-group {
  display: grid;
  min-width: 0;
  gap: clamp(3px, 0.65dvh, 5px);
}

.updates-label {
  color: #1f7836;
  font-size: clamp(12.5px, 0.95vw, 14px);
  font-weight: 900;
  letter-spacing: 0.18em;
  line-height: 1;
  text-transform: uppercase;
}

.updates-meta {
  overflow: hidden;
  color: #5f6b80;
  font-size: clamp(11.5px, 0.82vw, 12.5px);
  font-weight: 720;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.updates-count-group {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  flex: 0 0 auto;
  color: #14223d;
}

.updates-count-group strong {
  border-radius: 999px;
  background: #21843a;
  padding: clamp(6px, 1.05dvh, 8px) 12px;
  color: #ffffff;
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
  box-shadow: 0 8px 18px rgba(33, 132, 58, 0.22);
}

.updates-loading-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #21843a;
  box-shadow: 0 0 0 0 rgba(33, 132, 58, 0.3);
  animation: pulseDot 1.1s ease-in-out infinite;
}

.updates-chevron {
  display: inline-grid;
  width: 24px;
  height: 24px;
  place-items: center;
  color: #21843a;
  transition: transform 0.18s ease;
}

.updates-chevron svg {
  width: 18px;
  height: 18px;
}

.updates-panel.open .updates-chevron {
  transform: rotate(180deg);
}

.updates-preview {
  display: grid;
  gap: clamp(6px, 1.05dvh, 9px);
  padding: 0 17px clamp(12px, 1.9dvh, 18px);
}

.update-item.compact {
  position: relative;
  gap: 3px;
  min-height: clamp(42px, 5.9dvh, 55px);
  padding: clamp(8px, 1.25dvh, 10px) 14px clamp(8px, 1.25dvh, 10px) 39px;
  border-radius: 10px;
}

.update-item.compact::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 17px;
  width: clamp(8px, 1.2dvh, 11px);
  height: clamp(8px, 1.2dvh, 11px);
  border-radius: 999px;
  background: #21843a;
  transform: translateY(-50%);
}

.update-item.compact strong {
  overflow: hidden;
  font-size: clamp(11.4px, 0.82vw, 12.2px);
  line-height: 1.22;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.updates-empty.compact {
  padding: 9px 10px;
  font-size: 11.5px;
}

.updates-body {
  display: grid;
  gap: 12px;
  border-top: 1px solid rgba(33, 130, 57, 0.13);
  padding: 0 14px 14px;
}

.updates-search {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  height: 40px;
  margin-top: 12px;
  border: 1px solid rgba(33, 130, 57, 0.18);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.86);
  padding: 0 12px;
  color: #21843a;
}

.updates-search svg {
  display: block;
  width: 17px;
  height: 17px;
}

.updates-search input {
  width: 100%;
  border: 0;
  background: transparent;
  color: #17263f;
  font: inherit;
  font-size: 13px;
  font-weight: 720;
  outline: none;
}

.updates-search input::placeholder {
  color: #8a95a8;
}

.updates-list {
  display: grid;
  max-height: 216px;
  overflow-y: auto;
  gap: 8px;
  padding-right: 2px;
}

.updates-more-button {
  display: inline-flex;
  width: calc(100% - 28px);
  min-height: clamp(34px, 4.85dvh, 43px);
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin: 0 14px clamp(10px, 1.5dvh, 13px);
  border: 1px solid rgba(33, 132, 58, 0.18);
  border-radius: 9px;
  background: linear-gradient(135deg, rgba(238, 249, 235, 0.94), rgba(255, 255, 255, 0.94));
  padding: clamp(8px, 1.4dvh, 12px);
  color: #21843a;
  font-size: clamp(12px, 0.88vw, 13px);
  font-weight: 900;
  letter-spacing: 0.02em;
  cursor: pointer;
}

.updates-more-button svg {
  width: clamp(17px, 2.2dvh, 20px);
  height: clamp(17px, 2.2dvh, 20px);
}

.updates-more-button:hover {
  border-color: rgba(33, 132, 58, 0.42);
  box-shadow: 0 12px 24px rgba(22, 36, 63, 0.08);
}

.updates-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: rgba(13, 24, 42, 0.48);
  padding: 24px;
  backdrop-filter: blur(10px);
}

.updates-modal {
  width: min(560px, 100%);
  max-height: min(720px, calc(100vh - 48px));
  overflow: hidden;
  border: 1px solid rgba(216, 224, 234, 0.96);
  border-radius: 24px;
  background: linear-gradient(180deg, #ffffff, #f7fbf6);
  box-shadow: 0 28px 72px rgba(16, 30, 52, 0.28);
  color: #17263f;
}

.updates-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid rgba(216, 224, 234, 0.74);
  padding: 20px 20px 16px;
}

.updates-modal-kicker {
  color: #21843a;
  font-size: 11px;
  font-weight: 950;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.updates-modal-header h2 {
  margin: 2px 0 2px;
  color: #17263f;
  font-size: 26px;
  font-weight: 950;
}

.updates-modal-header p {
  margin: 0;
  color: #687489;
  font-size: 12px;
  font-weight: 750;
}

.updates-modal-close {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(216, 224, 234, 0.92);
  border-radius: 999px;
  background: #ffffff;
  color: #42526a;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.updates-modal-search {
  margin: 14px 20px 0;
}

.updates-modal-list {
  display: grid;
  max-height: 480px;
  overflow-y: auto;
  gap: 8px;
  padding: 14px 20px 20px;
}


.update-item {
  display: grid;
  gap: 6px;
  border: 1px solid rgba(216, 224, 234, 0.9);
  border-radius: 13px;
  background: #ffffff;
  padding: 12px;
  color: inherit;
  text-decoration: none;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.update-item:hover {
  border-color: rgba(33, 132, 58, 0.34);
  box-shadow: 0 12px 24px rgba(22, 36, 63, 0.08);
  transform: translateY(-1px);
}

.update-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.update-repo {
  overflow: hidden;
  color: #21843a;
  font-size: 11px;
  font-weight: 850;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.update-new {
  flex: 0 0 auto;
  border-radius: 999px;
  background: linear-gradient(135deg, #1f8f45, #73bd45);
  padding: 4px 7px;
  color: #ffffff;
  font-size: 9.5px;
  font-weight: 950;
  letter-spacing: 0.08em;
  line-height: 1;
}

.update-item strong {
  color: #17263f;
  font-size: 13.5px;
  font-weight: 850;
  line-height: 1.3;
}

.update-item small {
  color: #687489;
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1.25;
}

.updates-empty {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  padding: 13px;
  color: #667185;
  font-size: 12.5px;
  font-weight: 720;
  line-height: 1.4;
}

.policy-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: clamp(14px, 1.65vw, 24px);
  margin: auto 0 0;
  color: #667185;
  font-size: clamp(11.5px, 0.84vw, 12.8px);
  font-weight: 650;
  line-height: 1.4;
}

.policy-secure,
.policy-support,
.policy-support a {
  display: inline-flex;
  align-items: center;
}

.policy-secure {
  min-width: 0;
  gap: 13px;
}

.policy-icon {
  display: inline-grid;
  width: clamp(20px, 2.35dvh, 24px);
  height: clamp(20px, 2.35dvh, 24px);
  place-items: center;
  flex: 0 0 auto;
  color: #21843a;
}

.policy-support {
  gap: clamp(12px, 1.2vw, 18px);
  flex: 0 0 auto;
}

.policy-support a {
  gap: 8px;
  color: #218239;
  font-weight: 850;
  text-decoration: none;
}

.policy-support a:hover {
  text-decoration: underline;
}

.policy-support svg {
  width: 19px;
  height: 19px;
}

.policy-icon svg {
  width: 100%;
  height: 100%;
}

@keyframes pulseDot {
  0%, 100% {
    opacity: 0.58;
    box-shadow: 0 0 0 0 rgba(33, 132, 58, 0.3);
  }
  50% {
    opacity: 1;
    box-shadow: 0 0 0 7px rgba(33, 132, 58, 0);
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}


@media (max-width: 1180px) {
  .login-page {
    --login-page-y: clamp(10px, 1.5dvh, 16px);
    padding-right: clamp(12px, 1.8vw, 20px);
    padding-left: clamp(12px, 1.8vw, 20px);
  }

  .login-shell {
    height: min(760px, calc(100dvh - var(--login-page-y) - var(--login-page-y)));
    min-height: 0;
  }

  .brand-content {
    width: min(100%, 400px);
    padding: clamp(34px, 6.2dvh, 54px) 0 clamp(34px, 6.6dvh, 64px);
  }

  .brand-system-logo {
    width: clamp(300px, 30vw, 350px);
  }

  .secure-card {
    width: 100%;
  }

  .auth-content {
    transform: none;
  }
}

@media (min-width: 901px) and (max-height: 820px) {
  .login-page {
    --login-page-y: 10px;
  }

  .login-shell {
    height: calc(100dvh - 20px);
  }

  .brand-content {
    padding-top: clamp(30px, 5.4dvh, 44px);
    padding-bottom: clamp(28px, 4.9dvh, 42px);
  }

  .brand-logo {
    width: clamp(128px, 10.4vw, 150px);
  }

  .brand-system-logo {
    width: clamp(282px, 26vw, 330px);
    margin-top: clamp(16px, 3dvh, 24px);
  }

  .brand-copy {
    margin-bottom: clamp(14px, 2.5dvh, 20px);
  }

  .brand-copy h1 {
    font-size: clamp(1.8rem, 4.4dvh, 2rem);
  }

  .brand-copy p {
    margin-top: clamp(9px, 1.7dvh, 14px);
    font-size: clamp(13.2px, 0.95vw, 14.5px);
    line-height: 1.48;
  }

  .secure-card {
    min-height: clamp(78px, 12.5dvh, 94px);
    padding: clamp(12px, 2.1dvh, 17px) clamp(16px, 1.45vw, 20px);
  }

  .secure-icon {
    width: clamp(42px, 6.2dvh, 50px);
    height: clamp(42px, 6.2dvh, 50px);
  }

  .secure-card strong {
    font-size: clamp(14px, 1vw, 15.5px);
  }

  .secure-card small {
    margin-top: clamp(4px, 0.8dvh, 6px);
    font-size: clamp(12.4px, 0.9vw, 13.2px);
    line-height: 1.36;
  }

  .auth-panel {
    padding-top: clamp(16px, 2.5dvh, 20px);
    padding-bottom: clamp(14px, 2.3dvh, 18px);
  }

  .auth-kicker {
    margin-bottom: clamp(12px, 2dvh, 16px);
  }

  .auth-content h2 {
    font-size: clamp(2.05rem, 5.8dvh, 2.25rem);
  }

  .auth-subtitle {
    margin-bottom: clamp(16px, 2.6dvh, 20px);
  }

  .plantel-select-shell,
  .google-card {
    height: clamp(52px, 7.25dvh, 58px);
  }

  .plantel-status-note {
    margin-top: 8px;
    padding-top: clamp(7px, 1.25dvh, 9px);
    padding-bottom: clamp(7px, 1.25dvh, 9px);
    line-height: 1.3;
  }

  .google-card {
    margin-top: clamp(12px, 2.15dvh, 16px);
  }

  .updates-panel {
    margin-top: clamp(10px, 1.85dvh, 16px);
  }

  .updates-summary {
    padding: clamp(10px, 1.7dvh, 14px) 18px clamp(6px, 1dvh, 8px);
  }

  .updates-preview {
    gap: clamp(5px, 0.75dvh, 6px);
    padding: 0 14px clamp(8px, 1.4dvh, 12px);
  }

  .update-item.compact {
    min-height: clamp(34px, 5.05dvh, 42px);
    padding: clamp(6px, 1dvh, 8px) 12px clamp(6px, 1dvh, 8px) 34px;
  }

  .update-item.compact::before {
    left: 15px;
    width: clamp(7px, 1.05dvh, 8px);
    height: clamp(7px, 1.05dvh, 8px);
  }

  .update-topline {
    gap: 8px;
  }

  .update-new {
    padding: 3px 6px;
    font-size: 8.8px;
  }

  .updates-more-button {
    min-height: clamp(29px, 4.1dvh, 34px);
    margin-bottom: clamp(7px, 1.2dvh, 10px);
    padding: clamp(6px, 1dvh, 8px);
  }

  .updates-more-button svg {
    width: 16px;
    height: 16px;
  }

  .policy-line {
    line-height: 1.25;
  }

  .policy-icon {
    width: 18px;
    height: 18px;
  }
}


@media (max-width: 900px) {
  .login-page {
    min-height: 100dvh;
    padding: 18px;
    place-items: start center;
  }

  .login-shell {
    grid-template-columns: 1fr;
    width: min(100%, 680px);
    height: auto;
    min-height: 0;
    max-height: none;
  }

  .brand-panel {
    border-right: 0;
    border-bottom: 1px solid rgba(219, 228, 236, 0.78);
  }

  .brand-content {
    width: min(100%, 480px);
    min-height: auto;
    padding: 38px 28px 42px;
  }

  .brand-logo {
    width: 154px;
  }

  .brand-system-logo {
    width: min(100%, 350px);
    margin-top: 32px;
  }

  .brand-copy {
    margin: 42px 0 28px;
  }

  .auth-panel {
    padding: 44px 28px 48px;
  }

  .auth-content {
    width: min(100%, 456px);
    height: auto;
  }

  .policy-line {
    align-items: flex-start;
    flex-direction: column;
    gap: 14px;
    margin-top: 34px;
  }

  .policy-support {
    flex-wrap: wrap;
    gap: 10px 16px;
  }
}

@media (max-width: 560px) {
  .login-page {
    padding: 0;
  }

  .login-shell {
    border-right: 0;
    border-left: 0;
    border-radius: 0;
  }

  .brand-content,
  .auth-panel {
    padding-right: 20px;
    padding-left: 20px;
  }

  .brand-copy h1 {
    font-size: 1.9rem;
  }

  .brand-copy p,
  .secure-card small,
  .policy-line {
    font-size: 14px;
  }

  .secure-card {
    gap: 14px;
    padding: 18px;
  }

  .secure-icon {
    width: 52px;
    height: 52px;
  }

  .auth-kicker {
    gap: 16px;
    font-size: 12px;
    letter-spacing: 0.24em;
  }

  .auth-content h2 {
    font-size: 2.25rem;
  }

  .auth-subtitle {
    margin-bottom: 38px;
  }

  .plantel-select-shell,
  .google-card {
    height: 62px;
  }

  .google-design-button {
    gap: 24px;
    justify-content: flex-start;
    font-size: 15px;
    padding: 0 24px;
  }

  .google-mark {
    margin-left: 0;
  }

  .policy-line {
    margin-left: 0;
  }
}
</style>
