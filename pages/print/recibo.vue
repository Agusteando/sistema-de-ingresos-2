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
        <button class="btn btn-primary" :disabled="loadingReceipt || receiptError || !items.length" @click="triggerPrint">
          <LucidePrinter :size="16" /> Imprimir
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

    <PaymentReceiptSheet
      v-else-if="items.length"
      :items="items"
      :receipt-data="receiptData"
      :issued-at="fecha"
      :active-user-name="activeUserName"
      :is-preview="isPreview"
    />

    <InvoiceModal v-if="showInvoiceModal" :debts="invoiceDebts" :student="invoiceStudent" @close="showInvoiceModal = false" @success="handleInvoiceSuccess" />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCookie } from '#app'
import { LucidePrinter, LucideMail, LucideFileText } from 'lucide-vue-next'
import dayjs from 'dayjs'
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

const showInvoiceModal = ref(false)
const invoiceDebts = ref([])
const invoiceStudent = ref({})

onMounted(async () => {
  if (isPreview.value) {
    loadingReceipt.value = false
    try {
      const data = JSON.parse(sessionStorage.getItem('receipt_preview') || '{}')
      items.value = data.items || []
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

  try {
    const res = await $fetch('/api/payments/receipt', { params: { folios } })
    if (!Array.isArray(res) || !res.length) {
      receiptError.value = 'Los pagos seleccionados ya no están vigentes o no se encontraron.'
      return
    }

    items.value = res
    receiptData.value = res[0]
    setTimeout(() => window.print(), 800)
  } catch (error) {
    receiptError.value = error?.data?.message || error?.message || 'Ocurrió un error al consultar los pagos seleccionados.'
  } finally {
    loadingReceipt.value = false
  }
})

const closeWindow = () => window.close()
const triggerPrint = () => window.print()

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

@media print {
  @page {
    size: letter portrait;
    margin: 0.3in 0.34in;
  }

  .receipt-page {
    min-height: 0;
    overflow: visible;
  }
}
</style>
