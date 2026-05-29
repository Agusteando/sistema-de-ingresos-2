<template>
  <Teleport to="body">
    <div class="modal-overlay overflow-y-auto p-4" @click.self="$emit('close')">
      <div class="modal-container large w-full max-w-6xl h-auto my-auto">
        <div class="modal-header rounded-t-xl sticky top-0 z-10">
          <div>
            <h2 class="text-lg font-bold text-gray-800">Facturación CFDI del alumno</h2>
            <p class="text-xs text-gray-500 mt-1">Flujo legacy integrado al estado de cuenta: mismos endpoints, emisor, serie, forma de pago y complemento IEDU.</p>
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

          <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div class="card p-5 xl:col-span-2">
              <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4 border-b border-gray-100 pb-3">
                <div>
                  <h3 class="text-xs font-bold text-brand-teal uppercase tracking-wide m-0">Receptor / datos fiscales</h3>
                  <p class="text-xs text-gray-500 mt-1">Selecciona el responsable fiscal y completa lo que falte antes de timbrar.</p>
                </div>
                <button class="btn btn-ghost text-xs py-1 px-2" type="button" @click="openInvoiceSearch" :disabled="!form.tax_id">
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
                  <label class="form-label">Razón Social</label>
                  <input type="text" v-model.trim="form.legal_name" class="input-field" required>
                </div>
                <div class="col-span-12 md:col-span-4 form-group mb-0">
                  <label class="form-label">RFC</label>
                  <input type="text" v-model.trim="form.tax_id" class="input-field uppercase font-mono" required @input="form.tax_id = form.tax_id.toUpperCase()">
                </div>
                <div class="col-span-12 md:col-span-6 form-group mb-0">
                  <label class="form-label">Email</label>
                  <input type="email" v-model.trim="form.email" class="input-field" required>
                </div>
                <div class="col-span-12 md:col-span-2 form-group mb-0">
                  <label class="form-label">C.P.</label>
                  <input type="text" v-model.trim="form.zip" class="input-field font-mono" required>
                </div>
                <div class="col-span-12 md:col-span-4 form-group mb-0">
                  <label class="form-label">Régimen Fiscal</label>
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
                  <label class="form-label">Fecha/Hora</label>
                  <input type="datetime-local" v-model="form.invoiceDate" class="input-field font-mono text-gray-600" required>
                </div>
              </div>
            </div>

            <div class="card p-5">
              <h3 class="text-xs font-bold text-gray-800 uppercase tracking-wide mb-4 border-b border-gray-100 pb-2">Padres / tutores disponibles</h3>
              <div class="space-y-3 text-sm">
                <div class="rounded-xl border border-gray-200 p-3 bg-white">
                  <span class="text-[10px] font-bold uppercase tracking-wide text-gray-400">Padre / tutor</span>
                  <strong class="block text-gray-800 truncate">{{ parentSummary.father.name || 'Sin dato' }}</strong>
                  <small class="block text-xs text-gray-500 truncate">{{ parentSummary.father.email || 'correo pendiente' }}</small>
                </div>
                <div class="rounded-xl border border-gray-200 p-3 bg-white">
                  <span class="text-[10px] font-bold uppercase tracking-wide text-gray-400">Madre / tutora</span>
                  <strong class="block text-gray-800 truncate">{{ parentSummary.mother.name || 'Sin dato' }}</strong>
                  <small class="block text-xs text-gray-500 truncate">{{ parentSummary.mother.email || 'correo pendiente' }}</small>
                </div>
                <p class="text-xs text-gray-500 leading-relaxed">Estos datos se toman del expediente del alumno cuando existen. El RFC, régimen y CP se editan aquí y se envían al endpoint legacy al timbrar.</p>
              </div>
            </div>
          </div>

          <div class="card p-5">
            <h3 class="text-xs font-bold text-accent-sky uppercase tracking-wide mb-4 border-b border-gray-100 pb-2">Emisión legacy</h3>
            <div class="grid grid-cols-12 gap-4">
              <div class="col-span-12 md:col-span-3 form-group mb-0">
                <label class="form-label">Factura con</label>
                <select v-model="form.facturaCon" class="input-field">
                  <option value="IECS">IECS</option>
                  <option value="IEDIS">IEDIS</option>
                </select>
              </div>
              <div v-if="showSeriesControl" class="col-span-12 md:col-span-3 form-group mb-0">
                <label class="form-label">Serie</label>
                <select v-model="form.series" class="input-field">
                  <option value="PT">PT</option>
                  <option value="ST">ST</option>
                </select>
              </div>
              <div class="col-span-12 md:col-span-3 form-group mb-0">
                <label class="form-label">Clave SAT global</label>
                <input type="text" v-model.trim="form.productKeyGlobal" class="input-field font-mono" maxlength="8">
              </div>
              <div class="col-span-12 md:col-span-3 form-group mb-0">
                <label class="form-label">Forma de pago SAT</label>
                <input type="text" :value="`${mappedPaymentForm} · ${primaryFormaDePago}`" class="input-field font-mono bg-gray-50 text-gray-500" readonly>
              </div>
            </div>
            <p class="text-xs text-gray-500 mt-3">Serie visible solo para matrículas PT/ST. Igual que el legado, la serie se envía únicamente cuando la matrícula es PT.</p>
          </div>

          <div class="card p-5">
            <h3 class="text-xs font-bold text-brand-campus uppercase tracking-wide mb-4 border-b border-gray-100 pb-2">Complemento IEDU</h3>
            <div class="grid grid-cols-12 gap-4">
              <div class="col-span-12 md:col-span-5 form-group mb-0">
                <label class="form-label">Alumno</label>
                <input type="text" v-model.trim="form.nombreCompleto" class="input-field">
              </div>
              <div class="col-span-12 md:col-span-3 form-group mb-0">
                <label class="form-label">CURP</label>
                <input type="text" v-model.trim="form.CURP" class="input-field uppercase font-mono" @input="form.CURP = form.CURP.toUpperCase()">
              </div>
              <div class="col-span-12 md:col-span-2 form-group mb-0">
                <label class="form-label">Nivel</label>
                <select v-model="form.nivelEducativo" class="input-field">
                  <option v-for="option in nivelEducativoOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </div>
              <div class="col-span-12 md:col-span-2 form-group mb-0">
                <label class="form-label">RVOE</label>
                <input type="text" v-model.trim="form.autRVOE" class="input-field font-mono">
              </div>
            </div>
          </div>

          <div class="card p-5">
            <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
              <div>
                <h3 class="text-xs font-bold text-gray-800 uppercase tracking-wide m-0">Conceptos a facturar</h3>
                <p class="text-xs text-gray-500 mt-1">El folio plantel se conserva como external_id y para folio_number cuando existe.</p>
              </div>
              <button class="btn btn-ghost text-xs py-1 px-2" type="button" @click="addConcepto">+ Fila</button>
            </div>
            <div class="space-y-2">
              <div v-for="(c, i) in conceptos" :key="c.id || i" class="grid grid-cols-12 gap-3 items-center">
                <input type="text" v-model.trim="c.conceptoNombre" class="input-field col-span-12 md:col-span-6" placeholder="Concepto">
                <input type="number" step="0.01" min="0" v-model.number="c.monto" class="input-field col-span-6 md:col-span-2 text-right font-mono font-semibold text-brand-campus" placeholder="Monto">
                <input type="text" v-model.trim="c.folio_plantel" class="input-field col-span-5 md:col-span-3 font-mono" placeholder="Folio plantel">
                <button class="btn btn-ghost text-accent-coral px-2 col-span-1" type="button" @click="conceptos.splice(i, 1)"><LucideTrash2 :size="14"/></button>
              </div>
            </div>
            <div class="flex justify-end mt-4 pt-3 border-t border-gray-100">
              <div class="text-right">
                <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wide block">Total factura</span>
                <span class="text-lg font-bold text-brand-campus font-mono">${{ totalFactura.toFixed(2) }}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="modal-footer rounded-b-xl sticky bottom-0 z-10">
          <span class="text-xs text-gray-400 font-medium absolute left-6 top-5 hidden md:block"><LucideShieldCheck :size="14" class="inline mr-1"/> /api/saveCompanyAndGenerate</span>
          <button class="btn btn-ghost" @click="$emit('close')" type="button">Cerrar</button>
          <button class="btn btn-primary" @click="submit" :disabled="loading || conceptos.length === 0">
            <LucideLoader2 v-if="loading" class="animate-spin" :size="16" />
            {{ loading ? 'Timbrando...' : 'Guardar y facturar' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
  LucideArchive,
  LucideFileDown,
  LucideFileText,
  LucideLoader2,
  LucideMail,
  LucideSearch,
  LucideShieldCheck,
  LucideTrash2
} from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { useScrollLock } from '~/composables/useScrollLock'
import { studentNivelLabel } from '~/shared/utils/studentPresentation'
import {
  INVOICE_BASE_API_URL,
  buildFiscalProfiles,
  computeDefaultFacturaCon,
  computeDefaultProductKey,
  defaultRvoeFor,
  determineReceiverType,
  escapeXml,
  extractPlantelCode,
  getLocalISOStringNow,
  getUseOptions,
  inferNivelFromBase,
  isValidCURP,
  isValidEmail,
  isValidInvoiceDate,
  isValidRFC,
  mapPaymentForm,
  nivelEducativoOptions,
  normalizeInvoiceConcept,
  normalizeText,
  parseFolioNumber,
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
const conceptos = ref([])

const studentMatricula = computed(() => normalizeText(props.student?.matricula))
const matriculaPrefix = computed(() => studentMatricula.value.substring(0, 2).toUpperCase())
const selectedNivelDefault = computed(() => inferNivelFromBase(props.student?.nivel) || studentNivelLabel(props.student))

const form = ref({
  legal_name: '',
  tax_id: '',
  email: normalizeText(props.student?.correo),
  zip: '',
  tax_system: '616',
  use: 'D10',
  invoiceDate: getLocalISOStringNow(),
  facturaCon: computeDefaultFacturaCon(props.student?.matricula),
  series: matriculaPrefix.value === 'ST' ? 'ST' : 'PT',
  productKeyGlobal: '86121503',
  nombreCompleto: props.student?.nombreCompleto || '',
  CURP: (props.student?.curp || props.student?.CURP || '').toUpperCase(),
  nivelEducativo: validateNivelEducativo(selectedNivelDefault.value),
  autRVOE: ''
})

const fiscalProfiles = computed(() => buildFiscalProfiles(props.student || {}, companyData.value || {}))
const useOptions = computed(() => getUseOptions(determineReceiverType(form.value.tax_system)))
const showSeriesControl = computed(() => ['PT', 'ST'].includes(matriculaPrefix.value))
const totalFactura = computed(() => conceptos.value.reduce((sum, c) => sum + Number(c.monto || 0), 0))
const primaryFormaDePago = computed(() => normalizeText(conceptos.value.find(c => c.formaDePago)?.formaDePago || props.debts?.find?.(d => d?.formaDePago)?.formaDePago || 'Efectivo'))
const mappedPaymentForm = computed(() => mapPaymentForm(primaryFormaDePago.value))

const parentSummary = computed(() => {
  const profileMap = new Map(fiscalProfiles.value.map(profile => [profile.key, profile]))
  return {
    father: { name: profileMap.get('father')?.legal_name || '', email: profileMap.get('father')?.email || '' },
    mother: { name: profileMap.get('mother')?.legal_name || '', email: profileMap.get('mother')?.email || '' }
  }
})

const firstPlantel = computed(() => {
  const conceptPlantel = conceptos.value.map(extractPlantelCode).find(Boolean)
  return conceptPlantel || String(props.student?.plantel || '').trim().toUpperCase() || matriculaPrefix.value
})

watch(() => form.value.tax_system, () => {
  const validUses = new Set(useOptions.value.map(option => option.value))
  if (!validUses.has(form.value.use)) {
    form.value.use = validUses.has('D10') ? 'D10' : (useOptions.value[0]?.value || 'S01')
  }
})

watch(() => props.debts, () => {
  conceptos.value = (Array.isArray(props.debts) ? props.debts : []).map((debt, index) => {
    const normalized = normalizeInvoiceConcept(debt, index)
    return {
      ...normalized,
      plantel: normalized.plantel || String(props.student?.plantel || '').trim().toUpperCase()
    }
  })
  form.value.productKeyGlobal = computeDefaultProductKey(conceptos.value)
}, { immediate: true })

watch(firstPlantel, (plantel) => {
  if (!form.value.autRVOE) form.value.autRVOE = defaultRvoeFor(plantel, form.value.nivelEducativo)
}, { immediate: true })

const applyFiscalProfile = (profile) => {
  selectedFiscalProfile.value = profile.key
  if (profile.legal_name) form.value.legal_name = profile.legal_name
  if (profile.tax_id) form.value.tax_id = profile.tax_id.toUpperCase()
  if (profile.email) form.value.email = profile.email
  if (profile.zip) form.value.zip = profile.zip
  if (profile.tax_system) form.value.tax_system = profile.tax_system
}

const applyCompanyDefaults = (data = {}) => {
  companyData.value = data || {}
  form.value.legal_name = normalizeText(data.legal_name || form.value.legal_name)
  form.value.tax_id = normalizeText(data.tax_id || form.value.tax_id).toUpperCase()
  form.value.email = normalizeText(data.email || form.value.email || props.student?.correo)
  form.value.zip = normalizeText(data.zip || form.value.zip)
  form.value.tax_system = normalizeText(data.tax_system || form.value.tax_system || '616')
  form.value.facturaCon = normalizeText(data.factura_con || form.value.facturaCon || computeDefaultFacturaCon(studentMatricula.value))
  form.value.nombreCompleto = normalizeText(data.nombreCompleto || data.nombreAlumno || form.value.nombreCompleto || props.student?.nombreCompleto)
  form.value.CURP = normalizeText(data.CURP || form.value.CURP || props.student?.curp || props.student?.CURP).toUpperCase()
  form.value.nivelEducativo = validateNivelEducativo(data.nivelEducativo || form.value.nivelEducativo || selectedNivelDefault.value)
  form.value.autRVOE = normalizeText(data.autRVOE || form.value.autRVOE || defaultRvoeFor(firstPlantel.value, form.value.nivelEducativo))
  form.value.productKeyGlobal = computeDefaultProductKey(conceptos.value)

  const storedProfile = fiscalProfiles.value.find(profile => profile.key === 'stored')
  if (storedProfile) selectedFiscalProfile.value = 'stored'
}

onMounted(async () => {
  form.value.invoiceDate = getLocalISOStringNow()
  if (showSeriesControl.value) form.value.series = matriculaPrefix.value === 'ST' ? 'ST' : 'PT'
  form.value.facturaCon = computeDefaultFacturaCon(studentMatricula.value)
  form.value.autRVOE = defaultRvoeFor(firstPlantel.value, form.value.nivelEducativo)

  if (!studentMatricula.value) return
  loadingCompany.value = true
  try {
    const res = await $fetch(`${INVOICE_BASE_API_URL}/getCompanyData`, { params: { matricula: studentMatricula.value } })
    if (res?.success && res?.data) applyCompanyDefaults(res.data)
  } catch (e) {
    show('No se pudo cargar la información fiscal guardada', 'danger')
  } finally {
    loadingCompany.value = false
  }
})

const addConcepto = () => {
  conceptos.value.push({
    id: `manual-${Date.now()}`,
    conceptoNombre: 'Concepto Extraordinario',
    monto: 0,
    folio_plantel: '',
    plantel: firstPlantel.value
  })
}

const validateForm = () => {
  if (!form.value.legal_name || !form.value.tax_id || !form.value.email || !form.value.tax_system || !form.value.zip || !form.value.nombreCompleto || !form.value.CURP || !form.value.nivelEducativo || !form.value.autRVOE || !form.value.use) {
    show('Completa los campos fiscales, IEDU y uso CFDI requeridos.', 'danger')
    return false
  }
  if (!isValidRFC(form.value.tax_id)) return show('RFC inválido.', 'danger'), false
  if (!isValidEmail(form.value.email)) return show('Email inválido.', 'danger'), false
  if (!isValidInvoiceDate(form.value.invoiceDate)) return show('La fecha debe estar dentro de las últimas 72 horas y no puede estar en futuro.', 'danger'), false
  if (!isValidCURP(form.value.CURP)) return show('CURP inválida o faltante.', 'danger'), false
  if (!['IECS', 'IEDIS'].includes(form.value.facturaCon)) return show('Emisor inválido.', 'danger'), false
  if (matriculaPrefix.value === 'PT' && !form.value.series) return show('Seleccione serie.', 'danger'), false
  if (form.value.series && !['PT', 'ST'].includes(form.value.series.toUpperCase())) return show('Serie inválida.', 'danger'), false
  if (!/^\d{8}$/.test(form.value.productKeyGlobal)) return show('La clave SAT debe tener 8 dígitos.', 'danger'), false
  if (!conceptos.value.length) return show('Agrega al menos un concepto.', 'danger'), false
  for (const [index, concepto] of conceptos.value.entries()) {
    if (!normalizeText(concepto.conceptoNombre)) return show(`Concepto ${index + 1}: descripción requerida.`, 'danger'), false
    if (!Number.isFinite(Number(concepto.monto)) || Number(concepto.monto) <= 0) return show(`Concepto ${index + 1}: monto inválido.`, 'danger'), false
  }
  return true
}

const buildPayload = () => {
  const folioPlantelRaw = normalizeText(conceptos.value.find(c => c.folio_plantel)?.folio_plantel || '')
  const folioNumberInt = parseFolioNumber(folioPlantelRaw)
  const validatedNivel = validateNivelEducativo(form.value.nivelEducativo)
  const seriesToSend = matriculaPrefix.value === 'PT' ? form.value.series.toUpperCase() : ''

  const items = conceptos.value.map(concepto => ({
    quantity: 1,
    product: {
      description: normalizeText(concepto.conceptoNombre),
      product_key: form.value.productKeyGlobal,
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
      ...(folioNumberInt !== null ? { folio_number: folioNumberInt } : {})
    },
    invoiceData: {
      customer: {
        matricula: studentMatricula.value,
        legal_name: form.value.legal_name,
        tax_id: form.value.tax_id.toUpperCase(),
        email: form.value.email,
        tax_system: form.value.tax_system,
        address: { zip: form.value.zip }
      },
      items,
      use: form.value.use,
      payment_form: mappedPaymentForm.value,
      type: 'I',
      payment_method: 'PUE',
      currency: 'MXN',
      exchange: 1,
      date: new Date(form.value.invoiceDate).toISOString(),
      ...(seriesToSend ? { series: seriesToSend } : {}),
      ...(folioPlantelRaw ? { external_id: folioPlantelRaw } : {}),
      facturaCon: form.value.facturaCon,
      test_mode: false
    }
  }
}

const submit = async () => {
  if (!validateForm()) return

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
  } catch (e) {
    show(e?.data?.message || e?.data?.error || 'Error de comunicación con CFDI.', 'danger')
  } finally {
    loading.value = false
  }
}

const downloadUrl = (format) => `${INVOICE_BASE_API_URL}/downloadInvoice/${encodeURIComponent(generatedInvoice.value?.invoice_id || '')}/${format}?matricula=${encodeURIComponent(studentMatricula.value)}`
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
      body: { invoice_id: generatedInvoice.value.invoice_id, email: email || null, matricula: studentMatricula.value }
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
  const params = new URLSearchParams({ tax_id: taxId, matricula: studentMatricula.value })
  window.open(`/facturas?${params.toString()}`, '_blank')
}
</script>
