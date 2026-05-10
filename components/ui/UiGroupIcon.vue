<template>
  <span
    v-if="iconUrl"
    class="ui-group-icon"
    :style="iconStyle"
    :title="resolvedLabel || undefined"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { studentGroupIconLabel, studentGroupIconUrl } from '~/shared/utils/studentGroupIcons'

const props = defineProps<{ label?: string | null }>()

const iconUrl = computed(() => studentGroupIconUrl(props.label))
const resolvedLabel = computed(() => studentGroupIconLabel(props.label))
const iconStyle = computed(() => ({
  '--group-icon-mask': `url("${iconUrl.value}")`
}))
</script>
