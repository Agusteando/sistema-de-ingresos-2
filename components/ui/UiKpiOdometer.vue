<template>
  <span
    :class="[
      'ui-kpi-odometer',
      `is-${direction}`,
      {
        'is-animating': isAnimating,
        'has-delta': Boolean(deltaText)
      }
    ]"
    :style="odometerStyle"
    :aria-label="currentText"
  >
    <span class="ui-kpi-odometer__viewport" aria-hidden="true">
      <span
        v-if="isAnimating && previousText"
        class="ui-kpi-odometer__value ui-kpi-odometer__value--previous"
      >{{ previousText }}</span>
      <span class="ui-kpi-odometer__value ui-kpi-odometer__value--current">{{ currentText }}</span>
    </span>
    <span v-if="deltaText" class="ui-kpi-odometer__delta" aria-hidden="true">{{ deltaText }}</span>
  </span>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'

const props = defineProps({
  value: { type: [Number, String], required: true },
  format: { type: String, default: 'integer' },
  locale: { type: String, default: 'es-MX' },
  minimumFractionDigits: { type: Number, default: 0 },
  maximumFractionDigits: { type: Number, default: 0 }
})

const ANIMATION_MS = 620
const DELTA_VISIBLE_MS = 1700

const toNumber = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const formatNumber = (value, options = {}) => {
  const numeric = toNumber(value)

  if (props.format === 'currency') {
    return `$${numeric.toLocaleString(props.locale, {
      minimumFractionDigits: props.minimumFractionDigits,
      maximumFractionDigits: props.maximumFractionDigits
    })}`
  }

  return Math.round(numeric).toLocaleString(props.locale, options)
}

const formatDelta = (value) => {
  const absolute = Math.abs(value)
  const sign = value > 0 ? '+' : '-'

  if (props.format === 'currency') {
    return `${sign}$${absolute.toLocaleString(props.locale, {
      minimumFractionDigits: props.minimumFractionDigits,
      maximumFractionDigits: props.maximumFractionDigits
    })}`
  }

  return `${sign}${Math.round(absolute).toLocaleString(props.locale)}`
}

const currentText = ref(formatNumber(props.value))
const previousText = ref('')
const previousNumeric = ref(toNumber(props.value))
const direction = ref('steady')
const deltaText = ref('')
const isAnimating = ref(false)
const minCharacterCount = ref(currentText.value.length)

let animationTimer = null
let deltaTimer = null

const clearTimers = () => {
  if (animationTimer) {
    clearTimeout(animationTimer)
    animationTimer = null
  }

  if (deltaTimer) {
    clearTimeout(deltaTimer)
    deltaTimer = null
  }
}

const odometerStyle = computed(() => ({
  '--ui-kpi-odometer-ch': `${Math.max(minCharacterCount.value, 1)}ch`
}))

watch(
  () => props.value,
  (nextValue) => {
    const nextNumeric = toNumber(nextValue)
    const nextText = formatNumber(nextValue)
    const previousValue = previousNumeric.value
    const previousDisplay = currentText.value

    if (nextText === previousDisplay) {
      previousNumeric.value = nextNumeric
      return
    }

    clearTimers()

    previousText.value = previousDisplay
    currentText.value = nextText
    minCharacterCount.value = Math.max(minCharacterCount.value, previousDisplay.length, nextText.length)

    const delta = nextNumeric - previousValue
    direction.value = delta > 0 ? 'up' : delta < 0 ? 'down' : 'steady'
    deltaText.value = delta ? formatDelta(delta) : ''
    isAnimating.value = true
    previousNumeric.value = nextNumeric

    animationTimer = setTimeout(() => {
      isAnimating.value = false
      previousText.value = ''
      animationTimer = null
    }, ANIMATION_MS)

    if (deltaText.value) {
      deltaTimer = setTimeout(() => {
        deltaText.value = ''
        deltaTimer = null
      }, DELTA_VISIBLE_MS)
    }
  }
)

onBeforeUnmount(clearTimers)
</script>
