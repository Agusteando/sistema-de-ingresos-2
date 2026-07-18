<template>
  <div class="letters-report-page">
    <section class="report-shell">
      <header class="report-header">
        <div class="report-heading">
          <span class="section-kicker">Evidencia existente</span>
          <h2>Historial de cartas de no adeudo</h2>
          <p>Descarga de las marcas que el sistema ya conserva en Control Escolar.</p>
        </div>

        <div class="header-actions">
          <button class="btn btn-outline" type="button" :disabled="loading" @click="loadReport">
            <LucideRefreshCw :size="16" :class="{ 'animate-spin': loading }" />
            Actualizar
          </button>
          <button class="btn btn-primary" type="button" :disabled="loading || !rows.length" @click="downloadReport">
            <LucideDownload :size="16" />
            Descargar Excel
          </button>
        </div>
      </header>

      <aside class="scope-notice" role="note">
        <LucideInfo :size="19" />
        <div>
          <strong>Alcance de este historial</strong>
          <p>
            Este reporte no crea controles nuevos ni modifica envíos. Sólo muestra las marcas existentes en
            <code>no_adeudo_deudor_cartas</code>, generadas históricamente cuando se forzó una carta para un alumno con adeudo.
            El nombre, nivel, grado, grupo y tutor son referencias actuales de matrícula y no una fotografía histórica del envío.
            El correo destinatario no se incluye porque nunca fue almacenado en esta marca.
          </p>
        </div>
      </aside>

      <form class="filters-grid" @submit.prevent="loadReport">
        <label class="filter-field search-field">
          <span>Buscar</span>
          <div class="input-with-icon">
            <LucideSearch :size="16" />
            <input v-model.trim="filters.search" type="search" placeholder="Alumno, matrícula, folio o responsable">
          </div>
        </label>

        <label class="filter-field">
          <span>Ciclo</span>
          <select v-model="filters.ciclo">
            <option value="">Todos los ciclos</option>
            <option v-for="ciclo in CICLOS_LIST" :key="ciclo.value" :value="ciclo.value">{{ ciclo.label }}</option>
          </select>
        </label>

        <label class="filter-field">
          <span>Desde</span>
          <input v-model="filters.inicio" type="date">
        </label>

        <label class="filter-field">
          <span>Hasta</span>
          <input v-model="filters.fin" type="date">
        </label>

        <label v-if="canFilterPlantel" class="filter-field">
          <span>Plantel</span>
          <select v-model="filters.plantel">
            <option value="">Todos</option>
            <option v-for="plantel in PLANTELES_LIST" :key="plantel" :value="plantel">Plantel {{ plantel }}</option>
          </select>
        </label>

        <button class="btn btn-secondary filter-button" type="submit" :disabled="loading">
          <LucideLoader2 v-if="loading" class="animate-spin" :size="16" />
          <LucideFilter v-else :size="16" />
          Consultar
        </button>
      </form>

      <div class="summary-grid">
        <article class="metric-card">
          <span>Marcas existentes</span>
          <strong>{{ summary.totalMarks }}</strong>
        </article>
        <article class="metric-card">
          <span>Alumnos marcados</span>
          <strong>{{ summary.students }}</strong>
        </article>
        <article class="metric-card">
          <span>Responsables</span>
          <strong>{{ summary.senders }}</strong>
        </article>
        <article class="metric-card">
          <span>Planteles</span>
          <strong>{{ summary.planteles }}</strong>
        </article>
        <article class="metric-card muted">
          <span>Última marca</span>
          <strong>{{ summary.lastMarkedAt ? formatDate(summary.lastMarkedAt) : 'Sin registros' }}</strong>
        </article>
      </div>

      <aside v-if="errorMessage" class="report-error" role="alert">
        <LucideCircleAlert :size="18" />
        <span>{{ errorMessage }}</span>
      </aside>

      <aside v-for="warning in warningMessages" :key="warning" class="report-warning" role="status">
        <LucideCircleAlert :size="18" />
        <span>{{ warning }}</span>
      </aside>

      <div class="table-card">
        <div class="table-meta">
          <div>
            <LucideHistory :size="17" />
            <strong>{{ scopeLabel }}</strong>
          </div>
          <span v-if="rows.length">Mostrando {{ visibleStart }}–{{ visibleEnd }} de {{ rows.length }}</span>
        </div>

        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha de marca</th>
                <th>Plantel</th>
                <th>Matrícula</th>
                <th>Alumno actual</th>
                <th>Nivel actual</th>
                <th>Grado actual</th>
                <th>Grupo actual</th>
                <th>Tutor actual</th>
                <th>Ciclo marcado</th>
                <th>Folio</th>
                <th>Registrado por</th>
                <th>Correo del responsable</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="12" class="empty-state">Cargando marcas existentes...</td>
              </tr>
              <tr v-else-if="!rows.length">
                <td colspan="12" class="empty-state">No hay marcas existentes con los filtros seleccionados.</td>
              </tr>
              <tr v-for="row in paginatedRows" v-else :key="`${row.plantel}-${row.matricula}-${row.ciclo}-${row.folio}`">
                <td class="date-cell">{{ formatDate(row.sentAt) }}</td>
                <td><span class="plantel-badge">{{ row.plantel || '—' }}</span></td>
                <td class="mono strong">{{ row.matricula || '—' }}</td>
                <td class="student-cell">{{ row.currentStudentName || 'Sin referencia actual' }}</td>
                <td>{{ row.currentNivel || '—' }}</td>
                <td>{{ row.currentGrado || '—' }}</td>
                <td>{{ row.currentGrupo || '—' }}</td>
                <td class="student-cell">{{ row.currentTutorName || '—' }}</td>
                <td>{{ row.ciclo || '—' }}</td>
                <td class="mono">{{ row.folio || '—' }}</td>
                <td>{{ row.sentByName || 'Sin nombre registrado' }}</td>
                <td class="email-cell">{{ row.sentByEmail || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer v-if="totalPages > 1" class="pagination">
          <button type="button" :disabled="page <= 1" @click="page--">Anterior</button>
          <span>Página {{ page }} de {{ totalPages }}</span>
          <button type="button" :disabled="page >= totalPages" @click="page++">Siguiente</button>
        </footer>
      </div>
    </section>
  </div>
</template>

<script setup>
import dayjs from 'dayjs'
import { computed, onMounted, ref, watch } from 'vue'
import {
  LucideCircleAlert,
  LucideDownload,
  LucideFilter,
  LucideHistory,
  LucideInfo,
  LucideLoader2,
  LucideRefreshCw,
  LucideSearch
} from 'lucide-vue-next'
import { useCookie } from '#app'
import { CICLOS_LIST, PLANTELES_LIST } from '~/utils/constants'
import { exportToExcel } from '~/utils/export'
import { resolveClientAuthAccess } from '~/utils/authAccess'

const PAGE_SIZE = 50
const role = useCookie('auth_role')
const activePlantel = useCookie('auth_active_plantel')
const access = computed(() => resolveClientAuthAccess({ role: role.value }))
const canFilterPlantel = computed(() => access.value.isSuperAdmin && activePlantel.value === 'GLOBAL')

const filters = ref({
  search: '',
  ciclo: '',
  inicio: '',
  fin: '',
  plantel: ''
})
const rows = ref([])
const summary = ref({ totalMarks: 0, students: 0, senders: 0, planteles: 0, lastMarkedAt: '' })
const reportScope = ref({ plantel: activePlantel.value || '', canFilterPlantel: false })
const loading = ref(false)
const errorMessage = ref('')
const warningMessages = ref([])
const page = ref(1)

const totalPages = computed(() => Math.max(1, Math.ceil(rows.value.length / PAGE_SIZE)))
const paginatedRows = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return rows.value.slice(start, start + PAGE_SIZE)
})
const visibleStart = computed(() => rows.value.length ? ((page.value - 1) * PAGE_SIZE) + 1 : 0)
const visibleEnd = computed(() => Math.min(page.value * PAGE_SIZE, rows.value.length))
const scopeLabel = computed(() => reportScope.value.plantel === 'GLOBAL'
  ? 'Todos los planteles financieros autorizados'
  : `Plantel ${reportScope.value.plantel || activePlantel.value || '—'}`)

watch(rows, () => { page.value = 1 })
watch(totalPages, (value) => {
  if (page.value > value) page.value = value
})

const formatDate = (value) => {
  if (!value) return '—'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('DD/MM/YYYY HH:mm') : String(value)
}

const loadReport = async () => {
  loading.value = true
  errorMessage.value = ''
  warningMessages.value = []
  try {
    const response = await $fetch('/api/reports/no-adeudo', {
      query: {
        search: filters.value.search || undefined,
        ciclo: filters.value.ciclo || undefined,
        inicio: filters.value.inicio || undefined,
        fin: filters.value.fin || undefined,
        plantel: canFilterPlantel.value ? (filters.value.plantel || undefined) : undefined
      }
    })
    rows.value = Array.isArray(response?.rows) ? response.rows : []
    summary.value = response?.summary || summary.value
    reportScope.value = response?.scope || reportScope.value
    warningMessages.value = Array.isArray(response?.warnings) ? response.warnings : []
  } catch (error) {
    rows.value = []
    summary.value = { totalMarks: 0, students: 0, senders: 0, planteles: 0, lastMarkedAt: '' }
    errorMessage.value = error?.data?.message || error?.message || 'No se pudo cargar el historial de marcas.'
  } finally {
    loading.value = false
  }
}

const downloadReport = () => {
  const exportRows = rows.value.map((row) => ({
    'Fecha de marca': formatDate(row.sentAt),
    Plantel: row.plantel || '',
    Matrícula: row.matricula || '',
    'Alumno actual': row.currentStudentName || '',
    'Nivel actual': row.currentNivel || '',
    'Grado actual': row.currentGrado || '',
    'Grupo actual': row.currentGrupo || '',
    'Tutor actual': row.currentTutorName || '',
    'Ciclo marcado': row.ciclo || '',
    Folio: row.folio || '',
    'Registrado por': row.sentByName || '',
    'Correo del responsable': row.sentByEmail || '',
    Fuente: 'Marca existente no_adeudo_deudor_cartas'
  }))
  const dateSuffix = dayjs().format('YYYY-MM-DD')
  const scopeSuffix = reportScope.value.plantel === 'GLOBAL'
    ? 'todos-planteles'
    : `plantel-${reportScope.value.plantel || 'sin-plantel'}`

  exportToExcel(`historial-marcas-cartas-no-adeudo-${scopeSuffix}-${dateSuffix}.xls`, exportRows, {
    title: 'Historial de marcas de cartas de no adeudo',
    subtitle: `${scopeLabel.value} · ${rows.value.length} marcas existentes · Reporte de sólo lectura`,
    sheetName: 'Marcas existentes',
    columns: [
      { key: 'Fecha de marca', label: 'Fecha de marca' },
      { key: 'Plantel', label: 'Plantel' },
      { key: 'Matrícula', label: 'Matrícula' },
      { key: 'Alumno actual', label: 'Alumno actual' },
      { key: 'Nivel actual', label: 'Nivel actual' },
      { key: 'Grado actual', label: 'Grado actual' },
      { key: 'Grupo actual', label: 'Grupo actual' },
      { key: 'Tutor actual', label: 'Tutor actual' },
      { key: 'Ciclo marcado', label: 'Ciclo marcado' },
      { key: 'Folio', label: 'Folio' },
      { key: 'Registrado por', label: 'Registrado por' },
      { key: 'Correo del responsable', label: 'Correo del responsable' },
      { key: 'Fuente', label: 'Fuente' }
    ]
  })
}

onMounted(loadReport)
</script>

<style scoped>
.letters-report-page {
  min-height: 0;
  height: 100%;
  padding: 18px;
}

.report-shell {
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #dfe6ef;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 14px 35px rgba(22, 38, 65, 0.06);
}

.report-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid #edf2f7;
  padding: 18px 20px;
}

.section-kicker {
  display: block;
  margin-bottom: 4px;
  color: #3f7e36;
  font-size: 0.66rem;
  font-weight: 850;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.report-heading h2 {
  margin: 0;
  color: #162641;
  font-size: 1.2rem;
  font-weight: 850;
}

.report-heading p {
  margin: 4px 0 0;
  color: #66728a;
  font-size: 0.82rem;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.scope-notice {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  border-bottom: 1px solid #e7edf4;
  background: #f7fafc;
  color: #40506a;
  padding: 14px 20px;
}

.scope-notice svg {
  flex: 0 0 auto;
  margin-top: 2px;
  color: #477742;
}

.scope-notice strong {
  color: #20334f;
  font-size: 0.82rem;
}

.scope-notice p {
  margin: 4px 0 0;
  max-width: 1100px;
  font-size: 0.76rem;
  line-height: 1.5;
}

.scope-notice code {
  border-radius: 5px;
  background: #e8eef5;
  padding: 1px 4px;
  color: #253750;
}

.filters-grid {
  display: grid;
  grid-template-columns: minmax(240px, 1.5fr) repeat(4, minmax(145px, 0.8fr)) auto;
  gap: 12px;
  align-items: end;
  border-bottom: 1px solid #edf2f7;
  padding: 14px 20px;
}

.filter-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.filter-field > span {
  color: #526077;
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
}

.filter-field input,
.filter-field select {
  width: 100%;
  height: 40px;
  border: 1px solid #d9e2ec;
  border-radius: 11px;
  background: #fff;
  color: #162641;
  padding: 0 11px;
  outline: none;
}

.filter-field input:focus,
.filter-field select:focus {
  border-color: #6da361;
  box-shadow: 0 0 0 3px rgba(109, 163, 97, 0.12);
}

.input-with-icon {
  position: relative;
}

.input-with-icon svg {
  position: absolute;
  top: 12px;
  left: 11px;
  color: #8390a5;
}

.input-with-icon input {
  padding-left: 36px;
}

.filter-button {
  height: 40px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(145px, 1fr));
  gap: 10px;
  border-bottom: 1px solid #edf2f7;
  padding: 13px 20px;
}

.metric-card {
  display: grid;
  gap: 4px;
  min-height: 70px;
  align-content: center;
  border: 1px solid #e2e9f0;
  border-radius: 13px;
  background: #fbfdfb;
  padding: 11px 13px;
}

.metric-card span {
  color: #6d788b;
  font-size: 0.68rem;
  font-weight: 750;
  text-transform: uppercase;
}

.metric-card strong {
  overflow: hidden;
  color: #1e3425;
  font-size: 1.05rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-card.muted {
  background: #f8fafc;
}

.report-error,
.report-warning {
  display: flex;
  gap: 9px;
  align-items: center;
  margin: 12px 20px 0;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.78rem;
}

.report-error {
  border: 1px solid #efc7c7;
  background: #fff5f5;
  color: #9f2f2f;
}

.report-warning {
  border: 1px solid #ead9aa;
  background: #fff9e9;
  color: #775a13;
}

.table-card {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  margin: 14px 20px 20px;
  overflow: hidden;
  border: 1px solid #e1e8ef;
  border-radius: 14px;
}

.table-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #e8edf3;
  background: #fbfcfd;
  color: #66728a;
  padding: 10px 13px;
  font-size: 0.74rem;
}

.table-meta > div {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #293d58;
}

.table-scroll {
  min-height: 0;
  flex: 1;
  overflow: auto;
}

table {
  width: 100%;
  min-width: 1520px;
  border-collapse: collapse;
}

th,
td {
  border-bottom: 1px solid #edf1f5;
  padding: 10px 11px;
  text-align: left;
  vertical-align: top;
  font-size: 0.75rem;
}

th {
  position: sticky;
  z-index: 1;
  top: 0;
  background: #f4f7f9;
  color: #536077;
  font-size: 0.67rem;
  font-weight: 850;
  letter-spacing: 0.025em;
  text-transform: uppercase;
}

tbody tr:hover {
  background: #fbfdfb;
}

.empty-state {
  height: 150px;
  color: #8290a3;
  text-align: center;
  vertical-align: middle;
}

.plantel-badge {
  display: inline-flex;
  border-radius: 999px;
  background: #edf4ec;
  color: #37623a;
  padding: 3px 8px;
  font-weight: 800;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.strong {
  color: #253750;
  font-weight: 800;
}

.student-cell {
  min-width: 190px;
  color: #263a55;
  font-weight: 650;
}

.email-cell {
  min-width: 190px;
  word-break: break-word;
}

.date-cell {
  min-width: 132px;
  white-space: nowrap;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  border-top: 1px solid #e6ebf0;
  background: #fbfcfd;
  padding: 9px;
  color: #5f6d82;
  font-size: 0.75rem;
}

.pagination button {
  border: 1px solid #d8e0e8;
  border-radius: 8px;
  background: #fff;
  padding: 6px 10px;
  color: #31445f;
  font-weight: 750;
}

.pagination button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (max-width: 1180px) {
  .filters-grid {
    grid-template-columns: repeat(3, minmax(150px, 1fr));
  }

  .search-field {
    grid-column: span 2;
  }

  .summary-grid {
    grid-template-columns: repeat(3, minmax(140px, 1fr));
  }
}

@media (max-width: 760px) {
  .letters-report-page {
    padding: 10px;
  }

  .report-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
  }

  .header-actions .btn {
    flex: 1;
  }

  .filters-grid,
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .search-field {
    grid-column: auto;
  }

  .table-card {
    margin: 10px;
  }
}
</style>
