<template>
  <div v-if="isVisible" class="fixed bottom-6 left-6 z-[9990] flex items-end">
    
    <div v-if="!isExpanded" 
         @click="isExpanded = true"
         class="bg-white/95 backdrop-blur-md shadow-lg border border-gray-200 rounded-full w-10 h-10 flex items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors relative group">
      
      <LucideRefreshCcw v-if="isProcessing" :size="18" class="text-brand-campus animate-spin" />
      <LucideCheckCircle v-else-if="status === 'completed'" :size="18" class="text-brand-leaf" />
      <LucideAlertCircle v-else-if="status === 'error'" :size="18" class="text-accent-coral" />
      <LucideServer v-else :size="18" class="text-gray-500" />
      
      <span v-if="isProcessing" class="absolute -top-1 -right-1 w-3 h-3 bg-brand-campus rounded-full border-2 border-white animate-pulse"></span>
      
      <div class="absolute left-12 bg-gray-800 text-white text-[10px] font-semibold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
        Estado de sincronización
      </div>
    </div>

    <div v-else class="bg-white/95 backdrop-blur-xl shadow-xl border border-gray-200 rounded-2xl w-72 overflow-hidden flex flex-col animate-[slideUp_0.2s_ease-out]">
      <div class="px-4 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <h3 class="text-xs font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2">
          <LucideServer :size="14" class="text-gray-400" />
          Sincronización Base
        </h3>
        <button @click="isExpanded = false" class="text-gray-400 hover:text-gray-600 transition-colors">
          <LucideX :size="16" />
        </button>
      </div>
      
      <div class="p-4 space-y-3">
        <div class="flex items-center gap-3">
          <div :class="['w-8 h-8 rounded-full flex items-center justify-center shrink-0', statusColorClass]">
            <LucideRefreshCcw v-if="isProcessing" :size="14" class="animate-spin text-white" />
            <LucideCheck v-else-if="status === 'completed'" :size="14" class="text-white" />
            <LucideX v-else-if="status === 'error' || status === 'cancelled'" :size="14" class="text-white" />
            <LucideCloud v-else :size="14" class="text-white" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-bold text-gray-800 truncate">{{ statusLabel }}</p>
            <p class="text-[10px] font-medium text-gray-500 truncate" :title="message">{{ message || 'Conectando al servicio...' }}</p>
          </div>
        </div>

        <div v-if="isProcessing" class="space-y-1.5">
          <div class="flex justify-between text-[10px] font-semibold text-gray-500">
            <span>Progreso</span>
            <span>{{ Math.round(progressPercentage) }}% ({{ processed }}/{{ total }})</span>
          </div>
          <div class="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div class="h-full bg-brand-campus rounded-full transition-all duration-300" :style="{ width: `${progressPercentage}%` }"></div>
          </div>
        </div>

        <div v-if="status !== 'none' && status !== 'fetching'" class="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100">
          <div class="text-center bg-gray-50 rounded py-1.5">
            <div class="text-[10px] font-semibold text-gray-400 uppercase">Nuevos</div>
            <div class="text-sm font-bold text-brand-leaf font-mono">{{ updated }}</div>
          </div>
          <div class="text-center bg-gray-50 rounded py-1.5">
            <div class="text-[10px] font-semibold text-gray-400 uppercase">Sin Cambios</div>
            <div class="text-sm font-bold text-gray-600 font-mono">{{ skipped }}</div>
          </div>
          <div class="text-center bg-gray-50 rounded py-1.5">
            <div class="text-[10px] font-semibold text-gray-400 uppercase">Errores</div>
            <div class="text-sm font-bold text-accent-coral font-mono">{{ errors }}</div>
          </div>
        </div>

        <div v-if="lastSyncedText && !isProcessing" class="text-[9px] text-gray-400 text-center pt-1">
          Última vez: {{ lastSyncedText }}
        </div>
      </div>

      <div class="px-4 py-3 bg-gray-50/80 border-t border-gray-100 flex gap-2">
        <button v-if="isProcessing" @click="cancelSync" class="btn btn-ghost w-full !text-accent-coral hover:!bg-accent-coral/10 text-xs !h-8" :disabled="cancelling">
          {{ cancelling ? 'Cancelando...' : 'Detener proceso' }}
        </button>
        <button v-else @click="startSync" class="btn btn-outline w-full text-xs !h-8" :disabled="starting">
          <LucideRefreshCcw :size="12" :class="{'animate-spin': starting}" /> {{ starting ? 'Iniciando...' : 'Forzar sincronización' }}
        </button>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCookie } from '#app'
import { LucideRefreshCcw, LucideCheckCircle, LucideAlertCircle, LucideServer, LucideX, LucideCheck, LucideCloud } from 'lucide-vue-next'

const isVisible = ref(false)
const isExpanded = ref(false)
const status = ref('none')
const total = ref(0)
const processed = ref(0)
const updated = ref(0)
const skipped = ref(0)
const errors = ref(0)
const message = ref('')
const lastSyncedAt = ref(null)

const starting = ref(false)
const cancelling = ref(false)
let pollInterval = null

const activePlantel = useCookie('auth_active_plantel')

const isProcessing = computed(() => ['running', 'fetching', 'processing'].includes(status.value))

const progressPercentage = computed(() => {
  if (total.value <= 0) return 0
  return Math.min(100, (processed.value / total.value) * 100)
})

const statusLabel = computed(() => {
  switch(status.value) {
    case 'fetching': return 'Conectando al API...'
    case 'processing': return 'Actualizando base local'
    case 'completed': return 'Sincronización al día'
    case 'cancelled': return 'Proceso interrumpido'
    case 'error': return 'Error de sincronización'
    default: return 'Sistema en espera'
  }
})

const statusColorClass = computed(() => {
  if (isProcessing.value) return 'bg-brand-campus'
  if (status.value === 'completed') return 'bg-brand-leaf'
  if (status.value === 'error' || status.value === 'cancelled') return 'bg-accent-coral'
  return 'bg-gray-400'
})

const lastSyncedText = computed(() => {
  if (!lastSyncedAt.value) return ''
  return new Date(lastSyncedAt.value).toLocaleString('es-MX')
})

const loadStatus = async () => {
  if (!activePlantel.value || activePlantel.value === 'GLOBAL') {
    isVisible.value = false
    return
  }

  isVisible.value = true

  try {
    const res = await $fetch('/api/sync/base/status')
    
    status.value = res.status
    total.value = res.total || 0
    processed.value = res.processed || 0
    updated.value = res.updated || 0
    skipped.value = res.skipped || 0
    errors.value = res.errors || 0
    message.value = res.message || ''
    
    if (res.started_at && ['completed', 'error', 'cancelled'].includes(res.status)) {
      lastSyncedAt.value = res.finished_at || res.started_at
    }

    // Auto start if stale (older than 12 hours) and idle
    if (!isProcessing.value && res.status !== 'error') {
      const isStale = !res.started_at || (new Date().getTime() - new Date(res.started_at).getTime() > 12 * 60 * 60 * 1000)
      if (isStale) {
        startSync()
      }
    }

    managePolling()

  } catch (e) {
    console.error('Error fetching sync status', e)
  }
}

const managePolling = () => {
  if (isProcessing.value) {
    if (!pollInterval) {
      pollInterval = setInterval(loadStatus, 3000)
    }
  } else {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }
}

const startSync = async () => {
  starting.value = true
  try {
    await $fetch('/api/sync/base/start', { method: 'POST' })
    status.value = 'fetching'
    message.value = 'Iniciando proceso seguro...'
    managePolling()
  } catch (e) {
    status.value = 'error'
    message.value = 'No se pudo iniciar la sincronización.'
  } finally {
    starting.value = false
  }
}

const cancelSync = async () => {
  cancelling.value = true
  try {
    await $fetch('/api/sync/base/cancel', { method: 'POST' })
    message.value = 'Deteniendo de forma segura...'
  } catch (e) {
    // ignore
  } finally {
    cancelling.value = false
  }
}

onMounted(() => {
  loadStatus()
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
})
</script>

<style scoped>
@keyframes slideUp {
  from { opacity: 0; transform: translateY(10px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
</style>