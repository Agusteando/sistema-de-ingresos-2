<template>
  <Teleport to="body">
    <div class="modal-overlay overflow-y-auto p-4" @click.self="$emit('close')">
      <div class="modal-container large w-full max-w-6xl h-auto my-auto">
        <div class="modal-header rounded-t-xl sticky top-0 z-10">
          <div>
            <h2 class="text-lg font-bold text-gray-800">Facturar alumno</h2>
            <p class="text-xs text-gray-500 mt-1">Flujo operativo legacy: selecciona receptor fiscal, confirma los datos y timbra con serie, folio, emisor, clave SAT y conceptos calculados por el sistema.</p>
          </div>
        </div>

        <div class="modal-content p-6 space-y-4">
          <div v-if="loadingCompany" class="card p-4 text-sm text-gray-500 flex items-center gap-2">
            <LucideLoader2 class="animate-spin" :size="16" /> Cargando información fiscal guardada...
          </div>

          <div v-if="generatedInvoice" class="card p-5 border-emerald-200 bg-emerald-50/60">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <span class="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Factura timbrada</span>
                <h3 class="text-xl font-bold text-gray-800 m-0">Folio {{ generatedInvoice.folio }}</h3>
                <p class="text-xs text-gray-500 mt-1">UUID / ID: <span class="font-mono">{{ generatedInvoice.invoice_id }}</span></p>
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

          <div v-if="operationalIssues.length" class="card p-4 border-amber-200 bg-amber-50/70">
            <div class="flex items-start gap-3">
              <LucideAlertTriangle class="text-amber-600 shrink-0 mt-0.5" :size="18" />
              <div>
                <h3 class="text-sm font-bold text-amber-900 m-0">No se puede timbrar todavía</h3>
                <p class="text-xs text-amber-800 mt-1">Los datos operativos no son editables aquí. Corrige el pago, concepto o expediente origen.</p>
                <ul class="text-xs text-amber-900 mt-2 list-disc pl-5 space-y-1">
                  <li v-for="issue in operationalIssues" :key="issue">{{ issue }}</li>
                </ul>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div class="card p-5 xl:col-span-2">
              <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4 border-b border-gray-100 pb-3">
                <div>
                  <h3 class="text-xs font-bold text-brand-teal uppercase tracking-wide m-0">1. Receptor fiscal</h3>
                  <p class="text-xs text-gray-500 mt-1">Elige el responsable y completa únicamente sus datos fiscales faltantes.</p>
                </div>
                <button class="btn btn-ghost text-xs py-1 px-2" type="button" @click="openInvoiceSearch" :disabled="!isValidRFC(form.tax_id)">
                  <LucideSearch :size="14" /> Ver facturas del RFC
                </button>
              </div>

              <div v-if="fiscalProfiles.length" class="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
                <button
                  v-for="profile in fiscalProfiles"
                  :key="profile.key"
                  type="button"
                  :class="['text-left rounded-xl border px-3 py-2 transition bg-white hover:border-brand-teal', selectedFiscalProfile === profile.key ? 'border-brand-teal ring-2 ring-brand-teal/10' : 'border-gray-200']"
                  @click="applyFiscalProfile(profile)"
                >
                  <span class="text-[10px] font-bold uppercase tracking-wide text-gray-500">{{ profile.label }}</span>
                  <strong class="block text-sm text-gray-800 truncate mt-0.5">{{ profile.legal_name || 'Sin nombre' }}</strong>
                  <small class="block text-xs text-gray-500 truncate">{{ profile.tax_id || 'RFC pendiente' }} · {{ profile.email || 'correo pendiente' }}</small>
                </button>
              </div>

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
                <div class="col-span-12 md:col-span-6 form-group mb-0">
                  <label class="form-label">Uso de CFDI</label>
                  <select v-model="form.use" class="input-field" required>
                    <option v-for="option in useOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                </div>
                <div class="col-span-12 md:col-span-6 form-group mb-0">
                  <label class="form-label">Fecha/Hora de emisión</label>
                  <input type="datetime-local" v-model="form.invoiceDate" class="input-field font-mono bg-gray-50 text-gray-600" readonly>
                  <p class="text-[11px] text-gray-400 mt-1">La fecha se toma automáticamente al abrir el flujo; se valida contra la regla legacy de 72 horas.</p>
                </div>
              </div>
            </div>

            <div class="card p-5">
              <h3 class="text-xs font-bold text-accent-sky uppercase tracking-wide mb-4 border-b border-gray-100 pb-2">2. Reglas legacy aplicadas</h3>
              <dl class="space-y-3 text-sm">
                <div class="flex justify-between gap-3"><dt class="text-gray-500">Matrícula</dt><dd class="font-mono font-semibold text-gray-800">{{ legacyContext.matricula || '—' }}</dd></div>
                <div class="flex justify-between gap-3"><dt class="text-gray-500">Plantel</dt><dd class="font-mono font-semibold text-gray-800">{{ legacyContext.plantel || '—' }}</dd></div>
                <div class="flex justify-between gap-3"><dt class="text-gray-500">Factura con</dt><dd class="font-mono font-semibold text-gray-800">{{ legacyContext.facturaCon || '—' }}</dd></div>
                <div class="flex justify-between gap-3"><dt class="text-gray-500">Serie enviada</dt><dd class="font-mono font-semibold text-gray-800 text-right">{{ legacyContext.seriesLabel }}</dd></div>
                <div class="flex justify-between gap-3"><dt class="text-gray-500">Folio plantel</dt><dd class="font-mono font-semibold text-gray-800 text-right">{{ legacyContext.folioPlantelRaw || '—' }}</dd></div>
                <div class="flex justify-between gap-3"><dt class="text-gray-500">folio_number</dt><dd class="font-mono font-semibold text-gray-800">{{ legacyContext.folioNumber ?? '—' }}</dd></div>
                <div class="flex justify-between gap-3"><dt class="text-gray-500">Clave SAT</dt><dd class="font-mono font-semibold text-gray-800">{{ legacyContext.productKey || '—' }}</dd></div>
                <div class="flex justify-between gap-3"><dt class="text-gray-500">Forma SAT</dt><dd class="font-mono font-semibold text-gray-800">{{ legacyContext.paymentForm }} · {{ legacyContext.primaryFormaDePago }}</dd></div>
              </dl>
              <p class="text-xs text-gray-500 mt-4 leading-relaxed">Estos valores no se capturan manualmente. Se resuelven desde matrícula, plantel, folio del pago/concepto y forma de pago origen.</p>
            </div>
          </div>

          <div class="card p-5">
            <h3 class="text-xs font-bold text-brand-campus uppercase tracking-wide mb-4 border-b border-gray-100 pb-2">3. Alumno / complemento IEDU</h3>
            <div class="grid grid-cols-12 gap-4">
              <div class="col-span-12 md:col-span-5 form-group mb-0">
                <label class="form-label">Alumno</label>
                <input type="text" v-model.trim="form.nombreCompleto" :readonly="ieduLocks.nombreCompleto" :class="['input-field', ieduLocks.nombreCompleto ? 'bg-gray-50 text-gray-600' : '']">
              </div>
              <div class="col-span-12 md:col-span-3 form-group mb-0">
                <label class="form-label">CURP</label>
                <input type="text" v-model.trim="form.CURP" :readonly="ieduLocks.CURP" :class="['input-field uppercase font-mono', ieduLocks.CURP ? 'bg-gray-50 text-gray-600' : '']" @input="form.CURP = form.CURP.toUpperCase()">
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
            <p class="text-xs text-gray-500 mt-3">Los datos IEDU se precargan desde el expediente o el perfil legacy. Solo quedan editables cuando faltan.</p>
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div class="card p-5 xl:col-span-2">
              <div class="flex justify-between items-start gap-4 mb-4 border-b border-gray-100 pb-2">
                <div>
                  <h3 class="text-xs font-bold text-gray-800 uppercase tracking-wide m-0">4. Conceptos a facturar</h3>
                  <p class="text-xs text-gray-500 mt-1">Lista bloqueada desde la selección del estado de cuenta o historial de pagos.</p>
                </div>
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
                      <th class="py-2 px-3">Folio plantel</th>
                      <th class="py-2 px-3">Plantel</th>
                      <th class="py-2 pl-3 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(concepto, index) in legacyContext.conceptos" :key="concepto.id || index" class="border-b border-gray-50 last:border-0">
                      <td class="py-2 pr-3 font-semibold text-gray-800">{{ concepto.conceptoNombre }}</td>
                      <td class="py-2 px-3 text-gray-500">{{ concepto.mesLabel || concepto.mes || '—' }}</td>
                      <td class="py-2 px-3 font-mono text-gray-600">{{ concepto.folio_plantel || '—' }}</td>
                      <td class="py-2 px-3 font-mono text-gray-600">{{ concepto.plantel || '—' }}</td>
                      <td class="py-2 pl-3 text-right font-mono font-semibold text-brand-campus">${{ Number(concepto.monto || 0).toFixed(2) }}</td>
                    </tr>
                    <tr v-if="!legacyContext.conceptos.length">
                      <td colspan="5" class="py-6 text-center text-gray-400">No hay conceptos seleccionados.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="card p-5">
              <h3 class="text-xs font-bold text-gray-800 uppercase tracking-wide mb-4 border-b border-gray-100 pb-2">Checklist de timbrado</h3>
              <div v-if="validationIssues.length" class="space-y-2">
                <div v-for="issue in validationIssues" :key="issue" class="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <LucideAlertTriangle :size="14" class="shrink-0 mt-0.5" />
                  <span>{{ issue }}</span>
                </div>
              </div>
              <div v-else class="flex items-start gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                <LucideShieldCheck :size="14" class="shrink-0 mt-0.5" />
                <span>Listo para timbrar con los valores legacy resueltos automáticamente.</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="modal-footer rounded-b-xl sticky bottom-0 z-10">
          <span class="text-xs text-gray-400 font-medium absolute left-6 top-5 hidden md:block"><LucideShieldCheck :size="14" class="inline mr-1"/> /api/saveCompanyAndGenerate</span>
          <button class="btn btn-ghost" @click="$emit('close')" type="button">Cerrar</button>
          <button class="btn btn-primary" @click="submit" :disabled="loading || !canSubmit">
            <LucideLoader2 v-if="loading" class="animate-spin" :size="16" />
            {{ loading ? 'Timbrando...' : 'Confirmar y facturar' }}
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
  LucideMail,
  LucideSearch,
  LucideShieldCheck
} from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { useScrollLock } from '~/composables/useScrollLock'
import { studentNivelLabel } from '~/shared/utils/studentPresentation'
import {
  INVOICE_BASE_API_URL,
  buildFiscalProfiles,
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
const companyData = ref({})
const selectedFiscalProfile = ref('stored')
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
  use: 'D10',
  invoiceDate: getLocalISOStringNow(),
  nombreCompleto: props.student?.nombreCompleto || '',
  CURP: (props.student?.curp || props.student?.CURP || '').toUpperCase(),
  nivelEducativo: validateNivelEducativo(selectedNivelDefault.value),
  autRVOE: ''
})

const fiscalProfiles = computed(() => buildFiscalProfiles(props.student || {}, companyData.value || {}))
const useOptions = computed(() => getUseOptions(determineReceiverType(form.value.tax_system)))
const operationalIssues = computed(() => legacyContext.value.blockingErrors)

const validationIssues = computed(() => {
  const issues = [...operationalIssues.value]
  if (!form.value.legal_name) issues.push('Falta razón social del receptor fiscal.')
  if (!form.value.tax_id) issues.push('Falta RFC del receptor fiscal.')
  else if (!isValidRFC(form.value.tax_id)) issues.push('RFC inválido.')
  if (!form.value.email) issues.push('Falta email del receptor fiscal.')
  else if (!isValidEmail(form.value.email)) issues.push('Email inválido.')
  if (!form.value.zip) issues.push('Falta código postal del receptor fiscal.')
  if (!form.value.tax_system) issues.push('Falta régimen fiscal del receptor.')
  if (!form.value.use) issues.push('Falta uso de CFDI.')
  if (!form.value.nombreCompleto) issues.push('Falta nombre del alumno para complemento IEDU.')
  if (!form.value.CURP) issues.push('Falta CURP del alumno para complemento IEDU.')
  else if (!isValidCURP(form.value.CURP)) issues.push('CURP inválida.')
  if (!form.value.nivelEducativo) issues.push('Falta nivel educativo para complemento IEDU.')
  if (!form.value.autRVOE) issues.push('Falta RVOE para complemento IEDU.')
  if (!isValidInvoiceDate(form.value.invoiceDate)) issues.push('La fecha debe estar dentro de las últimas 72 horas y no puede estar en futuro.')
  return Array.from(new Set(issues))
})

const canSubmit = computed(() => !loadingCompany.value && validationIssues.value.length === 0)

watch(() => form.value.tax_system, () => {
  const validUses = new Set(useOptions.value.map(option => option.value))
  if (!validUses.has(form.value.use)) {
    form.value.use = validUses.has('D10') ? 'D10' : (validUses.has('G03') ? 'G03' : (useOptions.value[0]?.value || 'S01'))
  }
})

watch(() => [legacyContext.value.plantel, form.value.nivelEducativo], ([plantel, nivel]) => {
  if (!ieduLocks.value.autRVOE) {
    form.value.autRVOE = defaultRvoeFor(plantel, nivel) || legacyContext.value.defaultRvoe || form.value.autRVOE
  }
})

const lockIeduFromSources = (data = {}) => {
  const sourceNombre = normalizeText(data.nombreCompleto || data.nombreAlumno || props.student?.nombreCompleto)
  const sourceCurp = normalizeText(data.CURP || props.student?.curp || props.student?.CURP).toUpperCase()
  const sourceNivel = normalizeText(data.nivelEducativo || selectedNivelDefault.value)
  const sourceRvoe = normalizeText(data.autRVOE || defaultRvoeFor(legacyContext.value.plantel, sourceNivel))
  ieduLocks.value = {
    nombreCompleto: Boolean(sourceNombre),
    CURP: isValidCURP(sourceCurp),
    nivelEducativo: Boolean(sourceNivel),
    autRVOE: Boolean(sourceRvoe)
  }
}

const applyFiscalProfile = (profile) => {
  selectedFiscalProfile.value = profile.key
  form.value.legal_name = profile.legal_name || ''
  form.value.tax_id = (profile.tax_id || '').toUpperCase()
  form.value.email = profile.email || ''
  form.value.zip = profile.zip || ''
  form.value.tax_system = profile.tax_system || '616'
}

const applyCompanyDefaults = (data = {}) => {
  companyData.value = data || {}
  form.value.legal_name = normalizeText(data.legal_name || form.value.legal_name)
  form.value.tax_id = normalizeText(data.tax_id || form.value.tax_id).toUpperCase()
  form.value.email = normalizeText(data.email || form.value.email || props.student?.correo)
  form.value.zip = normalizeText(data.zip || form.value.zip)
  form.value.tax_system = normalizeText(data.tax_system || form.value.tax_system || '616')
  form.value.nombreCompleto = normalizeText(data.nombreCompleto || data.nombreAlumno || form.value.nombreCompleto || props.student?.nombreCompleto)
  form.value.CURP = normalizeText(data.CURP || form.value.CURP || props.student?.curp || props.student?.CURP).toUpperCase()
  form.value.nivelEducativo = validateNivelEducativo(data.nivelEducativo || form.value.nivelEducativo || selectedNivelDefault.value)
  form.value.autRVOE = normalizeText(data.autRVOE || form.value.autRVOE || defaultRvoeFor(legacyContext.value.plantel, form.value.nivelEducativo))
  lockIeduFromSources(data)

  const storedProfile = fiscalProfiles.value.find(profile => profile.key === 'stored')
  if (storedProfile) selectedFiscalProfile.value = 'stored'
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
    show('No se pudo cargar la información fiscal guardada', 'danger')
  } finally {
    loadingCompany.value = false
  }
})

const buildPayload = () => {
  const ctx = legacyContext.value
  const validatedNivel = validateNivelEducativo(form.value.nivelEducativo)
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
    complement: `<iedu:instEducativas xmlns:iedu="http://www.sat.gob.mx/iedu" version="1.0" nombreAlumno="${escapeXml(form.value.nombreCompleto)}" CURP="${escapeXml(form.value.CURP)}" nivelEducativo="${escapeXml(validatedNivel)}" autRVOE="${escapeXml(form.value.autRVOE)}" />`
  }))

  return {
    companyData: {
      legal_name: form.value.legal_name,
      tax_id: form.value.tax_id.toUpperCase(),
      email: form.value.email,
      tax_system: form.value.tax_system,
      zip: form.value.zip,
      nombreCompleto: form.value.nombreCompleto,
      CURP: form.value.CURP.toUpperCase(),
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
      use: form.value.use,
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
    show(validationIssues.value[0] || 'No se puede timbrar con datos incompletos.', 'danger')
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
    show(`Factura timbrada. Folio ${generatedInvoice.value.folio}`, 'success')
    emit('success')
  } catch (e) {
    show(e?.data?.message || e?.data?.error || 'Error de comunicación con CFDI.', 'danger')
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
  const email = window.prompt('Ingresa el correo para enviar la factura:', generatedInvoice.value.email || form.value.email)
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
    show(e?.data?.message || 'No se pudo enviar la factura por correo.', 'danger')
  } finally {
    emailing.value = false
  }
}

const openInvoiceSearch = () => {
  const taxId = form.value.tax_id?.toUpperCase()
  if (!taxId || !isValidRFC(taxId)) return show('RFC inválido para listar facturas.', 'danger')
  const params = new URLSearchParams({ tax_id: taxId, matricula: legacyContext.value.matricula })
  window.open(`/facturas?${params.toString()}`, '_blank')
}
</script>
