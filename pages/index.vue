<template>
  <div class="max-w-[1400px] mx-auto">
    <!-- Premium KPIs strictly visible only to global admins -->
    <div v-if="userRole === 'global'" class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div class="card p-6 border-l-4 border-brand-leaf bg-white shadow-sm hover:shadow-md transition-shadow">
        <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Padrón Activo</h4>
        <div class="text-3xl font-black text-gray-800 mt-2">{{ kpis.totalAlumnos }}</div>
      </div>
      <div class="card p-6 border-l-4 border-accent-gold bg-white shadow-sm hover:shadow-md transition-shadow">
        <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Ingresos del Mes (MXN)</h4>
        <div class="text-3xl font-black text-gray-800 mt-2">${{ Number(kpis.ingresosMes).toLocaleString('es-MX', {minimumFractionDigits:2}) }}</div>
      </div>
      <div class="card p-6 border-l-4 border-accent-sky bg-white shadow-sm hover:shadow-md transition-shadow">
        <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Documentos Activos</h4>
        <div class="text-3xl font-black text-gray-800 mt-2">{{ kpis.conceptosActivos }}</div>
      </div>
    </div>

    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
      <div class="relative w-full md:w-[480px]">
        <LucideSearch class="absolute left-4 top-3.5 text-gray-400" :size="18" />
        <input v-model="searchQuery" @keyup.enter="performSearch" type="text" class="input-field pl-12 py-3 shadow-sm" placeholder="Ingrese matrícula o nombre completo del alumno...">
      </div>
      <button class="btn btn-primary px-6 py-3 shadow-sm" @click="openAlta">
        <LucideUserPlus :size="18"/> Apertura de Expediente
      </button>
    </div>

    <div class="card table-wrapper max-h-[45vh] mb-10 overflow-y-auto shadow-sm border border-gray-100">
      <table class="w-full">
        <thead class="sticky top-0 z-10 shadow-sm bg-gray-50/95 backdrop-blur-md">
          <tr>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500">Matrícula</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500">Nombre del Alumno</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500">Modalidad</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500">Nivel Académico</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500 text-right">Cargos Emitidos</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500 text-right">Total Abonado</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500 text-right">Deuda Vigente</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Situación</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="8" class="text-center text-gray-500 font-medium py-16">Sincronizando con base de datos...</td></tr>
          <tr v-else-if="!students.length"><td colspan="8" class="text-center text-gray-500 py-16">El padrón se encuentra vacío o no coincide con los criterios en su jurisdicción.</td></tr>
          <tr v-else v-for="s in students" :key="s.matricula" @click="selectStudent(s)" :class="{ 'bg-brand-leaf/5': selectedStudent?.matricula === s.matricula }" class="cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-none">
            <td class="font-mono text-[0.95rem] font-bold text-accent-sky py-4 px-6">{{ s.matricula }}</td>
            <td class="font-bold text-gray-800 py-4 px-6">{{ s.nombreCompleto }}</td>
            <td class="py-4 px-6"><span :class="['badge', s.interno ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800']">{{ s.interno ? 'INTERNO' : 'EXTERNO' }}</span></td>
            <td class="text-gray-500 font-medium py-4 px-6">{{ s.nivel }} - {{ s.grado }}{{ s.grupo }}</td>
            <td class="text-right font-bold text-gray-600 py-4 px-6 font-mono">${{ format(s.importeTotal) }}</td>
            <td class="text-right font-bold text-brand-campus py-4 px-6 font-mono">${{ format(s.pagosTotal) }}</td>
            <td :class="['text-right font-bold font-mono py-4 px-6', s.saldoNeto > 0 ? 'text-accent-coral' : 'text-gray-600']">${{ format(s.saldoNeto) }}</td>
            <td class="text-center py-4 px-6"><span :class="['badge', s.estatus === 'Activo' ? 'badge-success' : 'badge-danger']">{{ s.estatus }}</span></td>
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
import { useCookie, useState } from '#app'
import { LucideSearch, LucideUserPlus } from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import StudentDetails from '~/components/StudentDetails.vue'
import StudentFormModal from '~/components/StudentFormModal.vue'

const { show } = useToast()
const state = useState('globalState')
const userRole = ref(useCookie('auth_role').value || 'plantel')
const searchQuery = ref('')
const students = ref([])
const loading = ref(false)
const selectedStudent = ref(null)

const kpis = ref({ totalAlumnos: 0, ingresosMes: 0, conceptosActivos: 0 })
const showStudentModal = ref(false)
const editingStudent = ref(null)

const format = (val) => Number(val || 0).toFixed(2)

const loadKpis = async () => {
  if (userRole.value !== 'global') return
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
  performSearch()
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
  show('Expediente actualizado en el padrón.')
  performSearch()
  loadKpis()
}
</script>