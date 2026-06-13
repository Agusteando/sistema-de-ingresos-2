<template>
  <Teleport to="body">
    <div class="modal-overlay payment-cancel-overlay" @click.self="requestClose">
      <section class="modal-container payment-cancel-modal" role="dialog" aria-modal="true" aria-labelledby="payment-cancel-title">
        <header class="payment-cancel-modal__header">
          <div>
            <span>Acción irreversible</span>
            <h2 id="payment-cancel-title">Cancelar pago</h2>
          </div>
          <button class="plain-icon-button" type="button" aria-label="Cerrar" title="Cerrar" @click="requestClose">
            <LucideX :size="19" />
          </button>
        </header>

        <div class="payment-cancel-modal__content">
          <div class="payment-cancel-summary">
            <div class="payment-cancel-summary__icon" aria-hidden="true">
              <LucideReceiptText :size="20" />
            </div>
            <div>
              <strong>Folio {{ payment?.folio_plantel || payment?.folio }}</strong>
              <span>{{ payment?.conceptoNombre || debt?.conceptoNombre || 'Pago registrado' }}</span>
              <small>{{ debt?.mesLabel || payment?.mesReal || payment?.mes || 'Cargo' }} · {{ payment?.formaDePago || 'Sin método' }}</small>
            </div>
            <b>${{ money(payment?.monto) }}</b>
          </div>

          <div class="payment-cancel-warning">
            <LucideAlertTriangle :size="17" />
            <p>El importe dejará de aplicarse al saldo. El pago permanecerá en el historial como cancelado.</p>
          </div>

          <label class="payment-cancel-field">
            <span>Motivo de cancelación</span>
            <textarea
              v-model.trim="reason"
              rows="3"
              maxlength="240"
              placeholder="Describe brevemente por qué se cancela este pago"
              :disabled="submitting"
            ></textarea>
            <small>{{ reason.length }}/240</small>
          </label>

          <div v-if="codeRequested" class="payment-cancel-code">
            <div>
              <span>Código de autorización</span>
              <small>Ingresa el código de 4 dígitos enviado a soporte.</small>
            </div>
            <input
              ref="codeInput"
              v-model="enteredCode"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="4"
              pattern="[0-9]*"
              placeholder="0000"
              :disabled="submitting"
              @input="enteredCode = enteredCode.replace(/\D/g, '').slice(0, 4)"
            />
          </div>

          <p v-if="errorMessage" class="payment-cancel-error">{{ errorMessage }}</p>
        </div>

        <footer class="payment-cancel-modal__footer">
          <button class="btn btn-ghost" type="button" :disabled="submitting" @click="requestClose">Volver</button>
          <button
            v-if="!codeRequested"
            class="btn btn-primary"
            type="button"
            :disabled="requestingCode || reason.length < 4"
            @click="requestAuthorizationCode"
          >
            <LucideLoader2 v-if="requestingCode" class="animate-spin" :size="15" />
            {{ requestingCode ? 'Solicitando...' : 'Solicitar código' }}
          </button>
          <button
            v-else
            class="btn payment-cancel-confirm"
            type="button"
            :disabled="submitting || enteredCode.length !== 4"
            @click="confirmCancellation"
          >
            <LucideLoader2 v-if="submitting" class="animate-spin" :size="15" />
            {{ submitting ? 'Cancelando...' : 'Cancelar pago' }}
          </button>
        </footer>
      </section>

      <ModalDiscardDialog
        :show="showDiscardConfirmation"
        @continue="showDiscardConfirmation = false"
        @discard="discardAndClose"
      />
    </div>
  </Teleport>
</template>

<script setup>
import { nextTick, ref } from 'vue'
import {
  LucideAlertTriangle,
  LucideLoader2,
  LucideReceiptText,
  LucideX,
} from 'lucide-vue-next'
import ModalDiscardDialog from '~/components/ModalDiscardDialog.vue'
import { useModalEscape } from '~/composables/useModalEscape'
import { useScrollLock } from '~/composables/useScrollLock'
import { useToast } from '~/composables/useToast'

const props = defineProps({
  payment: { type: Object, required: true },
  debt: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['close', 'success'])
const { show } = useToast()

useScrollLock()

const reason = ref('')
const enteredCode = ref('')
const authorizationCode = ref('')
const codeRequested = ref(false)
const requestingCode = ref(false)
const submitting = ref(false)
const errorMessage = ref('')
const showDiscardConfirmation = ref(false)
const codeInput = ref(null)

const hasDraft = () => Boolean(reason.value || enteredCode.value || codeRequested.value)
const requestClose = () => {
  if (submitting.value || requestingCode.value) return
  if (hasDraft()) {
    showDiscardConfirmation.value = true
    return
  }
  emit('close')
}

useModalEscape(requestClose, { enabled: () => !showDiscardConfirmation.value })

const discardAndClose = () => {
  showDiscardConfirmation.value = false
  emit('close')
}

const requestAuthorizationCode = async () => {
  if (reason.value.length < 4 || requestingCode.value) return
  requestingCode.value = true
  errorMessage.value = ''
  const secret = String(Math.floor(Math.random() * 9000) + 1000)
  const userName = useCookie('auth_name').value || 'Operador'
  const concept = props.payment?.conceptoNombre || props.debt?.conceptoNombre || 'Pago'
  const message = `*${userName}* solicita cancelar el pago _${concept}_ por _$${money(props.payment?.monto)}_ con motivo de _${reason.value}_\nCódigo para cancelar: *${secret}*`

  try {
    const response = await fetch('https://tgbot.casitaapps.com/sendMessages', {
      method: 'POST',
      body: JSON.stringify({ chatId: ['-4885991203'], message }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (!response.ok) throw new Error('No se pudo enviar el código')
    authorizationCode.value = secret
    codeRequested.value = true
    await nextTick()
    codeInput.value?.focus?.()
  } catch (error) {
    errorMessage.value = 'No se pudo solicitar el código. Intenta de nuevo o contacta a soporte.'
  } finally {
    requestingCode.value = false
  }
}

const confirmCancellation = async () => {
  if (submitting.value) return
  if (enteredCode.value !== authorizationCode.value) {
    errorMessage.value = 'El código no coincide. Revisa e intenta nuevamente.'
    return
  }

  submitting.value = true
  errorMessage.value = ''
  const userName = useCookie('auth_name').value || 'Operador'

  try {
    await $fetch('/api/payments/cancel', {
      method: 'POST',
      body: {
        folio: props.payment?.folio,
        motivo: reason.value,
        force_direct: true,
      },
    })

    fetch('https://tgbot.casitaapps.com/sendMessages', {
      method: 'POST',
      body: JSON.stringify({
        chatId: ['-4885991203'],
        message: `La cancelación solicitada por *${userName}* para el folio *${props.payment?.folio}* fue procesada correctamente.`,
      }),
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {})

    show('Pago cancelado', 'success')
    emit('success', props.payment)
  } catch (error) {
    errorMessage.value = error?.data?.message || error?.message || 'No se pudo cancelar el pago.'
  } finally {
    submitting.value = false
  }
}

const money = (value) => Number(value || 0).toFixed(2)
</script>

<style scoped>
.payment-cancel-overlay {
  padding: 18px;
  overflow-y: auto;
}

.payment-cancel-modal {
  width: min(520px, 100%);
  overflow: hidden;
}

.payment-cancel-modal__header,
.payment-cancel-modal__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 17px 19px;
  background: #fff;
}

.payment-cancel-modal__header {
  border-bottom: 1px solid #edf1f5;
}

.payment-cancel-modal__footer {
  justify-content: flex-end;
  border-top: 1px solid #edf1f5;
}

.payment-cancel-modal__header span {
  display: block;
  margin-bottom: 3px;
  color: #c14b48;
  font-size: 9px;
  font-weight: 850;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.payment-cancel-modal__header h2 {
  margin: 0;
  color: #1c2940;
  font-size: 19px;
}

.payment-cancel-modal__content {
  display: grid;
  gap: 14px;
  padding: 18px 19px 20px;
  background: #fbfcfe;
}

.payment-cancel-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 13px;
  background: #fff;
}

.payment-cancel-summary__icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 11px;
  background: #f1f6f4;
  color: #39745d;
}

.payment-cancel-summary > div:nth-child(2) {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.payment-cancel-summary strong,
.payment-cancel-summary span,
.payment-cancel-summary small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.payment-cancel-summary strong {
  color: #1d2b42;
  font-size: 12px;
}

.payment-cancel-summary span {
  color: #59677d;
  font-size: 10px;
}

.payment-cancel-summary small {
  color: #8390a1;
  font-size: 9px;
}

.payment-cancel-summary > b {
  color: #2c6f4e;
  font-size: 15px;
  white-space: nowrap;
}

.payment-cancel-warning {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 11px 12px;
  border: 1px solid #f0d7b7;
  border-radius: 11px;
  background: #fff9ee;
  color: #8d611f;
}

.payment-cancel-warning p {
  margin: 0;
  font-size: 10px;
  line-height: 1.5;
}

.payment-cancel-field {
  display: grid;
  gap: 6px;
}

.payment-cancel-field > span,
.payment-cancel-code span {
  color: #34435b;
  font-size: 10px;
  font-weight: 800;
}

.payment-cancel-field textarea,
.payment-cancel-code input {
  width: 100%;
  border: 1px solid #dbe3ec;
  border-radius: 10px;
  background: #fff;
  color: #1e2b40;
  outline: none;
}

.payment-cancel-field textarea {
  min-height: 82px;
  padding: 10px 11px;
  resize: vertical;
  font: inherit;
  font-size: 11px;
}

.payment-cancel-field textarea:focus,
.payment-cancel-code input:focus {
  border-color: #72a991;
  box-shadow: 0 0 0 3px rgba(64, 137, 103, .1);
}

.payment-cancel-field small {
  justify-self: end;
  color: #929cab;
  font-size: 9px;
}

.payment-cancel-code {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 116px;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid #dce7e1;
  border-radius: 11px;
  background: #f6faf8;
}

.payment-cancel-code > div {
  display: grid;
  gap: 3px;
}

.payment-cancel-code small {
  color: #718074;
  font-size: 9px;
}

.payment-cancel-code input {
  height: 42px;
  padding: 0 10px;
  text-align: center;
  font-size: 19px;
  font-weight: 850;
  letter-spacing: .18em;
}

.payment-cancel-error {
  margin: 0;
  color: #b53e3d;
  font-size: 10px;
  font-weight: 700;
}

.payment-cancel-confirm {
  border-color: #bd4542;
  background: #bd4542;
  color: #fff;
}

.payment-cancel-confirm:hover:not(:disabled) {
  background: #a93b39;
}

@media (max-width: 520px) {
  .payment-cancel-overlay {
    padding: 8px;
  }

  .payment-cancel-summary {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .payment-cancel-summary > b {
    grid-column: 2;
  }

  .payment-cancel-code {
    grid-template-columns: 1fr;
  }
}
</style>
