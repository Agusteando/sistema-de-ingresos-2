<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup>
import { useActiveCiclo } from '~/composables/useActiveCiclo'

useActiveCiclo()
</script>
