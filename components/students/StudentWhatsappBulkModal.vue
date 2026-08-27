<template>
  <Teleport to="body">
    <div class="wa-bulk-overlay">
      <section class="wa-bulk-modal" role="dialog" aria-modal="true" aria-labelledby="wa-bulk-title">
        <header class="wa-bulk-header">
          <div class="wa-bulk-brand">
            <span class="wa-bulk-brand__icon"><LucideMessageCircle :size="21" /></span>
            <div>
              <h2 id="wa-bulk-title">WhatsApp</h2>
              <span v-if="previewLoading">Preparando…</span>
              <span v-else-if="transportMode === 'public'" class="wa-bulk-status public"><i></i> API pública</span>
              <span v-else-if="session.ready" class="wa-bulk-status ready"><i></i> QR conectado</span>
              <span v-else class="wa-bulk-status"><i></i> QR sin vincular</span>
            </div>
          </div>
          <button class="wa-bulk-icon-button" type="button" aria-label="Cerrar" @click="requestClose">
            <LucideX :size="20" />
          </button>
        </header>

        <div v-if="previewLoading" class="wa-bulk-loading">
          <span class="wa-bulk-spinner"><LucideLoader2 :size="26" /></span>
        </div>

        <template v-else-if="hasStarted">
          <StudentBulkDeliveryProgress
            :items="deliveryItems"
            :running="sending"
            :skipped="Number(summary.missingPhone || 0) + Number(summary.notFound || 0)"
            channel-label="WhatsApp"
            @retry-failed="retryFailed"
            @continue-pending="continuePending"
            @done="closeAfterSend"
          />
        </template>

        <template v-else>
          <div class="wa-bulk-transport" role="radiogroup" aria-label="Método de envío">
            <button
              type="button"
              role="radio"
              :aria-checked="transportMode === 'public'"
              :class="['wa-bulk-transport__option', { active: transportMode === 'public' }]"
              @click="selectTransport('public')"
            >
              <span class="wa-bulk-transport__icon"><LucideGlobe2 :size="18" /></span>
              <span><strong>API pública</strong><small>Predeterminada</small></span>
              <i></i>
            </button>
            <button
              type="button"
              role="radio"
              :aria-checked="transportMode === 'qr'"
              :class="['wa-bulk-transport__option', { active: transportMode === 'qr' }]"
              @click="selectTransport('qr')"
            >
              <span class="wa-bulk-transport__icon"><LucideQrCode :size="18" /></span>
              <span><strong>Sesión QR</strong><small>{{ session.ready ? 'Conectada' : 'Vincular' }}</small></span>
              <i></i>
            </button>
          </div>

          <template v-if="transportMode === 'qr' && !session.ready">
            <main class="wa-bulk-connect">
              <div class="wa-bulk-connect__device">
                <div v-if="qrSvg" class="wa-bulk-qr" v-html="qrSvg"></div>
                <img v-else-if="qrImageSrc" class="wa-bulk-qr-image" :src="qrImageSrc" alt="QR WhatsApp" />
                <span v-else class="wa-bulk-connect__mark"><LucideMessageCircle :size="42" /></span>
              </div>

              <button v-if="!session.clientId" class="wa-bulk-primary connect" type="button" :disabled="connectionLoading" @click="prepareSession">
                <LucideLoader2 v-if="connectionLoading" class="wa-bulk-spin" :size="18" />
                <LucideQrCode v-else :size="18" />
                Vincular por QR
              </button>
              <div v-else class="wa-bulk-connect__actions">
                <button class="wa-bulk-primary connect" type="button" :disabled="connectionLoading" @click="loadQr(false)">
                  <LucideLoader2 v-if="connectionLoading" class="wa-bulk-spin" :size="18" />
                  <LucideQrCode v-else :size="18" />
                  {{ qrSvg || qrImageSrc ? 'Actualizar QR' : 'Mostrar QR' }}
                </button>
                <button class="wa-bulk-secondary square" type="button" aria-label="Reiniciar sesión" :disabled="connectionLoading" @click="loadQr(true)">
                  <LucideRefreshCw :size="17" />
                </button>
              </div>
              <span v-if="qrSvg || qrImageSrc" class="wa-bulk-scan-label">Escanear QR</span>
              <span v-if="errorMessage" class="wa-bulk-error compact">{{ errorMessage }}</span>
            </main>
          </template>

          <template v-else>
            <div class="wa-bulk-audience">
              <div class="wa-bulk-avatars" aria-hidden="true">
                <span v-for="recipient in avatarRecipients" :key="recipient.matricula">{{ initials(recipient.nombreCompleto) }}</span>
                <b v-if="summary.chats > avatarRecipients.length">+{{ summary.chats - avatarRecipients.length }}</b>
              </div>
              <strong>{{ summary.chats }} {{ summary.chats === 1 ? 'chat' : 'chats' }}</strong>
              <span v-if="summary.missingPhone" class="wa-bulk-audience__issue"><LucidePhoneOff :size="14" /> {{ summary.missingPhone }}</span>
              <span v-if="summary.deduplicated" class="wa-bulk-audience__soft"><LucideUsers :size="14" /> {{ summary.deduplicated }}</span>
            </div>

            <main class="wa-bulk-composer-grid">
              <section class="wa-bulk-compose">
                <div
                  class="wa-bulk-message-input"
                  :class="{ dragging: isDragging }"
                  @dragenter.prevent="isDragging = true"
                  @dragover.prevent="isDragging = true"
                  @dragleave.prevent="isDragging = false"
                  @drop.prevent="handleDrop"
                >
                  <textarea v-model="message" maxlength="4096" placeholder="Mensaje" aria-label="Mensaje"></textarea>

                  <div v-if="attachmentFile" class="wa-bulk-attachment-chip">
                    <img v-if="attachmentIsImage" :src="attachmentPreview" alt="Imagen seleccionada" />
                    <span v-else class="wa-bulk-file-icon" aria-hidden="true"><LucideFileText :size="22" /></span>
                    <div>
                      <strong>{{ attachmentFile.name }}</strong>
                      <span>{{ attachmentIsImage ? 'Imagen' : 'Documento' }} · {{ formattedFileSize }}</span>
                    </div>
                    <button type="button" aria-label="Quitar archivo" @click="clearAttachment"><LucideX :size="16" /></button>
                  </div>

                  <div class="wa-bulk-compose__tools">
                    <button type="button" :class="{ active: Boolean(attachmentFile) }" @click="pickAttachment">
                      <LucidePaperclip :size="18" />
                      <span>Adjuntar</span>
                    </button>
                    <span>{{ message.length }}/4096</span>
                  </div>
                  <input ref="filePicker" class="wa-bulk-file-input" type="file" :accept="COMMUNICATION_ATTACHMENT_ACCEPT" @change="handleFileInput" />
                </div>
                <span v-if="errorMessage" class="wa-bulk-error">{{ errorMessage }}</span>
              </section>

              <aside class="wa-bulk-preview" aria-label="Vista previa">
                <div class="wa-bulk-preview__bar">
                  <span class="wa-bulk-preview__avatar"><LucideUsers :size="16" /></span>
                  <div><strong>{{ recipientPreviewName }}</strong><small>WhatsApp</small></div>
                </div>
                <div class="wa-bulk-preview__body">
                  <div v-if="attachmentFile || message.trim()" class="wa-bulk-bubble">
                    <img v-if="attachmentIsImage" :src="attachmentPreview" alt="" />
                    <div v-else-if="attachmentFile" class="wa-bulk-document-preview">
                      <span><LucideFileText :size="22" /></span>
                      <div><strong>{{ attachmentFile.name }}</strong><small>{{ formattedFileSize }}</small></div>
                    </div>
                    <p v-if="message.trim()">{{ message }}</p>
                    <time>{{ currentTime }}</time>
                  </div>
                  <span v-else class="wa-bulk-preview__empty"><LucideMessageCircle :size="27" /></span>
                </div>
              </aside>
            </main>

            <footer class="wa-bulk-footer">
              <button class="wa-bulk-secondary" type="button" @click="requestClose">Cancelar</button>
              <button class="wa-bulk-primary" type="button" :disabled="!canSend" @click="sendBulk">
                <LucideLoader2 v-if="sending" class="wa-bulk-spin" :size="18" />
                <LucideSend v-else :size="18" />
                {{ sending ? 'Enviando…' : `Enviar a ${summary.chats}` }}
              </button>
            </footer>
          </template>
        </template>
      </section>

      <div v-if="closeConfirmOpen" class="wa-close-confirm-layer">
        <section class="wa-close-confirm" role="alertdialog" aria-modal="true" aria-labelledby="wa-close-confirm-title">
          <div class="wa-close-confirm__icon"><LucideX :size="20" /></div>
          <div class="wa-close-confirm__copy">
            <h3 id="wa-close-confirm-title">¿Cerrar este envío?</h3>
            <p>{{ closeConfirmationText }}</p>
          </div>
          <div class="wa-close-confirm__actions">
            <button type="button" class="wa-bulk-secondary" @click="cancelClose">Seguir aquí</button>
            <button type="button" class="wa-close-confirm__danger" @click="confirmClose">{{ sending ? 'Pausar y cerrar' : 'Sí, cerrar' }}</button>
          </div>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { renderSVG } from 'uqr'
import {
  LucideFileText,
  LucideGlobe2,
  LucidePaperclip,
  LucideLoader2,
  LucideMessageCircle,
  LucidePhoneOff,
  LucideQrCode,
  LucideRefreshCw,
  LucideSend,
  LucideUsers,
  LucideX
} from 'lucide-vue-next'
import StudentBulkDeliveryProgress from './StudentBulkDeliveryProgress.vue'
import {
  COMMUNICATION_ATTACHMENT_ACCEPT,
  COMMUNICATION_ATTACHMENT_MAX_BYTES,
  isCommunicationAttachmentImage,
  isSupportedCommunicationAttachment,
} from '~/utils/communicationAttachments'

const props = defineProps({
  selectedStudents: { type: Array, default: () => [] },
  contactSource: { type: String, default: 'lookup' }
})

const emit = defineEmits(['close', 'sent'])

const previewLoading = ref(true)
const transportMode = ref('public')
const connectionLoading = ref(false)
const sending = ref(false)
const closeConfirmOpen = ref(false)
const closeAfterCurrentSend = ref(false)
const isDragging = ref(false)
const message = ref('')
const attachmentFile = ref(null)
const attachmentPreview = ref('')
const filePicker = ref(null)
const qrSvg = ref('')
const qrImageSrc = ref('')
const errorMessage = ref('')
const recipients = ref([])
const recipientGroups = ref([])
const deliveryItems = ref([])
const summary = ref({ selected: 0, reachableStudents: 0, chats: 0, missingPhone: 0, notFound: 0, deduplicated: 0 })
const session = ref({ clientId: '', displayName: '', status: 'disconnected', ready: false })
let statusTimer = null
let draftTimer = null
const WHATSAPP_DRAFT_KEY = 'control-escolar:bulk-whatsapp-draft:v1'
const draftReady = ref(false)
const draftRestored = ref(false)
const draftHadAttachment = ref(false)

const selectedMatriculas = computed(() => props.selectedStudents.map(student => String(student?.matricula || '').trim()).filter(Boolean))
const audienceSignature = computed(() => [...selectedMatriculas.value].map(value => value.toUpperCase()).sort().join('|'))
const selectedContactStudents = computed(() => props.selectedStudents.map(student => ({
  matricula: String(student?.matricula || '').trim(),
  nombreCompleto: String(student?.nombreCompleto || student?.fullName || student?.full_name || student?.name || student?.matricula || '').trim(),
  telefonoPadre: student?.telefonoPadre ?? student?.telefono_padre ?? student?.celularPadre ?? student?.celular_padre ?? '',
  telefonoMadre: student?.telefonoMadre ?? student?.telefono_madre ?? student?.celularMadre ?? student?.celular_madre ?? '',
  celularPadre: student?.celularPadre ?? student?.celular_padre ?? '',
  celularMadre: student?.celularMadre ?? student?.celular_madre ?? '',
  telefono: student?.telefono ?? '',
  phone: student?.phone ?? ''
})).filter(student => student.matricula))
const usesSelectionContacts = computed(() => String(props.contactSource || '').toLowerCase() === 'selection')
const readyRecipients = computed(() => recipients.value.filter(recipient => recipient.status === 'ready'))
const hasStarted = computed(() => deliveryItems.value.length > 0)
const avatarRecipients = computed(() => readyRecipients.value.slice(0, 4))
const recipientPreviewName = computed(() => {
  const first = readyRecipients.value[0]?.nombreCompleto
  if (!first) return `${summary.value.chats} chats`
  return summary.value.chats > 1 ? `${first} +${summary.value.chats - 1}` : first
})
const canSend = computed(() => (transportMode.value === 'public' || session.value.ready) && summary.value.chats > 0 && Boolean(message.value.trim() || attachmentFile.value) && !sending.value)
const attachmentIsImage = computed(() => isCommunicationAttachmentImage(attachmentFile.value))
const formattedFileSize = computed(() => {
  const size = Number(attachmentFile.value?.size || 0)
  if (!size) return ''
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`
})
const currentTime = computed(() => new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()))

const closeConfirmationText = computed(() => sending.value
  ? 'El envío que ya está en curso terminará primero. Después se pausará la lista antes del siguiente destinatario, se guardará el progreso y se cerrará el diálogo.'
  : 'El borrador y el progreso actual se conservarán para que puedas continuar después. Esta acción solo cerrará el diálogo.')

const hasClosableState = computed(() => Boolean(message.value.trim() || attachmentFile.value || draftHadAttachment.value || deliveryItems.value.length))

const serializableDeliveryItems = () => deliveryItems.value.map(item => ({
  key: String(item?.key || ''),
  label: String(item?.label || ''),
  detail: String(item?.detail || ''),
  matriculas: Array.isArray(item?.matriculas) ? [...item.matriculas] : [],
  status: ['pending', 'sending', 'sent', 'failed'].includes(item?.status) ? (item.status === 'sending' ? 'pending' : item.status) : 'pending',
  error: String(item?.error || ''),
}))

const persistDraft = () => {
  if (typeof window === 'undefined' || !draftReady.value) return
  const shouldKeep = Boolean(message.value.trim() || attachmentFile.value || draftHadAttachment.value || deliveryItems.value.length || transportMode.value !== 'public')
  if (!shouldKeep) {
    window.localStorage.removeItem(WHATSAPP_DRAFT_KEY)
    return
  }

  window.localStorage.setItem(WHATSAPP_DRAFT_KEY, JSON.stringify({
    version: 1,
    savedAt: new Date().toISOString(),
    audienceSignature: audienceSignature.value,
    message: message.value,
    transportMode: transportMode.value,
    hadAttachment: Boolean(attachmentFile.value || draftHadAttachment.value),
    deliveryItems: serializableDeliveryItems(),
  }))
}

const scheduleDraftSave = () => {
  if (!draftReady.value) return
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    draftTimer = null
    persistDraft()
  }, 180)
}

const restoreDraft = () => {
  if (typeof window === 'undefined') return
  try {
    const draft = JSON.parse(window.localStorage.getItem(WHATSAPP_DRAFT_KEY) || 'null')
    if (!draft || typeof draft !== 'object') return
    message.value = typeof draft.message === 'string' ? draft.message : ''
    transportMode.value = draft.transportMode === 'qr' ? 'qr' : 'public'
    if (draft.audienceSignature === audienceSignature.value && Array.isArray(draft.deliveryItems)) {
      deliveryItems.value = draft.deliveryItems.map(item => ({ ...item, status: item?.status === 'sending' ? 'pending' : item?.status }))
    }
    draftHadAttachment.value = Boolean(draft.hadAttachment ?? draft.hadImage)
    draftRestored.value = Boolean(message.value.trim() || deliveryItems.value.length || draft.transportMode === 'qr' || draftHadAttachment.value)
  } catch {
    window.localStorage.removeItem(WHATSAPP_DRAFT_KEY)
  }
}

const clearDraft = () => {
  if (typeof window !== 'undefined') window.localStorage.removeItem(WHATSAPP_DRAFT_KEY)
  draftRestored.value = false
  draftHadAttachment.value = false
  draftReady.value = false
}

const handleBeforeUnload = (event) => {
  if (!hasClosableState.value) return
  persistDraft()
  event.preventDefault()
  event.returnValue = ''
}

const initials = (value) => String(value || '')
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map(part => part[0] || '')
  .join('')
  .toUpperCase() || 'A'

const stopStatusPolling = () => {
  if (statusTimer) clearInterval(statusTimer)
  statusTimer = null
}

const startStatusPolling = () => {
  stopStatusPolling()
  if (transportMode.value !== 'qr' || !session.value.clientId || session.value.ready) return
  statusTimer = setInterval(async () => {
    try {
      const payload = await $fetch(`/api/whatsapp/instances/${encodeURIComponent(session.value.clientId)}/status`)
      const status = String(payload?.instance?.status || payload?.status?.status || payload?.status || 'pending')
      session.value = { ...session.value, status, ready: status.toLowerCase() === 'ready' }
      if (session.value.ready) {
        stopStatusPolling()
        qrSvg.value = ''
        qrImageSrc.value = ''
        await loadPreview()
      }
    } catch {}
  }, 1800)
}

const loadPreview = async () => {
  previewLoading.value = true
  errorMessage.value = ''
  try {
    const payload = await $fetch('/api/students/whatsapp/preview', {
      method: 'POST',
      body: {
        matriculas: selectedMatriculas.value,
        transport: transportMode.value,
        contactSource: usesSelectionContacts.value ? 'selection' : 'lookup',
        students: usesSelectionContacts.value ? selectedContactStudents.value : undefined
      }
    })
    recipients.value = Array.isArray(payload?.recipients) ? payload.recipients : []
    recipientGroups.value = Array.isArray(payload?.groups) ? payload.groups : []
    summary.value = { ...summary.value, ...(payload?.summary || {}) }
    session.value = { ...session.value, ...(payload?.session || {}) }
    if (session.value.ready) stopStatusPolling()
    if (payload?.session?.missingRemote) {
      qrSvg.value = ''
      qrImageSrc.value = ''
    }
  } catch (error) {
    errorMessage.value = error?.data?.message || error?.statusMessage || 'No se pudo preparar WhatsApp.'
  } finally {
    previewLoading.value = false
  }
}


const selectTransport = async (mode) => {
  const nextMode = mode === 'qr' ? 'qr' : 'public'
  if (transportMode.value === nextMode) return
  transportMode.value = nextMode
  errorMessage.value = ''

  if (nextMode === 'public') {
    stopStatusPolling()
    qrSvg.value = ''
    qrImageSrc.value = ''
    return
  }

  await loadPreview()
}

const prepareSession = async () => {
  connectionLoading.value = true
  errorMessage.value = ''
  try {
    const payload = await $fetch('/api/whatsapp/instances', {
      method: 'POST',
      body: { displayName: 'Aurora' }
    })
    const instance = payload?.instance || payload || {}
    session.value = {
      clientId: instance.clientId || '',
      displayName: instance.displayName || 'Aurora',
      status: instance.status || 'pending',
      ready: String(instance.status || '').toLowerCase() === 'ready'
    }
    if (session.value.ready) await loadPreview()
    else await loadQr(false)
  } catch (error) {
    errorMessage.value = error?.data?.message || error?.statusMessage || 'No se pudo vincular WhatsApp.'
  } finally {
    connectionLoading.value = false
  }
}

const renderQr = (payload) => {
  const qr = payload?.qr || payload || {}
  if (qr.sessionReady) {
    session.value = { ...session.value, status: 'ready', ready: true }
    qrSvg.value = ''
    qrImageSrc.value = ''
    stopStatusPolling()
    loadPreview()
    return
  }

  const raw = String(qr.qr || '')
  if (!raw) throw new Error('QR no disponible.')
  if (raw.startsWith('data:image') || raw.startsWith('http://') || raw.startsWith('https://')) {
    qrImageSrc.value = raw
    qrSvg.value = ''
  } else {
    qrImageSrc.value = ''
    qrSvg.value = renderSVG(raw, { ecc: 'M', border: 2, pixelSize: 6, whiteColor: '#ffffff', blackColor: '#111827' })
  }
  startStatusPolling()
}

const loadQr = async (forceNew = false) => {
  if (!session.value.clientId) return
  connectionLoading.value = true
  errorMessage.value = ''
  try {
    const payload = await $fetch(`/api/whatsapp/instances/${encodeURIComponent(session.value.clientId)}/qr`, {
      params: { refresh: '1', force: forceNew ? '1' : '0' }
    })
    renderQr(payload)
  } catch (error) {
    const rawMessage = error?.data?.message || error?.statusMessage || error?.message || ''
    const missingInstance = Number(error?.statusCode || error?.status || 0) === 404 || /does not exist|instance not found|not found/i.test(String(rawMessage))
    if (missingInstance) {
      session.value = { clientId: '', displayName: '', status: 'disconnected', ready: false }
      qrSvg.value = ''
      qrImageSrc.value = ''
      connectionLoading.value = false
      await prepareSession()
      return
    }
    errorMessage.value = rawMessage || 'No se pudo abrir el QR.'
  } finally {
    connectionLoading.value = false
  }
}

const revokeAttachmentPreview = () => {
  if (attachmentPreview.value?.startsWith('blob:')) URL.revokeObjectURL(attachmentPreview.value)
}

const clearAttachment = () => {
  revokeAttachmentPreview()
  attachmentFile.value = null
  attachmentPreview.value = ''
  draftHadAttachment.value = false
  if (filePicker.value) filePicker.value.value = ''
}

const setAttachment = (file) => {
  errorMessage.value = ''
  if (!file) return
  if (!isSupportedCommunicationAttachment(file)) {
    errorMessage.value = 'Selecciona una imagen, PDF o documento compatible.'
    return
  }
  if (file.size > COMMUNICATION_ATTACHMENT_MAX_BYTES) {
    errorMessage.value = 'El archivo supera 10 MB.'
    return
  }
  revokeAttachmentPreview()
  attachmentFile.value = file
  attachmentPreview.value = isCommunicationAttachmentImage(file) ? URL.createObjectURL(file) : ''
  draftHadAttachment.value = true
}

const pickAttachment = () => filePicker.value?.click()
const handleFileInput = (event) => setAttachment(event.target?.files?.[0])
const handleDrop = (event) => {
  isDragging.value = false
  setAttachment(event.dataTransfer?.files?.[0])
}

const studentSubsetForMatriculas = (matriculas = []) => {
  const wanted = new Set(matriculas.map(value => String(value || '').trim().toUpperCase()).filter(Boolean))
  return selectedContactStudents.value.filter(student => wanted.has(String(student.matricula || '').trim().toUpperCase()))
}

const initializeDeliveryItems = () => {
  if (deliveryItems.value.length) return
  deliveryItems.value = recipientGroups.value.map((group, index) => ({
    key: `${group.phoneMasked || 'chat'}-${index}-${(group.matriculas || []).join('-')}`,
    label: Array.isArray(group.names) && group.names.length ? group.names.join(' · ') : (group.matriculas || []).join(' · '),
    detail: group.phoneMasked || 'WhatsApp',
    matriculas: Array.isArray(group.matriculas) ? [...group.matriculas] : [],
    status: 'pending',
    error: '',
  }))
}

const deliveryResult = () => {
  const sentItems = deliveryItems.value.filter(item => item.status === 'sent')
  const failedItems = deliveryItems.value.filter(item => item.status === 'failed')
  const pendingItems = deliveryItems.value.filter(item => item.status === 'pending' || item.status === 'sending')
  const flattenMatriculas = items => Array.from(new Set(items.flatMap(item => item.matriculas || []).map(value => String(value || '').trim()).filter(Boolean)))
  return {
    success: deliveryItems.value.length > 0 && failedItems.length === 0 && pendingItems.length === 0,
    partial: sentItems.length > 0 && failedItems.length > 0,
    sentChats: sentItems.length,
    failedChats: failedItems.length,
    pendingChats: pendingItems.length,
    failedMatriculas: flattenMatriculas(failedItems),
    pendingMatriculas: flattenMatriculas(pendingItems),
    sentMatriculas: flattenMatriculas(sentItems),
    failures: failedItems.map(item => ({ matriculas: item.matriculas, names: [item.label], message: item.error || 'No enviado' })),
    skipped: Number(summary.value.missingPhone || 0) + Number(summary.value.notFound || 0),
    deduplicated: Number(summary.value.deduplicated || 0),
    summary: summary.value,
  }
}

const runDelivery = async (statuses) => {
  initializeDeliveryItems()
  if (!deliveryItems.value.length || sending.value) return
  sending.value = true
  errorMessage.value = ''

  try {
    for (const item of deliveryItems.value) {
      if (!statuses.includes(item.status)) continue
      item.status = 'sending'
      item.error = ''

      try {
        const form = new FormData()
        form.append('matriculas', JSON.stringify(item.matriculas || []))
        form.append('contactSource', usesSelectionContacts.value ? 'selection' : 'lookup')
        if (usesSelectionContacts.value) {
          form.append('students', JSON.stringify(studentSubsetForMatriculas(item.matriculas)))
        }
        form.append('transport', transportMode.value)
        if (message.value.trim()) form.append('message', message.value.trim())
        if (attachmentFile.value) form.append('attachment', attachmentFile.value, attachmentFile.value.name)
        form.append('requestId', typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

        const response = await $fetch('/api/students/whatsapp/bulk', {
          method: 'POST',
          body: form
        })

        const sent = Number(response?.sentChats || 0)
        const failed = Number(response?.failedChats || 0)
        if (sent > 0 && failed === 0) {
          item.status = 'sent'
        } else {
          item.status = 'failed'
          item.error = response?.failures?.[0]?.message || 'WhatsApp no confirmó el envío.'
        }
      } catch (error) {
        item.status = 'failed'
        item.error = error?.data?.statusMessage
          || error?.data?.message
          || error?.data?.error
          || error?.statusMessage
          || error?.message
          || 'No se pudo enviar este chat.'
      }

      if (closeAfterCurrentSend.value) break
    }
  } finally {
    sending.value = false
    persistDraft()
    emit('sent', deliveryResult())
    if (closeAfterCurrentSend.value) {
      stopStatusPolling()
      emit('close')
    }
  }
}

const sendBulk = async () => {
  if (!canSend.value) return
  await runDelivery(['pending'])
}

const retryFailed = async () => {
  await runDelivery(['failed'])
}

const continuePending = async () => {
  await runDelivery(['pending'])
}

const requestClose = () => {
  if (closeAfterCurrentSend.value) return
  persistDraft()
  closeConfirmOpen.value = true
}

const cancelClose = () => {
  closeConfirmOpen.value = false
}

const confirmClose = () => {
  closeConfirmOpen.value = false
  persistDraft()
  if (sending.value) {
    closeAfterCurrentSend.value = true
    return
  }
  stopStatusPolling()
  emit('close')
}

const closeAfterSend = () => {
  const completed = deliveryItems.value.length > 0 && deliveryItems.value.every(item => item.status === 'sent')
  if (!completed) {
    requestClose()
    return
  }
  clearDraft()
  stopStatusPolling()
  emit('close')
}

useModalEscape(() => {
  if (closeConfirmOpen.value) {
    cancelClose()
    return
  }
  requestClose()
})

watch(message, scheduleDraftSave)
watch(transportMode, scheduleDraftSave)
watch(attachmentFile, scheduleDraftSave)
watch(deliveryItems, scheduleDraftSave, { deep: true })

onMounted(async () => {
  restoreDraft()
  await loadPreview()
  if (draftHadAttachment.value && !errorMessage.value) {
    errorMessage.value = 'Borrador restaurado: vuelve a seleccionar el archivo adjunto antes de enviar.'
  }
  draftReady.value = true
  scheduleDraftSave()
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', handleBeforeUnload)
})
onBeforeUnmount(() => {
  if (draftTimer) clearTimeout(draftTimer)
  persistDraft()
  if (typeof window !== 'undefined') window.removeEventListener('beforeunload', handleBeforeUnload)
  stopStatusPolling()
  revokeAttachmentPreview()
})
</script>

<style scoped>
.wa-bulk-overlay {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(13, 24, 38, .46);
  backdrop-filter: blur(12px) saturate(.92);
}

.wa-bulk-modal {
  width: min(860px, calc(100vw - 32px));
  max-height: min(760px, calc(100vh - 40px));
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(17, 35, 54, .1);
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 34px 90px rgba(13, 24, 38, .24), 0 10px 30px rgba(13, 24, 38, .1);
}

.wa-bulk-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 20px 14px;
}

.wa-bulk-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.wa-bulk-brand__icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: #e9f9ef;
  color: #138a45;
}

.wa-bulk-brand h2 {
  margin: 0;
  color: #142033;
  font-size: 19px;
  font-weight: 860;
  letter-spacing: -.025em;
}

.wa-bulk-brand > div > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  color: #7a8597;
  font-size: 11px;
  font-weight: 720;
}

.wa-bulk-status i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #b2bcc8;
}

.wa-bulk-status.ready,
.wa-bulk-status.public { color: #238b4b !important; }
.wa-bulk-status.ready i,
.wa-bulk-status.public i { background: #25a55d; box-shadow: 0 0 0 4px rgba(37, 165, 93, .1); }

.wa-bulk-transport {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0 20px 14px;
  padding: 5px;
  border: 1px solid #e5ebe8;
  border-radius: 16px;
  background: #f6f8f7;
}

.wa-bulk-transport__option {
  min-width: 0;
  height: 54px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 8px;
  align-items: center;
  gap: 9px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: #687587;
  text-align: left;
  cursor: pointer;
  transition: background .16s ease, border-color .16s ease, box-shadow .16s ease, color .16s ease;
}

.wa-bulk-transport__option:hover { background: rgba(255, 255, 255, .7); }
.wa-bulk-transport__option.active {
  border-color: #dce7e0;
  background: #fff;
  color: #1d2e41;
  box-shadow: 0 6px 18px rgba(31, 53, 42, .08);
}

.wa-bulk-transport__icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: #edf1ef;
  color: #647184;
}
.wa-bulk-transport__option.active .wa-bulk-transport__icon { background: #e8f7ed; color: #258e4d; }
.wa-bulk-transport__option > span:nth-child(2) { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.wa-bulk-transport__option strong { color: inherit; font-size: 11.5px; font-weight: 820; }
.wa-bulk-transport__option small { color: #8b96a4; font-size: 9.5px; font-weight: 680; }
.wa-bulk-transport__option > i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d4dbdf;
}
.wa-bulk-transport__option.active > i { background: #28a15a; box-shadow: 0 0 0 4px rgba(40, 161, 90, .1); }

.wa-bulk-icon-button,
.wa-bulk-attachment-chip button {
  border: 0;
  background: transparent;
  color: #7b8798;
  cursor: pointer;
}

.wa-bulk-icon-button {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 12px;
}

.wa-bulk-icon-button:hover { background: #f3f5f7; color: #26364a; }

.wa-bulk-loading {
  min-height: 360px;
  display: grid;
  place-items: center;
  color: #289653;
}

.wa-bulk-spinner,
.wa-bulk-spin { animation: wa-bulk-spin .85s linear infinite; }
@keyframes wa-bulk-spin { to { transform: rotate(360deg); } }

.wa-bulk-audience {
  min-height: 48px;
  margin: 0 20px 14px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #e8edf1;
  border-radius: 14px;
  background: #fbfcfd;
  color: #657286;
  font-size: 12px;
}

.wa-bulk-audience strong { color: #233247; font-size: 12px; font-weight: 820; }
.wa-bulk-audience__issue,
.wa-bulk-audience__soft { display: inline-flex; align-items: center; gap: 5px; }
.wa-bulk-audience__issue { color: #a46632; }
.wa-bulk-audience__soft { color: #738094; }

.wa-bulk-avatars { display: flex; align-items: center; padding-left: 3px; }
.wa-bulk-avatars span,
.wa-bulk-avatars b {
  width: 27px;
  height: 27px;
  display: grid;
  place-items: center;
  margin-left: -4px;
  border: 2px solid #fbfcfd;
  border-radius: 50%;
  background: #e8f6ed;
  color: #2f8750;
  font-size: 9px;
  font-weight: 860;
}
.wa-bulk-avatars b { background: #eef1f5; color: #69768a; }

.wa-bulk-composer-grid {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 310px;
  gap: 14px;
  padding: 0 20px 18px;
}

.wa-bulk-compose { min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.wa-bulk-message-input {
  min-height: 330px;
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid #dfe6eb;
  border-radius: 17px;
  background: #fff;
  overflow: hidden;
  transition: border-color .16s ease, box-shadow .16s ease, background .16s ease;
}
.wa-bulk-message-input:focus-within,
.wa-bulk-message-input.dragging { border-color: #65b883; box-shadow: 0 0 0 4px rgba(40, 158, 86, .08); }
.wa-bulk-message-input.dragging { background: #f5fbf7; }

.wa-bulk-message-input textarea {
  flex: 1;
  width: 100%;
  min-height: 170px;
  resize: none;
  border: 0;
  outline: 0;
  padding: 17px 17px 12px;
  background: transparent;
  color: #18263a;
  font: inherit;
  font-size: 14px;
  line-height: 1.55;
}
.wa-bulk-message-input textarea::placeholder { color: #a5aeb9; }

.wa-bulk-attachment-chip {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) 30px;
  align-items: center;
  gap: 10px;
  margin: 0 12px 10px;
  padding: 8px;
  border-radius: 12px;
  background: #f5f8f6;
}
.wa-bulk-attachment-chip img { width: 52px; height: 42px; border-radius: 9px; object-fit: cover; }
.wa-bulk-file-icon { width: 52px; height: 42px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 9px; background: #e8efeb; color: #506b5a; }
.wa-bulk-attachment-chip > div strong,
.wa-bulk-attachment-chip > div span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wa-bulk-attachment-chip > div strong { color: #26364a; font-size: 11.5px; font-weight: 800; }
.wa-bulk-attachment-chip > div span { margin-top: 2px; color: #8a94a3; font-size: 10px; }
.wa-bulk-attachment-chip button { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 9px; }
.wa-bulk-attachment-chip button:hover { background: #e8ece9; }

.wa-bulk-compose__tools {
  height: 48px;
  padding: 0 11px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #edf0f3;
}
.wa-bulk-compose__tools button {
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #4f5d70;
  font-size: 11.5px;
  font-weight: 770;
  cursor: pointer;
}
.wa-bulk-compose__tools button:hover,
.wa-bulk-compose__tools button.active { background: #edf8f1; color: #238b4b; }
.wa-bulk-compose__tools > span { color: #a0a9b5; font-size: 10px; font-variant-numeric: tabular-nums; }
.wa-bulk-file-input { display: none; }

.wa-bulk-preview {
  min-height: 330px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #dce5e1;
  border-radius: 17px;
  background: #e6ddd4;
}
.wa-bulk-preview__bar {
  min-height: 58px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  background: #f6f8f7;
  border-bottom: 1px solid #e2e7e4;
}
.wa-bulk-preview__avatar {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #dfe7e3;
  color: #637269;
}
.wa-bulk-preview__bar strong,
.wa-bulk-preview__bar small { display: block; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wa-bulk-preview__bar strong { color: #27362e; font-size: 11.5px; font-weight: 800; }
.wa-bulk-preview__bar small { margin-top: 1px; color: #89948d; font-size: 9.5px; }
.wa-bulk-preview__body {
  position: relative;
  flex: 1;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 20px 14px;
  background:
    radial-gradient(circle at 15px 15px, rgba(89, 105, 96, .06) 1.4px, transparent 1.6px) 0 0 / 24px 24px,
    linear-gradient(135deg, rgba(255,255,255,.14), rgba(255,255,255,.03));
}
.wa-bulk-bubble {
  position: relative;
  width: min(230px, 94%);
  overflow: hidden;
  padding: 5px 5px 18px;
  border-radius: 11px 3px 11px 11px;
  background: #d9fdd3;
  box-shadow: 0 1px 2px rgba(38, 61, 47, .13);
}
.wa-bulk-bubble img { width: 100%; max-height: 176px; display: block; border-radius: 8px; object-fit: cover; }
.wa-bulk-document-preview { display: flex; align-items: center; gap: 9px; margin: 2px 2px 7px; padding: 9px; border-radius: 8px; background: rgba(255,255,255,.6); }
.wa-bulk-document-preview > span { width: 34px; height: 34px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 7px; background: #e6ece8; color: #506b5a; }
.wa-bulk-document-preview > div { min-width: 0; }
.wa-bulk-document-preview strong, .wa-bulk-document-preview small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wa-bulk-document-preview strong { max-width: 230px; color: #26352c; font-size: 10.5px; }
.wa-bulk-document-preview small { margin-top: 2px; color: #77847b; font-size: 9px; }
.wa-bulk-bubble p { margin: 5px 6px 0; color: #233128; font-size: 11.5px; line-height: 1.42; white-space: pre-wrap; overflow-wrap: anywhere; }
.wa-bulk-bubble time { position: absolute; right: 7px; bottom: 4px; color: #748277; font-size: 8.5px; }
.wa-bulk-preview__empty { margin: auto; color: rgba(74, 91, 82, .28); }

.wa-bulk-footer {
  min-height: 70px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
  padding: 12px 20px 18px;
  border-top: 1px solid #eef1f3;
}
.wa-bulk-footer.result-footer { justify-content: center; border-top: 0; padding-bottom: 22px; }

.wa-bulk-primary,
.wa-bulk-secondary {
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 12px;
  padding: 0 16px;
  font-size: 12px;
  font-weight: 820;
  cursor: pointer;
}
.wa-bulk-primary {
  min-width: 132px;
  border: 1px solid #208a4a;
  background: linear-gradient(180deg, #2eae62, #218f4d);
  color: #fff;
  box-shadow: 0 8px 18px rgba(33, 143, 77, .18);
}
.wa-bulk-primary:hover:not(:disabled) { filter: brightness(.98); transform: translateY(-1px); }
.wa-bulk-primary:disabled { opacity: .45; cursor: default; box-shadow: none; }
.wa-bulk-primary.connect { min-width: 188px; }
.wa-bulk-secondary {
  border: 1px solid #dde4e9;
  background: #fff;
  color: #596679;
}
.wa-bulk-secondary.square { width: 42px; min-width: 42px; padding: 0; }

.wa-bulk-error {
  display: block;
  padding: 0 3px;
  color: #b45243;
  font-size: 11px;
  font-weight: 680;
}
.wa-bulk-error.compact { text-align: center; }

.wa-bulk-connect {
  min-height: 400px;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 30px;
}
.wa-bulk-connect__device {
  width: 250px;
  height: 250px;
  display: grid;
  place-items: center;
  padding: 14px;
  border: 1px solid #e0e8e4;
  border-radius: 28px;
  background: #fff;
  box-shadow: 0 18px 46px rgba(31, 58, 43, .08);
}
.wa-bulk-connect__mark {
  width: 82px;
  height: 82px;
  display: grid;
  place-items: center;
  border-radius: 25px;
  background: #e8f8ee;
  color: #1e9850;
}
.wa-bulk-qr,
.wa-bulk-qr :deep(svg),
.wa-bulk-qr-image { width: 218px; height: 218px; display: block; }
.wa-bulk-qr-image { object-fit: contain; }
.wa-bulk-connect__actions { display: flex; align-items: center; gap: 8px; }
.wa-bulk-scan-label { color: #778496; font-size: 10.5px; font-weight: 740; letter-spacing: .03em; text-transform: uppercase; }

.wa-bulk-result {
  min-height: 350px;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 34px 30px 20px;
  text-align: center;
}
.wa-bulk-result__icon {
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  border-radius: 23px;
  background: #eaf8ef;
  color: #239553;
}
.wa-bulk-result.partial .wa-bulk-result__icon { background: #fff4e7; color: #ba7430; }
.wa-bulk-result > strong { margin-top: 18px; color: #17273b; font-size: 24px; font-weight: 880; letter-spacing: -.035em; }
.wa-bulk-result__metrics { display: flex; align-items: center; gap: 9px; margin-top: 13px; }
.wa-bulk-result__metrics span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 9px;
  border-radius: 999px;
  background: #f3f6f5;
  color: #657486;
  font-size: 10.5px;
  font-weight: 720;
}
.wa-bulk-failures {
  width: min(520px, 100%);
  max-height: 150px;
  overflow: auto;
  margin-top: 18px;
  border: 1px solid #eee4df;
  border-radius: 13px;
  text-align: left;
}
.wa-bulk-failures article { padding: 9px 11px; border-bottom: 1px solid #f1e9e5; }
.wa-bulk-failures article:last-child { border-bottom: 0; }
.wa-bulk-failures span,
.wa-bulk-failures small { display: block; }
.wa-bulk-failures span { color: #49352f; font-size: 11px; font-weight: 790; }
.wa-bulk-failures small { margin-top: 2px; color: #9a6e62; font-size: 9.5px; }

@media (max-width: 760px) {
  .wa-bulk-overlay { padding: 0; align-items: end; }
  .wa-bulk-modal { width: 100vw; max-height: 94vh; border-radius: 24px 24px 0 0; }
  .wa-bulk-composer-grid { grid-template-columns: 1fr; overflow: auto; }
  .wa-bulk-preview { min-height: 260px; }
  .wa-bulk-message-input { min-height: 250px; }
  .wa-bulk-transport { margin-inline: 14px; }
  .wa-bulk-transport__option { grid-template-columns: 32px minmax(0, 1fr) 7px; padding-inline: 9px; }
}

.wa-close-confirm-layer { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 24px; background: rgba(15, 23, 42, .48); backdrop-filter: blur(4px); }
.wa-close-confirm { width: min(440px, 100%); display: grid; grid-template-columns: auto 1fr; gap: 14px; padding: 20px; border-radius: 18px; background: #fff; box-shadow: 0 24px 80px rgba(15, 23, 42, .28); }
.wa-close-confirm__icon { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 12px; background: #fff1f2; color: #be123c; }
.wa-close-confirm__copy h3 { margin: 0 0 6px; font-size: 17px; color: #172033; }
.wa-close-confirm__copy p { margin: 0; color: #667085; font-size: 13px; line-height: 1.5; }
.wa-close-confirm__actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
.wa-close-confirm__danger { border: 0; border-radius: 10px; padding: 10px 14px; background: #be123c; color: #fff; font-weight: 700; cursor: pointer; }
</style>
