export type InvoiceConceptInput = Record<string, any>

export const INVOICE_BASE_API_URL = '/api'

export const legacyInvoiceConfig = {
  folioPrefixMap: {
    PT: '01', PM: '02', ST: '03', SM: '04',
    CT: '05', CM: '06', DM: '07', CO: '08', DC: '09', PR: '10'
  } as Record<string, string>,
  productKey: {
    default: '86121503',
    overrideByPlantel: {
      CT: '86121501', CM: '86121501', CO: '86121501', DM: '86121501', DC: '86121501', PR: '86121501'
    } as Record<string, string>
  },
  facturaCon: {
    iedisPrefixes: new Set(['PT', 'PM', 'SM', 'ST', 'DM']),
    fallback: 'IECS'
  },
  plantelToRVOE: {
    ST: '15PJN0911K', PT: '15PJN0911K', SM: '15PES1050L', PM: '15PPR3271Q',
    DM: '15PJN0912J', CM: '15PJN0912J', CT: '15PJN0810M', CO: '', DC: '', PR: '', PREEM: '15PJN0912J'
  } as Record<string, string>
}

export const plantelCodes = Object.keys(legacyInvoiceConfig.folioPrefixMap)
const plantelRegexBounded = new RegExp(`\\b(${plantelCodes.join('|')})\\b`, 'i')
const plantelRegexLoose = new RegExp(`(${plantelCodes.join('|')})`, 'i')

export const taxSystems = [
  { value: '', label: 'Seleccione un Régimen Fiscal' },
  { value: '601', label: '601 - General de Ley Personas Morales' },
  { value: '603', label: '603 - Personas Morales con Fines no Lucrativos' },
  { value: '605', label: '605 - Sueldos y Salarios e Ingresos Asimilados' },
  { value: '606', label: '606 - Arrendamiento' },
  { value: '607', label: '607 - Enajenación o Adquisición de Bienes' },
  { value: '608', label: '608 - Demás ingresos' },
  { value: '610', label: '610 - Residentes en el Extranjero' },
  { value: '611', label: '611 - Ingresos por Dividendos' },
  { value: '612', label: '612 - PF con Actividades Empresariales' },
  { value: '614', label: '614 - Ingresos por intereses' },
  { value: '615', label: '615 - Premios' },
  { value: '616', label: '616 - Sin obligaciones fiscales' },
  { value: '620', label: '620 - Soc. Cooperativas de Producción' },
  { value: '621', label: '621 - Incorporación Fiscal' },
  { value: '622', label: '622 - Actividades AGAPES' },
  { value: '623', label: '623 - Opcional para Grupos' },
  { value: '624', label: '624 - Coordinados' },
  { value: '625', label: '625 - Plataformas' },
  { value: '626', label: '626 - RESICO' }
]

export const nivelEducativoOptions = [
  { value: '', label: 'Seleccione un Nivel Educativo' },
  { value: 'Preescolar', label: 'Preescolar' },
  { value: 'Primaria', label: 'Primaria' },
  { value: 'Secundaria', label: 'Secundaria' },
  { value: 'Profesional técnico', label: 'Profesional técnico' },
  { value: 'Bachillerato o su equivalente', label: 'Bachillerato o su equivalente' }
]

export const useOptionsData = [
  { code: 'G01', description: 'Adquisición de mercancías', física: true, moral: true },
  { code: 'G02', description: 'Devoluciones, descuentos o bonificaciones', física: true, moral: true },
  { code: 'G03', description: 'Gastos en general', física: true, moral: true },
  { code: 'I01', description: 'Construcciones', física: true, moral: true },
  { code: 'I02', description: 'Mobiliario y equipo de oficina para inversiones', física: true, moral: true },
  { code: 'I03', description: 'Equipo de transporte', física: true, moral: true },
  { code: 'I04', description: 'Equipo de cómputo y accesorios', física: true, moral: true },
  { code: 'I05', description: 'Dados, troqueles, moldes, matrices y herramental', física: true, moral: true },
  { code: 'I06', description: 'Comunicaciones telefónicas', física: true, moral: true },
  { code: 'I07', description: 'Comunicaciones satelitales', física: true, moral: true },
  { code: 'I08', description: 'Otra maquinaria y equipo', física: true, moral: true },
  { code: 'D01', description: 'Honorarios médicos, dentales y hospitalarios', física: true, moral: false },
  { code: 'D02', description: 'Gastos médicos por incapacidad o discapacidad', física: true, moral: false },
  { code: 'D03', description: 'Gastos funerales', física: true, moral: false },
  { code: 'D04', description: 'Donativos', física: true, moral: false },
  { code: 'D05', description: 'Intereses reales pagados por créditos hipotecarios', física: true, moral: false },
  { code: 'D06', description: 'Aportaciones voluntarias al SAR', física: true, moral: false },
  { code: 'D07', description: 'Primas de seguros de gastos médicos', física: true, moral: false },
  { code: 'D08', description: 'Gastos de transportación escolar obligatoria', física: true, moral: false },
  { code: 'D09', description: 'Depósitos en cuentas para el ahorro, primas de pensiones', física: true, moral: false },
  { code: 'D10', description: 'Pagos por servicios educativos (colegiaturas)', física: true, moral: false },
  { code: 'S01', description: 'Sin efectos fiscales', física: true, moral: true },
  { code: 'CP01', description: 'Pagos', física: true, moral: true },
  { code: 'CN01', description: 'Nómina', física: true, moral: false }
]

export const escapeXml = (unsafe: unknown) => String(unsafe || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

export const normalizeText = (value: unknown) => String(value || '').trim()
export const normalizeUpper = (value: unknown) => normalizeText(value).toUpperCase()

export const isValidRFC = (rfc: unknown) => /^([A-ZÑ&]{3,4}) ?(?:- ?)?(\d{2})(\d{2})(\d{2})([A-Z\d]{3})$/i.test(String(rfc || ''))
export const isValidEmail = (email: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''))
export const isValidCURP = (curp: unknown) => /^[A-Z]{1}[AEIOU]{1}[A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HM]{1}[A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}\d{1}[A-Z0-9]{1}\d{1}$/i.test(String(curp || ''))

export const validateNivelEducativo = (nivel: unknown) => {
  const value = normalizeText(nivel)
  return nivelEducativoOptions.some(option => option.value === value && value) ? value : 'Primaria'
}

export const mapPaymentForm = (formaDePago: unknown) => {
  const mapping: Record<string, string> = {
    'Efectivo': '01',
    'Efectivo / Pagos referenciados': '01',
    'Cheque': '02',
    'Cheque nominativo': '02',
    'Transferencia': '03',
    'Transferencia electrónica de fondos': '03',
    'Transferencia electrónica de fondos - Internet': '03',
    'Deposito Bancario': '03',
    'Depósito Bancario': '03',
    'Tarjeta de crédito': '04',
    'Tarjeta de crédito - Internet': '04',
    'Tarjeta de débito': '28',
    'Tarjeta de débito - Internet': '28',
    'Pago domiciliado tarjeta de débito': '28'
  }

  const raw = normalizeText(formaDePago)
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (mapping[raw]) return mapping[raw]
  if (normalized.includes('efectivo')) return '01'
  if (normalized.includes('cheque')) return '02'
  if (normalized.includes('transfer') || normalized.includes('deposito')) return '03'
  if (normalized.includes('credito')) return '04'
  if (normalized.includes('debito')) return '28'
  if (/^\d{2}$/.test(raw)) return raw
  return '99'
}

export const getLocalISOStringNow = () => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d}T${hh}:${mm}`
}

export const isValidInvoiceDate = (dateString: unknown) => {
  try {
    const inputDate = new Date(String(dateString || ''))
    if (Number.isNaN(inputDate.getTime())) return false
    const now = new Date()
    if (inputDate > now) return false
    const hoursDiff = (now.getTime() - inputDate.getTime()) / (1000 * 60 * 60)
    return hoursDiff <= 72
  } catch {
    return false
  }
}

export const determineReceiverType = (taxSystem: unknown) => {
  const value = normalizeText(taxSystem)
  const fisica = new Set(['605', '606', '607', '608', '610', '611', '612', '614', '615', '616', '620', '621', '622', '623', '624', '625', '626'])
  const moral = new Set(['601', '603'])
  if (moral.has(value)) return 'Moral'
  if (fisica.has(value)) return 'Física'
  return 'Física'
}

export const getUseOptions = (receiverType: string) => useOptionsData
  .filter(opt => (receiverType === 'Física' ? opt.física : receiverType === 'Moral' ? opt.moral : false))
  .map(opt => ({ value: opt.code, label: `${opt.code} - ${opt.description}` }))

export const extractPlantelCode = (concepto?: InvoiceConceptInput | null) => {
  const explicit = normalizeUpper(concepto?.plantel)
  if (plantelCodes.includes(explicit)) return explicit
  const folioPlantel = normalizeUpper(concepto?.folio_plantel || concepto?.folioPlantel || concepto?.external_id)
  const match = folioPlantel.match(plantelRegexBounded) || folioPlantel.match(plantelRegexLoose)
  return match ? match[1].toUpperCase() : ''
}

export const parseFolioNumber = (folioPlantelRaw: unknown) => {
  const raw = normalizeUpper(folioPlantelRaw)
  if (!raw) return null
  const prefixMatch = raw.match(plantelRegexBounded) || raw.match(plantelRegexLoose)
  const prefix = prefixMatch ? prefixMatch[1].toUpperCase() : ''
  const numericMatch = raw.match(/(\d+)/)
  const numericPart = numericMatch ? numericMatch[1] : ''
  const two = prefix && legacyInvoiceConfig.folioPrefixMap[prefix] ? legacyInvoiceConfig.folioPrefixMap[prefix] : ''
  if (!numericPart) return null
  const parsed = Number.parseInt(`${two}${numericPart}`, 10)
  return Number.isNaN(parsed) ? null : parsed
}

export const computeDefaultProductKey = (conceptosList: InvoiceConceptInput[]) => {
  for (const concepto of conceptosList || []) {
    const plantel = extractPlantelCode(concepto)
    if (plantel && legacyInvoiceConfig.productKey.overrideByPlantel[plantel]) {
      return legacyInvoiceConfig.productKey.overrideByPlantel[plantel]
    }
  }
  return legacyInvoiceConfig.productKey.default
}

export const computeDefaultFacturaCon = (matricula: unknown) => {
  const prefix = normalizeUpper(matricula).substring(0, 2)
  return legacyInvoiceConfig.facturaCon.iedisPrefixes.has(prefix) ? 'IEDIS' : legacyInvoiceConfig.facturaCon.fallback
}

export const inferNivelFromBase = (nivel: unknown) => {
  const value = normalizeText(nivel).toLowerCase()
  if (value.includes('preescolar')) return 'Preescolar'
  if (value.includes('primaria')) return 'Primaria'
  if (value.includes('secundaria')) return 'Secundaria'
  if (value.includes('profesional')) return 'Profesional técnico'
  if (value.includes('bachillerato')) return 'Bachillerato o su equivalente'
  return ''
}

export const defaultRvoeFor = (plantel: unknown, nivel: unknown) => {
  const p = normalizeUpper(plantel)
  const n = normalizeText(nivel).toLowerCase()
  if (p === 'PT' && n === 'secundaria') return legacyInvoiceConfig.plantelToRVOE.ST
  return legacyInvoiceConfig.plantelToRVOE[p] || ''
}

export const getInvoiceAmount = (concepto: InvoiceConceptInput) => {
  const candidates = [concepto.monto, concepto.montoPagado, concepto.saldo, concepto.saldoAntes, concepto.pagos, concepto.subtotal, concepto.importeTotal, concepto.costoOriginal]
  for (const candidate of candidates) {
    const parsed = Number(candidate)
    if (Number.isFinite(parsed) && parsed > 0) return Number(parsed.toFixed(2))
  }
  return 0
}

export const normalizeInvoiceConcept = (source: InvoiceConceptInput, index = 0) => {
  const folioPlantel = normalizeText(source.folio_plantel || source.folioPlantel || source.external_id || '')
  return {
    ...source,
    id: source.id || `${source.documento || 'concepto'}-${source.mes || index}`,
    conceptoNombre: normalizeText(source.conceptoNombre || source.descripcion || source.concepto || `Concepto ${index + 1}`),
    monto: getInvoiceAmount(source),
    folio_plantel: folioPlantel,
    plantel: extractPlantelCode(source) || normalizeUpper(source.plantel)
  }
}

export const buildFiscalProfiles = (student: Record<string, any>, companyData: Record<string, any>) => {
  const joinedName = (...values: unknown[]) => values.map(normalizeText).filter(Boolean).join(' ')
  const fatherName = joinedName(student?.nombrePadre, student?.apellidoPaternoPadre, student?.apellidoMaternoPadre) || normalizeText(student?.nombrePadreCompleto || student?.padre)
  const motherName = joinedName(student?.nombreMadre, student?.apellidoPaternoMadre, student?.apellidoMaternoMadre) || normalizeText(student?.nombreMadreCompleto || student?.madre)

  const profiles = [
    {
      key: 'stored',
      label: 'Perfil fiscal guardado',
      legal_name: normalizeText(companyData?.legal_name),
      tax_id: normalizeUpper(companyData?.tax_id),
      email: normalizeText(companyData?.email || student?.correo),
      zip: normalizeText(companyData?.zip),
      tax_system: normalizeText(companyData?.tax_system),
      note: 'Datos guardados.'
    },
    {
      key: 'father',
      label: 'Padre / Tutor',
      legal_name: fatherName,
      tax_id: normalizeUpper(student?.rfcPadre || student?.RFCPadre),
      email: normalizeText(student?.emailPadre || student?.correoPadre || student?.correo),
      zip: normalizeText(student?.cpPadre || student?.zipPadre),
      tax_system: normalizeText(student?.regimenFiscalPadre || '616'),
      note: 'Disponible desde expediente del alumno; completa RFC, CP y régimen si faltan.'
    },
    {
      key: 'mother',
      label: 'Madre / Tutora',
      legal_name: motherName,
      tax_id: normalizeUpper(student?.rfcMadre || student?.RFCMadre),
      email: normalizeText(student?.emailMadre || student?.correoMadre || student?.correo),
      zip: normalizeText(student?.cpMadre || student?.zipMadre),
      tax_system: normalizeText(student?.regimenFiscalMadre || '616'),
      note: 'Disponible desde expediente del alumno; completa RFC, CP y régimen si faltan.'
    }
  ]

  return profiles.filter(profile => profile.key === 'stored' || profile.legal_name || profile.email || profile.tax_id)
}

export type ResolveLegacyInvoiceContextInput = {
  student?: Record<string, any>
  selectedConcepts?: InvoiceConceptInput[]
}

export type ResolvedLegacyInvoiceConcept = InvoiceConceptInput & {
  id: string
  conceptoNombre: string
  monto: number
  folio_plantel: string
  plantel: string
}

export type ResolvedLegacyInvoiceContext = {
  matricula: string
  matriculaPrefix: string
  plantel: string
  facturaCon: string
  seriesToSend: string
  seriesLabel: string
  folioPlantelRaw: string
  folioNumber: number | null
  externalId: string
  productKey: string
  primaryFormaDePago: string
  paymentForm: string
  conceptos: ResolvedLegacyInvoiceConcept[]
  total: number
  defaultRvoe: string
  blockingErrors: string[]
}

export const resolveLegacyInvoiceContext = ({ student = {}, selectedConcepts = [] }: ResolveLegacyInvoiceContextInput = {}): ResolvedLegacyInvoiceContext => {
  const matricula = normalizeText(student?.matricula)
  const matriculaPrefix = normalizeUpper(matricula).substring(0, 2)
  const studentPlantel = normalizeUpper(student?.plantel || student?.plantelCode || student?.campus || student?.sede)
  const fallbackPlantel = plantelCodes.includes(studentPlantel)
    ? studentPlantel
    : (plantelCodes.includes(matriculaPrefix) ? matriculaPrefix : '')

  const conceptos = (Array.isArray(selectedConcepts) ? selectedConcepts : []).map((source, index) => {
    const normalized = normalizeInvoiceConcept(source, index)
    const plantel = extractPlantelCode(normalized) || fallbackPlantel
    return {
      ...normalized,
      id: normalizeText(normalized.id) || `${normalized.documento || 'concepto'}-${normalized.mes || index}`,
      conceptoNombre: normalizeText(normalized.conceptoNombre),
      monto: Number(normalized.monto || 0),
      folio_plantel: normalizeText(normalized.folio_plantel || normalized.external_id || ''),
      plantel
    } as ResolvedLegacyInvoiceConcept
  })

  const plantel = conceptos.map(concepto => extractPlantelCode(concepto) || normalizeUpper(concepto.plantel)).find(Boolean) || fallbackPlantel
  const folioPlantelRaw = normalizeText(conceptos.find(concepto => concepto.folio_plantel)?.folio_plantel || '')
  const folioNumber = parseFolioNumber(folioPlantelRaw)
  const facturaCon = computeDefaultFacturaCon(matricula)
  const productKey = computeDefaultProductKey(conceptos)
  const primaryFormaDePago = normalizeText(
    conceptos.find(concepto => normalizeText(concepto.formaDePago || concepto.payment_form || concepto.forma_pago))?.formaDePago
    || conceptos.find(concepto => normalizeText(concepto.payment_form))?.payment_form
    || conceptos.find(concepto => normalizeText(concepto.forma_pago))?.forma_pago
    || 'Efectivo'
  )
  const paymentForm = mapPaymentForm(primaryFormaDePago)
  const seriesCandidate = ['PT', 'ST'].includes(plantel) ? plantel : matriculaPrefix
  const seriesToSend = matriculaPrefix === 'PT' ? (['PT', 'ST'].includes(seriesCandidate) ? seriesCandidate : 'PT') : ''
  const total = conceptos.reduce((sum, concepto) => sum + (Number.isFinite(Number(concepto.monto)) ? Number(concepto.monto) : 0), 0)
  const defaultRvoe = defaultRvoeFor(plantel, student?.nivel)
  const blockingErrors: string[] = []

  if (!matricula) blockingErrors.push('Falta matrícula del alumno.')
  if (!conceptos.length) blockingErrors.push('Selecciona un concepto para facturar.')
  if (!/^\d{8}$/.test(productKey)) blockingErrors.push('No se pudo preparar la clave de producto.')
  conceptos.forEach((concepto, index) => {
    if (!normalizeText(concepto.conceptoNombre)) blockingErrors.push(`Concepto ${index + 1}: falta descripción.`)
    if (!Number.isFinite(Number(concepto.monto)) || Number(concepto.monto) <= 0) blockingErrors.push(`Concepto ${index + 1}: monto inválido.`)
  })

  return {
    matricula,
    matriculaPrefix,
    plantel,
    facturaCon,
    seriesToSend,
    seriesLabel: seriesToSend || 'No se envía serie para esta matrícula',
    folioPlantelRaw,
    folioNumber,
    externalId: folioPlantelRaw,
    productKey,
    primaryFormaDePago,
    paymentForm,
    conceptos,
    total: Number(total.toFixed(2)),
    defaultRvoe,
    blockingErrors
  }
}

