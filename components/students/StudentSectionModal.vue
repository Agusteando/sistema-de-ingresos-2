<template>
  <Teleport to="body">
    <div v-if="show" class="section-modal-backdrop" @click.self="$emit('close')">
      <div class="section-modal-card">
        <header>
          <div>
            <span>Secciones personalizadas</span>
            <h3 v-if="sectionModalStudent">{{ sectionModalStudent.nombreCompleto }}</h3>
            <h3 v-else-if="sectionModalStudents.length">{{ sectionModalStudents.length }} alumnos seleccionados</h3>
            <h3 v-else>Administrar secciones</h3>
          </div>
          <UiIconButton @click="$emit('close')"><LucideX :size="18" /></UiIconButton>
        </header>

        <div class="section-create-row">
          <input :value="newSectionName" placeholder="Nueva seccion local..." @input="$emit('update-new-section-name', $event.target.value)" @keyup.enter="$emit('create-section')" />
          <UiButton variant="primary" size="sm" :disabled="creatingSection || !newSectionName.trim()" @click="$emit('create-section')">
            <LucidePlus :size="14" /> Crear
          </UiButton>
        </div>

        <div v-if="!customSections.length" class="section-empty-state">Aun no hay secciones personalizadas.</div>
        <div v-else class="section-option-list">
          <label v-for="section in customSections" :key="`section-option-${section.id}`" class="section-option">
            <span>
              <strong>{{ section.name }}</strong>
              <em>{{ customSectionCounts[section.id] || 0 }} alumnos</em>
            </span>
            <input
              v-if="sectionModalStudent"
              type="checkbox"
              :checked="studentHasSection(sectionModalStudent, section.id)"
              :disabled="assigningSections"
              @change="$emit('toggle-student-section', sectionModalStudent, section.id, $event.target.checked)"
            />
            <button
              v-else-if="sectionModalStudents.length"
              type="button"
              :class="['section-check', bulkSectionState(section.id)]"
              :disabled="assigningSections"
              :title="bulkSectionState(section.id) === 'all' ? 'Quitar de la selección' : 'Agregar a la selección'"
              @click="$emit('toggle-bulk-section', section)"
            ><span></span></button>
            <button v-else type="button" class="section-delete" title="Eliminar seccion" @click.prevent="$emit('delete-section', section)">
              <LucideTrash2 :size="14" />
            </button>
          </label>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { LucidePlus, LucideTrash2, LucideX } from 'lucide-vue-next'
import { studentHasSection } from '~/shared/utils/studentPresentation'
import UiButton from '~/components/ui/UiButton.vue'
import UiIconButton from '~/components/ui/UiIconButton.vue'

defineProps({
  show: { type: Boolean, default: false },
  sectionModalStudent: { type: Object, default: null },
  sectionModalStudents: { type: Array, default: () => [] },
  newSectionName: { type: String, default: '' },
  customSections: { type: Array, default: () => [] },
  customSectionCounts: { type: Object, default: () => ({}) },
  creatingSection: { type: Boolean, default: false },
  assigningSections: { type: Boolean, default: false },
  bulkSectionState: { type: Function, required: true }
})

defineEmits([
  'close',
  'update-new-section-name',
  'create-section',
  'toggle-student-section',
  'toggle-bulk-section',
  'delete-section'
])
</script>
