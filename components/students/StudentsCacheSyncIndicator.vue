<template>
  <div v-if="isVisible" class="students-cache-sync" :class="statusClass" :title="titleText" aria-live="polite">
    <span class="students-cache-sync__dot" aria-hidden="true"></span>
    <span class="students-cache-sync__copy">{{ label }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useStudentsCacheSync } from '~/composables/useStudentsCacheSync'

const route = useRoute()
const { studentsSyncState } = useStudentsCacheSync()

const isVisible = computed(() => route.path === '/' && studentsSyncState.value.status !== 'idle')

const label = computed(() => {
  if (studentsSyncState.value.status === 'syncing') return studentsSyncState.value.hasCache ? 'Actualizando' : 'Sync'
  if (studentsSyncState.value.status === 'cached') return 'Caché'
  if (studentsSyncState.value.status === 'updated') return 'Actualizado'
  if (studentsSyncState.value.status === 'failed') return studentsSyncState.value.hasCache ? 'Sin actualizar' : 'Sync falló'
  return 'Alumnos'
})

const detailText = computed(() => {
  const count = studentsSyncState.value.recordCount

  if (studentsSyncState.value.status === 'syncing') {
    return studentsSyncState.value.hasCache ? 'actualizando en segundo plano' : 'sincronizando alumnos'
  }

  if (studentsSyncState.value.status === 'failed') {
    return studentsSyncState.value.hasCache ? 'se conserva la información disponible' : 'no se pudo cargar información'
  }

  if (count > 0) return `${count} registros`
  return ''
})

const titleText = computed(() => studentsSyncState.value.message || `${label.value}${detailText.value ? ` · ${detailText.value}` : ''}`)

const statusClass = computed(() => ({
  'is-cached': studentsSyncState.value.status === 'cached',
  'is-syncing': studentsSyncState.value.status === 'syncing',
  'is-updated': studentsSyncState.value.status === 'updated',
  'is-failed': studentsSyncState.value.status === 'failed'
}))
</script>

<style scoped>
.students-cache-sync {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 5px;
  min-height: 16px;
  max-width: 100%;
  margin: -2px 0 0 4px;
  color: rgba(86, 101, 121, 0.62);
  font-size: 0.56rem;
  font-weight: 740;
  letter-spacing: 0.035em;
  line-height: 1;
  text-transform: uppercase;
  opacity: 0.64;
}

.students-cache-sync__dot {
  width: 4px;
  height: 4px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgba(116, 131, 151, 0.58);
}

.students-cache-sync__copy {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.students-cache-sync.is-syncing .students-cache-sync__dot {
  background: rgba(75, 132, 65, 0.58);
  animation: students-cache-breathe 2.8s ease-in-out infinite;
}

.students-cache-sync.is-updated .students-cache-sync__dot {
  background: rgba(96, 143, 67, 0.5);
}

.students-cache-sync.is-failed .students-cache-sync__dot {
  background: rgba(183, 112, 77, 0.52);
}

@keyframes students-cache-breathe {
  0%, 100% { opacity: 0.34; }
  50% { opacity: 0.78; }
}

@media (prefers-reduced-motion: reduce) {
  .students-cache-sync.is-syncing .students-cache-sync__dot {
    animation: none;
  }
}
</style>
