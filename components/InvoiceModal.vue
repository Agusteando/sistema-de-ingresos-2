<template>
  <Teleport to="body">
    <div ref="modalOverlayRef" class="modal-overlay overflow-y-auto p-4" @click.self="requestClose">
      <div class="modal-container large w-full max-w-4xl h-auto my-auto" role="dialog" aria-modal="true" aria-labelledby="invoice-modal-title">
        <div class="modal-header rounded-t-xl sticky top-0 z-10">
          <h2 id="invoice-modal-title" class="text-lg font-bold text-gray-800">
            {{ generatedInvoice ? 'Factura generada' : invoiceStage === 'review' ? 'Revisar factura' : 'Facturación' }}
          </h2>
        </div>

        <div class="modal-content p-6 space-y-4">
          <section v-if="generatedInvoice" ref="resultPanelRef" class="card border-emerald-200 bg-emerald-50/60 overflow-hidden" aria-live="polite" tabindex="-1">
            <div class="p-6 md:p-8">
              <div class="flex items-start gap-4">
                <span class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <LucideCheckCircle :size="24" />
                </span>
                <div class="min-w-0 flex-1">
                  <span class="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">Emisión confirmada</span>
                  <h3 class="mt-1 mb-0 text-2xl font-bold text-gray-900">
                    {{ generatedInvoice.folio ? `Folio ${generatedInvoice.folio}` : 'Factura generada sin folio devuelto' }}
                  </h3>
                  <p class="mt-2 mb-0 text-sm text-gray-600">
                    La factura quedó registrada. Conserva el identificador y descarga los archivos antes de cerrar esta ventana.
                  </p>
                </div>
              </div>

              <dl class="mt-6 grid gap-3 rounded-xl border border-emerald-200 bg-white/80 p-4 text-sm md:grid-cols-2">
                <div class="min-w-0">
                  <dt class="text-[10px] font-bold uppercase tracking-wide text-gray-500">Identificador CFDI</dt>
                  <dd class="mt-1 break-all font-mono font-semibold text-gray-900">{{ generatedInvoice.invoice_id }}</dd>
                </div>
                <div class="min-w-0">
                  <dt class="text-[10px] font-bold uppercase tracking-wide text-gray-500">Receptor</dt>
                  <dd class="mt-1 break-all font-semibold text-gray-900">{{ generatedInvoice.email || 'Sin correo registrado' }}</dd>
                </div>
              </dl>

              <div class="mt-5 flex flex-wrap gap-2" aria-label="Archivos de la factura">
                <button class="btn btn-outline" type="button" @click="openDownload('pdf')"><LucideFileDown :size="14" /> PDF</button>
                <button class="btn btn-outline" type="button" @click="openDownload('xml')"><LucideFileText :size="14" /> XML</button>
                <button class="btn btn-outline" type="button" @click="openDownload('zip')"><LucideArchive :size="14" /> ZIP</button>
                <button class="btn btn-primary" type="button" @click="sendGeneratedByEmail" :disabled="emailing">
                  <LucideLoader2 v-if="emailing" class="animate-spin" :size="14" />
                  <LucideMail v-else :size="14" /> {{ emailing ? 'Enviando...' : 'Enviar por email' }}
                </button>
              </div>

              <div
                v-if="emailFeedback"
                class="mt-4 rounded-lg border px-4 py-3 text-sm"
                :class="emailFeedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'"
                role="status"
              >
                {{ emailFeedback.message }}
              </div>

              <div
                v-if="generatedInvoice.indexWarning"
                class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                role="status"
              >
                <strong>Factura emitida; historial por recuperar.</strong>
                {{ generatedInvoice.indexWarning }}
              </div>
            </div>
          </section>

          <template v-else>
            <div v-if="invoiceStage === 'prepare' && loadingCompany" class="card p-4 text-sm text-gray-500 flex items-center gap-2" role="status">
              <LucideLoader2 class="animate-spin" :size="16" /> Cargando información...
            </div>

            <div v-if="invoiceStage === 'prepare' && companyLoadError" class="card p-4 border-amber-200 bg-amber-50/70 text-sm text-amber-900">
              <div class="flex items-start gap-3">
                <LucideAlertTriangle class="shrink-0 mt-0.5" :size="18" />
                <div>
                  <strong>No se pudieron precargar los datos fiscales.</strong>
                  <p class="m-0 mt-1">{{ companyLoadError }} Puedes completar o corregir los campos manualmente.</p>
                </div>
              </div>
            </div>

            <div v-if="loading" class="card p-5 border-blue-200 bg-blue-50/70" role="status" aria-live="assertive">
              <div class="flex items-center gap-3 text-blue-900">
                <LucideLoader2 class="animate-spin shrink-0" :size="20" />
                <div>
                  <strong class="block">Emitiendo CFDI...</strong>
                  <span class="text-sm">No cierres esta ventana hasta recibir el folio o un mensaje de error.</span>
                </div>
              </div>
            </div>

            <div v-if="submissionError" ref="submissionErrorRef" class="card p-5 border-red-200 bg-red-50/70" role="alert" aria-live="assertive" tabindex="-1">
              <div class="flex items-start gap-3 text-red-900">
                <LucideXCircle class="shrink-0 mt-0.5" :size="20" />
                <div class="min-w-0">
                  <h3 class="m-0 text-sm font-bold">{{ submissionError.title }}</h3>
                  <p class="m-0 mt-1 text-sm">{{ submissionError.message }}</p>
                  <ul v-if="submissionError.details.length" class="mt-2 mb-0 list-disc pl-5 text-xs">
                    <li v-for="detail in submissionError.details" :key="detail">{{ detail }}</li>
                  </ul>
                </div>
              </div>
            </div>

          <div v-if="invoiceStage === 'prepare' && !loading && validationIssues.length" class="card p-4 border-amber-200 bg-amber-50/70">
            <div class="flex items-start gap-3">
              <LucideAlertTriangle class="text-amber-600 shrink-0 mt-0.5" :size="18" />
              <div>
                <h3 class="text-sm font-bold text-amber-900 m-0">Revisa la información</h3>
                <ul class="text-xs text-amber-900 mt-2 list-disc pl-5 space-y-1">
                  <li v-for="issue in validationIssues" :key="issue">{{ issue }}</li>
                </ul>
              </div>
            </div>
          </div>

          <template v-if="invoiceStage === 'prepare'">
          <div class="card p-5">
            <h3 class="text-xs font-bold text-brand-teal uppercase tracking-wide mb-4 border-b border-gray-100 pb-2">Datos fiscales</h3>
            <div class="grid grid-cols-12 gap-4">
              <div class="col-span-12 md:col-span-8 form-group mb-0">
                <label class="form-label">Razón social</label>
                <input type="text" v-model.trim="form.legal_name" class="input-field" required autocomplete="off">
              </div>
              <div class="col-span-12 md:col-span-4 form-group mb-0">
                <label class="form-label">RFC</label>
                <input type="text" v-model.trim="form.tax_id" class="input-field uppercase font-mono" required @input="form.tax_id = form.tax_id.toUpperCase()" autocomplete="off">
              </div>
              <div class="col-span-12 md:col-span-6 form-group mb-0">
                <label class="form-label">Email</label>
                <input type="email" v-model.trim="form.email" class="input-field" required autocomplete="off">
              </div>
              <div class="col-span-12 md:col-span-2 form-group mb-0">
                <label class="form-label">C.P.</label>
                <input type="text" v-model.trim="form.zip" class="input-field font-mono" required autocomplete="off">
              </div>
              <div class="col-span-12 md:col-span-4 form-group mb-0">
                <label class="form-label">Régimen fiscal</label>
                <select v-model="form.tax_system" class="input-field" required>
                  <option v-for="system in taxSystems" :key="system.value" :value="system.value">{{ system.label }}</option>
                </select>
              </div>
              <div class="col-span-12 md:col-span-9 form-group mb-0">
                <label class="form-label">Uso de CFDI</label>
                <select v-model="form.invoice_use" class="input-field" required>
                  <option v-for="option in invoiceUseOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </div>
              <div class="col-span-12 md:col-span-3 form-group mb-0">
                <label class="form-label">Fecha de emisión</label>
                <input
                  v-model="invoiceDateDay"
                  type="date"
                  class="input-field font-mono"
                  :min="invoiceDateMin"
                  :max="invoiceDateMax"
                  required
                >
              </div>
            </div>
          </div>

          <div class="card p-5">
            <h3 class="text-xs font-bold text-brand-campus uppercase tracking-wide mb-4 border-b border-gray-100 pb-2">Alumno</h3>
            <div class="grid grid-cols-12 gap-4">
              <div class="col-span-12 md:col-span-5 form-group mb-0">
                <label class="form-label">Alumno</label>
                <input type="text" v-model.trim="form.nombreCompleto" :readonly="ieduLocks.nombreCompleto" :class="['input-field', ieduLocks.nombreCompleto ? 'bg-gray-50 text-gray-600' : '']">
              </div>
              <div class="col-span-12 md:col-span-3 form-group mb-0">
                <label class="form-label">CURP</label>
                <input type="text" v-model.trim="form.CURP" :readonly="ieduLocks.CURP" :class="['input-field uppercase font-mono', ieduLocks.CURP ? 'bg-gray-50 text-gray-600' : '']" @input="form.CURP = normalizeCurpForInvoice(form.CURP)">
              </div>
              <div class="col-span-12 md:col-span-2 form-group mb-0">
                <label class="form-label">Nivel</label>
                <select v-model="form.nivelEducativo" class="input-field" :disabled="ieduLocks.nivelEducativo">
                  <option v-for="option in nivelEducativoOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </div>
              <div class="col-span-12 md:col-span-2 form-group mb-0">
                <label class="form-label">RVOE</label>
                <input type="text" v-model.trim="form.autRVOE" :readonly="ieduLocks.autRVOE" :class="['input-field font-mono', ieduLocks.autRVOE ? 'bg-gray-50 text-gray-600' : '']">
              </div>
            </div>
          </div>

          <div class="card p-5">
            <div class="flex justify-between items-start gap-4 mb-4 border-b border-gray-100 pb-2">
              <h3 class="text-xs font-bold text-gray-800 uppercase tracking-wide m-0">Conceptos</h3>
              <div class="text-right">
                <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wide block">Total</span>
                <span class="text-lg font-bold text-brand-campus font-mono">${{ legacyContext.total.toFixed(2) }}</span>
              </div>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-left text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th class="py-2 pr-3">Concepto</th>
                    <th class="py-2 px-3">Mes</th>
                    <th class="py-2 pl-3 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(concepto, index) in legacyContext.conceptos" :key="concepto.id || index" class="border-b border-gray-50 last:border-0">
                    <td class="py-2 pr-3 font-semibold text-gray-800">{{ concepto.conceptoNombre }}</td>
                    <td class="py-2 px-3 text-gray-500">{{ concepto.mesLabel || concepto.mes || '—' }}</td>
                    <td class="py-2 pl-3 text-right font-mono font-semibold text-brand-campus">${{ Number(concepto.monto || 0).toFixed(2) }}</td>
                  </tr>
                  <tr v-if="!legacyContext.conceptos.length">
                    <td colspan="3" class="py-6 text-center text-gray-400">No hay conceptos seleccionados.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          </template>

          <template v-else>
            <div class="card overflow-hidden">
              <div class="grid gap-px bg-gray-100 sm:grid-cols-2 lg:grid-cols-5">
                <div class="min-w-0 bg-white px-5 py-4 sm:col-span-2">
                  <span class="block text-[10px] font-bold uppercase tracking-wide text-gray-400">Receptor</span>
                  <span class="mt-1 block truncate text-sm font-bold text-gray-900">{{ form.legal_name }}</span>
                  <span class="mt-0.5 block truncate text-xs text-gray-500"><span class="font-mono">{{ form.tax_id }}</span> · {{ form.email }}</span>
                </div>
                <div class="min-w-0 bg-white px-5 py-4">
                  <span class="block text-[10px] font-bold uppercase tracking-wide text-gray-400">Uso CFDI</span>
                  <span class="mt-1 block truncate text-sm font-semibold text-gray-800">{{ form.invoice_use }}</span>
                  <span class="mt-0.5 block truncate text-xs text-gray-500">{{ selectedInvoiceUseLabel }}</span>
                </div>
                <div class="min-w-0 bg-white px-5 py-4">
                  <span class="block text-[10px] font-bold uppercase tracking-wide text-gray-400">Fecha</span>
                  <span class="mt-1 block font-mono text-sm font-semibold text-gray-800">{{ invoiceDateDay }}</span>
                </div>
                <div class="min-w-0 bg-white px-5 py-4">
                  <span class="block text-[10px] font-bold uppercase tracking-wide text-gray-400">Alumno</span>
                  <span class="mt-1 block truncate text-sm font-semibold text-gray-800">{{ form.nombreCompleto }}</span>
                  <span class="mt-0.5 block truncate font-mono text-xs text-gray-500">{{ form.CURP }}</span>
                </div>
              </div>
            </div>

            <div class="card overflow-hidden">
              <div class="flex items-end justify-between gap-4 border-b border-gray-100 px-5 py-4">
                <div>
                  <h3 class="m-0 text-xs font-bold uppercase tracking-wide text-gray-800">Conceptos en CFDI</h3>
                </div>
                <div class="text-right">
                  <span class="block text-[10px] font-bold uppercase tracking-wide text-gray-400">Total</span>
                  <span class="font-mono text-xl font-bold text-brand-campus">${{ reviewTotal.toFixed(2) }}</span>
                </div>
              </div>

              <div class="hidden grid-cols-12 gap-3 border-b border-gray-100 bg-gray-50/70 px-5 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-400 md:grid">
                <span class="col-span-8">Concepto</span>
                <span class="col-span-3 text-right">Monto</span>
              </div>

              <div class="divide-y divide-gray-100">
                <div
                  v-for="(item, index) in reviewItems"
                  :key="item.key"
                  class="grid grid-cols-12 items-start gap-3 px-5 py-4 transition-colors"
                  :class="isReviewItemChanged(item) ? 'bg-amber-50/35' : 'bg-white'"
                >
                  <div class="col-span-12 md:col-span-8">
                    <label class="sr-only" :for="`invoice-description-${index}`">Concepto en factura</label>
                    <input
                      :id="`invoice-description-${index}`"
                      v-model="item.description"
                      type="text"
                      :disabled="loading"
                      class="input-field font-semibold"
                      :class="!isReviewDescriptionValid(item) ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''"
                      :aria-invalid="!isReviewDescriptionValid(item)"
                      autocomplete="off"
                    >
                  </div>
                  <div class="col-span-10 md:col-span-3">
                    <label class="sr-only" :for="`invoice-amount-${index}`">Monto en factura</label>
                    <div class="relative">
                      <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-sm text-gray-400">$</span>
                      <input
                        :id="`invoice-amount-${index}`"
                        v-model.number="item.amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        inputmode="decimal"
                        :disabled="loading"
                        class="input-field pl-7 text-right font-mono font-semibold"
                        :class="!isReviewAmountValid(item) ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''"
                        :aria-invalid="!isReviewAmountValid(item)"
                      >
                    </div>
                  </div>
                  <div class="col-span-2 flex h-[42px] items-center justify-end md:col-span-1">
                    <button
                      v-if="isReviewItemChanged(item)"
                      type="button"
                      class="grid h-8 w-8 place-items-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                      title="Restaurar"
                      :aria-label="`Restaurar concepto ${index + 1}`"
                      :disabled="loading"
                      @click="restoreReviewItem(item)"
                    >
                      <LucideRotateCcw :size="15" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="card overflow-hidden">
              <div class="grid gap-px bg-gray-100 sm:grid-cols-2 lg:grid-cols-5">
                <div class="bg-white px-5 py-4">
                  <span class="block text-[10px] font-bold uppercase tracking-wide text-gray-400">Régimen</span>
                  <span class="mt-1 block font-mono text-sm font-semibold text-gray-800">{{ form.tax_system }}</span>
                </div>
                <div class="bg-white px-5 py-4">
                  <span class="block text-[10px] font-bold uppercase tracking-wide text-gray-400">C.P.</span>
                  <span class="mt-1 block font-mono text-sm font-semibold text-gray-800">{{ form.zip }}</span>
                </div>
                <div class="bg-white px-5 py-4">
                  <span class="block text-[10px] font-bold uppercase tracking-wide text-gray-400">Forma de pago</span>
                  <span class="mt-1 block text-sm font-semibold text-gray-800"><span class="font-mono">{{ legacyContext.paymentForm }}</span> · {{ legacyContext.primaryFormaDePago }}</span>
                </div>
                <div class="bg-white px-5 py-4">
                  <span class="block text-[10px] font-bold uppercase tracking-wide text-gray-400">Nivel</span>
                  <span class="mt-1 block text-sm font-semibold text-gray-800">{{ form.nivelEducativo }}</span>
                </div>
                <div class="bg-white px-5 py-4">
                  <span class="block text-[10px] font-bold uppercase tracking-wide text-gray-400">RVOE</span>
                  <span class="mt-1 block font-mono text-sm font-semibold text-gray-800">{{ form.autRVOE }}</span>
                </div>
              </div>
            </div>
          </template>
          </template>
        </div>

        <div class="modal-footer rounded-b-xl sticky bottom-0 z-10">
          <template v-if="generatedInvoice">
            <button class="btn btn-ghost" @click="requestClose" type="button" :disabled="emailing">Cerrar</button>
          </template>
          <template v-else-if="invoiceStage === 'prepare'">
            <button class="btn btn-ghost" @click="requestClose" type="button" :disabled="loading">Cancelar</button>
            <button class="btn btn-primary" @click="openReview" type="button" :disabled="loading || !canReview">Revisar factura</button>
          </template>
          <template v-else>
            <button class="btn btn-ghost" @click="returnToPrepare" type="button" :disabled="loading">Volver</button>
            <button class="btn btn-primary" @click="submit" type="button" :disabled="loading || !canSubmit">
              <LucideLoader2 v-if="loading" class="animate-spin" :size="16" />
              {{ loading ? 'Emitiendo...' : 'Emitir CFDI' }}
            </button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import {
  LucideAlertTriangle,
  LucideArchive,
  LucideCheckCircle,
  LucideXCircle,
  LucideFileDown,
  LucideFileText,
  LucideLoader2,
  LucideMail,
  LucideRotateCcw
} from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { useScrollLock } from '~/composables/useScrollLock'
import { studentNivelLabel } from '~/shared/utils/studentPresentation'
import {
  INVOICE_BASE_API_URL,
  defaultRvoeFor,
  determineReceiverType,
  escapeXml,
  getLocalISOStringNow,
  getUseOptions,
  inferNivelFromBase,
  isValidCURP,
  isValidEmail,
  isValidInvoiceDate,
  isValidRFC,
  nivelEducativoOptions,
  normalizeText,
  normalizeCurpForInvoice,
  resolveLegacyInvoiceContext,
  taxSystems,
  validateNivelEducativo
} from '~/utils/invoiceLegacy'

const props = defineProps({
  debts: { type: Array, default: () => [] },
  student: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['close', 'success'])

useModalEscape(() => {
  if (!loading.value && !emailing.value) emit('close')
})
const { show } = useToast()

useScrollLock()

const loading = ref(false)
const loadingCompany = ref(false)
const emailing = ref(false)
const invoiceStage = ref('prepare')
const generatedInvoice = ref(null)
const submissionError = ref(null)
const companyLoadError = ref('')
const emailFeedback = ref(null)
const modalOverlayRef = ref(null)
const resultPanelRef = ref(null)
const submissionErrorRef = ref(null)
const ieduLocks = ref({ nombreCompleto: false, CURP: false, nivelEducativo: false, autRVOE: false })

const requestClose = () => {
  if (!loading.value && !emailing.value) emit('close')
}

const normalizeErrorText = (value) => String(value || '').trim()

const requestErrorDetails = (error) => {
  const payload = error?.data?.data || error?.data || {}
  const status = Number(payload?.providerStatus || error?.statusCode || error?.status || 0)
  return status ? [`Código de respuesta: ${status}`] : []
}

const resolveRequestError = (error, fallback, title = 'No se pudo generar la factura') => {
  const payload = error?.data?.data || error?.data || {}
  const message = normalizeErrorText(
    payload?.providerMessage
    || payload?.message
    || payload?.error
    || error?.statusMessage
    || error?.message
    || fallback
  ) || fallback

  return { title, message, details: requestErrorDetails(error) }
}

const focusFeedback = async (target) => {
  await nextTick()
  target.value?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  target.value?.focus?.({ preventScroll: true })
}

const selectedNivelDefault = computed(() => inferNivelFromBase(props.student?.nivel) || studentNivelLabel(props.student))
const legacyContext = ref(resolveLegacyInvoiceContext({ student: props.student || {}, selectedConcepts: props.debts || [] }))

const makeReviewItems = () => legacyContext.value.conceptos.map((concepto, index) => {
  const description = normalizeText(concepto.conceptoNombre)
  const amount = Number(Number(concepto.monto || 0).toFixed(2))
  return {
    key: normalizeText(concepto.id) || `${concepto.documento || 'concepto'}-${concepto.mes || index}-${index}`,
    description,
    amount,
    originalDescription: description,
    originalAmount: amount
  }
})

const reviewItems = ref(makeReviewItems())

const isReviewDescriptionValid = (item) => Boolean(normalizeText(item?.description))
const normalizedReviewAmount = (value) => Number(Number(value || 0).toFixed(2))
const isReviewAmountValid = (item) => {
  const amount = normalizedReviewAmount(item?.amount)
  return Number.isFinite(amount) && amount >= 0.01
}

const isReviewItemChanged = (item) => (
  normalizeText(item?.description) !== normalizeText(item?.originalDescription)
  || normalizedReviewAmount(item?.amount) !== normalizedReviewAmount(item?.originalAmount)
)

const restoreReviewItem = (item) => {
  if (!item) return
  item.description = item.originalDescription
  item.amount = item.originalAmount
}

const reviewTotal = computed(() => Number(reviewItems.value.reduce((sum, item) => {
  const amount = normalizedReviewAmount(item?.amount)
  return sum + (Number.isFinite(amount) && amount >= 0.01 ? amount : 0)
}, 0).toFixed(2)))

const defaultInvoiceUseFor = (taxSystem) => {
  const available = getUseOptions(determineReceiverType(taxSystem))
  const codes = new Set(available.map(option => option.value))
  if (codes.has('D10')) return 'D10'
  if (codes.has('G03')) return 'G03'
  if (codes.has('S01')) return 'S01'
  return available[0]?.value || 'S01'
}

const form = ref({
  legal_name: '',
  tax_id: '',
  email: normalizeText(props.student?.correo),
  zip: '',
  tax_system: '616',
  invoice_use: defaultInvoiceUseFor('616'),
  invoiceDate: getLocalISOStringNow(),
  nombreCompleto: props.student?.nombreCompleto || '',
  CURP: normalizeCurpForInvoice(props.student?.curp || props.student?.CURP),
  nivelEducativo: validateNivelEducativo(selectedNivelDefault.value),
  autRVOE: ''
})

const localDatePart = (value) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const invoiceDateMax = localDatePart(new Date())
const invoiceDateMin = localDatePart(new Date(Date.now() - (72 * 60 * 60 * 1000)))
const invoiceDateDay = computed({
  get: () => normalizeText(form.value.invoiceDate).slice(0, 10),
  set: (value) => {
    const selectedDay = normalizeText(value)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDay)) {
      form.value.invoiceDate = ''
      return
    }

    const currentTime = normalizeText(form.value.invoiceDate).match(/T(\d{2}:\d{2})/)?.[1]
      || getLocalISOStringNow().slice(11, 16)
    form.value.invoiceDate = `${selectedDay}T${currentTime}`
  }
})

const invoiceUseOptions = computed(() => getUseOptions(determineReceiverType(form.value.tax_system)))
const selectedInvoiceUseLabel = computed(() => {
  const option = invoiceUseOptions.value.find(item => item.value === form.value.invoice_use)
  return normalizeText(option?.label).replace(new RegExp(`^${form.value.invoice_use}\\s*-\\s*`, 'i'), '')
})

watch(() => form.value.tax_system, (taxSystem) => {
  form.value.invoice_use = defaultInvoiceUseFor(taxSystem)
}, { immediate: true })

const validationIssues = computed(() => {
  const issues = legacyContext.value.blockingErrors.filter(issue => !/^Concepto\s+\d+:/i.test(issue))
  if (!form.value.legal_name) issues.push('Falta razón social.')
  if (!form.value.tax_id) issues.push('Falta RFC.')
  else if (!isValidRFC(form.value.tax_id)) issues.push('RFC inválido.')
  if (!form.value.email) issues.push('Falta email.')
  else if (!isValidEmail(form.value.email)) issues.push('Email inválido.')
  if (!form.value.zip) issues.push('Falta código postal.')
  if (!form.value.tax_system) issues.push('Falta régimen fiscal.')
  if (!form.value.invoice_use) issues.push('Falta uso de CFDI.')
  else if (!invoiceUseOptions.value.some(option => option.value === form.value.invoice_use)) issues.push('El uso de CFDI no corresponde al régimen fiscal seleccionado.')
  if (!form.value.nombreCompleto) issues.push('Falta nombre del alumno.')
  if (!form.value.CURP) issues.push('Falta CURP.')
  else if (!isValidCURP(form.value.CURP)) issues.push('CURP inválida.')
  if (!form.value.nivelEducativo) issues.push('Falta nivel educativo.')
  if (!form.value.autRVOE) issues.push('Falta RVOE.')
  if (!isValidInvoiceDate(form.value.invoiceDate)) issues.push('No se pudo preparar la fecha de emisión.')
  return Array.from(new Set(issues))
})

const reviewValidationIssues = computed(() => {
  const issues = []
  if (!reviewItems.value.length) issues.push('No hay conceptos para facturar.')
  reviewItems.value.forEach((item, index) => {
    if (!isReviewDescriptionValid(item)) issues.push(`Concepto ${index + 1}: falta descripción.`)
    if (!isReviewAmountValid(item)) issues.push(`Concepto ${index + 1}: revisa el monto.`)
  })
  return issues
})

const canReview = computed(() => !loadingCompany.value && validationIssues.value.length === 0)
const canSubmit = computed(() => canReview.value && reviewValidationIssues.value.length === 0)

const scrollModalTop = async () => {
  await nextTick()
  modalOverlayRef.value?.scrollTo?.({ top: 0, behavior: 'smooth' })
}

const openReview = async () => {
  if (!canReview.value) {
    const message = validationIssues.value[0] || 'Revisa la información.'
    submissionError.value = { title: 'Faltan datos para facturar', message, details: [] }
    show(message, 'danger')
    await focusFeedback(submissionErrorRef)
    return
  }
  submissionError.value = null
  invoiceStage.value = 'review'
  await scrollModalTop()
}

const returnToPrepare = async () => {
  if (loading.value) return
  submissionError.value = null
  invoiceStage.value = 'prepare'
  await scrollModalTop()
}

watch(() => [legacyContext.value.plantel, form.value.nivelEducativo], ([plantel, nivel]) => {
  if (!ieduLocks.value.autRVOE) {
    form.value.autRVOE = defaultRvoeFor(plantel, nivel) || legacyContext.value.defaultRvoe || form.value.autRVOE
  }
})

const lockIeduFromSources = (data = {}) => {
  const sourceNombre = normalizeText(data.nombreCompleto || data.nombreAlumno || props.student?.nombreCompleto)
  const sourceCurp = normalizeCurpForInvoice(data.CURP || props.student?.curp || props.student?.CURP)
  const sourceNivel = normalizeText(data.nivelEducativo || selectedNivelDefault.value)
  const sourceRvoe = normalizeText(data.autRVOE || defaultRvoeFor(legacyContext.value.plantel, sourceNivel))
  ieduLocks.value = {
    nombreCompleto: Boolean(sourceNombre),
    CURP: isValidCURP(sourceCurp),
    nivelEducativo: Boolean(sourceNivel),
    autRVOE: Boolean(sourceRvoe)
  }
}

const applyCompanyDefaults = (data = {}) => {
  form.value.legal_name = normalizeText(data.legal_name || form.value.legal_name)
  form.value.tax_id = normalizeText(data.tax_id || form.value.tax_id).toUpperCase()
  form.value.email = normalizeText(data.email || form.value.email || props.student?.correo)
  form.value.zip = normalizeText(data.zip || form.value.zip)
  form.value.tax_system = normalizeText(data.tax_system || form.value.tax_system || '616')
  form.value.nombreCompleto = normalizeText(data.nombreCompleto || data.nombreAlumno || form.value.nombreCompleto || props.student?.nombreCompleto)
  form.value.CURP = normalizeCurpForInvoice(data.CURP || form.value.CURP || props.student?.curp || props.student?.CURP)
  form.value.nivelEducativo = validateNivelEducativo(data.nivelEducativo || form.value.nivelEducativo || selectedNivelDefault.value)
  form.value.autRVOE = normalizeText(data.autRVOE || form.value.autRVOE || defaultRvoeFor(legacyContext.value.plantel, form.value.nivelEducativo))
  lockIeduFromSources(data)
}

onMounted(async () => {
  form.value.invoiceDate = getLocalISOStringNow()
  form.value.autRVOE = defaultRvoeFor(legacyContext.value.plantel, form.value.nivelEducativo)
  lockIeduFromSources({})

  if (!legacyContext.value.matricula) return
  loadingCompany.value = true
  try {
    const res = await $fetch(`${INVOICE_BASE_API_URL}/getCompanyData`, { params: { matricula: legacyContext.value.matricula } })
    if (res?.success && res?.data) applyCompanyDefaults(res.data)
  } catch (e) {
    const error = resolveRequestError(e, 'No se pudo consultar la información guardada.', 'No se pudieron cargar los datos fiscales')
    companyLoadError.value = error.message
    show(error.message, 'danger')
  } finally {
    loadingCompany.value = false
  }
})

const buildPayload = () => {
  const ctx = legacyContext.value
  const validatedNivel = validateNivelEducativo(form.value.nivelEducativo)
  const studentCurp = normalizeCurpForInvoice(form.value.CURP)
  const items = reviewItems.value.map(item => ({
    quantity: 1,
    product: {
      description: normalizeText(item.description),
      product_key: ctx.productKey,
      unit_key: 'E48',
      price: normalizedReviewAmount(item.amount),
      tax_included: true,
      taxability: '02',
      taxes: [{ type: 'IVA', rate: 0, factor: 'Exento' }]
    },
    complement: `<iedu:instEducativas xmlns:iedu="http://www.sat.gob.mx/iedu" version="1.0" nombreAlumno="${escapeXml(form.value.nombreCompleto)}" CURP="${escapeXml(studentCurp)}" nivelEducativo="${escapeXml(validatedNivel)}" autRVOE="${escapeXml(form.value.autRVOE)}" />`
  }))

  const sourcePayments = ctx.conceptos.map((concepto) => {
    const folio = Number(concepto.folio)
    const documento = Number(concepto.documento)
    return {
      folio: Number.isInteger(folio) && folio > 0 ? folio : null,
      folio_plantel: normalizeText(concepto.folio_plantel || concepto.external_id),
      documento: Number.isInteger(documento) && documento > 0 ? documento : null,
      matricula: ctx.matricula,
      ciclo: normalizeText(concepto.ciclo || props.student?.ciclo),
      concepto: normalizeText(concepto.conceptoNombre),
      monto: Number(concepto.monto || 0),
    }
  })

  return {
    localTracking: {
      matricula: ctx.matricula,
      plantel: ctx.plantel || props.student?.plantel || '',
      ciclo: normalizeText(ctx.conceptos.find((concepto) => concepto.ciclo)?.ciclo || props.student?.ciclo),
      sourcePayments,
    },
    companyData: {
      legal_name: form.value.legal_name,
      tax_id: form.value.tax_id.toUpperCase(),
      email: form.value.email,
      tax_system: form.value.tax_system,
      zip: form.value.zip,
      nombreCompleto: form.value.nombreCompleto,
      CURP: studentCurp,
      nivelEducativo: validatedNivel,
      autRVOE: form.value.autRVOE,
      ...(ctx.folioNumber !== null ? { folio_number: ctx.folioNumber } : {})
    },
    invoiceData: {
      customer: {
        matricula: ctx.matricula,
        legal_name: form.value.legal_name,
        tax_id: form.value.tax_id.toUpperCase(),
        email: form.value.email,
        tax_system: form.value.tax_system,
        address: { zip: form.value.zip }
      },
      items,
      use: form.value.invoice_use,
      payment_form: ctx.paymentForm,
      type: 'I',
      payment_method: 'PUE',
      currency: 'MXN',
      exchange: 1,
      date: new Date(form.value.invoiceDate).toISOString(),
      ...(ctx.seriesToSend ? { series: ctx.seriesToSend } : {}),
      ...(ctx.externalId ? { external_id: ctx.externalId } : {}),
      facturaCon: ctx.facturaCon,
      test_mode: false
    }
  }
}

const submit = async () => {
  if (!canSubmit.value) {
    const message = [...validationIssues.value, ...reviewValidationIssues.value][0] || 'Revisa la información.'
    submissionError.value = {
      title: 'Faltan datos para facturar',
      message,
      details: []
    }
    show(message, 'danger')
    await focusFeedback(submissionErrorRef)
    return
  }

  loading.value = true
  generatedInvoice.value = null
  submissionError.value = null
  emailFeedback.value = null

  try {
    const res = await $fetch(`${INVOICE_BASE_API_URL}/saveCompanyAndGenerate`, { method: 'POST', body: buildPayload() })
    if (!res?.success) {
      const error = resolveRequestError({ data: res }, 'El proveedor rechazó la solicitud de facturación.')
      submissionError.value = error
      show(error.message, 'danger')
      await focusFeedback(submissionErrorRef)
      return
    }

    const invoiceId = normalizeErrorText(res.invoice_id || res.factura?.id || res.data?.invoice_id || res.data?.factura?.id)
    if (!invoiceId) {
      const error = {
        title: 'Respuesta incompleta del proveedor',
        message: 'El proveedor indicó que la operación fue exitosa, pero no devolvió el identificador de la factura. No se puede confirmar ni descargar el CFDI desde esta pantalla.',
        details: ['No intentes generar otra factura hasta verificar la operación en el listado de facturas.']
      }
      submissionError.value = error
      show(error.message, 'danger', { duration: 8000 })
      await focusFeedback(submissionErrorRef)
      return
    }

    const series = normalizeErrorText(res.series || res.factura?.series || res.data?.series)
    const folioNumber = normalizeErrorText(res.folio_number || res.factura?.folio_number || res.data?.folio_number)
    const folio = normalizeErrorText(res.folio || res.factura?.folio || res.data?.folio || `${series}${folioNumber}`)

    generatedInvoice.value = {
      invoice_id: invoiceId,
      folio,
      email: form.value.email,
      localInvoiceId: res.local_invoice_id || null,
      indexWarning: res.local_indexed === false
        ? normalizeErrorText(res.local_index_warning || 'No se pudo guardar la factura en el historial local.')
        : '',
    }
    emit('success', generatedInvoice.value)
    await focusFeedback(resultPanelRef)
    show(folio ? `Factura generada. Folio ${folio}` : 'Factura generada correctamente.', 'success', { duration: 6000 })
  } catch (e) {
    const error = resolveRequestError(e, 'No se pudo generar la factura.')
    submissionError.value = error
    show(error.message, 'danger', { duration: 7000 })
    await focusFeedback(submissionErrorRef)
  } finally {
    loading.value = false
  }
}

const downloadUrl = (format) => `${INVOICE_BASE_API_URL}/downloadInvoice/${encodeURIComponent(generatedInvoice.value?.invoice_id || '')}/${format}?matricula=${encodeURIComponent(legacyContext.value.matricula)}`
const openDownload = (format) => {
  if (!generatedInvoice.value?.invoice_id) return
  window.open(downloadUrl(format), '_blank', 'noopener')
}

const sendGeneratedByEmail = async () => {
  if (!generatedInvoice.value?.invoice_id) return
  const email = window.prompt('Correo para enviar la factura:', generatedInvoice.value.email || form.value.email)
  if (email === null) return
  if (email && !isValidEmail(email)) {
    emailFeedback.value = { type: 'danger', message: 'El correo electrónico no es válido.' }
    show('Email inválido.', 'danger')
    return
  }

  emailing.value = true
  emailFeedback.value = null
  try {
    const res = await $fetch(`${INVOICE_BASE_API_URL}/sendInvoiceEmail`, {
      method: 'POST',
      body: { invoice_id: generatedInvoice.value.invoice_id, email: email || null, matricula: legacyContext.value.matricula }
    })
    if (res?.success === false) throw { data: res }

    generatedInvoice.value.email = email || generatedInvoice.value.email
    emailFeedback.value = { type: 'success', message: `Factura enviada a ${generatedInvoice.value.email || 'la dirección registrada'}.` }
    show('Factura enviada por correo.', 'success')
  } catch (e) {
    const error = resolveRequestError(e, 'No se pudo enviar la factura.', 'No se pudo enviar el correo')
    emailFeedback.value = { type: 'danger', message: error.message }
    show(error.message, 'danger', { duration: 6000 })
  } finally {
    emailing.value = false
  }
}

</script>
