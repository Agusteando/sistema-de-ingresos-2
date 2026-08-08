<template>
  <div class="reports-page">
    <section class="reports-heading">
      <h2>Reportes</h2>

      <div class="report-switcher" v-if="hasFinancialAccess">
        <button type="button" :class="{ active: activeReport === 'concepto' }" @click="activeReport = 'concepto'">
          <LucideFileText :size="16" />
          Concepto
        </button>
        <button type="button" :class="{ active: activeReport === 'corte' }" @click="openCorte">
          <LucideReceipt :size="16" />
          Corte de caja
        </button>
        <button type="button" :class="{ active: activeReport === 'recibos' }" @click="activeReport = 'recibos'">
          <LucidePrinter :size="16" />
          Recibos
        </button>
      </div>
    </section>

    <section v-if="activeReport === 'concepto'" class="report-panel">
      <div class="panel-header">
        <h3>Reporte por concepto</h3>
        <div class="panel-actions">
          <button class="btn btn-outline" type="button" @click="printConceptReport" :disabled="!conceptRows.length || loadingConceptReport">
            <LucidePrinter :size="16" />
            Imprimir
          </button>
          <button class="btn btn-outline" type="button" @click="exportConceptReport" :disabled="!conceptRows.length || loadingConceptReport || downloadingConceptExcel">
            <LucideLoader2 v-if="downloadingConceptExcel" class="animate-spin" :size="16" />
            <LucideDownload v-else :size="16" />
            Excel
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
                <th>Grado</th>
                <th>Mes</th>
                <th>Forma de pago</th>
                <th class="text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loadingConceptReport">
                <td colspan="8" class="text-center py-12 text-gray-500 font-medium">Generando reporte...</td>
              </tr>
              <tr v-else-if="!filtrosConcepto.conceptoId">
                <td colspan="8" class="text-center py-12 text-gray-400">Selecciona un concepto para generar el reporte.</td>
              </tr>
              <tr v-else-if="!conceptRows.length">
                <td colspan="8" class="text-center py-12 text-gray-400">No hay ingresos vigentes para este concepto.</td>
              </tr>
              <tr v-else v-for="row in conceptRows" :key="row.folio">
                <td class="font-mono text-gray-500">{{ row.folio }}</td>
                <td>{{ formatDate(row.fecha) }}</td>
                <td class="font-mono text-gray-600">{{ row.matricula }}</td>
                <td class="font-semibold text-gray-800">{{ row.nombreCompleto }}</td>
                <td>{{ row.grado || '—' }}</td>
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

    <section v-else-if="activeReport === 'corte'" class="report-panel">
      <div class="panel-header">
        <h3>Corte de caja</h3>
        <div class="panel-actions">
          <button class="btn btn-outline" @click="prepareCorteExcel" :disabled="loadingCorte || downloadingCorteExcel">
            <LucideLoader2 v-if="downloadingCorteExcel" class="animate-spin" :size="16" />
            <LucideDownload v-else :size="16" />
            Excel
          </button>
          <button class="btn btn-outline" @click="printCorte" :disabled="loadingCorte || downloadingCorteExcel">
            <LucidePrinter :size="16" />
            Imprimir
          </button>
        </div>
      </div>

      <div class="filters-grid corte-filters">
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
            <option value="" disabled>Seleccione un plantel</option>
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
          <div class="corte-total-values">
            <span>Registrado: ${{ totalRegistradoCorte.toFixed(2) }}</span>
            <strong>Cierre: ${{ totalCorte.toFixed(2) }}</strong>
          </div>
        </div>
        <table class="w-full">
          <thead>
            <tr>
              <th>Fecha efectiva del pago</th>
              <th>Concepto / Tarifa</th>
              <th>Vía de ingreso</th>
              <th>Estatus</th>
              <th class="text-right">Trx</th>
              <th class="text-right">Registrado (MXN)</th>
              <th class="text-right">Aplicado al corte (MXN)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loadingCorte">
              <td colspan="7" class="text-center font-medium text-gray-500 py-12">Procesando...</td>
            </tr>
            <tr v-else-if="!datosCorte.length">
              <td colspan="7" class="text-center text-gray-400 py-12">No hay movimientos registrados en el periodo.</td>
            </tr>
            <tr v-else v-for="(row, idx) in datosCorte" :key="idx" class="cursor-context-menu" @contextmenu.prevent="showCorteContextMenu($event, row)">
              <td class="text-gray-600">{{ formatDate(row.fecha) }}</td>
              <td class="font-semibold text-gray-800">{{ row.categoria }}</td>
              <td><span class="badge bg-blue-50 text-blue-700">{{ row.formaDePago }}</span></td>
              <td><span class="badge" :class="corteStatusClass(row.estatus)">{{ row.estatus }}</span></td>
              <td class="text-right font-semibold text-gray-600">{{ row.transacciones }}</td>
              <td class="text-right font-semibold text-gray-700 font-mono">${{ Number(row.montoRegistrado).toFixed(2) }}</td>
              <td class="text-right font-bold text-brand-campus font-mono">${{ Number(row.total).toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-else class="report-panel receipts-report-panel">
      <div class="panel-header">
        <h3>Recibos del corte</h3>
      </div>

      <div class="filters-grid corte-filters">
        <div class="form-group m-0">
          <label class="form-label">Desde</label>
          <input type="date" v-model="filtrosCorte.inicio" class="input-field">
        </div>
        <div class="form-group m-0">
          <label class="form-label">Hasta</label>
          <input type="date" v-model="filtrosCorte.fin" class="input-field">
        </div>
        <div class="form-group m-0" v-if="canFilterPlantel">
          <label class="form-label">Plantel</label>
          <select v-model="filtrosCorte.plantel" class="input-field">
            <option value="" disabled>Seleccione un plantel</option>
            <option v-for="p in PLANTELES_LIST" :key="p" :value="p">Plantel {{ p }}</option>
          </select>
        </div>
        <button class="btn btn-primary filter-button" type="button" @click="openReceiptStripsPdf">
          <LucideDownload :size="16" />
          Generar PDF
        </button>
      </div>

      <div class="receipt-export-stage">
        <div class="receipt-export-icon" aria-hidden="true">
          <LucideReceipt :size="24" />
        </div>
        <div>
          <span>{{ receiptPeriodLabel }}</span>
          <strong>Plantel {{ receiptPlantelLabel }}</strong>
        </div>
        <span class="receipt-format-chip">2 recibos por hoja</span>
      </div>
    </section>

    <CorteUserSelectionModal
      v-if="corteUserSelectorOpen"
      :users="corteUserOptions"
      :plantel="corteUserSelectionContext.plantel"
      :period-label="corteUserPeriodLabel"
      :loading="downloadingCorteExcel"
      @cancel="closeCorteUserSelector"
      @confirm="confirmCorteExcelUsers"
    />
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
import { useContextMenu } from '~/composables/useContextMenu'
import { useToast } from '~/composables/useToast'
import { normalizeCicloKey } from '~/shared/utils/ciclo'
import { resolveClientAuthAccess } from '~/utils/authAccess'

const state = useState('globalState')
const route = useRoute()
const { openMenu } = useContextMenu()
const { show } = useToast()

const userRole = ref(useCookie('auth_role').value || 'plantel')
const activePlantel = ref(useCookie('auth_active_plantel').value || '')
const homePlantel = ref(useCookie('auth_home_plantel').value || '')
const hasFinancialAccessCookie = useCookie('auth_has_financial_access')
const roleTokens = computed(() => String(userRole.value || '').split(',').map(role => role.trim().toLowerCase()).filter(Boolean))
const isSuperAdmin = computed(() => roleTokens.value.some(role => ['superadmin'].includes(role)))
const hasFinancialAccess = computed(() => resolveClientAuthAccess({
  role: userRole.value,
  hasFinancialAccess: hasFinancialAccessCookie.value
}).financialAccess)
const canFilterPlantel = computed(() => isSuperAdmin.value && activePlantel.value === 'GLOBAL')
const requestedReport = String(route.query.tipo || '').toLowerCase()
const activeReport = ref(hasFinancialAccess.value && ['corte', 'recibos'].includes(requestedReport)
  ? requestedReport
  : 'concepto')

const conceptos = ref([])
const loadingConceptos = ref(false)
const loadingConceptReport = ref(false)
const downloadingConceptExcel = ref(false)
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

const defaultCortePlantel = canFilterPlantel.value
  ? (PLANTELES_LIST.includes(String(homePlantel.value || '').toUpperCase())
      ? String(homePlantel.value).toUpperCase()
      : (PLANTELES_LIST[0] || ''))
  : ''
const currentMexicoDateKey = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}
const todayCorteKey = currentMexicoDateKey()
const filtrosCorte = ref({ inicio: todayCorteKey, fin: todayCorteKey, plantel: defaultCortePlantel })
const datosCorte = ref([])
const loadingCorte = ref(false)
const downloadingCorteExcel = ref(false)
const corteUserSelectorOpen = ref(false)
const corteUserOptions = ref([])
const corteUserSelectionContext = ref({
  inicio: null,
  fin: null,
  plantel: ''
})

const conceptRows = computed(() => conceptReport.value.rows || [])
const conceptSummary = computed(() => conceptReport.value.resumen || emptyConceptReport().resumen)
const selectedConcept = computed(() => {
  return conceptos.value.find(concepto => String(concepto.id) === String(filtrosConcepto.value.conceptoId)) || conceptReport.value.concepto
})
const selectedConceptName = computed(() => selectedConcept.value?.concepto || 'Sin selección')
const totalCorte = computed(() => datosCorte.value.reduce((sum, row) => sum + Number(row.total), 0))
const totalRegistradoCorte = computed(() => datosCorte.value.reduce((sum, row) => sum + Number(row.montoRegistrado || 0), 0))
const corteUserPeriodLabel = computed(() => {
  const { inicio, fin } = corteUserSelectionContext.value
  if (!inicio || !fin) return 'Hoy'
  if (inicio === fin) return formatFilterDate(inicio)
  return `${formatFilterDate(inicio)} al ${formatFilterDate(fin)}`
})
const receiptPeriodLabel = computed(() => {
  const { inicio, fin } = filtrosCorte.value
  if (!inicio || !fin) return 'Hoy'
  if (inicio === fin) return formatFilterDate(inicio)
  return `${formatFilterDate(inicio)} al ${formatFilterDate(fin)}`
})
const receiptPlantelLabel = computed(() => canFilterPlantel.value
  ? (filtrosCorte.value.plantel || '—')
  : (activePlantel.value || homePlantel.value || '—'))

const formatDate = (value) => {
  if (!value) return ''
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value)
}

const formatFilterDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '')
}

const corteStatusClass = (status) => {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('cancel')) return 'bg-red-50 text-red-700'
  if (normalized.includes('depur')) return 'bg-amber-50 text-amber-700'
  return 'bg-emerald-50 text-emerald-700'
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

const buildCorteParams = (source) => {
  const params = {}

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

const exportConceptReport = async () => {
  if (!conceptRows.value.length || downloadingConceptExcel.value) return

  downloadingConceptExcel.value = true
  try {
    const query = new URLSearchParams(buildParams(filtrosConcepto.value))
    const response = await fetch(`/api/reports/concepto_excel?${query.toString()}`, {
      credentials: 'same-origin'
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      throw new Error(payload?.message || payload?.statusMessage || 'No se pudo generar el Excel')
    }

    const blob = await response.blob()
    const disposition = response.headers.get('content-disposition') || ''
    const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
    const plainName = disposition.match(/filename="([^"]+)"/i)?.[1]
    const filename = encodedName
      ? decodeURIComponent(encodedName)
      : (plainName || `Reporte_concepto_${safeFileName(selectedConceptName.value)}_${normalizeCicloKey(state.value.ciclo)}.xlsx`)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch (error) {
    show(error?.message || 'No se pudo generar el Excel', 'danger')
  } finally {
    downloadingConceptExcel.value = false
  }
}

const openCorte = () => {
  activeReport.value = 'corte'
  if (!datosCorte.value.length) loadCorte()
}

const loadCorte = async () => {
  if (!hasFinancialAccess.value) return

  loadingCorte.value = true
  try {
    datosCorte.value = await $fetch('/api/reports/corte', {
      params: buildCorteParams(filtrosCorte.value)
    })
  } catch (e) {
    show(e?.data?.message || 'No se pudo cargar el corte de caja', 'danger')
  } finally {
    loadingCorte.value = false
  }
}

const printCorte = () => {
  const q = new URLSearchParams(buildCorteParams(filtrosCorte.value)).toString()
  window.open(`/print/corte?${q}`, '_blank', 'width=850,height=800')
}

const openReceiptStripsPdf = () => {
  if (!hasFinancialAccess.value) return
  const q = new URLSearchParams(buildCorteParams(filtrosCorte.value)).toString()
  window.open(`/print/recibos-corte?${q}`, '_blank', 'width=920,height=900')
}

const executeCorteExcelDownload = async (selectedUserKeys = []) => {
  const query = new URLSearchParams(buildCorteParams(filtrosCorte.value))
  if (selectedUserKeys.length) query.set('usuarios', JSON.stringify(selectedUserKeys))

  const response = await fetch(`/api/reports/corte_excel?${query.toString()}`, {
    credentials: 'same-origin'
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.message || payload?.statusMessage || 'No se pudo generar el Excel')
  }

  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') || ''
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const plainName = disposition.match(/filename="([^"]+)"/i)?.[1]
  const filename = encodedName
    ? decodeURIComponent(encodedName)
    : (plainName || `Corte_de_Caja_${new Date().toISOString().slice(0, 10)}.xlsx`)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const prepareCorteExcel = async () => {
  if (!hasFinancialAccess.value || downloadingCorteExcel.value) return

  downloadingCorteExcel.value = true
  try {
    const response = await $fetch('/api/reports/corte_users', {
      params: buildCorteParams(filtrosCorte.value)
    })
    const users = Array.isArray(response?.usuarios) ? response.usuarios : []

    if (users.length <= 1) {
      await executeCorteExcelDownload(users.map(user => user.key))
      return
    }

    corteUserOptions.value = users
    corteUserSelectionContext.value = {
      inicio: response?.filtros?.inicio || null,
      fin: response?.filtros?.fin || null,
      plantel: response?.filtros?.plantel || ''
    }
    corteUserSelectorOpen.value = true
  } catch (e) {
    show(e?.data?.message || e?.message || 'No se pudo preparar el Excel', 'danger')
  } finally {
    downloadingCorteExcel.value = false
  }
}

const closeCorteUserSelector = () => {
  if (downloadingCorteExcel.value) return
  corteUserSelectorOpen.value = false
  corteUserOptions.value = []
}

const confirmCorteExcelUsers = async (selectedUserKeys) => {
  if (downloadingCorteExcel.value || !selectedUserKeys?.length) return

  downloadingCorteExcel.value = true
  try {
    await executeCorteExcelDownload(selectedUserKeys)
    corteUserSelectorOpen.value = false
    corteUserOptions.value = []
  } catch (e) {
    corteUserSelectorOpen.value = false
    corteUserOptions.value = []
    show(e?.data?.message || e?.message || 'No se pudo generar el Excel', 'danger')
  } finally {
    downloadingCorteExcel.value = false
  }
}

const showCorteContextMenu = (event, row) => {
  openMenu(event, [
    { label: `Fila: $${Number(row.total).toFixed(2)}`, disabled: true },
    { label: '-' },
    { label: 'Descargar Excel', icon: LucideDownload, action: prepareCorteExcel },
    { label: 'Imprimir corte', icon: LucidePrinter, action: printCorte }
  ])
}

onMounted(async () => {
  await loadConceptos()
  if (activeReport.value === 'corte') {
    loadCorte()
  } else if (activeReport.value === 'concepto' && filtrosConcepto.value.conceptoId) {
    loadConceptReport()
  }
})

watch(() => normalizeCicloKey(state.value.ciclo), async () => {
  conceptReport.value = emptyConceptReport()
  await loadConceptos()
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
  gap: 12px;
}

.reports-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 2px 2px 4px;
}

.reports-heading h2,
.panel-header h3,
.corte-total h3 {
  margin: 0;
  color: #182235;
  font-weight: 780;
  letter-spacing: -0.015em;
}

.reports-heading h2 {
  font-size: 1.12rem;
}

.report-switcher {
  display: inline-flex;
  gap: 2px;
  border-radius: 12px;
  background: #eef2f6;
  padding: 3px;
}

.report-switcher button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #667085;
  padding: 0 12px;
  font-size: 0.75rem;
  font-weight: 720;
  transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
}

.report-switcher button:hover {
  color: #344054;
}

.report-switcher button.active {
  background: #fff;
  color: #255f32;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
}

.report-panel {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #e4e9ef;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 58px;
  border-bottom: 1px solid #edf0f4;
  padding: 12px 16px;
}

.panel-header h3,
.corte-total h3 {
  font-size: 0.95rem;
}

.panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.filters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  align-items: end;
  border-bottom: 1px solid #edf0f4;
  background: #fbfcfd;
  padding: 12px 16px;
}

.concept-select {
  min-width: 0;
  grid-column: span 2;
}

.filter-button {
  width: max-content;
  min-width: 116px;
  justify-self: start;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  padding: 12px 16px;
}

.metric-card {
  min-width: 0;
  border: 1px solid #e7ebf0;
  border-radius: 11px;
  background: #f8fafb;
  padding: 11px 12px;
}

.metric-card.muted {
  background: #fbfcfd;
}

.metric-card span {
  display: block;
  color: #7a8497;
  font-size: 0.64rem;
  font-weight: 720;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.metric-card strong {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: #182235;
  font-size: 1rem;
  font-weight: 780;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-split {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) 250px;
  gap: 12px;
  overflow: hidden;
  padding: 0 16px 16px;
}

.report-table {
  overflow: auto;
  border-color: #e7ebf0;
  box-shadow: none;
}

.breakdown-panel {
  align-self: start;
  border: 1px solid #e7ebf0;
  border-radius: 12px;
  background: #fff;
  padding: 13px;
}

.breakdown-panel h4 {
  margin: 0 0 9px;
  color: #344054;
  font-size: 0.72rem;
  font-weight: 760;
  text-transform: uppercase;
}

.breakdown-panel p {
  margin: 0;
  color: #7a8497;
  font-size: 0.76rem;
}

.breakdown-list {
  display: grid;
  gap: 7px;
}

.breakdown-list div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid #edf0f4;
  padding-bottom: 7px;
}

.breakdown-list div:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.breakdown-list span {
  color: #667085;
  font-size: 0.76rem;
  font-weight: 650;
}

.breakdown-list strong {
  color: #182235;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
}

.report-panel > .card {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.corte-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #edf0f4;
  padding: 12px 16px;
}

.corte-total-values {
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 10px;
  background: #f1f7f1;
  color: #4d7350;
  padding: 6px 10px;
  font-size: 0.78rem;
  font-weight: 680;
}

.corte-total-values strong {
  color: #255f32;
  font-size: 0.88rem;
  font-weight: 800;
}

.receipts-report-panel {
  min-height: 360px;
}

.receipt-export-stage {
  display: flex;
  align-items: center;
  gap: 14px;
  width: min(540px, calc(100% - 32px));
  margin: auto;
  border: 1px solid #e7ebf0;
  border-radius: 14px;
  background: #fbfcfd;
  padding: 18px;
}

.receipt-export-icon {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  place-items: center;
  border-radius: 12px;
  background: #eaf4ec;
  color: #2f6a39;
}

.receipt-export-stage > div:nth-child(2) {
  min-width: 0;
  flex: 1;
}

.receipt-export-stage span,
.receipt-export-stage strong {
  display: block;
}

.receipt-export-stage > div:nth-child(2) span {
  color: #7a8497;
  font-size: 0.74rem;
}

.receipt-export-stage > div:nth-child(2) strong {
  color: #182235;
  font-size: 0.9rem;
  font-weight: 760;
}

.receipt-format-chip {
  border-radius: 999px;
  background: #eef2f6;
  color: #667085;
  padding: 5px 9px;
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;
}

@media (max-width: 920px) {
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

  .report-switcher {
    max-width: 100%;
    overflow-x: auto;
  }

  .breakdown-panel {
    width: 100%;
  }
}

@media (max-width: 620px) {
  .report-switcher button {
    padding: 0 9px;
  }

  .concept-select {
    grid-column: auto;
  }

  .receipt-export-stage {
    align-items: flex-start;
  }

  .receipt-format-chip {
    display: none;
  }
}
</style>
