<template>
  <div class="talleres-report-page">
    <section class="talleres-report-head">
      <div>
        <span class="talleres-report-eyebrow">Talleres</span>
        <h1>Reporte de Talleres</h1>
        <p>Comparativo consolidado por taller entre todos los planteles disponibles en tu sesión.</p>
      </div>
      <button type="button" class="report-refresh" :disabled="pending" @click="refreshReport">
        <LucideRefreshCw :size="16" :class="{ 'animate-spin': pending }" />
        Actualizar
      </button>
    </section>

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
  </div>
</template>

<script setup>
import {
  LucideCircleAlert,
  LucideLoader2,
  LucideRefreshCw,
  LucideTableProperties,
  LucideTriangleAlert,
} from 'lucide-vue-next'
import { useActiveCiclo } from '~/composables/useActiveCiclo'

const { activeCicloKey } = useActiveCiclo()
const report = ref(null)
const pending = ref(false)
const error = ref(null)
let requestSequence = 0

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
const reportPlanteles = computed(() => Array.isArray(report.value?.planteles) ? report.value.planteles : [])
const failedPlanteles = computed(() => new Set((report.value?.failures || []).map(item => String(item?.plantel || '').toUpperCase())))

const workshopCount = (group, plantel) => {
  const row = (group?.planteles || []).find(item => String(item?.plantel || '').toUpperCase() === String(plantel || '').toUpperCase())
  return Number(row?.alumnos || 0)
}

const plantelTotal = (plantel) => (report.value?.groups || []).reduce(
  (sum, group) => sum + workshopCount(group, plantel),
  0,
)

const loadReport = async () => {
  const sequence = ++requestSequence
  pending.value = true
  error.value = null
  try {
    const response = await $fetch('/api/talleres-servicios/reporte', {
      params: { ciclo: activeCicloKey.value },
    })
    if (sequence === requestSequence) report.value = response
  } catch (requestError) {
    if (sequence === requestSequence) error.value = requestError
  } finally {
    if (sequence === requestSequence) pending.value = false
  }
}

const refreshReport = () => loadReport()
const hideBrokenImage = (event) => {
  event.currentTarget.style.display = 'none'
}

watch(activeCicloKey, loadReport)
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
  margin-bottom: 20px;
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

.report-refresh {
  display: inline-flex;
  align-items: center;
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

.report-refresh:disabled { opacity: .55; cursor: wait; }

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

.report-table-scroll {
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
.report-table td {
  border-right: 1px solid #edf1ef;
}

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

.numeric {
  text-align: right !important;
  font-variant-numeric: tabular-nums;
}

.matrix-value {
  width: 112px;
  min-width: 112px;
  text-align: center !important;
}

.matrix-value.has-value {
  color: #2f6654;
  font-size: 14px;
  font-weight: 900;
}

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

.report-table tfoot th {
  left: 0;
  z-index: 4;
  text-align: left;
  text-transform: uppercase;
}

.report-table tfoot td { text-align: center !important; }

.report-table tfoot .grand-total {
  right: 0;
  z-index: 4;
  background: #eaf2ee;
  color: #244c3f;
  font-size: 14px;
  text-align: right !important;
}

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

@media (max-width: 760px) {
  .talleres-report-page { padding: 20px 14px 36px; }
  .talleres-report-head { align-items: flex-start; }
  .talleres-report-head p { max-width: 42ch; }
  .report-refresh { min-width: 40px; padding: 0 11px; font-size: 0; }
  .report-stats { grid-template-columns: 1fr; }
  .report-stats article { min-height: 54px; }
  .report-table .workshop-column,
  .report-table tbody .workshop-cell { width: 220px; min-width: 220px; }
}
</style>
