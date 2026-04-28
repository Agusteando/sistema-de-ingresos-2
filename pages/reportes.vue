<template>
  <div class="reports-page">
    <section class="reports-heading">
      <div>
        <span class="section-kicker">Centro de reportes</span>
        <h2>Reportes operativos</h2>
        <p>Genera consultas puntuales sin mezclar el Corte de Caja con los reportes de conceptos.</p>
      </div>

      <div class="report-switcher" v-if="userRole === 'global'">
        <button type="button" :class="{ active: activeReport === 'concepto' }" @click="activeReport = 'concepto'">
          <LucideFileText :size="16" />
          Concepto
        </button>
        <button type="button" :class="{ active: activeReport === 'corte' }" @click="openCorte">
          <LucideReceipt :size="16" />
          Corte de caja
        </button>
      </div>
    </section>

    <section v-if="activeReport === 'concepto'" class="report-panel">
      <div class="panel-header">
        <div>
          <h3>Reporte por concepto</h3>
          <p>Selecciona un concepto del ciclo activo y revisa sus ingresos vigentes.</p>
        </div>
        <div class="panel-actions">
          <button class="btn btn-outline" type="button" @click="printConceptReport" :disabled="!conceptRows.length || loadingConceptReport">
            <LucidePrinter :size="16" />
            Imprimir
          </button>
          <button class="btn btn-outline" type="button" @click="exportConceptReport" :disabled="!conceptRows.length || loadingConceptReport">
            <LucideDownload :size="16" />
            CSV
          </button>
        </div>
      </div>

      <div class="filters-grid concept-filters">
        <div class="form-group m-0 concept-select">
          <label class="form-label">Concepto</label>
          <select v-model="filtrosConcepto.conceptoId" class="input-field" :disabled="loadingConceptos">
            <option value="">{{ loadingConceptos ? 'Cargando conceptos...' : 'Seleccione un concepto' }}</option>
            <option v-for="concepto in conceptos" :key="concepto.id" :value="String(concepto.id)">
              {{ concepto.concepto }} - ${{ Number(concepto.costo || 0).toFixed(2) }}
            </option>
          </select>
        </div>
        <div class="form-group m-0">
          <label class="form-label">Desde</label>
          <input type="date" v-model="filtrosConcepto.inicio" class="input-field">
        </div>
        <div class="form-group m-0">
          <label class="form-label">Hasta</label>
          <input type="date" v-model="filtrosConcepto.fin" class="input-field">
        </div>
        <div class="form-group m-0" v-if="canFilterPlantel">
          <label class="form-label">Plantel</label>
          <select v-model="filtrosConcepto.plantel" class="input-field">
            <option value="">Todos</option>
            <option v-for="p in PLANTELES_LIST" :key="p" :value="p">Plantel {{ p }}</option>
          </select>
        </div>
        <button class="btn btn-primary filter-button" type="button" @click="loadConceptReport" :disabled="loadingConceptReport || !filtrosConcepto.conceptoId">
          <LucideLoader2 v-if="loadingConceptReport" class="animate-spin" :size="16" />
          <LucideFilter v-else :size="16" />
          Generar
        </button>
      </div>

      <div class="summary-grid">
        <div class="metric-card">
          <span>Total</span>
          <strong>${{ Number(conceptSummary.total || 0).toFixed(2) }}</strong>
        </div>
        <div class="metric-card">
          <span>Movimientos</span>
          <strong>{{ conceptSummary.transacciones || 0 }}</strong>
        </div>
        <div class="metric-card">
          <span>Alumnos</span>
          <strong>{{ conceptSummary.alumnos || 0 }}</strong>
        </div>
        <div class="metric-card muted">
          <span>Concepto</span>
          <strong>{{ selectedConceptName }}</strong>
        </div>
      </div>

      <div class="report-split">
        <div class="card table-wrapper report-table">
          <table>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Fecha</th>
                <th>Matrícula</th>
                <th>Alumno</th>
                <th>Mes</th>
                <th>Forma de pago</th>
                <th class="text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loadingConceptReport">
                <td colspan="7" class="text-center py-12 text-gray-500 font-medium">Generando reporte...</td>
              </tr>
              <tr v-else-if="!filtrosConcepto.conceptoId">
                <td colspan="7" class="text-center py-12 text-gray-400">Selecciona un concepto para generar el reporte.</td>
              </tr>
              <tr v-else-if="!conceptRows.length">
                <td colspan="7" class="text-center py-12 text-gray-400">No hay ingresos vigentes para este concepto.</td>
              </tr>
              <tr v-else v-for="row in conceptRows" :key="row.folio">
                <td class="font-mono text-gray-500">{{ row.folio }}</td>
                <td>{{ formatDate(row.fecha) }}</td>
                <td class="font-mono text-gray-600">{{ row.matricula }}</td>
                <td class="font-semibold text-gray-800">{{ row.nombreCompleto }}</td>
                <td>{{ row.mesReal || row.mes }}</td>
                <td><span class="badge bg-blue-50 text-blue-700">{{ row.formaDePago }}</span></td>
                <td class="text-right font-bold font-mono text-brand-campus">${{ Number(row.monto || 0).toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <aside class="breakdown-panel">
          <h4>Desglose</h4>
          <div v-if="conceptSummary.formasPago?.length" class="breakdown-list">
            <div v-for="item in conceptSummary.formasPago" :key="item.formaDePago">
              <span>{{ item.formaDePago }}</span>
              <strong>${{ Number(item.total || 0).toFixed(2) }}</strong>
            </div>
          </div>
          <p v-else>No hay movimientos para desglosar.</p>

          <template v-if="canFilterPlantel && conceptSummary.planteles?.length">
            <h4 class="mt-5">Planteles</h4>
            <div class="breakdown-list">
              <div v-for="item in conceptSummary.planteles" :key="item.plantel">
                <span>{{ item.plantel }}</span>
                <strong>${{ Number(item.total || 0).toFixed(2) }}</strong>
              </div>
            </div>
          </template>
        </aside>
      </div>
    </section>

    <section v-else class="report-panel">
      <div class="panel-header">
        <div>
          <h3>Corte de caja</h3>
          <p>Bitácora de ingresos vigente para cierre operativo.</p>
        </div>
        <div class="panel-actions">
          <button class="btn btn-outline" @click="printCorte" :disabled="loadingCorte">
            <LucidePrinter :size="16" />
            Imprimir
          </button>
        </div>
      </div>

      <div class="filters-grid">
        <div class="form-group m-0">
          <label class="form-label">Apertura</label>
          <input type="date" v-model="filtrosCorte.inicio" class="input-field">
        </div>
        <div class="form-group m-0">
          <label class="form-label">Cierre</label>
          <input type="date" v-model="filtrosCorte.fin" class="input-field">
        </div>
        <div class="form-group m-0" v-if="canFilterPlantel">
          <label class="form-label">Plantel</label>
          <select v-model="filtrosCorte.plantel" class="input-field">
            <option value="">Todos</option>
            <option v-for="p in PLANTELES_LIST" :key="p" :value="p">Plantel {{ p }}</option>
          </select>
        </div>
        <button class="btn btn-secondary filter-button" @click="loadCorte" :disabled="loadingCorte">
          <LucideLoader2 v-if="loadingCorte" class="animate-spin" :size="16" />
          <LucideFilter v-else :size="16" />
          Ejecutar
        </button>
      </div>

      <div class="card table-wrapper">
        <div class="corte-total">
          <h3>Bitácora de ingresos</h3>
          <div>Cierre: ${{ totalCorte.toFixed(2) }}</div>
        </div>
        <table class="w-full">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Concepto / Tarifa</th>
              <th>Vía de ingreso</th>
              <th class="text-right">Trx</th>
              <th class="text-right">Flujo (MXN)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loadingCorte">
              <td colspan="5" class="text-center font-medium text-gray-500 py-12">Procesando...</td>
            </tr>
            <tr v-else-if="!datosCorte.length">
              <td colspan="5" class="text-center text-gray-400 py-12">No hay resultados en el periodo.</td>
            </tr>
            <tr v-else v-for="(row, idx) in datosCorte" :key="idx" class="cursor-context-menu" @contextmenu.prevent="showCorteContextMenu($event, row)">
              <td class="text-gray-600">{{ formatDate(row.fecha) }}</td>
              <td class="font-semibold text-gray-800">{{ row.categoria }}</td>
              <td><span class="badge bg-blue-50 text-blue-700">{{ row.formaDePago }}</span></td>
              <td class="text-right font-semibold text-gray-600">{{ row.transacciones }}</td>
              <td class="text-right font-bold text-brand-campus font-mono">${{ Number(row.total).toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useCookie, useState } from '#app'
import {
  LucideDownload,
  LucideFileText,
  LucideFilter,
  LucideLoader2,
  LucidePrinter,
  LucideReceipt
} from 'lucide-vue-next'
import { PLANTELES_LIST } from '~/utils/constants'
import { exportToCSV } from '~/utils/export'
import { useContextMenu } from '~/composables/useContextMenu'
import { useToast } from '~/composables/useToast'
import { normalizeCicloKey } from '~/shared/utils/ciclo'

const state = useState('globalState')
const route = useRoute()
const { openMenu } = useContextMenu()
const { show } = useToast()

const userRole = ref(useCookie('auth_role').value || 'plantel')
const activePlantel = ref(useCookie('auth_active_plantel').value || '')
const canFilterPlantel = computed(() => userRole.value === 'global' && activePlantel.value === 'GLOBAL')
const activeReport = ref(route.query.tipo === 'corte' && userRole.value === 'global' ? 'corte' : 'concepto')

const conceptos = ref([])
const loadingConceptos = ref(false)
const loadingConceptReport = ref(false)
const filtrosConcepto = ref({
  conceptoId: route.query.conceptoId ? String(route.query.conceptoId) : '',
  inicio: '',
  fin: '',
  plantel: ''
})
const emptyConceptReport = () => ({
  concepto: null,
  rows: [],
  resumen: {
    total: 0,
    transacciones: 0,
    alumnos: 0,
    formasPago: [],
    planteles: []
  }
})
const conceptReport = ref(emptyConceptReport())

const filtrosCorte = ref({ inicio: '', fin: '', plantel: '' })
const datosCorte = ref([])
const loadingCorte = ref(false)

const conceptRows = computed(() => conceptReport.value.rows || [])
const conceptSummary = computed(() => conceptReport.value.resumen || emptyConceptReport().resumen)
const selectedConcept = computed(() => {
  return conceptos.value.find(concepto => String(concepto.id) === String(filtrosConcepto.value.conceptoId)) || conceptReport.value.concepto
})
const selectedConceptName = computed(() => selectedConcept.value?.concepto || 'Sin selección')
const totalCorte = computed(() => datosCorte.value.reduce((sum, row) => sum + Number(row.total), 0))

const formatDate = (value) => {
  if (!value) return ''
  return new Date(value).toLocaleDateString('es-MX')
}

const buildParams = (source) => {
  const params = {
    ciclo: normalizeCicloKey(state.value.ciclo)
  }

  Object.entries(source).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) params[key] = String(value)
  })

  if (!canFilterPlantel.value) delete params.plantel
  return params
}

const safeFileName = (value) => String(value || 'concepto')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '_')
  .replace(/^_+|_+$/g, '')

const loadConceptos = async () => {
  loadingConceptos.value = true
  try {
    conceptos.value = await $fetch('/api/conceptos', {
      params: { ciclo: normalizeCicloKey(state.value.ciclo) }
    })
  } catch (e) {
    show('No se pudieron cargar los conceptos', 'danger')
  } finally {
    loadingConceptos.value = false
  }
}

const loadConceptReport = async () => {
  if (!filtrosConcepto.value.conceptoId) return show('Seleccione un concepto', 'danger')

  loadingConceptReport.value = true
  try {
    conceptReport.value = await $fetch('/api/reports/concepto', {
      params: buildParams(filtrosConcepto.value)
    })
  } catch (e) {
    show(e?.data?.message || 'No se pudo generar el reporte por concepto', 'danger')
  } finally {
    loadingConceptReport.value = false
  }
}

const printConceptReport = () => {
  if (!filtrosConcepto.value.conceptoId) return
  const q = new URLSearchParams(buildParams(filtrosConcepto.value)).toString()
  window.open(`/print/concepto?${q}`, '_blank', 'width=920,height=820')
}

const exportConceptReport = () => {
  if (!conceptRows.value.length) return

  exportToCSV(
    `Reporte_concepto_${safeFileName(selectedConceptName.value)}_${normalizeCicloKey(state.value.ciclo)}.csv`,
    conceptRows.value.map(row => ({
      Folio: row.folio,
      Fecha: formatDate(row.fecha),
      Matricula: row.matricula,
      Alumno: row.nombreCompleto,
      Concepto: row.conceptoNombre,
      Mes: row.mesReal || row.mes,
      Forma_de_pago: row.formaDePago,
      Plantel: row.plantel,
      Monto_MXN: Number(row.monto || 0).toFixed(2)
    }))
  )
}

const openCorte = () => {
  activeReport.value = 'corte'
  if (!datosCorte.value.length) loadCorte()
}

const loadCorte = async () => {
  if (userRole.value !== 'global') return

  loadingCorte.value = true
  try {
    datosCorte.value = await $fetch('/api/reports/corte', {
      params: buildParams(filtrosCorte.value)
    })
  } catch (e) {
    show(e?.data?.message || 'No se pudo cargar el corte de caja', 'danger')
  } finally {
    loadingCorte.value = false
  }
}

const printCorte = () => {
  const q = new URLSearchParams(buildParams(filtrosCorte.value)).toString()
  window.open(`/print/corte?${q}`, '_blank', 'width=850,height=800')
}

const showCorteContextMenu = (event, row) => {
  openMenu(event, [
    { label: `Fila: $${Number(row.total).toFixed(2)}`, disabled: true },
    { label: '-' },
    { label: 'Imprimir corte', icon: LucidePrinter, action: printCorte }
  ])
}

onMounted(async () => {
  await loadConceptos()
  if (activeReport.value === 'corte') {
    loadCorte()
  } else if (filtrosConcepto.value.conceptoId) {
    loadConceptReport()
  }
})

watch(() => normalizeCicloKey(state.value.ciclo), async () => {
  conceptReport.value = emptyConceptReport()
  await loadConceptos()
  if (activeReport.value === 'corte') loadCorte()
})

watch(() => route.query.conceptoId, async (conceptoId) => {
  if (!conceptoId) return
  activeReport.value = 'concepto'
  filtrosConcepto.value.conceptoId = String(conceptoId)
  if (!conceptos.value.length) await loadConceptos()
  loadConceptReport()
})
</script>

<style scoped>
.reports-page {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 14px;
}

.reports-heading,
.report-panel {
  border: 1px solid #dfe6ef;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12px 30px rgba(22, 38, 65, 0.06);
}

.reports-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 18px;
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

.reports-heading h2,
.panel-header h3,
.corte-total h3 {
  margin: 0;
  color: #162641;
  font-weight: 850;
  letter-spacing: 0;
}

.reports-heading h2 {
  font-size: 1.18rem;
}

.reports-heading p,
.panel-header p {
  margin: 4px 0 0;
  color: #66728a;
  font-size: 0.82rem;
  font-weight: 520;
}

.report-switcher {
  display: inline-flex;
  height: 38px;
  overflow: hidden;
  border: 1px solid #dfe6ef;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(22, 38, 65, 0.04);
}

.report-switcher button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-right: 1px solid #edf2f7;
  background: transparent;
  color: #66728a;
  padding: 0 14px;
  font-size: 0.76rem;
  font-weight: 800;
  transition: background 160ms ease, color 160ms ease;
}

.report-switcher button:last-child {
  border-right: 0;
}

.report-switcher button.active {
  background: #eaf8e7;
  color: #2d6b31;
}

.report-panel {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border-bottom: 1px solid #edf2f7;
  padding: 14px 18px;
}

.panel-header h3,
.corte-total h3 {
  font-size: 1rem;
}

.panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filters-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr)) auto;
  gap: 12px;
  align-items: end;
  border-bottom: 1px solid #edf2f7;
  padding: 14px 18px;
}

.concept-filters {
  grid-template-columns: minmax(260px, 1.8fr) repeat(3, minmax(150px, 1fr)) auto;
}

.concept-select {
  min-width: 0;
}

.filter-button {
  align-self: end;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  padding: 14px 18px;
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

.metric-card span {
  display: block;
  color: #66728a;
  font-size: 0.66rem;
  font-weight: 820;
  text-transform: uppercase;
}

.metric-card strong {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: #162641;
  font-size: 1.06rem;
  font-weight: 850;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-split {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 14px;
  overflow: hidden;
  padding: 0 18px 18px;
}

.report-table {
  overflow: auto;
}

.breakdown-panel {
  align-self: start;
  border: 1px solid #dfe6ef;
  border-radius: 16px;
  background: #fff;
  padding: 15px;
}

.breakdown-panel h4 {
  margin: 0 0 10px;
  color: #162641;
  font-size: 0.8rem;
  font-weight: 850;
  text-transform: uppercase;
}

.breakdown-panel p {
  margin: 0;
  color: #66728a;
  font-size: 0.78rem;
  font-weight: 560;
}

.breakdown-list {
  display: grid;
  gap: 8px;
}

.breakdown-list div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid #edf2f7;
  padding-bottom: 8px;
}

.breakdown-list div:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.breakdown-list span {
  color: #66728a;
  font-size: 0.78rem;
  font-weight: 700;
}

.breakdown-list strong {
  color: #162641;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8rem;
}

.corte-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #edf2f7;
  padding: 14px 18px;
}

.corte-total div {
  border: 1px solid rgba(101, 167, 68, 0.18);
  border-radius: 12px;
  background: rgba(101, 167, 68, 0.1);
  color: #4e844e;
  padding: 7px 12px;
  font-size: 0.92rem;
  font-weight: 850;
}

@media (max-width: 1120px) {
  .filters-grid,
  .concept-filters,
  .summary-grid,
  .report-split {
    grid-template-columns: 1fr;
  }

  .reports-heading,
  .panel-header,
  .corte-total {
    align-items: flex-start;
    flex-direction: column;
  }

  .breakdown-panel {
    width: 100%;
  }
}
</style>
