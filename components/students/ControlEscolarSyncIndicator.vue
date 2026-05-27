<template>
  <button
    v-if="isVisible"
    type="button"
    class="students-cache-sync control-escolar-sync"
    :class="statusClass"
    :title="titleText"
    aria-live="polite"
    @click="openDiagnostics"
  >
    <span class="students-cache-sync__signal" aria-hidden="true">
      <span class="students-cache-sync__packet packet-a"></span>
      <span class="students-cache-sync__packet packet-b"></span>
      <span class="students-cache-sync__packet packet-c"></span>
      <span class="students-cache-sync__spiral"></span>
      <span class="students-cache-sync__check">✓</span>
    </span>
    <span class="students-cache-sync__text">
      <span class="students-cache-sync__label">{{ label }}</span>
      <span v-if="detailText" class="students-cache-sync__detail">{{ detailText }}</span>
    </span>
  </button>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const syncState = ref({ status: 'cached', rows: 0, message: '', freshness: '' })

const isVisible = computed(() => route.path.startsWith('/control-escolar'))

const normalizedStatus = computed(() => {
  const status = String(syncState.value.status || '').toLowerCase()
  if (['syncing', 'loading', 'refreshing'].includes(status)) return 'syncing'
  if (['updated', 'ready', 'synced', 'fresh'].includes(status)) return 'updated'
  if (['stale', 'expired', 'cached'].includes(status)) return 'cached'
  if (['failed', 'error'].includes(status)) return 'failed'
  if (['unavailable', 'empty'].includes(status)) return 'unavailable'
  return 'cached'
})

const label = computed(() => {
  if (normalizedStatus.value === 'syncing') return 'Sincronizando'
  if (normalizedStatus.value === 'updated') return 'Sincronizado'
  if (normalizedStatus.value === 'failed') return 'Revisar sync'
  if (normalizedStatus.value === 'unavailable') return 'Sin datos'
  return 'Caché activo'
})

const detailText = computed(() => {
  const rows = Number(syncState.value.rows || 0)
  if (normalizedStatus.value === 'syncing') return rows > 0 ? `${rows} visibles` : 'actualizando al fondo'
  if (normalizedStatus.value === 'updated') return rows > 0 ? `${rows} registros` : 'al día'
  if (normalizedStatus.value === 'cached') return rows > 0 ? `${rows} registros` : 'local'
  if (normalizedStatus.value === 'failed') return syncState.value.message || 'diagnóstico'
  if (normalizedStatus.value === 'unavailable') return 'sin cache'
  return syncState.value.message || 'diagnóstico'
})

const titleText = computed(() => syncState.value.message || `${label.value}${detailText.value ? ` · ${detailText.value}` : ''}`)

const statusClass = computed(() => ({
  'is-cached': normalizedStatus.value === 'cached',
  'is-syncing': normalizedStatus.value === 'syncing',
  'is-updated': normalizedStatus.value === 'updated',
  'is-failed': normalizedStatus.value === 'failed',
  'is-unavailable': normalizedStatus.value === 'unavailable'
}))

const receiveState = (event) => {
  const detail = event?.detail || {}
  syncState.value = {
    status: detail.status || syncState.value.status,
    rows: Number(detail.rows ?? syncState.value.rows ?? 0),
    message: String(detail.message || ''),
    freshness: String(detail.freshness || '')
  }
}

const openDiagnostics = () => {
  if (!process.client) return
  window.dispatchEvent(new CustomEvent('control-escolar:open-sync-diagnostics'))
}

onMounted(() => {
  if (!process.client) return
  window.addEventListener('control-escolar:sync-state', receiveState)
})

onBeforeUnmount(() => {
  if (!process.client) return
  window.removeEventListener('control-escolar:sync-state', receiveState)
})
</script>

<style scoped>
.students-cache-sync {
  --sync-accent: rgba(96, 143, 67, 0.72);
  --sync-soft: rgba(96, 143, 67, 0.12);
  display: flex;
  align-items: center;
  align-self: stretch;
  justify-content: center;
  width: 100%;
  min-width: 100%;
  box-sizing: border-box;
  gap: 8px;
  min-height: 34px;
  max-width: 100%;
  margin: 1px 0 0;
  padding: 6px 10px 6px 8px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.44);
  color: rgba(74, 88, 107, 0.76);
  font-size: 0.62rem;
  font-weight: 780;
  letter-spacing: 0.035em;
  line-height: 1;
  text-transform: uppercase;
  box-shadow: 0 8px 18px rgba(39, 52, 72, 0.05);
  backdrop-filter: blur(10px);
}

.control-escolar-sync {
  cursor: pointer;
  appearance: none;
}

.control-escolar-sync:hover {
  background: rgba(255, 255, 255, 0.58);
  border-color: rgba(96, 143, 67, 0.26);
}

.students-cache-sync__signal {
  position: relative;
  width: 24px;
  height: 14px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.students-cache-sync__signal::before {
  content: '';
  position: absolute;
  left: 1px;
  right: 1px;
  top: 50%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--sync-accent), transparent);
  transform: translateY(-50%);
  opacity: 0.52;
}

.students-cache-sync__packet {
  position: absolute;
  left: 1px;
  top: 5px;
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: var(--sync-accent);
  box-shadow: 0 0 0 4px var(--sync-soft);
  opacity: 0;
}

.students-cache-sync__spiral {
  position: absolute;
  right: 2px;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 1.5px solid var(--sync-accent);
  border-left-color: transparent;
  border-bottom-color: rgba(96, 143, 67, 0.22);
  opacity: 0;
  transform: scale(0.72) rotate(-40deg);
}

.students-cache-sync__check {
  position: absolute;
  right: 1px;
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(96, 143, 67, 0.16);
  color: rgba(75, 132, 65, 0.92);
  font-size: 0.62rem;
  font-weight: 900;
  opacity: 0;
  transform: scale(0.72);
}

.students-cache-sync__text {
  display: inline-flex;
  flex: 1 1 auto;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-align: center;
}

.students-cache-sync__label,
.students-cache-sync__detail {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.students-cache-sync__detail {
  max-width: 100%;
  color: rgba(86, 101, 121, 0.52);
  font-size: 0.48rem;
  letter-spacing: 0.02em;
  text-transform: none;
}

.students-cache-sync.is-cached {
  --sync-accent: rgba(92, 122, 161, 0.72);
  --sync-soft: rgba(92, 122, 161, 0.12);
}

.students-cache-sync.is-syncing {
  --sync-accent: rgba(75, 132, 65, 0.82);
  --sync-soft: rgba(75, 132, 65, 0.14);
  border-color: rgba(96, 143, 67, 0.28);
}

.students-cache-sync.is-updated {
  --sync-accent: rgba(96, 143, 67, 0.82);
  --sync-soft: rgba(96, 143, 67, 0.15);
  border-color: rgba(96, 143, 67, 0.28);
  color: rgba(70, 114, 57, 0.82);
}

.students-cache-sync.is-failed,
.students-cache-sync.is-unavailable {
  --sync-accent: rgba(183, 112, 77, 0.86);
  --sync-soft: rgba(183, 112, 77, 0.13);
  border-color: rgba(183, 112, 77, 0.24);
  color: rgba(139, 82, 56, 0.82);
}

.students-cache-sync.is-cached .students-cache-sync__spiral {
  opacity: 0.74;
  animation: students-cache-settle 1.8s ease-in-out infinite;
}

.students-cache-sync.is-syncing .students-cache-sync__packet {
  animation: students-cache-packet 1.55s cubic-bezier(0.45, 0, 0.2, 1) infinite;
}

.students-cache-sync.is-syncing .packet-b { animation-delay: 0.24s; }
.students-cache-sync.is-syncing .packet-c { animation-delay: 0.48s; }

.students-cache-sync.is-syncing .students-cache-sync__spiral {
  opacity: 0.82;
  animation: students-cache-spiral 1.55s linear infinite;
}

.students-cache-sync.is-updated .students-cache-sync__signal::before {
  opacity: 0;
}

.students-cache-sync.is-updated .students-cache-sync__check {
  opacity: 1;
  transform: scale(1);
  transition: opacity 180ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.students-cache-sync.is-failed .students-cache-sync__spiral,
.students-cache-sync.is-unavailable .students-cache-sync__spiral {
  opacity: 0.78;
  border-left-color: var(--sync-accent);
  border-right-color: transparent;
}

@keyframes students-cache-packet {
  0% { opacity: 0; transform: translateX(0) scale(0.78); }
  18% { opacity: 1; }
  72% { opacity: 0.92; transform: translateX(14px) scale(0.94); }
  100% { opacity: 0; transform: translateX(18px) scale(0.55); }
}

@keyframes students-cache-spiral {
  0% { transform: scale(0.72) rotate(-40deg); }
  100% { transform: scale(0.72) rotate(320deg); }
}

@keyframes students-cache-settle {
  0%, 100% { transform: scale(0.76) rotate(-20deg); opacity: 0.48; }
  50% { transform: scale(0.82) rotate(20deg); opacity: 0.78; }
}

@media (prefers-reduced-motion: reduce) {
  .students-cache-sync.is-syncing .students-cache-sync__packet,
  .students-cache-sync.is-syncing .students-cache-sync__spiral,
  .students-cache-sync.is-cached .students-cache-sync__spiral {
    animation: none;
  }
}
</style>
