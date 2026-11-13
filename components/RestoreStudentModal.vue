<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-container baja-modal" role="dialog" aria-modal="true" aria-labelledby="restore-student-title">
        <div class="modal-header">
          <div>
            <h2 id="restore-student-title" class="modal-title">Restaurar a Activo</h2>
            <p class="modal-subtitle">{{ student?.nombreCompleto || student?.fullName || student?.nombreCompletoAlumno || 'Alumno seleccionado' }}</p>
          </div>
          <button class="modal-icon-button" type="button" aria-label="Cerrar" :disabled="saving" @click="$emit('close')">
            <LucideX :size="18" />
          </button>
        </div>
        <div class="modal-content">
          <p>Se revertirá la baja del alumno en <strong>Alumnos</strong> y <strong>Control Escolar</strong>.</p>
          <p>Volverá a estar Activo sin generar una nueva inscripción ni modificar sus pagos, cargos o documentos.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" type="button" :disabled="saving" @click="$emit('close')">Cancelar</button>
          <button class="btn btn-primary" type="button" :disabled="saving" @click="$emit('confirm')">
            <LucideUserCheck :size="16" />
            {{ saving ? 'Restaurando...' : 'Confirmar restauración' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { LucideUserCheck, LucideX } from 'lucide-vue-next'
import { useScrollLock } from '~/composables/useScrollLock'

const props = defineProps({
  student: { type: Object, default: null },
  saving: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'confirm'])
useModalEscape(() => { if (!props.saving) emit('close') })
useScrollLock()
</script>
