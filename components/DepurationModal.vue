<template>
  <Teleport to="body">
    <div class="depuration-backdrop" @click.self="close">
      <section class="depuration-dialog" role="dialog" aria-modal="true" aria-labelledby="depuration-title">
        <header class="depuration-header">
          <div class="depuration-heading">
            <span class="depuration-symbol" aria-hidden="true"><LucideShieldCheck :size="22" /></span>
            <div><small>Estado de Cuenta · Doc. {{ debt.documento }}</small><h2 id="depuration-title">Depuración</h2></div>
          </div>
          <button type="button" class="depuration-close" aria-label="Cerrar" :disabled="busy" @click="close"><LucideX :size="19" /></button>
        </header>

        <div class="depuration-content">
          <div class="depuration-identification">
            <strong>{{ debt.conceptoNombre }}</strong>
            <span>{{ debt.mesLabel }} · {{ student.matricula }}</span>
          </div>

          <div class="depuration-amounts">
            <div><span>Importe</span><strong>{{ money(debt.subtotal) }}</strong></div>
            <div><span>Pagado</span><strong>{{ money(debt.pagos) }}</strong></div>
            <div class="depuration-highlight"><span>Saldo a depurar</span><strong>{{ money(debt.saldo) }}</strong></div>
          </div>

          <form v-if="stage === 'reason'" id="depuration-form" @submit.prevent="submitRequest">
            <label class="depuration-label" for="depuration-motivo">Motivo</label>
            <textarea id="depuration-motivo" v-model="motivo" maxlength="400" rows="3"
              :disabled="busy" placeholder="Motivo de la depuración" required></textarea>
            <span class="depuration-limit">{{ motivo.trim().length }}/400</span>
          </form>

          <form v-else id="depuration-form" @submit.prevent="submitConfirm">
            <div class="depuration-authorized"><LucideSend :size="15" /> Código enviado a Telegram · 10 min</div>
            <label class="depuration-label" for="depuration-code">Código de autorización</label>
            <input id="depuration-code" ref="codeField" v-model="codigo" type="text"
              inputmode="numeric" autocomplete="one-time-code" maxlength="5"
              pattern="[0-9]{5}" placeholder="00000" :disabled="busy"
              @input="codigo = codigo.replace(/\D/g, '').slice(0, 5)" />
            <button type="button" class="depuration-restart" :disabled="busy" @click="restart">Solicitar otro código</button>
          </form>

          <div v-if="error" class="depuration-error" role="alert"><LucideAlertCircle :size="16" /> {{ error }}</div>
        </div>

        <footer class="depuration-footer">
          <button type="button" class="depuration-secondary" :disabled="busy" @click="close">Cancelar</button>
          <button v-if="stage === 'reason'" type="submit" form="depuration-form" class="depuration-primary"
            :disabled="busy || motivo.trim().length < 8">
            <LucideLoader2 v-if="busy" :size="15" class="depuration-spin" />
            {{ busy ? 'Enviando...' : 'Solicitar código' }}
          </button>
          <button v-else type="submit" form="depuration-form" class="depuration-primary"
            :disabled="busy || codigo.length !== 5">
            <LucideLoader2 v-if="busy" :size="15" class="depuration-spin" />
            {{ busy ? 'Aplicando...' : 'Confirmar depuración' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { LucideAlertCircle, LucideLoader2, LucideSend, LucideShieldCheck, LucideX } from 'lucide-vue-next'
import { useModalEscape } from '~/composables/useModalEscape'
import { useScrollLock } from '~/composables/useScrollLock'

const props = defineProps<{
  student: { matricula: string }
  debt: { documento: number; mes: string; mesLabel: string; conceptoNombre: string; subtotal: number; pagos: number; saldo: number }
  ciclo: string
}>()
const emit = defineEmits<{ close: []; success: [result: any] }>()
const motivo = ref('')
const codigo = ref('')
const stage = ref<'reason' | 'code'>('reason')
const requestId = ref('')
const busy = ref(false)
const error = ref('')
const codeField = ref<HTMLInputElement | null>(null)
const close = () => { if (!busy.value) emit('close') }
const restart = () => { stage.value = 'reason'; requestId.value = ''; codigo.value = ''; error.value = '' }
const money = (value: number) => '$' + Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const errorText = (e: any) => e?.data?.message || e?.data?.data?.message || e?.message || 'No se pudo realizar la depuración.'
useModalEscape(close)
useScrollLock()

const submitRequest = async () => {
  if (busy.value || motivo.value.trim().length < 8) return
  busy.value = true
  error.value = ''
  try {
    const result: any = await $fetch('/api/payments/audit', {
      method: 'POST',
      body: { action: 'request', matricula: props.student.matricula, documento: props.debt.documento,
        mes: props.debt.mes, ciclo: props.ciclo, motivo: motivo.value.trim() },
    })
    requestId.value = result.requestId
    stage.value = 'code'
    await nextTick()
    codeField.value?.focus()
  } catch (e) {
    error.value = errorText(e)
  } finally { busy.value = false }
}
const submitConfirm = async () => {
  if (busy.value || codigo.value.length !== 5 || !requestId.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await $fetch('/api/payments/audit', {
      method: 'POST', body: { action: 'confirm', requestId: requestId.value, code: codigo.value },
    })
    emit('success', result)
  } catch (e) {
    error.value = errorText(e)
    const message = error.value.toLowerCase()
    if (message.includes('expir') || message.includes('bloquead') || message.includes('cambi') || message.includes('vigente')) {
      restart()
      error.value = errorText(e)
    }
  } finally { busy.value = false }
}
</script>

<style scoped>
.depuration-backdrop { position: fixed; z-index: 11000; inset: 0; display: grid; place-items: center; padding: 16px; background: rgba(16, 30, 53, .49); backdrop-filter: blur(5px); }
.depuration-dialog { width: min(100%, 465px); max-height: min(90dvh, 680px); display: flex; flex-direction: column; overflow: hidden; border: 1px solid #c8dbee; border-radius: 18px; background: #fff; box-shadow: 0 28px 90px rgba(10, 30, 50, .27); }
.depuration-header { display: flex; align-items: center; justify-content: space-between; padding: 19px 22px 17px; border-bottom: 1px solid #e7edf4; }
.depuration-heading { display: flex; align-items: center; gap: 12px; }
.depuration-symbol { display: grid; width: 43px; height: 43px; place-items: center; color: #185cb6; border-radius: 12px; background: #e9f2ff; }
.depuration-heading small { display: block; color: #718398; font-size: 11px; font-weight: 600; }
.depuration-heading h2 { margin: 2px 0 0; color: #143a70; font-size: 21px; line-height: 1.1; font-weight: 700; }
.depuration-close { display: grid; width: 34px; height: 34px; place-items: center; border: 0; border-radius: 9px; background: transparent; color: #65758b; cursor: pointer; }
.depuration-close:hover { background: #f0f4fa; }
.depuration-content { overflow-y: auto; padding: 20px 22px 12px; }
.depuration-identification { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; }
.depuration-identification strong { font-size: 15px; line-height: 1.3; color: #1d334b; }
.depuration-identification span { color: #738399; font-size: 12px; }
.depuration-amounts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 18px; }
.depuration-amounts > div { display: flex; flex-direction: column; gap: 5px; padding: 11px 12px; border: 1px solid #e3eaf2; border-radius: 11px; }
.depuration-amounts span { color: #65788b; font-size: 11px; }
.depuration-amounts strong { color: #2b4159; font-size: 17px; font-weight: 650; font-variant-numeric: tabular-nums; }
.depuration-amounts .depuration-highlight { grid-column: 1 / -1; display: flex; flex-direction: row; align-items: center; justify-content: space-between; border-color: #b6d5f6; background: #eef6ff; }
.depuration-highlight span, .depuration-highlight strong { color: #1659a8; }
.depuration-highlight strong { font-size: 21px; }
.depuration-label { display: block; margin-bottom: 8px; color: #304961; font-size: 12px; font-weight: 650; }
.depuration-content textarea, .depuration-content input { width: 100%; padding: 11px 12px; border: 1px solid #bfcddd; border-radius: 10px; outline: 0; background: #fff; color: #193c61; font-family: inherit; font-size: 13px; }
.depuration-content textarea:focus, .depuration-content input:focus { border-color: #387ac7; box-shadow: 0 0 0 3px #dcecff; }
.depuration-content textarea { min-height: 90px; resize: vertical; }
.depuration-content input { width: min(100%, 210px); font-size: 24px; text-align: center; letter-spacing: .27em; font-variant-numeric: tabular-nums; }
.depuration-limit { display: block; text-align: right; color: #8191a0; font-size: 10px; }
.depuration-authorized { display: flex; align-items: center; gap: 7px; margin: 0 0 15px; color: #145aa2; font-size: 12px; font-weight: 550; }
.depuration-restart { display: block; margin-top: 12px; padding: 0; border: 0; background: transparent; color: #1766b8; cursor: pointer; font-size: 12px; }
.depuration-error { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding: 10px; border-radius: 8px; background: #fff0ed; color: #a33f39; font-size: 12px; }
.depuration-footer { display: flex; justify-content: flex-end; gap: 9px; padding: 14px 22px 18px; border-top: 1px solid #e7edf4; }
.depuration-secondary, .depuration-primary { min-height: 38px; padding: 8px 15px; border-radius: 9px; font-family: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
.depuration-secondary { color: #516378; border: 1px solid #dce3eb; background: #fff; }
.depuration-primary { display: inline-flex; align-items: center; gap: 7px; color: #fff; border: 1px solid #2166b6; background: #2166b6; }
.depuration-primary:hover:not(:disabled) { background: #145398; }
.depuration-primary:disabled, .depuration-secondary:disabled { opacity: .5; cursor: not-allowed; }
.depuration-spin { animation: depuration-spin 1s linear infinite; }
@keyframes depuration-spin { to { transform: rotate(360deg); } }
@media (max-width: 480px) { .depuration-backdrop { align-items: end; padding: 0; } .depuration-dialog { width: 100%; max-height: 92dvh; border-radius: 18px 18px 0 0; } .depuration-header { padding: 17px; } .depuration-content { padding: 17px; } .depuration-footer { padding: 13px 17px max(15px, env(safe-area-inset-bottom)); } }
</style>
