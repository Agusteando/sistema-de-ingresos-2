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
          <button class="email-bulk-icon-button" type="button" aria-label="Cerrar" @click="requestClose">
            <LucideX :size="20" />
          </button>
        </header>

        <div v-if="previewLoading" class="email-bulk-loading">
          <LucideLoader2 class="email-bulk-spin" :size="26" />
        </div>

        <div v-else-if="hasStarted" class="email-bulk-progress-shell">
          <div v-if="draftHadAttachment && !attachmentFile" class="email-attachment-restore" role="status">
            <div>
              <LucidePaperclip :size="17" />
              <span>
                <strong>Este envío tenía un archivo adjunto.</strong>
                <small>Por seguridad el navegador no conserva archivos locales. Selecciónalo de nuevo antes de continuar el envío.</small>
              </span>
            </div>
            <button type="button" :disabled="sending" @click="pickAttachment">Volver a adjuntar</button>
          </div>
          <div v-else-if="attachmentFile" class="email-attachment-progress">
            <img v-if="attachmentIsImage" :src="attachmentPreview" alt="Imagen integrada en el correo" />
            <span v-else class="email-attachment-file-icon" aria-hidden="true"><LucideFileText :size="20" /></span>
            <span><strong>{{ attachmentFile.name }}</strong><small>{{ formattedFileSize }}</small></span>
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
          <input ref="filePicker" class="email-file-input" type="file" :accept="COMMUNICATION_ATTACHMENT_ACCEPT" @change="handleFileInput" />
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
              <div class="email-field email-sender-field">
                <span>Enviar como</span>
                <div
                  ref="senderPickerRef"
                  :class="['email-sender-picker', { open: senderPickerOpen }]"
                >
                  <button
                    type="button"
                    class="email-sender-trigger"
                    role="combobox"
                    aria-haspopup="listbox"
                    :aria-expanded="senderPickerOpen"
                    aria-controls="email-sender-options"
                    @click="toggleSenderPicker"
                  >
                    <span class="email-sender-avatar email-sender-avatar--selected" aria-hidden="true">
                      <img
                        v-if="selectedSender && senderAvatarVisible(selectedSender)"
                        :src="selectedSender.avatar"
                        :alt="''"
                        @error="markSenderAvatarFailed(selectedSender)"
                      />
                      <span v-else>{{ senderInitials(selectedSender) }}</span>
                    </span>
                    <span class="email-sender-trigger__identity">
                      <strong>{{ senderDisplayName || 'Selecciona una identidad' }}</strong>
                      <small v-if="selectedSender">{{ selectedSender.email }}</small>
                      <small v-else>Google Workspace</small>
                    </span>
                    <span v-if="selectedSender" class="email-sender-workspace-pill">
                      <LucideShieldCheck :size="12" /> Workspace
                    </span>
                    <LucideChevronDown class="email-sender-chevron" :size="16" />
                  </button>

                  <div v-if="senderPickerOpen" class="email-sender-popover">
                    <div class="email-sender-search">
                      <LucideSearch :size="16" />
                      <input
                        ref="senderSearchInput"
                        v-model="senderSearch"
                        type="search"
                        autocomplete="off"
                        spellcheck="false"
                        placeholder="Buscar por nombre, correo o área…"
                        aria-label="Buscar usuario de Google Workspace"
                        aria-autocomplete="list"
                        :aria-controls="'email-sender-options'"
                        :aria-activedescendant="senderResults.length ? `email-sender-option-${senderActiveIndex}` : undefined"
                        @keydown="handleSenderSearchKeydown"
                      />
                      <LucideLoader2 v-if="senderSearchLoading" class="email-bulk-spin" :size="15" />
                    </div>

                    <div class="email-sender-popover__meta">
                      <span>Identidades activas de Workspace</span>
                      <b>{{ senderResults.length }}</b>
                    </div>

                    <div
                      id="email-sender-options"
                      class="email-sender-options"
                      role="listbox"
                      aria-label="Usuarios de Google Workspace"
                    >
                      <template v-if="senderSearchLoading && !senderResults.length">
                        <div v-for="index in 4" :key="`sender-skeleton-${index}`" class="email-sender-option email-sender-option--skeleton">
                          <span class="email-sender-skeleton-avatar"></span>
                          <span class="email-sender-skeleton-copy"><i></i><i></i></span>
                        </div>
                      </template>

                      <div v-else-if="senderSearchError && !senderResults.length" class="email-sender-empty">
                        <LucideSearchX :size="22" />
                        <strong>No pudimos consultar Workspace</strong>
                        <span>{{ senderSearchError }}</span>
                        <button type="button" @click="searchSenderIdentities(senderSearch, true)">Reintentar</button>
                      </div>

                      <div v-else-if="!senderResults.length" class="email-sender-empty">
                        <LucideSearchX :size="22" />
                        <strong>Sin coincidencias</strong>
                        <span>Prueba con otro nombre, correo o área.</span>
                      </div>

                      <template v-else>
                        <button
                          v-for="(sender, index) in senderResults"
                          :id="`email-sender-option-${index}`"
                          :key="sender.email"
                          type="button"
                          role="option"
                          :aria-selected="sender.email === senderEmail"
                          :class="[
                            'email-sender-option',
                            {
                              active: senderActiveIndex === index,
                              selected: sender.email === senderEmail,
                            },
                          ]"
                          @mouseenter="senderActiveIndex = index"
                          @click="chooseSender(sender)"
                        >
                          <span class="email-sender-avatar" aria-hidden="true">
                            <img
                              v-if="senderAvatarVisible(sender)"
                              :src="sender.avatar"
                              :alt="''"
                              loading="lazy"
                              @error="markSenderAvatarFailed(sender)"
                            />
                            <span v-else>{{ senderInitials(sender) }}</span>
                          </span>
                          <span class="email-sender-option__copy">
                            <strong>{{ sender.name }}</strong>
                            <small>{{ sender.email }}</small>
                            <em v-if="senderMeta(sender)">{{ senderMeta(sender) }}</em>
                          </span>
                          <span class="email-sender-option__status">
                            <LucideCheck v-if="sender.email === senderEmail" :size="16" />
                            <span v-else></span>
                          </span>
                        </button>
                      </template>
                    </div>

                    <div class="email-sender-popover__footer">
                      <LucideShieldCheck :size="13" />
                      <span>La foto, el nombre y la identidad se obtienen de Google Workspace.</span>
                    </div>
                  </div>
                </div>
                <small class="email-sender-help">El correo se autentica con esta cuenta. Aurora verifica y muestra su identidad directamente desde Google Workspace.</small>
              </div>

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
                  <span>Archivo adjunto</span>
                  <small>Imágenes, PDF y documentos de Office · máximo 10 MB</small>
                </div>
                <div v-if="attachmentFile" class="email-attachment-card">
                  <img v-if="attachmentIsImage" :src="attachmentPreview" alt="Vista previa de la imagen dentro del correo" />
                  <span v-else class="email-attachment-file-icon" aria-hidden="true"><LucideFileText :size="22" /></span>
                  <span>
                    <strong>{{ attachmentFile.name }}</strong>
                    <small>{{ attachmentIsImage ? 'Imagen integrada' : 'Documento adjunto' }} · {{ formattedFileSize }}</small>
                  </span>
                  <button type="button" aria-label="Quitar archivo" @click="clearAttachment"><LucideX :size="16" /></button>
                </div>
                <button v-else type="button" class="email-attachment-button" @click="pickAttachment">
                  <LucidePaperclip :size="17" /> Adjuntar archivo
                </button>
                <small v-if="draftHadAttachment && !attachmentFile" class="email-attachment-draft-note">El borrador tenía un archivo adjunto. Vuelve a seleccionarlo antes de enviar.</small>
                <input ref="filePicker" class="email-file-input" type="file" :accept="COMMUNICATION_ATTACHMENT_ACCEPT" @change="handleFileInput" />
              </div>

              <span v-if="errorMessage" class="email-bulk-error">{{ errorMessage }}</span>
            </section>

            <aside class="email-preview" aria-label="Vista previa de correo">
              <div class="email-preview__bar">
                <span class="email-preview__sender-avatar" aria-hidden="true">
                  <img
                    v-if="selectedSender && senderAvatarVisible(selectedSender)"
                    :src="selectedSender.avatar"
                    :alt="''"
                    @error="markSenderAvatarFailed(selectedSender)"
                  />
                  <b v-else>{{ senderInitials(selectedSender) }}</b>
                </span>
                <div>
                  <strong>{{ senderDisplayName || 'Remitente de Workspace' }}</strong>
                  <small>{{ selectedSender ? `${selectedSender.email} · para ${firstRecipientLabel}` : firstRecipientLabel }}</small>
                </div>
                <span v-if="selectedSender" class="email-preview__workspace-mark" title="Identidad de Google Workspace">
                  <LucideShieldCheck :size="13" />
                </span>
              </div>
              <div class="email-preview__content">
                <strong>{{ subject || 'Asunto del correo' }}</strong>
                <p v-if="message.trim()">{{ message }}</p>
                <p v-else class="empty">El contenido del mensaje aparecerá aquí.</p>
                <div v-if="attachmentFile" :class="['email-preview__attachment', { 'email-preview__inline-image': attachmentIsImage, 'email-preview__document': !attachmentIsImage }]">
                  <img v-if="attachmentIsImage" :src="attachmentPreview" alt="Vista previa de la imagen dentro del correo" />
                  <span v-else class="email-preview__document-icon"><LucideFileText :size="22" /></span>
                  <small>{{ attachmentFile.name }} · {{ formattedFileSize }}</small>
                </div>
              </div>
            </aside>
          </main>

          <footer class="email-bulk-footer">
            <button type="button" class="secondary" @click="requestClose">Cancelar</button>
            <button type="button" class="primary" :disabled="!canSend" @click="sendBulk">
              <LucideLoader2 v-if="sending" class="email-bulk-spin" :size="17" />
              <LucideSend v-else :size="17" />
              {{ sending ? 'Enviando…' : `Enviar ${summary.emails}` }}
            </button>
          </footer>
        </template>
      </section>

      <div v-if="closeConfirmOpen" class="email-close-confirm-layer">
        <section class="email-close-confirm" role="alertdialog" aria-modal="true" aria-labelledby="email-close-confirm-title">
          <div class="email-close-confirm__icon"><LucideX :size="20" /></div>
          <div class="email-close-confirm__copy">
            <h3 id="email-close-confirm-title">¿Cerrar este envío?</h3>
            <p>{{ closeConfirmationText }}</p>
          </div>
          <div class="email-close-confirm__actions">
            <button type="button" class="secondary" @click="cancelClose">Seguir aquí</button>
            <button type="button" class="danger" @click="confirmClose">{{ sending ? 'Pausar y cerrar' : 'Sí, cerrar' }}</button>
          </div>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  LucideCheck,
  LucideChevronDown,
  LucideFileText,
  LucidePaperclip,
  LucideLoader2,
  LucideMail,
  LucideMailWarning,
  LucideSearch,
  LucideSearchX,
  LucideSend,
  LucideShieldCheck,
  LucideUsers,
  LucideX,
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
const closeConfirmOpen = ref(false)
const closeAfterCurrentSend = ref(false)
const errorMessage = ref('')
const recipients = ref([])
const recipientGroups = ref([])
const senders = ref([])
const senderEmail = ref('')
const senderPickerRef = ref(null)
const senderSearchInput = ref(null)
const senderPickerOpen = ref(false)
const senderSearch = ref('')
const senderSearchLoading = ref(false)
const senderSearchError = ref('')
const senderResults = ref([])
const senderActiveIndex = ref(0)
const failedSenderAvatars = ref(new Set())
const senderSearchCache = new Map()
let senderSearchTimer = null
let senderSearchSequence = 0
const subject = ref(DEFAULT_EMAIL_SUBJECT)
const message = ref('')
const attachmentFile = ref(null)
const attachmentPreview = ref('')
const filePicker = ref(null)
const draftHadAttachment = ref(false)
const draftAttachmentName = ref('')
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
const selectedSender = computed(() => senders.value.find((sender) => String(sender?.email || '').trim().toLowerCase() === String(senderEmail.value || '').trim().toLowerCase()) || null)
const senderDisplayName = computed(() => String(selectedSender.value?.name || '').trim())
const validSender = computed(() => /^[^\s@]+@casitaiedis\.edu\.mx$/i.test(String(senderEmail.value || '').trim()) && Boolean(senderDisplayName.value))
const canSend = computed(() => !sending.value && summary.value.emails > 0 && validSender.value && Boolean(subject.value.trim()) && Boolean(message.value.trim()) && !(draftHadAttachment.value && !attachmentFile.value))
const attachmentIsImage = computed(() => isCommunicationAttachmentImage(attachmentFile.value))
const firstRecipientLabel = computed(() => recipientGroups.value[0]?.email || `${summary.value.emails || 0} destinatarios`)
const formattedFileSize = computed(() => {
  const size = Number(attachmentFile.value?.size || 0)
  if (!size) return ''
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`
})

const normalizeSender = (sender = {}) => {
  const email = String(sender?.email || sender?.primaryEmail || '').trim().toLowerCase()
  const name = String(sender?.name || sender?.displayName || email).trim() || email
  return {
    ...sender,
    email,
    name,
    displayName: name,
    avatar: String(sender?.avatar || '').trim(),
    title: String(sender?.title || '').trim(),
    department: String(sender?.department || '').trim(),
    orgUnitPath: String(sender?.orgUnitPath || '').trim(),
  }
}

const mergeSenders = (incoming = []) => {
  const map = new Map(senders.value.map((sender) => [String(sender?.email || '').trim().toLowerCase(), normalizeSender(sender)]))
  for (const rawSender of incoming || []) {
    const sender = normalizeSender(rawSender)
    if (!sender.email) continue
    map.set(sender.email, { ...(map.get(sender.email) || {}), ...sender })
  }
  senders.value = Array.from(map.values())
}

const senderInitials = (sender) => {
  const label = String(sender?.name || sender?.email || 'Workspace').trim()
  const words = label.split(/\s+/).filter(Boolean)
  if (!words.length) return 'W'
  return `${words[0]?.[0] || ''}${words.length > 1 ? words[words.length - 1]?.[0] || '' : words[0]?.[1] || ''}`.toUpperCase().slice(0, 2)
}

const senderMeta = (sender) => {
  const title = String(sender?.title || '').trim()
  const department = String(sender?.department || '').trim()
  const orgUnitPath = String(sender?.orgUnitPath || '').trim().replace(/^\/+/, '').replace(/\//g, ' · ')
  return [title, department, orgUnitPath].filter((value, index, values) => value && values.indexOf(value) === index).slice(0, 2).join(' · ')
}

const senderAvatarVisible = (sender) => Boolean(
  sender?.avatar
  && sender?.email
  && !failedSenderAvatars.value.has(String(sender.email).toLowerCase())
)

const markSenderAvatarFailed = (sender) => {
  const email = String(sender?.email || '').trim().toLowerCase()
  if (!email || failedSenderAvatars.value.has(email)) return
  const next = new Set(failedSenderAvatars.value)
  next.add(email)
  failedSenderAvatars.value = next
}

const senderCacheKey = (search) => String(search || '').trim().toLowerCase()

const scrollActiveSenderIntoView = async () => {
  await nextTick()
  if (typeof document === 'undefined') return
  document.getElementById(`email-sender-option-${senderActiveIndex.value}`)?.scrollIntoView({ block: 'nearest' })
}

const searchSenderIdentities = async (search = '', force = false) => {
  const query = String(search || '').trim()
  const key = senderCacheKey(query)

  if (!query && !force) {
    senderResults.value = senders.value.slice(0, 12)
    senderSearchError.value = ''
    senderActiveIndex.value = Math.max(0, senderResults.value.findIndex((sender) => sender.email === senderEmail.value))
    return
  }

  if (!force && senderSearchCache.has(key)) {
    const cached = senderSearchCache.get(key) || []
    mergeSenders(cached)
    senderResults.value = cached
    senderSearchError.value = ''
    senderActiveIndex.value = Math.max(0, cached.findIndex((sender) => sender.email === senderEmail.value))
    return
  }

  const requestSequence = ++senderSearchSequence
  senderSearchLoading.value = true
  senderSearchError.value = ''
  try {
    const response = await $fetch('/api/students/email/senders', {
      query: { q: query, limit: 12 },
    })
    if (requestSequence !== senderSearchSequence) return
    const users = Array.isArray(response?.users) ? response.users.map(normalizeSender) : []
    senderSearchCache.set(key, users)
    mergeSenders(users)
    senderResults.value = users
    senderActiveIndex.value = Math.max(0, users.findIndex((sender) => sender.email === senderEmail.value))
    if (response?.warning && !users.length) senderSearchError.value = String(response.warning)
  } catch (error) {
    if (requestSequence !== senderSearchSequence) return
    senderResults.value = []
    senderSearchError.value = error?.data?.message || error?.data?.statusMessage || error?.statusMessage || error?.message || 'No se pudo consultar Google Workspace.'
  } finally {
    if (requestSequence === senderSearchSequence) senderSearchLoading.value = false
  }
}

const scheduleSenderSearch = () => {
  if (!senderPickerOpen.value) return
  if (senderSearchTimer) clearTimeout(senderSearchTimer)
  senderSearchTimer = setTimeout(() => {
    senderSearchTimer = null
    searchSenderIdentities(senderSearch.value)
  }, 180)
}

const openSenderPicker = async () => {
  if (senderPickerOpen.value) return
  senderPickerOpen.value = true
  senderSearch.value = ''
  senderSearchError.value = ''
  senderResults.value = senders.value.slice(0, 12)
  senderActiveIndex.value = Math.max(0, senderResults.value.findIndex((sender) => sender.email === senderEmail.value))
  await nextTick()
  senderSearchInput.value?.focus()
  senderSearchInput.value?.select?.()
}

const closeSenderPicker = () => {
  if (!senderPickerOpen.value) return
  senderPickerOpen.value = false
  senderSearch.value = ''
  senderSearchError.value = ''
  if (senderSearchTimer) {
    clearTimeout(senderSearchTimer)
    senderSearchTimer = null
  }
}

const toggleSenderPicker = () => senderPickerOpen.value ? closeSenderPicker() : openSenderPicker()

const chooseSender = (sender) => {
  const normalized = normalizeSender(sender)
  mergeSenders([normalized])
  senderEmail.value = normalized.email
  closeSenderPicker()
}

const handleSenderSearchKeydown = async (event) => {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (!senderResults.value.length) return
    senderActiveIndex.value = (senderActiveIndex.value + 1) % senderResults.value.length
    await scrollActiveSenderIntoView()
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (!senderResults.value.length) return
    senderActiveIndex.value = (senderActiveIndex.value - 1 + senderResults.value.length) % senderResults.value.length
    await scrollActiveSenderIntoView()
    return
  }
  if (event.key === 'Enter') {
    const sender = senderResults.value[senderActiveIndex.value]
    if (!sender) return
    event.preventDefault()
    chooseSender(sender)
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeSenderPicker()
  }
}

const handleSenderPickerPointerDown = (event) => {
  if (!senderPickerOpen.value || !senderPickerRef.value) return
  if (!senderPickerRef.value.contains(event.target)) closeSenderPicker()
}

const ensureSelectedSenderLoaded = async () => {
  const email = String(senderEmail.value || '').trim().toLowerCase()
  if (!email || selectedSender.value) return
  await searchSenderIdentities(email, true)
}

const closeConfirmationText = computed(() => sending.value
  ? 'El envío que ya está en curso terminará primero. Después se pausará la lista antes del siguiente destinatario, se guardará el progreso y se cerrará el diálogo.'
  : 'El borrador y el progreso actual se conservarán para que puedas continuar después. Esta acción solo cerrará el diálogo.')

const hasClosableState = computed(() => Boolean(
  message.value.trim()
  || attachmentFile.value
  || draftHadAttachment.value
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
    hadAttachment: Boolean(attachmentFile.value || draftHadAttachment.value),
    attachmentName: String(attachmentFile.value?.name || draftAttachmentName.value || ''),
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
    draftHadAttachment.value = Boolean(draft.hadAttachment ?? draft.hadImage)
    draftAttachmentName.value = String(draft.attachmentName || draft.imageName || '')
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
  draftHadAttachment.value = false
  draftAttachmentName.value = ''
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
    senders.value = Array.isArray(payload?.senders) ? payload.senders.map(normalizeSender) : []
    senderResults.value = senders.value.slice(0, 12)
    summary.value = { ...summary.value, ...(payload?.summary || {}) }
    senderEmail.value = String(payload?.defaultSender || senders.value[0]?.email || '').trim()
    initialSenderEmail.value = senderEmail.value
  } catch (error) {
    errorMessage.value = error?.data?.message || error?.data?.statusMessage || error?.statusMessage || error?.message || 'No se pudo preparar el correo.'
  } finally {
    previewLoading.value = false
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
  draftAttachmentName.value = ''
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
  draftAttachmentName.value = file.name
}

const pickAttachment = () => filePicker.value?.click()
const handleFileInput = (event) => setAttachment(event.target?.files?.[0])

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
        if (draftHadAttachment.value && !attachmentFile.value) {
          throw new Error('Vuelve a seleccionar el archivo adjunto antes de continuar el envío.')
        }

        const form = new FormData()
        form.append('matriculas', JSON.stringify(item.matriculas || []))
        form.append('students', JSON.stringify(studentSubsetForMatriculas(item.matriculas)))
        form.append('senderEmail', senderEmail.value.trim())
        form.append('senderName', senderDisplayName.value)
        form.append('targetEmail', item.email)
        form.append('subject', subject.value.trim())
        form.append('message', message.value.trim())
        form.append('requestId', typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
        if (attachmentFile.value) form.append('attachment', attachmentFile.value, attachmentFile.value.name)

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

      if (closeAfterCurrentSend.value) break
    }
  } finally {
    sending.value = false
    persistDraft()
    emit('sent', deliveryResult())
    if (closeAfterCurrentSend.value) {
      emit('close')
    }
  }
}

const sendBulk = async () => {
  if (!canSend.value) return
  await runDelivery(['pending'])
}
const retryFailed = async () => runDelivery(['failed'])
const continuePending = async () => runDelivery(['pending'])

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

useModalEscape(() => {
  if (senderPickerOpen.value) {
    closeSenderPicker()
    return
  }
  if (closeConfirmOpen.value) {
    cancelClose()
    return
  }
  requestClose()
})

watch(senderEmail, scheduleDraftSave)
watch(senderSearch, scheduleSenderSearch)
watch(subject, scheduleDraftSave)
watch(message, scheduleDraftSave)
watch(attachmentFile, scheduleDraftSave)
watch(deliveryItems, scheduleDraftSave, { deep: true })

onMounted(async () => {
  await loadPreview()
  restoreDraft()
  await ensureSelectedSenderLoaded()
  if (draftHadAttachment.value && !attachmentFile.value && !errorMessage.value) {
    errorMessage.value = draftAttachmentName.value
      ? `El borrador incluía ${draftAttachmentName.value}. Vuelve a seleccionar ese archivo antes de enviar.`
      : 'El borrador incluía un archivo adjunto. Vuelve a seleccionarlo antes de enviar.'
  }
  draftReady.value = true
  scheduleDraftSave()
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('pointerdown', handleSenderPickerPointerDown)
  }
})

onBeforeUnmount(() => {
  if (draftTimer) clearTimeout(draftTimer)
  if (senderSearchTimer) clearTimeout(senderSearchTimer)
  persistDraft()
  revokeAttachmentPreview()
  if (typeof window !== 'undefined') {
    window.removeEventListener('beforeunload', handleBeforeUnload)
    document.removeEventListener('pointerdown', handleSenderPickerPointerDown)
  }
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
.email-field > input, .email-field textarea {
  width: 100%; border: 1px solid #dce3ea; border-radius: 11px; background: #fff; color: #233247; font: inherit; outline: 0;
}
.email-field > input { height: 41px; padding: 0 12px; font-size: 11.5px; }
.email-field textarea { min-height: 180px; resize: vertical; padding: 12px; font-size: 11.5px; line-height: 1.5; }
.email-field > input:focus, .email-field textarea:focus { border-color: #7da3c7; box-shadow: 0 0 0 4px rgba(70, 113, 155, .08); }

.email-sender-field { position: relative; z-index: 12; }
.email-sender-help { max-width: 100%; align-self: flex-start !important; line-height: 1.4; }
.email-sender-picker { position: relative; width: 100%; }
.email-sender-trigger {
  width: 100%; min-height: 54px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 10px;
  padding: 7px 10px 7px 8px; border: 1px solid #d9e2eb; border-radius: 14px; background: linear-gradient(180deg, #fff 0%, #fbfcfe 100%);
  color: #24354b; text-align: left; cursor: pointer; outline: 0; box-shadow: 0 1px 2px rgba(30, 49, 72, .025); transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease, background .16s ease;
}
.email-sender-trigger:hover { border-color: #b8cadb; background: #fff; box-shadow: 0 7px 20px rgba(48, 78, 108, .07); }
.email-sender-picker.open .email-sender-trigger { border-color: #7399bc; box-shadow: 0 0 0 4px rgba(70, 113, 155, .09), 0 8px 24px rgba(38, 65, 92, .08); }
.email-sender-avatar {
  position: relative; width: 42px; height: 42px; flex: 0 0 auto; display: grid; place-items: center; overflow: hidden; border: 1px solid rgba(82, 108, 137, .13); border-radius: 50%;
  background: linear-gradient(145deg, #e9f2fb, #f3effb); color: #4a6f95; font-size: 11px; font-weight: 900; letter-spacing: .02em; box-shadow: inset 0 0 0 2px rgba(255,255,255,.8);
}
.email-sender-avatar img { width: 100%; height: 100%; display: block; object-fit: cover; }
.email-sender-avatar--selected { width: 38px; height: 38px; }
.email-sender-trigger__identity { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.email-sender-trigger__identity strong, .email-sender-trigger__identity small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.email-sender-trigger__identity strong { color: #263a53; font-size: 11.5px; font-weight: 850; }
.email-sender-trigger__identity small { color: #8290a1; font-size: 9.5px; font-weight: 620; }
.email-sender-workspace-pill { display: inline-flex; align-items: center; gap: 4px; padding: 5px 7px; border: 1px solid #dce8f3; border-radius: 999px; background: #f2f7fb; color: #4e7396; font-size: 8.5px; font-weight: 820; white-space: nowrap; }
.email-sender-chevron { color: #8492a4; transition: transform .16s ease; }
.email-sender-picker.open .email-sender-chevron { transform: rotate(180deg); }

.email-sender-popover {
  position: absolute; top: calc(100% + 8px); left: 0; right: 0; z-index: 80; overflow: hidden;
  border: 1px solid rgba(121, 143, 168, .24); border-radius: 16px; background: rgba(255,255,255,.985);
  box-shadow: 0 22px 55px rgba(24, 43, 66, .2), 0 2px 10px rgba(24, 43, 66, .06); backdrop-filter: blur(16px);
  transform-origin: top center; animation: email-sender-pop .14s ease-out;
}
@keyframes email-sender-pop { from { opacity: 0; transform: translateY(-5px) scale(.992); } to { opacity: 1; transform: translateY(0) scale(1); } }
.email-sender-search { min-height: 48px; display: flex; align-items: center; gap: 8px; margin: 10px 10px 7px; padding: 0 11px; border: 1px solid #dce5ee; border-radius: 11px; background: #f8fafc; color: #6f8296; }
.email-sender-search:focus-within { border-color: #8baac6; background: #fff; box-shadow: 0 0 0 3px rgba(79, 119, 156, .08); }
.email-sender-search input { min-width: 0; flex: 1; height: 42px; padding: 0; border: 0; background: transparent; color: #26384e; font: inherit; font-size: 11px; outline: 0; }
.email-sender-search input::placeholder { color: #9aa6b4; }
.email-sender-search input::-webkit-search-cancel-button { display: none; }
.email-sender-popover__meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 3px 13px 7px; color: #8b98a8; font-size: 8.5px; font-weight: 760; text-transform: uppercase; letter-spacing: .055em; }
.email-sender-popover__meta b { min-width: 20px; height: 20px; display: grid; place-items: center; padding: 0 5px; border-radius: 999px; background: #eef3f8; color: #61778e; font-size: 8px; }
.email-sender-options { max-height: 286px; overflow: auto; padding: 0 6px 7px; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #d7e0e9 transparent; }
.email-sender-option {
  width: 100%; min-height: 60px; display: grid; grid-template-columns: auto minmax(0, 1fr) 28px; align-items: center; gap: 10px;
  padding: 8px; border: 0; border-radius: 12px; background: transparent; color: #26384e; text-align: left; cursor: pointer; transition: background .12s ease, box-shadow .12s ease;
}
.email-sender-option:hover, .email-sender-option.active { background: #f4f8fc; }
.email-sender-option.selected { background: linear-gradient(90deg, #eef6fc 0%, #f7faff 100%); box-shadow: inset 3px 0 0 #5d88b0; }
.email-sender-option .email-sender-avatar { width: 42px; height: 42px; }
.email-sender-option__copy { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.email-sender-option__copy strong, .email-sender-option__copy small, .email-sender-option__copy em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.email-sender-option__copy strong { color: #273b53; font-size: 10.5px; font-weight: 840; }
.email-sender-option__copy small { color: #7e8da0; font-size: 9.25px; }
.email-sender-option__copy em { margin-top: 2px; color: #9aa5b1; font-size: 8.2px; font-style: normal; font-weight: 650; }
.email-sender-option__status { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 50%; color: #477ba8; }
.email-sender-option.selected .email-sender-option__status { background: #e0edf8; }
.email-sender-empty { min-height: 150px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; color: #8b98a7; text-align: center; }
.email-sender-empty > svg { margin-bottom: 7px; color: #91a6ba; }
.email-sender-empty strong { color: #4e6178; font-size: 10.5px; }
.email-sender-empty span { max-width: 250px; margin-top: 4px; font-size: 9px; line-height: 1.45; }
.email-sender-empty button { margin-top: 10px; min-height: 30px; padding: 0 10px; border: 1px solid #cddbe8; border-radius: 9px; background: #fff; color: #557b9e; font-size: 9px; font-weight: 800; cursor: pointer; }
.email-sender-option--skeleton { cursor: default; pointer-events: none; }
.email-sender-skeleton-avatar { width: 42px; height: 42px; border-radius: 50%; background: #edf1f5; animation: email-sender-pulse 1.15s ease-in-out infinite; }
.email-sender-skeleton-copy { display: flex; flex-direction: column; gap: 7px; }
.email-sender-skeleton-copy i { height: 8px; width: 62%; border-radius: 999px; background: #edf1f5; animation: email-sender-pulse 1.15s ease-in-out infinite; }
.email-sender-skeleton-copy i:last-child { width: 42%; }
@keyframes email-sender-pulse { 50% { opacity: .48; } }
.email-sender-popover__footer { min-height: 34px; display: flex; align-items: center; gap: 6px; padding: 0 12px; border-top: 1px solid #edf1f5; background: #fafbfd; color: #8a98a8; font-size: 8.25px; line-height: 1.3; }
.email-sender-popover__footer svg { color: #6487a6; }
.email-message-field { flex: 1; }
.email-attachment-field { display: flex; flex-direction: column; gap: 8px; }
.email-attachment-field__heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.email-attachment-field__heading > span { color: #526277; font-size: 10px; font-weight: 820; }
.email-attachment-field__heading > small { color: #929dab; font-size: 9px; }
.email-attachment-button { min-height: 42px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 1px dashed #cbd7e3; border-radius: 11px; background: #f8fafc; color: #587897; font-size: 10.5px; font-weight: 800; cursor: pointer; }
.email-attachment-button:hover { border-color: #7da3c7; background: #f3f8fc; }
.email-attachment-card, .email-attachment-progress { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid #dfe6ed; border-radius: 12px; background: #f9fbfd; }
.email-attachment-card img, .email-attachment-progress img { width: 52px; height: 52px; object-fit: cover; border-radius: 9px; background: #eef2f6; }
.email-attachment-file-icon { width: 52px; height: 52px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 9px; background: #eef3f8; color: #5d7895; }
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
.email-attachment-progress .email-attachment-file-icon { width: 38px; height: 38px; }
.email-preview__attachment { margin-top: 18px; }
.email-preview__inline-image img { display: block; width: 100%; max-height: 320px; object-fit: contain; border-radius: 10px; background: #f4f6f8; }
.email-preview__inline-image small { display: block; margin-top: 6px; color: #8c98a6; font-size: 8.5px; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.email-preview__document { margin-top: 10px; display: flex; align-items: center; gap: 9px; padding: 9px 10px; border: 1px solid #e0e7ee; border-radius: 10px; background: #f7f9fb; }
.email-preview__document-icon { width: 34px; height: 34px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 8px; background: #eaf0f6; color: #597794; }
.email-preview__document small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #66788a; font-size: 9px; }

.email-bulk-error { color: #a34f43; font-size: 10px; font-weight: 690; }

.email-preview { min-width: 0; display: flex; flex-direction: column; border-left: 1px solid #edf0f3; background: #f7f9fb; }
.email-preview__bar { min-height: 60px; display: flex; align-items: center; gap: 9px; padding: 0 15px; border-bottom: 1px solid #e8edf2; background: #fff; }
.email-preview__sender-avatar { width: 34px; height: 34px; flex: 0 0 auto; display: grid; place-items: center; overflow: hidden; border: 1px solid #dde6ee; border-radius: 50%; background: linear-gradient(145deg, #e9f2fb, #f3effb); color: #52759a; font-size: 9px; }
.email-preview__sender-avatar img { width: 100%; height: 100%; object-fit: cover; }
.email-preview__sender-avatar b { font-size: 9px; font-weight: 900; }
.email-preview__bar > div { min-width: 0; flex: 1; }
.email-preview__bar strong, .email-preview__bar small { display: block; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.email-preview__workspace-mark { width: 26px; height: 26px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%; background: #edf5fb; color: #527da5; }
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
  .email-sender-workspace-pill { display: none; }
  .email-sender-popover { position: fixed; left: 12px; right: 12px; top: auto; bottom: 12px; max-height: min(70vh, 520px); border-radius: 18px; }
  .email-sender-options { max-height: min(46vh, 340px); }
}

.email-close-confirm-layer { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 24px; background: rgba(15, 23, 42, .48); backdrop-filter: blur(4px); }
.email-close-confirm { width: min(440px, 100%); display: grid; grid-template-columns: auto 1fr; gap: 14px; padding: 20px; border-radius: 18px; background: #fff; box-shadow: 0 24px 80px rgba(15, 23, 42, .28); }
.email-close-confirm__icon { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 12px; background: #fff1f2; color: #be123c; }
.email-close-confirm__copy h3 { margin: 0 0 6px; font-size: 17px; color: #172033; }
.email-close-confirm__copy p { margin: 0; color: #667085; font-size: 13px; line-height: 1.5; }
.email-close-confirm__actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
.email-close-confirm__actions .danger { border: 0; border-radius: 10px; padding: 10px 14px; background: #be123c; color: #fff; font-weight: 700; cursor: pointer; }
</style>
