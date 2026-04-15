<template>
  <Transition name="fade-scale">
    <div v-if="isVisible" 
         class="fixed z-[9999] w-48 bg-white/95 backdrop-blur-xl rounded-xl shadow-lg border border-gray-100 overflow-hidden py-1.5"
         :style="{ top: `${y}px`, left: `${x}px` }"
         @click.stop>
      <div v-for="(item, index) in items" :key="index">
        <div v-if="item.label === '-'" class="h-px bg-gray-100 my-1 mx-2"></div>
        <button v-else
                class="w-full text-left px-3 py-1.5 text-xs font-semibold flex items-center gap-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
                :class="item.class || 'text-gray-700 hover:bg-brand-leaf/10 hover:text-brand-campus'"
                @click="executeAction(item)"
                :disabled="item.disabled">
          <component :is="item.icon" v-if="item.icon" :size="14" class="opacity-70 group-hover:opacity-100" />
          <span class="truncate">{{ item.label }}</span>
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useContextMenu } from '~/composables/useContextMenu'

const { isVisible, x, y, items, closeMenu } = useContextMenu()

const executeAction = (item) => {
  if (item.disabled || item.label === '-') return
  item.action()
  closeMenu()
}

const handleClickOutside = () => {
  if (isVisible.value) closeMenu()
}

const handleScroll = () => {
  if (isVisible.value) closeMenu()
}

onMounted(() => {
  window.addEventListener('click', handleClickOutside)
  window.addEventListener('scroll', handleScroll, true)
})

onUnmounted(() => {
  window.removeEventListener('click', handleClickOutside)
  window.removeEventListener('scroll', handleScroll, true)
})
</script>

<style scoped>
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: opacity 0.1s ease, transform 0.1s cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: top left;
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.97);
}
</style>