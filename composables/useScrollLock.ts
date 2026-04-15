import { onMounted, onUnmounted } from 'vue'

export const useScrollLock = () => {
  onMounted(() => {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden'
    }
  })

  onUnmounted(() => {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = ''
    }
  })
}