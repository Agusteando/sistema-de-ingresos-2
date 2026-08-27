import { computed, onMounted, watch } from 'vue'
import { CICLOS_LIST, normalizeCicloOption } from '~/utils/constants'

type GlobalState = {
  ciclo?: string
  [key: string]: unknown
}

const ACTIVE_CICLO_COOKIE = 'active_ciclo'
const ACTIVE_CICLO_STORAGE_KEY = 'ingresos:active-ciclo'
const ACTIVE_CICLO_MAX_AGE = 60 * 60 * 24 * 365

const readStoredCiclo = () => {
  if (!import.meta.client) return ''
  try {
    return String(window.localStorage.getItem(ACTIVE_CICLO_STORAGE_KEY) || '').trim()
  } catch {
    return ''
  }
}

const writeStoredCiclo = (ciclo: string) => {
  if (!import.meta.client) return
  try {
    window.localStorage.setItem(ACTIVE_CICLO_STORAGE_KEY, ciclo)
  } catch {
    // Cookie persistence remains available when browser storage is unavailable.
  }
}

const dispatchCicloChanged = (ciclo: string) => {
  if (!import.meta.client) return
  window.dispatchEvent(new CustomEvent('ingresos:ciclo-changed', { detail: { ciclo } }))
}

export const useActiveCiclo = () => {
  const cicloCookie = useCookie<string | null>(ACTIVE_CICLO_COOKIE, {
    maxAge: ACTIVE_CICLO_MAX_AGE,
    path: '/',
    sameSite: 'lax',
  })

  const cookieValue = String(cicloCookie.value || '').trim()
  const storedValue = !cookieValue ? readStoredCiclo() : ''
  const initialCiclo = normalizeCicloOption(cookieValue || storedValue)

  const state = useState<GlobalState>('globalState', () => ({
    ciclo: initialCiclo,
  }))

  const cycleOptions = useState<Array<{ value: string; label: string; isCurrent?: boolean }>>('activeCicloOptions', () =>
    CICLOS_LIST.map((item) => ({ ...item })),
  )

  if (!state.value || typeof state.value !== 'object') {
    state.value = { ciclo: initialCiclo }
  }

  if (import.meta.client) {
    const hydratedCiclo = normalizeCicloOption(cookieValue || storedValue || state.value.ciclo)
    if (state.value.ciclo !== hydratedCiclo) state.value.ciclo = hydratedCiclo
    cicloCookie.value = hydratedCiclo
    writeStoredCiclo(hydratedCiclo)

    const persistenceInstalled = useState<boolean>('activeCicloPersistenceInstalled', () => false)
    if (!persistenceInstalled.value) {
      persistenceInstalled.value = true
      watch(
        () => state.value?.ciclo,
        (value, previousValue) => {
          const cicloKey = normalizeCicloOption(value)
          const previousKey = normalizeCicloOption(previousValue)

          if (state.value.ciclo !== cicloKey) {
            state.value.ciclo = cicloKey
            return
          }

          cicloCookie.value = cicloKey
          writeStoredCiclo(cicloKey)
          if (cicloKey !== previousKey) dispatchCicloChanged(cicloKey)
        },
      )
    }
  }

  const activeCicloKey = computed(() => normalizeCicloOption(state.value?.ciclo || cicloCookie.value))

  const setActiveCiclo = (value: string | number | null | undefined) => {
    const cicloKey = normalizeCicloOption(value)
    if (state.value.ciclo === cicloKey) {
      cicloCookie.value = cicloKey
      writeStoredCiclo(cicloKey)
      return cicloKey
    }

    state.value.ciclo = cicloKey
    return cicloKey
  }

  onMounted(async () => {
    try {
      const response = await $fetch<{
        currentCycle?: { key?: string; label?: string }
        schoolYears?: Array<{ value?: string; label?: string; isCurrent?: boolean }>
      }>('/api/school-cycle/current')
      const options = (response?.schoolYears || [])
        .map((item) => ({
          value: normalizeCicloOption(item.value),
          label: String(item.label || '').trim() || `${normalizeCicloOption(item.value)}-${Number(normalizeCicloOption(item.value)) + 1}`,
          isCurrent: Boolean(item.isCurrent)
        }))
        .filter((item, index, values) => item.value && values.findIndex((candidate) => candidate.value === item.value) === index)
      if (options.length) cycleOptions.value = options

      if (!cookieValue && !storedValue && state.value.ciclo === initialCiclo) {
        const current = normalizeCicloOption(response?.currentCycle?.key)
        if (current) setActiveCiclo(current)
      }
    } catch {
      // The calendar-based July rollover remains the safe fallback when the server policy is unavailable.
    }
  })

  return {
    state,
    activeCicloKey,
    setActiveCiclo,
    cycleOptions,
  }
}
