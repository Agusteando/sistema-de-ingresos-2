import { ref, type Component } from 'vue'

export interface ContextMenuItem {
  label: string
  icon?: Component
  class?: string
  action: () => void
  disabled?: boolean
}

const isVisible = ref(false)
const x = ref(0)
const y = ref(0)
const items = ref<ContextMenuItem[]>([])

export const useContextMenu = () => {
  const openMenu = (event: MouseEvent, newItems: ContextMenuItem[]) => {
    event.preventDefault()
    isVisible.value = true
    items.value = newItems

    // Prevent menu from overflowing the viewport
    const menuWidth = 240
    const menuHeight = newItems.length * 40 + 16 // Approximation
    
    let targetX = event.clientX
    let targetY = event.clientY

    if (targetX + menuWidth > window.innerWidth) {
      targetX = window.innerWidth - menuWidth - 10
    }
    if (targetY + menuHeight > window.innerHeight) {
      targetY = window.innerHeight - menuHeight - 10
    }

    x.value = targetX
    y.value = targetY
  }

  const closeMenu = () => {
    isVisible.value = false
    items.value = []
  }

  return {
    isVisible,
    x,
    y,
    items,
    openMenu,
    closeMenu
  }
}