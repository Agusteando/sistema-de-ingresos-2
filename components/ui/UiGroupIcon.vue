<template>
  <span
    v-if="hasIcon"
    :class="['ui-group-icon', letter ? 'is-letter' : 'is-mask']"
    :style="iconStyle"
    :data-group-letter="letter || undefined"
    :title="resolvedLabel || undefined"
    aria-hidden="true"
  >
    <span v-if="letter" class="ui-group-icon__letter">{{ letter }}</span>
    <span v-else class="ui-group-icon__mask" />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { studentGroupIconLabel, studentGroupIconLetter, studentGroupIconRenderStyle, studentGroupIconUrl } from '~/shared/utils/studentGroupIcons'

const props = defineProps<{ label?: string | null }>()

const letter = computed(() => studentGroupIconLetter(props.label))
const iconUrl = computed(() => letter.value ? '' : studentGroupIconUrl(props.label))
const resolvedLabel = computed(() => studentGroupIconLabel(props.label) || letter.value)
const hasIcon = computed(() => Boolean(letter.value || iconUrl.value))
const iconStyle = computed(() => {
  if (letter.value) return {}
  return studentGroupIconRenderStyle(props.label)
})
</script>
