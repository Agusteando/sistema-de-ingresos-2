<template>
  <span class="vision-face-image" :class="{ 'is-processing': isProcessing, 'has-error': Boolean(error) }" :aria-busy="isProcessing ? 'true' : 'false'">
    <img
      v-if="displaySrc"
      :src="displaySrc"
      :alt="alt"
      :style="{ objectFit: fit }"
      decoding="async"
      loading="eager"
      @load="emit('ready')"
    />
    <span v-if="isProcessing" class="vision-face-image__loader" aria-hidden="true">
      <span></span>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useVisionFaceImage } from '~/composables/useVisionFaceImage'

const props = defineProps({
  imageUrl: { type: String, default: '' },
  alt: { type: String, default: '' },
  fit: { type: String, default: 'cover' }
})

const emit = defineEmits(['ready'])
const { processedSrc, isProcessing, error } = useVisionFaceImage(() => props.imageUrl)
const displaySrc = computed(() => processedSrc.value || props.imageUrl || '')
</script>

<style scoped>
.vision-face-image {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: inherit;
}

.vision-face-image img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.vision-face-image__loader {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, rgba(255, 255, 255, .72), rgba(242, 248, 239, .66));
  backdrop-filter: blur(2px);
}

.vision-face-image__loader span {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(63, 145, 56, .18);
  border-top-color: rgba(63, 145, 56, .78);
  border-radius: 999px;
  animation: vision-face-spin 780ms linear infinite;
}

@keyframes vision-face-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .vision-face-image__loader span {
    animation: none;
  }
}
</style>
