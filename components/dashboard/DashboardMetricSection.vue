<template>
  <section class="dashboard-panel metric-panel" :class="`${period}-panel`">
    <header class="panel-heading">
      <div>
        <span>{{ label }}</span>
        <strong>{{ currency(total) }}</strong>
      </div>
      <div class="panel-meta">
        <time>{{ dateLabel }}</time>
        <b>{{ integer(movements) }}</b>
      </div>
    </header>

    <div class="plantel-chart" :aria-busy="loading || refreshing">
      <template v-if="loading">
        <article
          v-for="(plantel, index) in planteles"
          :key="`skeleton-${plantel.plantel}`"
          class="plantel-bar skeleton-bar"
        >
          <div class="skeleton-value" />
          <div class="bar-stage">
            <span :style="{ height: `${24 + ((index * 13) % 64)}%` }" />
          </div>
          <div class="skeleton-code" />
        </article>
      </template>

      <template v-else>
        <article
          v-for="plantel in planteles"
          :key="plantel.plantel"
          class="plantel-bar"
          :class="{ offline: plantel.status !== 'online' }"
          :style="barStyle(plantel)"
          :aria-label="barLabel(plantel)"
        >
          <strong>{{ plantel.status === 'online' ? currency(valueFor(plantel)) : '—' }}</strong>

          <div
            class="bar-stage"
            role="progressbar"
            :aria-label="plantel.plantel"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="Math.round(percentFor(plantel))"
          >
            <span class="bar-fill" />
            <i class="bar-cap" />
          </div>

          <footer>
            <b>{{ plantel.plantel }}</b>
            <small>{{ plantel.status === 'online' ? integer(movementsFor(plantel)) : '—' }}</small>
          </footer>
        </article>
      </template>

      <div v-if="refreshing" class="refresh-layer" aria-label="Cargando">
        <span />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type PlantelMetric = {
  plantel: string
  status: 'online' | 'offline'
  dayTotal: number
  monthTotal: number
  dayMovements: number
  monthMovements: number
}

const props = defineProps<{
  period: 'day' | 'month'
  label: string
  dateLabel: string
  total: number
  movements: number
  planteles: PlantelMetric[]
  loading: boolean
  refreshing: boolean
}>()

const palette: Record<string, string> = {
  PM: '#14b8a6',
  PT: '#3b82f6',
  SM: '#8b5cf6',
  ST: '#ec4899',
  PREEM: '#f59e0b',
  CT: '#10b981',
  GM: '#f43f5e',
  CO: '#0ea5e9',
  DC: '#a855f7'
}

const currencyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
})
const integerFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 })

const currency = (value: number) => currencyFormatter.format(Number(value || 0))
const integer = (value: number) => integerFormatter.format(Number(value || 0))
const valueFor = (plantel: PlantelMetric) => props.period === 'day' ? plantel.dayTotal : plantel.monthTotal
const movementsFor = (plantel: PlantelMetric) => props.period === 'day' ? plantel.dayMovements : plantel.monthMovements

const maximum = computed(() => Math.max(
  0,
  ...props.planteles
    .filter(plantel => plantel.status === 'online')
    .map(plantel => Math.max(0, valueFor(plantel)))
))

const percentFor = (plantel: PlantelMetric) => {
  if (plantel.status !== 'online' || maximum.value <= 0) return 0
  return Math.min(100, Math.max(0, (valueFor(plantel) / maximum.value) * 100))
}

const barStyle = (plantel: PlantelMetric) => ({
  '--plantel-accent': palette[plantel.plantel] || '#64748b',
  '--bar-height': `${percentFor(plantel)}%`,
  '--bar-opacity': percentFor(plantel) > 0 ? '0.72' : '0'
})

const barLabel = (plantel: PlantelMetric) => {
  if (plantel.status !== 'online') return `${plantel.plantel}, sin conexión`
  return `${plantel.plantel}, ${currency(valueFor(plantel))}, ${integer(movementsFor(plantel))} movimientos`
}
</script>

<style scoped>
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
  color: #0f172a;
  font-size: clamp(1.75rem, 3vw, 3rem);
  font-weight: 850;
  letter-spacing: -0.055em;
  line-height: 1;
}

.panel-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #64748b;
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

.plantel-chart {
  position: relative;
  display: grid;
  grid-template-columns: repeat(9, minmax(68px, 1fr));
  align-items: end;
  gap: clamp(6px, 0.9vw, 12px);
  min-width: 0;
  min-height: 228px;
  padding: 3px 2px 0;
}

.plantel-bar {
  --plantel-accent: #64748b;
  --bar-height: 0%;
  display: grid;
  grid-template-rows: 27px minmax(132px, 1fr) 34px;
  gap: 8px;
  min-width: 0;
  height: 218px;
  transition: opacity 180ms ease;
}

.plantel-bar > strong {
  align-self: end;
  overflow: hidden;
  color: #1e293b;
  font-size: clamp(0.64rem, 0.92vw, 0.83rem);
  font-weight: 850;
  letter-spacing: -0.035em;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-stage {
  position: relative;
  align-self: stretch;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.13);
  border-radius: 16px 16px 10px 10px;
  background:
    linear-gradient(to top, rgba(148, 163, 184, 0.09) 1px, transparent 1px) 0 100% / 100% 25%,
    linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(241, 245, 249, 0.72));
}

.bar-fill {
  position: absolute;
  inset: auto 7px 0;
  height: var(--bar-height);
  min-height: 0;
  border-radius: 10px 10px 7px 7px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--plantel-accent) 74%, white), var(--plantel-accent));
  box-shadow: 0 -8px 24px color-mix(in srgb, var(--plantel-accent) 17%, transparent);
  transition: height 560ms cubic-bezier(.2,.8,.2,1);
}

.bar-cap {
  position: absolute;
  right: 7px;
  bottom: var(--bar-height);
  left: 7px;
  height: 2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--plantel-accent) 76%, white);
  opacity: var(--bar-opacity, 0);
  transform: translateY(1px);
  transition: bottom 560ms cubic-bezier(.2,.8,.2,1), opacity 160ms ease;
}

.plantel-bar footer {
  display: grid;
  place-items: center;
  align-content: start;
  gap: 2px;
  min-width: 0;
}

.plantel-bar footer b {
  color: var(--plantel-accent);
  font-size: 0.7rem;
  font-weight: 950;
  letter-spacing: 0.09em;
}

.plantel-bar footer small {
  color: #94a3b8;
  font-size: 0.62rem;
  font-weight: 800;
}

.plantel-bar.offline {
  filter: grayscale(0.6);
  opacity: 0.38;
}

.plantel-bar.offline .bar-fill,
.plantel-bar.offline .bar-cap {
  display: none;
}

.skeleton-bar {
  opacity: 0.68;
}

.skeleton-value,
.skeleton-code,
.skeleton-bar .bar-stage span {
  position: relative;
  overflow: hidden;
  border-radius: 999px;
  background: #e8edf2;
}

.skeleton-value::after,
.skeleton-code::after,
.skeleton-bar .bar-stage span::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.82), transparent);
  transform: translateX(-100%);
  animation: skeleton-wave 1.15s infinite;
}

.skeleton-value {
  align-self: end;
  justify-self: center;
  width: 76%;
  height: 10px;
}

.skeleton-code {
  justify-self: center;
  width: 38%;
  height: 8px;
}

.skeleton-bar .bar-stage span {
  position: absolute;
  right: 8px;
  bottom: 0;
  left: 8px;
  border-radius: 10px 10px 7px 7px;
}

.refresh-layer {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.52);
  backdrop-filter: blur(2px);
}

.refresh-layer span {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(15, 118, 110, 0.14);
  border-top-color: #0f766e;
  border-radius: 999px;
  animation: metric-spin 700ms linear infinite;
}

@keyframes skeleton-wave {
  to { transform: translateX(100%); }
}

@keyframes metric-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 980px) {
  .plantel-chart {
    grid-template-columns: repeat(9, 84px);
    overflow-x: auto;
    padding-bottom: 8px;
    scrollbar-width: thin;
  }
}

@media (max-width: 760px) {
  .dashboard-panel {
    padding: 16px;
    border-radius: 22px;
  }

  .panel-heading {
    align-items: flex-start;
  }

  .plantel-chart {
    grid-template-columns: repeat(9, 78px);
    min-height: 208px;
  }

  .plantel-bar {
    grid-template-rows: 25px minmax(118px, 1fr) 32px;
    height: 198px;
  }
}
</style>
