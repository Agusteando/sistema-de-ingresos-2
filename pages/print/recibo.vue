<template>
  <div class="receipt-page bg-white min-h-screen p-10 font-sans text-neutral-ink print:p-0 relative overflow-x-hidden print:overflow-visible">
    
    <div v-if="isPreview" class="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
      <div class="text-[100px] font-bold text-gray-100 uppercase rotate-[-45deg] tracking-widest opacity-60">Vista Previa</div>
    </div>

    <div class="max-w-[850px] mx-auto mb-6 print:hidden flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm relative z-20">
      <button class="btn btn-ghost" @click="closeWindow">Volver</button>
      <div class="flex gap-2">
        <button class="btn btn-outline" @click="emailReceipt" :disabled="emailing || isPreview || loadingReceipt || receiptError || !items.length">
          <LucideMail :size="16" /> {{ emailing ? 'Enviando...' : 'Enviar email' }}
        </button>
        <button class="btn btn-secondary" @click="openInvoiceModal" :disabled="isPreview || loadingReceipt || receiptError || !items.length">
          <LucideFileText :size="16" /> Facturar CFDI
        </button>
        <button class="btn btn-primary" :disabled="loadingReceipt || receiptError || !items.length || preparingPrint" @click="triggerPrint">
          <LucidePrinter :size="16" /> {{ preparingPrint ? 'Preparando...' : 'Imprimir' }}
        </button>
      </div>
    </div>

    <div v-if="!isPreview && loadingReceipt" class="receipt-state max-w-[850px] mx-auto relative z-10">
      <strong>Cargando pagos seleccionados...</strong>
      <span>Preparando el recibo con el desglose completo.</span>
    </div>

    <div v-else-if="receiptError" class="receipt-state receipt-state--error max-w-[850px] mx-auto relative z-10">
      <strong>No se pudo generar el recibo</strong>
      <span>{{ receiptError }}</span>
    </div>

    <div
      v-else-if="items.length"
      ref="receiptSheetRef"
      class="receipt-sheet mx-auto border border-gray-200 p-8 rounded-2xl relative z-10 bg-white shadow-lg w-full"
      :class="hasMultiplePayments ? 'receipt-sheet--multi' : 'receipt-sheet--single'"
    >
      
      <div class="receipt-content">
        <section class="receipt-context">
          <div class="receipt-header flex justify-between items-start border-b border-gray-300 pb-5 mb-6">
            <div class="flex items-center gap-5 w-2/3">
              <img :src="logoSrc" alt="Logo" class="receipt-logo h-[60px] object-contain" />
              <div>
                <h2 class="receipt-institute-name m-0 text-sm font-bold text-gray-900 tracking-tight">{{ institutoNombre }}</h2>
                <p class="m-0 mt-0.5 text-[11px] text-brand-teal uppercase font-semibold">{{ isPreview ? 'Vista previa, carece de validez' : receiptHeading }}</p>
                <p class="m-0 mt-1 text-[10px] text-gray-500">Documento no válido como comprobante fiscal.</p>
              </div>
            </div>
            <div class="w-1/3 text-right flex flex-col justify-center">
              <div class="bg-gray-50 border border-gray-200 rounded p-2 text-left w-full text-[11px]">
                <p class="m-0 mb-1 flex justify-between"><strong class="text-gray-600 uppercase">Emisión:</strong> <span class="font-mono text-gray-800">{{ fecha }}</span></p>
                <p class="m-0 flex justify-between"><strong class="text-gray-600 uppercase">Administrador:</strong> <span class="receipt-admin text-gray-800 truncate max-w-[120px]">{{ receiptData.usuario || activeUserName }}</span></p>
              </div>
            </div>
          </div>

          <table class="student-summary w-full text-xs mb-6 border-y border-gray-200">
            <thead>
              <tr class="text-left text-gray-500">
                <th class="py-2 font-semibold uppercase">Matrícula</th>
                <th class="py-2 font-semibold uppercase">Alumno</th>
                <th class="py-2 font-semibold uppercase">Ciclo Escolar</th>
                <th class="py-2 font-semibold uppercase">Grado y grupo</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="py-2 font-mono font-semibold text-gray-900">{{ receiptData.matricula || 'N/A' }}</td>
                <td class="py-2 font-semibold text-gray-900">{{ receiptData.nombreCompleto || '—' }}</td>
                <td class="py-2 text-gray-700">{{ formatCicloLabel(receiptData.ciclo || '2025') }}</td>
                <td class="py-2 text-gray-700">{{ receiptData.grado || '' }} {{ receiptData.grupo || '' }}</td>
              </tr>
            </tbody>
          </table>
        </section>
        
        <section v-for="(r, i) in items" :key="i" class="receipt-item mb-6">
          <div v-if="hasMultiplePayments" class="receipt-item-index">
            Pago {{ i + 1 }} de {{ items.length }}
          </div>
          <table class="receipt-item-table w-full text-[11px] border-collapse">
            <tbody>
              <tr class="bg-gray-50/80 border-b border-gray-200">
                <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase">Folio</th>
                <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase">Método</th>
                <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase">Saldo</th>
                <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase">Total Doc.</th>
                <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase text-brand-campus">Pago</th>
              </tr>
              <tr>
                <td class="py-1.5 px-2 font-mono font-semibold text-gray-800">{{ r.folio_plantel || r.folio }}</td>
                <td class="py-1.5 px-2 text-gray-700">{{ paymentMethodLabel(r) }}</td>
                <td class="py-1.5 px-2 text-gray-700">${{ Number(r.saldoDespues || 0).toFixed(2) }}</td>
                <td class="py-1.5 px-2 text-gray-700">${{ Number(r.importeTotal || 0).toFixed(2) }}</td>
                <td class="py-1.5 px-2 font-bold text-brand-campus">${{ Number(r.monto || 0).toFixed(2) }}</td>
              </tr>

              <tr class="bg-gray-50/80 border-b border-t border-gray-200">
                <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase">Documento</th>
                <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase">Saldo previo</th>
                <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase">Acumulado</th>
                <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase">Nuevo Acum.</th>
                <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase">Mes/Ref</th>
              </tr>
              <tr>
                <td class="py-1.5 px-2 font-mono text-gray-700">{{ String(r.documento).padStart(7, '0') }}</td>
                <td class="py-1.5 px-2 text-gray-700">${{ Number(r.saldoAntes || 0).toFixed(2) }}</td>
                <td class="py-1.5 px-2 text-gray-700">${{ Number(r.pagos || 0).toFixed(2) }}</td>
                <td class="py-1.5 px-2 text-gray-700">${{ Number(r.pagosDespues || 0).toFixed(2) }}</td>
                <td class="py-1.5 px-2 text-gray-700">{{ r.mes === 'ev' ? new Date(r.fecha).toLocaleDateString() : (r.mesReal || r.mes) }}</td>
              </tr>

              <tr class="bg-gray-50/80 border-b border-t border-gray-200">
                <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase">Concepto:</th>
                <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase" colspan="4">Detalle</th>
              </tr>
              <tr>
                <td class="py-1.5 px-2 font-semibold text-gray-800">{{ r.conceptoNombre }}</td>
                <td class="py-1.5 px-2 text-gray-700">{{ new Date(r.fecha).toLocaleDateString() }}</td>
                <td class="py-1.5 px-2 text-gray-600 italic" colspan="3">{{ r.montoLetra }} 00/100 MXN</td>
              </tr>
            </tbody>
          </table>
          <div
            v-if="isOtherCampusPayment(r)"
            class="mt-2 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px]"
          >
            <span class="font-semibold text-amber-900">Pago realizado en otro plantel</span>
            <span class="font-bold text-amber-800">{{ paymentCampusLabel(r) }}</span>
          </div>
          <hr class="receipt-item-divider mt-4 border-gray-200 border-dashed" />
        </section>

        <div class="receipt-summary flex justify-between items-center p-5 bg-brand-leaf/5 rounded-lg border border-brand-leaf/20 mt-4 mb-6">
          <div class="flex-1 pr-6">
            <div class="text-[10px] font-semibold uppercase text-brand-teal mb-1">Importe en Letra</div>
            <div class="text-xs font-medium text-gray-700 leading-tight">{{ letrasGeneradas }}</div>
          </div>
          <div class="text-right border-l border-brand-leaf/20 pl-6">
            <div class="text-[10px] font-semibold uppercase text-brand-campus mb-1">Total abonado</div>
            <div class="receipt-total-amount text-xl font-bold text-brand-campus font-mono">${{ total.toFixed(2) }}</div>
          </div>
        </div>

      </div>

      <div class="receipt-footer">
        <div class="receipt-footer-rule text-center mt-6 mb-2 pt-4 border-t border-dashed border-gray-300">
          <p class="italic text-gray-400 text-[10px]">“Compartimos contigo la formación integral de tus hijos”</p>
        </div>
      </div>
    </div>

    <InvoiceModal v-if="showInvoiceModal" :debts="invoiceDebts" :student="invoiceStudent" @close="showInvoiceModal = false" @success="handleInvoiceSuccess" />
  </div>
</template>

<script setup>
import { ref, onMounted, computed, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useCookie } from '#app'
import { LucidePrinter, LucideMail, LucideFileText } from 'lucide-vue-next'
import dayjs from 'dayjs'
import { numeroALetras } from '~/server/utils/numberToWords'
import { formatCicloLabel } from '~/shared/utils/ciclo'
import InvoiceModal from '~/components/InvoiceModal.vue'

definePageMeta({ layout: false })

const route = useRoute()
const items = ref([])
const receiptData = ref({})
const fecha = dayjs().format('DD/MM/YYYY HH:mm')
const isPreview = computed(() => route.query.preview === 'true')
const activeUserName = useCookie('auth_name').value || 'Administrador'
const emailing = ref(false)
const loadingReceipt = ref(!isPreview.value)
const receiptError = ref('')
const preparingPrint = ref(false)
const receiptSheetRef = ref(null)

const showInvoiceModal = ref(false)
const invoiceDebts = ref([])
const invoiceStudent = ref({})

onMounted(async () => {
  if (isPreview.value) {
    loadingReceipt.value = false
    try {
      const data = JSON.parse(sessionStorage.getItem('receipt_preview') || '{}')
      items.value = (data.items || []).map(r => ({
        ...r,
        montoLetra: r.montoLetra || numeroALetras(Number(r.monto || 0))
      }))
      receiptData.value = { ...data, usuario: activeUserName }
      if (!items.value.length) receiptError.value = 'La vista previa no contiene pagos para mostrar.'
    } catch (e) {
      receiptError.value = 'La vista previa no contiene datos válidos.'
    }
    return
  }

  const folios = Array.isArray(route.query.folios)
    ? route.query.folios.join(',')
    : String(route.query.folios || '').trim()
  if (!folios) {
    loadingReceipt.value = false
    receiptError.value = 'No se seleccionaron pagos para este recibo.'
    return
  }

  let shouldAutoPrint = false
  try {
    const res = await $fetch('/api/payments/receipt', { params: { folios } })
    if (!Array.isArray(res) || !res.length) {
      receiptError.value = 'Los pagos seleccionados ya no están vigentes o no se encontraron.'
      return
    }

    items.value = res.map(r => ({
      ...r,
      montoLetra: r.montoLetra || numeroALetras(Number(r.monto || 0))
    }))
    receiptData.value = res[0]
    shouldAutoPrint = true
  } catch (error) {
    receiptError.value = error?.data?.message || error?.message || 'Ocurrió un error al consultar los pagos seleccionados.'
  } finally {
    loadingReceipt.value = false
  }

  if (shouldAutoPrint) await triggerPrint()
})

const total = computed(() => items.value.reduce((a,b) => a + Number(b.monto || 0), 0))
const letrasGeneradas = computed(() => numeroALetras(total.value))
const hasMultiplePayments = computed(() => items.value.length > 1)
const receiptHeading = computed(() => hasMultiplePayments.value ? 'Comprobante de pagos' : 'Comprobante de pago')
const logoSrc = computed(() => receiptData.value.instituto === 1 ? 'https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp' : 'https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp')

const institutoNombre = computed(() => {
  return receiptData.value.nivel === 'Secundaria' 
    ? 'INSTITUTO EDUCATIVO PARA EL DESARROLLO INTEGRAL DEL SABER SC' 
    : 'INSTITUTO EDUCATIVO LA CASITA DEL SABER SC'
})


const normalizedMethod = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()
const truthyFlag = (value) => ['1', 'true'].includes(String(value ?? '').trim().toLowerCase())
const isOtherCampusPayment = (payment) => {
  if (truthyFlag(payment?.pago_otro_plantel)) return true
  const method = normalizedMethod(payment?.formaDePago)
  if (method === 'pago realizado en otro plantel') return true
  return truthyFlag(payment?.depurado) && method !== 'depuracion'
}
const paymentMethodLabel = (payment) => {
  const method = String(payment?.formaDePago || '').trim()
  return normalizedMethod(method) === 'pago realizado en otro plantel'
    ? 'Método no registrado'
    : (method || 'Sin método')
}
const paymentCampusLabel = (payment) => {
  const plantel = String(payment?.plantel_pago || '').trim().toUpperCase()
  return plantel ? `Plantel ${plantel}` : 'Plantel no especificado'
}

const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve))

const waitForReceiptItems = async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const renderedItems = receiptSheetRef.value?.querySelectorAll('.receipt-item').length || 0
    if (renderedItems === items.value.length) return
    await nextFrame()
  }

  const renderedItems = receiptSheetRef.value?.querySelectorAll('.receipt-item').length || 0
  throw new Error(`El recibo preparó ${renderedItems} de ${items.value.length} conceptos.`)
}

const waitForReceiptImages = async () => {
  const images = Array.from(receiptSheetRef.value?.querySelectorAll('img') || [])
  await Promise.all(images.map(image => {
    if (image.complete) return Promise.resolve()
    return Promise.race([
      new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true })
        image.addEventListener('error', resolve, { once: true })
      }),
      new Promise(resolve => setTimeout(resolve, 2500))
    ])
  }))
}

const prepareReceiptPrint = async () => {
  await nextTick()
  await waitForReceiptItems()
  await waitForReceiptImages()
  if (document.fonts?.ready) {
    await Promise.race([
      document.fonts.ready,
      new Promise(resolve => setTimeout(resolve, 2500))
    ])
  }
  await nextFrame()
  await nextFrame()
}

const closeWindow = () => window.close()
const triggerPrint = async () => {
  if (preparingPrint.value || !items.value.length) return
  preparingPrint.value = true
  try {
    await prepareReceiptPrint()
    window.print()
  } catch (error) {
    receiptError.value = error?.message || 'No fue posible preparar el recibo completo para impresión.'
  } finally {
    preparingPrint.value = false
  }
}

const emailReceipt = async () => {
  const destEmail = prompt('Ingrese el correo electrónico destino para enviar el comprobante:', '')
  if (!destEmail || !destEmail.includes('@')) return

  emailing.value = true
  try {
    await $fetch('/api/payments/email-receipt', { 
      method: 'POST', 
      body: { folios: route.query.folios, email: destEmail } 
    })
    alert('Comprobante enviado exitosamente.')
  } catch (e) {
    alert(e?.data?.message || e?.message || 'Error enviando correo.')
  } finally {
    emailing.value = false
  }
}

const openInvoiceModal = () => {
  invoiceDebts.value = items.value.map(item => ({
    conceptoNombre: item.conceptoNombre,
    pagos: item.monto,
    documento: item.documento || item.folio,
    folio_plantel: item.folio_plantel || '',
    external_id: item.folio_plantel || '',
    formaDePago: item.formaDePago || '',
    mes: item.mes,
    mesLabel: item.mesReal || item.mes
  }))

  invoiceStudent.value = {
    matricula: receiptData.value.matricula,
    nombreCompleto: receiptData.value.nombreCompleto,
    nivel: receiptData.value.nivel
  }
  
  showInvoiceModal.value = true
}

const handleInvoiceSuccess = () => {
  showInvoiceModal.value = false
}
</script>

<style scoped>
.receipt-state {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 48px 24px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
  color: #64748b;
  text-align: center;
  box-shadow: 0 18px 42px rgba(15, 23, 42, .08);
}

.receipt-state strong {
  color: #1e293b;
  font-size: 16px;
}

.receipt-state--error {
  border-color: #fecaca;
  background: #fffafa;
}

.receipt-state--error strong {
  color: #b42318;
}

.receipt-sheet {
  max-width: 850px;
  min-height: 8.5in;
}

.receipt-sheet--single {
  display: flex;
  flex-direction: column;
}

.receipt-sheet--single .receipt-content {
  flex: 1;
}

.receipt-sheet--single .receipt-footer {
  margin-top: auto;
}

.receipt-item-index {
  margin-bottom: 0.35rem;
  color: #667085;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

@media print {
  @page {
    size: letter portrait;
    margin: 0.3in 0.34in;
  }

  :global(html),
  :global(body),
  :global(#__nuxt) {
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    overflow: visible !important;
    background-color: white !important;
  }

  :global(body) {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .receipt-page {
    min-height: 0;
    overflow: visible;
  }

  .receipt-sheet {
    width: 100%;
    height: auto;
    min-height: 0;
    max-width: none;
    overflow: visible;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    padding: 0;
  }

  .receipt-sheet--single {
    min-height: 5.18in;
  }

  .receipt-sheet--multi,
  .receipt-sheet--multi .receipt-content {
    display: block !important;
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
  }

  .receipt-context,
  .receipt-header,
  .student-summary,
  .receipt-item,
  .receipt-item-table,
  .receipt-summary,
  .receipt-footer {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .receipt-item {
    overflow: visible;
  }

  .receipt-header {
    padding-bottom: 0.11in;
    margin-bottom: 0.1in;
  }

  .receipt-logo {
    max-height: 0.42in;
  }

  .receipt-institute-name {
    font-size: 10.5px;
    line-height: 1.08;
  }

  .receipt-admin {
    max-width: none;
    overflow: visible;
    text-align: right;
    text-overflow: clip;
    white-space: normal;
  }

  .student-summary,
  .receipt-item-table {
    margin-bottom: 0.08in;
    font-size: 8.4px;
    line-height: 1.12;
  }

  .student-summary th,
  .student-summary td,
  .receipt-item-table th,
  .receipt-item-table td {
    overflow-wrap: anywhere;
    padding-top: 0.025in;
    padding-bottom: 0.025in;
    white-space: normal;
    word-break: normal;
  }

  .student-summary,
  .receipt-item-table {
    table-layout: fixed;
  }

  .student-summary,
  .receipt-item,
  .receipt-summary {
    margin-bottom: 0.08in;
  }

  .receipt-item-divider,
  .receipt-summary {
    margin-top: 0.05in;
  }

  .receipt-summary {
    padding: 0.08in;
  }

  .receipt-total-amount {
    font-size: 15px;
    line-height: 1.05;
  }

  .receipt-footer {
    margin-top: 0.05in;
  }

  .receipt-footer-rule {
    margin-top: 0.05in;
    padding-top: 0.05in;
  }

  .receipt-sheet--multi .receipt-item {
    margin-bottom: 0.13in;
    break-inside: avoid-page;
    page-break-inside: avoid;
  }

  .receipt-sheet--multi .receipt-item-index {
    margin-bottom: 0.04in;
  }
}
</style>
