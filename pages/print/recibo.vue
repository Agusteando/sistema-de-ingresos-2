<template>
  <div class="bg-white min-h-screen p-10 font-sans text-neutral-ink print:p-0 relative overflow-hidden">
    
    <div v-if="isPreview" class="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
      <div class="text-[100px] font-bold text-gray-100 uppercase rotate-[-45deg] tracking-widest opacity-60">Vista Previa</div>
    </div>

    <div class="max-w-[850px] mx-auto mb-6 print:hidden flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm relative z-20">
      <button class="btn btn-ghost" @click="closeWindow">Volver</button>
      <div class="flex gap-2">
        <button class="btn btn-outline" @click="emailReceipt" :disabled="emailing || isPreview">
          <LucideMail :size="16" /> {{ emailing ? 'Enviando...' : 'Enviar email' }}
        </button>
        <button class="btn btn-secondary" @click="openInvoiceModal" :disabled="isPreview">
          <LucideFileText :size="16" /> Facturar CFDI
        </button>
        <button class="btn btn-primary" @click="triggerPrint">
          <LucidePrinter :size="16" /> Imprimir
        </button>
      </div>
    </div>

    <div class="max-w-[850px] mx-auto border border-gray-200 p-8 rounded-2xl print:border-none print:p-5 relative z-10 bg-white shadow-lg print:shadow-none print:max-w-none w-full min-h-[900px] flex flex-col justify-between">
      
      <div>
        <div class="flex justify-between items-start border-b border-gray-300 pb-5 mb-6">
          <div class="flex items-center gap-5 w-2/3">
            <img :src="logoSrc" alt="Logo" class="h-[60px] object-contain" />
            <div>
              <h2 class="m-0 text-sm font-bold text-gray-900 tracking-tight">{{ institutoNombre }}</h2>
              <p class="m-0 mt-0.5 text-[11px] text-brand-teal uppercase font-semibold">{{ isPreview ? 'Vista previa, carece de validez' : 'Comprobante de pago' }}</p>
              <p class="m-0 mt-1 text-[10px] text-gray-500">Documento no válido como comprobante fiscal.</p>
            </div>
          </div>
          <div class="w-1/3 text-right flex flex-col justify-center">
            <div class="bg-gray-50 border border-gray-200 rounded p-2 text-left w-full text-[11px]">
              <p class="m-0 mb-1 flex justify-between"><strong class="text-gray-600 uppercase">Emisión:</strong> <span class="font-mono text-gray-800">{{ fecha }}</span></p>
              <p class="m-0 flex justify-between"><strong class="text-gray-600 uppercase">Cajero:</strong> <span class="text-gray-800 truncate max-w-[120px]">{{ receiptData.usuario || activeUserName }}</span></p>
            </div>
          </div>
        </div>
        
        <table class="w-full text-xs mb-6 border-y border-gray-200">
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
              <td class="py-2 text-gray-700">{{ receiptData.ciclo || '2024' }}-{{ Number(receiptData.ciclo || '2024')+1 }}</td>
              <td class="py-2 text-gray-700">{{ receiptData.grado || '' }} {{ receiptData.grupo || '' }}</td>
            </tr>
          </tbody>
        </table>
        
        <div v-for="(r, i) in items" :key="i" class="mb-6">
          <table class="w-full text-[11px] border-collapse">
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
                <td class="py-1.5 px-2 text-gray-700">{{ r.formaDePago }}</td>
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
          <hr class="mt-4 border-gray-200 border-dashed" />
        </div>

        <div class="flex justify-between items-center p-5 bg-brand-leaf/5 rounded-lg border border-brand-leaf/20 mt-4 mb-6">
          <div class="flex-1 pr-6">
            <div class="text-[10px] font-semibold uppercase text-brand-teal mb-1">Importe en Letra</div>
            <div class="text-xs font-medium text-gray-700 leading-tight">{{ letrasGeneradas }}</div>
          </div>
          <div class="text-right border-l border-brand-leaf/20 pl-6">
            <div class="text-[10px] font-semibold uppercase text-brand-campus mb-1">Total abonado</div>
            <div class="text-xl font-bold text-brand-campus font-mono">${{ total.toFixed(2) }}</div>
          </div>
        </div>

      </div>

      <div class="mt-auto">
        <div class="grid grid-cols-2 gap-16 px-10 mt-10 pt-8 border-t border-dashed border-gray-300 text-center">
          <div>
            <div class="border-b border-gray-400 h-8 mb-2"></div>
            <div class="text-[10px] font-semibold text-gray-700 uppercase">Firma del Cajero</div>
            <div class="text-[9px] text-gray-500 mt-1">SISTEMA DE INGRESOS</div>
          </div>
          <div>
            <div class="border-b border-gray-400 h-8 mb-2"></div>
            <div class="text-[10px] font-semibold text-gray-700 uppercase">Firma de Conformidad</div>
            <div class="text-[9px] text-gray-500 mt-1">Titular de la cuenta</div>
          </div>
        </div>

        <div class="text-center mt-8 mb-2">
          <p class="italic text-gray-400 text-[10px]">“Compartimos contigo la formación integral de tus hijos”</p>
        </div>
      </div>
    </div>

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
const fecha = dayjs().format('DD/MM/YYYY HH:mm')
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