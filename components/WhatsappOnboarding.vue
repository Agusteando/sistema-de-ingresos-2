<template>
  <section class="card whatsapp-onboarding" :class="{ compact }">
    <div class="wa-head">
      <div class="wa-title">
        <div class="wa-icon"><LucideMessageCircle :size="18" /></div>
        <div>
          <h3>WhatsApp Cobranza</h3>
          <p>{{ activeClient ? activeClient.display_name || activeClient.client_id : 'Preparación de cuenta' }}</p>
        </div>
      </div>
      <span class="badge" :class="statusBadgeClass">{{ statusLabel }}</span>
    </div>

    <div v-if="autoStart && !isReady" class="wa-guide">
      <strong>Preparación automática</strong>
      <span>El sistema prepara la instancia y muestra el QR cuando esté disponible. El envío a familias siempre requiere una acción manual.</span>
    </div>

    <div v-if="!activeClient" class="wa-grid">
      <div class="wa-field">
        <label class="form-label">Nombre visible</label>
        <input v-model="displayName" class="input-field" placeholder="Cobranza IECS IEDIS">
      </div>
      <button class="btn btn-primary wa-action" :disabled="loading || !displayName.trim()" @click="createInstance">
        <LucidePlus :size="16" /> Crear instancia
      </button>
    </div>

    <div v-else class="wa-body">
      <div class="wa-config" v-if="!compact">
        <div class="wa-field">
          <label class="form-label">Nombre visible</label>
          <input v-model="displayName" class="input-field" placeholder="Cobranza IECS IEDIS">
        </div>
        <button class="btn btn-outline" :disabled="configLoading || !displayName.trim()" @click="saveConfiguration">
          <LucideSave :size="16" /> Guardar
        </button>
      </div>

      <div class="wa-actions">
        <button class="btn btn-secondary" :disabled="qrLoading" @click="showQr(false)">
          <LucideQrCode :size="16" /> Mostrar QR
        </button>
        <button class="btn btn-outline" :disabled="qrLoading" @click="showQr(true)">
          <LucideRefreshCw :size="16" :class="{ 'animate-spin': qrLoading }" /> Nuevo QR
        </button>
        <button class="btn btn-outline" :disabled="statusLoading" @click="checkStatus">
          <LucideWifi :size="16" /> Revisar sesión
        </button>
      </div>

      <div v-if="qrVisible" class="wa-qr-wrap">
        <div class="wa-qr">
          <img v-if="qrImageSrc" :src="qrImageSrc" alt="QR WhatsApp" />
          <div v-else-if="qrSvg" class="wa-qr-svg" v-html="qrSvg"></div>
          <div v-else class="wa-empty">
            <LucideQrCode :size="30" />
          </div>
        </div>
        <div class="wa-qr-meta">
          <strong>{{ qrStatusLabel }}</strong>
          <span>{{ activeClient.client_id }}</span>
        </div>
      </div>

      <div v-if="lastMessage" class="wa-message" :class="{ 'wa-message-error': lastMessageType === 'danger' }">
        {{ lastMessage }}
      </div>
    </div>

    <div v-if="showSkip" class="wa-footer">
      <button class="btn btn-ghost" @click="$emit('skip')">Omitir</button>
      <button class="btn btn-primary" :disabled="!isReady" @click="$emit('ready')">
        <LucideCheckCircle :size="16" /> Continuar
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { renderSVG } from 'uqr'
import {
  LucideCheckCircle,
  LucideMessageCircle,
  LucidePlus,
  LucideQrCode,
  LucideRefreshCw,
  LucideSave,
  LucideWifi
} from 'lucide-vue-next'
import { useCookie } from '#app'

const props = defineProps({
  showSkip: { type: Boolean, default: false },
  initialDisplayName: { type: String, default: '' },
  autoStart: { type: Boolean, default: false },
  compact: { type: Boolean, default: false }
})

const emit = defineEmits(['ready', 'skip'])

const authName = useCookie('auth_name')
const authPlantel = useCookie('auth_active_plantel')

const clients = ref([])
const displayName = ref(props.initialDisplayName || `Cobranza ${authPlantel.value || authName.value || 'IECS IEDIS'}`)
const loading = ref(false)
const qrLoading = ref(false)
const statusLoading = ref(false)
const configLoading = ref(false)
const autoStarting = ref(false)
const autoStarted = ref(false)
const sessionStatus = ref('')
const qrSvg = ref('')
const qrImageSrc = ref('')
const qrVisible = ref(false)
const qrStatus = ref('')
const lastMessage = ref('')
const lastMessageType = ref('success')

const activeClient = computed(() => clients.value[0] || null)

const normalizedStatus = computed(() => String(sessionStatus.value || activeClient.value?.status || 'pending').toLowerCase())
const isReady = computed(() => normalizedStatus.value === 'ready')
const statusLabel = computed(() => {
  if (autoStarting.value) return 'Preparando'
  if (isReady.value) return 'Lista'
  if (normalizedStatus.value === 'error') return 'Error'
  return activeClient.value ? 'Pendiente' : 'Sin instancia'
})
const statusBadgeClass = computed(() => {
  if (isReady.value) return 'badge-success'
  if (normalizedStatus.value === 'error') return 'badge-danger'
  return 'badge-warning'
})
const qrStatusLabel = computed(() => {
  if (isReady.value) return 'Sesión lista'
  if (qrStatus.value) return qrStatus.value
  return 'QR disponible'
})

watch(activeClient, (client) => {
  if (client?.display_name) displayName.value = client.display_name
  if (client?.status) sessionStatus.value = client.status
}, { immediate: true })

const setMessage = (message, type = 'success') => {
  lastMessage.value = message
  lastMessageType.value = type
}

const getQrBody = (payload) => payload?.qr || payload || {}

const renderQr = (payload) => {
  const qr = getQrBody(payload)
  qrStatus.value = qr.status || payload?.status || ''

  if (qr.sessionReady) {
    sessionStatus.value = 'ready'
    qrVisible.value = false
    qrSvg.value = ''
    qrImageSrc.value = ''
    emit('ready')
    setMessage('Sesión vinculada.')
    return
  }

  const raw = String(qr.qr || '')
  if (!raw) {
    throw new Error('La API no devolvió un QR disponible.')
  }

  qrVisible.value = true

  if (raw.startsWith('data:image') || raw.startsWith('http://') || raw.startsWith('https://')) {
    qrImageSrc.value = raw
    qrSvg.value = ''
    return
  }

  qrImageSrc.value = ''
  qrSvg.value = renderSVG(raw, {
    ecc: 'M',
    border: 2,
    pixelSize: props.compact ? 5 : 7,
    whiteColor: '#ffffff',
    blackColor: '#111827'
  })
}

const loadClients = async () => {
  loading.value = true
  try {
    const res = await $fetch('/api/whatsapp/instances')
    clients.value = Array.isArray(res?.local) ? res.local : []
  } catch (error) {
    setMessage('No se pudo cargar la configuración de WhatsApp.', 'danger')
  } finally {
    loading.value = false
  }
}

const createInstance = async () => {
  loading.value = true
  try {
    const response = await $fetch('/api/whatsapp/instances', {
      method: 'POST',
      body: { displayName: displayName.value.trim() }
    })
    const instance = response?.instance || response
    clients.value = [{
      client_id: instance.clientId,
      display_name: instance.displayName || displayName.value.trim(),
      status: instance.status || 'pending'
    }]
    sessionStatus.value = instance.status || 'pending'
    setMessage('Instancia creada.')
    return clients.value[0]
  } catch (error) {
    setMessage(error?.statusMessage || 'No se pudo crear la instancia.', 'danger')
    return null
  } finally {
    loading.value = false
  }
}

const showQr = async (forceNew) => {
  if (!activeClient.value?.client_id) return
  qrLoading.value = true
  try {
    const payload = await $fetch(`/api/whatsapp/instances/${encodeURIComponent(activeClient.value.client_id)}/qr`, {
      params: { refresh: '1', force: forceNew ? '1' : '0' }
    })
    renderQr(payload)
    setMessage(payload?.refreshed ? 'QR renovado.' : 'QR listo.')
  } catch (error) {
    setMessage(error?.statusMessage || 'No se pudo obtener el QR.', 'danger')
  } finally {
    qrLoading.value = false
  }
}

const checkStatus = async () => {
  if (!activeClient.value?.client_id) return
  statusLoading.value = true
  try {
    const payload = await $fetch(`/api/whatsapp/instances/${encodeURIComponent(activeClient.value.client_id)}/status`)
    const nextStatus = payload?.instance?.status || payload?.status?.status || payload?.status || 'pending'
    sessionStatus.value = nextStatus
    if (String(nextStatus).toLowerCase() === 'ready') {
      qrVisible.value = false
      emit('ready')
    }
    setMessage(String(nextStatus).toLowerCase() === 'ready' ? 'Sesión lista.' : 'Sesión pendiente.')
  } catch (error) {
    setMessage(error?.statusMessage || 'No se pudo revisar la sesión.', 'danger')
  } finally {
    statusLoading.value = false
  }
}

const saveConfiguration = async () => {
  if (!activeClient.value?.client_id) return
  configLoading.value = true
  try {
    await $fetch(`/api/whatsapp/instances/${encodeURIComponent(activeClient.value.client_id)}/configuration`, {
      method: 'PATCH',
      body: {
        displayName: displayName.value.trim(),
        metadata: { source: 'sistema-de-ingresos', onboarding: true }
      }
    })
    await loadClients()
    setMessage('Configuración guardada.')
  } catch (error) {
    setMessage(error?.statusMessage || 'No se pudo guardar la configuración.', 'danger')
  } finally {
    configLoading.value = false
  }
}

const startAutomaticSetup = async () => {
  if (!props.autoStart || autoStarted.value) return
  autoStarted.value = true
  autoStarting.value = true

  try {
    await loadClients()
    if (!activeClient.value && displayName.value.trim()) {
      await createInstance()
    }
    if (activeClient.value && !isReady.value) {
      await showQr(false)
    }
    if (activeClient.value) {
      await checkStatus()
    }
  } finally {
    autoStarting.value = false
  }
}

onMounted(async () => {
  if (props.autoStart) {
    await startAutomaticSetup()
    return
  }

  await loadClients()
})
</script>

<style scoped>
.whatsapp-onboarding {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 18px;
}

.whatsapp-onboarding.compact {
  gap: 12px;
  border-radius: 22px;
  padding: 16px;
}

.wa-head,
.wa-title,
.wa-grid,
.wa-config,
.wa-actions,
.wa-qr-wrap,
.wa-footer {
  display: flex;
  align-items: center;
}

.wa-head {
  justify-content: space-between;
  gap: 16px;
}

.wa-title {
  min-width: 0;
  gap: 12px;
}

.wa-title h3,
.wa-title p {
  margin: 0;
}

.wa-title h3 {
  color: #162641;
  font-size: 0.98rem;
  font-weight: 850;
}

.wa-title p {
  max-width: 34rem;
  overflow: hidden;
  color: #66728a;
  font-size: 0.78rem;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wa-icon {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 12px;
  background: #e7f8f2;
  color: #16806e;
}

.wa-guide {
  display: grid;
  gap: 3px;
  border: 1px solid #dbeee3;
  border-radius: 14px;
  background: #f2fbf5;
  padding: 10px;
}

.wa-guide strong {
  color: #267447;
  font-size: 0.78rem;
  font-weight: 850;
}

.wa-guide span {
  color: #587067;
  font-size: 0.72rem;
  font-weight: 650;
  line-height: 1.45;
}

.wa-grid,
.wa-config {
  gap: 12px;
}

.wa-grid {
  align-items: end;
}

.wa-body {
  display: grid;
  gap: 14px;
}

.whatsapp-onboarding.compact .wa-body {
  gap: 10px;
}

.wa-field {
  min-width: 0;
  flex: 1;
}

.wa-action {
  flex: 0 0 auto;
}

.wa-actions {
  flex-wrap: wrap;
  gap: 10px;
}

.whatsapp-onboarding.compact .wa-actions .btn {
  flex: 1 1 120px;
}

.wa-qr-wrap {
  align-items: stretch;
  gap: 16px;
  border-top: 1px solid #edf2f7;
  padding-top: 14px;
}

.wa-qr {
  display: grid;
  width: 210px;
  min-height: 210px;
  flex: 0 0 210px;
  place-items: center;
  overflow: hidden;
  border: 1px solid #dfe6ef;
  border-radius: 12px;
  background: #fff;
}

.whatsapp-onboarding.compact .wa-qr {
  width: 168px;
  min-height: 168px;
  flex-basis: 168px;
}

.wa-qr img,
.wa-qr-svg :deep(svg) {
  display: block;
  width: 190px;
  height: 190px;
}

.whatsapp-onboarding.compact .wa-qr img,
.whatsapp-onboarding.compact .wa-qr-svg :deep(svg) {
  width: 148px;
  height: 148px;
}

.wa-empty {
  display: grid;
  color: #9aa6b8;
  place-items: center;
}

.wa-qr-meta {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.wa-qr-meta strong {
  color: #162641;
  font-size: 0.92rem;
}

.wa-qr-meta span {
  overflow-wrap: anywhere;
  color: #66728a;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.72rem;
}

.wa-message {
  border: 1px solid #cfe9d6;
  border-radius: 10px;
  background: #f0fbf2;
  color: #267447;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 9px 11px;
}

.wa-message-error {
  border-color: #fed7d1;
  background: #fff4f2;
  color: #d83a2a;
}

.wa-footer {
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid #edf2f7;
  padding-top: 14px;
}

@media (max-width: 760px) {
  .wa-head,
  .wa-grid,
  .wa-config,
  .wa-qr-wrap {
    align-items: stretch;
    flex-direction: column;
  }

  .wa-qr,
  .whatsapp-onboarding.compact .wa-qr {
    width: 100%;
    flex-basis: auto;
  }
}
</style>