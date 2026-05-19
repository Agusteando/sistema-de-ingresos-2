<template>
  <div class="control-escolar-screen">
    <section class="control-escolar-hero">
      <div class="hero-copy">
        <h1>Control Escolar</h1>
        <p>Consulta y edición ligera de alumnos por plantel, sin modificar la sesión activa del sistema.</p>
      </div>

      <div class="control-escolar-selected" :class="{ disabled: !selectedAgentId }">
        <span>Plantel seleccionado</span>
        <strong>{{ selectedAgentId || 'Sin selección' }}</strong>
      </div>
    </section>

    <section class="control-escolar-toolbar">
      <label class="control-select-control">
        <LucideBuilding2 :size="16" />
        <select v-model="selectedAgentId" :disabled="optionsLoading || !plantelOptions.length" aria-label="Seleccionar plantel">
          <option value="" disabled>Selecciona plantel</option>
          <option v-for="option in plantelOptions" :key="option.agentId" :value="option.agentId">{{ option.label }}</option>
        </select>
        <LucideChevronDown :size="14" />
      </label>

      <label class="search-control control-search-control">
        <span class="search-filter-icon"><LucideSearch :size="14" /></span>
        <input v-model="searchDraft" type="search" placeholder="Buscar por nombre, matrícula, CURP, teléfono o tutor..." @keydown.enter.prevent="commitSearch" />
      </label>

      <button class="btn btn-secondary" type="button" :disabled="loading || !selectedAgentId" @click="refreshAll">
        <LucideRefreshCw :class="{ spinning: loading }" :size="15" />
        Refresh
      </button>
      <button class="btn btn-outline" type="button" :disabled="exporting || !selectedAgentId || !students.length" @click="exportCurrentView">
        <LucideDownload :size="15" />
        Exportar
      </button>
      <button class="btn btn-ghost" type="button" :disabled="!hasActiveFilters" @click="clearFilters">
        <LucideRotateCcw :size="15" />
        Limpiar filtros
      </button>
    </section>

    <section class="control-escolar-kpis" :class="{ 'is-loading': kpisLoading }">
      <button v-for="card in kpiCards" :key="card.key" type="button" :class="['kpi-card', card.tone]" @click="applyKpiFilter(card)">
        <span class="kpi-icon"><component :is="card.icon" :size="20" /></span>
        <span class="kpi-text">
          <span>{{ card.label }}</span>
          <strong>{{ formatNumber(card.value) }}</strong>
        </span>
      </button>
    </section>

    <section v-if="kpis.byProgram?.length || kpis.byGroup?.length" class="control-escolar-breakdown">
      <button v-for="item in kpis.byProgram" :key="`program-${item.label}`" type="button" class="section-kpi-card" @click="setProgramFilter(item.label)">
        <LucideGraduationCap :size="13" />
        <span class="section-kpi-name">{{ item.label }}</span>
        <strong>{{ formatNumber(item.total) }}</strong>
      </button>
      <button v-for="item in kpis.byGroup" :key="`group-${item.label}`" type="button" class="section-kpi-card muted" @click="setGroupFilter(item.label)">
        <LucideUsersRound :size="13" />
        <span class="section-kpi-name">Grupo {{ item.label }}</span>
        <strong>{{ formatNumber(item.total) }}</strong>
      </button>
    </section>

    <section class="control-escolar-filters">
      <label class="control-filter-field">
        <span>Estado</span>
        <select v-model="filters.status">
          <option value="all">Todos</option>
          <option v-for="status in availableStatuses" :key="status" :value="status">{{ status }}</option>
        </select>
      </label>
      <label class="control-filter-field">
        <span>Dato faltante</span>
        <select v-model="filters.missingData">
          <option value="all">Todos</option>
          <option value="curp">Sin CURP</option>
          <option value="phone">Sin teléfono</option>
          <option value="email">Sin email</option>
          <option value="guardian">Sin tutor</option>
          <option v-if="schema.hasAddress" value="address">Sin dirección</option>
        </select>
      </label>
      <label class="control-filter-field">
        <span>Programa / nivel</span>
        <select v-model="filters.program">
          <option value="all">Todos</option>
          <option v-for="program in availablePrograms" :key="program" :value="program">{{ program }}</option>
        </select>
      </label>
      <label class="control-filter-field">
        <span>Grupo</span>
        <select v-model="filters.group">
          <option value="all">Todos</option>
          <option v-for="group in availableGroups" :key="group" :value="group">{{ group }}</option>
        </select>
      </label>
      <label class="control-filter-field">
        <span>Actualización</span>
        <select v-model="filters.recentlyUpdated" :disabled="!schema.hasUpdatedAt">
          <option value="all">Todas</option>
          <option value="7d">Últimos 7 días</option>
          <option value="30d">Últimos 30 días</option>
        </select>
      </label>
    </section>

    <section class="control-escolar-workspace" :class="{ 'has-detail': activeStudent }">
      <div class="control-escolar-table-card">
        <div class="control-table-titlebar">
          <div>
            <h2>Alumnos <span>{{ formatNumber(meta.total) }}</span></h2>
            <p>{{ selectedAgentId ? `Plantel ${selectedAgentId}` : 'Selecciona un plantel para consultar alumnos.' }}</p>
          </div>
          <strong v-if="hasActiveFilters" class="active-filter-pill">Filtros activos</strong>
        </div>

        <div v-if="loading" class="control-state-card">
          <span class="liquid-loader" aria-hidden="true"><i></i><i></i><i></i></span>
          Cargando alumnos del plantel seleccionado...
        </div>

        <div v-else-if="offlineState" class="control-state-card error">
          <LucideWifiOff :size="20" />
          <div>
            <strong>Plantel no disponible</strong>
            <p>{{ errorMessage || 'No fue posible consultar este agente. Revisa conexión o disponibilidad del bridge.' }}</p>
          </div>
        </div>

        <div v-else-if="errorMessage" class="control-state-card error">
          <LucideAlertTriangle :size="20" />
          <div>
            <strong>No se pudo cargar Control Escolar</strong>
            <p>{{ errorMessage }}</p>
          </div>
        </div>

        <div v-else-if="!selectedAgentId" class="control-state-card muted">
          <LucideBuilding2 :size="20" />
          Selecciona un plantel para iniciar.
        </div>

        <div v-else-if="!students.length" class="control-state-card muted">
          <LucideInbox :size="20" />
          No hay alumnos bajo los filtros actuales.
        </div>

        <template v-else>
          <div class="control-table-scroll">
            <table class="control-students-table">
              <thead>
                <tr>
                  <th>Plantel</th>
                  <th>Matrícula / ID</th>
                  <th>Nombre completo</th>
                  <th>CURP</th>
                  <th>Teléfono</th>
                  <th>Email</th>
                  <th>Estado</th>
                  <th>Programa / nivel / grupo</th>
                  <th>Tutor / responsable</th>
                  <th>Datos faltantes</th>
                  <th>Última actualización</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="student in students" :key="student.studentId" :class="{ selected: activeStudent?.studentId === student.studentId }" @click="openStudent(student)">
                  <td><span class="plantel-chip">{{ student.plantel }}</span></td>
                  <td><strong class="student-code">{{ student.matricula || student.studentId }}</strong></td>
                  <td>
                    <div class="student-table-name">
                      <strong>{{ student.fullName || 'Sin nombre' }}</strong>
                      <span>{{ student.grado || 'Sin grado' }}<template v-if="student.group"> · {{ student.group }}</template></span>
                    </div>
                  </td>
                  <td>{{ student.curp || '—' }}</td>
                  <td>{{ student.phone || '—' }}</td>
                  <td>{{ student.email || '—' }}</td>
                  <td><span :class="['status-pill', statusTone(student.status)]">{{ student.status }}</span></td>
                  <td>
                    <span class="program-stack">
                      <strong>{{ student.program || student.nivel || '—' }}</strong>
                      <small>{{ [student.grado, student.group ? `Grupo ${student.group}` : ''].filter(Boolean).join(' · ') || 'Sin grupo' }}</small>
                    </span>
                  </td>
                  <td>{{ student.guardianName || '—' }}</td>
                  <td>
                    <div v-if="student.missingFields?.length" class="missing-field-list">
                      <span v-for="field in student.missingFields.slice(0, 3)" :key="`${student.studentId}-${field}`">{{ missingFieldLabel(field) }}</span>
                      <span v-if="student.missingFields.length > 3">+{{ student.missingFields.length - 3 }}</span>
                    </div>
                    <span v-else class="complete-pill">Completo</span>
                  </td>
                  <td>{{ formatDate(student.updatedAt) || '—' }}</td>
                  <td>
                    <button class="row-action-button" type="button" @click.stop="openStudent(student)">
                      <LucideChevronRight :size="17" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <footer class="control-pagination">
            <span>Página {{ meta.page }} de {{ meta.totalPages }} · {{ formatNumber(meta.total) }} registros</span>
            <div>
              <button class="btn btn-sm btn-outline" type="button" :disabled="meta.page <= 1" @click="page -= 1">Anterior</button>
              <button class="btn btn-sm btn-outline" type="button" :disabled="meta.page >= meta.totalPages" @click="page += 1">Siguiente</button>
            </div>
          </footer>
        </template>
      </div>

      <aside v-if="activeStudent" class="control-detail-panel">
        <header class="control-detail-header">
          <button class="plain-icon-button" type="button" aria-label="Cerrar detalle" @click="closeStudent">
            <LucideX :size="16" />
          </button>
          <div>
            <span>{{ activeStudent.plantel }} · {{ activeStudent.matricula }}</span>
            <h3>{{ activeStudent.fullName || 'Alumno sin nombre' }}</h3>
          </div>
          <button class="btn btn-sm" type="button" @click="editMode = !editMode">
            <LucidePencil :size="14" />
            {{ editMode ? 'Ver' : 'Editar' }}
          </button>
        </header>

        <section class="detail-summary-grid">
          <article>
            <span>Estado</span>
            <strong>{{ activeStudent.status }}</strong>
          </article>
          <article>
            <span>Programa</span>
            <strong>{{ activeStudent.program || '—' }}</strong>
          </article>
          <article>
            <span>Grupo</span>
            <strong>{{ activeStudent.group || '—' }}</strong>
          </article>
          <article>
            <span>Faltantes</span>
            <strong>{{ activeStudent.missingFields?.length || 0 }}</strong>
          </article>
        </section>

        <form class="control-edit-form" @submit.prevent="saveStudent">
          <div class="control-detail-section-title">Datos personales</div>
          <div class="control-form-grid">
            <label>
              <span>Apellido paterno</span>
              <input v-model="editForm.apellidoPaterno" :disabled="!editMode || saving" type="text" />
            </label>
            <label>
              <span>Apellido materno</span>
              <input v-model="editForm.apellidoMaterno" :disabled="!editMode || saving" type="text" />
            </label>
            <label class="wide">
              <span>Nombres</span>
              <input v-model="editForm.nombres" :disabled="!editMode || saving" type="text" />
            </label>
            <label class="wide">
              <span>CURP</span>
              <input v-model="editForm.curp" :disabled="!editMode || saving" type="text" maxlength="18" />
            </label>
          </div>

          <div class="control-detail-section-title">Contacto</div>
          <div class="control-form-grid">
            <label>
              <span>Teléfono</span>
              <input v-model="editForm.phone" :disabled="!editMode || saving" type="tel" />
            </label>
            <label>
              <span>Email</span>
              <input v-model="editForm.email" :disabled="!editMode || saving" type="email" />
            </label>
            <label class="wide">
              <span>Tutor / responsable</span>
              <input v-model="editForm.guardianName" :disabled="!editMode || saving" type="text" />
            </label>
            <label v-if="schema.hasAddress" class="wide">
              <span>Dirección</span>
              <textarea v-model="editForm.address" :disabled="!editMode || saving" rows="3"></textarea>
            </label>
          </div>

          <div class="control-detail-section-title">Datos académicos básicos</div>
          <div class="control-form-grid">
            <label v-if="schema.editableFields.includes('status')">
              <span>Estado</span>
              <input v-model="editForm.status" :disabled="!editMode || saving" type="text" />
            </label>
            <label v-if="schema.editableFields.includes('nivel')">
              <span>Nivel</span>
              <input v-model="editForm.nivel" :disabled="!editMode || saving" type="text" />
            </label>
            <label v-if="schema.editableFields.includes('grado')">
              <span>Grado</span>
              <input v-model="editForm.grado" :disabled="!editMode || saving" type="text" />
            </label>
            <label v-if="schema.editableFields.includes('group')">
              <span>Grupo</span>
              <input v-model="editForm.group" :disabled="!editMode || saving" type="text" />
            </label>
          </div>

          <div v-if="activeStudent.missingFields?.length" class="control-missing-summary">
            <strong>Datos faltantes</strong>
            <p>{{ activeStudent.missingFields.map(missingFieldLabel).join(', ') }}</p>
          </div>

          <footer v-if="editMode" class="control-edit-footer">
            <button class="btn btn-outline" type="button" :disabled="saving" @click="resetEditForm">Descartar</button>
            <button class="btn btn-primary" type="submit" :disabled="saving">
              <LucideSave :size="15" />
              Guardar cambios
            </button>
          </footer>
        </form>
      </aside>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useHead, useState } from '#imports'
import {
  LucideAlertTriangle,
  LucideBuilding2,
  LucideChevronDown,
  LucideChevronRight,
  LucideDownload,
  LucideFileWarning,
  LucideGraduationCap,
  LucideInbox,
  LucidePencil,
  LucideRefreshCw,
  LucideRotateCcw,
  LucideSave,
  LucideSearch,
  LucideShieldCheck,
  LucideUserCheck,
  LucideUserX,
  LucideUsersRound,
  LucideWifiOff,
  LucideX
} from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'

useHead({ bodyAttrs: { class: 'students-route-active control-escolar-route-active' } })

const state = useState('globalState')
const { show } = useToast()
const selectedAgentId = ref('')
const plantelOptions = ref([])
const optionsLoading = ref(false)
const loading = ref(false)
const kpisLoading = ref(false)
const exporting = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const offlineState = ref(false)
const students = ref([])
const kpis = ref({ total: 0, active: 0, inactive: 0, newEnrollments: 0, incompleteRecords: 0, missingCurp: 0, missingPhone: 0, missingGuardian: 0, byProgram: [], byGroup: [] })
const meta = ref({ page: 1, limit: 25, total: 0, totalPages: 1 })
const filterOptions = ref({ statuses: [], programs: [], groups: [] })
const schema = ref({ hasAddress: false, hasUpdatedAt: false, editableFields: [] })
const searchDraft = ref('')
const page = ref(1)
const activeStudent = ref(null)
const editMode = ref(false)
const editForm = reactive({ apellidoPaterno: '', apellidoMaterno: '', nombres: '', curp: '', phone: '', email: '', guardianName: '', address: '', status: '', nivel: '', grado: '', group: '' })
const filters = reactive({ search: '', status: 'all', missingData: 'all', program: 'all', group: 'all', recentlyUpdated: 'all' })

let searchTimer = null
let studentsRequestId = 0
let kpiRequestId = 0

const selectedCiclo = computed(() => state.value?.ciclo || '2025')
const availableStatuses = computed(() => filterOptions.value.statuses || [])
const availablePrograms = computed(() => filterOptions.value.programs || [])
const availableGroups = computed(() => filterOptions.value.groups || [])
const hasActiveFilters = computed(() => Boolean(filters.search || filters.status !== 'all' || filters.missingData !== 'all' || filters.program !== 'all' || filters.group !== 'all' || filters.recentlyUpdated !== 'all'))
const kpiCards = computed(() => [
  { key: 'total', label: 'Total inscritos', value: kpis.value.total, icon: LucideUsersRound, tone: 'kpi-green' },
  { key: 'active', label: 'Activos', value: kpis.value.active, icon: LucideUserCheck, tone: 'kpi-teal', status: 'Activo' },
  { key: 'inactive', label: 'Inactivos / bajas', value: kpis.value.inactive, icon: LucideUserX, tone: 'kpi-red' },
  { key: 'newEnrollments', label: 'Nuevos inscritos', value: kpis.value.newEnrollments, icon: LucideGraduationCap, tone: 'kpi-blue' },
  { key: 'incompleteRecords', label: 'Expedientes incompletos', value: kpis.value.incompleteRecords, icon: LucideFileWarning, tone: 'kpi-gray' },
  { key: 'missingCurp', label: 'Sin CURP', value: kpis.value.missingCurp, icon: LucideShieldCheck, tone: 'kpi-red', missingData: 'curp' },
  { key: 'missingPhone', label: 'Sin teléfono', value: kpis.value.missingPhone, icon: LucideAlertTriangle, tone: 'kpi-gray', missingData: 'phone' },
  { key: 'missingGuardian', label: 'Sin tutor', value: kpis.value.missingGuardian, icon: LucideUsersRound, tone: 'kpi-gray', missingData: 'guardian' }
])

const requestParams = (overrides = {}) => {
  const params = new URLSearchParams({
    agentId: selectedAgentId.value,
    search: filters.search,
    status: filters.status,
    missingData: filters.missingData,
    program: filters.program,
    group: filters.group,
    recentlyUpdated: filters.recentlyUpdated,
    page: String(page.value),
    limit: '25',
    ...overrides
  })

  for (const [key, value] of [...params.entries()]) {
    if (!value || value === 'all') params.delete(key)
  }

  return params
}

const fetchOptions = async () => {
  optionsLoading.value = true
  errorMessage.value = ''
  try {
    const res = await $fetch('/api/control-escolar/options')
    plantelOptions.value = res.agents || []
    const stored = process.client ? localStorage.getItem('control-escolar-agent-id') : ''
    const validStored = plantelOptions.value.some(option => option.agentId === stored)
    selectedAgentId.value = validStored ? stored : (res.selected || plantelOptions.value[0]?.agentId || '')
  } catch (error) {
    errorMessage.value = error?.data?.message || error?.message || 'No se pudieron cargar los planteles disponibles.'
  } finally {
    optionsLoading.value = false
  }
}

const fetchKpis = async () => {
  if (!selectedAgentId.value) return
  const requestId = ++kpiRequestId
  kpisLoading.value = true
  try {
    const params = new URLSearchParams({ agentId: selectedAgentId.value, ciclo: selectedCiclo.value })
    const res = await $fetch(`/api/control-escolar/kpis?${params.toString()}`)
    if (requestId === kpiRequestId) kpis.value = { ...kpis.value, ...res }
  } catch (error) {
    if (requestId === kpiRequestId) errorMessage.value = error?.data?.message || error?.message || 'No se pudieron cargar KPIs.'
  } finally {
    if (requestId === kpiRequestId) kpisLoading.value = false
  }
}

const fetchStudents = async () => {
  if (!selectedAgentId.value) return
  const requestId = ++studentsRequestId
  loading.value = true
  errorMessage.value = ''
  offlineState.value = false
  try {
    const res = await $fetch(`/api/control-escolar/students?${requestParams().toString()}`)
    if (requestId !== studentsRequestId) return
    students.value = res.rows || []
    meta.value = res.meta || meta.value
    filterOptions.value = res.filters || filterOptions.value
    schema.value = { ...schema.value, ...(res.schema || {}) }
    if (activeStudent.value) {
      const replacement = students.value.find(student => student.studentId === activeStudent.value.studentId)
      if (replacement) openStudent(replacement, { keepMode: true })
    }
  } catch (error) {
    if (requestId !== studentsRequestId) return
    students.value = []
    const statusCode = Number(error?.statusCode || error?.status || error?.data?.statusCode || 0)
    offlineState.value = [408, 502, 503, 504].includes(statusCode) || /timeout|offline|fetch failed|bridge/i.test(error?.message || '')
    errorMessage.value = error?.data?.message || error?.message || 'No se pudo consultar el plantel seleccionado.'
  } finally {
    if (requestId === studentsRequestId) loading.value = false
  }
}

const refreshAll = async () => {
  await Promise.all([fetchKpis(), fetchStudents()])
}

const commitSearch = () => {
  filters.search = searchDraft.value.trim()
}

const clearFilters = () => {
  searchDraft.value = ''
  filters.search = ''
  filters.status = 'all'
  filters.missingData = 'all'
  filters.program = 'all'
  filters.group = 'all'
  filters.recentlyUpdated = 'all'
  page.value = 1
}

const applyKpiFilter = (card) => {
  if (card.status) filters.status = card.status
  if (card.missingData) filters.missingData = card.missingData
  if (card.key === 'incompleteRecords') filters.missingData = 'curp'
  page.value = 1
}

const setProgramFilter = (label) => {
  filters.program = label
  page.value = 1
}

const setGroupFilter = (label) => {
  filters.group = label
  page.value = 1
}

const openStudent = (student, options = {}) => {
  activeStudent.value = student
  if (!options.keepMode) editMode.value = false
  resetEditForm()
}

const closeStudent = () => {
  activeStudent.value = null
  editMode.value = false
}

const resetEditForm = () => {
  if (!activeStudent.value) return
  Object.assign(editForm, {
    apellidoPaterno: activeStudent.value.apellidoPaterno || '',
    apellidoMaterno: activeStudent.value.apellidoMaterno || '',
    nombres: activeStudent.value.nombres || '',
    curp: activeStudent.value.curp || '',
    phone: activeStudent.value.phone || '',
    email: activeStudent.value.email || '',
    guardianName: activeStudent.value.guardianName || '',
    address: activeStudent.value.address || '',
    status: activeStudent.value.status || '',
    nivel: activeStudent.value.nivel || activeStudent.value.program || '',
    grado: activeStudent.value.grado || '',
    group: activeStudent.value.group || ''
  })
}

const saveStudent = async () => {
  if (!activeStudent.value || !selectedAgentId.value) return
  saving.value = true
  try {
    const payload = { agentId: selectedAgentId.value }
    const addChanged = (payloadKey, formKey, sourceKey = payloadKey) => {
      const nextValue = String(editForm[formKey] ?? '').trim()
      const currentValue = String(activeStudent.value?.[sourceKey] ?? '').trim()
      if (nextValue !== currentValue) payload[payloadKey] = nextValue
    }

    addChanged('apellidoPaterno', 'apellidoPaterno')
    addChanged('apellidoMaterno', 'apellidoMaterno')
    addChanged('nombres', 'nombres')
    addChanged('curp', 'curp')
    addChanged('phone', 'phone')
    addChanged('email', 'email')
    addChanged('guardianName', 'guardianName')
    if (schema.value.hasAddress) addChanged('address', 'address')
    if (schema.value.editableFields.includes('status')) addChanged('status', 'status')
    if (schema.value.editableFields.includes('nivel')) addChanged('nivel', 'nivel')
    if (schema.value.editableFields.includes('grado')) addChanged('grado', 'grado')
    if (schema.value.editableFields.includes('group')) addChanged('group', 'group')

    if (Object.keys(payload).length === 1) {
      show('No hay cambios para guardar.', 'danger')
      return
    }
    const res = await $fetch(`/api/control-escolar/students/${encodeURIComponent(activeStudent.value.studentId)}?agentId=${encodeURIComponent(selectedAgentId.value)}`, {
      method: 'PATCH',
      body: payload
    })
    const updated = res.student
    students.value = students.value.map(student => student.studentId === updated.studentId ? updated : student)
    activeStudent.value = updated
    resetEditForm()
    editMode.value = false
    await fetchKpis()
    show('Alumno actualizado', 'success')
  } catch (error) {
    show(error?.data?.message || error?.message || 'No se pudo actualizar el alumno.', 'danger')
  } finally {
    saving.value = false
  }
}

const exportCurrentView = async () => {
  if (!selectedAgentId.value) return
  exporting.value = true
  try {
    const params = requestParams({ limit: '10000' })
    params.delete('page')
    const response = await fetch(`/api/control-escolar/export?${params.toString()}`, { credentials: 'same-origin' })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || `Error HTTP ${response.status}`)
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `control-escolar-${selectedAgentId.value}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    show(error?.message || 'No se pudo exportar la vista filtrada.', 'danger')
  } finally {
    exporting.value = false
  }
}

const formatNumber = (value) => new Intl.NumberFormat('es-MX').format(Number(value || 0))
const formatDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('es-MX', { year: 'numeric', month: 'short', day: '2-digit' }).format(date)
}
const missingFieldLabel = (field) => ({ curp: 'CURP', phone: 'Teléfono', email: 'Email', guardianName: 'Tutor', guardian: 'Tutor', address: 'Dirección', fullName: 'Nombre' }[field] || field)
const statusTone = (status) => String(status || '').toLowerCase() === 'activo' ? 'active' : 'inactive'

watch(searchDraft, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(commitSearch, 350)
})

watch(() => selectedAgentId.value, async (value, oldValue) => {
  if (!value) return
  if (process.client) localStorage.setItem('control-escolar-agent-id', value)
  if (oldValue) {
    page.value = 1
    activeStudent.value = null
  }
  await refreshAll()
})

watch(() => [filters.search, filters.status, filters.missingData, filters.program, filters.group, filters.recentlyUpdated, page.value], () => {
  fetchStudents()
})

watch(() => selectedCiclo.value, () => {
  fetchKpis()
})

onMounted(fetchOptions)
</script>
