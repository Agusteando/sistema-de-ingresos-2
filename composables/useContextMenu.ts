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

    const menuWidth = 220
    const menuHeight = newItems.length * 36 + 12
    
    let targetX = event.clientX
    let targetY = event.clientY

    if (targetX + menuWidth > window.innerWidth) {
      targetX = window.innerWidth - menuWidth - 8
    }
    if (targetY + menuHeight > window.innerHeight) {
      targetY = window.innerHeight - menuHeight - 8
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