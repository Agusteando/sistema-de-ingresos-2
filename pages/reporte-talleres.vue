<template>
  <div class="talleres-report-page">
    <section class="talleres-report-head">
      <div>
        <span class="talleres-report-eyebrow">Talleres</span>
        <h1>Reporte de Talleres</h1>
        <p>Consolidado por taller y plantel para los planteles disponibles en tu sesión.</p>
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
        <span>No fue posible consultar: {{ report.failures.map(item => item.plantel).join(', ') }}. Los demás planteles permanecen visibles.</span>
      </div>

      <section class="report-table-card">
        <div class="report-table-scroll">
          <table class="report-table">
            <thead>
              <tr>
                <th scope="col">Taller</th>
                <th scope="col">Plantel</th>
                <th scope="col" class="numeric">Alumnos</th>
              </tr>
            </thead>
            <tbody v-if="report?.groups?.length">
              <template v-for="group in report.groups" :key="group.clave">
                <tr v-for="(row, index) in group.planteles" :key="`${group.clave}-${row.plantel}`" class="taller-row" :class="{ 'group-start': index === 0 }">
                  <td v-if="index === 0" class="taller-cell" :rowspan="group.planteles.length">
                    <div class="taller-identity">
                      <img :src="group.imagen" :alt="''" loading="lazy" @error="hideBrokenImage" />
                      <div>
                        <strong>{{ group.nombre }}</strong>
                        <span>{{ formatNumber(group.totalAlumnos) }} alumnos en {{ group.planteles.length }} {{ group.planteles.length === 1 ? 'plantel' : 'planteles' }}</span>
                      </div>
                    </div>
                  </td>
                  <td class="plantel-cell">
                    <strong>{{ row.plantel }}</strong>
                    <span>{{ plantelName(row.plantel) }}</span>
                  </td>
                  <td class="numeric alumnos-cell">{{ formatNumber(row.alumnos) }}</td>
                </tr>
              </template>
            </tbody>
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
  width: min(1180px, 100%);
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

.report-table-scroll { overflow-x: auto; }
.report-table { width: 100%; min-width: 720px; border-collapse: collapse; }
.report-table thead { background: #f8faf9; }
.report-table th {
  padding: 13px 18px;
  border-bottom: 1px solid #e7ece9;
  color: #7b8490;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .075em;
  text-align: left;
  text-transform: uppercase;
}

.report-table td {
  padding: 14px 18px;
  border-top: 1px solid #edf0ee;
  color: #34413d;
  font-size: 13px;
  vertical-align: middle;
}

.taller-row.group-start td { border-top-color: #d8e2dd; }
.report-table tbody > .taller-row:first-child td { border-top: 0; }
.taller-cell { width: 52%; background: #fcfdfc; vertical-align: top !important; }
.taller-identity { display: flex; align-items: center; gap: 13px; }
.taller-identity img { width: 42px; height: 42px; border-radius: 10px; object-fit: cover; background: #f1f5f3; }
.taller-identity strong { display: block; color: #23332e; font-size: 14px; font-weight: 800; }
.taller-identity span { display: block; margin-top: 3px; color: #8a938f; font-size: 11px; }
.plantel-cell strong { display: inline-block; min-width: 48px; color: #2f6e59; font-size: 12px; font-weight: 900; }
.plantel-cell span { color: #737d79; font-size: 12px; }
.numeric { text-align: right !important; font-variant-numeric: tabular-nums; }
.alumnos-cell { color: #315f50 !important; font-size: 15px !important; font-weight: 900; }

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
}
</style>
