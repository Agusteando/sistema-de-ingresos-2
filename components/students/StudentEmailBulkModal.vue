<template>
  <Teleport to="body">
    <div class="email-bulk-overlay" @click.self="closeModal">
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
          <button class="email-bulk-icon-button" type="button" aria-label="Cerrar" :disabled="sending" @click="closeModal">
            <LucideX :size="20" />
          </button>
        </header>

        <div v-if="previewLoading" class="email-bulk-loading">
          <LucideLoader2 class="email-bulk-spin" :size="26" />
        </div>

        <StudentBulkDeliveryProgress
          v-else-if="hasStarted"
          :items="deliveryItems"
          :running="sending"
          :skipped="Number(summary.missingEmail || 0) + Number(summary.notFound || 0)"
          channel-label="correos"
          @retry-failed="retryFailed"
          @continue-pending="continuePending"
          @done="closeAfterSend"
        />

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
              </div>
            </aside>
          </main>

          <footer class="email-bulk-footer">
            <button type="button" class="secondary" :disabled="sending" @click="closeModal">Cancelar</button>
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
import { computed, onMounted, ref } from 'vue'
import {
  LucideLoader2,
  LucideMail,
  LucideMailWarning,
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
const previewLoading = ref(true)
const sending = ref(false)
const errorMessage = ref('')
const recipients = ref([])
const recipientGroups = ref([])
const senders = ref([])
const senderEmail = ref('')
const subject = ref('Aviso de Control Escolar')
const message = ref('')
const deliveryItems = ref([])
const summary = ref({ selected: 0, reachableStudents: 0, emails: 0, missingEmail: 0, notFound: 0, deduplicated: 0 })

const selectedMatriculas = computed(() => props.selectedStudents.map((student) => String(student?.matricula || '').trim()).filter(Boolean))
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
const canSend = computed(() => !sending.value && summary.value.emails > 0 && validSender.value && Boolean(subject.value.trim()) && Boolean(message.value.trim()))
const firstRecipientLabel = computed(() => recipientGroups.value[0]?.email || `${summary.value.emails || 0} destinatarios`)

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
  } catch (error) {
    errorMessage.value = error?.data?.message || error?.data?.statusMessage || error?.statusMessage || error?.message || 'No se pudo preparar el correo.'
  } finally {
    previewLoading.value = false
  }
}

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
        const response = await $fetch('/api/students/email/send', {
          method: 'POST',
          body: {
            matriculas: item.matriculas,
            students: studentSubsetForMatriculas(item.matriculas),
            senderEmail: senderEmail.value.trim(),
            targetEmail: item.email,
            subject: subject.value.trim(),
            message: message.value.trim(),
            requestId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
          },
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
const closeModal = () => {
  if (sending.value) return
  emit('close')
}
const closeAfterSend = () => emit('close')

useModalEscape(closeModal)
onMounted(loadPreview)
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
