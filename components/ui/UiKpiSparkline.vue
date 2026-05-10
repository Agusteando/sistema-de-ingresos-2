<template>
  <span v-if="isRenderable" class="ui-kpi-sparkline" aria-hidden="true">
    <svg viewBox="0 0 132 62" focusable="false">
      <path class="ui-kpi-sparkline__area" :d="areaPath" />
      <path class="ui-kpi-sparkline__line" :d="linePath" pathLength="1" />
      <circle
        v-for="point in visiblePoints"
        :key="point.key"
        class="ui-kpi-sparkline__point"
        :cx="point.x"
        :cy="point.y"
        r="2.1"
      />
    </svg>
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  values: { type: Array, default: () => [] }
})

const VIEWBOX_WIDTH = 132
const VIEWBOX_HEIGHT = 62
const PADDING_X = 6
const PADDING_TOP = 8
const PADDING_BOTTOM = 8
const CHART_HEIGHT = VIEWBOX_HEIGHT - PADDING_TOP - PADDING_BOTTOM

const numericValues = computed(() => props.values
  .map(value => Number(value))
  .filter(value => Number.isFinite(value))
)

const isRenderable = computed(() => numericValues.value.length >= 2)

const plottedPoints = computed(() => {
  const values = numericValues.value
  if (values.length < 2) return []

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  const stepX = (VIEWBOX_WIDTH - (PADDING_X * 2)) / (values.length - 1)
  const flatY = PADDING_TOP + CHART_HEIGHT * 0.52

  return values.map((value, index) => {
    const ratio = range === 0 ? null : (value - min) / range
    return {
      key: `${index}-${value}`,
      x: PADDING_X + stepX * index,
      y: ratio === null ? flatY : PADDING_TOP + (1 - ratio) * CHART_HEIGHT
    }
  })
})

const linePath = computed(() => {
  const points = plottedPoints.value
  if (!points.length) return ''
  if (points.length === 2) return `M${points[0].x} ${points[0].y} L${points[1].x} ${points[1].y}`

  return points.reduce((path, point, index) => {
    if (index === 0) return `M${point.x} ${point.y}`
    const previous = points[index - 1]
    const controlX = previous.x + (point.x - previous.x) / 2
    return `${path} C${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`
  }, '')
})

const areaPath = computed(() => {
  const points = plottedPoints.value
  if (!points.length || !linePath.value) return ''
  const first = points[0]
  const last = points[points.length - 1]
  return `${linePath.value} L${last.x} ${VIEWBOX_HEIGHT} L${first.x} ${VIEWBOX_HEIGHT} Z`
})

const visiblePoints = computed(() => {
  const points = plottedPoints.value
  if (points.length <= 3) return points
  return [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]]
})
</script>
