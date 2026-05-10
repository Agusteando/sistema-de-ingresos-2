<template>
  <button type="button" :class="iconButtonClasses" v-bind="$attrs">
    <slot />
  </button>
</template>

<script setup>
import { computed } from 'vue'


const props = defineProps({
  plain: { type: Boolean, default: true }
})

const iconButtonClasses = computed(() => ['ui-icon-button', props.plain ? 'plain-icon-button' : 'icon-button'])
</script>
