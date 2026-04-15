<template>
  <div class="max-w-[1400px] mx-auto">
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="card p-4 border-l-4 border-gray-400">
        <h4 class="text-[0.65rem] font-bold text-gray-500 uppercase tracking-wide">Total de alumnos</h4>
        <div class="text-2xl font-bold text-gray-800 mt-1">{{ kpis.totalAlumnos }}</div>
      </div>
      <div class="card p-4 border-l-4 border-brand-teal">
        <h4 class="text-[0.65rem] font-bold text-gray-500 uppercase tracking-wide">Alumnos internos</h4>
        <div class="text-2xl font-bold text-brand-teal mt-1">{{ kpis.internos }}</div>
      </div>
      <div class="card p-4 border-l-4 border-accent-sky">
        <h4 class="text-[0.65rem] font-bold text-gray-500 uppercase tracking-wide">Alumnos externos</h4>
        <div class="text-2xl font-bold text-accent-sky mt-1">{{ kpis.externos }}</div>
      </div>
      <div class="card p-4 border-l-4 border-accent-gold" v-if="userRole === 'global'">
        <h4 class="text-[0.65rem] font-bold text-gray-500 uppercase tracking-wide">Ingresos del Mes</h4>
        <div class="text-2xl font-bold text-gray-800 mt-1">${{ Number(kpis.ingresosMes).toLocaleString('es-MX', {minimumFractionDigits:2}) }}</div>
      </div>
    </div>

    <div class="flex flex-col xl:flex-row gap-3 mb-5 items-center">
      <div class="relative w-full xl:w-[350px]">
        <LucideSearch class="absolute left-3 top-2.5 text-gray-400" :size="16" />
        <input v-model="filters.q" @keyup.enter="performSearch" type="text" class="input-field pl-9" placeholder="Buscar matrícula o nombre...">
      </div>
      <div class="flex w-full xl:flex-1 gap-3">
        <select v-model="filters.nivel" @change="performSearch" class="input-field">
          <option value="">Nivel (Todos)</option>
          <option value="Preescolar">Preescolar</option>
          <option value="Primaria">Primaria</option>
          <option value="Secundaria">Secundaria</option>
        </select>
        <select v-model="filters.grado" @change="performSearch" class="input-field">
          <option value="">Grado (Todos)</option>
          <option value="Primero">Primero</option>
          <option value="Segundo">Segundo</option>
          <option value="Tercero">Tercero</option>
          <option value="Cuarto">Cuarto</option>
          <option value="Quinto">Quinto</option>
          <option value="Sexto">Sexto</option>
        </select>
        <select v-model="filters.grupo" @change="performSearch" class="input-field">
          <option value="">Grupo (Todos)</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
      </div>
      <button class="btn btn-primary shrink-0 w-full xl:w-auto" @click="openAlta">
        <LucideUserPlus :size="16"/> Nuevo alumno
      </button>
    </div>

    <div class="card table-wrapper max-h-[50vh] mb-8 overflow-y-auto">
      <table class="w-full">
        <thead class="sticky top-0 z-10">
          <tr>
            <th>Matrícula</th>
            <th>Nombre</th>
            <th class="text-center">Tipo</th>
            <th>Grado</th>
            <th class="text-right">Cargos</th>
            <th class="text-right">Pagos</th>
            <th class="text-right">Saldo</th>
            <th class="text-center">Estatus</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="8" class="text-center text-gray-500 font-medium py-12">Cargando datos...</td></tr>
          <tr v-else-if="!students.length"><td colspan="8" class="text-center text-gray-500 py-12">No hay registros que coincidan con los filtros.</td></tr>
          <tr v-else v-for="s in students" :key="s.matricula" 
              @click="selectStudent(s)" 
              @contextmenu.prevent="showStudentMenu($event, s)"
              :class="{ 'selected': selectedStudent?.matricula === s.matricula }" 
              class="cursor-pointer">
            <td class="font-mono text-xs font-semibold text-accent-sky">{{ s.matricula }}</td>
            <td class="font-semibold text-gray-800">{{ s.nombreCompleto }}</td>
            <td class="text-center"><span :class="['badge', String(s.interno) === '1' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800']">{{ String(s.interno) === '1' ? 'Interno' : 'Externo' }}</span></td>
            <td class="text-gray-600">{{ s.nivel }} - {{ s.grado }}{{ s.grupo }}</td>
            <td class="text-right text-gray-600 font-mono">${{ format(s.importeTotal) }}</td>
            <td class="text-right font-semibold text-brand-campus font-mono">${{ format(s.pagosTotal) }}</td>
            <td :class="['text-right font-semibold font-mono', s.saldoNeto > 0 ? 'text-accent-coral' : 'text-gray-600']">${{ format(s.saldoNeto) }}</td>
            <td class="text-center"><span :class="['badge', s.estatus === 'Activo' ? 'badge-success' : 'badge-danger']">{{ s.estatus }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>

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

const showStudentMenu = (event, student) => {
  openMenu(event, [
    { label: 'Ver detalles de cuenta', icon: LucideEye, action: () => selectStudent(student) },
    { label: 'Agregar documento', icon: LucideFilePlus, action: () => openFastDoc(student) },
    { label: '-' },
    { label: 'Editar alumno', icon: LucideSettings, action: () => openEdit(student) }
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