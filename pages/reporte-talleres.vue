<template>
  <div class="talleres-report-page">
    <section class="talleres-report-head">
      <div>
        <span class="talleres-report-eyebrow">Talleres</span>
        <h1>Reporte de Talleres</h1>
        <p>Consulta el consolidado entre planteles o las listas institucionales de alumnos por taller.</p>
      </div>
      <button type="button" class="report-refresh" :disabled="pending || institutionalPending" @click="refreshReport">
        <LucideRefreshCw :size="16" :class="{ 'animate-spin': pending || institutionalPending }" />
        Actualizar
      </button>
    </section>

    <nav class="report-view-tabs" aria-label="Vistas del reporte de Talleres">
      <button
        type="button"
        :class="{ active: activeView === 'matrix' }"
        :aria-pressed="activeView === 'matrix'"
        @click="activeView = 'matrix'"
      >
        <LucideTableProperties :size="16" />
        Comparativo por plantel
      </button>
      <button
        type="button"
        :class="{ active: activeView === 'institutional' }"
        :aria-pressed="activeView === 'institutional'"
        @click="openInstitutionalView"
      >
        <LucideUsers :size="16" />
        Listas institucionales
      </button>
    </nav>

    <template v-if="activeView === 'matrix'">
      <section class="report-stats" aria-label="Resumen del reporte">
        <article>
          <span>Planteles</span>
          <strong>{{ report?.totals?.planteles || 0 }}</strong>
        </article>
        <article>
          <span>Talleres</span>
          <strong>{{ report?.totals?.talleres || 0 }}</strong>
        </article>
        <article>
          <span>Asignaciones</span>
          <strong>{{ formatNumber(report?.totals?.asignaciones || 0) }}</strong>
        </article>
      </section>

      <div v-if="error" class="report-state report-state-error" role="alert">
        <LucideCircleAlert :size="22" />
        <div>
          <strong>No se pudo cargar el reporte.</strong>
          <span>{{ requestErrorMessage }}</span>
        </div>
        <button type="button" @click="refreshReport">Reintentar</button>
      </div>

      <div v-else-if="pending && !report" class="report-state" role="status">
        <LucideLoader2 class="animate-spin" :size="22" />
        <strong>Consultando Talleres...</strong>
      </div>

      <template v-else>
        <div v-if="report?.failures?.length" class="report-warning" role="status">
          <LucideTriangleAlert :size="18" />
          <span>No fue posible consultar: {{ report.failures.map(item => item.plantel).join(', ') }}. Esas columnas se muestran como no disponibles.</span>
        </div>

        <section class="report-table-card">
          <div class="report-table-scroll">
            <table class="report-table">
              <thead>
                <tr>
                  <th scope="col" class="workshop-column">Taller</th>
                  <th
                    v-for="plantel in reportPlanteles"
                    :key="plantel"
                    scope="col"
                    class="plantel-column numeric"
                    :class="{ 'is-unavailable': failedPlanteles.has(plantel) }"
                    :title="plantelName(plantel)"
                  >
                    <span class="plantel-code">{{ plantel }}</span>
                    <span class="plantel-name">{{ plantelName(plantel) }}</span>
                  </th>
                  <th scope="col" class="total-column numeric">Total</th>
                </tr>
              </thead>

              <tbody v-if="report?.groups?.length">
                <tr v-for="group in report.groups" :key="group.clave" class="matrix-row">
                  <th scope="row" class="workshop-cell">
                    <div class="taller-identity">
                      <img v-if="group.imagen" :src="group.imagen" :alt="''" loading="lazy" @error="hideBrokenImage" />
                      <strong>{{ group.nombre }}</strong>
                    </div>
                  </th>
                  <td
                    v-for="plantel in reportPlanteles"
                    :key="`${group.clave}-${plantel}`"
                    class="numeric matrix-value"
                    :class="{
                      'has-value': workshopCount(group, plantel) > 0,
                      'is-unavailable': failedPlanteles.has(plantel),
                    }"
                  >
                    <span v-if="failedPlanteles.has(plantel)" class="unavailable-value" title="Plantel no disponible">N/D</span>
                    <span v-else-if="workshopCount(group, plantel) > 0">{{ formatNumber(workshopCount(group, plantel)) }}</span>
                    <span v-else class="zero-value">—</span>
                  </td>
                  <td class="numeric matrix-value row-total">{{ formatNumber(group.totalAlumnos) }}</td>
                </tr>
              </tbody>

              <tfoot v-if="report?.groups?.length">
                <tr>
                  <th scope="row">Total</th>
                  <td
                    v-for="plantel in reportPlanteles"
                    :key="`total-${plantel}`"
                    class="numeric"
                    :class="{ 'is-unavailable': failedPlanteles.has(plantel) }"
                  >
                    <span v-if="failedPlanteles.has(plantel)" class="unavailable-value">N/D</span>
                    <span v-else>{{ formatNumber(plantelTotal(plantel)) }}</span>
                  </td>
                  <td class="numeric grand-total">{{ formatNumber(report?.totals?.asignaciones || 0) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div v-if="!report?.groups?.length" class="empty-report">
            <LucideTableProperties :size="28" />
            <strong>No hay Talleres con alumnos para este ciclo.</strong>
          </div>
        </section>
      </template>
    </template>

    <template v-else>
      <section class="institutional-toolbar">
        <div class="institutional-campus-field">
          <label for="institutional-campus">Plantel</label>
          <select id="institutional-campus" v-model="selectedPlantel" :disabled="pending || institutionalPending">
            <option v-for="plantel in availablePlanteles" :key="plantel" :value="plantel">
              {{ plantel }} · {{ plantelName(plantel) }}
            </option>
          </select>
        </div>
        <div class="institutional-toolbar-copy">
          <span>Formato institucional</span>
          <strong>{{ cycleLabel }}</strong>
        </div>
        <button
          type="button"
          class="institutional-download"
          :disabled="!institutionalGroups.length || institutionalPending || downloadingExcel || !selectedPlantel"
          @click="downloadInstitutionalExcel"
        >
          <LucideLoader2 v-if="downloadingExcel" class="animate-spin" :size="16" />
          <LucideDownload v-else :size="16" />
          Descargar Excel
        </button>
      </section>

      <div v-if="!availablePlanteles.length && !pending" class="report-state report-state-error" role="alert">
        <LucideCircleAlert :size="22" />
        <div>
          <strong>No hay planteles disponibles.</strong>
          <span>Los planteles de tu sesión no pudieron consultarse para esta vista.</span>
        </div>
      </div>

      <div v-else-if="institutionalError" class="report-state report-state-error" role="alert">
        <LucideCircleAlert :size="22" />
        <div>
          <strong>No se pudo cargar la lista institucional.</strong>
          <span>{{ institutionalErrorMessage }}</span>
        </div>
        <button type="button" @click="loadInstitutionalReport(true)">Reintentar</button>
      </div>

      <div v-else-if="institutionalPending && !institutionalReport" class="report-state" role="status">
        <LucideLoader2 class="animate-spin" :size="22" />
        <strong>Preparando listas de {{ plantelName(selectedPlantel) }}...</strong>
      </div>

      <section v-else class="institutional-report-card">
        <header class="institutional-title-band">
          <span>SERVICIOS CICLO ESCOLAR {{ cycleLabel }}</span>
          <strong>{{ plantelName(selectedPlantel) }} · {{ selectedPlantel }}</strong>
        </header>

        <div class="institutional-report-grid">
          <section class="institutional-summary" aria-label="Resumen de Talleres">
            <div class="institutional-section-heading">
              <div>
                <span>Resumen</span>
                <strong>{{ institutionalGroups.length }} Talleres</strong>
              </div>
              <small>{{ formatNumber(institutionalAssignments) }} asignaciones</small>
            </div>

            <div class="institutional-table-scroll">
              <table class="institutional-table institutional-total-table">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Servicio / Taller</th>
                    <th>Alumnos</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(group, index) in institutionalGroups"
                    :key="group.clave"
                    :class="{ active: selectedWorkshopKey === group.clave }"
                  >
                    <td>{{ index + 1 }}</td>
                    <td>
                      <button type="button" class="institutional-service-button" @click="selectedWorkshopKey = group.clave">
                        {{ group.nombre }}
                      </button>
                    </td>
                    <td class="institutional-number">{{ formatNumber(group.totalAlumnos) }}</td>
                  </tr>
                </tbody>
                <tfoot v-if="institutionalGroups.length">
                  <tr>
                    <td></td>
                    <th>Total</th>
                    <td class="institutional-number">{{ formatNumber(institutionalAssignments) }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section class="institutional-roster" aria-label="Lista de alumnos del Taller seleccionado">
            <div class="institutional-roster-head">
              <div>
                <span>Lista del Taller</span>
                <h2>{{ selectedWorkshop?.nombre || 'Selecciona un Taller' }}</h2>
                <small v-if="selectedWorkshop">IECS · IEDIS · {{ plantelName(selectedPlantel) }}</small>
              </div>
              <label class="institutional-workshop-select">
                <span>Taller</span>
                <select v-model="selectedWorkshopKey">
                  <option v-for="group in institutionalGroups" :key="group.clave" :value="group.clave">
                    {{ group.nombre }} · {{ group.totalAlumnos }}
                  </option>
                </select>
              </label>
            </div>

            <div class="institutional-table-scroll roster-scroll">
              <table class="institutional-table roster-table">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Grado y grupo</th>
                    <th>Nombre</th>
                  </tr>
                </thead>
                <tbody v-if="selectedWorkshopStudents.length">
                  <tr v-for="(student, index) in selectedWorkshopStudents" :key="`${student.matricula}-${index}`">
                    <td>{{ index + 1 }}</td>
                    <td>{{ gradeAndGroup(student) }}</td>
                    <td class="student-name">{{ student.nombre || '—' }}</td>
                  </tr>
                </tbody>
              </table>
              <div v-if="selectedWorkshop && !selectedWorkshopStudents.length" class="empty-roster">
                No hay alumnos disponibles para este Taller.
              </div>
            </div>
          </section>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import {
  LucideCircleAlert,
  LucideDownload,
  LucideLoader2,
  LucideRefreshCw,
  LucideTableProperties,
  LucideTriangleAlert,
  LucideUsers,
} from 'lucide-vue-next'
import { useActiveCiclo } from '~/composables/useActiveCiclo'
import { useToast } from '~/composables/useToast'
import { formatCicloLabel } from '~/shared/utils/ciclo'

const { activeCicloKey } = useActiveCiclo()
const { show } = useToast()
const activeView = ref('matrix')
const report = ref(null)
const pending = ref(false)
const error = ref(null)
const institutionalReport = ref(null)
const institutionalPending = ref(false)
const institutionalError = ref(null)
const institutionalRequestKey = ref('')
const selectedPlantel = ref('')
const selectedWorkshopKey = ref('')
const downloadingExcel = ref(false)
let requestSequence = 0
let institutionalRequestSequence = 0

const PLANTEL_NAMES = {
  PREEM: 'Preescolar Metepec',
  PREET: 'Preescolar Toluca',
  CT: 'Casita Toluca',
  CM: 'Casita Metepec',
  DM: 'Desarrollo Metepec',
  CO: 'Casita Ocoyoacac',
  DC: 'Desarrollo Casita',
  GM: 'Guardería Metepec',
  PM: 'Primaria Metepec',
  PT: 'Primaria Toluca',
  SM: 'Secundaria Metepec',
  ST: 'Secundaria Toluca',
  IS: 'ISSSTE Toluca',
  ISM: 'ISSSTE Metepec',
}

const plantelName = (plantel) => PLANTEL_NAMES[String(plantel || '').toUpperCase()] || 'Plantel'
const formatNumber = (value) => new Intl.NumberFormat('es-MX').format(Number(value || 0))
const requestErrorMessage = computed(() => error.value?.data?.message || error.value?.message || 'Ocurrió un error inesperado.')
const institutionalErrorMessage = computed(() => institutionalError.value?.data?.message || institutionalError.value?.message || 'Ocurrió un error inesperado.')
const reportPlanteles = computed(() => Array.isArray(report.value?.planteles) ? report.value.planteles : [])
const failedPlanteles = computed(() => new Set((report.value?.failures || []).map(item => String(item?.plantel || '').toUpperCase())))
const availablePlanteles = computed(() => reportPlanteles.value.filter(plantel => !failedPlanteles.value.has(String(plantel || '').toUpperCase())))
const cycleLabel = computed(() => formatCicloLabel(activeCicloKey.value))
const institutionalGroups = computed(() => [...(institutionalReport.value?.groups || [])].sort((left, right) => (
  String(left?.nombre || '').localeCompare(String(right?.nombre || ''), 'es', { sensitivity: 'base' })
)))
const institutionalAssignments = computed(() => institutionalGroups.value.reduce((sum, group) => sum + Number(group?.totalAlumnos || 0), 0))
const selectedWorkshop = computed(() => institutionalGroups.value.find(group => group.clave === selectedWorkshopKey.value) || null)
const selectedWorkshopStudents = computed(() => {
  const campus = (selectedWorkshop.value?.planteles || []).find(item => String(item?.plantel || '').toUpperCase() === String(selectedPlantel.value || '').toUpperCase())
  return Array.isArray(campus?.students) ? campus.students : []
})

const workshopCount = (group, plantel) => {
  const row = (group?.planteles || []).find(item => String(item?.plantel || '').toUpperCase() === String(plantel || '').toUpperCase())
  return Number(row?.alumnos || 0)
}

const plantelTotal = (plantel) => (report.value?.groups || []).reduce(
  (sum, group) => sum + workshopCount(group, plantel),
  0,
)

const gradeAndGroup = (student) => [student?.grado, student?.grupo].map(value => String(value || '').trim()).filter(Boolean).join(' ') || '—'

const syncDefaultPlantel = () => {
  if (!availablePlanteles.value.length) {
    selectedPlantel.value = ''
    return
  }
  if (!availablePlanteles.value.includes(selectedPlantel.value)) {
    selectedPlantel.value = availablePlanteles.value[0]
  }
}

const loadReport = async () => {
  const sequence = ++requestSequence
  pending.value = true
  error.value = null
  try {
    const response = await $fetch('/api/talleres-servicios/reporte', {
      params: { ciclo: activeCicloKey.value },
    })
    if (sequence === requestSequence) {
      report.value = response
      syncDefaultPlantel()
    }
  } catch (requestError) {
    if (sequence === requestSequence) error.value = requestError
  } finally {
    if (sequence === requestSequence) pending.value = false
  }
}

const loadInstitutionalReport = async (force = false) => {
  if (!selectedPlantel.value) return
  const requestKey = `${activeCicloKey.value}|${selectedPlantel.value}`
  if (!force && institutionalRequestKey.value === requestKey && institutionalReport.value) return

  const sequence = ++institutionalRequestSequence
  institutionalPending.value = true
  institutionalError.value = null
  try {
    const response = await $fetch('/api/talleres-servicios/reporte', {
      params: {
        ciclo: activeCicloKey.value,
        plantel: selectedPlantel.value,
        detalle: '1',
      },
    })
    if (sequence !== institutionalRequestSequence) return
    institutionalReport.value = response
    institutionalRequestKey.value = requestKey
    const keys = new Set((response?.groups || []).map(group => group.clave))
    if (!keys.has(selectedWorkshopKey.value)) selectedWorkshopKey.value = response?.groups?.[0]?.clave || ''
  } catch (requestError) {
    if (sequence === institutionalRequestSequence) institutionalError.value = requestError
  } finally {
    if (sequence === institutionalRequestSequence) institutionalPending.value = false
  }
}

const openInstitutionalView = async () => {
  activeView.value = 'institutional'
  syncDefaultPlantel()
  await loadInstitutionalReport()
}

const refreshReport = async () => {
  await loadReport()
  if (activeView.value === 'institutional') await loadInstitutionalReport(true)
}

const downloadInstitutionalExcel = async () => {
  if (!selectedPlantel.value || downloadingExcel.value) return
  downloadingExcel.value = true
  try {
    const query = new URLSearchParams({
      ciclo: activeCicloKey.value,
      plantel: selectedPlantel.value,
    })
    const response = await fetch(`/api/talleres-servicios/reporte-institucional-excel?${query.toString()}`, {
      credentials: 'same-origin',
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
      : (plainName || `Talleres_${selectedPlantel.value}_${activeCicloKey.value}.xlsx`)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch (downloadError) {
    show(downloadError?.data?.message || downloadError?.message || 'No se pudo generar el Excel', 'danger')
  } finally {
    downloadingExcel.value = false
  }
}

const hideBrokenImage = (event) => {
  event.currentTarget.style.display = 'none'
}

watch(selectedPlantel, async (plantel, previousPlantel) => {
  if (plantel === previousPlantel || activeView.value !== 'institutional' || !plantel) return
  institutionalReport.value = null
  institutionalRequestKey.value = ''
  selectedWorkshopKey.value = ''
  await loadInstitutionalReport()
})

watch(activeCicloKey, async () => {
  institutionalReport.value = null
  institutionalRequestKey.value = ''
  selectedWorkshopKey.value = ''
  await loadReport()
  if (activeView.value === 'institutional') await loadInstitutionalReport()
})

onMounted(loadReport)
</script>

<style scoped>
.talleres-report-page {
  width: min(1480px, 100%);
  margin: 0 auto;
  padding: 28px 28px 48px;
}

.talleres-report-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 18px;
}

.talleres-report-eyebrow {
  display: block;
  margin-bottom: 4px;
  color: #41856c;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .1em;
  text-transform: uppercase;
}

.talleres-report-head h1 {
  margin: 0;
  color: #1f2937;
  font-size: clamp(24px, 2vw, 32px);
  font-weight: 800;
  letter-spacing: -.025em;
}

.talleres-report-head p {
  margin: 7px 0 0;
  color: #718096;
  font-size: 13px;
}

.report-refresh,
.institutional-download {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid #dbe5e1;
  border-radius: 11px;
  background: #fff;
  color: #355f51;
  font-size: 12px;
  font-weight: 800;
  box-shadow: 0 7px 18px rgba(35, 66, 55, .05);
}

.report-refresh:disabled,
.institutional-download:disabled { opacity: .55; cursor: wait; }

.report-view-tabs {
  display: inline-flex;
  gap: 4px;
  margin-bottom: 16px;
  padding: 4px;
  border: 1px solid #e0e7e3;
  border-radius: 12px;
  background: #f5f8f6;
}

.report-view-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 38px;
  padding: 0 13px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #6e7c77;
  font-size: 12px;
  font-weight: 800;
}

.report-view-tabs button.active {
  background: #fff;
  color: #285445;
  box-shadow: 0 3px 10px rgba(35, 66, 55, .08);
}

.report-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.report-stats article {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 66px;
  padding: 14px 18px;
  border: 1px solid #e5e9e7;
  border-radius: 14px;
  background: #fff;
}

.report-stats span {
  color: #7b8490;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .05em;
  text-transform: uppercase;
}

.report-stats strong { color: #294f43; font-size: 22px; }

.report-table-card {
  overflow: hidden;
  border: 1px solid #e2e8e5;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 14px 34px rgba(31, 53, 46, .06);
}

.report-table-scroll,
.institutional-table-scroll {
  max-width: 100%;
  overflow: auto;
}

.report-table {
  width: 100%;
  min-width: max-content;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}

.report-table th,
.report-table td { border-right: 1px solid #edf1ef; }
.report-table th:last-child,
.report-table td:last-child { border-right: 0; }

.report-table thead th {
  position: sticky;
  top: 0;
  z-index: 3;
  height: 62px;
  padding: 10px 14px;
  border-bottom: 1px solid #dfe7e3;
  background: #f8faf9;
  color: #707b77;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .06em;
  text-align: left;
  text-transform: uppercase;
  vertical-align: middle;
}

.report-table .workshop-column {
  left: 0;
  z-index: 5;
  width: 300px;
  min-width: 300px;
}

.report-table .plantel-column {
  width: 112px;
  min-width: 112px;
  text-align: center !important;
}

.plantel-code {
  display: block;
  color: #315f50;
  font-size: 12px;
  line-height: 1.1;
}

.plantel-name {
  display: block;
  max-width: 96px;
  margin: 4px auto 0;
  overflow: hidden;
  color: #909895;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1.15;
  text-overflow: ellipsis;
  text-transform: none;
  white-space: nowrap;
}

.report-table .total-column {
  right: 0;
  z-index: 5;
  width: 104px;
  min-width: 104px;
  background: #f3f7f5;
}

.report-table tbody th,
.report-table tbody td {
  height: 58px;
  padding: 9px 14px;
  border-bottom: 1px solid #edf0ee;
  background: #fff;
  color: #34413d;
  font-size: 13px;
  vertical-align: middle;
}

.report-table tbody tr:hover th,
.report-table tbody tr:hover td { background: #fbfdfc; }

.report-table tbody .workshop-cell {
  position: sticky;
  left: 0;
  z-index: 2;
  width: 300px;
  min-width: 300px;
  background: #fff;
  box-shadow: 1px 0 0 #edf1ef;
  text-align: left;
}

.report-table tbody tr:hover .workshop-cell { background: #fbfdfc; }

.taller-identity {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}

.taller-identity img {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: #f1f5f3;
  object-fit: cover;
}

.taller-identity strong {
  min-width: 0;
  overflow: hidden;
  color: #23332e;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.numeric { text-align: right !important; font-variant-numeric: tabular-nums; }
.matrix-value { width: 112px; min-width: 112px; text-align: center !important; }
.matrix-value.has-value { color: #2f6654; font-size: 14px; font-weight: 900; }
.zero-value { color: #c0c7c4; }

.row-total {
  position: sticky;
  right: 0;
  z-index: 2;
  width: 104px;
  min-width: 104px;
  background: #f8fbf9 !important;
  color: #244c3f !important;
  font-size: 14px;
  font-weight: 900;
  text-align: right !important;
  box-shadow: -1px 0 0 #e4ebe7;
}

.is-unavailable { background: #fffaf3 !important; }
.unavailable-value { color: #ad7a2e; font-size: 10px; font-weight: 900; letter-spacing: .04em; }

.report-table tfoot th,
.report-table tfoot td {
  position: sticky;
  bottom: 0;
  z-index: 3;
  height: 50px;
  padding: 10px 14px;
  border-top: 1px solid #d8e3de;
  background: #f3f7f5;
  color: #315f50;
  font-size: 12px;
  font-weight: 900;
}

.report-table tfoot th { left: 0; z-index: 4; text-align: left; text-transform: uppercase; }
.report-table tfoot td { text-align: center !important; }
.report-table tfoot .grand-total { right: 0; z-index: 4; background: #eaf2ee; color: #244c3f; font-size: 14px; text-align: right !important; }

.report-state,
.report-warning,
.empty-report {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 22px;
  border: 1px solid #e4e9e6;
  border-radius: 14px;
  background: #fff;
  color: #66736e;
}

.report-state-error { border-color: #fecaca; color: #991b1b; }
.report-state div { display: grid; gap: 2px; }
.report-state span { font-size: 12px; }
.report-state button { margin-left: auto; font-weight: 800; }
.report-warning { margin-bottom: 12px; padding: 12px 14px; border-color: #fde68a; background: #fffbeb; color: #8a5c0a; font-size: 12px; }
.empty-report { justify-content: center; min-height: 180px; border: 0; border-radius: 0; }

.institutional-toolbar {
  display: grid;
  grid-template-columns: minmax(250px, 340px) 1fr auto;
  align-items: end;
  gap: 14px;
  margin-bottom: 14px;
  padding: 14px;
  border: 1px solid #e1e6eb;
  border-radius: 14px;
  background: #fff;
}

.institutional-campus-field,
.institutional-workshop-select { display: grid; gap: 6px; }
.institutional-campus-field label,
.institutional-workshop-select span { color: #667085; font-size: 10px; font-weight: 900; letter-spacing: .07em; text-transform: uppercase; }
.institutional-campus-field select,
.institutional-workshop-select select {
  width: 100%;
  min-height: 40px;
  padding: 0 36px 0 12px;
  border: 1px solid #d7dee6;
  border-radius: 10px;
  background: #fff;
  color: #24364b;
  font-size: 12px;
  font-weight: 700;
}

.institutional-toolbar-copy { display: grid; gap: 2px; padding-bottom: 3px; }
.institutional-toolbar-copy span { color: #8a94a4; font-size: 10px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
.institutional-toolbar-copy strong { color: #0b6d8a; font-size: 15px; }
.institutional-download { border-color: #0b6d8a; background: #0b6d8a; color: #fff; box-shadow: 0 8px 20px rgba(16, 42, 67, .16); }

.institutional-report-card {
  overflow: hidden;
  border: 1px solid #d8dee8;
  border-radius: 16px;
  background: #f7f9fb;
  box-shadow: 0 18px 38px rgba(23, 43, 65, .08);
}

.institutional-title-band {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  min-height: 68px;
  padding: 14px 20px;
  background: #12afe0;
  color: #111827;
}

.institutional-title-band span { font-size: clamp(16px, 1.7vw, 23px); font-weight: 900; letter-spacing: .02em; }
.institutional-title-band strong { color: #0b6d8a; font-size: 12px; font-weight: 900; letter-spacing: .05em; text-align: right; text-transform: uppercase; }

.institutional-report-grid {
  display: grid;
  grid-template-columns: minmax(330px, .72fr) minmax(620px, 1.45fr);
  gap: 14px;
  padding: 14px;
}

.institutional-summary,
.institutional-roster {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #dce2ea;
  border-radius: 12px;
  background: #fff;
}

.institutional-section-heading,
.institutional-roster-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 70px;
  padding: 13px 16px;
  border-bottom: 1px solid #e1e6ed;
  background: #fbfcfd;
}

.institutional-section-heading div { display: grid; gap: 2px; }
.institutional-section-heading span,
.institutional-roster-head > div > span { color: #087b9c; font-size: 9px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; }
.institutional-section-heading strong { color: #0b6d8a; font-size: 16px; }
.institutional-section-heading small { color: #667085; font-size: 11px; font-weight: 700; }

.institutional-table {
  width: 100%;
  min-width: 520px;
  border-collapse: collapse;
  color: #28384c;
  font-size: 11px;
}

.institutional-table th,
.institutional-table td { padding: 9px 10px; border: 1px solid #dce2ea; vertical-align: middle; }
.institutional-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #12afe0;
  color: #111827;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .04em;
  text-align: center;
  text-transform: uppercase;
}

.institutional-total-table { min-width: 100%; }
.institutional-total-table th:nth-child(1),
.institutional-total-table td:nth-child(1) { width: 56px; text-align: center; }
.institutional-total-table th:nth-child(3),
.institutional-total-table td:nth-child(3) { width: 90px; }
.institutional-total-table tbody tr.active td { background: #dcecf7; }
.institutional-total-table tbody tr:hover td { background: #f2f8fc; }
.institutional-number { text-align: center; font-variant-numeric: tabular-nums; font-weight: 800; }
.institutional-service-button { width: 100%; border: 0; background: transparent; color: #173b4a; font-size: 11px; font-weight: 800; text-align: left; }
.institutional-total-table tfoot th,
.institutional-total-table tfoot td { background: #0b6d8a; color: #fff; font-weight: 900; text-transform: uppercase; }

.institutional-roster-head > div { min-width: 0; }
.institutional-roster-head h2 { margin: 2px 0; overflow: hidden; color: #0b6d8a; font-size: 17px; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }
.institutional-roster-head small { color: #667085; font-size: 10px; font-weight: 700; }
.institutional-workshop-select { flex: 0 0 min(310px, 43%); }
.roster-scroll { max-height: 610px; }
.roster-table { min-width: 620px; }
.roster-table th:nth-child(1), .roster-table td:nth-child(1) { width: 56px; text-align: center; }
.roster-table th:nth-child(2), .roster-table td:nth-child(2) { width: 150px; text-align: center; }
.roster-table tbody tr:nth-child(even) td { background: #f8fafc; }
.student-name { color: #1c3148; font-weight: 700; }
.empty-roster { padding: 36px 16px; color: #8b95a4; font-size: 12px; text-align: center; }

@media (max-width: 1120px) {
  .institutional-report-grid { grid-template-columns: 1fr; }
  .institutional-summary { max-height: 420px; }
}

@media (max-width: 760px) {
  .talleres-report-page { padding: 20px 14px 36px; }
  .talleres-report-head { align-items: flex-start; }
  .talleres-report-head p { max-width: 42ch; }
  .report-refresh { min-width: 40px; padding: 0 11px; font-size: 0; }
  .report-view-tabs { display: grid; grid-template-columns: 1fr 1fr; width: 100%; }
  .report-view-tabs button { justify-content: center; padding: 0 9px; font-size: 11px; }
  .report-stats { grid-template-columns: 1fr; }
  .report-stats article { min-height: 54px; }
  .report-table .workshop-column,
  .report-table tbody .workshop-cell { width: 220px; min-width: 220px; }

  .institutional-toolbar { grid-template-columns: 1fr; align-items: stretch; }
  .institutional-toolbar-copy { display: none; }
  .institutional-download { width: 100%; }
  .institutional-title-band { align-items: flex-start; flex-direction: column; gap: 4px; }
  .institutional-title-band strong { text-align: left; }
  .institutional-report-grid { padding: 8px; }
  .institutional-roster-head { align-items: stretch; flex-direction: column; }
  .institutional-workshop-select { flex-basis: auto; width: 100%; }
}
</style>
