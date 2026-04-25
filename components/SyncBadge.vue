<template>
  <div v-if="isVisible" class="relative">
    <button
      type="button"
      @click="isExpanded = !isExpanded"
      class="h-[34px] inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs font-bold text-gray-700 shadow-none transition-colors hover:border-brand-leaf hover:bg-white"
      :title="buttonTitle"
    >
      <LucideRefreshCcw v-if="isProcessing || starting" :size="14" class="text-brand-campus animate-spin" />
      <LucideCheckCircle v-else-if="status === 'completed'" :size="14" class="text-brand-leaf" />
      <LucideAlertCircle v-else-if="status === 'error' || status === 'cancelled' || status === 'abandoned'" :size="14" class="text-accent-coral" />
      <LucideCloud v-else :size="14" class="text-gray-500" />

      <span class="hidden xl:inline">{{ compactLabel }}</span>
    </button>

    <div
      v-if="isExpanded"
      class="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[360px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl"
    >
      <div class="flex items-start justify-between gap-3 border-b border-gray-100 bg-gray-50/80 px-4 py-3">
        <div>
          <h3 class="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-700">
            <LucideServer :size="14" class="text-gray-400" />
            Sincronización Base
          </h3>
          <p class="mt-1 text-[10px] font-medium leading-snug text-gray-500">
            Modo sin polling: Vercel solo recibe solicitudes manuales.
          </p>
        </div>

        <button type="button" @click="isExpanded = false" class="text-gray-400 transition-colors hover:text-gray-600">
          <LucideX :size="16" />
        </button>
      </div>

      <div class="space-y-3 p-4">
        <div class="flex items-center gap-3">
          <div :class="['flex h-9 w-9 shrink-0 items-center justify-center rounded-full', statusColorClass]">
            <LucideRefreshCcw v-if="isProcessing || starting" :size="15" class="animate-spin text-white" />
            <LucideCheck v-else-if="status === 'completed'" :size="15" class="text-white" />
            <LucideX v-else-if="status === 'error' || status === 'cancelled' || status === 'abandoned'" :size="15" class="text-white" />
            <LucideCloud v-else :size="15" class="text-white" />
          </div>

          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-bold text-gray-800">{{ statusLabel }}</p>
            <p class="truncate text-[11px] font-medium text-gray-500" :title="message">
              {{ message || 'Sin consulta remota en esta sesión.' }}
            </p>
          </div>
        </div>

        <div v-if="isProcessing" class="space-y-1.5">
          <div class="flex justify-between text-[10px] font-semibold text-gray-500">
            <span>Progreso reportado</span>
            <span>{{ Math.round(progressPercentage) }}% ({{ processed }}/{{ total }})</span>
          </div>
          <div class="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div class="h-full rounded-full bg-brand-campus transition-all duration-300" :style="{ width: `${progressPercentage}%` }"></div>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
          <div class="rounded bg-gray-50 py-2 text-center">
            <div class="text-[10px] font-semibold uppercase text-gray-400">Actualizados</div>
            <div class="font-mono text-sm font-bold text-brand-leaf">{{ updated }}</div>
          </div>
          <div class="rounded bg-gray-50 py-2 text-center">
            <div class="text-[10px] font-semibold uppercase text-gray-400">Sin cambios</div>
            <div class="font-mono text-sm font-bold text-gray-600">{{ skipped }}</div>
          </div>
          <div class="rounded bg-gray-50 py-2 text-center">
            <div class="text-[10px] font-semibold uppercase text-gray-400">Errores</div>
            <div class="font-mono text-sm font-bold text-accent-coral">{{ errors }}</div>
          </div>
        </div>

        <div class="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-medium leading-relaxed text-amber-800">
          No se consulta automáticamente al abrir la app y no hay intervalos activos. Use “Consultar estado” solo cuando necesite validar la última ejecución.
        </div>

        <div v-if="lastSyncedText" class="text-center text-[10px] text-gray-400">
          Última finalización registrada: {{ lastSyncedText }}
        </div>
      </div>

      <div class="flex gap-2 border-t border-gray-100 bg-gray-50/80 px-4 py-3">
        <button
          type="button"
          @click="loadStatus"
          class="btn btn-outline flex-1 text-xs !h-8"
          :disabled="requestingStatus || starting || cancelling"
        >
          <LucideSearch :size="12" :class="{ 'animate-spin': requestingStatus }" />
          {{ requestingStatus ? 'Consultando...' : 'Consultar estado' }}
        </button>

        <button
          v-if="isProcessing || starting"
          type="button"
          @click="cancelSync"
          class="btn btn-ghost flex-1 text-xs !h-8 !text-accent-coral hover:!bg-accent-coral/10"
          :disabled="cancelling"
        >
          {{ cancelling ? 'Cancelando...' : 'Cancelar' }}
        </button>

        <button
          v-else
          type="button"
          @click="startSync"
          class="btn btn-secondary flex-1 text-xs !h-8"
          :disabled="requestingStatus || starting || cancelling"
        >
          <LucideRefreshCcw :size="12" :class="{ 'animate-spin': starting }" />
          {{ starting ? 'Sincronizando...' : 'Sincronizar ahora' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useCookie } from '#app'
import {
  LucideAlertCircle,
  LucideCheck,
  LucideCheckCircle,
  LucideCloud,
  LucideRefreshCcw,
  LucideSearch,
  LucideServer,
  LucideX
} from 'lucide-vue-next'

const status = ref('none')
const total = ref(0)
const processed = ref(0)
const updated = ref(0)
const skipped = ref(0)
const errors = ref(0)
const message = ref('')
const lastSyncedAt = ref(null)
const runId = ref(null)

const isExpanded = ref(false)
const starting = ref(false)
const cancelling = ref(false)
const requestingStatus = ref(false)

const activePlantel = useCookie('auth_active_plantel')

const isVisible = computed(() => Boolean(activePlantel.value && activePlantel.value !== 'GLOBAL'))
const isProcessing = computed(() => ['running', 'fetching', 'processing'].includes(status.value))

const storageKey = computed(() => `external-base-sync:${activePlantel.value || 'none'}`)

const progressPercentage = computed(() => {
  if (total.value <= 0) return 0
  return Math.min(100, (processed.value / total.value) * 100)
})

const compactLabel = computed(() => {
  if (starting.value) return 'Sincronizando'
  if (requestingStatus.value) return 'Consultando'
  if (status.value === 'completed') return 'Base al día'
  if (status.value === 'error') return 'Error sync'
  if (status.value === 'cancelled') return 'Sync cancelado'
  if (status.value === 'abandoned') return 'Sync abandonado'
  return 'Base externa'
})

const buttonTitle = computed(() => {
  return `${compactLabel.value}. No hay polling automático.`
})

const statusLabel = computed(() => {
  switch (status.value) {
    case 'running':
      return 'Preparando sincronización'
    case 'fetching':
      return 'Consultando matrícula externa'
    case 'processing':
      return 'Actualizando base local'
    case 'completed':
      return 'Sincronización finalizada'
    case 'cancelled':
      return 'Sincronización cancelada'
    case 'abandoned':
      return 'Ejecución anterior abandonada'
    case 'error':
      return 'Error de sincronización'
    case 'idle':
      return 'Sincronización no aplicable'
    default:
      return 'Sin consulta remota'
  }
})

const statusColorClass = computed(() => {
  if (isProcessing.value || starting.value) return 'bg-brand-campus'
  if (status.value === 'completed') return 'bg-brand-leaf'
  if (status.value === 'error' || status.value === 'cancelled' || status.value === 'abandoned') return 'bg-accent-coral'
  return 'bg-gray-400'
})

const lastSyncedText = computed(() => {
  if (!lastSyncedAt.value) return ''
  const parsed = new Date(lastSyncedAt.value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString('es-MX')
})

const persistState = () => {
  if (!process.client || !isVisible.value) return

  localStorage.setItem(storageKey.value, JSON.stringify({
    status: status.value,
    total: total.value,
    processed: processed.value,
    updated: updated.value,
    skipped: skipped.value,
    errors: errors.value,
    message: message.value,
    lastSyncedAt: lastSyncedAt.value,
    runId: runId.value,
    savedAt: new Date().toISOString()
  }))
}

const loadCachedState = () => {
  if (!process.client || !isVisible.value) return

  try {
    const raw = localStorage.getItem(storageKey.value)
    if (!raw) {
      resetState()
      return
    }

    const cached = JSON.parse(raw)
    applyStatusPayload(cached, false)
    console.info('[External Sync UI] Loaded cached status only. No network request was made.', {
      plantel: activePlantel.value,
      status: status.value,
      runId: runId.value
    })
  } catch (error) {
    console.warn('[External Sync UI] Failed to read cached sync status.', error)
    resetState()
  }
}

const resetState = () => {
  status.value = 'none'
  total.value = 0
  processed.value = 0
  updated.value = 0
  skipped.value = 0
  errors.value = 0
  message.value = ''
  lastSyncedAt.value = null
  runId.value = null
}

const applyStatusPayload = (payload, persist = true) => {
  status.value = payload?.status || 'none'
  total.value = Number(payload?.total ?? payload?.total_rows ?? 0)
  processed.value = Number(payload?.processed ?? payload?.processed_rows ?? 0)
  updated.value = Number(payload?.updated ?? payload?.updated_rows ?? 0)
  skipped.value = Number(payload?.skipped ?? payload?.skipped_rows ?? 0)
  errors.value = Number(payload?.errors ?? payload?.error_rows ?? 0)
  message.value = String(payload?.message || '')
  runId.value = payload?.run_id ?? payload?.id ?? null

  if (payload?.finished_at) {
    lastSyncedAt.value = payload.finished_at
  } else if (payload?.lastSyncedAt) {
    lastSyncedAt.value = payload.lastSyncedAt
  } else if (payload?.started_at && ['completed', 'error', 'cancelled', 'abandoned'].includes(status.value)) {
    lastSyncedAt.value = payload.started_at
  }

  if (persist) persistState()
}

const loadStatus = async () => {
  if (!isVisible.value) return

  requestingStatus.value = true
  console.info('[External Sync UI] Manual status check requested.', {
    plantel: activePlantel.value
  })

  try {
    const res = await $fetch('/api/sync/base/status')
    applyStatusPayload(res)

    console.info('[External Sync UI] Manual status check completed.', {
      plantel: activePlantel.value,
      status: status.value,
      runId: runId.value,
      processed: processed.value,
      total: total.value
    })
  } catch (error) {
    console.error('[External Sync UI] Manual status check failed.', error)
    status.value = 'error'
    message.value = 'No se pudo consultar el estado de sincronización.'
    persistState()
  } finally {
    requestingStatus.value = false
  }
}

const startSync = async () => {
  if (!isVisible.value) return

  starting.value = true
  status.value = 'processing'
  message.value = 'Sincronización manual en curso. No se está haciendo polling.'
  processed.value = 0
  total.value = 0
  persistState()

  console.info('[External Sync UI] Manual sync requested.', {
    plantel: activePlantel.value
  })

  try {
    const res = await $fetch('/api/sync/base/start', { method: 'POST' })
    applyStatusPayload(res)

    console.info('[External Sync UI] Manual sync completed.', {
      plantel: activePlantel.value,
      status: status.value,
      runId: runId.value,
      processed: processed.value,
      total: total.value,
      updated: updated.value,
      skipped: skipped.value,
      errors: errors.value
    })
  } catch (error) {
    console.error('[External Sync UI] Manual sync failed.', error)
    status.value = 'error'
    message.value = error?.data?.message || error?.message || 'No se pudo iniciar o completar la sincronización.'
    persistState()
  } finally {
    starting.value = false
  }
}

const cancelSync = async () => {
  if (!isVisible.value) return

  cancelling.value = true
  console.info('[External Sync UI] Manual cancellation requested.', {
    plantel: activePlantel.value,
    runId: runId.value
  })

  try {
    const res = await $fetch('/api/sync/base/cancel', { method: 'POST' })
    applyStatusPayload(res)

    console.info('[External Sync UI] Manual cancellation registered.', {
      plantel: activePlantel.value,
      status: status.value,
      runId: runId.value
    })
  } catch (error) {
    console.error('[External Sync UI] Manual cancellation failed.', error)
    message.value = 'No se pudo registrar la cancelación.'
    persistState()
  } finally {
    cancelling.value = false
  }
}

onMounted(() => {
  loadCachedState()
})

watch(() => activePlantel.value, () => {
  isExpanded.value = false
  loadCachedState()
})
</script>