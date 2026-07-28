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

    <div class="plantel-grid" :aria-busy="loading || refreshing">
      <template v-if="loading">
        <article v-for="plantel in planteles" :key="`skeleton-${plantel.plantel}`" class="plantel-card skeleton-card">
          <div class="skeleton-line short" />
          <div class="skeleton-line total" />
          <div class="skeleton-line bar" />
        </article>
      </template>

      <template v-else>
        <article
          v-for="plantel in planteles"
          :key="plantel.plantel"
          class="plantel-card"
          :class="{ offline: plantel.status !== 'online' }"
          :style="cardStyle(plantel.plantel)"
        >
          <div class="plantel-card-head">
            <span>{{ plantel.plantel }}</span>
            <i :title="plantel.status === 'online' ? 'En línea' : 'Sin conexión'" />
          </div>

          <strong>{{ plantel.status === 'online' ? currency(valueFor(plantel)) : '—' }}</strong>

          <div class="progress-track" aria-hidden="true">
            <span :style="{ width: `${progressFor(plantel)}%` }" />
          </div>

          <small>{{ plantel.status === 'online' ? integer(movementsFor(plantel)) : '—' }}</small>
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
  1,
  ...props.planteles
    .filter(plantel => plantel.status === 'online')
    .map(plantel => valueFor(plantel))
))

const progressFor = (plantel: PlantelMetric) => {
  if (plantel.status !== 'online') return 0
  const value = valueFor(plantel)
  if (value <= 0) return 0
  return Math.max(4, Math.min(100, (value / maximum.value) * 100))
}

const cardStyle = (plantel: string) => ({
  '--plantel-accent': palette[plantel] || '#64748b'
})
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

.plantel-grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(9, minmax(102px, 1fr));
  gap: 9px;
  min-width: 0;
  overflow-x: auto;
  padding: 2px 1px 7px;
  scrollbar-width: thin;
}

.plantel-card {
  --plantel-accent: #64748b;
  position: relative;
  min-width: 102px;
  min-height: 132px;
  overflow: hidden;
  padding: 14px 13px 12px;
  border: 1px solid color-mix(in srgb, var(--plantel-accent) 18%, rgba(148, 163, 184, 0.2));
  border-radius: 19px;
  background:
    linear-gradient(160deg, color-mix(in srgb, var(--plantel-accent) 8%, white), rgba(255, 255, 255, 0.9));
  box-shadow: 0 9px 22px rgba(15, 23, 42, 0.045);
  transition: transform 170ms ease, box-shadow 170ms ease, border-color 170ms ease;
}

.plantel-card::before {
  content: '';
  position: absolute;
  inset: 0 auto auto 0;
  width: 100%;
  height: 3px;
  background: linear-gradient(90deg, var(--plantel-accent), color-mix(in srgb, var(--plantel-accent) 25%, transparent));
}

.plantel-card:hover:not(.offline) {
  z-index: 2;
  border-color: color-mix(in srgb, var(--plantel-accent) 34%, transparent);
  box-shadow: 0 16px 30px color-mix(in srgb, var(--plantel-accent) 10%, rgba(15, 23, 42, 0.08));
  transform: translateY(-3px);
}

.plantel-card.offline {
  filter: grayscale(0.35);
  opacity: 0.48;
}

.plantel-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.plantel-card-head span {
  color: #334155;
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.11em;
}

.plantel-card-head i {
  width: 7px;
  height: 7px;
  border: 2px solid white;
  border-radius: 999px;
  background: var(--plantel-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--plantel-accent) 14%, transparent);
}

.plantel-card.offline .plantel-card-head i {
  background: #94a3b8;
  box-shadow: none;
}

.plantel-card > strong {
  display: block;
  min-height: 30px;
  margin-top: 15px;
  overflow: hidden;
  color: #0f172a;
  font-size: clamp(0.82rem, 1.15vw, 1.08rem);
  font-weight: 850;
  letter-spacing: -0.04em;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-track {
  height: 6px;
  margin-top: 14px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.14);
}

.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, color-mix(in srgb, var(--plantel-accent) 70%, white), var(--plantel-accent));
  box-shadow: 0 0 12px color-mix(in srgb, var(--plantel-accent) 28%, transparent);
  transition: width 460ms cubic-bezier(.2,.8,.2,1);
}

.plantel-card small {
  display: block;
  margin-top: 8px;
  color: #94a3b8;
  font-size: 0.65rem;
  font-weight: 800;
}

.skeleton-card {
  border-color: rgba(148, 163, 184, 0.12);
  background: rgba(248, 250, 252, 0.88);
}

.skeleton-card::before {
  display: none;
}

.skeleton-line {
  position: relative;
  overflow: hidden;
  height: 8px;
  border-radius: 999px;
  background: #e8edf2;
}

.skeleton-line::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.78), transparent);
  transform: translateX(-100%);
  animation: skeleton-wave 1.15s infinite;
}

.skeleton-line.short { width: 34%; }
.skeleton-line.total { width: 82%; height: 18px; margin-top: 20px; }
.skeleton-line.bar { width: 100%; margin-top: 22px; }

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

@media (max-width: 760px) {
  .dashboard-panel {
    padding: 16px;
    border-radius: 22px;
  }

  .panel-heading {
    align-items: flex-start;
  }

  .plantel-grid {
    grid-template-columns: repeat(9, 112px);
  }
}
</style>
