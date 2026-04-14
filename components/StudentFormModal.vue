<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-container large">
      <div class="modal-header">
        <h2 class="text-xl font-bold text-brand-campus">{{ isEdit ? 'Editar Expediente de Alumno' : 'Apertura de Nuevo Expediente' }}</h2>
      </div>
      <form @submit.prevent="submit">
        <div class="modal-content">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div class="form-group col-span-3" v-if="isEdit">
              <label class="form-label">Matrícula Asignada</label>
              <input type="text" v-model="form.matricula" class="input-field font-mono" disabled>
            </div>
            
            <div class="form-group"><label class="form-label">Apellido Paterno</label><input type="text" v-model="form.apellidoPaterno" class="input-field" required></div>
            <div class="form-group"><label class="form-label">Apellido Materno</label><input type="text" v-model="form.apellidoMaterno" class="input-field" required></div>
            <div class="form-group"><label class="form-label">Nombres</label><input type="text" v-model="form.nombres" class="input-field" required></div>
            
            <div class="form-group"><label class="form-label">Fecha de Nacimiento</label><input type="date" v-model="form.birth" class="input-field" required></div>
            <div class="form-group"><label class="form-label">Género Registrado</label><select v-model="form.genero" class="input-field" required><option value="1">Masculino</option><option value="0">Femenino</option></select></div>
            <div class="form-group"><label class="form-label">Plantel Institucional</label><select v-model="form.plantel" class="input-field" required><option value="PT">Primaria Toluca</option><option value="PM">Primaria Metepec</option><option value="SM">Secundaria Metepec</option></select></div>

            <div class="form-group"><label class="form-label">Nivel Académico</label><select v-model="form.nivel" class="input-field" required><option value="Preescolar">Preescolar</option><option value="Primaria">Primaria</option><option value="Secundaria">Secundaria</option></select></div>
            <div class="form-group"><label class="form-label">Grado Escolar</label><select v-model="form.grado" class="input-field" required><option value="Primero">Primero</option><option value="Segundo">Segundo</option><option value="Tercero">Tercero</option><option value="Cuarto">Cuarto</option><option value="Quinto">Quinto</option><option value="Sexto">Sexto</option></select></div>
            <div class="form-group"><label class="form-label">Grupo Asignado</label><select v-model="form.grupo" class="input-field" required><option value="A">A</option><option value="B">B</option><option value="C">C</option></select></div>

            <div class="form-group col-span-3"><label class="form-label">Nombre del Padre o Tutor</label><input type="text" v-model="form.padre" class="input-field" required></div>
            
            <div class="form-group"><label class="form-label">Teléfono de Contacto</label><input type="text" v-model="form.telefono" class="input-field"></div>
            <div class="form-group col-span-2"><label class="form-label">Correo Electrónico Notificaciones</label><input type="email" v-model="form.correo" class="input-field" required></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="$emit('close')" type="button">Cancelar</button>
          <button class="btn btn-primary" type="submit" :disabled="loading">Guardar Registro</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useState } from '#app'
import { useToast } from '~/composables/useToast'

const props = defineProps({ student: Object })
const emit = defineEmits(['close', 'success'])
const state = useState('globalState')
const { show } = useToast()

const isEdit = !!props.student
const loading = ref(false)

const form = ref({
  matricula: '', apellidoPaterno: '', apellidoMaterno: '', nombres: '',
  birth: '', genero: '1', plantel: 'PT', nivel: 'Primaria', grado: 'Primero', grupo: 'A',
  padre: '', telefono: '', correo: '', ciclo: state.value.ciclo
})

onMounted(() => {
  if (isEdit) {
    const s = props.student
    form.value = {
      matricula: s.matricula, apellidoPaterno: s.apellidoPaterno, apellidoMaterno: s.apellidoMaterno, nombres: s.nombres, 
      birth: s.birth ? s.birth.split('T')[0] : '', genero: s.genero || '1', plantel: s.plantel || 'PT', nivel: s.nivel, grado: s.grado, grupo: s.grupo,
      padre: s.padre, telefono: s.telefono, correo: s.correo, ciclo: s.ciclo || state.value.ciclo
    }
  }
})

const submit = async () => {
  loading.value = true
  try {
    const url = isEdit ? `/api/students/${form.value.matricula}` : '/api/students'
    const method = isEdit ? 'PUT' : 'POST'
    await $fetch(url, { method, body: form.value })
    emit('success')
  } catch (e) { show('Error guardando la información del alumno', 'danger') } 
  finally { loading.value = false }
}
</script>