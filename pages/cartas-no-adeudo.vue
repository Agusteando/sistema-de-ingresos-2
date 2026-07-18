<template>
  <div class="letters-report-page">
    <section class="report-shell">
      <header class="report-header">
        <div class="report-heading">
          <span class="section-kicker">Control de envíos</span>
          <h2>Cartas de no adeudo enviadas</h2>
          <p>Consulta y descarga el historial completo disponible de cada envío exitoso.</p>
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

      <form class="filters-grid" @submit.prevent="loadReport">
        <label class="filter-field search-field">
          <span>Buscar</span>
          <div class="input-with-icon">
            <LucideSearch :size="16" />
            <input v-model.trim="filters.search" type="search" placeholder="Alumno, matrícula, destinatario, folio o responsable">
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
          <span>Cartas registradas</span>
          <strong>{{ summary.total }}</strong>
        </article>
        <article class="metric-card">
          <span>Alumnos</span>
          <strong>{{ summary.students }}</strong>
        </article>
        <article class="metric-card">
          <span>Destinatarios únicos</span>
          <strong>{{ summary.recipients }}</strong>
        </article>
        <article class="metric-card warning" :title="summary.incomplete ? 'Estos envíos son anteriores al historial detallado y no conservan el correo destino exacto.' : ''">
          <span>Registros anteriores incompletos</span>
          <strong>{{ summary.incomplete }}</strong>
        </article>
        <article class="metric-card muted">
          <span>Último envío</span>
          <strong>{{ summary.lastSentAt ? formatDate(summary.lastSentAt) : 'Sin registros' }}</strong>
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
            <LucideFileCheck2 :size="17" />
            <strong>{{ scopeLabel }}</strong>
          </div>
          <span v-if="rows.length">Mostrando {{ visibleStart }}–{{ visibleEnd }} de {{ rows.length }}</span>
        </div>

        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Estado</th>
                <th>Fecha de envío</th>
                <th>Plantel</th>
                <th>Matrícula</th>
                <th>Nombre del alumno</th>
                <th>Nivel</th>
                <th>Grado</th>
                <th>Grupo</th>
                <th>Padre / tutor</th>
                <th>Ciclo</th>
                <th>Correo(s) destino</th>
                <th>Tipo de destinatario</th>
                <th>Condición al enviar</th>
                <th>Folio</th>
                <th>Enviado por</th>
                <th>Correo del responsable</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="16" class="empty-state">Cargando reporte...</td>
              </tr>
              <tr v-else-if="!rows.length">
                <td colspan="16" class="empty-state">No hay cartas registradas con los filtros seleccionados.</td>
              </tr>
              <tr v-for="row in paginatedRows" v-else :key="row.id || `${row.plantel}-${row.matricula}-${row.ciclo}-${row.folio}`">
                <td>
                  <span class="sent-badge"><LucideCheck :size="13" /> Enviada</span>
                  <small v-if="!row.recipientDataExact" class="legacy-note">Registro anterior</small>
                </td>
                <td class="date-cell">{{ formatDate(row.sentAt) }}</td>
                <td><span class="plantel-badge">{{ row.plantel || '—' }}</span></td>
                <td class="mono strong">{{ row.matricula || '—' }}</td>
                <td class="student-cell">{{ row.studentName || 'Sin nombre disponible' }}</td>
                <td>{{ row.nivel || '—' }}</td>
                <td>{{ row.grado || '—' }}</td>
                <td>{{ row.grupo || '—' }}</td>
                <td class="student-cell">{{ row.tutorName || '—' }}</td>
                <td>{{ row.ciclo || '—' }}</td>
                <td class="recipient-cell">
                  <template v-if="row.recipientEmails?.length">
                    <span v-for="email in row.recipientEmails" :key="email">{{ email }}</span>
                  </template>
                  <em v-else-if="!row.recipientDataExact">No registrado en el envío anterior</em>
                  <em v-else>Sin correo registrado</em>
                </td>
                <td>{{ row.recipientModeLabel || (row.recipientDataExact ? '—' : 'No registrado') }}</td>
                <td>
                  <span v-if="row.hadDebt === true" class="debt-badge debt-badge--warning">Con adeudo · {{ formatMoney(row.debtTotal) }}</span>
                  <span v-else-if="row.hadDebt === false" class="debt-badge">Sin adeudo</span>
                  <span v-else class="muted-value">No registrado</span>
                </td>
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
  LucideCheck,
  LucideCircleAlert,
  LucideDownload,
  LucideFileCheck2,
  LucideFilter,
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
const summary = ref({ total: 0, students: 0, senders: 0, recipients: 0, planteles: 0, incomplete: 0, lastSentAt: '' })
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
  ? 'Todos los planteles autorizados'
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

const formatMoney = (value) => Number(value || 0).toLocaleString('es-MX', {
  style: 'currency',
  currency: 'MXN'
})

const loadReport = async () => {
  loading.value = true
  errorMessage.value = ''
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
    summary.value = response?.summary || { total: 0, students: 0, senders: 0, recipients: 0, planteles: 0, incomplete: 0, lastSentAt: '' }
    reportScope.value = response?.scope || reportScope.value
    warningMessages.value = Array.isArray(response?.warnings) ? response.warnings : []
  } catch (error) {
    rows.value = []
    summary.value = { total: 0, students: 0, senders: 0, recipients: 0, planteles: 0, incomplete: 0, lastSentAt: '' }
    warningMessages.value = []
    errorMessage.value = error?.data?.message || error?.message || 'No se pudo cargar el reporte de cartas enviadas.'
  } finally {
    loading.value = false
  }
}

const downloadReport = () => {
  const exportRows = rows.value.map((row) => ({
    Estado: 'Enviada',
    'Fecha de envío': formatDate(row.sentAt),
    Plantel: row.plantel || '',
    Matrícula: row.matricula || '',
    'Nombre del alumno': row.studentName || '',
    Nivel: row.nivel || '',
    Grado: row.grado || '',
    Grupo: row.grupo || '',
    'Padre / tutor': row.tutorName || '',
    Ciclo: row.ciclo || '',
    'Correo(s) destino': row.recipientEmails?.join('; ') || (row.recipientDataExact ? '' : 'No registrado en el envío anterior'),
    'Tipo de destinatario': row.recipientModeLabel || (row.recipientDataExact ? '' : 'No registrado'),
    'Condición al enviar': row.hadDebt === true ? 'Con adeudo' : (row.hadDebt === false ? 'Sin adeudo' : 'No registrado'),
    'Adeudo al enviar': row.debtTotal === null || row.debtTotal === undefined ? '' : formatMoney(row.debtTotal),
    Folio: row.folio || '',
    'Enviado por': row.sentByName || '',
    'Correo del responsable': row.sentByEmail || '',
    'Integridad del registro': row.recipientDataExact ? 'Completo' : 'Registro anterior incompleto'
  }))
  const dateSuffix = dayjs().format('YYYY-MM-DD')
  const scopeSuffix = reportScope.value.plantel === 'GLOBAL' ? 'todos-planteles' : `plantel-${reportScope.value.plantel || 'sin-plantel'}`
  exportToExcel(`cartas-no-adeudo-${scopeSuffix}-${dateSuffix}.xls`, exportRows, {
    title: 'Cartas de no adeudo enviadas',
    subtitle: `${scopeLabel.value} · ${rows.value.length} envíos`,
    sheetName: 'Cartas enviadas',
    columns: [
      { key: 'Estado', label: 'Estado' },
      { key: 'Fecha de envío', label: 'Fecha de envío' },
      { key: 'Plantel', label: 'Plantel' },
      { key: 'Matrícula', label: 'Matrícula' },
      { key: 'Nombre del alumno', label: 'Nombre del alumno' },
      { key: 'Nivel', label: 'Nivel' },
      { key: 'Grado', label: 'Grado' },
      { key: 'Grupo', label: 'Grupo' },
      { key: 'Padre / tutor', label: 'Padre / tutor' },
      { key: 'Ciclo', label: 'Ciclo' },
      { key: 'Correo(s) destino', label: 'Correo(s) destino' },
      { key: 'Tipo de destinatario', label: 'Tipo de destinatario' },
      { key: 'Condición al enviar', label: 'Condición al enviar' },
      { key: 'Adeudo al enviar', label: 'Adeudo al enviar' },
      { key: 'Folio', label: 'Folio' },
      { key: 'Enviado por', label: 'Enviado por' },
      { key: 'Correo del responsable', label: 'Correo del responsable' },
      { key: 'Integridad del registro', label: 'Integridad del registro' }
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
  left: 12px;
  color: #8390a3;
}

.input-with-icon input {
  padding-left: 37px;
}

.filter-button {
  min-height: 40px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  padding: 14px 20px;
}

.metric-card {
  min-width: 0;
  border: 1px solid #dfe6ef;
  border-radius: 14px;
  background: linear-gradient(135deg, #ffffff, #f8fcf6);
  padding: 13px 14px;
}

.metric-card.muted {
  background: linear-gradient(135deg, #ffffff, #f7fbff);
}

.metric-card.warning {
  border-color: #f2d7a0;
  background: linear-gradient(135deg, #ffffff, #fff9ed);
}

.metric-card span {
  display: block;
  color: #66728a;
  font-size: 0.66rem;
  font-weight: 820;
  text-transform: uppercase;
}

.metric-card strong {
  display: block;
  overflow: hidden;
  color: #162641;
  font-size: 1.05rem;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-error {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 20px 14px;
  border: 1px solid #fecaca;
  border-radius: 12px;
  background: #fff7f7;
  color: #b42318;
  padding: 10px 12px;
  font-size: 0.8rem;
  font-weight: 700;
}

.report-warning {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 20px 14px;
  border: 1px solid #f2d7a0;
  border-radius: 12px;
  background: #fff9ed;
  color: #8a5a0a;
  padding: 10px 12px;
  font-size: 0.8rem;
  font-weight: 700;
}

.table-card {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  margin: 0 20px 20px;
  overflow: hidden;
  border: 1px solid #dfe6ef;
  border-radius: 15px;
}

.table-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #edf2f7;
  background: #fbfcfd;
  padding: 10px 13px;
  color: #66728a;
  font-size: 0.75rem;
}

.table-meta div {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #30405b;
}

.table-scroll {
  min-height: 0;
  flex: 1;
  overflow: auto;
}

table {
  width: 100%;
  min-width: 2380px;
  border-collapse: collapse;
  font-size: 0.78rem;
}

th {
  position: sticky;
  top: 0;
  z-index: 1;
  border-bottom: 1px solid #dfe6ef;
  background: #f6f9fb;
  color: #526077;
  padding: 11px 12px;
  text-align: left;
  text-transform: uppercase;
  font-size: 0.65rem;
  letter-spacing: 0.035em;
}

td {
  border-bottom: 1px solid #edf2f7;
  color: #344158;
  padding: 10px 12px;
  white-space: nowrap;
}

tbody tr:hover td {
  background: #fbfdfb;
}

.sent-badge,
.plantel-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 0.68rem;
  font-weight: 850;
}

.sent-badge {
  background: #eaf8e7;
  color: #2d6b31;
}

.plantel-badge {
  background: #eef4fb;
  color: #355a7d;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.strong {
  color: #162641;
  font-weight: 800;
}

.date-cell,
.email-cell {
  color: #5e6b80;
}

.student-cell {
  min-width: 210px;
  max-width: 300px;
  white-space: normal;
}

.recipient-cell {
  min-width: 250px;
  max-width: 340px;
  white-space: normal;
}

.recipient-cell span {
  display: block;
  color: #42536d;
  line-height: 1.45;
}

.recipient-cell em,
.muted-value,
.legacy-note {
  color: #8792a5;
  font-style: normal;
}

.legacy-note {
  display: block;
  margin-top: 5px;
  font-size: 0.65rem;
  font-weight: 750;
}

.debt-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: #eef7ec;
  color: #356a31;
  padding: 4px 8px;
  font-size: 0.68rem;
  font-weight: 800;
}

.debt-badge--warning {
  background: #fff3df;
  color: #9a5b00;
}

.empty-state {
  height: 180px;
  color: #8792a5;
  text-align: center;
  font-weight: 650;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid #edf2f7;
  background: #fbfcfd;
  padding: 9px 12px;
  color: #66728a;
  font-size: 0.75rem;
  font-weight: 750;
}

.pagination button {
  border: 1px solid #d9e2ec;
  border-radius: 9px;
  background: #fff;
  color: #30405b;
  padding: 6px 10px;
  font-weight: 750;
}

.pagination button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (max-width: 1220px) {
  .filters-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .search-field {
    grid-column: span 2;
  }
}

@media (max-width: 820px) {
  .letters-report-page {
    padding: 10px;
  }

  .report-header,
  .filters-grid,
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .report-header,
  .header-actions,
  .table-meta {
    align-items: flex-start;
    flex-direction: column;
  }

  .header-actions,
  .header-actions .btn {
    width: 100%;
  }

  .summary-grid {
    display: grid;
  }

  .search-field {
    grid-column: auto;
  }
}
</style>
