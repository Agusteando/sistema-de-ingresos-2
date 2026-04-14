<template>
  <div class="max-w-[1400px] mx-auto">
    <div v-if="userRole === 'global'" class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div class="card p-6 border-l-4 border-brand-leaf bg-white shadow-sm hover:shadow-md transition-shadow">
        <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Total de alumnos</h4>
        <div class="text-3xl font-black text-gray-800 mt-2">{{ kpis.totalAlumnos }}</div>
      </div>
      <div class="card p-6 border-l-4 border-accent-gold bg-white shadow-sm hover:shadow-md transition-shadow">
        <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Ingresos del Mes</h4>
        <div class="text-3xl font-black text-gray-800 mt-2">${{ Number(kpis.ingresosMes).toLocaleString('es-MX', {minimumFractionDigits:2}) }}</div>
      </div>
      <div class="card p-6 border-l-4 border-accent-sky bg-white shadow-sm hover:shadow-md transition-shadow">
        <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Conceptos activos</h4>
        <div class="text-3xl font-black text-gray-800 mt-2">{{ kpis.conceptosActivos }}</div>
      </div>
    </div>

    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
      <div class="relative w-full md:w-[480px]">
        <LucideSearch class="absolute left-4 top-3.5 text-gray-400" :size="18" />
        <input v-model="searchQuery" @keyup.enter="performSearch" type="text" class="input-field pl-12 py-3 shadow-sm" placeholder="Buscar por matrícula o nombre...">
      </div>
      <button class="btn btn-primary px-6 py-3 shadow-sm" @click="openAlta">
        <LucideUserPlus :size="18"/> Nuevo alumno
      </button>
    </div>

    <div class="card table-wrapper max-h-[45vh] mb-10 overflow-y-auto shadow-sm border border-gray-100">
      <table class="w-full">
        <thead class="sticky top-0 z-10 shadow-sm bg-gray-50/95 backdrop-blur-md">
          <tr>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500">Matrícula</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500">Nombre</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500">Tipo</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500">Grado</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500 text-right">Cargos</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500 text-right">Pagos</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500 text-right">Saldo</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Estatus</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="8" class="text-center text-gray-500 font-medium py-16">Cargando...</td></tr>
          <tr v-else-if="!students.length"><td colspan="8" class="text-center text-gray-500 py-16">No hay registros que coincidan con la búsqueda.</td></tr>
          <tr v-else v-for="s in students" :key="s.matricula" 
              @click="selectStudent(s)" 
              @contextmenu.prevent="showStudentMenu($event, s)"
              :class="{ 'bg-brand-leaf/5': selectedStudent?.matricula === s.matricula }" 
              class="cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-none">
            <td class="font-mono text-[0.95rem] font-bold text-accent-sky py-4 px-6">{{ s.matricula }}</td>
            <td class="font-bold text-gray-800 py-4 px-6">{{ s.nombreCompleto }}</td>
            <td class="py-4 px-6"><span :class="['badge', s.interno ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800']">{{ s.interno ? 'Interno' : 'Externo' }}</span></td>
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
import { useRoute } from 'vue-router'
import { useCookie, useState } from '#app'
import { LucideSearch, LucideUserPlus, LucideEye, LucideSettings, LucideFileText } from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'
import StudentDetails from '~/components/StudentDetails.vue'
import StudentFormModal from '~/components/StudentFormModal.vue'

const { show } = useToast()
const { openMenu } = useContextMenu()
const route = useRoute()
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

const showStudentMenu = (event, student) => {
  openMenu(event, [
    { label: 'Ver detalles', icon: LucideEye, action: () => selectStudent(student) },
    { label: 'Editar alumno', icon: LucideSettings, action: () => openEdit(student) }
  ])
}

onMounted(() => {
  if (route.query.q) searchQuery.value = String(route.query.q)
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
  show('Alumno guardado correctamente.')
  performSearch()
  loadKpis()
}
</script>