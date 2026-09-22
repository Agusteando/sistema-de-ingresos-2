<template>
  <span
    class="taller-servicio-artwork"
    :style="[artworkStyle, sizeStyle]"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
  ></span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { tallerArtworkStyle } from '~/shared/utils/talleresArtwork'

const props = withDefaults(defineProps<{
  catalogKey?: unknown
  label?: string
  size?: number | string
}>(), {
  catalogKey: '',
  label: '',
  size: 48,
})

const artworkStyle = computed(() => tallerArtworkStyle(props.catalogKey))
const sizeStyle = computed(() => {
  const size = typeof props.size === 'number' ? `${props.size}px` : props.size
  return { '--taller-artwork-size': size }
})
</script>

<style scoped>
.taller-servicio-artwork {
  width: var(--taller-artwork-size);
  height: var(--taller-artwork-size);
  display: inline-block;
  flex: 0 0 var(--taller-artwork-size);
  background-repeat: no-repeat;
  background-color: transparent;
}
</style>
