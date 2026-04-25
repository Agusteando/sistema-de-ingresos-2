<template>
  <div class="h-full flex flex-col mx-auto max-w-[1500px]">
    <header class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-5 shrink-0">
      <div>
        <h1 class="text-2xl font-bold text-gray-800 tracking-tight m-0">Gestión de Alumnos</h1>
        <p class="text-[0.85rem] text-gray-500 mt-1.5 font-medium m-0 max-w-2xl">
          Administración general de matrícula y estado de cuenta financiero.
        </p>
      </div>
      <div class="flex items-center gap-4">
        <div v-if="userRole === 'global'" class="bg-accent-gold/10 px-4 py-2 rounded-lg border border-accent-gold/20 flex flex-col items-end hidden md:flex">
          <span class="text-[0.65rem] font-bold text-yellow-800 uppercase tracking-widest">Ingresos del Mes</span>
          <span class="text-lg font-bold text-yellow-900 leading-none">${{ Number(globalKpis.ingresosMes).toLocaleString('es-MX', {minimumFractionDigits:2}) }}</span>
        </div>
        <button class="btn btn-primary shadow-sm h-[38px] px-5" @click="openAlta">
          <LucideUserPlus :size="16"/> Nuevo Alumno
        </button>
      </div>
    </header>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4 shrink-0">
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

    <div class="flex flex-col md:flex-row items-center justify-between mb-5 bg-white p-2.5 rounded-xl border border-gray-200 shadow-sm shrink-0 gap-3">
      <div class="flex items-center gap-3 w-full md:w-[300px]">
        <div class="relative w-full">
          <LucideSearch class="absolute left-3 top-2.5 text-gray-400" :size="16" />
          <input v-model="filters.q" @keyup.enter="performSearch" class="input-field pl-9 bg-gray-50/50 border-gray-200 shadow-none focus:bg-white text-sm h-[36px]" placeholder="Matrícula o nombre..." />
        </div>
      </div>
      
      <div class="flex-1 overflow-hidden flex items-center w-full">
        <div class="flex items-center gap-1.5 overflow-x-auto hide-scrollbar w-full mask-edges pr-8">
           <button @click="activeGrado = ''; activeGrupo = ''" class="chip" :class="{'active': activeGrado === ''}">Todos</button>
           <button v-for="g in availableGrados" :key="g" @click="activeGrado = g; activeGrupo = ''" class="chip" :class="{'active': activeGrado === g}">{{ g }}</button>
           
           <template v-if="activeGrado && availableGrupos.length">
             <div class="w-px h-5 bg-gray-300 mx-1"></div>
             <button @click="activeGrupo = ''" class="chip" :class="{'active-group': activeGrupo === ''}">Todos</button>
             <button v-for="grp in availableGrupos" :key="grp" @click="activeGrupo = grp" class="chip" :class="{'active-group': activeGrupo === grp}">Grupo {{ grp }}</button>
           </template>
        </div>
      </div>

      <button class="btn btn-secondary h-[36px] px-4 shadow-sm shrink-0 w-full md:w-auto" @click="exportData">
        <LucideDownload :size="14"/> Exportar
      </button>
    </div>

    <div class="flex gap-6 flex-1 min-h-0 relative">
      
      <div :class="selectedStudent ? 'hidden lg:flex w-[320px] xl:w-[380px] border-r border-gray-200 pr-6 shrink-0' : 'w-full flex'" class="flex-col h-full transition-all duration-300 overflow-hidden">
        <div class="flex-1 overflow-y-auto card table-wrapper shadow-sm border-gray-200 rounded-xl relative h-full">
          <table class="w-full relative">
            <thead class="bg-gray-50/90 backdrop-blur sticky top-0 z-10">
              <tr>
                <th class="py-3 px-5 text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider text-left">Alumno</th>
                <th class="py-3 px-5 text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider text-left" v-if="!selectedStudent">Asignación</th>
                <th class="py-3 px-5 text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider text-right" v-if="!selectedStudent">Cargos</th>
                <th class="py-3 px-5 text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider text-right" v-if="!selectedStudent">Abonos</th>
                <th class="py-3 px-5 text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider text-right">Saldo</th>
                <th class="w-14 text-right pr-5"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading"><td :colspan="selectedStudent ? 3 : 6" class="text-center text-gray-500 font-medium py-16">Cargando registros...</td></tr>
              <tr v-else-if="!displayedStudents.length"><td :colspan="selectedStudent ? 3 : 6" class="text-center text-gray-400 py-16">No hay registros bajo los filtros actuales.</td></tr>
              <tr v-else v-for="s in displayedStudents" :key="s.matricula" 
                  @click="selectStudent(s)" 
                  @contextmenu.prevent="showStudentMenu($event, s)"
                  :class="[
                    'group relative cursor-pointer transition-all border-b border-gray-100/80 border-l-2',
                    selectedStudent?.matricula === s.matricula ? 'bg-brand-leaf/5 border-l-brand-leaf' : 'border-l-transparent hover:bg-gray-50/80',
                    s.estatus !== 'Activo' ? 'opacity-60 bg-red-50/20 hover:bg-red-50/40 text-red-900' : ''
                  ]">
                <td class="py-3 px-5 align-middle">
                  <div class="font-bold text-sm tracking-tight truncate max-w-[220px]" :class="s.estatus !== 'Activo' ? 'text-red-900 line-through decoration-red-400/50' : 'text-gray-800'" :title="s.nombreCompleto">
                    <span v-if="s.estatus !== 'Activo'" class="inline-block px-1.5 py-0.5 rounded bg-accent-coral text-white text-[9px] uppercase font-bold mr-1 align-middle no-underline">BAJA</span>
                    {{ s.nombreCompleto }}
                  </div>
                  <div class="text-[0.7rem] font-mono mt-0.5 tracking-wider" :class="s.estatus !== 'Activo' ? 'text-red-700/70' : 'text-gray-400'">
                    {{ s.matricula }} 
                    <span v-if="selectedStudent" class="ml-1 font-sans font-medium" :class="s.estatus !== 'Activo' ? 'text-red-700/50' : 'text-gray-300'">• {{ s.grado }} "{{ s.grupo }}"</span>
                  </div>
                </td>
                <td class="py-3 px-5 text-sm font-medium align-middle whitespace-nowrap" :class="s.estatus !== 'Activo' ? 'text-red-800' : 'text-gray-600'" v-if="!selectedStudent">
                  {{ s.nivel }} <span class="mx-1.5" :class="s.estatus !== 'Activo' ? 'text-red-300' : 'text-gray-300'">•</span> {{ s.grado }} <span class="font-bold ml-1" :class="s.estatus !== 'Activo' ? 'text-red-900' : 'text-gray-400'">"{{ s.grupo }}"</span>
                </td>
                <td class="py-3 px-5 text-right align-middle" v-if="!selectedStudent">
                  <div class="font-mono text-sm font-medium" :class="s.estatus !== 'Activo' ? 'text-red-800/70' : 'text-gray-400'">${{ format(s.importeTotal) }}</div>
                </td>
                <td class="py-3 px-5 text-right align-middle" v-if="!selectedStudent">
                  <div class="font-mono text-sm font-semibold" :class="s.estatus !== 'Activo' ? 'text-red-900' : 'text-brand-campus'">${{ format(s.pagosTotal) }}</div>
                </td>
                <td class="py-3 px-5 text-right align-middle">
                  <div class="font-mono text-sm font-bold" :class="s.saldoNeto > 0 ? 'text-accent-coral' : (s.estatus !== 'Activo' ? 'text-red-800/70' : 'text-gray-400')">${{ format(s.saldoNeto) }}</div>
                </td>
                <td class="w-14 text-right pr-5 align-middle">
                  <div class="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <button @click.stop="openEdit(s)" class="p-1.5 rounded transition-colors" :class="s.estatus !== 'Activo' ? 'text-red-700 hover:bg-red-100' : 'text-gray-400 hover:text-brand-teal hover:bg-brand-leaf/10'" title="Editar">
                      <LucideEdit2 :size="16" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="selectedStudent" class="w-full lg:flex-1 h-full overflow-hidden animate-[slideInRight_0.2s_ease-out] border border-gray-200 bg-white rounded-xl shadow-sm flex flex-col">
        <StudentDetails 
          :student="selectedStudent" 
          @refresh="performSearch" 
          @edit="openEdit" 
          @close="selectedStudent = null"
          @switch-student="selectStudentByMatricula"
          @baja="bajaAlumno" />
      </div>
    </div>

    <StudentFormModal v-if="showStudentModal" :student="editingStudent" @close="closeStudentModal" @success="handleStudentSuccess" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCookie, useState } from '#app'
import { LucideSearch, LucideUserPlus, LucideDownload, LucideEdit2, LucideUserMinus, LucideEye, LucideSettings, LucideFilePlus } from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'
import { useOptimisticSync } from '~/composables/useOptimisticSync'
import { exportToCSV } from '~/utils/export'
import { GRADOS_ORDEN } from '~/utils/constants'
import StudentDetails from '~/components/StudentDetails.vue'
import StudentFormModal from '~/components/StudentFormModal.vue'

const { show } = useToast()
const { openMenu } = useContextMenu()
const { executeOptimistic } = useOptimisticSync()
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
    const res = await $fetch('/api/students', { params: { ciclo: state.value.ciclo, q: filters.value.q } })
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
  if (student.estatus !== 'Activo') return false;
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
const selectStudentByMatricula = (matricula) => { 
  const match = students.value.find(s => s.matricula === matricula)
  if (match) selectStudent(match)
}

const bajaAlumno = async (student) => {
  if (!confirm(`¿Está seguro de procesar la baja definitiva del alumno(a) ${student.nombreCompleto}?`)) return
  const motivo = prompt("Detalle claramente la causa de baja:")
  if (!motivo) return

  const previousEstatus = student.estatus

  await executeOptimistic(
    () => $fetch(`/api/students/${student.matricula}`, { method: 'DELETE', body: { motivo } }),
    () => {
      const s = students.value.find(x => x.matricula === student.matricula)
      if (s) s.estatus = motivo
    },
    () => {
      const s = students.value.find(x => x.matricula === student.matricula)
      if (s) s.estatus = previousEstatus
      performSearch()
    },
    { pending: 'Procesando baja...', success: 'Alumno dado de baja exitosamente', error: 'Fallo al procesar baja' }
  )
}

const showStudentMenu = (event, student) => {
  openMenu(event, [
    { label: 'Ver detalles', icon: LucideEye, action: () => selectStudent(student) },
    { label: '-' },
    { label: 'Editar alumno', icon: LucideSettings, action: () => openEdit(student) },
    { label: '-' },
    { label: 'Dar de baja', icon: LucideUserMinus, class: 'text-accent-coral font-bold', disabled: student.estatus !== 'Activo', action: () => bajaAlumno(student) }
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
.mask-edges {
  mask-image: linear-gradient(to right, black 95%, transparent 100%);
}
</style>