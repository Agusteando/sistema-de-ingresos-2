<template>
  <div class="receipt-email-backdrop" role="presentation" @mousedown.self="close">
    <section
      class="receipt-email-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-email-title"
      @keydown.esc="close"
    >
      <header class="receipt-email-header">
        <div>
          <p class="receipt-email-eyebrow">Comprobante de pago</p>
          <h2 id="receipt-email-title">Enviar por correo</h2>
          <p v-if="!sent">
            Elige un correo guardado de la familia. Puedes corregirlo aquí mismo si está desactualizado.
          </p>
        </div>
        <button class="receipt-email-icon-button" type="button" aria-label="Cerrar" @click="close">
          <LucideX :size="20" />
        </button>
      </header>

      <div v-if="sent" class="receipt-email-success">
        <span class="receipt-email-success-icon"><LucideCheck :size="24" /></span>
        <strong>Comprobante enviado</strong>
        <span>{{ sentTo }}</span>
        <button class="btn btn-primary" type="button" @click="close">Listo</button>
      </div>

      <template v-else>
        <div v-if="loading" class="receipt-email-state">
          <LucideLoaderCircle class="receipt-email-spin" :size="22" />
          <span>Consultando correos guardados…</span>
        </div>

        <div v-else class="receipt-email-body">
          <div v-if="studentName" class="receipt-email-student">
            <strong>{{ studentName }}</strong>
            <span>{{ matricula }}</span>
          </div>

          <div v-if="loadError" class="receipt-email-notice receipt-email-notice--error">
            <span>{{ loadError }}</span>
            <button type="button" @click="loadContacts">Reintentar</button>
          </div>

          <div class="receipt-email-options">
            <article
              v-for="item in contacts"
              :key="item.key"
              class="receipt-email-option"
              :class="{ 'is-selected': selected === item.key, 'is-editing': editing === item.key }"
            >
              <div class="receipt-email-option-main">
                <label class="receipt-email-choice">
                  <input
                    v-model="selected"
                    type="radio"
                    name="receipt-email-destination"
                    :value="item.key"
                    :disabled="!item.valid || editing === item.key"
                  />
                  <span class="receipt-email-avatar"><LucideUserRound :size="18" /></span>
                  <span class="receipt-email-contact-copy">
                    <strong>{{ item.label }}<span v-if="item.name"> · {{ item.name }}</span></strong>
                    <span :class="{ 'is-missing': !item.valid }">
                      {{ item.email || 'Sin correo guardado' }}
                    </span>
                  </span>
                </label>
                <button
                  class="receipt-email-edit-button"
                  type="button"
                  :disabled="savingContact === item.key"
                  @click="beginEdit(item)"
                >
                  <LucidePencil :size="15" />
                  {{ item.email ? 'Corregir' : 'Agregar' }}
                </button>
              </div>

              <div v-if="editing === item.key" class="receipt-email-edit-panel">
                <label :for="`receipt-email-${item.key}`">Correo de {{ item.label.toLowerCase() }}</label>
                <div class="receipt-email-edit-row">
                  <input
                    :id="`receipt-email-${item.key}`"
                    v-model="editEmail"
                    type="email"
                    autocomplete="off"
                    inputmode="email"
                    :disabled="savingContact === item.key"
                    @keydown.enter.prevent="saveContact(item)"
                  />
                  <button
                    class="btn btn-primary"
                    type="button"
                    :disabled="savingContact === item.key || !editEmailValid"
                    @click="saveContact(item)"
                  >
                    <LucideLoaderCircle v-if="savingContact === item.key" class="receipt-email-spin" :size="16" />
                    <LucideCheck v-else :size="16" />
                    Guardar
                  </button>
                  <button class="btn btn-ghost" type="button" :disabled="savingContact === item.key" @click="cancelEdit">
                    Cancelar
                  </button>
                </div>
                <small v-if="editEmailError" class="receipt-email-field-error">{{ editEmailError }}</small>
                <small v-else>Se actualizará el correo en Control Escolar.</small>
              </div>
            </article>

            <article class="receipt-email-option" :class="{ 'is-selected': selected === 'other' }">
              <label class="receipt-email-choice receipt-email-choice--other">
                <input v-model="selected" type="radio" name="receipt-email-destination" value="other" />
                <span class="receipt-email-avatar"><LucideMail :size="18" /></span>
                <span class="receipt-email-contact-copy">
                  <strong>Otro correo</strong>
                  <span>Usar otro destinatario solo para este envío</span>
                </span>
              </label>
              <div v-if="selected === 'other'" class="receipt-email-other-input">
                <input
                  v-model="otherEmail"
                  type="email"
                  autocomplete="off"
                  inputmode="email"
                  placeholder="correo@ejemplo.com"
                  @keydown.enter.prevent="send"
                />
                <small v-if="otherEmailError" class="receipt-email-field-error">{{ otherEmailError }}</small>
              </div>
            </article>
          </div>

          <div v-if="actionError" class="receipt-email-notice receipt-email-notice--error">
            {{ actionError }}
          </div>
        </div>

        <footer class="receipt-email-footer">
          <button class="btn btn-ghost" type="button" :disabled="sending" @click="close">Cancelar</button>
          <button class="btn btn-primary" type="button" :disabled="loading || sending || !canSend" @click="send">
            <LucideLoaderCircle v-if="sending" class="receipt-email-spin" :size="16" />
            <LucideMail v-else :size="16" />
            {{ sending ? 'Enviando…' : 'Enviar comprobante' }}
          </button>
        </footer>
      </template>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import {
  LucideCheck,
  LucideLoaderCircle,
  LucideMail,
  LucidePencil,
  LucideUserRound,
  LucideX,
} from 'lucide-vue-next'
import {
  emailAddressValidationMessage,
  isValidEmailAddress,
  normalizeEmailAddress,
} from '~/shared/utils/email'

const props = defineProps({
  folios: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['close', 'sent'])

const loading = ref(true)
const loadError = ref('')
const actionError = ref('')
const contacts = ref([])
const selected = ref('')
const studentName = ref('')
const matricula = ref('')
const plantel = ref('')
const ciclo = ref('')
const editing = ref('')
const editEmail = ref('')
const savingContact = ref('')
const otherEmail = ref('')
const sending = ref(false)
const sent = ref(false)
const sentTo = ref('')

const selectedContact = computed(() => contacts.value.find((item) => item.key === selected.value) || null)
const destinationEmail = computed(() => selected.value === 'other'
  ? normalizeEmailAddress(otherEmail.value)
  : normalizeEmailAddress(selectedContact.value?.email))

const otherEmailError = computed(() => {
  if (selected.value !== 'other' || !otherEmail.value) return ''
  return emailAddressValidationMessage(otherEmail.value)
})

const editEmailError = computed(() => {
  if (!editEmail.value) return 'Ingresa un correo electrónico.'
  return emailAddressValidationMessage(editEmail.value)
})

const editEmailValid = computed(() => isValidEmailAddress(editEmail.value, { allowEmpty: false }))
const canSend = computed(() => isValidEmailAddress(destinationEmail.value, { allowEmpty: false }))

const apiMessage = (error, fallback) => error?.data?.message || error?.message || fallback

const chooseDefault = () => {
  if (contacts.value.some((item) => item.key === selected.value && item.valid)) return
  selected.value = contacts.value.find((item) => item.valid)?.key || 'other'
}

const loadContacts = async () => {
  loading.value = true
  loadError.value = ''
  actionError.value = ''
  try {
    const response = await $fetch('/api/payments/receipt-contacts', {
      params: { folios: props.folios.join(',') },
    })
    contacts.value = Array.isArray(response?.contacts) ? response.contacts : []
    studentName.value = response?.studentName || ''
    matricula.value = response?.matricula || ''
    plantel.value = response?.plantel || ''
    ciclo.value = response?.ciclo || ''
    chooseDefault()
  } catch (error) {
    contacts.value = []
    selected.value = 'other'
    loadError.value = apiMessage(error, 'No se pudieron consultar los correos guardados. Puedes usar otro correo para este envío.')
  } finally {
    loading.value = false
  }
}

const beginEdit = async (item) => {
  editing.value = item.key
  editEmail.value = item.email || ''
  actionError.value = ''
  await nextTick()
  document.getElementById(`receipt-email-${item.key}`)?.focus()
}

const cancelEdit = () => {
  editing.value = ''
  editEmail.value = ''
}

const saveContact = async (item) => {
  if (!editEmailValid.value || savingContact.value) return
  savingContact.value = item.key
  actionError.value = ''
  const email = normalizeEmailAddress(editEmail.value)

  try {
    const response = await $fetch(`/api/students/${encodeURIComponent(matricula.value)}/family-emails`, {
      method: 'PATCH',
      body: {
        plantel: plantel.value,
        ciclo: ciclo.value,
        [item.field]: email,
      },
    })
    const updatedFromServer = normalizeEmailAddress(response?.student?.[item.field] || response?.emails?.[item.field] || email)
    contacts.value = contacts.value.map((contact) => contact.key === item.key
      ? { ...contact, email: updatedFromServer, valid: isValidEmailAddress(updatedFromServer, { allowEmpty: false }) }
      : contact)
    selected.value = item.key
    cancelEdit()
  } catch (error) {
    actionError.value = apiMessage(error, `No se pudo actualizar el correo de ${item.label.toLowerCase()}.`)
  } finally {
    savingContact.value = ''
  }
}

const send = async () => {
  if (!canSend.value || sending.value) return
  sending.value = true
  actionError.value = ''
  const email = destinationEmail.value

  try {
    await $fetch('/api/payments/email-receipt', {
      method: 'POST',
      body: { folios: props.folios, email },
    })
    sentTo.value = email
    sent.value = true
    emit('sent', { email })
  } catch (error) {
    actionError.value = apiMessage(error, 'No se pudo enviar el comprobante.')
  } finally {
    sending.value = false
  }
}

const close = () => {
  if (sending.value || savingContact.value) return
  emit('close')
}

onMounted(loadContacts)
</script>

<style scoped>
.receipt-email-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15, 23, 42, .52);
  backdrop-filter: blur(3px);
}

.receipt-email-modal {
  width: min(620px, 100%);
  max-height: min(760px, calc(100vh - 40px));
  overflow: auto;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  background: #fff;
  color: #0f172a;
  box-shadow: 0 28px 80px rgba(15, 23, 42, .24);
}

.receipt-email-header,
.receipt-email-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 20px 22px;
}

.receipt-email-header {
  align-items: flex-start;
  border-bottom: 1px solid #e2e8f0;
}

.receipt-email-header h2 {
  margin: 2px 0 5px;
  font-size: 22px;
  font-weight: 750;
  letter-spacing: -.02em;
}

.receipt-email-header p:not(.receipt-email-eyebrow) {
  max-width: 500px;
  margin: 0;
  color: #64748b;
  font-size: 14px;
  line-height: 1.45;
}

.receipt-email-eyebrow {
  margin: 0;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.receipt-email-icon-button,
.receipt-email-edit-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}

.receipt-email-icon-button {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border-radius: 10px;
}

.receipt-email-icon-button:hover,
.receipt-email-edit-button:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.receipt-email-body {
  display: grid;
  gap: 14px;
  padding: 20px 22px 8px;
}

.receipt-email-student {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  color: #334155;
  font-size: 13px;
}

.receipt-email-student strong {
  color: #0f172a;
  font-size: 14px;
}

.receipt-email-options {
  display: grid;
  gap: 10px;
}

.receipt-email-option {
  border: 1px solid #dbe3ee;
  border-radius: 14px;
  background: #fff;
  transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
}

.receipt-email-option.is-selected {
  border-color: #64748b;
  background: #f8fafc;
  box-shadow: 0 0 0 1px #64748b;
}

.receipt-email-option-main {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
}

.receipt-email-choice {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 11px;
  cursor: pointer;
}

.receipt-email-choice input[type='radio'] {
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
  accent-color: #0f172a;
}

.receipt-email-avatar {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border-radius: 10px;
  background: #eef2f7;
  color: #475569;
}

.receipt-email-contact-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.receipt-email-contact-copy strong,
.receipt-email-contact-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.receipt-email-contact-copy strong {
  color: #1e293b;
  font-size: 14px;
  font-weight: 700;
}

.receipt-email-contact-copy span {
  color: #64748b;
  font-size: 13px;
}

.receipt-email-contact-copy span.is-missing {
  color: #b45309;
}

.receipt-email-edit-button {
  gap: 5px;
  flex: 0 0 auto;
  padding: 7px 9px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 650;
}

.receipt-email-edit-panel,
.receipt-email-other-input {
  display: grid;
  gap: 7px;
  padding: 0 14px 14px 76px;
}

.receipt-email-edit-panel label {
  color: #475569;
  font-size: 12px;
  font-weight: 650;
}

.receipt-email-edit-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.receipt-email-edit-row input,
.receipt-email-other-input input {
  min-width: 0;
  flex: 1;
  border: 1px solid #cbd5e1;
  border-radius: 9px;
  background: #fff;
  padding: 9px 11px;
  color: #0f172a;
  font: inherit;
  outline: none;
}

.receipt-email-edit-row input:focus,
.receipt-email-other-input input:focus {
  border-color: #64748b;
  box-shadow: 0 0 0 3px rgba(100, 116, 139, .12);
}

.receipt-email-edit-panel small,
.receipt-email-other-input small {
  color: #64748b;
  font-size: 11px;
}

.receipt-email-field-error {
  color: #b42318 !important;
}

.receipt-email-choice--other {
  padding: 14px;
}

.receipt-email-state,
.receipt-email-empty,
.receipt-email-success {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 38px 22px;
  color: #64748b;
  text-align: center;
}

.receipt-email-success strong {
  color: #0f172a;
  font-size: 18px;
}

.receipt-email-success-icon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 50%;
  background: #ecfdf3;
  color: #15803d;
}

.receipt-email-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 12px;
}

.receipt-email-notice--error {
  border: 1px solid #fecaca;
  background: #fff7f7;
  color: #991b1b;
}

.receipt-email-notice button {
  border: 0;
  background: transparent;
  color: inherit;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
}

.receipt-email-footer {
  justify-content: flex-end;
  border-top: 1px solid #e2e8f0;
  margin-top: 14px;
}

.receipt-email-spin {
  animation: receipt-email-spin .8s linear infinite;
}

@keyframes receipt-email-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 640px) {
  .receipt-email-backdrop {
    align-items: end;
    padding: 0;
  }

  .receipt-email-modal {
    width: 100%;
    max-height: 92vh;
    border-radius: 18px 18px 0 0;
  }

  .receipt-email-edit-panel,
  .receipt-email-other-input {
    padding-left: 14px;
  }

  .receipt-email-edit-row {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
