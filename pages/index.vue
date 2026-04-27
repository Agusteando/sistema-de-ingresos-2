<template>
  <div class="students-screen">
    <header class="students-hero">
      <div class="hero-copy">
        <h1>Gestión de Alumnos</h1>
        <p>Administración general de matrícula y estado de cuenta financiero.</p>
      </div>
      <div class="hero-actions">
        <div v-if="userRole === 'global'" class="monthly-income">
          <div>
            <span>Ingresos del mes</span>
            <strong>${{ Number(globalKpis.ingresosMes).toLocaleString('es-MX', {minimumFractionDigits:2}) }}</strong>
          </div>
          <svg viewBox="0 0 122 42" aria-hidden="true">
            <polyline points="2,34 22,25 40,29 58,18 78,23 96,13 116,5" />
          </svg>
        </div>
        <button class="btn btn-primary new-student-button" @click="openAlta">
          <LucideUserPlus :size="22"/> Nuevo Alumno
        </button>
      </div>
    </header>

    <div class="kpi-grid">
      <button
        @click="setActiveFilter('inscritos')"
        :class="['kpi-card kpi-green', { active: activeFilter === 'inscritos' }]"
      >
        <span class="kpi-icon"><LucideUsers :size="24" /></span>
        <span class="kpi-text">
          <span>Inscritos</span>
          <strong>{{ kpiCounts.inscritos }}</strong>
          <em>Alumnos activos</em>
        </span>
        <svg viewBox="0 0 104 42" aria-hidden="true">
          <polyline points="0,34 15,27 31,29 46,18 63,21 78,13 93,15 104,4" />
        </svg>
      </button>

      <button
        @click="setActiveFilter('internos')"
        :class="['kpi-card kpi-teal', { active: activeFilter === 'internos' }]"
      >
        <span class="kpi-icon"><LucideUserCheck :size="24" /></span>
        <span class="kpi-text">
          <span>Internos</span>
          <strong>{{ kpiCounts.internos }}</strong>
          <em>Alumnos</em>
        </span>
        <svg viewBox="0 0 104 42" aria-hidden="true">
          <polyline points="0,35 18,31 35,22 51,16 69,18 88,15 104,3" />
        </svg>
      </button>

      <button
        @click="setActiveFilter('externos')"
        :class="['kpi-card kpi-blue', { active: activeFilter === 'externos' }]"
      >
        <span class="kpi-icon"><LucideGlobe2 :size="24" /></span>
        <span class="kpi-text">
          <span>Externos</span>
          <strong>{{ kpiCounts.externos }}</strong>
          <em>Alumnos</em>
        </span>
        <svg viewBox="0 0 104 42" aria-hidden="true">
          <polyline points="0,34 15,28 28,30 43,19 56,20 72,9 87,12 104,2" />
        </svg>
      </button>

      <button
        @click="setActiveFilter('no_inscritos')"
        :class="['kpi-card kpi-red', { active: activeFilter === 'no_inscritos' }]"
      >
        <span class="kpi-icon"><LucideUserX :size="24" /></span>
        <span class="kpi-text">
          <span>No inscritos</span>
          <strong>{{ kpiCounts.no_inscritos }}</strong>
          <em>Activos sin inscripcion</em>
        </span>
        <svg viewBox="0 0 104 42" aria-hidden="true">
          <polyline points="0,35 14,29 29,30 43,19 57,16 72,23 88,15 104,4" />
        </svg>
      </button>

      <button
        @click="setActiveFilter('bajas')"
        :class="['kpi-card kpi-gray', { active: activeFilter === 'bajas' }]"
      >
        <span class="kpi-icon"><LucideUserX :size="24" /></span>
        <span class="kpi-text">
          <span>Bajas</span>
          <strong>{{ kpiCounts.bajas }}</strong>
          <em>Con motivo registrado</em>
        </span>
        <svg viewBox="0 0 104 42" aria-hidden="true">
          <polyline points="0,34 16,31 31,23 47,26 63,17 80,19 96,10 104,8" />
        </svg>
      </button>
    </div>

    <div class="filter-bar">
      <div class="search-control">
        <LucideSearch :size="19" />
        <input
          v-model="filters.q"
          @keyup.enter="performSearch"
          placeholder="Matrícula o nombre del alumno..."
        />
      </div>

      <div class="grade-tabs">
        <button @click="activeGrado = ''; activeGrupo = ''" class="chip" :class="{'active': activeGrado === ''}">Todos</button>
        <button v-for="g in availableGrados" :key="g" @click="activeGrado = g; activeGrupo = ''" class="chip" :class="{'active': activeGrado === g}">{{ g }}</button>

        <template v-if="activeGrado && availableGrupos.length">
          <span class="tab-divider"></span>
          <button @click="activeGrupo = ''" class="chip" :class="{'active-group': activeGrupo === ''}">Todos</button>
          <button v-for="grp in availableGrupos" :key="grp" @click="activeGrupo = grp" class="chip" :class="{'active-group': activeGrupo === grp}">Grupo {{ grp }}</button>
        </template>
      </div>

      <button class="btn btn-secondary export-button" @click="exportData">
        <LucideDownload :size="18"/> Exportar
      </button>
    </div>

    <div v-if="selectedFilterTags.length" class="active-filter-strip">
      <span v-for="tag in selectedFilterTags" :key="tag" class="filter-token">{{ tag }}</span>
    </div>

    <div class="students-workspace">
      <section :class="['student-list-panel', selectedStudent ? 'is-compact' : 'is-full']">
        <div class="student-list-card">
          <div class="list-titlebar">
            <h2>Lista de alumnos <span>{{ displayedStudents.length }}</span></h2>
            <button v-if="hasActiveFilters" type="button" aria-label="Limpiar filtros" title="Limpiar filtros" @click="clearFilters">
              <LucideRotateCcw :size="16" />
            </button>
          </div>

          <div :class="['list-columns', selectedStudent ? 'compact' : 'full']">
            <span>Alumno</span>
            <span v-if="!selectedStudent">Asignación</span>
            <span v-if="!selectedStudent">Cargos</span>
            <span v-if="!selectedStudent">Abonos</span>
            <span>Saldo</span>
            <span></span>
          </div>

          <div class="student-list-scroll">
            <div v-if="loading" class="empty-state">Cargando registros...</div>
            <div v-else-if="!displayedStudents.length" class="empty-state muted">No hay registros bajo los filtros actuales.</div>
            <button
              v-else
              v-for="s in displayedStudents"
              :key="s.matricula"
              @click="selectStudent(s)"
              @contextmenu.prevent="showStudentMenu($event, s)"
              :class="[
                'student-row',
                selectedStudent ? 'compact' : 'full',
                selectedStudent?.matricula === s.matricula ? 'selected' : '',
                s.estatus !== 'Activo' ? 'inactive' : (!isEnrolled(s) ? 'unenrolled' : '')
              ]"
            >
              <span class="student-identity">
                <span class="student-avatar">
                  <img v-if="photoCache[normalizeStudentMatricula(s.matricula)]" :src="photoCache[normalizeStudentMatricula(s.matricula)]" alt="" />
                  <template v-else>{{ initials(s.nombreCompleto) }}</template>
                </span>
                <span class="student-copy">
                  <strong
                    :title="s.nombreCompleto"
                    :class="s.estatus !== 'Activo' ? 'line-through decoration-red-400/50' : ''"
                  >
                    {{ s.nombreCompleto }}
                  </strong>
                  <em>
                    {{ s.matricula }}
                    <template v-if="selectedStudent"> · {{ s.grado }} "{{ s.grupo }}"</template>
                  </em>
                </span>
              </span>

              <span v-if="!selectedStudent" class="assignment">
                <b v-if="s.estatus !== 'Activo'" class="status-pill red">BAJA</b>
                <b v-else-if="!isEnrolled(s)" class="status-pill orange">NO INSCRITO</b>
                <template v-else>
                  {{ s.nivel }} <i>·</i> {{ s.grado }} <b>"{{ s.grupo }}"</b>
                </template>
              </span>

              <span v-if="!selectedStudent" class="money muted">${{ format(s.importeTotal) }}</span>
              <span v-if="!selectedStudent" class="money paid">${{ format(s.pagosTotal) }}</span>
              <span class="money balance" :class="{ danger: s.saldoNeto > 0 }">${{ format(s.saldoNeto) }}</span>
              <span class="row-actions">
                <button @click.stop="openEdit(s)" title="Editar">
                  <LucideEdit2 :size="14" />
                </button>
                <LucideChevronRight :size="18" />
              </span>
            </button>
          </div>

          <div class="list-footer">
            <span>{{ listRangeLabel }}</span>
          </div>
        </div>
      </section>

      <section v-if="selectedStudent" class="student-detail-panel">
        <StudentDetails
          :student="selectedStudent"
          :is-enrolled="isEnrolled(selectedStudent)"
          @refresh="performSearch"
          @edit="openEdit"
          @close="selectedStudent = null"
          @switch-student="selectStudentByMatricula"
          @photo-loaded="cacheStudentPhoto"
          @baja="bajaAlumno"
        />
      </section>
    </div>

    <StudentFormModal v-if="showStudentModal" :student="editingStudent" @close="closeStudentModal" @success="handleStudentSuccess" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCookie, useState } from '#app'
import {
  LucideSearch,
  LucideUserPlus,
  LucideDownload,
  LucideEdit2,
  LucideUserX,
  LucideUserCheck,
  LucideEye,
  LucideSettings,
  LucideUsers,
  LucideGlobe2,
  LucideRotateCcw,
  LucideChevronRight
} from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'
import { useOptimisticSync } from '~/composables/useOptimisticSync'
import { exportToCSV } from '~/utils/export'
import { GRADOS_ORDEN } from '~/utils/constants'
import { normalizeCicloKey } from '~/shared/utils/ciclo'
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
const photoCache = ref({})

const globalKpis = ref({ ingresosMes: 0 })
const showStudentModal = ref(false)
const editingStudent = ref(null)

const format = (val) => Number(val || 0).toFixed(2)
const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'AL'
const normalizeStudentMatricula = (value) => String(value || '').trim().toUpperCase()
const photoStorageKey = (matricula) => `foto_${normalizeStudentMatricula(matricula)}`

const readCachedStudentPhotos = () => {
  if (!process.client) return
  const next = {}
  students.value.forEach((student) => {
    const matricula = normalizeStudentMatricula(student.matricula)
    const cached = sessionStorage.getItem(photoStorageKey(matricula))
    if (cached && cached !== 'none') next[matricula] = cached
  })
  photoCache.value = next
}

const cacheStudentPhoto = ({ matricula, photoUrl }) => {
  const normalized = normalizeStudentMatricula(matricula)
  if (!normalized) return
  if (photoUrl && photoUrl !== 'none') {
    photoCache.value = { ...photoCache.value, [normalized]: photoUrl }
    if (process.client) sessionStorage.setItem(photoStorageKey(normalized), photoUrl)
  }
}

const hasActiveFilters = computed(() => Boolean(
  activeFilter.value ||
  activeGrado.value ||
  activeGrupo.value ||
  filters.value.q
))

const activeFilterLabel = computed(() => ({
  inscritos: 'Inscritos',
  internos: 'Internos',
  externos: 'Externos',
  no_inscritos: 'No inscritos',
  bajas: 'Bajas'
}[activeFilter.value] || 'Todos los estados'))

const selectedFilterTags = computed(() => {
  const tags = []
  if (activeFilter.value) tags.push(`Estado: ${activeFilterLabel.value}`)
  if (activeGrado.value) tags.push(`Grado: ${activeGrado.value}`)
  if (activeGrupo.value) tags.push(`Grupo: ${activeGrupo.value}`)
  if (filters.value.q) tags.push(`Busqueda: ${filters.value.q}`)
  return tags
})

const setActiveFilter = (filter) => {
  activeFilter.value = activeFilter.value === filter ? '' : filter
  activeGrado.value = ''
  activeGrupo.value = ''
}

const clearFilters = () => {
  filters.value.q = ''
  activeFilter.value = ''
  activeGrado.value = ''
  activeGrupo.value = ''
  performSearch()
}

const listRangeLabel = computed(() => {
  const total = displayedStudents.value.length
  if (!total) return 'Sin alumnos para mostrar'
  if (total > 7) return `${total} alumnos; desplaza la lista para ver mas`
  return `${total} alumnos visibles`
})

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
    const cicloKey = normalizeCicloKey(state.value.ciclo)
    const res = await $fetch('/api/dashboard/kpis', { params: { ciclo: cicloKey } })
    globalKpis.value.ingresosMes = res.ingresosMes || 0
  } catch(e) {}
}

const performSearch = async () => {
  loading.value = true
  try {
    const cicloKey = normalizeCicloKey(state.value.ciclo)
    if (filters.value.q && activeFilter.value === 'inscritos') activeFilter.value = ''
    const res = await $fetch('/api/students', { params: { ciclo: cicloKey, q: filters.value.q } })
    students.value = res || []
    readCachedStudentPhotos()

    if (selectedStudent.value) {
      selectedStudent.value = students.value.find(s => normalizeStudentMatricula(s.matricula) === normalizeStudentMatricula(selectedStudent.value.matricula)) || null
    } else if (route.query.q) {
      const match = students.value.find(s => normalizeStudentMatricula(s.matricula) === normalizeStudentMatricula(route.query.q))
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
  let inscritos = 0, internos = 0, externos = 0, no_inscritos = 0, bajas = 0
  students.value.forEach(s => {
    if (s.estatus !== 'Activo') {
      bajas++
    } else if (isEnrolled(s)) {
      inscritos++
      if (String(s.interno) === '1') internos++
      else externos++
    } else {
      no_inscritos++
    }
  })
  return { inscritos, internos, externos, no_inscritos, bajas }
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
  else if (activeFilter.value === 'no_inscritos') list = list.filter(s => s.estatus === 'Activo' && !isEnrolled(s))
  else if (activeFilter.value === 'bajas') list = list.filter(s => s.estatus !== 'Activo')

  return list
})

const availableGrados = computed(() => {
  const set = new Set()
  const subset = students.value.filter(s => {
    if (activeFilter.value === 'inscritos') return isEnrolled(s)
    if (activeFilter.value === 'internos') return isEnrolled(s) && String(s.interno) === '1'
    if (activeFilter.value === 'externos') return isEnrolled(s) && String(s.interno) === '0'
    if (activeFilter.value === 'no_inscritos') return s.estatus === 'Activo' && !isEnrolled(s)
    if (activeFilter.value === 'bajas') return s.estatus !== 'Activo'
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
  exportToCSV(`Alumnos_${normalizeCicloKey(state.value.ciclo)}.csv`, exportList)
}

const selectStudent = (student) => { selectedStudent.value = student }
const selectStudentByMatricula = (matricula) => {
  const match = students.value.find(s => normalizeStudentMatricula(s.matricula) === normalizeStudentMatricula(matricula))
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
    { label: 'Dar de baja', icon: LucideUserX, class: 'text-accent-coral font-bold', disabled: student.estatus !== 'Activo', action: () => bajaAlumno(student) }
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
.students-screen {
  display: flex;
  width: 100%;
  max-width: 1208px;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  margin: 0 auto;
  overflow: hidden;
}

.students-hero {
  display: flex;
  min-height: 54px;
  flex-shrink: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 0 0 8px;
}

.hero-copy h1 {
  margin: 0 0 5px;
  color: #23324a;
  font-size: clamp(1.16rem, 1.32vw, 1.38rem);
  font-weight: 720;
  line-height: 1.14;
  letter-spacing: 0;
}

.hero-copy p {
  margin: 0;
  color: #7b879a;
  font-size: 0.78rem;
  font-weight: 450;
  line-height: 1.45;
}

.hero-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 14px;
  padding-top: 0;
}

.monthly-income {
  display: flex;
  width: 224px;
  height: 52px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid #e6ecf3;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.9);
  padding: 9px 13px 9px 16px;
  box-shadow: 0 4px 14px rgba(22, 38, 65, 0.03);
}

.monthly-income span {
  display: block;
  color: #5f7f58;
  font-size: 0.61rem;
  font-weight: 680;
  letter-spacing: 0.06em;
  line-height: 1.1;
  text-transform: uppercase;
}

.monthly-income strong {
  display: block;
  margin-top: 4px;
  color: #335d3a;
  font-size: 1rem;
  font-weight: 720;
  line-height: 1;
}

.monthly-income svg {
  width: 76px;
  height: 34px;
  overflow: visible;
  opacity: 0.55;
}

.monthly-income polyline {
  fill: none;
  stroke: #66af46;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.4;
}

.new-student-button {
  height: 46px;
  min-width: 185px;
  border-radius: 10px;
  font-size: 0.9rem;
}

.kpi-grid {
  display: grid;
  flex-shrink: 0;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 8px;
}

.kpi-card {
  position: relative;
  display: grid;
  min-height: 66px;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  overflow: hidden;
  border: 1px solid #e6ecf3;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.84);
  padding: 9px 11px;
  text-align: left;
  box-shadow: 0 4px 16px rgba(22, 38, 65, 0.028);
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}

.kpi-card::before {
  content: "";
  position: absolute;
  z-index: 0;
  right: -20px;
  bottom: -24px;
  width: 116px;
  height: 82px;
  opacity: 0.12;
  background-repeat: no-repeat;
  background-size: contain;
  background-image: url("data:image/svg+xml,%3Csvg width='134' height='92' viewBox='0 0 134 92' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M92 88C77 54 86 28 123 8C130 48 114 75 92 88Z' stroke='%23dce8de' stroke-width='1'/%3E%3Cpath d='M57 88C50 54 63 30 103 18C101 57 84 78 57 88Z' stroke='%23dce8de' stroke-width='1'/%3E%3Cpath d='M18 90C39 66 68 56 113 55' stroke='%23dce8de' stroke-width='1'/%3E%3C/svg%3E");
  pointer-events: none;
}

.kpi-card::after {
  content: "";
  position: absolute;
  z-index: 0;
  inset: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 160ms ease;
}

.kpi-card:hover,
.kpi-card.active {
  transform: translateY(-1px);
  box-shadow: 0 8px 22px rgba(22, 38, 65, 0.045);
}

.kpi-card.active {
  border-color: rgba(101, 167, 68, 0.34);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: inset 0 0 0 2px rgba(101, 167, 68, 0.24), 0 8px 22px rgba(22, 38, 65, 0.045);
}

.kpi-card.active::after,
.kpi-card:hover::after {
  opacity: 1;
}

.kpi-icon {
  position: relative;
  z-index: 1;
  display: flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
}

.kpi-green .kpi-icon { background: radial-gradient(circle at 32% 22%, #eff9e9, #dff1d6 70%); color: #58a93f; }
.kpi-teal .kpi-icon { background: radial-gradient(circle at 32% 22%, #e8fbf8, #d6f2ee 70%); color: #238a83; }
.kpi-blue .kpi-icon { background: radial-gradient(circle at 32% 22%, #eff5ff, #e0ebff 70%); color: #416fa8; }
.kpi-red .kpi-icon { background: radial-gradient(circle at 32% 22%, #fff0ed, #ffe1dc 70%); color: #c95b4d; }
.kpi-gray .kpi-icon { background: radial-gradient(circle at 32% 22%, #f3f6fa, #e4eaf2 70%); color: #66728a; }

.kpi-green::after { background: linear-gradient(90deg, rgba(224, 242, 216, 0.52), transparent 46%); }
.kpi-teal::after { background: linear-gradient(90deg, rgba(216, 244, 240, 0.5), transparent 46%); }
.kpi-blue::after { background: linear-gradient(90deg, rgba(224, 235, 255, 0.46), transparent 46%); }
.kpi-red::after { background: linear-gradient(90deg, rgba(255, 228, 223, 0.46), transparent 46%); }
.kpi-gray::after { background: linear-gradient(90deg, rgba(226, 232, 240, 0.5), transparent 46%); }

.kpi-text {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.kpi-text span {
  color: #536b58;
  font-size: 0.61rem;
  font-weight: 680;
  letter-spacing: 0.045em;
  text-transform: uppercase;
}

.kpi-teal .kpi-text span { color: #47716e; }
.kpi-blue .kpi-text span { color: #4f6072; }
.kpi-red .kpi-text span { color: #655d5b; }

.kpi-text strong {
  margin-top: 3px;
  color: #25344e;
  font-size: 1.05rem;
  font-weight: 720;
  letter-spacing: 0;
  line-height: 1;
}

.kpi-text em {
  margin-top: 4px;
  color: #8791a1;
  font-size: 0.68rem;
  font-style: normal;
  font-weight: 460;
}

.kpi-icon svg {
  width: 18px;
  height: 18px;
  align-self: center;
  margin: 0;
  filter: none;
}

.kpi-card > svg {
  display: none;
}

.kpi-card polyline {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.05;
}

.kpi-green polyline { stroke: #66af46; }
.kpi-teal polyline { stroke: #12aaa1; }
.kpi-blue polyline { stroke: #397fe8; }
.kpi-red polyline { stroke: #ff4d38; }
.kpi-gray polyline { stroke: #64748b; }

.filter-bar {
  display: grid;
  grid-template-columns: minmax(260px, 365px) minmax(0, 1fr) auto;
  flex-shrink: 0;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  margin-bottom: 8px;
  border: 1px solid #e6ecf3;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.82);
  padding: 6px 8px;
  box-shadow: 0 4px 14px rgba(22, 38, 65, 0.025);
}

.active-filter-strip {
  display: flex;
  min-height: 30px;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  margin: -2px 0 8px;
  overflow-x: auto;
}

.filter-token {
  display: inline-flex;
  align-items: center;
  border: 1px solid #cfe0c8;
  border-radius: 999px;
  background: #f1f8ee;
  color: #416d3b;
  padding: 5px 10px;
  font-size: 0.66rem;
  font-weight: 680;
  white-space: nowrap;
}

.search-control {
  display: flex;
  height: 32px;
  align-items: center;
  gap: 9px;
  border: 1px solid #dfe6ef;
  border-radius: 10px;
  background: #fbfcfd;
  padding: 0 13px;
  color: #8190a8;
}

.search-control input {
  min-width: 0;
  flex: 1;
  border: 0;
  background: transparent;
  color: #172841;
  font-size: 0.72rem;
  font-weight: 500;
  outline: none;
}

.search-control input::placeholder {
  color: #7d879d;
}

.grade-tabs {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
  overflow-x: auto;
  padding: 2px 0;
  scrollbar-width: none;
}

.grade-tabs::-webkit-scrollbar {
  display: none;
}

.tab-divider {
  width: 1px;
  height: 24px;
  flex-shrink: 0;
  background: #dfe6ef;
}

.export-button {
  min-width: 138px;
  height: 34px;
}

.students-workspace {
  display: flex;
  min-height: 0;
  flex: 1;
  gap: 14px;
}

.student-list-panel {
  display: flex;
  min-width: 0;
  min-height: 0;
  transition: width 200ms ease;
}

.student-list-panel.is-compact {
  width: clamp(318px, 25vw, 370px);
  flex: 0 0 clamp(318px, 25vw, 370px);
}

.student-list-panel.is-full {
  width: 100%;
  flex: 1 1 auto;
}

.student-list-card,
.student-detail-panel {
  min-height: 0;
  border: 1px solid #e6ecf3;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 5px 18px rgba(22, 38, 65, 0.032);
}

.student-list-card {
  display: flex;
  width: 100%;
  flex-direction: column;
  overflow: hidden;
}

.student-list-panel.is-compact .student-list-card {
  background: rgba(255, 255, 255, 0.74);
  box-shadow: none;
}

.student-list-panel.is-compact .list-titlebar,
.student-list-panel.is-compact .list-columns,
.student-list-panel.is-compact .student-row {
  border-color: #edf2f6;
}

.student-list-panel.is-compact .student-row:not(.selected) {
  opacity: 0.82;
}

.student-list-panel.is-compact .student-row:not(.selected):hover {
  opacity: 1;
}

.student-list-panel.is-compact .student-copy strong {
  font-weight: 620;
}

.student-list-panel.is-compact .money {
  color: #6e7b90;
}

.student-list-panel.is-compact .money.balance.danger {
  color: #a95d62;
}

.list-titlebar {
  display: flex;
  height: 36px;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e8eef5;
  padding: 0 17px;
}

.list-titlebar h2 {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0;
  color: #4f5c71;
  font-size: 0.72rem;
  font-weight: 680;
  letter-spacing: 0.025em;
  text-transform: uppercase;
}

.list-titlebar h2 span {
  border-radius: 999px;
  background: #e8f2e4;
  color: #517947;
  padding: 3px 9px;
  font-size: 0.72rem;
  line-height: 1;
}

.list-titlebar button {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 8px;
  background: #f7fafc;
  color: #64748b;
  transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
}

.list-titlebar button:hover {
  border-color: #dfe6ef;
  background: #fff;
  color: #2d7132;
}

.list-columns {
  display: grid;
  height: 28px;
  flex-shrink: 0;
  align-items: center;
  border-bottom: 1px solid #e8eef5;
  color: #7b8798;
  font-size: 0.6rem;
  font-weight: 680;
  letter-spacing: 0.035em;
  padding: 0 17px;
  text-transform: uppercase;
}

.list-columns.compact,
.student-row.compact {
  grid-template-columns: minmax(0, 1fr) 104px 28px;
}

.list-columns.full,
.student-row.full {
  grid-template-columns: minmax(250px, 1.4fr) minmax(190px, 0.9fr) 120px 120px 120px 42px;
}

.list-columns span:nth-last-child(2),
.list-columns.full span:nth-child(n+3) {
  text-align: right;
}

.student-list-scroll {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow-y: auto;
  scrollbar-color: #cbd5e1 transparent;
  scrollbar-width: thin;
}

.student-row {
  position: relative;
  display: grid;
  min-height: 43px;
  align-items: center;
  gap: 8px;
  border: 0;
  border-bottom: 1px solid #edf2f6;
  border-left: 3px solid transparent;
  background: transparent;
  padding: 0 14px 0 13px;
  text-align: left;
  transition: background 150ms ease, border-color 150ms ease;
}

.student-row:hover {
  background: #f8fbf9;
}

.student-row.selected {
  border-left-color: #6aa957;
  background: linear-gradient(90deg, rgba(236, 246, 231, 0.76) 0%, rgba(255, 255, 255, 0.86) 100%);
  opacity: 1;
}

.student-row.inactive {
  background: rgba(255, 77, 56, 0.035);
}

.student-row.unenrolled {
  background: rgba(252, 191, 45, 0.04);
}

.student-identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
}

.student-avatar {
  display: flex;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #ecf4e8;
  color: #527d49;
  font-size: 0.74rem;
  font-weight: 680;
}

.student-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.student-row:nth-child(4n+2) .student-avatar { background: #edf2fb; color: #536f9e; }
.student-row:nth-child(4n+3) .student-avatar { background: #e9f5f1; color: #4b8177; }
.student-row:nth-child(4n+4) .student-avatar { background: #f0edf6; color: #72638b; }

.student-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.student-copy strong {
  overflow: hidden;
  color: #2f3d55;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.student-copy em,
.assignment {
  color: #7b8798;
  font-size: 0.62rem;
  font-style: normal;
  font-weight: 500;
  line-height: 1.2;
}

.assignment {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assignment i {
  color: #c5cfdb;
  font-style: normal;
  margin: 0 6px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 0.62rem;
  letter-spacing: 0.04em;
}

.status-pill.red {
  background: #ffe7e4;
  color: #d52626;
}

.status-pill.orange {
  background: #fff1d7;
  color: #b66a10;
}

.money {
  color: #344158;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.68rem;
  font-weight: 680;
  text-align: right;
  white-space: nowrap;
}

.money.muted {
  color: #77849a;
}

.money.paid {
  color: #477a49;
}

.money.balance.danger {
  color: #b84f56;
}

.row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  color: #7c8798;
}

.row-actions button {
  display: flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #7c8798;
  opacity: 0.22;
  transition: opacity 150ms ease, background 150ms ease, color 150ms ease;
}

.student-row:hover .row-actions button {
  opacity: 0.75;
}

.row-actions button:hover {
  background: rgba(101, 167, 68, 0.09);
  color: #426d3b;
}

.row-actions > svg {
  opacity: 0.32;
}

.empty-state {
  display: flex;
  min-height: 220px;
  align-items: center;
  justify-content: center;
  color: #66728a;
  font-size: 0.92rem;
  font-weight: 700;
}

.empty-state.muted {
  color: #9aa5b7;
}

.list-footer {
  display: flex;
  height: 34px;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #e8eef5;
  padding: 0 17px;
  color: #818b9b;
  font-size: 0.68rem;
  font-weight: 450;
}

.student-detail-panel {
  display: flex;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  border: 0;
  background: transparent;
  box-shadow: none;
}

@media (max-width: 1280px) {
  .students-screen {
    max-width: none;
  }

  .kpi-card {
    grid-template-columns: 40px minmax(0, 1fr);
    padding-right: 12px;
  }

  .kpi-icon {
    width: 34px;
    height: 34px;
  }

  .student-list-panel.is-compact {
    width: 318px;
    flex-basis: 318px;
  }
}

@media (max-height: 920px) and (min-width: 1081px) {
  .students-hero {
    min-height: 56px;
    padding-bottom: 8px;
  }

  .hero-copy h1 {
    font-size: 1.18rem;
  }

  .hero-copy p {
    font-size: 0.74rem;
  }

  .monthly-income {
    height: 48px;
    width: 212px;
    padding-top: 8px;
    padding-bottom: 8px;
  }

  .monthly-income strong {
    font-size: 0.94rem;
  }

  .new-student-button {
    height: 48px;
  }

  .kpi-grid {
    gap: 10px;
    margin-bottom: 8px;
  }

  .kpi-card {
    min-height: 66px;
    padding-top: 9px;
    padding-bottom: 9px;
  }

  .kpi-icon {
    width: 34px;
    height: 34px;
  }

  .kpi-text strong {
    font-size: 1.08rem;
  }

  .kpi-text em {
    margin-top: 5px;
    font-size: 0.64rem;
  }

  .filter-bar {
    min-height: 44px;
    margin-bottom: 8px;
    padding-top: 6px;
    padding-bottom: 6px;
  }

  .student-row {
    min-height: 44px;
  }
}

@media (max-width: 1080px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .students-workspace {
    overflow: auto;
  }

  .student-list-panel.is-compact {
    display: none;
  }

  .filter-bar {
    grid-template-columns: 1fr;
  }

  .hero-actions {
    align-items: flex-end;
    flex-direction: column;
    gap: 12px;
  }
}
</style>
