<template>
  <button
    type="button"
    :class="chipClasses"
    :aria-pressed="active || activeGroup || undefined"
  >
    <slot />
  </button>
</template>

<script setup>
import { computed } from 'vue'


const props = defineProps({
  active: { type: Boolean, default: false },
  activeGroup: { type: Boolean, default: false },
  debt: { type: Boolean, default: false }
})

const chipClasses = computed(() => [
  'ui-chip',
  'chip',
  { active: props.active, 'active-group': props.activeGroup, 'chip-debt': props.debt }
])
</script>
