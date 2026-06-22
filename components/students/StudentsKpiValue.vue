<template>
  <strong
    v-if="asStrong"
    :class="['kpi-value-strong', { 'has-no-value': !hasDisplayText }]"
    aria-live="polite"
    :aria-label="ariaLabel"
    :aria-hidden="hasDisplayText ? undefined : 'true'"
  >{{ hasDisplayText ? displayText : '\u00a0' }}<span v-if="rollingActive && hasDisplayText" class="kpi-digit-roll-overlay" aria-hidden="true"><span
      v-for="(char, index) in displayChars"
      :key="`${animationVersion}-${index}-${char}`"
      :class="['kpi-digit-roll-char', { 'is-digit': isDigit(char) }]"
      :style="{ '--kpi-char-index': index, '--kpi-roll-direction': rollDirection }"
    >{{ char }}</span></span></strong>
  <div v-else :class="['kpi-value-stage', { 'has-no-value': !hasDisplayText }]" aria-live="polite" :aria-label="ariaLabel">
    <Transition :name="transitionName">
      <strong
        v-if="hasDisplayText"
        :key="displayText"
        class="kpi-value-stage__value"
      >{{ displayText }}<span v-if="rollingActive" class="kpi-digit-roll-overlay" aria-hidden="true"><span
          v-for="(char, index) in displayChars"
          :key="`${animationVersion}-${index}-${char}`"
          :class="['kpi-digit-roll-char', { 'is-digit': isDigit(char) }]"
          :style="{ '--kpi-char-index': index, '--kpi-roll-direction': rollDirection }"
        >{{ char }}</span></span></strong>
      <strong v-else key="empty" class="kpi-value-stage__value kpi-value-stage__value--empty" aria-hidden="true">&nbsp;</strong>
    </Transition>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  value: { type: [Number, String], default: null },
  as: { type: String, default: 'stage' }
})

const isBlankValue = (value) => value === null || value === undefined || value === ''
const displayText = computed(() => isBlankValue(props.value) ? '' : String(props.value))
const hasDisplayText = computed(() => displayText.value.length > 0)
const displayChars = computed(() => displayText.value.split(''))
const ariaLabel = computed(() => hasDisplayText.value ? displayText.value : 'Sin dato disponible')
const asStrong = computed(() => props.as === 'strong')
const direction = ref('up')
const animationVersion = ref(0)
const rollingActive = ref(false)
let rollingTimer = null

const isDigit = (char) => /\d/.test(String(char || ''))

const stopRollingTimer = () => {
  if (!rollingTimer) return
  clearTimeout(rollingTimer)
  rollingTimer = null
}

const triggerRolling = () => {
  stopRollingTimer()
  if (!hasDisplayText.value) {
    rollingActive.value = false
    return
  }
  rollingActive.value = true
  rollingTimer = setTimeout(() => {
    rollingActive.value = false
    rollingTimer = null
  }, 720)
}

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
    } else {
      direction.value = 'up'
    }

    animationVersion.value += 1
    triggerRolling()
  },
  { immediate: true }
)

onBeforeUnmount(stopRollingTimer)

const transitionName = computed(() => direction.value === 'down' ? 'students-kpi-value-down' : 'students-kpi-value-up')
const rollDirection = computed(() => direction.value === 'down' ? '-1' : '1')
</script>
