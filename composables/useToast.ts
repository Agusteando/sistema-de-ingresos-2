import { ref } from 'vue'

type ToastType = 'success' | 'danger'

type ToastOptions = {
  title?: string
  details?: string[]
  duration?: number
}

type ToastItem = {
  id: number
  message: string
  title?: string
  details: string[]
  type: ToastType
}

const toasts = ref<ToastItem[]>([])
let toastId = 0

export const useToast = () => {
  const show = (message: string, type: ToastType = 'success', options: ToastOptions = {}) => {
    const id = ++toastId
    const details = Array.isArray(options.details)
      ? options.details.map(detail => String(detail || '').trim()).filter(Boolean).slice(0, 4)
      : []
    toasts.value.push({ id, message, title: options.title, details, type })
    setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, Number(options.duration || 3500))
  }
  return { toasts, show }
}
