import { computed, ref } from 'vue'
import { PLANTELES_LIST } from '~/utils/constants'

type PlantelAgentStatus = {
  status: 'online' | 'offline' | 'unknown'
  online: boolean
  label: string
  message: string
  action: string
  checkedAt?: string
}

const STATUS_TEXT: Record<'online' | 'offline' | 'checking' | 'unknown', PlantelAgentStatus> = {
  online: {
    status: 'online',
    online: true,
    label: 'En línea',
    message: 'Este equipo está en línea.',
    action: ''
  },
  offline: {
    status: 'offline',
    online: false,
    label: 'Fuera de línea',
    message: 'Este equipo está fuera de línea.',
    action: 'Solicita al Administrador verificar la conectividad.'
  },
  checking: {
    status: 'unknown',
    online: false,
    label: 'Verificando',
    message: 'Verificando conectividad...',
    action: ''
  },
  unknown: {
    status: 'unknown',
    online: false,
    label: 'Sin verificar',
    message: 'No se pudo verificar la conectividad.',
    action: 'Intenta verificar nuevamente en unos segundos.'
  }
}

const normalizePlantelStatus = (entry: Partial<PlantelAgentStatus> = {}): PlantelAgentStatus => {
  if (entry.status === 'online' || entry.online === true) {
    return {
      ...STATUS_TEXT.online,
      checkedAt: entry.checkedAt || ''
    }
  }

  if (entry.status === 'offline') {
    return {
      ...STATUS_TEXT.offline,
      message: entry.message || STATUS_TEXT.offline.message,
      action: entry.action || STATUS_TEXT.offline.action,
      checkedAt: entry.checkedAt || ''
    }
  }

  return {
    ...STATUS_TEXT.unknown,
    message: entry.message || STATUS_TEXT.unknown.message,
    action: entry.action || STATUS_TEXT.unknown.action,
    checkedAt: entry.checkedAt || ''
  }
}

export const usePlantelAgentStatuses = () => {
  const requestCount = ref(0)
  const error = ref('')
  const lastFullCheck = ref(0)
  const statusChecks = ref<Record<string, number>>({})
  const statuses = ref<Record<string, PlantelAgentStatus>>({})
  const loading = computed(() => requestCount.value > 0)

  const fallbackStatus = () => {
    if (loading.value) return STATUS_TEXT.checking

    if (error.value) {
      return {
        ...STATUS_TEXT.unknown,
        message: 'No se pudo verificar la conectividad.'
      }
    }

    return STATUS_TEXT.unknown
  }

  const getPlantelStatus = (plantel: string) => {
    const normalizedPlantel = String(plantel || '').trim().toUpperCase()
    return statuses.value[normalizedPlantel] || fallbackStatus()
  }

  const loadPlantelStatuses = async ({ force = false, plantel = '' }: { force?: boolean; plantel?: string } = {}) => {
    const normalizedPlantel = String(plantel || '').trim().toUpperCase()
    const lastCheck = normalizedPlantel ? statusChecks.value[normalizedPlantel] : lastFullCheck.value
    const statusAge = Date.now() - Number(lastCheck || 0)

    if (!force && lastCheck && statusAge < 15000) return

    requestCount.value += 1
    error.value = ''

    try {
      const path = normalizedPlantel
        ? `/api/auth/planteles-status?plantel=${encodeURIComponent(normalizedPlantel)}`
        : '/api/auth/planteles-status'
      const result = await $fetch<{ statuses?: Array<Partial<PlantelAgentStatus> & { plantel?: string }> }>(path)
      const nextStatuses = { ...statuses.value }

      for (const status of result?.statuses || []) {
        const normalizedStatusPlantel = String(status.plantel || '').trim().toUpperCase()

        if (PLANTELES_LIST.includes(normalizedStatusPlantel)) {
          nextStatuses[normalizedStatusPlantel] = normalizePlantelStatus(status)
        }
      }

      statuses.value = nextStatuses

      if (normalizedPlantel) {
        statusChecks.value = {
          ...statusChecks.value,
          [normalizedPlantel]: Date.now()
        }
      } else {
        lastFullCheck.value = Date.now()
      }
    } catch {
      error.value = 'No se pudo verificar la conectividad de los planteles en este momento.'
    } finally {
      requestCount.value = Math.max(0, requestCount.value - 1)
    }
  }

  return {
    loading,
    error,
    statuses,
    getPlantelStatus,
    loadPlantelStatuses
  }
}
