<template>
  <span
    v-if="hasIcon"
    :class="['ui-group-icon', missingGroup ? 'is-missing' : letter ? 'is-letter' : 'is-mask']"
    :style="iconStyle"
    :data-group-letter="letter || undefined"
    :title="resolvedLabel || undefined"
    aria-hidden="true"
  >
    <span v-if="missingGroup" class="ui-group-icon__warning">!</span>
    <span v-else-if="letter" class="ui-group-icon__letter">{{ letter }}</span>
    <span v-else class="ui-group-icon__mask" />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { studentGroupIconLabel, studentGroupIconLetter, studentGroupIconRenderStyle, studentGroupIconUrl } from '~/shared/utils/studentGroupIcons'

const props = withDefaults(defineProps<{ label?: string | null; missing?: boolean }>(), {
  label: null,
  missing: false
})

const normalizedLabel = computed(() => String(props.label ?? '').replaceAll('"', '').trim())
const missingGroup = computed(() => props.missing || !normalizedLabel.value || normalizedLabel.value.toLowerCase() === 'null')
const letter = computed(() => missingGroup.value ? '' : studentGroupIconLetter(props.label))
const iconUrl = computed(() => missingGroup.value || letter.value ? '' : studentGroupIconUrl(props.label))
const resolvedLabel = computed(() => missingGroup.value ? 'Sin grupo' : (studentGroupIconLabel(props.label) || letter.value))
const hasIcon = computed(() => Boolean(missingGroup.value || letter.value || iconUrl.value))
const iconStyle = computed(() => {
  if (missingGroup.value || letter.value) return {}
  return studentGroupIconRenderStyle(props.label)
})
</script>
