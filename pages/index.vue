<template>
  <div class="max-w-[1400px] mx-auto">
    <!-- Premium KPIs -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <div class="card p-6 border-l-4 border-brand-leaf">
        <h4 class="text-sm font-bold text-brand-teal uppercase tracking-wide">Total Padrón Activo</h4>
        <div class="text-3xl font-bold text-neutral-ink mt-2">{{ kpis.totalAlumnos }}</div>
      </div>
      <div class="card p-6 border-l-4 border-accent-gold">
        <h4 class="text-sm font-bold text-brand-teal uppercase tracking-wide">Ingresos del Mes (MXN)</h4>
        <div class="text-3xl font-bold text-neutral-ink mt-2">${{ Number(kpis.ingresosMes).toLocaleString('es-MX', {minimumFractionDigits:2}) }}</div>
      </div>
      <div class="card p-6 border-l-4 border-accent-sky">
        <h4 class="text-sm font-bold text-brand-teal uppercase tracking-wide">Conceptos de Cobro</h4>
        <div class="text-3xl font-bold text-neutral-ink mt-2">{{ kpis.conceptosActivos }}</div>
      </div>
    </div>

    <!-- Search & Actions -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 mt-8">
      <div class="relative w-full md:w-[440px]">
        <LucideSearch class="absolute left-4 top-3.5 text-brand-teal" :size="18" />
        <input v-model="searchQuery" @keyup.enter="performSearch" type="text" class="input-field pl-12 py-3" placeholder="Ingrese matrícula o nombre completo del alumno...">
      </div>
      <button class="btn btn-primary px-6 py-3" @click="openAlta">
        <LucideUserPlus :size="18"/> Apertura de Expediente
      </button>
    </div>

    <!-- Data Grid -->
    <div class="card table-wrapper max-h-[45vh] mb-10 overflow-y-auto">
      <table>
        <thead class="sticky top-0 z-10 shadow-sm">
          <tr>
            <th>Matrícula</th>
            <th>Nombre del Alumno</th>
            <th>Modalidad</th>
            <th>Nivel Académico</th>
            <th class="text-right">Cargos Emitidos</th>
            <th class="text-right">Total Abonado</th>
            <th class="text-right">Deuda Vigente</th>
            <th class="text-center">Situación</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="8" class="text-center text-brand-teal font-bold py-16">Sincronizando con base de datos central...</td></tr>
          <tr v-else-if="!students.length"><td colspan="8" class="text-center text-gray-500 py-16">El padrón se encuentra vacío o no coincide con los criterios.</td></tr>
          <tr v-else v-for="s in students" :key="s.matricula" @click="selectStudent(s)" :class="{ 'selected': selectedStudent?.matricula === s.matricula }" class="cursor-pointer">
            <td class="font-mono text-[0.95rem] font-bold text-accent-sky">{{ s.matricula }}</td>
            <td class="font-bold">{{ s.nombreCompleto }}</td>
            <td><span :class="['badge', s.interno ? 'badge-info' : 'badge-success']">{{ s.interno ? 'INTERNO' : 'EXTERNO' }}</span></td>
            <td class="text-gray-500">{{ s.nivel }} - {{ s.grado }}{{ s.grupo }}</td>
            <td class="text-right font-bold">${{ format(s.importeTotal) }}</td>
            <td class="text-right font-bold text-brand-campus">${{ format(s.pagosTotal) }}</td>
            <td :class="['text-right font-bold', s.saldoNeto > 0 ? 'text-accent-coral' : '']">${{ format(s.saldoNeto) }}</td>
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
import { ref, watch, onMounted } from 'vue'
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

const kpis = ref({ totalAlumnos: 0, ingresosMes: 0, conceptosActivos: 0 })

const showStudentModal = ref(false)
const editingStudent = ref(null)

const format = (val) => Number(val || 0).toFixed(2)

const loadKpis = async () => {
  try {
    kpis.value = await $fetch('/api/dashboard/kpis', { params: { ciclo: state.value.ciclo } })
  } catch(e) {}
}

const performSearch = async () => {
  loading.value = true
  try {
    students.value = await $fetch('/api/students', { params: { q: searchQuery.value, ciclo: state.value.ciclo } })
    if (selectedStudent.value) selectedStudent.value = students.value.find(s => s.matricula === selectedStudent.value.matricula) || null
  } catch (e) { show('Error de lectura en expedientes', 'danger') } 
  finally { loading.value = false }
}

const selectStudent = (student) => { selectedStudent.value = student }

onMounted(() => {
  loadKpis()
})

watch(() => state.value.ciclo, () => {
  performSearch()
  loadKpis()
})

const openAlta = () => { editingStudent.value = null; showStudentModal.value = true }
const openEdit = (studentData) => { editingStudent.value = studentData; showStudentModal.value = true }
const closeStudentModal = () => { showStudentModal.value = false; editingStudent.value = null }

const handleStudentSuccess = () => {
  closeStudentModal()
  show('Expediente actualizado en el padrón maestro')
  performSearch()
  loadKpis()
}
</script>