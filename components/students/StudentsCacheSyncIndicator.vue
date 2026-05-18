<template>
  <div v-if="isVisible" class="students-cache-sync" :class="statusClass" :title="titleText" aria-live="polite">
    <span class="students-cache-sync__dot" aria-hidden="true"></span>
    <span class="students-cache-sync__copy">
      <strong>{{ label }}</strong>
      <small v-if="detailText">{{ detailText }}</small>
    </span>
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
  if (studentsSyncState.value.status === 'syncing') return studentsSyncState.value.hasCache ? 'Caché + sync' : 'Sincronizando'
  if (studentsSyncState.value.status === 'cached') return 'Datos en caché'
  if (studentsSyncState.value.status === 'updated') return 'Alumnos actualizados'
  if (studentsSyncState.value.status === 'failed') return studentsSyncState.value.hasCache ? 'Caché disponible' : 'Sync falló'
  return 'Alumnos'
})

const detailText = computed(() => {
  const count = studentsSyncState.value.recordCount

  if (studentsSyncState.value.status === 'syncing') {
    return studentsSyncState.value.hasCache ? 'Actualizando en segundo plano' : 'Cargando datos'
  }

  if (studentsSyncState.value.status === 'failed') {
    return 'No se pudo actualizar'
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
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  border: 1px solid rgba(210, 225, 213, 0.64);
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.58);
  color: #617087;
  padding: 6px 9px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
}

.students-cache-sync__dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #a9b6c8;
}

.students-cache-sync__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
  line-height: 1.1;
}

.students-cache-sync strong {
  overflow: hidden;
  color: #48566d;
  font-size: 0.62rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.students-cache-sync small {
  overflow: hidden;
  color: #7a8799;
  font-size: 0.56rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.students-cache-sync.is-syncing .students-cache-sync__dot {
  background: #5b8f49;
  animation: students-cache-pulse 1.4s ease-in-out infinite;
}

.students-cache-sync.is-updated .students-cache-sync__dot {
  background: #7fb24e;
}

.students-cache-sync.is-failed .students-cache-sync__dot {
  background: #c77a55;
}

@keyframes students-cache-pulse {
  0%, 100% {
    opacity: 0.42;
    transform: scale(0.86);
  }

  50% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
