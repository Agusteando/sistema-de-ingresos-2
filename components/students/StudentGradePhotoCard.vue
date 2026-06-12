<template>
  <div
    v-bind="rootAttrs"
    :class="rootClasses"
    :style="rootStyle"
    :title="hasPhoto ? 'Ver foto ampliada' : gradeVisualTitle(student)"
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
    <div class="student-grade-photo-card__slide student-grade-photo-card__grade" aria-hidden="true">
      <strong>{{ gradeVisualNumber(student) }}</strong>
      <span>Grado</span>
    </div>

    <div
      v-if="hasPhoto"
      class="student-grade-photo-card__slide student-grade-photo-card__photo"
      @pointerenter="showPhotoPreview"
      @pointerover="showPhotoPreview"
      @pointermove="movePhotoPreview"
      @mouseover="showPhotoPreview"
      @mousemove="movePhotoPreview"
      @click="handlePhotoPreviewClick"
    >
      <UiVisionFaceImage :image-url="photoUrl" :alt="`Foto de ${student?.nombreCompleto || 'alumno'}`" fit="contain" />
    </div>
  </div>

  <Teleport to="body">
    <Transition name="student-photo-preview-fade">
      <aside
        v-if="previewVisible && hasPhoto"
        class="student-photo-preview"
        :style="previewStyle"
        aria-hidden="true"
      >
        <div class="student-photo-preview__media">
          <UiVisionFaceImage
            :image-url="photoUrl"
            :alt="`Vista ampliada de ${student?.nombreCompleto || 'alumno'}`"
            fit="contain"
          />
        </div>
        <div class="student-photo-preview__caption">
          <strong>{{ previewTitle }}</strong>
          <span>{{ previewSubtitle }}</span>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, useAttrs } from 'vue'
import UiVisionFaceImage from '~/components/ui/UiVisionFaceImage.vue'
import { gradeVisualNumber, gradeVisualTitle, studentPresentationStyle } from '~/shared/utils/studentPresentation'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  student: { type: Object, default: null },
  photoUrl: { type: String, default: '' },
  photoLoading: { type: Boolean, default: false },
  isEnrolled: { type: Boolean, default: true }
})

const attrs = useAttrs()
const hasPhoto = computed(() => Boolean(props.photoUrl && props.photoUrl !== 'none'))
const previewVisible = ref(false)
const previewPosition = ref({ x: 0, y: 0 })
const PHOTO_PREVIEW_WIDTH = 226
const PHOTO_PREVIEW_HEIGHT = 292
const PHOTO_PREVIEW_GAP = 16
const PHOTO_PREVIEW_EDGE = 12

const previewTitle = computed(() => props.student?.nombreCompleto || 'Alumno')
const previewSubtitle = computed(() => {
  const items = []
  if (props.student?.matricula) items.push(props.student.matricula)
  if (props.student?.grado) items.push(`Grado ${props.student.grado}`)
  return items.join(' / ')
})

const rootAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

const rootClasses = computed(() => [
  'student-grade-photo-card',
  attrs.class,
  {
    'has-photo': hasPhoto.value,
    'is-loading-photo': props.photoLoading,
    inactive: props.student?.estatus !== 'Activo',
    unenrolled: !props.isEnrolled
  }
])

const rootStyle = computed(() => [
  studentPresentationStyle(props.student),
  attrs.style
])

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
  let y = hasPointer ? anchorY - PHOTO_PREVIEW_HEIGHT * 0.32 : anchorY - 22
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
</script>

<style scoped>
.student-grade-photo-card {
  position: relative;
  width: var(--student-grade-photo-width, 60px);
  height: var(--student-grade-photo-height, 68px);
  flex: 0 0 var(--student-grade-photo-width, 60px);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--grade-accent, #4fa346) 24%, #dce8d8);
  border-radius: var(--student-grade-photo-radius, 15px);
  background:
    radial-gradient(circle at 22% 18%, rgba(255, 255, 255, .96), transparent 42%),
    linear-gradient(180deg, color-mix(in srgb, var(--grade-soft, #f2f8ef) 88%, #fff), #fff 118%);
  color: var(--grade-accent, #4fa346);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .7), 0 10px 20px rgba(21, 35, 60, .065);
  isolation: isolate;
}

.student-grade-photo-card.has-photo {
  cursor: zoom-in;
}

.student-grade-photo-card__slide {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.student-grade-photo-card__grade {
  z-index: 2;
  gap: var(--student-grade-photo-label-gap, 7px);
  text-transform: uppercase;
}

.student-grade-photo-card__grade strong {
  font-size: var(--student-grade-photo-number-size, 31px);
  font-weight: 880;
  letter-spacing: var(--student-grade-photo-number-spacing, -.05em);
  line-height: var(--student-grade-photo-number-line-height, .86);
  text-shadow: 0 1px 0 rgba(255, 255, 255, .9);
}

.student-grade-photo-card__grade span {
  font-size: var(--student-grade-photo-label-size, 8px);
  font-weight: 900;
  letter-spacing: .02em;
  line-height: 1;
}

.student-grade-photo-card__photo {
  z-index: 3;
  border-radius: inherit;
  background:
    radial-gradient(circle at 50% 78%, color-mix(in srgb, var(--grade-accent, #4fa346) 18%, transparent), transparent 52%),
    linear-gradient(180deg, rgba(255, 255, 255, .9), color-mix(in srgb, var(--grade-soft, #f2f8ef) 72%, #fff));
  opacity: 0;
  transform: translateX(18%);
}

.student-grade-photo-card.has-photo .student-grade-photo-card__grade {
  animation: grade-card-grade-slide 8.8s ease-in-out infinite;
}

.student-grade-photo-card.has-photo .student-grade-photo-card__photo {
  animation: grade-card-photo-slide 8.8s ease-in-out infinite;
}

.student-grade-photo-card.inactive {
  border-color: rgba(255, 77, 56, .25);
  background: #fff0ee;
  color: #d43d35;
}

.student-grade-photo-card.unenrolled {
  border-color: rgba(233, 152, 49, .28);
  background: #fff7eb;
  color: #c76c1b;
}

@keyframes grade-card-grade-slide {
  0%, 43% { opacity: 1; transform: translateX(0); }
  50%, 88% { opacity: 0; transform: translateX(-18%); }
  95%, 100% { opacity: 1; transform: translateX(0); }
}

@keyframes grade-card-photo-slide {
  0%, 43% { opacity: 0; transform: translateX(18%); }
  50%, 88% { opacity: 1; transform: translateX(0); }
  95%, 100% { opacity: 0; transform: translateX(18%); }
}

.student-photo-preview {
  position: fixed;
  z-index: 10010;
  width: min(226px, calc(100vw - 24px));
  padding: 8px 8px 9px;
  border: 1px solid color-mix(in srgb, var(--grade-accent, #4fa346) 24%, rgba(224, 232, 242, .96));
  border-radius: 20px;
  background:
    radial-gradient(circle at 30% 10%, rgba(255, 255, 255, .96), transparent 46%),
    linear-gradient(180deg, rgba(255, 255, 255, .98), color-mix(in srgb, var(--grade-soft, #f2f8ef) 54%, #fff));
  box-shadow: 0 22px 44px rgba(21, 35, 60, .22), 0 0 0 1px rgba(255, 255, 255, .72) inset;
  color: #15233c;
  pointer-events: none;
}

.student-photo-preview__media {
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

.student-photo-preview__media :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.student-photo-preview__caption {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 8px 3px 0;
}

.student-photo-preview__caption strong,
.student-photo-preview__caption span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.student-photo-preview__caption strong {
  color: #15233c;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.15;
}

.student-photo-preview__caption span {
  color: color-mix(in srgb, var(--grade-accent, #4fa346) 62%, #64748b);
  font-size: 10px;
  font-weight: 850;
}

.student-photo-preview-fade-enter-active,
.student-photo-preview-fade-leave-active {
  transition: opacity .16s ease, transform .16s ease;
}

.student-photo-preview-fade-enter-from,
.student-photo-preview-fade-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(.975);
}

.student-photo-preview-fade-enter-to,
.student-photo-preview-fade-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}

@media (prefers-reduced-motion: reduce) {
  .student-grade-photo-card.has-photo .student-grade-photo-card__grade,
  .student-grade-photo-card.has-photo .student-grade-photo-card__photo {
    animation: none;
  }

  .student-grade-photo-card.has-photo .student-grade-photo-card__grade {
    opacity: 0;
  }

  .student-grade-photo-card.has-photo .student-grade-photo-card__photo {
    opacity: 1;
    transform: none;
  }

  .student-photo-preview-fade-enter-active,
  .student-photo-preview-fade-leave-active {
    transition: none;
  }
}
</style>
