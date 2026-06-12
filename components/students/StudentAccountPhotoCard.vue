<template>
  <div
    class="student-account-photo-card"
    :class="{ 'has-photo': hasPhoto, 'is-loading-photo': photoLoading }"
    :style="studentPresentationStyle(student)"
    :title="hasPhoto ? 'Ver foto ampliada' : (student?.nombreCompleto || 'Alumno')"
    @pointerenter="showPhotoPreview"
    @pointerover="showPhotoPreview"
    @pointermove="movePhotoPreview"
    @pointerleave="hidePhotoPreview"
    @mouseover="showPhotoPreview"
    @mouseenter="showPhotoPreview"
    @mousemove="movePhotoPreview"
    @mouseleave="hidePhotoPreview"
    @click="handlePhotoPreviewClick"
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

  <Teleport to="body">
    <Transition name="student-account-photo-preview-fade">
      <aside
        v-if="previewVisible && hasPhoto"
        class="student-account-photo-preview"
        :style="previewStyle"
        aria-hidden="true"
      >
        <div class="student-account-photo-preview__media">
          <UiVisionFaceImage
            :image-url="photoUrl"
            :alt="`Vista ampliada de ${student?.nombreCompleto || 'alumno'}`"
            fit="contain"
          />
        </div>
        <div class="student-account-photo-preview__caption">
          <strong>{{ previewTitle }}</strong>
          <span>{{ previewSubtitle }}</span>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import UiVisionFaceImage from '~/components/ui/UiVisionFaceImage.vue'
import { studentPresentationStyle } from '~/shared/utils/studentPresentation'

const props = defineProps({
  student: { type: Object, default: null },
  photoUrl: { type: String, default: '' },
  photoLoading: { type: Boolean, default: false }
})

const hasPhoto = computed(() => Boolean(props.photoUrl && props.photoUrl !== 'none'))
const previewVisible = ref(false)
const previewPosition = ref({ x: 0, y: 0 })
const PHOTO_PREVIEW_WIDTH = 256
const PHOTO_PREVIEW_HEIGHT = 344
const PHOTO_PREVIEW_GAP = 16
const PHOTO_PREVIEW_EDGE = 12

const previewTitle = computed(() => props.student?.nombreCompleto || 'Alumno')
const previewSubtitle = computed(() => {
  const items = []
  if (props.student?.matricula) items.push(props.student.matricula)
  if (props.student?.grado) items.push(`Grado ${props.student.grado}`)
  if (props.student?.grupo) items.push(props.student.grupo)
  return items.join(' / ')
})

const previewStyle = computed(() => ({
  ...studentPresentationStyle(props.student),
  left: `${previewPosition.value.x}px`,
  top: `${previewPosition.value.y}px`
}))

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

function updatePreviewPosition(event) {
  if (!hasPhoto.value || typeof window === 'undefined') return
  const target = event?.currentTarget
  const rect = target?.getBoundingClientRect?.()
  const hasPointer = typeof event?.clientX === 'number' && typeof event?.clientY === 'number' && event.clientX > 0 && event.clientY > 0
  const anchorX = hasPointer ? event.clientX : (rect?.right || window.innerWidth / 2)
  const anchorY = hasPointer ? event.clientY : (rect?.top || window.innerHeight / 2)
  const maxX = Math.max(PHOTO_PREVIEW_EDGE, window.innerWidth - PHOTO_PREVIEW_WIDTH - PHOTO_PREVIEW_EDGE)
  const maxY = Math.max(PHOTO_PREVIEW_EDGE, window.innerHeight - PHOTO_PREVIEW_HEIGHT - PHOTO_PREVIEW_EDGE)
  let x = anchorX + PHOTO_PREVIEW_GAP
  if (x + PHOTO_PREVIEW_WIDTH > window.innerWidth - PHOTO_PREVIEW_EDGE) {
    x = anchorX - PHOTO_PREVIEW_WIDTH - PHOTO_PREVIEW_GAP
  }
  const y = hasPointer ? anchorY - PHOTO_PREVIEW_HEIGHT * 0.28 : anchorY - 24
  previewPosition.value = {
    x: clamp(x, PHOTO_PREVIEW_EDGE, maxX),
    y: clamp(y, PHOTO_PREVIEW_EDGE, maxY)
  }
}

function showPhotoPreview(event) {
  if (!hasPhoto.value) return
  updatePreviewPosition(event)
  previewVisible.value = true
}

function handlePhotoPreviewClick(event) {
  if (!hasPhoto.value) return
  event?.stopPropagation?.()
  event?.preventDefault?.()
  showPhotoPreview(event)
}

function movePhotoPreview(event) {
  if (!previewVisible.value) return
  updatePreviewPosition(event)
}

function hidePhotoPreview() {
  previewVisible.value = false
}

onBeforeUnmount(hidePhotoPreview)

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
  width: var(--student-account-photo-size, 70px);
  height: var(--student-account-photo-size, 70px);
  flex: 0 0 var(--student-account-photo-size, 70px);
  place-items: center;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--grade-accent, #4fa346) 28%, #dfe7f0);
  border-radius: var(--student-account-photo-radius, 22px);
  background:
    radial-gradient(circle at 50% 86%, color-mix(in srgb, var(--grade-accent, #4fa346) 24%, transparent), transparent 50%),
    radial-gradient(circle at 26% 18%, rgba(255, 255, 255, .96), transparent 38%),
    linear-gradient(155deg, color-mix(in srgb, var(--grade-soft, #f2f8ef) 82%, #fff), #fff 58%, color-mix(in srgb, var(--grade-accent, #4fa346) 9%, #eef6eb));
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, .76),
    0 13px 24px rgba(21, 35, 60, .08);
  isolation: isolate;
}

.student-account-photo-card.has-photo {
  cursor: zoom-in;
}

.student-account-photo-card::before {
  position: absolute;
  inset: var(--student-account-photo-inner-inset, 7px);
  border-radius: var(--student-account-photo-inner-radius, 18px);
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
  inset-inline: var(--student-account-photo-orb-inline, 9px);
  inset-block-end: var(--student-account-photo-orb-bottom, 7px);
  height: var(--student-account-photo-orb-height, 28px);
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
  padding: var(--student-account-photo-image-padding, 5px 4px 0);
  filter: drop-shadow(0 8px 9px rgba(21, 35, 60, .12));
}

.student-account-photo-card__fallback {
  position: relative;
  z-index: 1;
  display: grid;
  width: var(--student-account-photo-fallback-size, 50px);
  height: var(--student-account-photo-fallback-size, 50px);
  place-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, .76);
  color: color-mix(in srgb, var(--grade-accent, #4fa346) 86%, #26354d);
  font-size: var(--student-account-photo-fallback-font-size, 18px);
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

.student-account-photo-preview {
  position: fixed;
  z-index: 10010;
  width: min(256px, calc(100vw - 24px));
  padding: 9px 9px 10px;
  border: 1px solid color-mix(in srgb, var(--grade-accent, #4fa346) 24%, rgba(224, 232, 242, .96));
  border-radius: 20px;
  background:
    radial-gradient(circle at 30% 10%, rgba(255, 255, 255, .96), transparent 46%),
    linear-gradient(180deg, rgba(255, 255, 255, .98), color-mix(in srgb, var(--grade-soft, #f2f8ef) 54%, #fff));
  box-shadow: 0 22px 44px rgba(21, 35, 60, .22), 0 0 0 1px rgba(255, 255, 255, .72) inset;
  color: #15233c;
  pointer-events: none;
}

.student-account-photo-preview__media {
  display: grid;
  aspect-ratio: 4 / 5;
  overflow: hidden;
  place-items: center;
  border: 1px solid rgba(211, 222, 235, .78);
  border-radius: 15px;
  background:
    radial-gradient(circle at 50% 76%, color-mix(in srgb, var(--grade-accent, #4fa346) 13%, transparent), transparent 58%),
    linear-gradient(180deg, #fff, color-mix(in srgb, var(--grade-soft, #f2f8ef) 42%, #fff));
}

.student-account-photo-preview__media :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.student-account-photo-preview__caption {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 8px 3px 0;
}

.student-account-photo-preview__caption strong {
  color: #15233c;
  font-size: 12.5px;
  font-weight: 900;
  line-height: 1.18;
}

.student-account-photo-preview__caption span {
  min-width: 0;
  overflow: hidden;
  color: color-mix(in srgb, var(--grade-accent, #4fa346) 62%, #64748b);
  font-size: 10px;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.student-account-photo-preview-fade-enter-active,
.student-account-photo-preview-fade-leave-active {
  transition: opacity .16s ease, transform .16s ease;
}

.student-account-photo-preview-fade-enter-from,
.student-account-photo-preview-fade-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(.975);
}

.student-account-photo-preview-fade-enter-to,
.student-account-photo-preview-fade-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}

@media (prefers-reduced-motion: reduce) {
  .student-account-photo-card__status {
    animation: none;
  }

  .student-account-photo-preview-fade-enter-active,
  .student-account-photo-preview-fade-leave-active {
    transition: none;
  }
}
</style>
