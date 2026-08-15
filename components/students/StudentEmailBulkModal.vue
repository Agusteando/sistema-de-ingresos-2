<template>
  <Teleport to="body">
    <div class="email-bulk-overlay">
      <section class="email-bulk-modal" role="dialog" aria-modal="true" aria-labelledby="email-bulk-title">
        <header class="email-bulk-header">
          <div class="email-bulk-brand">
            <span class="email-bulk-brand__icon"><LucideMail :size="21" /></span>
            <div>
              <h2 id="email-bulk-title">Correo electrónico</h2>
              <span v-if="previewLoading">Preparando destinatarios…</span>
              <span v-else>Google Workspace · service account</span>
            </div>
          </div>
          <button class="email-bulk-icon-button" type="button" aria-label="Cerrar" :disabled="sending" @click="requestClose">
            <LucideX :size="20" />
          </button>
        </header>

        <div v-if="previewLoading" class="email-bulk-loading">
          <LucideLoader2 class="email-bulk-spin" :size="26" />
        </div>

        <div v-else-if="hasStarted" class="email-bulk-progress-shell">
          <div v-if="draftHadImage && !imageFile" class="email-attachment-restore" role="status">
            <div>
              <LucideImagePlus :size="17" />
              <span>
                <strong>Este envío tenía una imagen adjunta.</strong>
                <small>Por seguridad el navegador no conserva archivos. Selecciónala de nuevo antes de reintentar.</small>
              </span>
            </div>
            <button type="button" :disabled="sending" @click="pickImage">Volver a adjuntar</button>
          </div>
          <div v-else-if="imageFile" class="email-attachment-progress">
            <img :src="imagePreview" alt="Imagen adjunta" />
            <span><strong>{{ imageFile.name }}</strong><small>{{ formattedFileSize }}</small></span>
          </div>
          <StudentBulkDeliveryProgress
            :items="deliveryItems"
            :running="sending"
            :skipped="Number(summary.missingEmail || 0) + Number(summary.notFound || 0)"
            channel-label="correos"
            @retry-failed="retryFailed"
            @continue-pending="continuePending"
            @done="closeAfterSend"
          />
          <input ref="filePicker" class="email-file-input" type="file" accept="image/*" @change="handleFileInput" />
        </div>

        <template v-else>
          <div class="email-bulk-audience">
            <div>
              <strong>{{ summary.emails }} {{ summary.emails === 1 ? 'correo destino' : 'correos destino' }}</strong>
              <span>{{ summary.reachableStudents }} alumnos con correo familiar</span>
            </div>
            <span v-if="summary.missingEmail" class="warning"><LucideMailWarning :size="14" /> {{ summary.missingEmail }} sin correo</span>
            <span v-if="summary.deduplicated" class="soft"><LucideUsers :size="14" /> {{ summary.deduplicated }} duplicados agrupados</span>
          </div>

          <main class="email-bulk-grid">
            <section class="email-bulk-compose">
              <label class="email-field">
                <span>Enviar como</span>
                <div class="email-sender-input">
                  <LucideUserRound :size="16" />
                  <input
                    v-model.trim="senderEmail"
                    list="control-email-senders"
                    type="email"
                    autocomplete="off"
                    placeholder="usuario@casitaiedis.edu.mx"
                  />
                </div>
                <datalist id="control-email-senders">
                  <option v-for="sender in senders" :key="sender.email" :value="sender.email">{{ sender.name }}</option>
                </datalist>
                <small>El service account enviará impersonando esta cuenta de Workspace.</small>
              </label>

              <label class="email-field">
                <span>Asunto</span>
                <input v-model="subject" maxlength="180" type="text" placeholder="Asunto del correo" />
                <small>{{ subject.length }}/180</small>
              </label>

              <label class="email-field email-message-field">
                <span>Mensaje</span>
                <textarea v-model="message" maxlength="30000" placeholder="Escribe el mensaje para las familias"></textarea>
                <small>{{ message.length }}/30000</small>
              </label>

              <div class="email-attachment-field">
                <div class="email-attachment-field__heading">
                  <span>Imagen adjunta</span>
                  <small>PNG, JPG, WebP o GIF · máximo 10 MB</small>
                </div>
                <div v-if="imageFile" class="email-attachment-card">
                  <img :src="imagePreview" alt="Vista previa de la imagen adjunta" />
                  <span>
                    <strong>{{ imageFile.name }}</strong>
                    <small>{{ formattedFileSize }}</small>
                  </span>
                  <button type="button" aria-label="Quitar imagen" @click="clearImage"><LucideX :size="16" /></button>
                </div>
                <button v-else type="button" class="email-attachment-button" @click="pickImage">
                  <LucideImagePlus :size="17" /> Adjuntar imagen
                </button>
                <small v-if="draftHadImage && !imageFile" class="email-attachment-draft-note">El borrador tenía una imagen. Vuelve a seleccionarla para conservarla en el envío.</small>
                <input ref="filePicker" class="email-file-input" type="file" accept="image/*" @change="handleFileInput" />
              </div>

              <span v-if="errorMessage" class="email-bulk-error">{{ errorMessage }}</span>
            </section>

            <aside class="email-preview" aria-label="Vista previa de correo">
              <div class="email-preview__bar">
                <span><LucideMail :size="17" /></span>
                <div>
                  <strong>{{ senderEmail || 'Remitente de Workspace' }}</strong>
                  <small>{{ firstRecipientLabel }}</small>
                </div>
              </div>
              <div class="email-preview__content">
                <strong>{{ subject || 'Asunto del correo' }}</strong>
                <p v-if="message.trim()">{{ message }}</p>
                <p v-else class="empty">El contenido del mensaje aparecerá aquí.</p>
                <div v-if="imageFile" class="email-preview__attachment">
                  <img :src="imagePreview" alt="" />
                  <span><LucidePaperclip :size="14" /><strong>{{ imageFile.name }}</strong><small>{{ formattedFileSize }}</small></span>
                </div>
              </div>
            </aside>
          </main>

          <footer class="email-bulk-footer">
            <button type="button" class="secondary" :disabled="sending" @click="requestClose">Cancelar</button>
            <button type="button" class="primary" :disabled="!canSend" @click="sendBulk">
              <LucideLoader2 v-if="sending" class="email-bulk-spin" :size="17" />
              <LucideSend v-else :size="17" />
              {{ sending ? 'Enviando…' : `Enviar ${summary.emails}` }}
            </button>
          </footer>
        </template>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  LucideImagePlus,
  LucideLoader2,
  LucideMail,
  LucideMailWarning,
  LucidePaperclip,
  LucideSend,
  LucideUserRound,
  LucideUsers,
  LucideX,
} from 'lucide-vue-next'
import StudentBulkDeliveryProgress from './StudentBulkDeliveryProgress.vue'

const props = defineProps({
  selectedStudents: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'sent'])
const EMAIL_DRAFT_KEY = 'control-escolar:bulk-email-draft:v1'
const DEFAULT_EMAIL_SUBJECT = 'Aviso de Control Escolar'
let draftTimer = null
const draftReady = ref(false)
const draftRestored = ref(false)
const initialSenderEmail = ref('')
const previewLoading = ref(true)
const sending = ref(false)
const errorMessage = ref('')
const recipients = ref([])
const recipientGroups = ref([])
const senders = ref([])
const senderEmail = ref('')
const subject = ref(DEFAULT_EMAIL_SUBJECT)
const message = ref('')
const imageFile = ref(null)
const imagePreview = ref('')
const filePicker = ref(null)
const draftHadImage = ref(false)
const draftImageName = ref('')
const deliveryItems = ref([])
const summary = ref({ selected: 0, reachableStudents: 0, emails: 0, missingEmail: 0, notFound: 0, deduplicated: 0 })

const selectedMatriculas = computed(() => props.selectedStudents.map((student) => String(student?.matricula || '').trim()).filter(Boolean))
const audienceSignature = computed(() => [...selectedMatriculas.value].map((value) => value.toUpperCase()).sort().join('|'))
const selectedContactStudents = computed(() => props.selectedStudents.map((student) => ({
  matricula: String(student?.matricula || '').trim(),
  nombreCompleto: String(student?.nombreCompleto || student?.fullName || student?.full_name || student?.name || student?.matricula || '').trim(),
  emailPadre: student?.emailPadre ?? student?.email_padre ?? student?.correoPadre ?? student?.correo_padre ?? '',
  emailMadre: student?.emailMadre ?? student?.email_madre ?? student?.correoMadre ?? student?.correo_madre ?? '',
  email: student?.email ?? student?.correo ?? '',
  correo: student?.correo ?? '',
  huskyPassEmail: student?.huskyPassEmail ?? student?.husky_pass_email ?? '',
})).filter((student) => student.matricula))

const hasStarted = computed(() => deliveryItems.value.length > 0)
const validSender = computed(() => /^[^\s@]+@casitaiedis\.edu\.mx$/i.test(String(senderEmail.value || '').trim()))
const canSend = computed(() => !sending.value && summary.value.emails > 0 && validSender.value && Boolean(subject.value.trim()) && Boolean(message.value.trim()) && !(draftHadImage.value && !imageFile.value))
const firstRecipientLabel = computed(() => recipientGroups.value[0]?.email || `${summary.value.emails || 0} destinatarios`)
const formattedFileSize = computed(() => {
  const size = Number(imageFile.value?.size || 0)
  if (!size) return ''
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`
})

const hasClosableState = computed(() => Boolean(
  message.value.trim()
  || imageFile.value
  || draftHadImage.value
  || subject.value.trim() !== DEFAULT_EMAIL_SUBJECT
  || (initialSenderEmail.value && senderEmail.value.trim() !== initialSenderEmail.value)
  || deliveryItems.value.length
))

const serializableDeliveryItems = () => deliveryItems.value.map((item) => ({
  key: String(item?.key || ''),
  label: String(item?.label || ''),
  detail: String(item?.detail || ''),
  email: String(item?.email || ''),
  matriculas: Array.isArray(item?.matriculas) ? [...item.matriculas] : [],
  status: ['pending', 'sending', 'sent', 'failed'].includes(item?.status) ? (item.status === 'sending' ? 'pending' : item.status) : 'pending',
  error: String(item?.error || ''),
}))

const persistDraft = () => {
  if (typeof window === 'undefined' || !draftReady.value) return
  if (!hasClosableState.value) {
    window.localStorage.removeItem(EMAIL_DRAFT_KEY)
    return
  }
  window.localStorage.setItem(EMAIL_DRAFT_KEY, JSON.stringify({
    version: 1,
    savedAt: new Date().toISOString(),
    audienceSignature: audienceSignature.value,
    senderEmail: senderEmail.value,
    subject: subject.value,
    message: message.value,
    hadImage: Boolean(imageFile.value || draftHadImage.value),
    imageName: String(imageFile.value?.name || draftImageName.value || ''),
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
    const draft = JSON.parse(window.localStorage.getItem(EMAIL_DRAFT_KEY) || 'null')
    if (!draft || typeof draft !== 'object') return
    if (typeof draft.senderEmail === 'string' && draft.senderEmail.trim()) senderEmail.value = draft.senderEmail.trim()
    if (typeof draft.subject === 'string') subject.value = draft.subject
    if (typeof draft.message === 'string') message.value = draft.message
    draftHadImage.value = Boolean(draft.hadImage)
    draftImageName.value = String(draft.imageName || '')
    if (draft.audienceSignature === audienceSignature.value && Array.isArray(draft.deliveryItems)) {
      deliveryItems.value = draft.deliveryItems.map((item) => ({ ...item, status: item?.status === 'sending' ? 'pending' : item?.status }))
    }
    draftRestored.value = hasClosableState.value
  } catch {
    window.localStorage.removeItem(EMAIL_DRAFT_KEY)
  }
}

const clearDraft = () => {
  if (typeof window !== 'undefined') window.localStorage.removeItem(EMAIL_DRAFT_KEY)
  draftRestored.value = false
  draftHadImage.value = false
  draftImageName.value = ''
  draftReady.value = false
}

const handleBeforeUnload = (event) => {
  if (!hasClosableState.value) return
  persistDraft()
  event.preventDefault()
  event.returnValue = ''
}

const loadPreview = async () => {
  previewLoading.value = true
  errorMessage.value = ''
  try {
    const payload = await $fetch('/api/students/email/preview', {
      method: 'POST',
      body: {
        matriculas: selectedMatriculas.value,
        students: selectedContactStudents.value,
      },
    })
    recipients.value = Array.isArray(payload?.recipients) ? payload.recipients : []
    recipientGroups.value = Array.isArray(payload?.groups) ? payload.groups : []
    senders.value = Array.isArray(payload?.senders) ? payload.senders : []
    summary.value = { ...summary.value, ...(payload?.summary || {}) }
    senderEmail.value = String(payload?.defaultSender || senders.value[0]?.email || '').trim()
    initialSenderEmail.value = senderEmail.value
  } catch (error) {
    errorMessage.value = error?.data?.message || error?.data?.statusMessage || error?.statusMessage || error?.message || 'No se pudo preparar el correo.'
  } finally {
    previewLoading.value = false
  }
}

const revokeImagePreview = () => {
  if (imagePreview.value?.startsWith('blob:')) URL.revokeObjectURL(imagePreview.value)
}

const clearImage = () => {
  revokeImagePreview()
  imageFile.value = null
  imagePreview.value = ''
  draftHadImage.value = false
  draftImageName.value = ''
  if (filePicker.value) filePicker.value.value = ''
}

const setImage = (file) => {
  errorMessage.value = ''
  if (!file) return
  if (!String(file.type || '').startsWith('image/')) {
    errorMessage.value = 'Selecciona un archivo de imagen.'
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    errorMessage.value = 'La imagen supera 10 MB.'
    return
  }
  revokeImagePreview()
  imageFile.value = file
  imagePreview.value = URL.createObjectURL(file)
  draftHadImage.value = true
  draftImageName.value = file.name
}

const pickImage = () => filePicker.value?.click()
const handleFileInput = (event) => setImage(event.target?.files?.[0])

const studentSubsetForMatriculas = (matriculas = []) => {
  const wanted = new Set(matriculas.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean))
  return selectedContactStudents.value.filter((student) => wanted.has(String(student.matricula || '').trim().toUpperCase()))
}

const initializeDeliveryItems = () => {
  if (deliveryItems.value.length) return
  deliveryItems.value = recipientGroups.value.map((group, index) => ({
    key: `${group.email}-${index}`,
    label: Array.isArray(group.names) && group.names.length ? group.names.join(' · ') : (group.matriculas || []).join(' · '),
    detail: group.email,
    email: group.email,
    matriculas: Array.isArray(group.matriculas) ? [...group.matriculas] : [],
    status: 'pending',
    error: '',
  }))
}

const flattenMatriculas = (items) => Array.from(new Set(items.flatMap((item) => item.matriculas || []).map((value) => String(value || '').trim()).filter(Boolean)))

const deliveryResult = () => {
  const sentItems = deliveryItems.value.filter((item) => item.status === 'sent')
  const failedItems = deliveryItems.value.filter((item) => item.status === 'failed')
  const pendingItems = deliveryItems.value.filter((item) => item.status === 'pending' || item.status === 'sending')
  return {
    success: deliveryItems.value.length > 0 && failedItems.length === 0 && pendingItems.length === 0,
    partial: sentItems.length > 0 && failedItems.length > 0,
    sentEmails: sentItems.length,
    failedEmails: failedItems.length,
    pendingEmails: pendingItems.length,
    sentMatriculas: flattenMatriculas(sentItems),
    failedMatriculas: flattenMatriculas(failedItems),
    pendingMatriculas: flattenMatriculas(pendingItems),
    failures: failedItems.map((item) => ({ email: item.email, matriculas: item.matriculas, names: [item.label], message: item.error || 'No enviado' })),
    skipped: Number(summary.value.missingEmail || 0) + Number(summary.value.notFound || 0),
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
        if (draftHadImage.value && !imageFile.value) {
          throw new Error('Vuelve a seleccionar la imagen adjunta antes de continuar el envío.')
        }

        const form = new FormData()
        form.append('matriculas', JSON.stringify(item.matriculas || []))
        form.append('students', JSON.stringify(studentSubsetForMatriculas(item.matriculas)))
        form.append('senderEmail', senderEmail.value.trim())
        form.append('targetEmail', item.email)
        form.append('subject', subject.value.trim())
        form.append('message', message.value.trim())
        form.append('requestId', typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
        if (imageFile.value) form.append('image', imageFile.value, imageFile.value.name)

        const response = await $fetch('/api/students/email/send', {
          method: 'POST',
          body: form,
        })
        const sent = Number(response?.sentEmails || 0)
        const failed = Number(response?.failedEmails || 0)
        if (sent > 0 && failed === 0) {
          item.status = 'sent'
        } else {
          item.status = 'failed'
          item.error = response?.failures?.[0]?.message || 'Gmail no confirmó el envío.'
        }
      } catch (error) {
        item.status = 'failed'
        item.error = error?.data?.statusMessage
          || error?.data?.message
          || error?.data?.error
          || error?.statusMessage
          || error?.message
          || 'No se pudo enviar este correo.'
      }
    }
  } finally {
    sending.value = false
    emit('sent', deliveryResult())
  }
}

const sendBulk = async () => {
  if (!canSend.value) return
  await runDelivery(['pending'])
}
const retryFailed = async () => runDelivery(['failed'])
const continuePending = async () => runDelivery(['pending'])

const requestClose = () => {
  if (sending.value) return
  persistDraft()
  if (hasClosableState.value && typeof window !== 'undefined') {
    const confirmed = window.confirm(
      'Hay un borrador o progreso de envío en este diálogo. Se conservará automáticamente para continuar después. ¿Cerrar de todos modos?'
    )
    if (!confirmed) return
  }
  emit('close')
}

const closeAfterSend = () => {
  const completed = deliveryItems.value.length > 0 && deliveryItems.value.every((item) => item.status === 'sent')
  if (!completed) {
    requestClose()
    return
  }
  clearDraft()
  emit('close')
}

useModalEscape(requestClose)

watch(senderEmail, scheduleDraftSave)
watch(subject, scheduleDraftSave)
watch(message, scheduleDraftSave)
watch(imageFile, scheduleDraftSave)
watch(deliveryItems, scheduleDraftSave, { deep: true })

onMounted(async () => {
  await loadPreview()
  restoreDraft()
  if (draftHadImage.value && !imageFile.value && !errorMessage.value) {
    errorMessage.value = draftImageName.value
      ? `El borrador incluía ${draftImageName.value}. Vuelve a seleccionar esa imagen antes de enviar.`
      : 'El borrador incluía una imagen. Vuelve a seleccionarla antes de enviar.'
  }
  draftReady.value = true
  scheduleDraftSave()
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  if (draftTimer) clearTimeout(draftTimer)
  persistDraft()
  revokeImagePreview()
  if (typeof window !== 'undefined') window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<style scoped>
.email-bulk-overlay {
  position: fixed;
  inset: 0;
  z-index: 121;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(13, 24, 38, .46);
}
.email-bulk-modal {
  width: min(900px, calc(100vw - 32px));
  max-height: min(760px, calc(100vh - 32px));
  min-height: 540px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(121, 139, 160, .2);
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 28px 80px rgba(16, 30, 48, .2);
}
.email-bulk-header {
  min-height: 70px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid #edf0f3;
}
.email-bulk-brand { display: flex; align-items: center; gap: 11px; }
.email-bulk-brand__icon {
  width: 38px; height: 38px; display: grid; place-items: center; border-radius: 12px;
  background: #eef4fb; color: #3d6f9f;
}
.email-bulk-brand h2 { margin: 0; color: #1b2b40; font-size: 17px; font-weight: 880; }
.email-bulk-brand div > span { display: block; margin-top: 2px; color: #8190a1; font-size: 10px; font-weight: 680; }
.email-bulk-icon-button {
  width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: 11px; background: transparent; color: #728096; cursor: pointer;
}
.email-bulk-icon-button:hover:not(:disabled) { background: #f2f5f8; }
.email-bulk-loading { flex: 1; display: grid; place-items: center; color: #527ba2; }
.email-bulk-spin { animation: email-bulk-spin .82s linear infinite; }
@keyframes email-bulk-spin { to { transform: rotate(360deg); } }

.email-bulk-audience {
  display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-bottom: 1px solid #edf0f3; background: #fafbfd;
}
.email-bulk-audience > div { margin-right: auto; }
.email-bulk-audience strong, .email-bulk-audience > div span { display: block; }
.email-bulk-audience strong { color: #29384b; font-size: 11.5px; font-weight: 830; }
.email-bulk-audience > div span { margin-top: 2px; color: #8894a3; font-size: 9.5px; }
.email-bulk-audience > span { display: inline-flex; align-items: center; gap: 5px; padding: 5px 8px; border-radius: 999px; font-size: 9.5px; font-weight: 760; }
.email-bulk-audience .warning { background: #fff5e9; color: #a66b2c; }
.email-bulk-audience .soft { background: #f1f4f8; color: #69788a; }

.email-bulk-grid { display: grid; min-height: 0; flex: 1; grid-template-columns: minmax(0, 1.12fr) minmax(300px, .88fr); gap: 0; overflow: hidden; }
.email-bulk-compose { min-height: 0; display: flex; flex-direction: column; gap: 12px; padding: 18px 20px; overflow: auto; }
.email-field { display: flex; flex-direction: column; gap: 6px; }
.email-field > span { color: #526277; font-size: 10px; font-weight: 820; }
.email-field > small { align-self: flex-end; color: #929dab; font-size: 9px; }
.email-field input, .email-field textarea, .email-sender-input {
  width: 100%; border: 1px solid #dce3ea; border-radius: 11px; background: #fff; color: #233247; font: inherit; outline: 0;
}
.email-field > input { height: 41px; padding: 0 12px; font-size: 11.5px; }
.email-sender-input { height: 41px; display: flex; align-items: center; gap: 8px; padding: 0 11px; color: #6d7b8d; }
.email-sender-input input { min-width: 0; height: 100%; flex: 1; padding: 0; border: 0; border-radius: 0; font-size: 11.5px; }
.email-field textarea { min-height: 180px; resize: vertical; padding: 12px; font-size: 11.5px; line-height: 1.5; }
.email-field input:focus, .email-field textarea:focus, .email-sender-input:focus-within { border-color: #7da3c7; box-shadow: 0 0 0 4px rgba(70, 113, 155, .08); }
.email-message-field { flex: 1; }
.email-attachment-field { display: flex; flex-direction: column; gap: 8px; }
.email-attachment-field__heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.email-attachment-field__heading > span { color: #526277; font-size: 10px; font-weight: 820; }
.email-attachment-field__heading > small { color: #929dab; font-size: 9px; }
.email-attachment-button { min-height: 42px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 1px dashed #cbd7e3; border-radius: 11px; background: #f8fafc; color: #587897; font-size: 10.5px; font-weight: 800; cursor: pointer; }
.email-attachment-button:hover { border-color: #7da3c7; background: #f3f8fc; }
.email-attachment-card, .email-attachment-progress { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid #dfe6ed; border-radius: 12px; background: #f9fbfd; }
.email-attachment-card img, .email-attachment-progress img { width: 52px; height: 52px; object-fit: cover; border-radius: 9px; background: #eef2f6; }
.email-attachment-card > span, .email-attachment-progress > span { min-width: 0; flex: 1; }
.email-attachment-card strong, .email-attachment-card small, .email-attachment-progress strong, .email-attachment-progress small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.email-attachment-card strong, .email-attachment-progress strong { color: #31445b; font-size: 10px; }
.email-attachment-card small, .email-attachment-progress small { margin-top: 3px; color: #8c99a8; font-size: 9px; }
.email-attachment-card button { width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 9px; background: transparent; color: #7a8797; cursor: pointer; }
.email-attachment-card button:hover { background: #edf1f5; color: #ad4f43; }
.email-attachment-draft-note { color: #9b6a2f; font-size: 9px; line-height: 1.4; }
.email-file-input { display: none; }
.email-bulk-progress-shell { min-height: 0; flex: 1; display: flex; flex-direction: column; }
.email-attachment-restore { display: flex; align-items: center; gap: 12px; padding: 10px 18px; border-bottom: 1px solid #f0dfc8; background: #fff8ee; color: #805b2e; }
.email-attachment-restore > div { min-width: 0; flex: 1; display: flex; align-items: center; gap: 9px; }
.email-attachment-restore span { min-width: 0; }
.email-attachment-restore strong, .email-attachment-restore small { display: block; }
.email-attachment-restore strong { font-size: 10px; }
.email-attachment-restore small { margin-top: 2px; font-size: 9px; line-height: 1.35; }
.email-attachment-restore button { min-height: 32px; padding: 0 11px; border: 1px solid #d7ae75; border-radius: 9px; background: #fff; color: #8b622d; font-size: 9.5px; font-weight: 800; cursor: pointer; }
.email-attachment-progress { margin: 10px 18px 0; padding: 7px; }
.email-attachment-progress img { width: 38px; height: 38px; }
.email-preview__attachment { margin-top: 18px; display: flex; align-items: center; gap: 9px; padding: 8px; border: 1px solid #e1e7ed; border-radius: 11px; background: #f8fafc; }
.email-preview__attachment img { width: 48px; height: 48px; object-fit: cover; border-radius: 8px; }
.email-preview__attachment > span { min-width: 0; flex: 1; display: grid; grid-template-columns: auto 1fr; align-items: center; column-gap: 6px; color: #65758a; }
.email-preview__attachment strong, .email-preview__attachment small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.email-preview__attachment strong { color: #42556d; font-size: 9.5px; }
.email-preview__attachment small { grid-column: 2; color: #8c98a6; font-size: 8.5px; }

.email-bulk-error { color: #a34f43; font-size: 10px; font-weight: 690; }

.email-preview { min-width: 0; display: flex; flex-direction: column; border-left: 1px solid #edf0f3; background: #f7f9fb; }
.email-preview__bar { min-height: 60px; display: flex; align-items: center; gap: 9px; padding: 0 15px; border-bottom: 1px solid #e8edf2; background: #fff; }
.email-preview__bar > span { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 10px; background: #edf4fb; color: #4776a2; }
.email-preview__bar strong, .email-preview__bar small { display: block; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.email-preview__bar strong { color: #2c3a4e; font-size: 10.5px; font-weight: 820; }
.email-preview__bar small { margin-top: 2px; color: #8a96a4; font-size: 9px; }
.email-preview__content { margin: 18px; padding: 20px; border: 1px solid #e5eaf0; border-radius: 14px; background: #fff; box-shadow: 0 8px 24px rgba(29, 48, 71, .05); overflow: auto; }
.email-preview__content > strong { display: block; color: #1f3045; font-size: 14px; font-weight: 850; }
.email-preview__content p { margin: 16px 0 0; color: #415269; font-size: 11px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.email-preview__content p.empty { color: #9ba4af; }
.email-bulk-footer { min-height: 64px; display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 0 20px; border-top: 1px solid #edf0f3; }
.email-bulk-footer button { min-height: 38px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 15px; border-radius: 11px; font-size: 11px; font-weight: 820; cursor: pointer; }
.email-bulk-footer button:disabled { opacity: .45; cursor: default; }
.email-bulk-footer .secondary { border: 1px solid #dbe2e9; background: #fff; color: #5a687a; }
.email-bulk-footer .primary { border: 1px solid #477aa9; background: #477aa9; color: #fff; }

@media (max-width: 760px) {
  .email-bulk-overlay { padding: 0; align-items: end; }
  .email-bulk-modal { width: 100vw; max-height: 95vh; border-radius: 22px 22px 0 0; }
  .email-bulk-grid { grid-template-columns: 1fr; overflow: auto; }
  .email-preview { min-height: 250px; border-left: 0; border-top: 1px solid #edf0f3; }
  .email-bulk-audience { flex-wrap: wrap; }
}
</style>
