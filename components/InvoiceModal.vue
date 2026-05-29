<template>
  <Teleport to="body">
    <div class="modal-overlay overflow-y-auto p-4" @click.self="$emit('close')">
      <div class="modal-container large w-full max-w-4xl h-auto my-auto">
        <div class="modal-header rounded-t-xl sticky top-0 z-10">
          <h2 class="text-lg font-bold text-gray-800">Facturación</h2>
        </div>

        <div class="modal-content p-6 space-y-4">
          <div v-if="loadingCompany" class="card p-4 text-sm text-gray-500 flex items-center gap-2">
            <LucideLoader2 class="animate-spin" :size="16" /> Cargando información...
          </div>

          <div v-if="generatedInvoice" class="card p-5 border-emerald-200 bg-emerald-50/60">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <span class="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Factura generada</span>
                <h3 class="text-xl font-bold text-gray-800 m-0">Folio {{ generatedInvoice.folio }}</h3>
              </div>
              <div class="flex flex-wrap gap-2">
                <button class="btn btn-outline" type="button" @click="openDownload('pdf')"><LucideFileDown :size="14" /> PDF</button>
                <button class="btn btn-outline" type="button" @click="openDownload('xml')"><LucideFileText :size="14" /> XML</button>
                <button class="btn btn-outline" type="button" @click="openDownload('zip')"><LucideArchive :size="14" /> ZIP</button>
                <button class="btn btn-primary" type="button" @click="sendGeneratedByEmail" :disabled="emailing">
                  <LucideLoader2 v-if="emailing" class="animate-spin" :size="14" />
                  <LucideMail v-else :size="14" /> Email
                </button>
              </div>
            </div>
          </div>

          <div v-if="validationIssues.length" class="card p-4 border-amber-200 bg-amber-50/70">
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
        </div>
        
        <div class="modal-footer rounded-b-xl sticky bottom-0 z-10">
          <button class="btn btn-ghost" @click="$emit('close')" type="button">Cerrar</button>
          <button class="btn btn-primary" @click="submit" :disabled="loading || !canSubmit">
            <LucideLoader2 v-if="loading" class="animate-spin" :size="16" />
            {{ loading ? 'Generando...' : 'Generar factura' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
  LucideAlertTriangle,
  LucideArchive,
  LucideFileDown,
  LucideFileText,
  LucideLoader2,
  LucideMail
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
const { show } = useToast()

useScrollLock()

const loading = ref(false)
const loadingCompany = ref(false)
const emailing = ref(false)
const generatedInvoice = ref(null)
const ieduLocks = ref({ nombreCompleto: false, CURP: false, nivelEducativo: false, autRVOE: false })

const selectedNivelDefault = computed(() => inferNivelFromBase(props.student?.nivel) || studentNivelLabel(props.student))
const legacyContext = computed(() => resolveLegacyInvoiceContext({ student: props.student || {}, selectedConcepts: props.debts || [] }))

const form = ref({
  legal_name: '',
  tax_id: '',
  email: normalizeText(props.student?.correo),
  zip: '',
  tax_system: '616',
  invoiceDate: getLocalISOStringNow(),
  nombreCompleto: props.student?.nombreCompleto || '',
  CURP: normalizeCurpForInvoice(props.student?.curp || props.student?.CURP),
  nivelEducativo: validateNivelEducativo(selectedNivelDefault.value),
  autRVOE: ''
})

const invoiceUse = computed(() => {
  const available = getUseOptions(determineReceiverType(form.value.tax_system))
  const codes = new Set(available.map(option => option.value))
  if (codes.has('D10')) return 'D10'
  if (codes.has('G03')) return 'G03'
  if (codes.has('S01')) return 'S01'
  return available[0]?.value || 'S01'
})

const validationIssues = computed(() => {
  const issues = [...legacyContext.value.blockingErrors]
  if (!form.value.legal_name) issues.push('Falta razón social.')
  if (!form.value.tax_id) issues.push('Falta RFC.')
  else if (!isValidRFC(form.value.tax_id)) issues.push('RFC inválido.')
  if (!form.value.email) issues.push('Falta email.')
  else if (!isValidEmail(form.value.email)) issues.push('Email inválido.')
  if (!form.value.zip) issues.push('Falta código postal.')
  if (!form.value.tax_system) issues.push('Falta régimen fiscal.')
  if (!form.value.nombreCompleto) issues.push('Falta nombre del alumno.')
  if (!form.value.CURP) issues.push('Falta CURP.')
  else if (!isValidCURP(form.value.CURP)) issues.push('CURP inválida.')
  if (!form.value.nivelEducativo) issues.push('Falta nivel educativo.')
  if (!form.value.autRVOE) issues.push('Falta RVOE.')
  if (!isValidInvoiceDate(form.value.invoiceDate)) issues.push('No se pudo preparar la fecha de emisión.')
  return Array.from(new Set(issues))
})

const canSubmit = computed(() => !loadingCompany.value && validationIssues.value.length === 0)

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
    show('No se pudo cargar la información.', 'danger')
  } finally {
    loadingCompany.value = false
  }
})

const buildPayload = () => {
  const ctx = legacyContext.value
  const validatedNivel = validateNivelEducativo(form.value.nivelEducativo)
  const studentCurp = normalizeCurpForInvoice(form.value.CURP)
  const items = ctx.conceptos.map(concepto => ({
    quantity: 1,
    product: {
      description: normalizeText(concepto.conceptoNombre),
      product_key: ctx.productKey,
      unit_key: 'E48',
      price: Number.parseFloat(concepto.monto),
      tax_included: true,
      taxability: '02',
      taxes: [{ type: 'IVA', rate: 0, factor: 'Exento' }]
    },
    complement: `<iedu:instEducativas xmlns:iedu="http://www.sat.gob.mx/iedu" version="1.0" nombreAlumno="${escapeXml(form.value.nombreCompleto)}" CURP="${escapeXml(studentCurp)}" nivelEducativo="${escapeXml(validatedNivel)}" autRVOE="${escapeXml(form.value.autRVOE)}" />`
  }))

  return {
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
      use: invoiceUse.value,
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
    show(validationIssues.value[0] || 'Revisa la información.', 'danger')
    return
  }

  loading.value = true
  generatedInvoice.value = null
  try {
    const res = await $fetch(`${INVOICE_BASE_API_URL}/saveCompanyAndGenerate`, { method: 'POST', body: buildPayload() })
    if (!res?.success) {
      show(res?.error || 'No se pudo generar la factura.', 'danger')
      return
    }

    const invoiceId = res.invoice_id || res.factura?.id
    generatedInvoice.value = {
      invoice_id: invoiceId,
      folio: res.folio || `${res.series || ''}${res.folio_number || ''}` || invoiceId,
      email: form.value.email
    }
    show(`Factura generada. Folio ${generatedInvoice.value.folio}`, 'success')
    emit('success')
  } catch (e) {
    show(e?.data?.message || e?.data?.error || 'No se pudo generar la factura.', 'danger')
  } finally {
    loading.value = false
  }
}

const downloadUrl = (format) => `${INVOICE_BASE_API_URL}/downloadInvoice/${encodeURIComponent(generatedInvoice.value?.invoice_id || '')}/${format}?matricula=${encodeURIComponent(legacyContext.value.matricula)}`
const openDownload = (format) => {
  if (!generatedInvoice.value?.invoice_id) return
  window.open(downloadUrl(format), '_blank')
}

const sendGeneratedByEmail = async () => {
  if (!generatedInvoice.value?.invoice_id) return
  const email = window.prompt('Correo para enviar la factura:', generatedInvoice.value.email || form.value.email)
  if (email === null) return
  if (email && !isValidEmail(email)) return show('Email inválido.', 'danger')

  emailing.value = true
  try {
    await $fetch(`${INVOICE_BASE_API_URL}/sendInvoiceEmail`, {
      method: 'POST',
      body: { invoice_id: generatedInvoice.value.invoice_id, email: email || null, matricula: legacyContext.value.matricula }
    })
    generatedInvoice.value.email = email || generatedInvoice.value.email
    show('Factura enviada por correo.', 'success')
  } catch (e) {
    show(e?.data?.message || 'No se pudo enviar la factura.', 'danger')
  } finally {
    emailing.value = false
  }
}
</script>
