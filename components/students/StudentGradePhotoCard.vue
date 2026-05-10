<template>
  <div
    class="student-grade-photo-card"
    :class="{
      'has-photo': hasPhoto,
      'is-loading-photo': photoLoading,
      inactive: student?.estatus !== 'Activo',
      unenrolled: !isEnrolled
    }"
    :style="studentPresentationStyle(student)"
    :title="gradeVisualTitle(student)"
  >
    <div class="student-grade-photo-card__slide student-grade-photo-card__grade" aria-hidden="true">
      <strong>{{ gradeVisualNumber(student) }}</strong>
      <span>Grado</span>
    </div>

    <div v-if="hasPhoto" class="student-grade-photo-card__slide student-grade-photo-card__photo">
      <UiVisionFaceImage :image-url="photoUrl" :alt="`Foto de ${student?.nombreCompleto || 'alumno'}`" fit="contain" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import UiVisionFaceImage from '~/components/ui/UiVisionFaceImage.vue'
import { gradeVisualNumber, gradeVisualTitle, studentPresentationStyle } from '~/shared/utils/studentPresentation'

const props = defineProps({
  student: { type: Object, default: null },
  photoUrl: { type: String, default: '' },
  photoLoading: { type: Boolean, default: false },
  isEnrolled: { type: Boolean, default: true }
})

const hasPhoto = computed(() => Boolean(props.photoUrl && props.photoUrl !== 'none'))
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
  text-transform: uppercase;
}

.student-grade-photo-card__grade strong {
  font-size: 31px;
  font-weight: 880;
  letter-spacing: -.05em;
  line-height: .86;
  text-shadow: 0 1px 0 rgba(255, 255, 255, .9);
}

.student-grade-photo-card__grade span {
  margin-top: 7px;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: .02em;
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
}
</style>
