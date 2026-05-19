<template>
  <div class="control-escolar-page">
    <section class="ce-hero">
      <div>
        <p class="eyebrow">Control Escolar</p>
        <h2>Consulta académica por plantel</h2>
        <span>Vista de alumnos sin datos financieros. La selección de plantel aplica solo a esta pantalla.</span>
      </div>
      <div class="ce-hero-actions">
        <button type="button" class="btn btn-secondary" :disabled="loading" @click="reloadAll">
          <LucideRefreshCw :size="16" :class="{ spinning: loading }" /> Actualizar
        </button>
        <button type="button" class="btn btn-primary" :disabled="!students.length" @click="exportRows">
          <LucideDownload :size="16" /> Exportar
        </button>
      </div>
    </section>

    <section class="ce-toolbar card">
      <div class="ce-plantel-switcher">
        <label>Plantel</label>
        <div class="ce-agent-tabs">
          <button
            v-for="agent in agents"
            :key="agent.agentId"
            type="button"
            :class="['ce-agent-tab', { active: selectedAgentId === agent.agentId }]"
            @click="selectAgent(agent.agentId)"
          >
            {{ agent.agentId }}
          </button>
        </div>
      </div>

      <div class="ce-search-grid">
        <label class="ce-search-box">
          <LucideSearch :size="18" />
          <input v-model="filters.q" placeholder="Buscar nombre, matrícula, CURP, teléfono, correo o tutor" @keyup.enter="fetchStudents" />
        </label>

        <select v-model="filters.estatus" class="input-field">
          <option value="">Todos los estatus</option>
          <option value="Activo">Activo</option>
          <option value="Baja">Baja</option>
          <option value="Inactivo">Inactivo</option>
        </select>

        <select v-model="filters.missing" class="input-field">
          <option value="">Todos los registros</option>
          <option value="incompletos">Incompletos</option>
          <option value="curp">Sin CURP</option>
          <option value="telefono">Sin teléfono</option>
          <option value="correo">Sin correo</option>
          <option value="tutor">Sin tutor</option>
          <option value="nacimiento">Sin nacimiento</option>
        </select>

        <button type="button" class="btn btn-outline" @click="clearFilters">
          <LucideRotateCcw :size="16" /> Limpiar
        </button>
      </div>
    </section>

    <section class="ce-kpis">
      <article class="ce-kpi-card">
        <span>Total alumnos</span>
        <strong>{{ kpi.summary.total }}</strong>
      </article>
      <article class="ce-kpi-card success">
        <span>Activos</span>
        <strong>{{ kpi.summary.activos }}</strong>
      </article>
      <article class="ce-kpi-card warning">
        <span>Incompletos</span>
        <strong>{{ kpi.summary.incompletos }}</strong>
      </article>
      <article class="ce-kpi-card">
        <span>Sin CURP</span>
        <strong>{{ kpi.summary.sinCurp }}</strong>
      </article>
      <article class="ce-kpi-card">
        <span>Sin teléfono</span>
        <strong>{{ kpi.summary.sinTelefono }}</strong>
      </article>
      <article class="ce-kpi-card">
        <span>Sin tutor</span>
        <strong>{{ kpi.summary.sinTutor }}</strong>
      </article>
    </section>

    <section class="ce-table-card card">
      <div class="ce-table-header">
        <div>
          <h3>Alumnos {{ selectedAgentId }}</h3>
          <p>{{ total }} registros encontrados · página {{ page }} de {{ totalPages }}</p>
        </div>
        <div class="ce-table-tools">
          <select v-model.number="pageSize" class="input-field compact">
            <option :value="25">25</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
            <option :value="200">200</option>
          </select>
        </div>
      </div>

      <div class="ce-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Alumno</th>
              <th>Matrícula</th>
              <th>CURP</th>
              <th>Teléfono</th>
              <th>Tutor</th>
              <th>Grado</th>
              <th>Estatus</th>
              <th>Datos</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="9" class="ce-empty">Cargando alumnos...</td>
            </tr>
            <tr v-else-if="!students.length">
              <td colspan="9" class="ce-empty">No hay alumnos bajo los filtros actuales.</td>
            </tr>
            <template v-else>
              <tr v-for="student in students" :key="student.matricula" @click="openEditor(student)">
                <td>
                  <div class="student-main-cell">
                    <strong>{{ student.nombreCompleto || 'Sin nombre' }}</strong>
                    <span>{{ student.correo || 'Sin correo' }}</span>
                  </div>
                </td>
                <td>{{ student.matricula }}</td>
                <td>{{ student.curp || '—' }}</td>
                <td>{{ student.telefono || '—' }}</td>
                <td>{{ student.padre || '—' }}</td>
                <td>{{ compactGrade(student) }}</td>
                <td>
                  <span :class="['badge', student.estatus === 'Activo' ? 'badge-success' : 'badge-neutral']">{{ student.estatus || 'Sin estatus' }}</span>
                </td>
                <td>
                  <span v-if="student.missingFields?.length" class="ce-missing-pill">{{ student.missingFields.length }} faltantes</span>
                  <span v-else class="ce-complete-pill">Completo</span>
                </td>
                <td class="ce-row-action">
                  <button type="button" title="Editar datos escolares" @click.stop="openEditor(student)">
                    <LucidePencil :size="16" />
                  </button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <div class="ce-pagination">
        <button type="button" class="btn btn-outline" :disabled="page <= 1 || loading" @click="page--">Anterior</button>
        <span>{{ page }} / {{ totalPages }}</span>
        <button type="button" class="btn btn-outline" :disabled="page >= totalPages || loading" @click="page++">Siguiente</button>
      </div>
    </section>

    <div v-if="editingStudent" class="modal-overlay" @click.self="closeEditor">
      <div class="modal-container large ce-editor-modal">
        <div class="modal-header">
          <div>
            <h3>Editar alumno</h3>
            <p>{{ selectedAgentId }} · {{ editingStudent.matricula }}</p>
          </div>
          <button type="button" class="btn btn-ghost" @click="closeEditor">Cerrar</button>
        </div>

        <div class="modal-content ce-editor-content">
          <div class="ce-form-grid">
            <label>
              <span>Apellido paterno</span>
              <input v-model="editForm.apellidoPaterno" class="input-field" />
            </label>
            <label>
              <span>Apellido materno</span>
              <input v-model="editForm.apellidoMaterno" class="input-field" />
            </label>
            <label>
              <span>Nombres</span>
              <input v-model="editForm.nombres" class="input-field" />
            </label>
            <label>
              <span>CURP</span>
              <input v-model="editForm.curp" class="input-field" maxlength="18" />
            </label>
            <label>
              <span>Fecha nacimiento</span>
              <input v-model="editForm.birth" class="input-field" type="date" />
            </label>
            <label>
              <span>Género</span>
              <select v-model="editForm.genero" class="input-field">
                <option value="">Sin dato</option>
                <option value="H">H</option>
                <option value="M">M</option>
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </label>
            <label>
              <span>Teléfono</span>
              <input v-model="editForm.telefono" class="input-field" />
            </label>
            <label>
              <span>Correo</span>
              <input v-model="editForm.correo" class="input-field" type="email" />
            </label>
            <label class="wide">
              <span>Padre o tutor</span>
              <input v-model="editForm.padre" class="input-field" />
            </label>
            <label>
              <span>Nivel</span>
              <input v-model="editForm.nivel" class="input-field" />
            </label>
            <label>
              <span>Grado</span>
              <input v-model="editForm.grado" class="input-field" />
            </label>
            <label>
              <span>Grupo</span>
              <input v-model="editForm.grupo" class="input-field" />
            </label>
            <label>
              <span>Ciclo</span>
              <input v-model="editForm.ciclo" class="input-field" />
            </label>
            <label>
              <span>Estatus</span>
              <select v-model="editForm.estatus" class="input-field">
                <option value="Activo">Activo</option>
                <option value="Baja">Baja</option>
                <option value="Inactivo">Inactivo</option>
              </select>
            </label>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-outline" @click="closeEditor">Cancelar</button>
          <button type="button" class="btn btn-primary" :disabled="saving" @click="saveStudent">
            <LucideSave :size="16" /> {{ saving ? 'Guardando...' : 'Guardar cambios' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '#imports'
import {
  LucideDownload,
  LucidePencil,
  LucideRefreshCw,
  LucideRotateCcw,
  LucideSave,
  LucideSearch
} from 'lucide-vue-next'
import { exportToExcel } from '~/utils/export'
import { useToast } from '~/composables/useToast'

useHead({ title: 'Control Escolar | Sistema de Ingresos' })

const route = useRoute()
const router = useRouter()
const { show } = useToast()

const agents = ref([])
const selectedAgentId = ref('')
const students = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(50)
const loading = ref(false)
const saving = ref(false)
const editingStudent = ref(null)
const editForm = reactive({})
const filters = reactive({ q: '', estatus: '', missing: '' })
const kpi = reactive({
  summary: {
    total: 0,
    activos: 0,
    inactivos: 0,
    incompletos: 0,
    sinCurp: 0,
    sinTelefono: 0,
    sinCorreo: 0,
    sinTutor: 0,
    sinNacimiento: 0
  },
  byNivel: [],
  byGrado: []
})

let searchTimer = null

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

const compactGrade = (student) => {
  const parts = [student.nivel, student.grado, student.grupo ? `Grupo ${student.grupo}` : ''].filter(Boolean)
  return parts.join(' · ') || '—'
}

const setKpi = (payload = {}) => {
  const summary = payload.summary || {}
  Object.assign(kpi.summary, {
    total: Number(summary.total || 0),
    activos: Number(summary.activos || 0),
    inactivos: Number(summary.inactivos || 0),
    incompletos: Number(summary.incompletos || 0),
    sinCurp: Number(summary.sinCurp || 0),
    sinTelefono: Number(summary.sinTelefono || 0),
    sinCorreo: Number(summary.sinCorreo || 0),
    sinTutor: Number(summary.sinTutor || 0),
    sinNacimiento: Number(summary.sinNacimiento || 0)
  })
  kpi.byNivel = payload.byNivel || []
  kpi.byGrado = payload.byGrado || []
}

const selectAgent = (agentId) => {
  if (!agentId || selectedAgentId.value === agentId) return
  selectedAgentId.value = agentId
  page.value = 1
  router.replace({ query: { ...route.query, agentId } })
}

const loadOptions = async () => {
  const response = await $fetch('/api/control-escolar/options')
  agents.value = response.agents || []

  const queryAgent = String(route.query.agentId || '')
  const preferred = agents.value.find(agent => agent.agentId === queryAgent)?.agentId
    || response.defaultAgentId
    || agents.value[0]?.agentId
    || ''

  selectedAgentId.value = preferred
}

const fetchKpis = async () => {
  if (!selectedAgentId.value) return
  const response = await $fetch('/api/control-escolar/kpis', {
    query: { agentId: selectedAgentId.value }
  })
  setKpi(response)
}

const fetchStudents = async () => {
  if (!selectedAgentId.value) return
  loading.value = true
  try {
    const response = await $fetch('/api/control-escolar/students', {
      query: {
        agentId: selectedAgentId.value,
        q: filters.q,
        estatus: filters.estatus,
        missing: filters.missing,
        page: page.value,
        pageSize: pageSize.value
      }
    })
    students.value = response.students || []
    total.value = Number(response.total || 0)
  } catch (error) {
    show(error?.data?.message || 'No se pudo cargar Control Escolar.', 'error')
  } finally {
    loading.value = false
  }
}

const reloadAll = async () => {
  await Promise.all([fetchStudents(), fetchKpis()])
}

const clearFilters = () => {
  filters.q = ''
  filters.estatus = ''
  filters.missing = ''
  page.value = 1
  reloadAll()
}

const openEditor = (student) => {
  editingStudent.value = student
  Object.keys(editForm).forEach(key => delete editForm[key])
  Object.assign(editForm, {
    apellidoPaterno: student.apellidoPaterno || '',
    apellidoMaterno: student.apellidoMaterno || '',
    nombres: student.nombres || '',
    curp: student.curp || '',
    birth: student.birth ? String(student.birth).slice(0, 10) : '',
    genero: student.genero || '',
    telefono: student.telefono || '',
    correo: student.correo || '',
    padre: student.padre || '',
    nivel: student.nivel || '',
    grado: student.grado || '',
    grupo: student.grupo || '',
    ciclo: student.ciclo || '',
    estatus: student.estatus || 'Activo'
  })
}

const closeEditor = () => {
  editingStudent.value = null
}

const saveStudent = async () => {
  if (!editingStudent.value || !selectedAgentId.value) return
  saving.value = true
  try {
    await $fetch(`/api/control-escolar/students/${encodeURIComponent(editingStudent.value.matricula)}`, {
      method: 'PATCH',
      query: { agentId: selectedAgentId.value },
      body: { ...editForm, agentId: selectedAgentId.value }
    })
    show('Alumno actualizado.', 'success')
    closeEditor()
    await reloadAll()
  } catch (error) {
    show(error?.data?.message || 'No se pudo actualizar el alumno.', 'error')
  } finally {
    saving.value = false
  }
}

const exportRows = () => {
  const rows = students.value.map(student => ({
    plantel: selectedAgentId.value,
    matricula: student.matricula,
    nombreCompleto: student.nombreCompleto,
    curp: student.curp,
    telefono: student.telefono,
    correo: student.correo,
    tutor: student.padre,
    nivel: student.nivel,
    grado: student.grado,
    grupo: student.grupo,
    ciclo: student.ciclo,
    estatus: student.estatus,
    datosFaltantes: student.missingFields?.join(', ') || ''
  }))

  exportToExcel(`control-escolar-${selectedAgentId.value}.xls`, rows, {
    title: `Control Escolar ${selectedAgentId.value}`,
    subtitle: `Exportación de la vista filtrada · ${new Date().toLocaleString('es-MX')}`,
    sheetName: `CE ${selectedAgentId.value}`
  })
}

watch(() => selectedAgentId.value, () => {
  if (!selectedAgentId.value) return
  page.value = 1
  reloadAll()
})

watch(() => [filters.estatus, filters.missing, page.value, pageSize.value], () => {
  fetchStudents()
})

watch(() => filters.q, () => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    page.value = 1
    fetchStudents()
  }, 280)
})

onMounted(async () => {
  try {
    await loadOptions()
    await reloadAll()
  } catch (error) {
    show(error?.data?.message || 'No se pudo iniciar Control Escolar.', 'error')
  }
})
</script>

<style scoped>
.control-escolar-page {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 18px;
}

.ce-hero,
.ce-toolbar,
.ce-table-header,
.ce-pagination,
.ce-hero-actions,
.ce-table-tools {
  display: flex;
  align-items: center;
}

.ce-hero {
  justify-content: space-between;
  gap: 18px;
  border: 1px solid rgba(199, 221, 204, 0.78);
  border-radius: 26px;
  padding: 22px 24px;
  background:
    radial-gradient(circle at 91% 8%, rgba(115, 181, 79, 0.18), transparent 15rem),
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(241, 250, 241, 0.9));
  box-shadow: var(--shadow-card);
}

.eyebrow {
  margin: 0 0 4px;
  color: #317344;
  font-size: 0.7rem;
  font-weight: 850;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.ce-hero h2 {
  margin: 0;
  color: var(--ink);
  font-size: 1.55rem;
  line-height: 1.1;
}

.ce-hero span {
  display: block;
  margin-top: 7px;
  color: var(--muted);
  font-size: 0.88rem;
}

.ce-hero-actions {
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.ce-toolbar {
  gap: 18px;
  padding: 16px;
}

.ce-plantel-switcher {
  min-width: 280px;
}

.ce-plantel-switcher label,
.ce-form-grid span {
  display: block;
  margin-bottom: 7px;
  color: #4f6672;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.ce-agent-tabs {
  display: flex;
  max-width: 520px;
  gap: 7px;
  overflow-x: auto;
  padding-bottom: 3px;
}

.ce-agent-tab {
  min-width: 58px;
  border: 1px solid rgba(203, 218, 207, 0.92);
  border-radius: 13px;
  padding: 9px 12px;
  background: #fff;
  color: #536273;
  font-size: 0.76rem;
  font-weight: 850;
  transition: background 160ms ease, color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.ce-agent-tab:hover {
  transform: translateY(-1px);
}

.ce-agent-tab.active {
  border-color: rgba(64, 128, 56, 0.55);
  background: linear-gradient(135deg, #6ead4f, #407e38);
  color: white;
  box-shadow: 0 11px 24px rgba(78, 148, 67, 0.22);
}

.ce-search-grid {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(280px, 1fr) 170px 190px auto;
  gap: 10px;
  align-items: center;
}

.ce-search-box {
  display: flex;
  height: 38px;
  align-items: center;
  gap: 9px;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0 13px;
  background: #fff;
  color: #637187;
}

.ce-search-box input {
  width: 100%;
  border: 0;
  outline: none;
  color: var(--ink);
  font-size: 0.86rem;
  font-weight: 650;
}

.ce-kpis {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}

.ce-kpi-card {
  border: 1px solid rgba(220, 228, 220, 0.95);
  border-radius: 20px;
  padding: 16px;
  background: white;
  box-shadow: var(--shadow-card);
}

.ce-kpi-card span {
  display: block;
  color: var(--muted);
  font-size: 0.67rem;
  font-weight: 850;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ce-kpi-card strong {
  display: block;
  margin-top: 8px;
  color: var(--ink);
  font-size: 1.75rem;
  line-height: 1;
}

.ce-kpi-card.success strong {
  color: #357c37;
}

.ce-kpi-card.warning strong {
  color: #b16814;
}

.ce-table-card {
  min-height: 0;
  flex: 1;
}

.ce-table-header {
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--soft-line);
  padding: 16px 18px;
}

.ce-table-header h3 {
  margin: 0;
  color: var(--ink);
  font-size: 1.05rem;
}

.ce-table-header p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 650;
}

.input-field.compact {
  width: 92px;
}

.ce-table-scroll {
  max-height: calc(100vh - 410px);
  min-height: 380px;
  overflow: auto;
}

.ce-table-scroll thead th {
  position: sticky;
  top: 0;
  z-index: 2;
}

.ce-table-scroll tbody tr {
  cursor: pointer;
}

.student-main-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.student-main-cell strong {
  color: var(--ink);
  font-size: 0.88rem;
}

.student-main-cell span {
  color: var(--muted);
  font-size: 0.72rem;
}

.ce-missing-pill,
.ce-complete-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 9px;
  font-size: 0.68rem;
  font-weight: 800;
}

.ce-missing-pill {
  background: #fff5df;
  color: #9b5d12;
}

.ce-complete-pill {
  background: #eaf8e7;
  color: #347536;
}

.ce-row-action {
  text-align: right;
}

.ce-row-action button {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: #fff;
  color: #397047;
}

.ce-empty {
  padding: 42px 18px;
  text-align: center;
  color: var(--muted);
  font-weight: 750;
}

.ce-pagination {
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid var(--soft-line);
  padding: 12px 16px;
}

.ce-pagination span {
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 750;
}

.ce-editor-modal h3 {
  margin: 0;
}

.ce-editor-modal p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 750;
}

.ce-editor-content {
  background: #fbfdfc;
}

.ce-form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.ce-form-grid label.wide {
  grid-column: span 2;
}

.spinning {
  animation: ce-spin 900ms linear infinite;
}

@keyframes ce-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1180px) {
  .ce-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .ce-search-grid {
    grid-template-columns: 1fr 1fr;
  }

  .ce-kpis {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .ce-hero,
  .ce-table-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .ce-search-grid,
  .ce-kpis,
  .ce-form-grid {
    grid-template-columns: 1fr;
  }

  .ce-form-grid label.wide {
    grid-column: auto;
  }
}
</style>
