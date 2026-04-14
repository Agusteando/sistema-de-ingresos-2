<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <div style="position: relative; width: 450px;">
        <LucideSearch size="18" style="position: absolute; left: 14px; top: 11px; color: var(--brand-teal);" />
        <input v-model="searchQuery" @keyup.enter="performSearch" type="text" class="input-field" placeholder="Ingrese matrícula o nombre del alumno..." style="padding-left: 40px; border-color: var(--brand-teal);">
      </div>
      <button class="btn btn-primary" @click="openAlta">
        <LucideUserPlus size="18"/> Registrar Nuevo Alumno
      </button>
    </div>

    <div class="card table-wrapper" style="max-height: 40vh; margin-bottom: 2rem;">
      <table>
        <thead>
          <tr>
            <th>Matrícula</th>
            <th>Nombre del Alumno</th>
            <th>Modalidad</th>
            <th>Nivel y Grado</th>
            <th class="text-right">Cargos (MXN)</th>
            <th class="text-right">Abonos (MXN)</th>
            <th class="text-right">Deuda Actual (MXN)</th>
            <th class="text-center">Estado</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="8" class="text-center" style="padding: 3rem; color: var(--brand-teal); font-weight: 500;">
              Procesando directorio...
            </td>
          </tr>
          <tr v-else-if="!students.length">
            <td colspan="8" class="text-center" style="padding: 3rem; color: #5B665E;">
              Ingrese un término de búsqueda para visualizar registros.
            </td>
          </tr>
          <tr v-else v-for="s in students" :key="s.matricula" @click="selectStudent(s)" :class="{ 'selected': selectedStudent?.matricula === s.matricula }">
            <td style="font-family: monospace; font-weight: 600; color: var(--accent-sky);">{{ s.matricula }}</td>
            <td class="font-bold">{{ s.nombreCompleto }}</td>
            <td><span :class="['badge', s.interno ? 'badge-info' : 'badge-success']">{{ s.interno ? 'INTERNO' : 'EXTERNO' }}</span></td>
            <td style="color: #5B665E;">{{ s.nivel }} - {{ s.grado }}{{ s.grupo }}</td>
            <td class="text-right font-bold">${{ format(s.importeTotal) }}</td>
            <td class="text-right font-bold text-success">${{ format(s.pagosTotal) }}</td>
            <td class="text-right font-bold" :class="s.saldoNeto > 0 ? 'text-danger' : ''">${{ format(s.saldoNeto) }}</td>
            <td class="text-center"><span :class="['badge', s.estatus === 'Activo' ? 'badge-success' : 'badge-danger']">{{ s.estatus }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <StudentDetails 
      v-if="selectedStudent" 
      :student="selectedStudent" 
      @refresh="performSearch"
      @edit="openEdit"
    />

    <StudentFormModal 
      v-if="showStudentModal" 
      :student="editingStudent"
      @close="closeStudentModal" 
      @success="handleStudentSuccess" 
    />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { LucideSearch, LucideUserPlus } from 'lucide-vue-next'
import { useState } from '#app'
import { useToast } from '~/composables/useToast'
import StudentDetails from '~/components/StudentDetails.vue'
import StudentFormModal from '~/components/StudentFormModal.vue'

const { show } = useToast()
const state = useState('globalState')
const searchQuery = ref('')
const students = ref([])
const loading = ref(false)
const selectedStudent = ref(null)

const showStudentModal = ref(false)
const editingStudent = ref(null)

const format = (val) => Number(val || 0).toFixed(2)

const performSearch = async () => {
  loading.value = true
  try {
    students.value = await $fetch('/api/students', { params: { q: searchQuery.value, ciclo: state.value.ciclo } })
    if (selectedStudent.value) {
      selectedStudent.value = students.value.find(s => s.matricula === selectedStudent.value.matricula) || null
    }
  } catch (e) {
    show('Ocurrió un error al cargar el padrón', 'danger')
  } finally {
    loading.value = false
  }
}

const selectStudent = (student) => {
  selectedStudent.value = student
}

watch(() => state.value.ciclo, performSearch)

const openAlta = () => {
  editingStudent.value = null
  showStudentModal.value = true
}

const openEdit = (studentData) => {
  editingStudent.value = studentData
  showStudentModal.value = true
}

const closeStudentModal = () => {
  showStudentModal.value = false
  editingStudent.value = null
}

const handleStudentSuccess = () => {
  closeStudentModal()
  show('Operación registrada exitosamente en el sistema')
  performSearch()
}
</script>