<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-container large">
        <div class="modal-header">
          <h2 class="text-lg font-bold text-gray-800">{{ isEdit ? 'Editar alumno' : 'Nuevo alumno' }}</h2>
        </div>
        <form @submit.prevent="submit">
          <div class="modal-content">
            
            <div v-if="isEdit" class="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg flex justify-between items-center">
              <div>
                <span class="text-xs font-bold text-gray-500 uppercase tracking-wide">Matrícula</span>
                <div class="text-lg font-mono font-bold text-brand-campus">{{ form.matricula }}</div>
              </div>
              <div class="text-right">
                <span class="text-xs font-bold text-gray-500 uppercase tracking-wide">Estatus Actual</span>
                <div>
                  <span :class="['badge mt-1', props.student?.estatus === 'Activo' ? 'badge-success' : 'badge-danger']">
                    {{ props.student?.estatus || 'Activo' }}
                  </span>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div class="space-y-4">
                <h3 class="text-xs font-bold text-brand-teal uppercase tracking-wide border-b border-gray-100 pb-2">Datos Personales</h3>
                <div class="form-group mb-0"><label class="form-label">A. paterno</label><input type="text" v-model="form.apellidoPaterno" class="input-field" required></div>
                <div class="form-group mb-0"><label class="form-label">A. materno</label><input type="text" v-model="form.apellidoMaterno" class="input-field" required></div>
                <div class="form-group mb-0"><label class="form-label">Nombre(s)</label><input type="text" v-model="form.nombres" class="input-field" required></div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="form-group mb-0"><label class="form-label">Nacimiento</label><input type="date" v-model="form.birth" class="input-field" required></div>
                  <div class="form-group mb-0"><label class="form-label">Género</label>
                    <select v-model="form.genero" class="input-field" required>
                      <option value="1">Masculino</option>
                      <option value="0">Femenino</option>
                    </select>
                  </div>
                </div>
              </div>

              <div class="space-y-4">
                <h3 class="text-xs font-bold text-accent-sky uppercase tracking-wide border-b border-gray-100 pb-2">Información Académica</h3>
                <div class="form-group mb-0">
                  <label class="form-label">Plantel</label>
                  <select v-model="form.plantel" class="input-field" required>
                    <option v-for="p in PLANTELES_LIST" :key="p" :value="p">Plantel {{ p }}</option>
                  </select>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="form-group mb-0"><label class="form-label">Nivel</label>
                    <input type="text" :value="derivedNivel" class="input-field bg-gray-50 font-semibold text-gray-500" disabled>
                  </div>
                  <div class="form-group mb-0"><label class="form-label">Grado</label>
                    <select v-model="form.grado" class="input-field" required>
                      <option v-for="g in availableGrades" :key="g" :value="g">{{ g }}</option>
                    </select>
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="form-group mb-0"><label class="form-label">Grupo</label>
                    <select v-model="form.grupo" class="input-field" required>
                      <option value="A">A</option><option value="B">B</option><option value="C">C</option>
                    </select>
                  </div>
                  <div class="form-group mb-0"><label class="form-label">Tipo Ingreso</label>
                    <select v-model="form.interno" class="input-field" required>
                      <option :value="1">Interno</option>
                      <option :value="0">Externo</option>
                    </select>
                  </div>
                </div>
              </div>

              <div class="space-y-4 md:col-span-2 mt-2">
                <h3 class="text-xs font-bold text-accent-gold uppercase tracking-wide border-b border-gray-100 pb-2">Contacto Familiar</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div class="form-group mb-0"><label class="form-label">Padre/Tutor</label><input type="text" v-model="form.padre" class="input-field" required></div>
                  <div class="form-group mb-0"><label class="form-label">Teléfono</label><input type="text" v-model="form.telefono" class="input-field"></div>
                  <div class="form-group mb-0"><label class="form-label">Correo electrónico</label><input type="email" v-model="form.correo" class="input-field" required></div>
                </div>
              </div>

              <div v-if="isEdit" class="space-y-4 md:col-span-2 mt-2">
                <h3 class="text-xs font-bold text-brand-campus uppercase tracking-wide border-b border-gray-100 pb-2">Vinculacion de Matricula</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div class="form-group mb-0"><label class="form-label">Matricula anterior</label><input type="text" v-model="form.matriculaAnterior" class="input-field"></div>
                  <div class="form-group mb-0"><label class="form-label">Matricula sucesora</label><input type="text" v-model="form.matriculaSiguiente" class="input-field"></div>
                </div>
              </div>

              <div v-if="isEdit" class="space-y-4 md:col-span-2 mt-2 p-4 bg-red-50/50 border border-red-100 rounded-lg">
                <h3 class="text-xs font-bold text-accent-coral uppercase tracking-wide border-b border-red-200 pb-2">Administración de Estatus</h3>
                <div class="form-group mb-0">
                  <label class="form-label text-red-900">Estatus (Activo o motivo de baja)</label>
                  <input type="text" v-model="form.estatus" class="input-field border-red-200 focus:border-red-400 focus:ring-red-400/20" required placeholder="Escriba 'Activo' para reactivar">
                  <p class="text-[10px] text-red-800/70 mt-1">Modifique este campo para reactivar un alumno dado de baja o ajustar su motivo.</p>
                </div>
              </div>

            </div>

          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" @click="$emit('close')" type="button">Cancelar</button>
            <button class="btn btn-primary" type="submit" :disabled="loading">
              <LucideLoader2 v-if="loading" class="animate-spin" :size="16" />
              {{ loading ? 'Guardando...' : 'Guardar alumno' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import { LucideLoader2 } from 'lucide-vue-next'
import { PLANTELES_LIST } from '~/utils/constants'
import { useState, useCookie } from '#app'
import { useToast } from '~/composables/useToast'
import { useScrollLock } from '~/composables/useScrollLock'
import { normalizeCicloKey } from '~/shared/utils/ciclo'
import { displayGrado, gradeOptionsForPlantel, nivelFromPlantel } from '~/shared/utils/grado'

const props = defineProps({ student: Object })
const emit = defineEmits(['close', 'success'])
const state = useState('globalState')
const { show } = useToast()

useScrollLock()

const activePlantel = useCookie('auth_active_plantel').value || 'PT'
const defaultPlantel = activePlantel === 'GLOBAL' ? 'PT' : activePlantel

const isEdit = !!props.student
const loading = ref(false)

const form = ref({
  matricula: '', apellidoPaterno: '', apellidoMaterno: '', nombres: '',
  birth: '', genero: '1', plantel: defaultPlantel, interno: 1, nivel: nivelFromPlantel(defaultPlantel), grado: 'Primero', grupo: 'A',
  padre: '', telefono: '', correo: '', ciclo: normalizeCicloKey(state.value.ciclo), estatus: 'Activo',
  matriculaAnterior: '', matriculaSiguiente: ''
})

const derivedNivel = computed(() => nivelFromPlantel(form.value.plantel))
const availableGrades = computed(() => gradeOptionsForPlantel(form.value.plantel))

watch(() => form.value.plantel, () => {
  form.value.nivel = derivedNivel.value
  const selected = availableGrades.value.find(g => g.toLowerCase() === String(form.value.grado || '').toLowerCase())
  form.value.grado = selected || availableGrades.value[0]
}, { immediate: true })

onMounted(() => {
  if (isEdit) {
    const s = props.student
    form.value = {
      matricula: s.matricula, 
      apellidoPaterno: s.apellidoPaterno || '', 
      apellidoMaterno: s.apellidoMaterno || '', 
      nombres: s.nombres || '', 
      birth: s.birth ? s.birth.split('T')[0] : '', 
      genero: s.genero || '1', 
      plantel: s.plantel || defaultPlantel, 
      interno: s.interno !== undefined ? Number(s.interno) : 1, 
      nivel: nivelFromPlantel(s.plantel || defaultPlantel), 
      grado: displayGrado(s.gradoBase || s.grado || 'Primero'), 
      grupo: s.grupo || 'A',
      padre: s.padre || '', 
      telefono: s.telefono || '', 
      correo: s.correo || '', 
      ciclo: normalizeCicloKey(s.ciclo || state.value.ciclo),
      estatus: s.estatus || 'Activo',
      matriculaAnterior: s.matriculaAnterior || '',
      matriculaSiguiente: s.matriculaSiguiente || ''
    }
  }
})

const submit = async () => {
  loading.value = true
  try {
    const url = isEdit ? `/api/students/${form.value.matricula}` : '/api/students'
    const method = isEdit ? 'PUT' : 'POST'
    await $fetch(url, { method, body: { ...form.value, nivel: derivedNivel.value, ciclo: normalizeCicloKey(form.value.ciclo) } })
    show(isEdit ? 'Alumno actualizado correctamente' : 'Alumno registrado exitosamente', 'success')
    emit('success')
  } catch (e) { 
    show('Error guardando la información', 'danger') 
  } finally { 
    loading.value = false 
  }
}
</script>
