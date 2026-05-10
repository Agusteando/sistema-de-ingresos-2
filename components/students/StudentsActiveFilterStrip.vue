<template>
  <div class="active-filter-strip">
    <span v-for="tag in tags" :key="tag" class="filter-token">{{ tag }}</span>
  </div>
</template>

<script setup>
defineProps({
  tags: { type: Array, default: () => [] }
})
</script>
