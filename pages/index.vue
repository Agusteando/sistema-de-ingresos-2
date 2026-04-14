<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <div style="position: relative; width: 360px;">
        <LucideSearch size="16" style="position: absolute; left: 12px; top: 10px; color: var(--text-muted);" />
        <input v-model="searchQuery" @keyup.enter="performSearch" type="text" class="input-field" placeholder="Buscar alumno por matrícula o nombre..." style="padding-left: 32px;">
      </div>
      <button class="btn btn-primary" @click="openAlta">Nuevo Alumno</button>
    </div>

    <div class="card table-wrapper" style="max-height: 38vh; margin-bottom: 2rem;">
      <table>
        <thead>
          <tr>
            <th>Matrícula</th>
            <th>Alumno</th>
            <th>Modalidad</th>
            <th>Nivel</th>
            <th class="text-right">Cargos</th>
            <th class="text-right">Abonos</th>
            <th class="text-right">Saldo</th>
            <th class="text-center">Estatus</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="8" class="text-center" style="padding: 2rem;">Buscando...</td></tr>
          <tr v-else-if="!students.length"><td colspan="8" class="text-center" style="padding: 2rem;">Escriba un término para localizar registros.</td></tr>
          <tr v-else v-for="s in students" :key="s.matricula" @click="selectStudent(s)" :class="{ 'selected': selectedStudent?.matricula === s.matricula }">
            <td style="font-family: monospace; font-weight: 600;">{{ s.matricula }}</td>
            <td class="font-bold">{{ s.nombreCompleto }}</td>
            <td><span :class="['badge', s.interno ? 'badge-info' : 'badge-success']">{{ s.interno ? 'INTERNO' : 'EXTERNO' }}</span></td>
            <td>{{ s.nivel }} - {{ s.grado }}{{ s.grupo }}</td>
            <td class="text-right">${{ format(s.importeTotal) }}</td>
            <td class="text-right font-bold text-success">${{ format(s.pagosTotal) }}</td>
            <td class="text-right font-bold" :class="s.saldoNeto > 0 ? 'text-danger' : ''">${{ format(s.saldoNeto) }}</td>
            <td class="text-center"><span :class="['badge', s.estatus === 'Activo' ? 'badge-success' : 'badge-danger']">{{ s.estatus }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <StudentDetails v-if="selectedStudent" :student="selectedStudent" @refresh="performSearch" @edit="openEdit" />
    <StudentFormModal v-if="showStudentModal" :student="editingStudent" @close="closeStudentModal" @success="handleStudentSuccess" />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { LucideSearch } from 'lucide-vue-next'
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
    if (selectedStudent.value) selectedStudent.value = students.value.find(s => s.matricula === selectedStudent.value.matricula) || null
  } catch (e) {
    show('Error de conexión', 'danger')
  } finally {
    loading.value = false
  }
}

const selectStudent = (student) => { selectedStudent.value = student }
watch(() => state.value.ciclo, performSearch)

const openAlta = () => { editingStudent.value = null; showStudentModal.value = true }
const openEdit = (studentData) => { editingStudent.value = studentData; showStudentModal.value = true }
const closeStudentModal = () => { showStudentModal.value = false; editingStudent.value = null }

const handleStudentSuccess = () => {
  closeStudentModal()
  show('Registro exitoso')
  performSearch()
}
</script>