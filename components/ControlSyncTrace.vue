<template>
  <div
    :class="['control-sync-trace', statusClass]"
    :aria-label="ariaLabel"
    :title="ariaLabel"
    role="status"
  >
    <template v-for="(step, index) in steps" :key="step.key">
      <span
        :class="['sync-step', stepClass(step.stage)]"
        :title="step.title"
        aria-hidden="true"
      ></span>
      <span
        v-if="index < steps.length - 1"
        :class="['sync-rail', railClass(index)]"
        aria-hidden="true"
      ></span>
    </template>
  </div>
</template>

<script setup>
const props = defineProps({
  cacheStage: { type: String, default: 'idle' },
  baseStage: { type: String, default: 'idle' },
  externalStage: { type: String, default: 'idle' },
  completeStage: { type: String, default: 'idle' },
  cacheTitle: { type: String, default: '' },
  baseTitle: { type: String, default: '' },
  externalTitle: { type: String, default: '' },
  completeTitle: { type: String, default: '' },
  externalRows: { type: Number, default: 0 },
  freshness: { type: String, default: 'empty' },
  ariaLabel: { type: String, default: '' }
})

const stepClass = (stage) => ({
  active: stage === 'loading',
  done: stage === 'ready',
  empty: stage === 'empty',
  failed: stage === 'failed'
})

const formattedExternalRows = computed(() =>
  Number(props.externalRows || 0).toLocaleString('es-MX')
)

const externalTooltip = computed(() => {
  const rows = Number(props.externalRows || 0)
  const rowLabel = rows === 1 ? 'fila obtenida' : 'filas obtenidas'
  return `${props.externalTitle || 'Base externa de matrícula'} · ${formattedExternalRows.value} ${rowLabel}`
})

const steps = computed(() => [
  { key: 'cache', stage: props.cacheStage, title: props.cacheTitle || 'Caché local' },
  { key: 'base', stage: props.baseStage, title: props.baseTitle || 'Base del administrador' },
  { key: 'external', stage: props.externalStage, title: externalTooltip.value },
  { key: 'complete', stage: props.completeStage, title: props.completeTitle || 'Proceso completo' }
])

const isRailDone = (index) => steps.value.slice(0, index + 1).every((step) => step.stage === 'ready')

const railClass = (index) => ({
  done: isRailDone(index),
  active: steps.value[index + 1]?.stage === 'loading'
})

const statusClass = computed(() => ({
  'is-cache': props.freshness === 'cache',
  'is-base': props.freshness === 'base',
  'is-synced': props.freshness === 'synced',
  'is-loading': steps.value.some((step) => step.stage === 'loading'),
  'is-failed': steps.value.some((step) => step.stage === 'failed')
}))
</script>

<style scoped>
.control-sync-trace {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 20px;
  padding: 3px 7px;
  border: 1px solid rgba(216, 226, 236, 0.78);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.64);
  box-shadow: 0 6px 14px rgba(21, 35, 60, 0.032);
}

.sync-step {
  display: inline-block;
  width: 6px;
  height: 6px;
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 999px;
  background: #edf2f7;
}

.sync-step.active {
  border-color: rgba(52, 143, 59, 0.42);
  background: #3a963e;
  box-shadow: 0 0 0 4px rgba(57, 150, 62, 0.09);
  animation: controlSyncGlow 1.3s ease-in-out infinite;
}

.sync-step.done {
  border-color: rgba(52, 143, 59, 0.44);
  background: #2f9138;
}

.sync-step.empty {
  border-color: rgba(236, 165, 42, 0.36);
  background: #eeb04a;
}

.sync-step.failed {
  border-color: rgba(210, 65, 59, 0.35);
  background: #d44a43;
}

.sync-rail {
  width: 14px;
  height: 1.5px;
  border-radius: 999px;
  background: #d8e2ec;
}

.sync-rail.done {
  background: rgba(47, 145, 56, 0.82);
}

.sync-rail.active {
  background: linear-gradient(90deg, rgba(47, 145, 56, 0.72), #d8e2ec);
}

@keyframes controlSyncGlow {
  0%,
  100% {
    box-shadow: 0 0 0 3px rgba(57, 150, 62, 0.07);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(57, 150, 62, 0.12);
  }
}
</style>
