<template>
  <div class="kpi-value-stage" aria-live="polite" :aria-label="displayText">
    <Transition :name="transitionName">
      <strong :key="displayText" class="kpi-value-stage__value">{{ displayText }}</strong>
    </Transition>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  value: { type: [Number, String], default: 0 }
})

const displayText = computed(() => String(props.value ?? 0))
const direction = ref('up')

const toComparableNumber = (value) => {
  const normalized = String(value ?? '')
    .replace(/[^0-9.-]/g, '')
    .trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

watch(
  () => props.value,
  (nextValue, previousValue) => {
    const nextNumber = toComparableNumber(nextValue)
    const previousNumber = toComparableNumber(previousValue)

    if (nextNumber !== null && previousNumber !== null && nextNumber < previousNumber) {
      direction.value = 'down'
      return
    }

    direction.value = 'up'
  }
)

const transitionName = computed(() => direction.value === 'down' ? 'students-kpi-value-down' : 'students-kpi-value-up')
</script>
