<template>
  <div
    :class="['control-sync-trace', statusClass]"
    :aria-label="ariaLabel"
    :title="ariaLabel"
    role="status"
  >
    <span
      :class="['sync-step', stepClass(baseStage)]"
      :title="baseTitle"
      aria-hidden="true"
    ></span>
    <span class="sync-rail" aria-hidden="true"></span>
    <span
      :class="['sync-step', stepClass(enrichmentStage)]"
      :title="enrichmentTooltip"
      aria-hidden="true"
    ></span>
    <span
      class="sync-freshness"
      :title="freshnessTitle"
      aria-hidden="true"
    ></span>
  </div>
</template>

<script setup>
const props = defineProps({
  baseStage: { type: String, default: 'idle' },
  enrichmentStage: { type: String, default: 'idle' },
  freshness: { type: String, default: 'empty' },
  baseTitle: { type: String, default: '' },
  enrichmentTitle: { type: String, default: '' },
  freshnessTitle: { type: String, default: '' },
  enrichmentRows: { type: Number, default: 0 },
  ariaLabel: { type: String, default: '' }
})

const stepClass = (stage) => ({
  active: stage === 'loading',
  done: stage === 'ready',
  failed: stage === 'failed'
})

const formattedEnrichmentRows = computed(() =>
  Number(props.enrichmentRows || 0).toLocaleString('es-MX')
)

const enrichmentTooltip = computed(() => {
  const rows = Number(props.enrichmentRows || 0)
  const rowLabel = rows === 1 ? 'fila obtenida' : 'filas obtenidas'
  return `${props.enrichmentTitle || 'Enriquecimiento de matrícula'} · ${formattedEnrichmentRows.value} ${rowLabel}`
})

const statusClass = computed(() => ({
  'is-cache': props.freshness === 'cache',
  'is-base': props.freshness === 'base',
  'is-synced': props.freshness === 'synced',
  'is-loading': props.baseStage === 'loading' || props.enrichmentStage === 'loading',
  'is-failed': props.baseStage === 'failed' || props.enrichmentStage === 'failed'
}))
</script>

<style scoped>
.control-sync-trace {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 3px 8px;
  border: 1px solid rgba(216, 226, 236, 0.88);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 6px 14px rgba(21, 35, 60, 0.035);
}

.sync-step {
  display: inline-block;
  width: 8px;
  height: 8px;
  border: 1px solid rgba(148, 163, 184, 0.55);
  border-radius: 999px;
  background: #eef3f7;
}

.sync-step.active {
  border-color: rgba(52, 143, 59, 0.45);
  background: #3a963e;
  box-shadow: 0 0 0 5px rgba(57, 150, 62, 0.1);
  animation: controlSyncGlow 1.3s ease-in-out infinite;
}

.sync-step.done {
  border-color: rgba(52, 143, 59, 0.45);
  background: #2f9138;
}

.sync-step.failed {
  border-color: rgba(210, 65, 59, 0.35);
  background: #d44a43;
}

.sync-rail {
  width: 22px;
  height: 2px;
  border-radius: 999px;
  background: #d8e2ec;
}

.control-sync-trace.is-base .sync-rail,
.control-sync-trace.is-cache .sync-rail {
  background: linear-gradient(90deg, rgba(47, 145, 56, 0.68), #d8e2ec);
}

.control-sync-trace.is-synced .sync-rail {
  background: #2f9138;
}

.sync-freshness {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: #cbd5e1;
}

.control-sync-trace.is-cache .sync-freshness {
  background: #eca52a;
}

.control-sync-trace.is-base .sync-freshness,
.control-sync-trace.is-loading .sync-freshness {
  background: #3f86d8;
}

.control-sync-trace.is-synced .sync-freshness {
  background: #2f9138;
}

.control-sync-trace.is-failed .sync-freshness {
  background: #d44a43;
}

@keyframes controlSyncGlow {
  0%,
  100% {
    box-shadow: 0 0 0 4px rgba(57, 150, 62, 0.08);
  }
  50% {
    box-shadow: 0 0 0 7px rgba(57, 150, 62, 0.14);
  }
}
</style>
