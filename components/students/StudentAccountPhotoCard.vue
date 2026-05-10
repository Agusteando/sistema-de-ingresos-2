<template>
  <div
    class="student-account-photo-card"
    :class="{ 'has-photo': hasPhoto, 'is-loading-photo': photoLoading }"
    :style="studentPresentationStyle(student)"
    :title="student?.nombreCompleto || 'Alumno'"
  >
    <div class="student-account-photo-card__orb" aria-hidden="true"></div>
    <UiVisionFaceImage
      v-if="hasPhoto"
      class="student-account-photo-card__image"
      :image-url="photoUrl"
      :alt="`Foto de ${student?.nombreCompleto || 'alumno'}`"
      fit="contain"
    />
    <div v-else class="student-account-photo-card__fallback" aria-hidden="true">
      {{ initials(student?.nombreCompleto) }}
    </div>
    <span v-if="photoLoading" class="student-account-photo-card__status" aria-hidden="true"></span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import UiVisionFaceImage from '~/components/ui/UiVisionFaceImage.vue'
import { studentPresentationStyle } from '~/shared/utils/studentPresentation'

const props = defineProps({
  student: { type: Object, default: null },
  photoUrl: { type: String, default: '' },
  photoLoading: { type: Boolean, default: false }
})

const hasPhoto = computed(() => Boolean(props.photoUrl && props.photoUrl !== 'none'))
const initials = (name = '') => String(name || '')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part[0]?.toUpperCase())
  .join('') || 'AL'
</script>

<style scoped>
.student-account-photo-card {
  position: relative;
  display: grid;
  width: 70px;
  height: 70px;
  flex: 0 0 70px;
  place-items: center;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--grade-accent, #4fa346) 28%, #dfe7f0);
  border-radius: 22px;
  background:
    radial-gradient(circle at 50% 86%, color-mix(in srgb, var(--grade-accent, #4fa346) 24%, transparent), transparent 50%),
    radial-gradient(circle at 26% 18%, rgba(255, 255, 255, .96), transparent 38%),
    linear-gradient(155deg, color-mix(in srgb, var(--grade-soft, #f2f8ef) 82%, #fff), #fff 58%, color-mix(in srgb, var(--grade-accent, #4fa346) 9%, #eef6eb));
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, .76),
    0 13px 24px rgba(21, 35, 60, .08);
  isolation: isolate;
}

.student-account-photo-card::before {
  position: absolute;
  inset: 7px;
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, .38), rgba(255, 255, 255, 0)),
    radial-gradient(circle at 50% 100%, color-mix(in srgb, var(--grade-accent, #4fa346) 16%, transparent), transparent 52%);
  content: "";
  opacity: .84;
  pointer-events: none;
  z-index: 0;
}

.student-account-photo-card__orb {
  position: absolute;
  inset-inline: 9px;
  inset-block-end: 7px;
  height: 28px;
  border-radius: 999px 999px 16px 16px;
  background: color-mix(in srgb, var(--grade-accent, #4fa346) 18%, #fff);
  filter: blur(7px);
  opacity: .72;
  z-index: 0;
}

.student-account-photo-card__image {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  padding: 5px 4px 0;
  filter: drop-shadow(0 8px 9px rgba(21, 35, 60, .12));
}

.student-account-photo-card__fallback {
  position: relative;
  z-index: 1;
  display: grid;
  width: 50px;
  height: 50px;
  place-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, .76);
  color: color-mix(in srgb, var(--grade-accent, #4fa346) 86%, #26354d);
  font-size: 18px;
  font-weight: 900;
  letter-spacing: -.04em;
}

.student-account-photo-card__status {
  position: absolute;
  inset-block-end: 8px;
  width: 22px;
  height: 3px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--grade-accent, #4fa346) 42%, transparent);
  animation: account-photo-pulse 900ms ease-in-out infinite;
  z-index: 2;
}

@keyframes account-photo-pulse {
  0%, 100% { opacity: .35; transform: scaleX(.72); }
  50% { opacity: .92; transform: scaleX(1); }
}

@media (prefers-reduced-motion: reduce) {
  .student-account-photo-card__status {
    animation: none;
  }
}
</style>
