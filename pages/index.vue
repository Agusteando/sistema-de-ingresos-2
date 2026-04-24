<template>
  <div class="max-w-[1400px] mx-auto pb-12">
    <header class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-5">
      <div>
        <h1 class="text-2xl font-bold text-gray-800 tracking-tight m-0">Gestión de Alumnos</h1>
        <p class="text-[0.85rem] text-gray-500 mt-1.5 font-medium m-0 max-w-2xl">
          Administración general de matrícula y estado de cuenta financiero.
        </p>
      </div>
      <div class="flex items-center gap-4">
        <div v-if="userRole === 'global'" class="bg-accent-gold/10 px-4 py-2 rounded-lg border border-accent-gold/20 flex flex-col items-end">
          <span class="text-[0.65rem] font-bold text-yellow-800 uppercase tracking-widest">Ingresos del Mes</span>
          <span class="text-lg font-bold text-yellow-900 leading-none">${{ Number(globalKpis.ingresosMes).toLocaleString('es-MX', {minimumFractionDigits:2}) }}</span>
        </div>
        <button class="btn btn-primary shadow-sm h-[38px] px-5" @click="openAlta">
          <LucideUserPlus :size="16"/> Nuevo Alumno
        </button>
      </div>
    </header>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <button @click="activeFilter = 'inscritos'" :class="['card p-5 text-left transition-all relative overflow-hidden focus:outline-none', activeFilter === 'inscritos' ? 'ring-2 ring-brand-campus shadow-md border-transparent' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm']">
        <div :class="['absolute right-0 top-0 w-24 h-24 rounded-bl-full -mr-8 -mt-8 transition-colors', activeFilter === 'inscritos' ? 'bg-brand-campus/10' : 'bg-gray-50']"></div>
        <h4 class="text-[0.65rem] font-bold uppercase tracking-widest mb-1 relative z-10" :class="activeFilter === 'inscritos' ? 'text-brand-campus' : 'text-gray-500'">Inscritos</h4>
        <div class="text-3xl font-bold text-gray-800 leading-none relative z-10">{{ kpiCounts.inscritos }}</div>
      </button>
      
      <button @click="activeFilter = 'internos'" :class="['card p-5 text-left transition-all relative overflow-hidden focus:outline-none', activeFilter === 'internos' ? 'ring-2 ring-brand-teal shadow-md border-transparent' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm']">
        <div :class="['absolute right-0 top-0 w-24 h-24 rounded-bl-full -mr-8 -mt-8 transition-colors', activeFilter === 'internos' ? 'bg-brand-teal/10' : 'bg-gray-50']"></div>
        <h4 class="text-[0.65rem] font-bold uppercase tracking-widest mb-1 relative z-10" :class="activeFilter === 'internos' ? 'text-brand-teal' : 'text-gray-500'">Internos</h4>
        <div class="text-3xl font-bold text-gray-800 leading-none relative z-10">{{ kpiCounts.internos }}</div>
      </button>

      <button @click="activeFilter = 'externos'" :class="['card p-5 text-left transition-all relative overflow-hidden focus:outline-none', activeFilter === 'externos' ? 'ring-2 ring-accent-sky shadow-md border-transparent' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm']">
        <div :class="['absolute right-0 top-0 w-24 h-24 rounded-bl-full -mr-8 -mt-8 transition-colors', activeFilter === 'externos' ? 'bg-accent-sky/10' : 'bg-gray-50']"></div>
        <h4 class="text-[0.65rem] font-bold uppercase tracking-widest mb-1 relative z-10" :class="activeFilter === 'externos' ? 'text-accent-sky' : 'text-gray-500'">Externos</h4>
        <div class="text-3xl font-bold text-gray-800 leading-none relative z-10">{{ kpiCounts.externos }}</div>
      </button>

      <button @click="activeFilter = 'no_inscritos'" :class="['card p-5 text-left transition-all relative overflow-hidden focus:outline-none', activeFilter === 'no_inscritos' ? 'ring-2 ring-accent-coral shadow-md border-transparent' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm']">
        <div :class="['absolute right-0 top-0 w-24 h-24 rounded-bl-full -mr-8 -mt-8 transition-colors', activeFilter === 'no_inscritos' ? 'bg-accent-coral/10' : 'bg-gray-50']"></div>
        <h4 class="text-[0.65rem] font-bold uppercase tracking-widest mb-1 relative z-10" :class="activeFilter === 'no_inscritos' ? 'text-accent-coral' : 'text-gray-500'">Bajas / No inscritos</h4>
        <div class="text-3xl font-bold text-gray-800 leading-none relative z-10">{{ kpiCounts.no_inscritos }}</div>
      </button>
    </div>

    <div class="flex flex-col md:flex-row gap-3 items-center mb-6">
      <div class="card p-2 flex-1 flex flex-row gap-2 items-center shadow-sm w-full">
        <div class="relative w-full">
          <LucideSearch class="absolute left-3 top-2.5 text-gray-400" :size="16" />
          <input v-model="filters.q" class="input-field pl-9 border-none shadow-none focus:ring-0 bg-transparent w-full text-sm font-medium placeholder-gray-400" placeholder="Buscar por nombre o matrícula..." />
        </div>
      </div>
      
      <div class="flex items-center gap-2 overflow-x-auto hide-scrollbar flex-1 w-full md:w-auto">
        <button @click="activeGrado = ''; activeGrupo = ''" :class="['px-3 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap border', activeGrado === '' ? 'bg-gray-800 text-white border-gray-800 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 shadow-sm']">Todos los grados</button>
        <button v-for="g in availableGrados" :key="g" @click="activeGrado = g; activeGrupo = ''" :class="['px-3 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap border', activeGrado === g ? 'bg-brand-campus text-white border-brand-campus shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 shadow-sm']">
          {{ g }}
        </button>
      </div>

      <div v-if="activeGrado && availableGrupos.length" class="flex items-center gap-2 overflow-x-auto hide-scrollbar px-2 border-l border-gray-200">
        <button @click="activeGrupo = ''" :class="['px-3 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap border', activeGrupo === '' ? 'bg-gray-800 text-white border-gray-800 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 shadow-sm']">Todos</button>
        <button v-for="grp in availableGrupos" :key="grp" @click="activeGrupo = grp" :class="['px-3 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap border', activeGrupo === grp ? 'bg-brand-teal text-white border-brand-teal shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 shadow-sm']">
          {{ grp }}
        </button>
      </div>
      
      <button class="btn btn-secondary h-auto py-2.5 px-4 shadow-sm shrink-0" @click="exportData">
        <LucideDownload :size="14"/> Exportar
      </button>
    </div>

    <div class="card table-wrapper shadow-sm border-gray-200">
      <table class="w-full">
        <thead class="bg-gray-50/80">
          <tr>
            <th class="py-3 px-5 text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider text-left">Alumno</th>
            <th class="py-3 px-5 text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider text-left">Asignación</th>
            <th class="py-3 px-5 text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider text-left">Tipo</th>
            <th class="py-3 px-5 text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider text-right">Cargos</th>
            <th class="py-3 px-5 text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider text-right">Abonos</th>
            <th class="py-3 px-5 text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider text-right">Saldo</th>
            <th class="w-24 text-right pr-5"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="7" class="text-center text-gray-500 font-medium py-16">Cargando registros...</td></tr>
          <tr v-else-if="!displayedStudents.length"><td colspan="7" class="text-center text-gray-400 py-16">No hay registros bajo los filtros actuales.</td></tr>
          <tr v-else v-for="s in displayedStudents" :key="s.matricula" 
              @click="selectStudent(s)" 
              @contextmenu.prevent="showStudentMenu($event, s)"
              :class="{ 'bg-brand-leaf/5 border-l-2 border-l-brand-leaf': selectedStudent?.matricula === s.matricula }" 
              class="group relative cursor-pointer hover:bg-gray-50/80 transition-all border-b border-gray-100/80 border-l-2 border-l-transparent">
            <td class="py-3.5 px-5 align-middle">
              <div class="font-bold text-gray-800 text-sm tracking-tight">{{ s.nombreCompleto }}</div>
              <div class="text-[0.7rem] text-gray-400 font-mono mt-0.5 tracking-wider">{{ s.matricula }}</div>
            </td>
            <td class="py-3.5 px-5 text-sm text-gray-600 font-medium align-middle">
              {{ s.nivel }} <span class="text-gray-300 mx-1.5">•</span> {{ s.grado }} <span class="text-gray-400 font-bold ml-1">"{{ s.grupo }}"</span>
            </td>
            <td class="py-3.5 px-5 align-middle">
              <span class="text-[0.65rem] font-bold text-gray-500 uppercase tracking-widest">{{ String(s.interno) === '1' ? 'Interno' : 'Externo' }}</span>
            </td>
            <td class="py-3.5 px-5 text-right align-middle">
              <div class="font-mono text-sm text-gray-400 font-medium">${{ format(s.importeTotal) }}</div>
            </td>
            <td class="py-3.5 px-5 text-right align-middle">
              <div class="font-mono text-sm font-semibold text-brand-campus">${{ format(s.pagosTotal) }}</div>
            </td>
            <td class="py-3.5 px-5 text-right align-middle">
              <div class="font-mono text-sm font-bold" :class="s.saldoNeto > 0 ? 'text-accent-coral' : 'text-gray-400'">${{ format(s.saldoNeto) }}</div>
            </td>
            <td class="w-24 text-right pr-5 align-middle">
              <div class="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button @click.stop="openEdit(s)" class="p-1.5 text-gray-400 hover:text-brand-teal hover:bg-brand-leaf/10 rounded transition-colors" title="Editar">
                  <LucideEdit2 :size="16" />
                </button>
                <button @click.stop="bajaAlumno(s)" class="p-1.5 text-gray-400 hover:text-accent-coral hover:bg-red-50 rounded transition-colors" title="Dar de baja">
                  <LucideUserMinus :size="16" />
                </button>
              </div>
            </td>
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
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCookie, useState } from '#app'
import { LucideSearch, LucideUserPlus, LucideDownload, LucideEdit2, LucideUserMinus, LucideEye, LucideSettings, LucideFilePlus } from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'
import { exportToCSV } from '~/utils/export'
import { CICLOS_LIST, GRADOS_ORDEN } from '~/utils/constants'
import StudentDetails from '~/components/StudentDetails.vue'
import StudentFormModal from '~/components/StudentFormModal.vue'
import DocumentModal from '~/components/DocumentModal.vue'

const { show } = useToast()
const { openMenu } = useContextMenu()
const route = useRoute()
const state = useState('globalState')
const userRole = ref(useCookie('auth_role').value || 'plantel')

const filters = ref({ q: '' })
const activeFilter = ref('inscritos')
const activeGrado = ref('')
const activeGrupo = ref('')

const externalConcepts = ref(['inscripcion', 'inscripción', 'reinscripción', 'reinscripcion'])

const students = ref([])
const loading = ref(false)
const selectedStudent = ref(null)

const globalKpis = ref({ ingresosMes: 0 })
const showStudentModal = ref(false)
const editingStudent = ref(null)

const showFastDocModal = ref(false)
const fastDocStudent = ref(null)

const format = (val) => Number(val || 0).toFixed(2)

const parseEnrollmentConfig = (obj) => {
  let concepts = []
  const traverse = (o) => {
    if (!o) return
    if (Array.isArray(o)) o.forEach(traverse)
    else if (typeof o === 'object') {
      if (o.concepto_nombre) concepts.push(o.concepto_nombre)
      Object.values(o).forEach(traverse)
    }
  }
  traverse(obj)
  if (concepts.length > 0) {
    externalConcepts.value = [...new Set(concepts.map(c => c.toLowerCase().trim()))]
  }
}

const loadGlobalKpis = async () => {
  try {
    const res = await $fetch('/api/dashboard/kpis', { params: { ciclo: state.value.ciclo } })
    globalKpis.value.ingresosMes = res.ingresosMes || 0
  } catch(e) {}
}

const performSearch = async () => {
  loading.value = true
  try {
    const res = await $fetch('/api/students', { params: { ciclo: state.value.ciclo } })
    students.value = res || []
    
    if (selectedStudent.value) {
      selectedStudent.value = students.value.find(s => s.matricula === selectedStudent.value.matricula) || null
    } else if (route.query.q) {
      const match = students.value.find(s => s.matricula === route.query.q)
      if (match) selectStudent(match)
    }
  } catch (e) { 
    show('Error al cargar la base de datos', 'danger') 
  } finally { 
    loading.value = false 
  }
}

const isEnrolled = (student) => {
  const conceptsStr = ((student.conceptosCargados || '') + '|' + (student.conceptosPagados || '')).toLowerCase()
  return externalConcepts.value.some(c => conceptsStr.includes(c))
}

const kpiCounts = computed(() => {
  let inscritos = 0, internos = 0, externos = 0, no_inscritos = 0
  students.value.forEach(s => {
    if (isEnrolled(s)) {
      inscritos++
      if (String(s.interno) === '1') internos++
      else externos++
    } else {
      no_inscritos++
    }
  })
  return { inscritos, internos, externos, no_inscritos }
})

const displayedStudents = computed(() => {
  let list = students.value
  
  if (filters.value.q) {
    const qTerm = filters.value.q.toLowerCase()
    list = list.filter(s => s.nombreCompleto.toLowerCase().includes(qTerm) || s.matricula.toLowerCase().includes(qTerm))
  }

  if (activeGrado.value) list = list.filter(s => s.grado === activeGrado.value)
  if (activeGrupo.value) list = list.filter(s => s.grupo === activeGrupo.value)

  if (activeFilter.value === 'inscritos') list = list.filter(s => isEnrolled(s))
  else if (activeFilter.value === 'internos') list = list.filter(s => isEnrolled(s) && String(s.interno) === '1')
  else if (activeFilter.value === 'externos') list = list.filter(s => isEnrolled(s) && String(s.interno) === '0')
  else if (activeFilter.value === 'no_inscritos') list = list.filter(s => !isEnrolled(s))

  return list
})

const availableGrados = computed(() => {
  const set = new Set()
  const subset = students.value.filter(s => {
    if (activeFilter.value === 'inscritos') return isEnrolled(s)
    if (activeFilter.value === 'internos') return isEnrolled(s) && String(s.interno) === '1'
    if (activeFilter.value === 'externos') return isEnrolled(s) && String(s.interno) === '0'
    if (activeFilter.value === 'no_inscritos') return !isEnrolled(s)
    return true
  })
  subset.forEach(s => { if (s.grado && s.grado !== 'null') set.add(s.grado) })
  return Array.from(set).sort((a, b) => (GRADOS_ORDEN[a] || 99) - (GRADOS_ORDEN[b] || 99))
})

const availableGrupos = computed(() => {
  if (!activeGrado.value) return []
  const set = new Set()
  students.value.forEach(s => {
    if (s.grado === activeGrado.value && s.grupo && s.grupo !== 'null') set.add(s.grupo)
  })
  return Array.from(set).sort()
})

const exportData = () => {
  const exportList = displayedStudents.value.map(s => ({
    Matrícula: s.matricula,
    Nombre: s.nombreCompleto,
    Tipo: String(s.interno) === '1' ? 'Interno' : 'Externo',
    Nivel: s.nivel,
    Grado: s.grado,
    Grupo: s.grupo,
    Cargos_MXN: Number(s.importeTotal).toFixed(2),
    Pagos_MXN: Number(s.pagosTotal).toFixed(2),
    Saldo_MXN: Number(s.saldoNeto).toFixed(2),
    Estatus: s.estatus
  }))
  exportToCSV(`Alumnos_${state.value.ciclo}.csv`, exportList)
}

const selectStudent = (student) => { selectedStudent.value = student }

const openFastDoc = (student) => {
  fastDocStudent.value = student
  showFastDocModal.value = true
}

const bajaAlumno = async (student) => {
  if (!confirm(`¿Está seguro de procesar la baja del alumno(a) ${student.nombreCompleto}?`)) return
  const motivo = prompt("Detalle claramente la causa de baja:")
  if (!motivo) return

  try {
    await $fetch(`/api/students/${student.matricula}`, { method: 'DELETE', body: { motivo } })
    show('Alumno dado de baja exitosamente en el sistema.')
    performSearch()
    loadGlobalKpis()
    if (selectedStudent.value?.matricula === student.matricula) {
      selectedStudent.value = null
    }
  } catch (e) {
    show('Ocurrió un error al procesar la baja.', 'danger')
  }
}

const showStudentMenu = (event, student) => {
  openMenu(event, [
    { label: 'Ver detalles de cuenta', icon: LucideEye, action: () => selectStudent(student) },
    { label: 'Agregar documento', icon: LucideFilePlus, action: () => openFastDoc(student) },
    { label: '-' },
    { label: 'Editar alumno', icon: LucideSettings, action: () => openEdit(student) },
    { label: '-' },
    { label: 'Baja de Alumno', icon: LucideUserMinus, class: 'text-accent-coral', action: () => bajaAlumno(student) }
  ])
}

onMounted(async () => {
  try {
    const configData = await $fetch('https://matricula.casitaapps.com/api/enrollment-config/all')
    parseEnrollmentConfig(configData)
  } catch (e) {
    console.warn('Fallback al carecer de configuración externa.')
  }
  
  if (route.query.q) filters.value.q = String(route.query.q)
  performSearch()
  loadGlobalKpis()
})

watch(() => state.value.ciclo, () => {
  performSearch()
  loadGlobalKpis()
})

const openAlta = () => { editingStudent.value = null; showStudentModal.value = true }
const openEdit = (studentData) => { editingStudent.value = studentData; showStudentModal.value = true }
const closeStudentModal = () => { showStudentModal.value = false; editingStudent.value = null }

const handleStudentSuccess = () => {
  closeStudentModal()
  showFastDocModal.value = false
  performSearch()
  loadGlobalKpis()
}
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>