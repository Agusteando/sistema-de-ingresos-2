import { ref } from 'vue'

const toasts = ref<{ id: number, message: string, type: string }[]>([])
let toastId = 0

export const useToast = () => {
  const show = (message: string, type: 'success' | 'danger' = 'success') => {
    const id = ++toastId
    toasts.value.push({ id, message, type })
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id)
    }, 3500)
  }
  return { toasts, show }
}