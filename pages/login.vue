<template>
  <div class="min-h-screen flex items-center justify-center bg-[#F4F6F8] px-4 font-sans relative overflow-hidden">
    <div class="absolute top-[-10%] left-[-10%] w-96 h-96 bg-brand-leaf/20 rounded-full blur-3xl pointer-events-none"></div>
    <div class="absolute bottom-[-10%] right-[-10%] w-[30rem] h-[30rem] bg-brand-campus/10 rounded-full blur-3xl pointer-events-none"></div>

    <div class="max-w-md w-full bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white p-10 text-center relative z-10">
      <img
        src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp"
        alt="Logo Institucional"
        class="h-16 mx-auto mb-6"
      />

      <h1 class="text-xl font-bold text-gray-800 mb-2 tracking-tight">Sistema de Ingresos 2</h1>
      <p class="text-gray-500 mb-6 text-sm font-medium">Inicie sesión con su cuenta institucional.</p>

      <div class="text-left mb-4">
        <label class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">
          Plantel
        </label>

        <select
          v-model="selectedPlantel"
          class="input-field w-full font-bold text-brand-campus bg-white"
          @change="persistSelectedPlantel"
        >
          <option v-for="plantel in PLANTELES_LIST" :key="plantel" :value="plantel">
            {{ plantel }}
          </option>
        </select>

        <p class="text-[11px] text-gray-400 mt-1.5">
          El plantel seleccionado decide qué base local se usará para iniciar sesión.
        </p>
      </div>

      <div class="flex justify-center w-full min-h-[44px] mb-4 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div id="google-btn" class="w-full flex justify-center"></div>
      </div>

      <p
        v-if="errorMsg"
        class="mt-4 text-xs text-accent-coral font-semibold bg-accent-coral/10 py-2 px-3 rounded-md"
      >
        {{ errorMsg }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useCookie, useRoute, useRuntimeConfig } from '#app'
import { PLANTELES_LIST } from '~/utils/constants'

definePageMeta({ layout: false })

const errorMsg = ref('')
const config = useRuntimeConfig()
const route = useRoute()

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

onMounted(() => {
  loadPersistedPlantel()

  if (!config.public.googleClientId) {
    errorMsg.value = 'Error: Credenciales no configuradas.'
    return
  }

  const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]')

  const initializeGoogle = () => {
    window.google.accounts.id.initialize({
      client_id: config.public.googleClientId,
      callback: async (response) => {
        errorMsg.value = ''
        persistSelectedPlantel()

        try {
          await $fetch('/api/auth/login', {
            method: 'POST',
            headers: {
              'x-db-agent-id': selectedPlantel.value
            },
            body: {
              credential: response.credential,
              plantel: selectedPlantel.value
            }
          })

          window.location.href = '/'
        } catch (e) {
          errorMsg.value = 'Credenciales no autorizadas o plantel no disponible.'
        }
      }
    })

    window.google.accounts.id.renderButton(
      document.getElementById('google-btn'),
      { theme: 'outline', size: 'large', width: 300 }
    )
  }

  if (existingScript && window.google?.accounts?.id) {
    initializeGoogle()
    return
  }

  const script = document.createElement('script')
  script.src = 'https://accounts.google.com/gsi/client'
  script.async = true
  script.defer = true
  script.onload = initializeGoogle
  document.head.appendChild(script)
})
</script>