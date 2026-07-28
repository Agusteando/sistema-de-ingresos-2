<template>
  <div class="plantel-line-chart" :class="{ 'is-loading': loading }">
    <div class="chart-legend" aria-label="Planteles">
      <span
        v-for="item in series"
        :key="item.plantel"
        class="legend-item"
        :class="{ offline: item.status !== 'online' }"
      >
        <i :style="{ '--series-color': colorFor(item.plantel) }" />
        {{ item.plantel }}
      </span>
    </div>

    <div ref="stageRef" class="chart-stage">
      <svg
        ref="svgRef"
        class="chart-svg"
        :viewBox="`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`"
        role="img"
        aria-label="Cobros por periodo y plantel"
        @pointermove="handlePointerMove"
        @pointerleave="hoveredIndex = null"
      >
        <defs>
          <linearGradient id="dashboard-chart-surface" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(255,255,255,0.95)" />
            <stop offset="100%" stop-color="rgba(248,250,252,0.2)" />
          </linearGradient>
        </defs>

        <rect
          :x="PLOT_LEFT"
          :y="PLOT_TOP"
          :width="plotWidth"
          :height="plotHeight"
          rx="20"
          fill="url(#dashboard-chart-surface)"
        />

        <g class="chart-grid">
          <template v-for="tick in yTicks" :key="`y-${tick.value}`">
            <line
              :x1="PLOT_LEFT"
              :x2="PLOT_LEFT + plotWidth"
              :y1="tick.y"
              :y2="tick.y"
            />
            <text :x="PLOT_LEFT - 12" :y="tick.y + 4" text-anchor="end">
              {{ compactCurrency(tick.value) }}
            </text>
          </template>

          <template v-for="tick in xTicks" :key="`x-${tick.index}`">
            <line
              :x1="xFor(tick.index)"
              :x2="xFor(tick.index)"
              :y1="PLOT_TOP"
              :y2="PLOT_TOP + plotHeight"
              class="vertical"
            />
            <text
              :x="xFor(tick.index)"
              :y="PLOT_TOP + plotHeight + 27"
              text-anchor="middle"
            >
              {{ tick.label }}
            </text>
          </template>
        </g>

        <g class="chart-series">
          <path
            v-for="item in series"
            :key="`path-${item.plantel}`"
            :d="pathFor(item.values)"
            fill="none"
            :stroke="colorFor(item.plantel)"
            :class="{ offline: item.status !== 'online' }"
            vector-effect="non-scaling-stroke"
          />
        </g>

        <g v-if="hoveredIndex !== null" class="chart-hover">
          <line
            :x1="xFor(hoveredIndex)"
            :x2="xFor(hoveredIndex)"
            :y1="PLOT_TOP"
            :y2="PLOT_TOP + plotHeight"
          />
          <circle
            v-for="item in onlineSeries"
            :key="`hover-${item.plantel}`"
            :cx="xFor(hoveredIndex)"
            :cy="yFor(item.values[hoveredIndex] || 0)"
            r="4.5"
            :fill="colorFor(item.plantel)"
          />
        </g>
      </svg>

      <div
        v-if="hoveredIndex !== null"
        class="chart-tooltip"
        :class="{ right: tooltipOnRight }"
        :style="tooltipStyle"
      >
        <strong>{{ labels[hoveredIndex] }}</strong>
        <div class="tooltip-grid">
          <span v-for="item in series" :key="`tip-${item.plantel}`" :class="{ offline: item.status !== 'online' }">
            <i :style="{ '--series-color': colorFor(item.plantel) }" />
            <b>{{ item.plantel }}</b>
            <em>{{ item.status === 'online' ? currency(item.values[hoveredIndex] || 0) : '—' }}</em>
          </span>
        </div>
      </div>

      <div v-if="loading" class="chart-loading" aria-label="Cargando">
        <span />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

type ChartSeries = {
  plantel: string
  values: number[]
  status?: 'online' | 'offline'
}

const props = withDefaults(defineProps<{
  labels: string[]
  series: ChartSeries[]
  loading?: boolean
}>(), {
  loading: false
})

const VIEW_WIDTH = 1040
const VIEW_HEIGHT = 340
const PLOT_LEFT = 72
const PLOT_RIGHT = 24
const PLOT_TOP = 22
const PLOT_BOTTOM = 48
const plotWidth = VIEW_WIDTH - PLOT_LEFT - PLOT_RIGHT
const plotHeight = VIEW_HEIGHT - PLOT_TOP - PLOT_BOTTOM

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

const svgRef = ref<SVGSVGElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
const hoveredIndex = ref<number | null>(null)

const colorFor = (plantel: string) => palette[plantel] || '#64748b'
const onlineSeries = computed(() => props.series.filter(item => item.status !== 'offline'))

const rawMax = computed(() => Math.max(
  0,
  ...onlineSeries.value.flatMap(item => item.values.map(value => Number(value || 0)))
))

const niceMaximum = computed(() => {
  const value = rawMax.value
  if (value <= 0) return 1000
  const power = 10 ** Math.floor(Math.log10(value))
  const scaled = value / power
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
  return nice * power
})

const yTicks = computed(() => Array.from({ length: 5 }, (_, index) => {
  const value = niceMaximum.value * (index / 4)
  return {
    value,
    y: PLOT_TOP + plotHeight - (index / 4) * plotHeight
  }
}).reverse())

const xTicks = computed(() => {
  const count = props.labels.length
  if (!count) return []
  const desired = Math.min(7, count)
  const indexes = new Set<number>()
  for (let index = 0; index < desired; index += 1) {
    indexes.add(Math.round((index / Math.max(1, desired - 1)) * (count - 1)))
  }
  return Array.from(indexes).sort((a, b) => a - b).map(index => ({
    index,
    label: props.labels[index]
  }))
})

const xFor = (index: number) => {
  const denominator = Math.max(1, props.labels.length - 1)
  return PLOT_LEFT + (index / denominator) * plotWidth
}

const yFor = (value: number) => {
  const safe = Math.max(0, Number(value || 0))
  return PLOT_TOP + plotHeight - (safe / niceMaximum.value) * plotHeight
}

const pathFor = (values: number[]) => values.map((value, index) => (
  `${index === 0 ? 'M' : 'L'} ${xFor(index).toFixed(2)} ${yFor(value).toFixed(2)}`
)).join(' ')

const currencyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
})

const compactFormatter = new Intl.NumberFormat('es-MX', {
  notation: 'compact',
  maximumFractionDigits: 1
})

const currency = (value: number) => currencyFormatter.format(Number(value || 0))
const compactCurrency = (value: number) => `$${compactFormatter.format(Number(value || 0))}`

const handlePointerMove = (event: PointerEvent) => {
  if (!svgRef.value || !props.labels.length) return
  const rect = svgRef.value.getBoundingClientRect()
  const viewX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * VIEW_WIDTH
  const ratio = Math.min(1, Math.max(0, (viewX - PLOT_LEFT) / plotWidth))
  hoveredIndex.value = Math.round(ratio * Math.max(0, props.labels.length - 1))
}

const tooltipOnRight = computed(() => {
  if (hoveredIndex.value === null) return false
  return hoveredIndex.value > (props.labels.length - 1) / 2
})

const tooltipStyle = computed(() => {
  if (hoveredIndex.value === null) return {}
  const left = (xFor(hoveredIndex.value) / VIEW_WIDTH) * 100
  return { left: `${left}%` }
})
</script>

<style scoped>
.plantel-line-chart {
  min-width: 0;
}

.chart-legend {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 0 2px 14px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 25px;
  padding: 0 9px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 999px;
  color: #334155;
  background: rgba(255, 255, 255, 0.72);
  font-size: 0.69rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.legend-item i,
.tooltip-grid i {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--series-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--series-color) 15%, transparent);
}

.legend-item.offline {
  opacity: 0.35;
}

.chart-stage {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 24px;
  background:
    radial-gradient(circle at 12% 0%, rgba(20, 184, 166, 0.08), transparent 28%),
    radial-gradient(circle at 88% 100%, rgba(139, 92, 246, 0.08), transparent 34%),
    rgba(255, 255, 255, 0.8);
}

.chart-svg {
  display: block;
  width: 100%;
  min-width: 720px;
  height: auto;
  touch-action: none;
}

.chart-grid line {
  stroke: rgba(148, 163, 184, 0.2);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.chart-grid line.vertical {
  stroke: rgba(148, 163, 184, 0.11);
  stroke-dasharray: 3 7;
}

.chart-grid text {
  fill: #94a3b8;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.chart-series path {
  stroke-width: 2.45;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.86;
  transition: opacity 160ms ease, stroke-width 160ms ease;
}

.chart-series path.offline {
  opacity: 0.08;
  stroke-dasharray: 3 8;
}

.chart-stage:hover .chart-series path:not(.offline) {
  opacity: 0.95;
  stroke-width: 2.8;
}

.chart-hover line {
  stroke: rgba(15, 23, 42, 0.22);
  stroke-width: 1;
  stroke-dasharray: 4 5;
  vector-effect: non-scaling-stroke;
}

.chart-hover circle {
  stroke: white;
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}

.chart-tooltip {
  position: absolute;
  z-index: 4;
  top: 18px;
  transform: translateX(14px);
  width: min(360px, calc(100% - 32px));
  padding: 13px 14px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.92);
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.22);
  color: white;
  pointer-events: none;
  backdrop-filter: blur(14px);
}

.chart-tooltip.right {
  transform: translateX(calc(-100% - 14px));
}

.chart-tooltip > strong {
  display: block;
  margin-bottom: 9px;
  color: #f8fafc;
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tooltip-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px 10px;
}

.tooltip-grid span {
  display: grid;
  grid-template-columns: 7px auto;
  align-items: center;
  gap: 2px 6px;
  min-width: 0;
}

.tooltip-grid span.offline {
  opacity: 0.34;
}

.tooltip-grid b {
  font-size: 0.66rem;
  letter-spacing: 0.06em;
}

.tooltip-grid em {
  grid-column: 2;
  overflow: hidden;
  color: #cbd5e1;
  font-size: 0.68rem;
  font-style: normal;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chart-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(248, 250, 252, 0.66);
  backdrop-filter: blur(2px);
}

.chart-loading span {
  width: 30px;
  height: 30px;
  border: 3px solid rgba(15, 118, 110, 0.15);
  border-top-color: #0f766e;
  border-radius: 999px;
  animation: chart-spin 700ms linear infinite;
}

@keyframes chart-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 760px) {
  .chart-stage {
    overflow-x: auto;
  }

  .chart-tooltip {
    position: sticky;
    left: 12px !important;
    top: 12px;
    transform: none !important;
  }
}
</style>
