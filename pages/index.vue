<template>
  <div class="max-w-[1400px] mx-auto">
    <!-- Métricas Segmentadas (KPIs) -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div class="card p-6 border-l-4 border-gray-400 bg-white shadow-sm hover:shadow-md transition-shadow">
        <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Total de alumnos</h4>
        <div class="text-3xl font-black text-gray-800 mt-2">{{ kpis.totalAlumnos }}</div>
      </div>
      <div class="card p-6 border-l-4 border-brand-teal bg-white shadow-sm hover:shadow-md transition-shadow">
        <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Alumnos internos</h4>
        <div class="text-3xl font-black text-brand-teal mt-2">{{ kpis.internos }}</div>
      </div>
      <div class="card p-6 border-l-4 border-accent-sky bg-white shadow-sm hover:shadow-md transition-shadow">
        <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Alumnos externos</h4>
        <div class="text-3xl font-black text-accent-sky mt-2">{{ kpis.externos }}</div>
      </div>
      <div class="card p-6 border-l-4 border-accent-gold bg-white shadow-sm hover:shadow-md transition-shadow" v-if="userRole === 'global'">
        <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Ingresos del Mes</h4>
        <div class="text-3xl font-black text-gray-800 mt-2">${{ Number(kpis.ingresosMes).toLocaleString('es-MX', {minimumFractionDigits:2}) }}</div>
      </div>
    </div>

    <!-- Filtros de operación central -->
    <div class="flex flex-col xl:flex-row gap-4 mb-6 items-center">
      <div class="relative w-full xl:w-[400px]">
        <LucideSearch class="absolute left-4 top-3.5 text-gray-400" :size="18" />
        <input v-model="filters.q" @keyup.enter="performSearch" type="text" class="input-field pl-12 py-3 shadow-sm" placeholder="Buscar matrícula o nombre...">
      </div>
      <div class="flex w-full xl:flex-1 gap-4">
        <select v-model="filters.nivel" @change="performSearch" class="input-field shadow-sm">
          <option value="">Nivel (Todos)</option>
          <option value="Preescolar">Preescolar</option>
          <option value="Primaria">Primaria</option>
          <option value="Secundaria">Secundaria</option>
        </select>
        <select v-model="filters.grado" @change="performSearch" class="input-field shadow-sm">
          <option value="">Grado (Todos)</option>
          <option value="Primero">Primero</option>
          <option value="Segundo">Segundo</option>
          <option value="Tercero">Tercero</option>
          <option value="Cuarto">Cuarto</option>
          <option value="Quinto">Quinto</option>
          <option value="Sexto">Sexto</option>
        </select>
        <select v-model="filters.grupo" @change="performSearch" class="input-field shadow-sm">
          <option value="">Grupo (Todos)</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
      </div>
      <button class="btn btn-primary px-6 py-3 shadow-sm shrink-0 w-full xl:w-auto" @click="openAlta">
        <LucideUserPlus :size="18"/> Nuevo alumno
      </button>
    </div>

    <!-- Padrón -->
    <div class="card table-wrapper max-h-[45vh] mb-10 overflow-y-auto shadow-sm border border-gray-100">
      <table class="w-full">
        <thead class="sticky top-0 z-10 shadow-sm bg-gray-50/95 backdrop-blur-md">
          <tr>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500">Matrícula</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500">Nombre</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Tipo</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500">Grado</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500 text-right">Cargos</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500 text-right">Pagos</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500 text-right">Saldo</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Estatus</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="8" class="text-center text-gray-500 font-medium py-16">Cargando datos operativos...</td></tr>
          <tr v-else-if="!students.length"><td colspan="8" class="text-center text-gray-500 py-16">No hay registros que coincidan con los filtros de búsqueda.</td></tr>
          <tr v-else v-for="s in students" :key="s.matricula" 
              @click="selectStudent(s)" 
              @contextmenu.prevent="showStudentMenu($event, s)"
              :class="{ 'bg-brand-leaf/5': selectedStudent?.matricula === s.matricula }" 
              class="cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-none">
            <td class="font-mono text-[0.95rem] font-bold text-accent-sky py-4 px-6">{{ s.matricula }}</td>
            <td class="font-bold text-gray-800 py-4 px-6">{{ s.nombreCompleto }}</td>
            <td class="text-center py-4 px-6"><span :class="['badge', String(s.interno) === '1' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800']">{{ String(s.interno) === '1' ? 'Interno' : 'Externo' }}</span></td>
            <td class="text-gray-500 font-medium py-4 px-6">{{ s.nivel }} - {{ s.grado }}{{ s.grupo }}</td>
            <td class="text-right font-bold text-gray-600 py-4 px-6 font-mono">${{ format(s.importeTotal) }}</td>
            <td class="text-right font-bold text-brand-campus py-4 px-6 font-mono">${{ format(s.pagosTotal) }}</td>
            <td :class="['text-right font-bold font-mono py-4 px-6', s.saldoNeto > 0 ? 'text-accent-coral' : 'text-gray-600']">${{ format(s.saldoNeto) }}</td>
            <td class="text-center py-4 px-6"><span :class="['badge', s.estatus === 'Activo' ? 'badge-success' : 'badge-danger']">{{ s.estatus }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modales y Vistas Inferiores -->
    <StudentDetails v-if="selectedStudent" :student="selectedStudent" @refresh="performSearch" @edit="openEdit" />
    <StudentFormModal v-if="showStudentModal" :student="editingStudent" @close="closeStudentModal" @success="handleStudentSuccess" />
    <DocumentModal v-if="showFastDocModal" :student="fastDocStudent" @close="showFastDocModal = false" @success="handleStudentSuccess" />
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCookie, useState } from '#app'
import { LucideSearch, LucideUserPlus, LucideEye, LucideSettings, LucideFilePlus } from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'
import StudentDetails from '~/components/StudentDetails.vue'
import StudentFormModal from '~/components/StudentFormModal.vue'
import DocumentModal from '~/components/DocumentModal.vue'

const { show } = useToast()
const { openMenu } = useContextMenu()
const route = useRoute()
const state = useState('globalState')
const userRole = ref(useCookie('auth_role').value || 'plantel')

// Filtros operativos
const filters = ref({ q: '', nivel: '', grado: '', grupo: '' })

const students = ref([])
const loading = ref(false)
const selectedStudent = ref(null)

const kpis = ref({ totalAlumnos: 0, internos: 0, externos: 0, ingresosMes: 0 })
const showStudentModal = ref(false)
const editingStudent = ref(null)

const showFastDocModal = ref(false)
const fastDocStudent = ref(null)

const format = (val) => Number(val || 0).toFixed(2)

const loadKpis = async () => {
  try {
    kpis.value = await $fetch('/api/dashboard/kpis', { params: { ciclo: state.value.ciclo } })
  } catch(e) {}
}

const performSearch = async () => {
  loading.value = true
  try {
    students.value = await $fetch('/api/students', { params: { ...filters.value, ciclo: state.value.ciclo } })
    if (selectedStudent.value) {
      selectedStudent.value = students.value.find(s => s.matricula === selectedStudent.value.matricula) || null
    } else if (route.query.q) {
      const match = students.value.find(s => s.matricula === route.query.q)
      if (match) selectStudent(match)
    }
  } catch (e) { show('Error al cargar alumnos', 'danger') } 
  finally { loading.value = false }
}

const selectStudent = (student) => { selectedStudent.value = student }

const openFastDoc = (student) => {
  fastDocStudent.value = student
  showFastDocModal.value = true
}

// Implementación del menú contextual en la tabla (Click derecho)
const showStudentMenu = (event, student) => {
  openMenu(event, [
    { label: 'Ver detalles de estado de cuenta', icon: LucideEye, action: () => selectStudent(student) },
    { label: 'Agregar documento / Cargo', icon: LucideFilePlus, action: () => openFastDoc(student) },
    { label: '-' },
    { label: 'Editar información del alumno', icon: LucideSettings, action: () => openEdit(student) }
  ])
}

onMounted(() => {
  if (route.query.q) filters.value.q = String(route.query.q)
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
  showFastDocModal.value = false
  performSearch()
  loadKpis()
}
</script>