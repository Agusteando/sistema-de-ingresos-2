<template>
  <section class="dashboard-page">
    <div class="dashboard-toolbar">
      <div class="view-switch" role="tablist" aria-label="Vista">
        <button
          type="button"
          role="tab"
          :aria-selected="viewMode === 'totals'"
          :class="{ active: viewMode === 'totals' }"
          @click="viewMode = 'totals'"
        >
          Totales
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="viewMode === 'timeline'"
          :class="{ active: viewMode === 'timeline' }"
          @click="viewMode = 'timeline'"
        >
          Ritmo
        </button>
      </div>

      <div class="toolbar-period">
        <button type="button" aria-label="Mes anterior" @click="shiftMonth(-1)">‹</button>
        <label class="month-input-wrap">
          <span>{{ monthLabel }}</span>
          <input v-model="selectedMonth" type="month" :max="currentMonth" aria-label="Mes" />
        </label>
        <button type="button" aria-label="Mes siguiente" :disabled="selectedMonth >= currentMonth" @click="shiftMonth(1)">›</button>
      </div>

      <div class="refresh-control">
        <time v-if="lastGeneratedLabel" :datetime="dashboard?.generatedAt">
          Generado {{ lastGeneratedLabel }}
        </time>
        <button
          type="button"
          class="refresh-button"
          :disabled="loading"
          @click="loadDashboard"
        >
          <LucideRefreshCw :size="17" :class="{ spinning: loading }" />
          <span>Actualizar</span>
        </button>
      </div>
    </div>

    <template v-if="viewMode === 'totals'">
      <DashboardMetricSection
        period="day"
        label="Hoy"
        :date-label="dayLabel"
        :total="dashboard?.totals.day || 0"
        :movements="dashboard?.totals.dayMovements || 0"
        :planteles="planteles"
        :loading="initialLoading"
        :refreshing="loading && !initialLoading"
      />

      <DashboardMetricSection
        period="month"
        :label="monthLabel"
        :date-label="String(selectedMonth)"
        :total="dashboard?.totals.month || 0"
        :movements="dashboard?.totals.monthMovements || 0"
        :planteles="planteles"
        :loading="initialLoading"
        :refreshing="loading && !initialLoading"
      />
    </template>

    <template v-else>
      <section class="dashboard-panel timeline-panel day-panel">
        <header class="panel-heading">
          <div>
            <span>Hoy</span>
            <strong>{{ currency(dashboard?.totals.day || 0) }}</strong>
          </div>
          <div class="panel-meta">
            <time>{{ dayLabel }}</time>
            <b>{{ integer(dashboard?.totals.dayMovements || 0) }}</b>
          </div>
        </header>

        <PlantelLineChart
          :labels="dayChartLabels"
          :series="daySeries"
          x-axis-label="Hora del día · 08:00–18:00"
          :loading="loading"
        />
      </section>

      <section class="dashboard-panel timeline-panel month-panel">
        <header class="panel-heading">
          <div>
            <span>{{ monthLabel }}</span>
            <strong>{{ currency(dashboard?.totals.month || 0) }}</strong>
          </div>
          <div class="panel-meta">
            <time>{{ selectedMonth }}</time>
            <b>{{ integer(dashboard?.totals.monthMovements || 0) }}</b>
          </div>
        </header>

        <PlantelLineChart
          :labels="monthChartLabels"
          :series="monthSeries"
          :x-axis-label="`Día de ${monthLabel}`"
          :loading="loading"
        />
      </section>
    </template>

    <div v-if="loadError" class="dashboard-error" role="alert">
      <span />
      No disponible
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { LucideRefreshCw } from 'lucide-vue-next'
import PlantelLineChart from '~/components/dashboard/PlantelLineChart.vue'
import DashboardMetricSection from '~/components/dashboard/DashboardMetricSection.vue'
import { DASHBOARD_PLANTELES } from '~/utils/constants'

type PlantelCollection = {
  plantel: string
  status: 'online' | 'offline'
  dayTotal: number
  monthTotal: number
  dayMovements: number
  monthMovements: number
  daySeries: number[]
  monthSeries: number[]
}

type DashboardPayload = {
  currentDate: string
  month: string
  planteles: PlantelCollection[]
  totals: {
    day: number
    month: number
    dayMovements: number
    monthMovements: number
  }
  generatedAt: string
}

const mexicoCityParts = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    month: `${values.year}-${values.month}`
  }
}

const clock = mexicoCityParts()
const currentMonth = clock.month
const selectedMonth = ref(currentMonth)
const viewMode = ref<'totals' | 'timeline'>('totals')
const dashboard = ref<DashboardPayload | null>(null)
const loading = ref(true)
const loadError = ref(false)
let requestSequence = 0

const currencyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
})
const integerFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 })
const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  weekday: 'short',
  day: '2-digit',
  month: 'short'
})
const monthFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric'
})
const generatedAtFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true
})
const monthDayFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short'
})

const currency = (value: number) => currencyFormatter.format(Number(value || 0))
const integer = (value: number) => integerFormatter.format(Number(value || 0))
const initialLoading = computed(() => loading.value && !dashboard.value)
const lastGeneratedLabel = computed(() => {
  const generatedAt = dashboard.value?.generatedAt
  if (!generatedAt) return ''
  const date = new Date(generatedAt)
  if (Number.isNaN(date.getTime())) return ''
  return generatedAtFormatter.format(date).replace('.', '')
})

const planteles = computed(() => DASHBOARD_PLANTELES.map(code => (
  dashboard.value?.planteles.find(item => item.plantel === code) || {
    plantel: code,
    status: 'offline' as const,
    dayTotal: 0,
    monthTotal: 0,
    dayMovements: 0,
    monthMovements: 0,
    daySeries: Array.from({ length: 11 }, () => 0),
    monthSeries: Array.from({ length: daysInSelectedMonth.value }, () => 0)
  }
)))

const dayLabel = computed(() => {
  const value = dashboard.value?.currentDate || clock.date
  return dateFormatter.format(new Date(`${value}T12:00:00-06:00`)).replace('.', '')
})

const monthLabel = computed(() => {
  const [year, month] = selectedMonth.value.split('-').map(Number)
  const label = monthFormatter.format(new Date(Date.UTC(year, month - 1, 1)))
  return label.charAt(0).toUpperCase() + label.slice(1)
})

const daysInSelectedMonth = computed(() => {
  const [year, month] = selectedMonth.value.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
})

const dayChartLabels = Array.from({ length: 11 }, (_, index) => `${String(index + 8).padStart(2, '0')}:00`)
const monthChartLabels = computed(() => {
  const [year, month] = selectedMonth.value.split('-').map(Number)
  return Array.from({ length: daysInSelectedMonth.value }, (_, day) => (
    monthDayFormatter
      .format(new Date(Date.UTC(year, month - 1, day + 1)))
      .replace('.', '')
  ))
})

const daySeries = computed(() => planteles.value.map(item => ({
  plantel: item.plantel,
  values: item.daySeries,
  status: item.status
})))

const monthSeries = computed(() => planteles.value.map(item => ({
  plantel: item.plantel,
  values: item.monthSeries,
  status: item.status
})))

const loadDashboard = async () => {
  const sequence = ++requestSequence
  loading.value = true
  loadError.value = false
  try {
    const response = await $fetch<DashboardPayload>('/api/dashboard/plantel-collections', {
      query: { month: selectedMonth.value }
    })
    if (sequence !== requestSequence) return
    dashboard.value = response
  } catch (error) {
    if (sequence !== requestSequence) return
    console.error('[Dashboard] No se pudo cargar:', error)
    loadError.value = true
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

const shiftMonth = (direction: number) => {
  const [year, month] = selectedMonth.value.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1 + direction, 1))
  const value = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
  selectedMonth.value = value > currentMonth ? currentMonth : value
}

watch(selectedMonth, () => loadDashboard())

onMounted(() => {
  loadDashboard()
})
</script>

<style scoped>
.dashboard-page {
  --dashboard-ink: #0f172a;
  --dashboard-muted: #64748b;
  display: grid;
  gap: 18px;
  min-width: 0;
  align-content: start;
  min-height: calc(100vh - 118px);
  padding: 4px 0 max(38px, env(safe-area-inset-bottom));
}

.dashboard-toolbar {
  position: sticky;
  z-index: 8;
  top: 0;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  min-height: 54px;
  padding: 7px 9px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 20px;
  background: rgba(248, 250, 252, 0.78);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.05);
  backdrop-filter: blur(18px);
}

.view-switch {
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(88px, 1fr));
  gap: 4px;
  padding: 4px;
  border-radius: 14px;
  background: #e9eef3;
}

.view-switch button {
  height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: 11px;
  color: #64748b;
  background: transparent;
  font-size: 0.78rem;
  font-weight: 800;
  cursor: pointer;
  transition: 150ms ease;
}

.view-switch button.active {
  color: #0f172a;
  background: white;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
}

.toolbar-period {
  justify-self: center;
  display: grid;
  grid-template-columns: 34px minmax(160px, auto) 34px;
  align-items: center;
  gap: 5px;
}

.toolbar-period > button {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 11px;
  color: #475569;
  background: rgba(255, 255, 255, 0.78);
  font-size: 1.35rem;
  font-weight: 500;
  cursor: pointer;
  transition: 150ms ease;
}

.toolbar-period > button:hover:not(:disabled),
.refresh-button:hover:not(:disabled) {
  border-color: rgba(15, 118, 110, 0.3);
  color: #0f766e;
  transform: translateY(-1px);
}

.toolbar-period > button:disabled,
.refresh-button:disabled {
  cursor: default;
  opacity: 0.38;
}

.month-input-wrap {
  position: relative;
  display: grid;
  place-items: center;
  height: 36px;
  padding: 0 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  color: #1e293b;
  background: white;
  font-size: 0.76rem;
  font-weight: 850;
  letter-spacing: 0.04em;
  text-transform: capitalize;
  cursor: pointer;
}

.month-input-wrap input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.refresh-control {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.refresh-control time {
  color: #64748b;
  font-size: 0.68rem;
  font-weight: 750;
  white-space: nowrap;
}

.refresh-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 112px;
  height: 36px;
  padding: 0 13px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  color: #334155;
  background: rgba(255, 255, 255, 0.82);
  font-size: 0.75rem;
  font-weight: 850;
  cursor: pointer;
  transition: 150ms ease;
}

.spinning {
  animation: dashboard-spin 700ms linear infinite;
}

.dashboard-panel {
  position: relative;
  min-width: 0;
  overflow: hidden;
  padding: 20px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 28px;
  background:
    radial-gradient(circle at 5% 0%, rgba(20, 184, 166, 0.09), transparent 26%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.82));
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.055);
}

.month-panel {
  background:
    radial-gradient(circle at 94% 0%, rgba(139, 92, 246, 0.09), transparent 30%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.82));
}

.panel-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.panel-heading > div:first-child {
  display: grid;
  gap: 4px;
}

.panel-heading span {
  color: #0f766e;
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.month-panel .panel-heading span {
  color: #7c3aed;
}

.panel-heading strong {
  color: var(--dashboard-ink);
  font-size: clamp(1.75rem, 3vw, 3rem);
  font-weight: 850;
  letter-spacing: -0.055em;
  line-height: 1;
}

.panel-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--dashboard-muted);
  font-size: 0.72rem;
  font-weight: 750;
  text-transform: capitalize;
}

.panel-meta b {
  min-width: 30px;
  padding: 5px 8px;
  border-radius: 999px;
  color: #334155;
  background: rgba(226, 232, 240, 0.74);
  text-align: center;
}

.timeline-panel {
  min-height: 420px;
}

.dashboard-error {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 15px;
  border: 1px solid rgba(244, 63, 94, 0.18);
  border-radius: 14px;
  color: #9f1239;
  background: rgba(255, 241, 242, 0.94);
  box-shadow: 0 16px 40px rgba(159, 18, 57, 0.12);
  font-size: 0.78rem;
  font-weight: 800;
  backdrop-filter: blur(12px);
}

.dashboard-error span {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #f43f5e;
}

@keyframes dashboard-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 760px) {
  .dashboard-page {
    gap: 13px;
  }

  .dashboard-toolbar {
    grid-template-columns: 1fr auto;
  }

  .refresh-control {
    display: contents;
  }

  .refresh-control time {
    grid-column: 1 / -1;
    grid-row: 3;
    justify-self: end;
    padding: 0 4px 2px;
  }

  .refresh-button {
    grid-column: 2;
    grid-row: 1;
    min-width: 104px;
  }

  .toolbar-period {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-self: stretch;
    grid-template-columns: 34px 1fr 34px;
  }

  .dashboard-panel {
    padding: 16px;
    border-radius: 22px;
  }

  .panel-heading {
    align-items: flex-start;
  }
}
</style>
