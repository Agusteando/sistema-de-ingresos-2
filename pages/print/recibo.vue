<template>
  <div class="receipt-page bg-white min-h-screen p-10 font-sans text-neutral-ink print:p-0 relative overflow-x-hidden print:overflow-visible">
    <div v-if="isPreview" class="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
      <div class="text-[100px] font-bold text-gray-100 uppercase rotate-[-45deg] tracking-widest opacity-60">Vista Previa</div>
    </div>

    <div class="max-w-[850px] mx-auto mb-6 print:hidden flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm relative z-20">
      <button class="btn btn-ghost" @click="closeWindow">Volver</button>
      <div class="flex flex-wrap justify-end gap-2">
        <button class="btn btn-outline" @click="emailReceipt" :disabled="emailing || isPreview || loadingReceipt || receiptError || !items.length">
          <LucideMail :size="16" /> {{ emailing ? 'Enviando...' : 'Enviar email' }}
        </button>
        <button class="btn btn-outline" @click="downloadReceiptPdf" :disabled="isPreview || loadingReceipt || receiptError || !items.length">
          <LucideDownload :size="16" /> Descargar PDF
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

    <div v-else-if="items.length" ref="receiptSheetRef" class="relative z-10">
      <PaymentReceiptSheet
        :items="items"
        :receipt-data="receiptData"
        :issued-at="issuedAtLabel"
        :active-user-name="activeUserName"
        :is-preview="isPreview"
      />
    </div>

    <InvoiceModal
      v-if="showInvoiceModal"
      :debts="invoiceDebts"
      :student="invoiceStudent"
      @close="showInvoiceModal = false"
      @success="handleInvoiceSuccess"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useCookie } from '#app'
import { LucideDownload, LucideFileText, LucideMail, LucidePrinter } from 'lucide-vue-next'
import { numeroALetras } from '~/server/utils/numberToWords'
import { normalizePlantelCode } from '~/shared/utils/institution'
import InvoiceModal from '~/components/InvoiceModal.vue'

definePageMeta({ layout: false })

const route = useRoute()
const items = ref([])
const receiptData = ref({})
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

const normalizedFolios = computed(() => {
  const raw = Array.isArray(route.query.folios)
    ? route.query.folios.join(',')
    : String(route.query.folios || '')

  return Array.from(new Set(raw
    .split(',')
    .map(value => Number(value.trim()))
    .filter(value => Number.isInteger(value) && value > 0)))
})

const formatIssuedAt = (value) => {
  const date = value instanceof Date ? value : new Date(String(value || ''))
  if (Number.isNaN(date.getTime())) return String(value || '')
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const issuedAtLabel = computed(() => formatIssuedAt(
  receiptData.value.documentIssuedAt
  || receiptData.value.fecha
  || new Date()
))

const receiptPdfUrl = (download = false) => {
  const params = new URLSearchParams({ folios: normalizedFolios.value.join(',') })
  if (download) params.set('download', '1')
  return `/api/payments/receipt-pdf?${params.toString()}`
}

onMounted(async () => {
  if (isPreview.value) {
    loadingReceipt.value = false
    try {
      const data = JSON.parse(sessionStorage.getItem('receipt_preview') || '{}')
      items.value = (data.items || []).map(item => ({
        ...item,
        plantel: normalizePlantelCode(item?.plantel || data?.plantel),
        montoLetra: item.montoLetra || numeroALetras(Number(item.monto || 0)),
      }))
      receiptData.value = {
        ...data,
        plantel: normalizePlantelCode(data?.plantel || items.value[0]?.plantel),
        usuario: activeUserName,
        documentIssuedAt: data?.fecha || new Date().toISOString(),
      }
      if (!items.value.length) receiptError.value = 'La vista previa no contiene pagos para mostrar.'
    } catch {
      receiptError.value = 'La vista previa no contiene datos válidos.'
    }
    return
  }

  if (!normalizedFolios.value.length) {
    loadingReceipt.value = false
    receiptError.value = 'No se seleccionaron pagos para este recibo.'
    return
  }

  try {
    const response = await $fetch('/api/payments/receipt', {
      params: { folios: normalizedFolios.value.join(',') },
    })
    if (!Array.isArray(response) || !response.length) {
      receiptError.value = 'Los pagos seleccionados ya no están vigentes o no se encontraron.'
      return
    }

    items.value = response.map(item => ({
      ...item,
      montoLetra: item.montoLetra || numeroALetras(Number(item.monto || 0)),
    }))
    receiptData.value = response[0]
  } catch (error) {
    receiptError.value = error?.data?.message || error?.message || 'Ocurrió un error al consultar los pagos seleccionados.'
  } finally {
    loadingReceipt.value = false
  }
})

const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve))

const preparePreviewPrint = async () => {
  await nextTick()
  const images = Array.from(receiptSheetRef.value?.querySelectorAll('img') || [])
  await Promise.all(images.map(image => image.complete
    ? Promise.resolve()
    : Promise.race([
        new Promise(resolve => {
          image.addEventListener('load', resolve, { once: true })
          image.addEventListener('error', resolve, { once: true })
        }),
        new Promise(resolve => setTimeout(resolve, 2500)),
      ])))
  if (document.fonts?.ready) {
    await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 2500))])
  }
  await nextFrame()
}

const closeWindow = () => {
  if (window.opener) window.close()
  else window.history.back()
}

const downloadReceiptPdf = () => {
  if (isPreview.value || !normalizedFolios.value.length) return
  const link = document.createElement('a')
  link.href = receiptPdfUrl(true)
  link.target = '_blank'
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

const triggerPrint = async () => {
  if (preparingPrint.value || !items.value.length) return
  preparingPrint.value = true
  try {
    if (isPreview.value) {
      await preparePreviewPrint()
      window.print()
      return
    }
    window.open(receiptPdfUrl(false), '_blank', 'noopener')
  } catch (error) {
    receiptError.value = error?.message || 'No fue posible preparar el recibo completo para impresión.'
  } finally {
    preparingPrint.value = false
  }
}

const emailReceipt = async () => {
  const destination = prompt('Ingrese el correo electrónico destino para enviar el comprobante:', '')
  if (!destination || !destination.includes('@')) return

  emailing.value = true
  try {
    await $fetch('/api/payments/email-receipt', {
      method: 'POST',
      body: { folios: normalizedFolios.value, email: destination },
    })
    alert('Comprobante enviado exitosamente.')
  } catch (error) {
    alert(error?.data?.message || error?.message || 'Error enviando correo.')
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
    mesLabel: item.mesReal || item.mes,
  }))

  invoiceStudent.value = {
    matricula: receiptData.value.matricula,
    nombreCompleto: receiptData.value.nombreCompleto,
    nivel: receiptData.value.nivel,
    plantel: receiptData.value.plantel,
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
}
</style>
