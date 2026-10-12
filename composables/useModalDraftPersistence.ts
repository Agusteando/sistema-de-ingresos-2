import { computed, onMounted, onUnmounted, ref, toValue, watch } from 'vue'
import { useModalEscape } from '~/composables/useModalEscape'
import { safeDraftStorage, type DraftStorage } from '~/utils/modalDraftStorage'
import type { MaybeRefOrGetter } from 'vue'

type ModalDraftPayload<TDraft> = {
  version: 1
  updatedAt: number
  value: TDraft
}

type DraftSaveState = 'idle' | 'saving' | 'saved' | 'error'

type ModalDraftPersistenceOptions<TDraft> = {
  key: MaybeRefOrGetter<string>
  read: () => TDraft
  write: (draft: TDraft) => void
  onClose: () => void
  enabled?: MaybeRefOrGetter<boolean>
  canRequestClose?: () => boolean
  isDraftMeaningful?: (draft: TDraft) => boolean
  debounceMs?: number
  maxAgeMs?: number
}

const STORAGE_PREFIX = 'sistema-ingresos:modal-draft:'
const DEFAULT_DEBOUNCE_MS = 180
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value ?? null)
  } catch (error) {
    return ''
  }
}

export const useModalDraftPersistence = <TDraft>(options: ModalDraftPersistenceOptions<TDraft>) => {
  const hasInitialized = ref(false)
  const draftRestored = ref(false)
  const showDiscardConfirmation = ref(false)
  const draftSaveState = ref<DraftSaveState>('idle')
  const lastDraftSavedAt = ref<number | null>(null)
  const cleanSnapshot = ref('')
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  const loggedStorageFailures = new Set<string>()
  const withStorage = <T>(operation: 'read' | 'write' | 'remove', action: (storage: DraftStorage) => T) => {
    const result = safeDraftStorage(action)
    if (!result.ok && typeof window !== 'undefined') {
      const signature = `${operation}:${result.reason}`
      if (!loggedStorageFailures.has(signature)) {
        loggedStorageFailures.add(signature)
        // Avoid student data and storage keys in diagnostic logs.
        console.warn('[ModalDraftPersistence] Browser draft backup unavailable', { operation, reason: result.reason })
      }
    }
    return result
  }

  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS
  const isEnabled = () => toValue(options.enabled) !== false
  const storageKey = computed(() => `${STORAGE_PREFIX}${String(toValue(options.key) || 'default')}`)
  const currentSnapshot = () => safeStringify(options.read())
  const draftHasContent = (draft: TDraft) => options.isDraftMeaningful ? options.isDraftMeaningful(draft) : true

  const clearPendingPersist = () => {
    if (!persistTimer) return
    clearTimeout(persistTimer)
    persistTimer = null
  }

  const hasUnsavedChanges = computed(() => {
    if (!hasInitialized.value || !isEnabled()) return false
    if (currentSnapshot() === cleanSnapshot.value) return false
    return draftHasContent(options.read())
  })

  const setIdleState = () => {
    draftSaveState.value = 'idle'
    lastDraftSavedAt.value = null
  }

  const removeStoredDraft = () => withStorage('remove', storage => storage.removeItem(storageKey.value))

  const clearDraft = () => {
    clearPendingPersist()
    setIdleState()
    // Browser storage cleanup is best-effort, especially after a committed payment.
    removeStoredDraft()
  }

  const persistDraftNow = () => {
    clearPendingPersist()
    if (!hasInitialized.value || !isEnabled()) return

    const draft = options.read()
    if (currentSnapshot() === cleanSnapshot.value || !draftHasContent(draft)) {
      removeStoredDraft()
      setIdleState()
      return
    }

    const payload: ModalDraftPayload<TDraft> = {
      version: 1,
      updatedAt: Date.now(),
      value: draft
    }

    const result = withStorage('write', storage => storage.setItem(storageKey.value, JSON.stringify(payload)))
    draftSaveState.value = result.ok ? 'saved' : 'error'
    lastDraftSavedAt.value = result.ok ? payload.updatedAt : null
  }

  const schedulePersist = () => {
    if (!hasInitialized.value || !isEnabled()) return
    clearPendingPersist()

    if (!hasUnsavedChanges.value) {
      persistDraftNow()
      return
    }

    draftSaveState.value = 'saving'
    persistTimer = setTimeout(persistDraftNow, debounceMs)
  }

  const readStoredDraft = () => {
    const result = withStorage('read', storage => storage.getItem(storageKey.value))
    if (!result.ok || !result.value) return null

    const raw = result.value

    try {
      const payload = JSON.parse(raw) as Partial<ModalDraftPayload<TDraft>>
      if (!payload || typeof payload.updatedAt !== 'number' || !('value' in payload)) {
        removeStoredDraft()
        return null
      }

      if (Date.now() - payload.updatedAt > maxAgeMs) {
        removeStoredDraft()
        return null
      }

      return payload.value as TDraft
    } catch (error) {
      removeStoredDraft()
      return null
    }
  }

  const initializeDraft = () => {
    if (!isEnabled()) return

    cleanSnapshot.value = currentSnapshot()
    hasInitialized.value = true
    showDiscardConfirmation.value = false
    draftRestored.value = false
    setIdleState()

    const savedDraft = readStoredDraft()
    if (!savedDraft) return

    if (safeStringify(savedDraft) === cleanSnapshot.value || !draftHasContent(savedDraft)) {
      clearDraft()
      return
    }

    options.write(savedDraft)
    draftRestored.value = true
    draftSaveState.value = 'saved'
  }

  const markSaved = () => {
    clearDraft()
    cleanSnapshot.value = currentSnapshot()
    draftRestored.value = false
    showDiscardConfirmation.value = false
    hasInitialized.value = true
  }

  const continueEditing = () => {
    showDiscardConfirmation.value = false
  }

  const discardAndClose = () => {
    clearDraft()
    cleanSnapshot.value = currentSnapshot()
    draftRestored.value = false
    showDiscardConfirmation.value = false
    options.onClose()
  }

  const requestClose = () => {
    if (options.canRequestClose && !options.canRequestClose()) return false

    if (hasUnsavedChanges.value) {
      showDiscardConfirmation.value = true
      persistDraftNow()
      return false
    }

    showDiscardConfirmation.value = false
    options.onClose()
    return true
  }

  const handleBeforeUnload = () => {
    if (hasUnsavedChanges.value) persistDraftNow()
  }

  watch(
    () => [storageKey.value, currentSnapshot(), hasInitialized.value, isEnabled()] as const,
    () => schedulePersist(),
    { flush: 'post' }
  )

  useModalEscape(requestClose, { enabled: () => isEnabled() })

  onMounted(() => {
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', handleBeforeUnload)
  })

  onUnmounted(() => {
    clearPendingPersist()
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', handleBeforeUnload)
  })

  return {
    draftRestored,
    draftSaveState,
    lastDraftSavedAt,
    hasUnsavedChanges,
    showDiscardConfirmation,
    initializeDraft,
    markSaved,
    clearDraft,
    persistDraftNow,
    requestClose,
    continueEditing,
    discardAndClose
  }
}
