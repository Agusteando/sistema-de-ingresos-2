<template>
  <div class="max-w-[1400px] mx-auto pb-12">
    <header class="flex flex-col xl:flex-row justify-between items-start xl:items-end mb-8 gap-5 border-b border-gray-200/60 pb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-800 tracking-tight m-0">
          {{ isPadronMode ? 'Padrón de Alumnos' : `Inscripciones ${state.ciclo}` }}
        </h1>
        <p class="text-[0.85rem] text-gray-500 mt-1.5 font-medium m-0 max-w-2xl">
          {{ isPadronMode ? 'Directorio general e histórico de la base de datos completa de registros activos en el sistema.' : 'Población real matriculada y confirmada con concepto de inscripción para el ciclo escolar activo.' }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-3 w-full xl:w-auto">
        <select v-model="state.ciclo" class="input-field !w-32 font-bold text-gray-700 bg-white shadow-sm border-gray-200 h-[38px] cursor-pointer focus:ring-brand-leaf/30">
          <option v-for="c in availableCiclos" :key="c" :value="c">{{ c }}</option>
        </select>
        <button class="btn font-semibold text-sm transition-all shadow-sm h-[38px] px-5 flex-1 xl:flex-none"
                :class="isPadronMode ? 'bg-brand-campus text-white border-brand-campus hover:bg-brand-teal' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900'"
                @click="isPadronMode = !isPadronMode">
          {{ isPadronMode ? 'Mostrando Padrón (Volver a Inscripciones)' : 'Ver todos los alumnos' }}
        </button>
        <button class="btn btn-primary shadow-sm h-[38px] px-5 flex-1 xl:flex-none" @click="openAlta">
          <LucideUserPlus :size="16"/> Alta de Alumno
        </button>
      </div>
    </header>

    <div v-if="!isPadronMode" class="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
      <div class="card p-5 border-l-4 border-gray-400 flex flex-col justify-center">
        <h4 class="text-[0.65rem] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Inscritos</h4>
        <div class="text-3xl font-bold text-gray-800 leading-none">{{ realKpis.total }}</div>
      </div>
      <div class="card p-5 border-l-4 border-brand-teal flex flex-col justify-center">
        <h4 class="text-[0.65rem] font-bold text-gray-400 uppercase tracking-widest mb-1">Internos</h4>
        <div class="text-3xl font-bold text-brand-teal leading-none">{{ realKpis.internos }}</div>
      </div>
      <div class="card p-5 border-l-4 border-accent-sky flex flex-col justify-center">
        <h4 class="text-[0.65rem] font-bold text-gray-400 uppercase tracking-widest mb-1">Externos</h4>
        <div class="text-3xl font-bold text-accent-sky leading-none">{{ realKpis.externos }}</div>
      </div>
      <div class="card p-5 border-l-4 border-accent-gold flex flex-col justify-center" v-if="userRole === 'global'">
        <h4 class="text-[0.65rem] font-bold text-gray-400 uppercase tracking-widest mb-1">Ingresos del Mes</h4>
        <div class="text-3xl font-bold text-gray-800 leading-none">${{ Number(globalKpis.ingresosMes).toLocaleString('es-MX', {minimumFractionDigits:2}) }}</div>
      </div>
    </div>

    <div v-if="!isPadronMode && gradeBreakdown.length" class="flex gap-4 mb-6 overflow-x-auto pb-3 hide-scrollbar snap-x">
      <div v-for="g in gradeBreakdown" :key="g.name" class="shrink-0 bg-white border border-gray-200 rounded-xl p-4 min-w-[160px] flex flex-col justify-between shadow-sm snap-start">
        <div class="text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider mb-3">{{ g.name }}</div>
        <div class="text-2xl font-bold text-gray-800 leading-none mb-4">{{ g.total }}</div>
        <div class="flex flex-wrap gap-1.5 pt-3 border-t border-gray-100">
           <span v-for="(count, grp) in g.groups" :key="grp" class="text-[0.65rem] font-bold text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-md">
             {{ grp }}: <span class="text-brand-campus">{{ count }}</span>
           </span>
        </div>
      </div>
    </div>

    <div class="flex flex-col md:flex-row gap-3 mb-6">
      <div class="card p-2 flex-1 flex flex-col md:flex-row gap-2 items-center shadow-sm">
        <div class="relative w-full md:w-auto flex-1">
          <LucideSearch class="absolute left-3 top-2.5 text-gray-400" :size="16" />
          <input v-model="filters.q" class="input-field pl-9 border-none shadow-none focus:ring-0 bg-transparent w-full text-sm font-medium placeholder-gray-400" placeholder="Buscar por nombre o matrícula..." />
        </div>
        <div class="w-full md:w-auto h-px md:h-6 md:w-px bg-gray-200 mx-1"></div>
        <select v-model="filters.nivel" class="input-field w-full md:w-48 border-none shadow-none bg-transparent text-gray-600 font-semibold cursor-pointer hover:bg-gray-50 transition-colors">
          <option value="">Cualquier nivel</option>
          <option value="Preescolar">Preescolar</option>
          <option value="Primaria">Primaria</option>
          <option value="Secundaria">Secundaria</option>
        </select>
      </div>
      <button class="btn btn-secondary h-auto md:h-auto py-2.5 px-5 shadow-sm shrink-0" @click="exportData">
        <LucideDownload :size="16"/> Exportar
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
import StudentDetails from '~/components/StudentDetails.vue'
import StudentFormModal from '~/components/StudentFormModal.vue'
import DocumentModal from '~/components/DocumentModal.vue'

const { show } = useToast()
const { openMenu } = useContextMenu()
const route = useRoute()
const state = useState('globalState')
const userRole = ref(useCookie('auth_role').value || 'plantel')

const filters = ref({ q: '', nivel: '', grado: '', grupo: '' })
const isPadronMode = ref(false)
const availableCiclos = ref(['2023', '2024', '2025'])
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
      if (o.cicloActual && !state.value.configLoaded) {
        const mappedCycle = String(o.cicloActual).split('-')[0]
        if (!availableCiclos.value.includes(mappedCycle)) availableCiclos.value.push(mappedCycle)
        state.value.ciclo = mappedCycle
        state.value.configLoaded = true
      }
      if (o.ciclos && Array.isArray(o.ciclos)) {
        o.ciclos.forEach(c => {
          const mapped = String(c).split('-')[0]
          if (!availableCiclos.value.includes(mapped)) availableCiclos.value.push(mapped)
        })
      }
      Object.values(o).forEach(traverse)
    }
  }
  traverse(obj)
  if (concepts.length > 0) {
    externalConcepts.value = [...new Set(concepts.map(c => c.toLowerCase().trim()))]
  }
  availableCiclos.value = [...new Set(availableCiclos.value)].sort().reverse()
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
    const res = await $fetch('/api/students', { params: { ...filters.value, ciclo: state.value.ciclo } })
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

const localFilteredStudents = computed(() => {
  let list = students.value
  if (filters.value.q) {
    const qTerm = filters.value.q.toLowerCase()
    list = list.filter(s => s.nombreCompleto.toLowerCase().includes(qTerm) || s.matricula.toLowerCase().includes(qTerm))
  }
  if (filters.value.nivel) {
    list = list.filter(s => s.nivel === filters.value.nivel)
  }
  return list
})

const activePopulation = computed(() => localFilteredStudents.value.filter(s => isEnrolled(s)))

const displayedStudents = computed(() => isPadronMode.value ? localFilteredStudents.value : activePopulation.value)

const realKpis = computed(() => {
  const list = activePopulation.value
  return {
    total: list.length,
    internos: list.filter(s => String(s.interno) === '1').length,
    externos: list.filter(s => String(s.interno) === '0').length
  }
})

const gradeBreakdown = computed(() => {
  const groups = {}
  activePopulation.value.forEach(s => {
    const grade = s.grado || 'Sin Asignar'
    if (!groups[grade]) groups[grade] = { total: 0, groups: {} }
    groups[grade].total++
    const grp = s.grupo || '-'
    if (!groups[grade].groups[grp]) groups[grade].groups[grp] = 0
    groups[grade].groups[grp]++
  })
  const sortedGrades = ['Preescolar', 'Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto', 'Sexto']
  return Object.entries(groups).map(([name, data]) => ({ name, ...data })).sort((a, b) => {
     const idxA = sortedGrades.indexOf(a.name)
     const idxB = sortedGrades.indexOf(b.name)
     if (idxA !== -1 && idxB !== -1) return idxA - idxB
     return a.name.localeCompare(b.name)
  })
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