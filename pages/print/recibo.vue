<template>
  <div class="bg-white min-h-screen p-10 font-sans text-neutral-ink print:p-0 relative overflow-hidden">
    
    <div v-if="isPreview" class="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
      <div class="text-[120px] font-black text-gray-200 uppercase rotate-[-45deg] tracking-widest opacity-50">Vista Previa</div>
    </div>

    <!-- Barra de acciones (Oculta en modo impresión) -->
    <div class="max-w-[850px] mx-auto mb-6 print:hidden flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm relative z-20">
      <button class="btn btn-ghost" @click="closeWindow">Volver</button>
      <div class="flex gap-3">
        <button class="btn btn-outline" @click="emailReceipt" :disabled="emailing || isPreview">
          <LucideMail :size="16" /> {{ emailing ? 'Enviando...' : 'Enviar por correo' }}
        </button>
        <button class="btn btn-secondary" @click="openInvoiceModal" :disabled="isPreview">
          <LucideFileText :size="16" /> Generar CFDI
        </button>
        <button class="btn btn-primary" @click="triggerPrint">
          <LucidePrinter :size="16" /> Imprimir recibo
        </button>
      </div>
    </div>

    <div class="max-w-[850px] mx-auto border border-gray-200 p-10 rounded-2xl print:border-none print:p-5 relative z-10 bg-white shadow-xl print:shadow-none print:max-w-none w-full min-h-[900px] flex flex-col justify-between">
      
      <div>
        <!-- ENCABEZADO PARITY -->
        <div class="flex justify-between items-start border-b-2 border-brand-campus pb-6 mb-8">
          <div class="flex items-center gap-6 w-2/3">
            <img :src="logoSrc" alt="Logo" class="h-[80px] object-contain" />
            <div>
              <h2 class="m-0 text-[0.95rem] font-black text-gray-900 tracking-tight leading-tight">{{ institutoNombre }}</h2>
              <p class="m-0 mt-1 text-xs text-brand-teal uppercase font-bold tracking-wider">{{ isPreview ? 'Vista previa, carece de validez' : 'Comprobante de pago' }}</p>
              <p class="m-0 mt-2 text-[10px] text-gray-500 leading-tight">Documento no válido como comprobante fiscal.<br/>Conserve este recibo para cualquier aclaración futura.</p>
            </div>
          </div>
          <div class="w-1/3 text-right flex flex-col justify-center">
            <div class="inline-block bg-gray-50 border border-gray-200 rounded-lg p-3 text-left w-full">
              <p class="m-0 mb-1 text-xs flex justify-between"><strong class="text-gray-700 uppercase">Emisión:</strong> <span class="font-mono text-gray-600 font-bold">{{ fecha }}</span></p>
              <p class="m-0 text-xs flex justify-between"><strong class="text-gray-700 uppercase">Usuario:</strong> <span class="text-gray-600 font-bold truncate max-w-[130px] text-right">{{ receiptData.usuario || activeUserName }}</span></p>
              <p class="m-0 mt-1 text-xs flex justify-between"><strong class="text-gray-700 uppercase">Página:</strong> <span class="text-gray-600 font-bold text-right">1 / 1</span></p>
            </div>
          </div>
        </div>
        
        <!-- DATOS DEL ALUMNO (Paridad legacy de templateEncabezado.txt) -->
        <table class="w-full text-sm mb-8 border-t-2 border-b-2 border-gray-200">
          <thead>
            <tr class="text-left text-gray-600">
              <th class="py-2 font-bold uppercase tracking-wider text-[11px]">Matrícula</th>
              <th class="py-2 font-bold uppercase tracking-wider text-[11px]">Alumno</th>
              <th class="py-2 font-bold uppercase tracking-wider text-[11px]">Ciclo Escolar</th>
              <th class="py-2 font-bold uppercase tracking-wider text-[11px]">Grado y grupo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="py-3 font-mono font-bold text-gray-900">{{ receiptData.matricula || 'N/A' }}</td>
              <td class="py-3 font-bold text-gray-900">{{ receiptData.nombreCompleto || 'ALUMNO NO ESPECIFICADO' }}</td>
              <td class="py-3 font-medium text-gray-800">{{ receiptData.ciclo || '2024' }}-{{ Number(receiptData.ciclo || '2024')+1 }}</td>
              <td class="py-3 font-medium text-gray-800">{{ receiptData.grado || '' }} {{ receiptData.grupo || '' }}</td>
            </tr>
          </tbody>
        </table>
        
        <!-- RECIBOS INDIVIDUALES Y SUS CAMPOS (Paridad legacy de templateRecibo.txt) -->
        <div v-for="(r, i) in items" :key="i" class="mb-8">
          <table class="w-full text-[12px] border-collapse">
            <tbody>
              <tr class="bg-gray-50/80 border-b border-gray-200">
                <th class="py-2 px-3 text-left font-bold text-gray-600 uppercase tracking-wider w-1/5">Folio</th>
                <th class="py-2 px-3 text-left font-bold text-gray-600 uppercase tracking-wider w-1/5">Método de pago</th>
                <th class="py-2 px-3 text-left font-bold text-gray-600 uppercase tracking-wider w-1/5">Saldo</th>
                <th class="py-2 px-3 text-left font-bold text-gray-600 uppercase tracking-wider w-1/5">Importe total</th>
                <th class="py-2 px-3 text-left font-bold text-gray-600 uppercase tracking-wider w-1/5">Pago</th>
              </tr>
              <tr>
                <td class="py-2 px-3 font-mono font-bold text-gray-900">{{ r.folio_plantel || r.folio }}</td>
                <td class="py-2 px-3 text-gray-800 font-medium">{{ r.formaDePago }}</td>
                <td class="py-2 px-3 text-gray-800 font-medium">${{ Number(r.saldoDespues || 0).toFixed(2) }}</td>
                <td class="py-2 px-3 text-gray-800 font-medium">${{ Number(r.importeTotal || 0).toFixed(2) }}</td>
                <td class="py-2 px-3 text-brand-campus font-black">${{ Number(r.monto || 0).toFixed(2) }}</td>
              </tr>

              <tr class="bg-gray-50/80 border-b border-t border-gray-200">
                <th class="py-2 px-3 text-left font-bold text-gray-600 uppercase tracking-wider">Documento</th>
                <th class="py-2 px-3 text-left font-bold text-gray-600 uppercase tracking-wider">Saldo previo</th>
                <th class="py-2 px-3 text-left font-bold text-gray-600 uppercase tracking-wider">Acumulado previo</th>
                <th class="py-2 px-3 text-left font-bold text-gray-600 uppercase tracking-wider">Acumulado actual</th>
                <th class="py-2 px-3 text-left font-bold text-gray-600 uppercase tracking-wider">Importe aplicable a</th>
              </tr>
              <tr>
                <td class="py-2 px-3 font-mono font-medium text-gray-800">{{ String(r.documento).padStart(7, '0') }}</td>
                <td class="py-2 px-3 font-medium text-gray-800">${{ Number(r.saldoAntes || 0).toFixed(2) }}</td>
                <td class="py-2 px-3 font-medium text-gray-800">${{ Number(r.pagos || 0).toFixed(2) }}</td>
                <td class="py-2 px-3 font-medium text-gray-800">${{ Number(r.pagosDespues || 0).toFixed(2) }}</td>
                <td class="py-2 px-3 font-medium text-gray-800">{{ r.mes === 'ev' ? new Date(r.fecha).toLocaleDateString() : (r.mesReal || r.mes) }}</td>
              </tr>

              <tr class="bg-gray-50/80 border-b border-t border-gray-200">
                <th class="py-2 px-3 text-left font-bold text-gray-600 uppercase tracking-wider">Por concepto de:</th>
                <th class="py-2 px-3 text-left font-bold text-gray-600 uppercase tracking-wider" colspan="4">Detalle de Operación</th>
              </tr>
              <tr>
                <td class="py-2 px-3 font-bold text-gray-900">{{ r.conceptoNombre }}</td>
                <td class="py-2 px-3 font-medium text-gray-800">{{ new Date(r.fecha).toLocaleDateString() }}</td>
                <td class="py-2 px-3 font-medium text-gray-800 italic" colspan="3">{{ r.montoLetra }} 00/100 MXN</td>
              </tr>
            </tbody>
          </table>
          <hr class="mt-4 border-gray-200 border-dashed" />
        </div>

        <!-- TOTAL SUMMARY -->
        <div class="flex justify-between items-center p-6 bg-brand-leaf/10 rounded-xl border border-brand-leaf/30 mt-6 mb-8">
          <div class="flex-1 pr-8">
            <div class="text-[10px] font-bold uppercase tracking-widest text-brand-teal mb-1">Importe en Letra</div>
            <div class="text-sm font-semibold text-gray-800 leading-tight">{{ letrasGeneradas }}</div>
          </div>
          <div class="text-right border-l border-brand-leaf/20 pl-8">
            <div class="text-xs font-bold uppercase tracking-widest text-brand-campus mb-1">Importe total</div>
            <div class="text-3xl font-black text-brand-campus font-mono">${{ total.toFixed(2) }}</div>
          </div>
        </div>

      </div>

      <!-- FIRMAS Y PIE DE PÁGINA -->
      <div class="mt-auto">
        <div class="grid grid-cols-2 gap-20 px-10 mt-16 pt-10 border-t-2 border-dashed border-gray-200 text-center">
          <div>
            <div class="border-b border-gray-400 h-10 mb-2"></div>
            <div class="text-xs font-bold text-gray-800 uppercase tracking-wide">Firma del Cajero</div>
            <div class="text-[10px] text-gray-500 mt-1">SISTEMA DE INGRESOS 2</div>
          </div>
          <div>
            <div class="border-b border-gray-400 h-10 mb-2"></div>
            <div class="text-xs font-bold text-gray-800 uppercase tracking-wide">Firma de Conformidad</div>
            <div class="text-[10px] text-gray-500 mt-1">Padre, Madre o Tutor</div>
          </div>
        </div>

        <div class="text-center mt-12 mb-4">
          <p class="mb-2 italic font-medium text-gray-500 text-xs">“Compartimos contigo la formación integral de tus hijos”</p>
        </div>
      </div>
    </div>

    <!-- Integración Inline de Facturación -->
    <InvoiceModal v-if="showInvoiceModal" :debts="invoiceDebts" :student="invoiceStudent" @close="showInvoiceModal = false" @success="handleInvoiceSuccess" />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCookie } from '#app'
import { LucidePrinter, LucideMail, LucideFileText } from 'lucide-vue-next'
import dayjs from 'dayjs'
import { numeroALetras } from '~/server/utils/numberToWords'
import InvoiceModal from '~/components/InvoiceModal.vue'

definePageMeta({ layout: false })

const route = useRoute()
const items = ref([])
const receiptData = ref({})
const fecha = dayjs().format('DD/MM/YYYY HH:mm:ss')
const isPreview = computed(() => route.query.preview === 'true')
const activeUserName = useCookie('auth_name').value || 'Administrador'
const emailing = ref(false)

const showInvoiceModal = ref(false)
const invoiceDebts = ref([])
const invoiceStudent = ref({})

onMounted(async () => {
  if (isPreview.value) {
    try {
      const data = JSON.parse(sessionStorage.getItem('receipt_preview') || '{}')
      items.value = (data.items || []).map(r => ({
        ...r,
        montoLetra: r.montoLetra || numeroALetras(Number(r.monto || 0))
      }))
      receiptData.value = { ...data, usuario: activeUserName }
    } catch (e) {}
    return
  }

  const folios = route.query.folios
  if (!folios) return
  try {
    const res = await $fetch(`/api/payments/receipt?folios=${folios}`)
    if (res && res.length) {
      items.value = res.map(r => ({
        ...r,
        montoLetra: r.montoLetra || numeroALetras(Number(r.monto || 0))
      }))
      receiptData.value = res[0]
      setTimeout(() => window.print(), 800)
    }
  } catch(e) {}
})

const total = computed(() => items.value.reduce((a,b) => a + Number(b.monto || 0), 0))
const letrasGeneradas = computed(() => numeroALetras(total.value))
const logoSrc = computed(() => receiptData.value.instituto === 1 ? 'https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp' : 'https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp')

const institutoNombre = computed(() => {
  return receiptData.value.nivel === 'Secundaria' 
    ? 'INSTITUTO EDUCATIVO PARA EL DESARROLLO INTEGRAL DEL SABER SC' 
    : 'INSTITUTO EDUCATIVO LA CASITA DEL SABER SC'
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
    alert('Error enviando correo.')
  } finally {
    emailing.value = false
  }
}

const openInvoiceModal = () => {
  invoiceDebts.value = items.value.map(item => ({
    conceptoNombre: item.conceptoNombre,
    pagos: item.monto,
    documento: item.folio
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
@media print {
  @page { margin: 0.5cm; size: letter portrait; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white !important; }
}
</style>