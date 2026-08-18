<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="requestClose">
      <div class="modal-container payment-modal">
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
                <div class="my-1 border-t border-gray-100"></div>
                <button
                  type="button"
                  class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition"
                  :class="pagoRealizadoEnOtroPlantel
                    ? 'bg-amber-50 text-amber-800'
                    : 'bg-gray-50/80 text-gray-400 hover:bg-gray-100 hover:text-gray-600'"
                  :aria-label="pagoRealizadoEnOtroPlantel ? 'Pago en otro plantel activo' : 'Pagado en otro plantel. No disponible. Requiere contraseña.'"
                  @click="openOtherCampusAuthorization"
                >
                  <LucideBuilding2 :size="16" :class="pagoRealizadoEnOtroPlantel ? 'text-amber-700' : 'text-gray-400'" />
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-semibold">{{ pagoRealizadoEnOtroPlantel ? 'Pago en otro plantel activo' : 'Pagado en otro plantel' }}</span>
                    <span v-if="!pagoRealizadoEnOtroPlantel" class="mt-0.5 block text-[10px] font-bold uppercase tracking-wide text-gray-400">Requiere contraseña</span>
                  </span>
                  <span
                    v-if="!pagoRealizadoEnOtroPlantel"
                    class="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-gray-400"
                  >
                    No disponible
                  </span>
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
            v-if="paymentDateEditorOpen"
            class="mb-4 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3"
          >
            <LucideCalendarDays :size="17" class="shrink-0 text-brand-campus" />
            <input
              v-model="paymentDate"
              type="date"
              class="input-field h-10 min-w-[10.5rem] bg-white text-sm font-semibold"
              aria-label="Fecha del pago"
              @change="paymentDateEditorOpen = false"
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

          <div
            v-if="otherCampusAuthorizationOpen && !pagoRealizadoEnOtroPlantel"
            class="mb-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex min-w-0 items-center gap-3">
                <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-500 shadow-sm ring-1 ring-gray-200">
                  <LucideLock :size="17" />
                </span>
                <div class="min-w-0">
                  <p class="text-sm font-bold text-gray-700">Pagado en otro plantel</p>
                  <p class="mt-0.5 text-[10px] font-black uppercase tracking-wide text-gray-400">No disponible · Requiere contraseña</p>
                </div>
              </div>

              <div class="flex items-center gap-2 sm:justify-end">
                <button
                  v-if="!otherCampusCodeRequested"
                  type="button"
                  class="btn btn-outline h-10 px-3 text-xs"
                  :disabled="otherCampusRequestingCode"
                  @click="requestOtherCampusAuthorizationCode"
                >
                  <LucideLoader2 v-if="otherCampusRequestingCode" class="animate-spin" :size="14" />
                  {{ otherCampusRequestingCode ? 'Solicitando...' : 'Solicitar código' }}
                </button>
                <template v-else>
                  <input
                    ref="otherCampusCodeInput"
                    v-model="otherCampusEnteredCode"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    maxlength="4"
                    pattern="[0-9]*"
                    placeholder="0000"
                    aria-label="Código de autorización"
                    class="h-10 w-24 rounded-lg border border-gray-200 bg-white px-2 text-center text-base font-black tracking-[0.18em] text-gray-700 outline-none focus:border-brand-campus"
                    @input="otherCampusEnteredCode = otherCampusEnteredCode.replace(/\D/g, '').slice(0, 4)"
                    @keyup.enter="authorizeOtherCampusPayment"
                  >
                  <button
                    type="button"
                    class="btn btn-primary h-10 px-3 text-xs"
                    :disabled="otherCampusEnteredCode.length !== 4"
                    @click="authorizeOtherCampusPayment"
                  >
                    Autorizar
                  </button>
                </template>
              </div>
            </div>
            <p v-if="otherCampusAuthorizationError" class="mt-2 text-xs font-semibold text-red-600">{{ otherCampusAuthorizationError }}</p>
          </div>

          <div
            v-if="pagoRealizadoEnOtroPlantel"
            class="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4"
          >
            <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div class="flex min-w-0 items-start gap-3">
                <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-amber-700 shadow-sm ring-1 ring-amber-200">
                  <LucideBuilding2 :size="18" />
                </span>
                <div class="min-w-0">
                  <p class="text-sm font-bold text-gray-800">Pagado en otro plantel</p>
                </div>
              </div>

              <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div ref="paymentCampusRef" class="relative min-w-0 sm:w-56" @keydown.esc.stop="paymentCampusMenuOpen = false">
                  <label class="mb-1.5 block text-[0.68rem] font-bold uppercase tracking-wide text-amber-800">Plantel donde se pagó</label>
                  <button
                    type="button"
                    class="flex h-11 w-full items-center gap-2 rounded-lg border bg-white px-3 text-left transition"
                    :class="paymentCampusError ? 'border-red-300 ring-2 ring-red-100' : 'border-amber-200 hover:border-amber-300'"
                    aria-haspopup="listbox"
                    :aria-expanded="paymentCampusMenuOpen"
                    @click="paymentCampusMenuOpen = !paymentCampusMenuOpen"
                  >
                    <LucideBuilding2 :size="16" class="shrink-0 text-amber-700" />
                    <span
                      class="min-w-0 flex-1 truncate text-sm font-bold"
                      :class="plantelPago ? 'text-gray-800' : 'text-gray-500'"
                    >
                      {{ selectedPaymentCampusLabel }}
                    </span>
                    <LucideChevronDown :size="15" class="shrink-0 text-gray-400" />
                  </button>

                  <Transition name="payment-options">
                    <div
                      v-if="paymentCampusMenuOpen"
                      class="absolute right-0 top-full z-40 mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl"
                      role="listbox"
                      aria-label="Plantel donde se realizó el pago"
                    >
                      <button
                        v-for="plantel in paymentCampusOptions"
                        :key="plantel"
                        type="button"
                        class="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-700 transition hover:bg-amber-50 hover:text-amber-900"
                        role="option"
                        :aria-selected="plantelPago === plantel"
                        @click="selectPaymentCampus(plantel)"
                      >
                        <span class="inline-flex h-7 min-w-10 items-center justify-center rounded-md bg-gray-100 px-2 text-xs font-black tracking-wide text-gray-700">
                          {{ plantel }}
                        </span>
                        <span class="text-xs font-medium text-gray-500">Plantel</span>
                        <LucideCheck v-if="plantelPago === plantel" :size="15" class="ml-auto text-amber-700" />
                      </button>
                    </div>
                  </Transition>
                  <p v-if="paymentCampusError" class="mt-1.5 text-xs font-semibold text-red-600">Selecciona el plantel donde se realizó el pago.</p>
                </div>

                <button type="button" class="btn btn-ghost h-11 shrink-0 px-3 text-xs" @click="deactivateOtherCampusPayment">
                  Quitar
                </button>
              </div>
            </div>
          </div>

          <div class="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div class="form-group mb-0 min-w-0">
              <label class="form-label">Método de pago</label>
              <div class="flex items-center gap-2">
                <div class="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3">
                  <component :is="selectedPaymentMethodOption.icon" :size="16" class="shrink-0 text-brand-campus" />
                  <span class="min-w-0 flex-1 truncate text-sm font-bold text-gray-800">{{ selectedPaymentMethodOption.label }}</span>
                  <button
                    type="button"
                    class="rounded-md px-2 py-1 text-xs font-bold text-brand-campus transition hover:bg-brand-campus/5"
                    @click="openPaymentMethodEditor"
                  >
                    Cambiar
                  </button>
                </div>
                <button
                  type="button"
                  class="payment-date-chip"
                  :class="{ active: hasCustomPaymentDate }"
                  :title="formattedEffectivePaymentDate"
                  aria-label="Cambiar fecha del pago"
                  @click="openPaymentDateEditor"
                >
                  <LucideCalendarDays :size="15" />
                  <span>{{ paymentDateChipLabel }}</span>
                </button>
              </div>
            </div>
            <div class="flex flex-col justify-center text-right">
              <span class="text-[0.7rem] font-bold uppercase tracking-wide text-gray-500">Total del pago</span>
              <span class="mt-1 font-mono text-2xl font-bold leading-none text-brand-campus">${{ totalCobrar.toFixed(2) }}</span>
            </div>
          </div>

          <p v-if="hasPendingFinalAmounts" class="mb-3 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Este debe ser el monto final de tu proyección, sin decimales.</p>

          <div class="payment-table-shell border border-gray-200 rounded-lg shadow-sm">
            <table class="payment-table w-full">
              <colgroup>
                <col class="payment-col-concept">
                <col class="payment-col-reference">
                <col class="payment-col-recargo">
                <col class="payment-col-final">
                <col class="payment-col-paid">
              </colgroup>
              <thead class="bg-gray-50/80">
                <tr>
                  <th class="text-left">Concepto</th>
                  <th class="text-left">Ref/Mes</th>
                  <th class="text-center payment-recargo-heading">Recargo</th>
                  <th class="text-right">Monto final</th>
                  <th class="text-right">Monto ($)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(debt, i) in processedDebts" :key="i" class="border-t border-gray-100 hover:bg-transparent">
                  <td class="font-semibold text-sm py-2 px-4 text-gray-800">
                    <div class="payment-concept-cell">
                      <span>{{ debt.conceptoNombre }}</span>
                      <em v-if="debt.stock?.controlled" :class="['payment-stock-chip', stockClass(debt.stock)]">{{ stockLabel(debt.stock) }}</em>
                    </div>
                  </td>
                  <td class="text-xs text-gray-500 py-2 px-4">{{ debt.mesLabel }}</td>
                  <td class="py-2 px-3 text-center">
                    <div class="payment-recargo-control">
                      <button
                        type="button"
                        class="payment-recargo-tag"
                        :class="{
                          applied: debtHasRecargoForDate(debt),
                          pending: isRecargoTogglePending(debt),
                        }"
                        :disabled="isRecargoTogglePending(debt) || debtHasRecargoForDate(debt)"
                        :aria-pressed="debtHasRecargoForDate(debt) ? 'true' : 'false'"
                        :aria-label="recargoActionLabel(debt)"
                        @click.stop="applyRecargo(debt)"
                      >
                        <LucideLoader2 v-if="isRecargoTogglePending(debt)" :size="12" class="animate-spin" />
                        <LucideCheckCircle v-else-if="debtHasRecargoForDate(debt)" :size="12" />
                        <span>{{ recargoActionLabel(debt) }}</span>
                      </button>
                      <div v-if="debt.recargoServicio || debtHasRecargoForDate(debt)" class="payment-recargo-meta">
                        <span v-if="debt.recargoServicio" class="payment-recargo-service">Servicio</span>
                        <span v-if="debtHasRecargoForDate(debt)" class="payment-recargo-impact">+${{ recargoAmountForDebt(debt).toFixed(0) }}</span>
                      </div>
                    </div>
                  </td>
                  <td class="py-2 px-4 text-right">
                    <input
                      v-if="debt.montoFinalPendiente"
                      type="number"
                      class="input-field text-right font-mono font-semibold py-1 px-2 h-auto text-brand-campus"
                      v-model.number="debt.montoFinalInput"
                      min="0"
                      @input="handleFinalAmountInput(debt)"
                      step="1"
                    >
                    <span v-else class="font-mono text-xs font-semibold text-gray-500">${{ effectiveSubtotal(debt).toFixed(2) }}</span>
                  </td>
                  <td class="py-2 px-4 text-right">
                    <input
                      type="number"
                      class="input-field text-right font-mono font-semibold py-1 px-2 h-auto text-brand-campus"
                      :value="paymentAmountForDebt(debt)"
                      :max="effectiveSaldoFinal(debt)"
                      min="0"
                      step="0.01"
                      @input="handlePaymentAmountInput(debt, $event)"
                    >
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
          <button class="btn btn-primary" @click="submit" :disabled="processing || totalCobrar <= 0 || hasBlockingStock">
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
import { ref, watch, computed, onMounted, onBeforeUnmount, markRaw, nextTick } from 'vue'
import { LucideBanknote, LucideBuilding2, LucideCalendarDays, LucideCheck, LucideCheckCircle, LucideChevronDown, LucideCreditCard, LucideEye, LucideLandmark, LucideLoader2, LucideLock, LucideMoreHorizontal, LucideReceiptText, LucideWalletCards } from 'lucide-vue-next'
import { useCookie, useState } from '#app'
import { useScrollLock } from '~/composables/useScrollLock'
import { useOptimisticSync } from '~/composables/useOptimisticSync'
import { useModalDraftPersistence } from '~/composables/useModalDraftPersistence'
import { normalizeCicloKey } from '~/shared/utils/ciclo'
import { calculatePromotedGrado, displayGrado } from '~/shared/utils/grado'
import { institutionFlagForPlantel, normalizePlantelCode } from '~/shared/utils/institution'
import { studentNivelLabel } from '~/shared/utils/studentPresentation'
import { calculateLateFeeSubtotal, resolveLateFeeTiming, shouldApplyLateFee } from '~/shared/utils/recargo'
import { PLANTELES_LIST } from '~/utils/constants'
import { requestPaymentActionAuthorizationCode, sendPaymentActionAuthorizationNotice } from '~/utils/paymentActionAuthorization'

const props = defineProps({ debts: Array, student: Object })
const emit = defineEmits(['close', 'success'])
const state = useState('globalState')
const { executeOptimistic } = useOptimisticSync()

useScrollLock()

const formaDePago = ref('Efectivo')
const processing = ref(false)
const processedDebts = ref([])
const paymentOptionsRef = ref(null)
const paymentCampusRef = ref(null)
const paymentOptionsOpen = ref(false)
const paymentCampusMenuOpen = ref(false)
const paymentDateEditorOpen = ref(false)
const paymentMethodEditorOpen = ref(false)
const pagoRealizadoEnOtroPlantel = ref(false)
const plantelPago = ref('')
const paymentCampusError = ref(false)
const otherCampusAuthorizationOpen = ref(false)
const otherCampusCodeRequested = ref(false)
const otherCampusRequestingCode = ref(false)
const otherCampusEnteredCode = ref('')
const otherCampusAuthorizationCode = ref('')
const otherCampusAuthorizationError = ref('')
const otherCampusCodeInput = ref(null)
const recargoTogglingConcepts = ref(new Set())
const activePlantelCookie = useCookie('auth_active_plantel')

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
const paymentDateChipLabel = computed(() => {
  if (!hasCustomPaymentDate.value) return 'Hoy'
  const [year, month, day] = String(paymentDate.value || '').split('-').map(Number)
  if (!year || !month || !day) return 'Fecha'
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })
    .format(new Date(year, month - 1, day))
    .replace('.', '')
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

const paymentCampusOptions = computed(() => {
  const active = String(activePlantelCookie.value || '').trim().toUpperCase()
  return PLANTELES_LIST.filter(plantel => plantel !== active)
})

const selectedPaymentCampusLabel = computed(() => plantelPago.value || 'Seleccionar plantel')

const openPaymentMethodEditor = () => {
  paymentOptionsOpen.value = false
  paymentCampusMenuOpen.value = false
  paymentDateEditorOpen.value = false
  resetOtherCampusAuthorization()
  paymentMethodEditorOpen.value = true
}

const selectPaymentMethod = (value) => {
  if (!paymentMethodOptions.some(option => option.value === value)) return
  formaDePago.value = value
}

const openPaymentDateEditor = () => {
  paymentOptionsOpen.value = false
  paymentCampusMenuOpen.value = false
  paymentMethodEditorOpen.value = false
  resetOtherCampusAuthorization()
  paymentDateEditorOpen.value = true
}

const resetPaymentDate = () => {
  paymentDate.value = localDateKey()
  paymentOptionsOpen.value = false
  paymentDateEditorOpen.value = false
}

const resetOtherCampusAuthorization = () => {
  otherCampusAuthorizationOpen.value = false
  otherCampusCodeRequested.value = false
  otherCampusRequestingCode.value = false
  otherCampusEnteredCode.value = ''
  otherCampusAuthorizationCode.value = ''
  otherCampusAuthorizationError.value = ''
}

const openOtherCampusAuthorization = () => {
  paymentOptionsOpen.value = false
  paymentMethodEditorOpen.value = false
  paymentDateEditorOpen.value = false
  paymentCampusError.value = false

  if (pagoRealizadoEnOtroPlantel.value) {
    paymentCampusMenuOpen.value = true
    return
  }

  otherCampusAuthorizationOpen.value = true
}

const requestOtherCampusAuthorizationCode = async () => {
  if (otherCampusRequestingCode.value || otherCampusCodeRequested.value) return
  otherCampusRequestingCode.value = true
  otherCampusAuthorizationError.value = ''
  const userName = useCookie('auth_name').value || 'Operador'
  const matricula = String(props.student?.matricula || '').trim() || 'Sin matrícula'
  const activePlantel = String(activePlantelCookie.value || '').trim().toUpperCase() || 'Sin plantel'

  try {
    otherCampusAuthorizationCode.value = await requestPaymentActionAuthorizationCode((secret) =>
      `*${userName}* solicita habilitar _Pagado en otro plantel_ para la matrícula *${matricula}* desde el plantel *${activePlantel}*.
Código para autorizar: *${secret}*`
    )
    otherCampusCodeRequested.value = true
    await nextTick()
    otherCampusCodeInput.value?.focus?.()
  } catch {
    otherCampusAuthorizationError.value = 'No se pudo solicitar el código.'
  } finally {
    otherCampusRequestingCode.value = false
  }
}

const authorizeOtherCampusPayment = () => {
  if (!otherCampusCodeRequested.value || otherCampusEnteredCode.value !== otherCampusAuthorizationCode.value) {
    otherCampusAuthorizationError.value = 'El código no coincide.'
    return
  }

  pagoRealizadoEnOtroPlantel.value = true
  plantelPago.value = ''
  paymentCampusError.value = false
  paymentCampusMenuOpen.value = true
  resetOtherCampusAuthorization()
}

const deactivateOtherCampusPayment = () => {
  pagoRealizadoEnOtroPlantel.value = false
  plantelPago.value = ''
  paymentCampusError.value = false
  paymentCampusMenuOpen.value = false
  resetOtherCampusAuthorization()
}

const selectPaymentCampus = (plantel) => {
  const normalized = String(plantel || '').trim().toUpperCase()
  if (!paymentCampusOptions.value.includes(normalized)) return
  plantelPago.value = normalized
  paymentCampusError.value = false
  paymentCampusMenuOpen.value = false
}

const closePaymentOptionsOnOutsideClick = (event) => {
  const target = event.target
  if (!(target instanceof Node)) return

  if (paymentOptionsOpen.value && paymentOptionsRef.value && !paymentOptionsRef.value.contains(target)) {
    paymentOptionsOpen.value = false
  }

  if (paymentCampusMenuOpen.value && paymentCampusRef.value && !paymentCampusRef.value.contains(target)) {
    paymentCampusMenuOpen.value = false
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
const conceptIdForDebt = (debt) => Number(debt?.conceptoId || debt?.concepto || 0)
const schoolMonthForDebt = (debt) => {
  const raw = String(debt?.mes || '').trim().toLowerCase()
  if (raw === 'ev') return 1
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}
const baseAmountForDebt = (debt) => debt?.montoFinalPendiente
  ? Math.max(0, Number(debt?.montoFinalInput || 0))
  : Math.max(0, Number(debt?.costoOriginal ?? debt?.subtotal ?? 0))
const recargoCalculationForDebt = (debt) => {
  const baseAmount = baseAmountForDebt(debt)
  const pagosPrevios = Number(debt?.pagosPrevios ?? debt?.resuelto ?? debt?.pagos ?? 0)
  const timing = resolveLateFeeTiming({
    ciclo: normalizeCicloKey(state.value.ciclo),
    schoolMonth: schoolMonthForDebt(debt),
    currentDateValue: paymentDate.value,
    cutoffDay: debt?.recargoDiaLimite ?? 12,
    isService: Boolean(debt?.recargoServicio),
  })
  const applies = shouldApplyLateFee({
    enabled: Boolean(debt?.recargoActivo),
    force: Boolean(debt?.recargoAplicadoAhora),
    hasManualLateFee: Boolean(debt?.recargoManual),
    hasPayment: Boolean(debt?.hasPayment),
    hasActiveConvention: Boolean(debt?.convenioActivo),
    isAfterDeadline: timing.isAfterDeadline,
    balanceBeforeLateFee: baseAmount - pagosPrevios,
  })
  const subtotal = applies
    ? calculateLateFeeSubtotal(baseAmount, debt?.recargoPorcentaje ?? 10)
    : baseAmount

  return { subtotal, applies, isLate: timing.isAfterDeadline, deadline: timing.deadline }
}
const debtHasRecargoForDate = (debt) => recargoCalculationForDebt(debt).applies
const recargoActionLabel = (debt) => debtHasRecargoForDate(debt) ? 'Recargo aplicado' : 'Aplicar recargo'
const recargoAmountForDebt = (debt) => {
  const calculation = recargoCalculationForDebt(debt)
  if (!calculation.applies) return 0
  return Math.max(0, calculation.subtotal - baseAmountForDebt(debt))
}
const isRecargoTogglePending = (debt) => recargoTogglingConcepts.value.has(conceptIdForDebt(debt))

const buildProcessedDebts = () => (Array.isArray(props.debts) ? props.debts : []).map(d => {
  const final = d.saldo
  const resuelto = d.resuelto ?? d.pagos
  return {
    ...d,
    recargoAplicadoAhora: false,
    saldoFinal: final,
    montoPagado: final,
    montoTouched: false,
    montoFinalTouched: false,
    pagosPrevios: resuelto,
    saldoAntes: d.subtotal - resuelto,
    montoFinalInput: Math.round(Number(d.costoOriginal ?? d.subtotal ?? d.saldo ?? 0))
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
  debts: processedDebts.value
    .filter(debt => debt.montoTouched || debt.montoFinalTouched)
    .map(debt => ({
      key: paymentDebtKey(debt),
      montoPagado: debt.montoPagado,
      montoFinalInput: debt.montoFinalInput,
      montoTouched: Boolean(debt.montoTouched),
      montoFinalTouched: Boolean(debt.montoFinalTouched)
    }))
})

const writePaymentDraft = (draft) => {
  if (!draft || typeof draft !== 'object') return

  if (draft.formaDePago) formaDePago.value = String(draft.formaDePago)
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(draft.paymentDate || ''))) {
    paymentDate.value = String(draft.paymentDate)
  }
  paymentDateEditorOpen.value = false
  paymentMethodEditorOpen.value = false
  pagoRealizadoEnOtroPlantel.value = false
  plantelPago.value = ''
  paymentCampusMenuOpen.value = false
  resetOtherCampusAuthorization()
  const restoredDebts = new Map((Array.isArray(draft.debts) ? draft.debts : []).map(debt => [debt.key, debt]))

  processedDebts.value = processedDebts.value.map((debt) => {
    const restored = restoredDebts.get(paymentDebtKey(debt))
    if (!restored) return debt

    const montoPagado = Number(restored.montoPagado)
    const montoFinalInput = Number(restored.montoFinalInput)
    const legacyPaidChanged = restored.montoTouched === undefined
      && Number.isFinite(montoPagado)
      && Math.abs(montoPagado - Number(debt.montoPagado || 0)) > 0.009
    const legacyFinalChanged = restored.montoFinalTouched === undefined
      && Number.isFinite(montoFinalInput)
      && Math.abs(montoFinalInput - Number(debt.montoFinalInput || 0)) > 0.009
    const montoTouched = Boolean(restored.montoTouched || legacyPaidChanged)
    const montoFinalTouched = Boolean(restored.montoFinalTouched || legacyFinalChanged)
    return {
      ...debt,
      montoPagado: montoTouched && Number.isFinite(montoPagado) ? montoPagado : debt.montoPagado,
      montoTouched,
      montoFinalInput: montoFinalTouched && Number.isFinite(montoFinalInput) ? montoFinalInput : debt.montoFinalInput,
      montoFinalTouched
    }
  })
}

const paymentDraftHasContent = (draft) => {
  if (!draft || typeof draft !== 'object') return false
  if (String(draft.formaDePago || 'Efectivo') !== 'Efectivo') return true
  if (String(draft.paymentDate || localDateKey()) !== localDateKey()) return true

  const draftDebts = Array.isArray(draft.debts) ? draft.debts : []
  return draftDebts.some((saved) => {
    if (saved?.montoTouched || saved?.montoFinalTouched) return true

    // Backward compatibility: old drafts did not store explicit touch flags.
    const current = processedDebts.value.find(debt => paymentDebtKey(debt) === saved?.key)
    if (!current) return false

    const savedPaid = Number(saved?.montoPagado)
    const savedFinal = Number(saved?.montoFinalInput)
    return (Number.isFinite(savedPaid) && Math.abs(savedPaid - Number(current.montoPagado || 0)) > 0.009)
      || (Number.isFinite(savedFinal) && Math.abs(savedFinal - Number(current.montoFinalInput || 0)) > 0.009)
  })
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
const effectiveSubtotal = (debt) => recargoCalculationForDebt(debt).subtotal
const effectiveSaldoFinal = (debt) => Math.max(0, effectiveSubtotal(debt) - Number(debt.pagosPrevios || 0))

// Untouched amounts are projections, not stored user input. Derive them directly
// from the current canonical balance so recargo/date/policy changes cannot leave
// the visible total or submitted amount stale. Only an explicit operator edit
// turns the amount into a manual value.
const paymentAmountForDebt = (debt) => {
  const balance = effectiveSaldoFinal(debt)
  if (!debt?.montoTouched) return balance

  const manual = Number(debt?.montoPagado || 0)
  if (!Number.isFinite(manual)) return 0
  return Math.max(0, Math.min(manual, balance))
}
const handlePaymentAmountInput = (debt, event) => {
  const value = Number(event?.target?.value ?? 0)
  debt.montoTouched = true
  debt.montoPagado = Number.isFinite(value) ? value : 0
}
const repriceUntouchedPayments = () => {
  processedDebts.value.forEach((debt) => {
    const nextBalance = effectiveSaldoFinal(debt)
    if (!debt.montoTouched) debt.montoPagado = nextBalance
    else if (Number(debt.montoPagado || 0) > nextBalance) debt.montoPagado = nextBalance
  })
}
const handleFinalAmountInput = (debt) => {
  debt.montoFinalTouched = true
  if (!debt?.montoTouched) debt.montoPagado = effectiveSaldoFinal(debt)
}
const setRecargoTogglePending = (conceptoId, pending) => {
  const next = new Set(recargoTogglingConcepts.value)
  if (pending) next.add(conceptoId)
  else next.delete(conceptoId)
  recargoTogglingConcepts.value = next
}
const applyRecargoPolicyToConcept = (conceptoId, policy) => {
  processedDebts.value.forEach((row) => {
    if (conceptIdForDebt(row) !== conceptoId) return
    if (policy.activo !== undefined) row.recargoActivo = Boolean(policy.activo)
    if (policy.servicio !== undefined) row.recargoServicio = Boolean(policy.servicio)
    if (policy.esServicio !== undefined) row.recargoServicio = Boolean(policy.esServicio)
    if (policy.porcentaje !== undefined) row.recargoPorcentaje = Number(policy.porcentaje)
    if (policy.diaLimite !== undefined) row.recargoDiaLimite = Number(policy.diaLimite)
    if (policy.pendingSync !== undefined) row.recargoPendingSync = Boolean(policy.pendingSync)
  })
  repriceUntouchedPayments()
}
const applyRecargo = async (debt) => {
  if (debtHasRecargoForDate(debt)) return

  const conceptoId = conceptIdForDebt(debt)
  if (!conceptoId || isRecargoTogglePending(debt)) return

  // A concept already classified as Servicio only needs the payment-local
  // action. The service classification itself is global and persistent.
  if (debt?.recargoServicio) {
    debt.recargoAplicadoAhora = true
    repriceUntouchedPayments()
    return
  }

  const previous = processedDebts.value
    .filter(row => conceptIdForDebt(row) === conceptoId)
    .map(row => ({
      key: paymentDebtKey(row),
      activo: Boolean(row.recargoActivo),
      servicio: Boolean(row.recargoServicio),
      porcentaje: Number(row.recargoPorcentaje ?? 10),
      diaLimite: Number(row.recargoDiaLimite ?? 12),
      pendingSync: Boolean(row.recargoPendingSync),
      applyNow: Boolean(row.recargoAplicadoAhora),
    }))
  setRecargoTogglePending(conceptoId, true)

  try {
    const response = await executeOptimistic(
      () => $fetch('/api/recargos/concepto', {
        method: 'PUT',
        body: { conceptoId, servicio: true },
      }),
      () => {
        debt.recargoAplicadoAhora = true
        applyRecargoPolicyToConcept(conceptoId, { activo: true, servicio: true })
      },
      () => {
        const previousByKey = new Map(previous.map(item => [item.key, item]))
        processedDebts.value.forEach((row) => {
          const saved = previousByKey.get(paymentDebtKey(row))
          if (!saved) return
          row.recargoActivo = saved.activo
          row.recargoServicio = saved.servicio
          row.recargoPorcentaje = saved.porcentaje
          row.recargoDiaLimite = saved.diaLimite
          row.recargoPendingSync = saved.pendingSync
          row.recargoAplicadoAhora = saved.applyNow
        })
        repriceUntouchedPayments()
      },
      {
        pending: 'Aplicando recargo...',
        success: 'Recargo aplicado',
        error: 'No se pudo aplicar el recargo',
      },
    )
    if (response?.policy) applyRecargoPolicyToConcept(conceptoId, response.policy)
  } catch {
    // executeOptimistic already restores the visible state.
  } finally {
    setRecargoTogglePending(conceptoId, false)
  }
}
watch(paymentDate, () => {
  repriceUntouchedPayments()
})
const totalCobrar = computed(() => processedDebts.value.reduce((sum, debt) => sum + paymentAmountForDebt(debt), 0))
const stockLabel = (stock) => {
  if (!stock?.controlled) return ''
  if (stock.status === 'out') return 'agotado'
  if (stock.status === 'low') return `bajo · ${stock.available ?? 0}`
  return `${stock.available ?? 0} disp.`
}
const stockClass = (stock) => {
  if (!stock?.controlled) return 'neutral'
  if (stock.status === 'out') return 'danger'
  if (stock.status === 'low') return 'warning'
  return 'success'
}
const isDebtStockBlocked = (debt) => Boolean(Number(debt?.montoPagado || 0) > 0 && debt?.stock?.controlled && debt?.stock?.status === 'out' && !debt?.stock?.allow_negative)
const hasBlockingStock = computed(() => processedDebts.value.some(isDebtStockBlocked))

const paymentRows = () => processedDebts.value
  .map((d) => ({ debt: d, montoPagado: paymentAmountForDebt(d) }))
  .filter(({ montoPagado }) => montoPagado > 0)
  .map(({ debt: d, montoPagado }) => {
    const subtotal = effectiveSubtotal(d)
    const saldoAntes = effectiveSaldoFinal(d)
    return {
      ...d,
      subtotal,
      saldoFinal: saldoAntes,
      saldoAntes,
      montoPagado,
      montoAutomatico: !d.montoTouched,
      montoFinal: d.montoFinalPendiente ? Number(d.montoFinalInput || 0) : d.montoFinal,
      aplicarRecargo: Boolean(d.recargoAplicadoAhora)
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


const previewAcademicPlacement = () => {
  const hasBasePlacement = Boolean(
    props.student?.gradoBase &&
    props.student?.cicloBase &&
    (props.student?.plantelBase || props.student?.plantel),
  )

  if (!hasBasePlacement) {
    return {
      grado: props.student?.grado || '',
      nivel: studentNivelLabel(props.student),
    }
  }

  const projected = calculatePromotedGrado(
    props.student.gradoBase,
    props.student.plantelBase || props.student.plantel,
    props.student.cicloBase,
    normalizeCicloKey(state.value.ciclo),
    props.student.nivelBase || props.student.nivel,
  )

  return {
    grado: displayGrado(projected.grado),
    nivel: projected.nivel,
  }
}

const previewReceipt = () => {
  if (pagoRealizadoEnOtroPlantel.value) return
  if (!validateFinalAmounts()) return
  const academicPlacement = previewAcademicPlacement()
  const previewData = {
    folios: 'PREVIO',
    fecha: effectivePaymentDateIso(),
    nombreCompleto: props.student.nombreCompleto,
    matricula: props.student.matricula,
    nivel: academicPlacement.nivel,
    grado: academicPlacement.grado,
    grupo: props.student.grupo,
    ciclo: normalizeCicloKey(state.value.ciclo),
    plantel: normalizePlantelCode(props.student.plantel),
    instituto: institutionFlagForPlantel(props.student.plantel),
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
      fecha: effectivePaymentDateIso(),
      plantel: normalizePlantelCode(props.student.plantel)
    }))
  }
  sessionStorage.setItem('receipt_preview', JSON.stringify(previewData))
  window.open('/print/recibo?preview=true', '_blank', 'width=850,height=800')
}

const submit = async () => {
  if (hasBlockingStock.value) {
    window.alert('Uno o más conceptos seleccionados están agotados para este plantel.')
    return
  }
  if (!validateFinalAmounts()) return
  if (pagoRealizadoEnOtroPlantel.value && !plantelPago.value) {
    paymentCampusError.value = true
    paymentCampusMenuOpen.value = true
    return
  }

  const payload = {
    matricula: props.student.matricula,
    formaDePago: formaDePago.value,
    ciclo: normalizeCicloKey(state.value.ciclo),
    fechaPago: hasCustomPaymentDate.value ? paymentDate.value : null,
    pagoRealizadoEnOtroPlantel: pagoRealizadoEnOtroPlantel.value,
    plantelPago: pagoRealizadoEnOtroPlantel.value ? plantelPago.value : null,
    pagos: paymentRows()
  }

  // Open the receipt window while the action is still inside the operator's click.
  // Browsers may block a window opened only after the asynchronous payment request finishes.
  const receiptWindow = window.open('', '_blank', 'width=850,height=800')
  if (receiptWindow) {
    receiptWindow.document.title = 'Generando recibo...'
    receiptWindow.document.body.innerHTML = '<main style="font-family:system-ui,sans-serif;padding:32px;color:#24364b"><h1 style="font-size:20px;margin:0 0 8px">Generando recibo...</h1><p style="margin:0;color:#667085">El pago se está registrando. Esta ventana continuará automáticamente.</p></main>'
  }

  processing.value = true

  try {
    const res = await executeOptimistic(
      () => $fetch('/api/payments/pay', { method: 'POST', body: payload }),
      () => {},
      () => {},
      {
        pending: pagoRealizadoEnOtroPlantel.value ? 'Registrando pago en otro plantel...' : 'Registrando pago...',
        success: pagoRealizadoEnOtroPlantel.value ? 'Pago en otro plantel registrado' : 'Pago exitoso',
        error: 'Error al registrar'
      }
    )

    const folios = Array.isArray(res?.folios) ? res.folios.filter(Boolean) : []
    markSaved()

    if (pagoRealizadoEnOtroPlantel.value && plantelPago.value) {
      const userName = useCookie('auth_name').value || 'Operador'
      sendPaymentActionAuthorizationNotice(
        `El pago en otro plantel autorizado por *${userName}* para la matrícula *${props.student?.matricula || ''}* fue registrado en *${plantelPago.value}*.`
      ).catch(() => {})
    }

    if (folios.length) {
      const receiptUrl = `/print/recibo?folios=${encodeURIComponent(folios.join(','))}`
      if (receiptWindow && !receiptWindow.closed) {
        receiptWindow.location.replace(receiptUrl)
      } else {
        window.open(receiptUrl, '_blank', 'width=850,height=800')
      }
    } else if (receiptWindow && !receiptWindow.closed) {
      receiptWindow.close()
    }

    emit('success', res)
  } catch {
    if (receiptWindow && !receiptWindow.closed) receiptWindow.close()
  } finally {
    processing.value = false
  }
}
</script>

<style scoped>
.payment-modal {
  max-width: 64rem;
}

.payment-table-shell {
  overflow: hidden;
}

.payment-table {
  table-layout: fixed;
}

.payment-col-reference {
  width: 9.5rem;
}

.payment-col-recargo {
  width: 9.75rem;
}

.payment-col-final,
.payment-col-paid {
  width: 8rem;
}

.payment-options-enter-active,
.payment-options-leave-active {
  transition: opacity 140ms ease, transform 140ms ease;
}

.payment-options-enter-from,
.payment-options-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

.payment-date-chip {
  display: inline-flex;
  height: 44px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid #d7dde6;
  border-radius: 8px;
  background: #fff;
  padding: 0 11px;
  color: #536276;
  font-size: .72rem;
  font-weight: 800;
  line-height: 1;
  transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
}
.payment-date-chip:hover,
.payment-date-chip.active {
  border-color: rgba(50, 120, 78, .42);
  background: #f4faf5;
  color: #2f7449;
}
.payment-recargo-heading {
  width: 9.75rem;
}
.payment-recargo-control {
  display: inline-flex;
  min-width: 8.5rem;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.payment-recargo-tag {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid #d2d9e2;
  border-radius: 999px;
  background: #fff;
  padding: 5px 9px;
  color: #526173;
  font-size: .66rem;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  transition: border-color 140ms ease, background 140ms ease, color 140ms ease, opacity 140ms ease;
}
.payment-recargo-tag:not(:disabled):hover {
  border-color: #8cad97;
  background: #f5faf6;
  color: #2f7449;
}
.payment-recargo-tag.applied {
  border-color: #cfe1d4;
  background: #f3f8f4;
  color: #50745a;
}
.payment-recargo-tag.pending {
  cursor: wait;
  opacity: .68;
}
.payment-recargo-tag:disabled {
  cursor: default;
}
.payment-recargo-meta {
  display: flex;
  min-height: 14px;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.payment-recargo-service {
  display: inline-flex;
  align-items: center;
  border: 1px solid #dfe4ea;
  border-radius: 999px;
  background: #f7f8fa;
  padding: 2px 6px;
  color: #667384;
  font-size: .58rem;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}
.payment-recargo-impact {
  color: #2f7449;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: .64rem;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}
.payment-concept-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}
.payment-concept-cell span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.payment-stock-chip {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  justify-content: center;
  min-height: 19px;
  border-radius: 999px;
  padding: 0 7px;
  font-size: .63rem;
  font-style: normal;
  font-weight: 850;
}
.payment-stock-chip.neutral { background: #f1f4f8; color: #68778c; }
.payment-stock-chip.success { background: #edf8ea; color: #356b2f; }
.payment-stock-chip.warning { background: #fff4d9; color: #925b0d; }
.payment-stock-chip.danger { background: #fff1f1; color: #b42318; }

</style>
