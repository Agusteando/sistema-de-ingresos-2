<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="requestClose">
      <div class="modal-container large">
        <div class="modal-header modal-header-with-status relative">
          <h2 class="text-lg font-bold text-gray-800">Recibir Pago</h2>
          <ModalDraftStatus :restored="draftRestored" :status="draftSaveState" :dirty="hasUnsavedChanges" />
          <div ref="paymentOptionsRef" class="relative ml-auto">
            <button
              type="button"
              class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800"
              :aria-expanded="paymentOptionsOpen"
              aria-label="Más opciones del pago"
              title="Más opciones"
              @click="paymentOptionsOpen = !paymentOptionsOpen"
            >
              <LucideMoreHorizontal :size="18" />
            </button>
            <Transition name="payment-options">
              <div
                v-if="paymentOptionsOpen"
                class="absolute right-0 top-11 z-30 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl"
              >
                <button
                  type="button"
                  class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                  @click="openPaymentMethodEditor"
                >
                  <LucideWalletCards :size="16" class="text-brand-campus" />
                  Cambiar método de pago
                </button>
                <button
                  type="button"
                  class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                  @click="openPaymentDateEditor"
                >
                  <LucideCalendarDays :size="16" class="text-brand-campus" />
                  Cambiar fecha
                </button>
                <button
                  v-if="hasCustomPaymentDate"
                  type="button"
                  class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
                  @click="resetPaymentDate"
                >
                  <LucideRotateCcw :size="15" />
                  Usar fecha de hoy
                </button>
                <div class="my-1 border-t border-gray-100"></div>
                <button
                  type="button"
                  class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition"
                  :class="pagoRealizadoEnOtroPlantel ? 'bg-amber-50 text-amber-800' : 'text-gray-700 hover:bg-gray-50'"
                  @click="toggleOtherCampusPayment"
                >
                  <LucideBuilding2 :size="16" :class="pagoRealizadoEnOtroPlantel ? 'text-amber-700' : 'text-brand-campus'" />
                  {{ pagoRealizadoEnOtroPlantel ? 'Pago en otro plantel activo' : 'Pagado en otro plantel' }}
                </button>
              </div>
            </Transition>
          </div>
        </div>
        <div class="modal-content">
          <div
            v-if="paymentMethodEditorOpen"
            class="mb-4 rounded-xl border border-gray-200 bg-gray-50/70 p-4"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex min-w-0 items-start gap-3">
                <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-brand-campus shadow-sm ring-1 ring-gray-200">
                  <LucideWalletCards :size="18" />
                </span>
                <div class="min-w-0">
                  <p class="text-sm font-bold text-gray-800">Método de pago</p>
                  <p class="mt-0.5 text-xs leading-5 text-gray-500">Selecciona cómo se recibió este pago.</p>
                </div>
              </div>
              <button
                type="button"
                class="btn btn-ghost h-9 shrink-0 px-3 text-xs"
                @click="paymentMethodEditorOpen = false"
              >
                Listo
              </button>
            </div>

            <div class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <button
                v-for="option in paymentMethodOptions"
                :key="option.value"
                type="button"
                class="flex min-h-12 items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition"
                :class="formaDePago === option.value
                  ? 'border-brand-campus/30 bg-white text-brand-campus shadow-sm ring-1 ring-brand-campus/10'
                  : 'border-gray-200 bg-white/80 text-gray-700 hover:border-gray-300 hover:bg-white'"
                @click="selectPaymentMethod(option.value)"
              >
                <component :is="option.icon" :size="17" class="shrink-0" />
                <span class="text-sm font-semibold">{{ option.label }}</span>
                <LucideCheckCircle
                  v-if="formaDePago === option.value"
                  :size="16"
                  class="ml-auto shrink-0"
                />
              </button>
            </div>
          </div>

          <div
            v-if="paymentDateEditorOpen || hasCustomPaymentDate"
            class="mb-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div class="flex min-w-0 items-start gap-3">
                <span class="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-brand-campus shadow-sm ring-1 ring-blue-100">
                  <LucideCalendarDays :size="18" />
                </span>
                <div class="min-w-0">
                  <p class="text-sm font-bold text-gray-800">Fecha del pago</p>
                  <p class="mt-0.5 text-xs leading-5 text-gray-500">
                    La hora se registra automáticamente y no se puede editar.
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-2 sm:justify-end">
                <input
                  v-model="paymentDate"
                  type="date"
                  class="input-field h-10 min-w-[10.5rem] bg-white text-sm font-semibold"
                  aria-label="Fecha del pago"
                >
                <button
                  v-if="hasCustomPaymentDate"
                  type="button"
                  class="btn btn-ghost h-10 px-3 text-xs"
                  @click="resetPaymentDate"
                >
                  Hoy
                </button>
              </div>
            </div>
            <div
              v-if="hasCustomPaymentDate"
              class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-blue-100 pt-3 text-xs"
            >
              <span class="font-semibold text-gray-700">Visible en reportes: {{ formattedEffectivePaymentDate }}</span>
              <span class="text-gray-500">Registro original: hoy, con hora automática</span>
            </div>
          </div>

          <div
            v-if="pagoRealizadoEnOtroPlantel"
            class="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="flex min-w-0 items-start gap-3">
              <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-amber-700 shadow-sm ring-1 ring-amber-200">
                <LucideBuilding2 :size="18" />
              </span>
              <div class="min-w-0">
                <p class="text-sm font-bold text-gray-800">Pagado en otro plantel</p>
                <p class="mt-0.5 text-xs leading-5 text-gray-600">
                  El monto se aplicará al saldo sin registrarse como ingreso de este plantel. Conserva el método de pago seleccionado.
                </p>
              </div>
            </div>
            <button type="button" class="btn btn-ghost h-9 shrink-0 px-3 text-xs" @click="toggleOtherCampusPayment">
              Registrar como pago normal
            </button>
          </div>

          <div class="grid grid-cols-2 gap-4 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
            <div class="form-group mb-0">
              <label class="form-label">Método de pago</label>
              <div
                class="flex h-11 items-center gap-2 rounded-lg border bg-white px-3"
                :class="pagoRealizadoEnOtroPlantel ? 'border-amber-200' : 'border-gray-200'"
              >
                <component :is="selectedPaymentMethodOption.icon" :size="16" class="shrink-0 text-brand-campus" />
                <span class="min-w-0 flex-1 truncate text-sm font-bold text-gray-800">{{ selectedPaymentMethodOption.label }}</span>
                <span
                  v-if="pagoRealizadoEnOtroPlantel"
                  class="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-amber-800"
                >
                  Otro plantel
                </span>
                <button
                  type="button"
                  class="rounded-md px-2 py-1 text-xs font-bold text-brand-campus transition hover:bg-brand-campus/5"
                  @click="openPaymentMethodEditor"
                >
                  Cambiar
                </button>
              </div>
            </div>
            <div class="text-right flex flex-col justify-center">
              <span class="text-[0.7rem] font-bold text-gray-500 uppercase tracking-wide">{{ pagoRealizadoEnOtroPlantel ? 'Total a registrar' : 'Total a cobrar' }}</span>
              <span class="text-2xl font-bold text-brand-campus leading-none mt-1 font-mono">${{ totalCobrar.toFixed(2) }}</span>
            </div>
          </div>

          <p v-if="hasPendingFinalAmounts" class="mb-3 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Este debe ser el monto final de tu proyección, sin decimales.</p>

          <div class="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <table class="w-full">
              <thead class="bg-gray-50/80">
                <tr>
                  <th class="text-left">Concepto</th>
                  <th class="text-left">Ref/Mes</th>
                  <th class="text-right">Monto final</th>
                  <th class="text-right">Monto ($)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(debt, i) in processedDebts" :key="i" class="border-t border-gray-100 hover:bg-transparent">
                  <td class="font-semibold text-sm py-2 px-4 text-gray-800">{{ debt.conceptoNombre }}</td>
                  <td class="text-xs text-gray-500 py-2 px-4">{{ debt.mesLabel }}</td>
                  <td class="py-2 px-4 text-right">
                    <input
                      v-if="debt.montoFinalPendiente"
                      type="number"
                      class="input-field text-right font-mono font-semibold py-1 px-2 h-auto text-brand-campus"
                      v-model.number="debt.montoFinalInput"
                      min="0"
                      step="1"
                    >
                    <span v-else class="font-mono text-xs font-semibold text-gray-500">${{ Number(debt.subtotal || 0).toFixed(2) }}</span>
                  </td>
                  <td class="py-2 px-4 text-right">
                    <input type="number" class="input-field text-right font-mono font-semibold py-1 px-2 h-auto text-brand-campus" v-model.number="debt.montoPagado" :max="effectiveSaldoFinal(debt)" min="0" step="0.01">
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <ModalDiscardDialog
          :show="showDiscardConfirmation"
          @continue="continueEditing"
          @discard="discardAndClose"
        />
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="requestClose" :disabled="processing">Cancelar</button>
          <button v-if="!pagoRealizadoEnOtroPlantel" class="btn btn-outline" type="button" @click="previewReceipt" :disabled="processing || totalCobrar <= 0">
            <LucideEye :size="16"/> Previa
          </button>
          <button class="btn btn-primary" @click="submit" :disabled="processing || totalCobrar <= 0">
            <LucideLoader2 v-if="processing" class="animate-spin" :size="16"/>
            <LucideCheckCircle v-else :size="16"/>
            {{ processing ? 'Registrando...' : (pagoRealizadoEnOtroPlantel ? 'Registrar pago' : 'Registrar Pago') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount, markRaw } from 'vue'
import { LucideBanknote, LucideBuilding2, LucideCalendarDays, LucideCheckCircle, LucideCreditCard, LucideEye, LucideLandmark, LucideLoader2, LucideMoreHorizontal, LucideReceiptText, LucideRotateCcw, LucideWalletCards } from 'lucide-vue-next'
import { useState } from '#app'
import { useScrollLock } from '~/composables/useScrollLock'
import { useOptimisticSync } from '~/composables/useOptimisticSync'
import { useModalDraftPersistence } from '~/composables/useModalDraftPersistence'
import { normalizeCicloKey } from '~/shared/utils/ciclo'
import { studentNivelLabel } from '~/shared/utils/studentPresentation'

const props = defineProps({ debts: Array, student: Object })
const emit = defineEmits(['close', 'success'])
const state = useState('globalState')
const { executeOptimistic } = useOptimisticSync()

useScrollLock()

const formaDePago = ref('Efectivo')
const processing = ref(false)
const processedDebts = ref([])
const paymentOptionsRef = ref(null)
const paymentOptionsOpen = ref(false)
const paymentDateEditorOpen = ref(false)
const paymentMethodEditorOpen = ref(false)
const pagoRealizadoEnOtroPlantel = ref(false)

const localDateKey = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const paymentDate = ref(localDateKey())
const hasCustomPaymentDate = computed(() => paymentDate.value !== localDateKey())
const formattedEffectivePaymentDate = computed(() => {
  const [year, month, day] = String(paymentDate.value || '').split('-').map(Number)
  if (!year || !month || !day) return 'Fecha no válida'
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date(year, month - 1, day))
})

const paymentMethodOptions = [
  { value: 'Efectivo', label: 'Efectivo', icon: markRaw(LucideBanknote) },
  { value: 'Tarjeta de débito', label: 'Tarjeta de débito', icon: markRaw(LucideCreditCard) },
  { value: 'Tarjeta de crédito', label: 'Tarjeta de crédito', icon: markRaw(LucideCreditCard) },
  { value: 'Transferencia', label: 'Transferencia', icon: markRaw(LucideLandmark) },
  { value: 'Cheque', label: 'Cheque', icon: markRaw(LucideReceiptText) }
]

const selectedPaymentMethodOption = computed(() => (
  paymentMethodOptions.find(option => option.value === formaDePago.value) || paymentMethodOptions[0]
))

const openPaymentMethodEditor = () => {
  paymentOptionsOpen.value = false
  paymentDateEditorOpen.value = false
  paymentMethodEditorOpen.value = true
}

const selectPaymentMethod = (value) => {
  if (!paymentMethodOptions.some(option => option.value === value)) return
  formaDePago.value = value
}

const openPaymentDateEditor = () => {
  paymentOptionsOpen.value = false
  paymentMethodEditorOpen.value = false
  paymentDateEditorOpen.value = true
}

const resetPaymentDate = () => {
  paymentDate.value = localDateKey()
  paymentOptionsOpen.value = false
}

const toggleOtherCampusPayment = () => {
  pagoRealizadoEnOtroPlantel.value = !pagoRealizadoEnOtroPlantel.value
  paymentOptionsOpen.value = false
}

const closePaymentOptionsOnOutsideClick = (event) => {
  if (!paymentOptionsOpen.value) return
  const target = event.target
  if (paymentOptionsRef.value && target instanceof Node && !paymentOptionsRef.value.contains(target)) {
    paymentOptionsOpen.value = false
  }
}

const effectivePaymentDateIso = () => {
  if (!hasCustomPaymentDate.value) return new Date().toISOString()
  const [year, month, day] = String(paymentDate.value || '').split('-').map(Number)
  const now = new Date()
  if (!year || !month || !day) return now.toISOString()
  return new Date(
    year,
    month - 1,
    day,
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  ).toISOString()
}

const paymentDebtKey = (debt) => `${debt?.documento || ''}-${debt?.mes || ''}-${debt?.conceptoId || debt?.conceptoNombre || ''}`

const buildProcessedDebts = () => (Array.isArray(props.debts) ? props.debts : []).map(d => {
  const final = d.saldo
  const resuelto = d.resuelto ?? d.pagos
  return {
    ...d,
    saldoFinal: final,
    montoPagado: final,
    pagosPrevios: resuelto,
    saldoAntes: d.subtotal - resuelto,
    montoFinalInput: Math.round(Number(d.subtotal || d.costoOriginal || d.saldo || 0))
  }
})

watch(() => props.debts, () => {
  processedDebts.value = buildProcessedDebts()
}, { immediate: true })

const paymentDraftCicloScope = normalizeCicloKey(state.value.ciclo)
const paymentDraftKey = computed(() => {
  const selectedDebtScope = (Array.isArray(props.debts) ? props.debts : [])
    .map(paymentDebtKey)
    .sort()
    .join('|') || 'none'
  return `payment:${props.student?.matricula || 'unknown'}:${paymentDraftCicloScope}:${selectedDebtScope}`
})

const readPaymentDraft = () => ({
  formaDePago: formaDePago.value,
  paymentDate: paymentDate.value,
  paymentDateEditorOpen: paymentDateEditorOpen.value,
  paymentMethodEditorOpen: paymentMethodEditorOpen.value,
  pagoRealizadoEnOtroPlantel: pagoRealizadoEnOtroPlantel.value,
  debts: processedDebts.value.map(debt => ({
    key: paymentDebtKey(debt),
    montoPagado: debt.montoPagado,
    montoFinalInput: debt.montoFinalInput
  }))
})

const writePaymentDraft = (draft) => {
  if (!draft || typeof draft !== 'object') return

  if (draft.formaDePago) formaDePago.value = String(draft.formaDePago)
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(draft.paymentDate || ''))) {
    paymentDate.value = String(draft.paymentDate)
  }
  paymentDateEditorOpen.value = Boolean(draft.paymentDateEditorOpen || paymentDate.value !== localDateKey())
  paymentMethodEditorOpen.value = Boolean(draft.paymentMethodEditorOpen)
  pagoRealizadoEnOtroPlantel.value = Boolean(draft.pagoRealizadoEnOtroPlantel)
  const restoredDebts = new Map((Array.isArray(draft.debts) ? draft.debts : []).map(debt => [debt.key, debt]))

  processedDebts.value = processedDebts.value.map((debt) => {
    const restored = restoredDebts.get(paymentDebtKey(debt))
    if (!restored) return debt

    const montoPagado = Number(restored.montoPagado)
    const montoFinalInput = Number(restored.montoFinalInput)
    return {
      ...debt,
      montoPagado: Number.isFinite(montoPagado) ? montoPagado : debt.montoPagado,
      montoFinalInput: Number.isFinite(montoFinalInput) ? montoFinalInput : debt.montoFinalInput
    }
  })
}

const paymentDraftHasContent = (draft) => {
  if (!draft || typeof draft !== 'object') return false
  if (String(draft.formaDePago || 'Efectivo') !== 'Efectivo') return true
  if (String(draft.paymentDate || localDateKey()) !== localDateKey()) return true
  if (Boolean(draft.pagoRealizadoEnOtroPlantel)) return true
  return Array.isArray(draft.debts) && draft.debts.length > 0
}

const {
  draftRestored,
  draftSaveState,
  hasUnsavedChanges,
  showDiscardConfirmation,
  initializeDraft,
  markSaved,
  requestClose,
  continueEditing,
  discardAndClose
} = useModalDraftPersistence({
  key: paymentDraftKey,
  read: readPaymentDraft,
  write: writePaymentDraft,
  onClose: () => emit('close'),
  canRequestClose: () => !processing.value,
  isDraftMeaningful: paymentDraftHasContent
})

onMounted(() => {
  initializeDraft()
  document.addEventListener('pointerdown', closePaymentOptionsOnOutsideClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closePaymentOptionsOnOutsideClick)
})

const hasPendingFinalAmounts = computed(() => processedDebts.value.some(debt => debt.montoFinalPendiente))
const effectiveSubtotal = (debt) => debt.montoFinalPendiente ? Number(debt.montoFinalInput || 0) : Number(debt.subtotal || 0)
const effectiveSaldoFinal = (debt) => Math.max(0, effectiveSubtotal(debt) - Number(debt.pagosPrevios || 0))
const totalCobrar = computed(() => processedDebts.value.reduce((a, b) => a + (b.montoPagado || 0), 0))

const paymentRows = () => processedDebts.value.filter(d => Number(d.montoPagado || 0) > 0).map((d) => {
  const subtotal = effectiveSubtotal(d)
  const saldoAntes = effectiveSaldoFinal(d)
  return {
    ...d,
    subtotal,
    saldoFinal: saldoAntes,
    saldoAntes,
    montoFinal: d.montoFinalPendiente ? subtotal : d.montoFinal
  }
})

const validateFinalAmounts = () => {
  let requiresConfirmation = false
  for (const debt of processedDebts.value) {
    if (!debt.montoFinalPendiente || Number(debt.montoPagado || 0) <= 0) continue
    requiresConfirmation = true
    const monto = Number(debt.montoFinalInput)
    if (!Number.isFinite(monto) || monto < 0 || Math.floor(monto) !== monto) {
      window.alert('Este debe ser el monto final de tu proyección, sin decimales.')
      return false
    }
  }
  if (requiresConfirmation && !window.confirm('Confirmar monto final sin decimales antes de registrar.')) return false
  return true
}

const previewReceipt = () => {
  if (pagoRealizadoEnOtroPlantel.value) return
  if (!validateFinalAmounts()) return
  const previewData = {
    folios: 'PREVIO',
    fecha: effectivePaymentDateIso(),
    nombreCompleto: props.student.nombreCompleto,
    matricula: props.student.matricula,
    nivel: studentNivelLabel(props.student),
    grado: props.student.grado,
    grupo: props.student.grupo,
    ciclo: normalizeCicloKey(state.value.ciclo),
    instituto: props.student.plantel === 'PT' || props.student.plantel === 'PM' || props.student.plantel === 'SM' ? 1 : 0,
    items: paymentRows().map((d, i) => ({
      folio: 'PREV-' + (i+1),
      folio_plantel: 'PREV-' + (i+1),
      documento: d.documento,
      formaDePago: formaDePago.value,
      monto: d.montoPagado,
      saldoAntes: d.saldoAntes,
      pagos: d.pagosPrevios,
      pagosDespues: d.pagosPrevios + d.montoPagado,
      saldoDespues: Math.max(0, d.saldoAntes - d.montoPagado),
      importeTotal: d.subtotal,
      mes: d.mes,
      mesReal: d.mesLabel,
      conceptoNombre: d.conceptoNombre,
      fecha: effectivePaymentDateIso()
    }))
  }
  sessionStorage.setItem('receipt_preview', JSON.stringify(previewData))
  window.open('/print/recibo?preview=true', '_blank', 'width=850,height=800')
}

const submit = async () => {
  if (!validateFinalAmounts()) return
  const payload = {
    matricula: props.student.matricula,
    formaDePago: formaDePago.value,
    ciclo: normalizeCicloKey(state.value.ciclo),
    lateFeeActive: state.value.lateFeeActive,
    fechaPago: hasCustomPaymentDate.value ? paymentDate.value : null,
    pagoRealizadoEnOtroPlantel: pagoRealizadoEnOtroPlantel.value,
    pagos: paymentRows()
  }
  processing.value = true
  
  await executeOptimistic(
    () => $fetch('/api/payments/pay', { method: 'POST', body: payload }),
    () => emit('success'),
    () => emit('success'),
    {
      pending: pagoRealizadoEnOtroPlantel.value ? 'Registrando pago en otro plantel...' : 'Registrando pago...',
      success: pagoRealizadoEnOtroPlantel.value ? 'Pago en otro plantel registrado' : 'Pago exitoso',
      error: 'Error al registrar'
    }
  ).then((res) => {
    markSaved()
    if (!pagoRealizadoEnOtroPlantel.value && res && res.folios) {
      window.open(`/print/recibo?folios=${res.folios.join(',')}`, '_blank', 'width=850,height=800')
    }
  }).catch(() => {}).finally(() => {
    processing.value = false
  })
}
</script>

<style scoped>
.payment-options-enter-active,
.payment-options-leave-active {
  transition: opacity 140ms ease, transform 140ms ease;
}

.payment-options-enter-from,
.payment-options-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
