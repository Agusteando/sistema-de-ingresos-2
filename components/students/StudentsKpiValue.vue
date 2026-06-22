<template>
  <strong
    v-if="asStrong"
    :class="['kpi-value-strong', { 'has-no-value': !hasDisplayText, 'is-rolling': rollingActive && hasDisplayText }]"
    aria-live="polite"
    :aria-label="ariaLabel"
    :aria-hidden="hasDisplayText ? undefined : 'true'"
  >
    <b class="kpi-value-static">{{ hasDisplayText ? displayText : '\u00a0' }}</b>
    <b v-if="rollingActive && hasDisplayText" class="kpi-digit-roll-overlay" aria-hidden="true">
      <b
        v-for="(char, index) in rollingChars"
        :key="`${animationVersion}-${index}-${char.value}`"
        :class="['kpi-digit-roll-char', { 'is-digit': char.isDigit }]"
        :style="{ '--kpi-char-index': index }"
      >
        <b class="kpi-digit-roll-sizer">{{ char.value }}</b>
        <b v-if="char.isDigit" class="kpi-digit-roll-window">
          <b class="kpi-digit-roll-track" :style="{ '--kpi-roll-steps': char.sequence.length - 1 }">
            <b v-for="(digit, digitIndex) in char.sequence" :key="`${animationVersion}-${index}-${digitIndex}`">{{ digit }}</b>
          </b>
        </b>
        <b v-else class="kpi-digit-roll-symbol">{{ char.value }}</b>
      </b>
    </b>
  </strong>
  <div v-else :class="['kpi-value-stage', { 'has-no-value': !hasDisplayText }]" aria-live="polite" :aria-label="ariaLabel">
    <strong
      :class="[
        'kpi-value-stage__value',
        {
          'kpi-value-stage__value--empty': !hasDisplayText,
          'is-rolling': rollingActive && hasDisplayText
        }
      ]"
      :aria-hidden="hasDisplayText ? undefined : 'true'"
    >
      <b class="kpi-value-static">{{ hasDisplayText ? displayText : '\u00a0' }}</b>
      <b v-if="rollingActive && hasDisplayText" class="kpi-digit-roll-overlay" aria-hidden="true">
        <b
          v-for="(char, index) in rollingChars"
          :key="`${animationVersion}-${index}-${char.value}`"
          :class="['kpi-digit-roll-char', { 'is-digit': char.isDigit }]"
          :style="{ '--kpi-char-index': index }"
        >
          <b class="kpi-digit-roll-sizer">{{ char.value }}</b>
          <b v-if="char.isDigit" class="kpi-digit-roll-window">
            <b class="kpi-digit-roll-track" :style="{ '--kpi-roll-steps': char.sequence.length - 1 }">
              <b v-for="(digit, digitIndex) in char.sequence" :key="`${animationVersion}-${index}-${digitIndex}`">{{ digit }}</b>
            </b>
          </b>
          <b v-else class="kpi-digit-roll-symbol">{{ char.value }}</b>
        </b>
      </b>
    </strong>
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
const moduloDigit = (value) => ((value % 10) + 10) % 10

const buildDigitSequence = (char, index) => {
  const finalDigit = Number(char)
  const steps = 8 + (index % 3)
  return Array.from({ length: steps + 1 }, (_, stepIndex) => {
    const offset = steps - stepIndex
    const nextDigit = direction.value === 'down'
      ? moduloDigit(finalDigit + offset)
      : moduloDigit(finalDigit - offset)
    return String(nextDigit)
  })
}

const rollingChars = computed(() => displayChars.value.map((char, index) => ({
  value: char,
  isDigit: isDigit(char),
  sequence: isDigit(char) ? buildDigitSequence(char, index) : [char]
})))

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
  }, 1580)
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
</script>
