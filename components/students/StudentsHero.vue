<template>
  <header class="students-hero">
    <div class="hero-copy">
      <h1>Gestión de Alumnos</h1>
      <p>Administración general de matrícula y estado de cuenta financiero.</p>
    </div>
    <div class="hero-actions">
      <UiButton variant="secondary" class="section-manage-button" @click="$emit('manage-sections')">
        <LucideTags :size="18" /> Secciones
      </UiButton>
      <UiButton variant="primary" class="new-student-button" @click="$emit('new-student')">
        <LucideUserPlus :size="22" /> Nuevo Alumno
      </UiButton>
    </div>
  </header>
</template>

<script setup>
import { LucideTags, LucideUserPlus } from 'lucide-vue-next'
import UiButton from '~/components/ui/UiButton.vue'

defineEmits(['manage-sections', 'new-student'])
</script>
