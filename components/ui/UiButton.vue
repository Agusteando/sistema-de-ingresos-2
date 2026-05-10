<template>
  <component
    :is="as"
    :type="as === 'button' ? type : undefined"
    :class="buttonClasses"
    :disabled="as === 'button' ? disabled : undefined"
  >
    <slot />
  </component>
</template>

<script setup>
import { computed } from 'vue'


const props = defineProps({
  as: { type: String, default: 'button' },
  type: { type: String, default: 'button' },
  variant: { type: String, default: 'secondary' },
  size: { type: String, default: 'md' },
  disabled: { type: Boolean, default: false }
})

const buttonClasses = computed(() => [
  'ui-button',
  'btn',
  props.variant ? `btn-${props.variant}` : null,
  props.size === 'sm' ? 'btn-sm' : null,
  props.size === 'icon' ? 'btn-icon' : null
])
</script>
