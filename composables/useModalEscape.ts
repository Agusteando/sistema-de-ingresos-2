import { onMounted, onUnmounted, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'

type ModalEscapeOptions = {
  enabled?: MaybeRefOrGetter<boolean>
}

type ModalEscapeRegistration = {
  id: symbol
  close: () => void
  enabled: () => boolean
}

const registrations: ModalEscapeRegistration[] = []
let listening = false

const activeRegistration = () => {
  for (let index = registrations.length - 1; index >= 0; index -= 1) {
    const registration = registrations[index]
    if (registration?.enabled()) return registration
  }
  return null
}

const handleEscape = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.repeat) return

  const registration = activeRegistration()
  if (!registration) return

  event.preventDefault()
  event.stopImmediatePropagation()
  registration.close()
}

const ensureListener = () => {
  if (listening || typeof document === 'undefined') return
  document.addEventListener('keydown', handleEscape)
  listening = true
}

const removeListenerIfIdle = () => {
  if (!listening || registrations.length || typeof document === 'undefined') return
  document.removeEventListener('keydown', handleEscape)
  listening = false
}

const moveToTop = (registration: ModalEscapeRegistration) => {
  const index = registrations.findIndex(item => item.id === registration.id)
  if (index >= 0) registrations.splice(index, 1)
  registrations.push(registration)
}

export const useModalEscape = (close: () => void, options: ModalEscapeOptions = {}) => {
  const registration: ModalEscapeRegistration = {
    id: Symbol('modal-escape'),
    close,
    enabled: () => toValue(options.enabled) !== false
  }

  const unregister = () => {
    const index = registrations.findIndex(item => item.id === registration.id)
    if (index >= 0) registrations.splice(index, 1)
    removeListenerIfIdle()
  }

  onMounted(() => {
    moveToTop(registration)
    ensureListener()
  })

  watch(
    () => registration.enabled(),
    (enabled) => {
      if (enabled) moveToTop(registration)
    }
  )

  onUnmounted(unregister)

  return { unregister }
}
