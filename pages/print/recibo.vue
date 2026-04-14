<template>
  <div class="bg-white min-h-screen p-10 font-sans text-neutral-ink print:p-0 relative overflow-hidden">
    
    <div v-if="isPreview" class="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
      <div class="text-[120px] font-black text-gray-200 uppercase rotate-[-45deg] tracking-widest opacity-50">Vista Previa</div>
    </div>

    <div class="max-w-[850px] mx-auto border border-gray-200 p-10 rounded-2xl print:border-none print:p-5 relative z-10 bg-white shadow-xl print:shadow-none print:max-w-none w-full">
      
      <!-- HEADER COMPLETO LEGACY COMPLIANT -->
      <div class="flex justify-between border-b-2 border-brand-campus pb-6 mb-8">
        <div class="flex items-center gap-6 w-2/3">
          <img src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp" alt="Logo" class="h-[80px] grayscale contrast-200" />
          <div>
            <h2 class="m-0 text-base font-black text-gray-900 tracking-tight">{{ institutoNombre }}</h2>
            <p class="m-0 mt-1 text-xs text-brand-teal uppercase font-bold tracking-wider">{{ isPreview ? 'Vista previa, este documento carece de validez' : 'Comprobante de pago' }}</p>
            <p class="m-0 mt-2 text-[10px] text-gray-500 leading-tight">Documento no válido como comprobante fiscal.<br/>Conserve este recibo para cualquier aclaración futura.</p>
          </div>
        </div>
        <div class="w-1/3 text-right flex flex-col justify-center">
          <div class="inline-block bg-gray-50 border border-gray-200 rounded-lg p-3 text-left">
            <p class="m-0 mb-1 text-xs"><strong class="text-gray-700 uppercase">Emisión:</strong> <span class="font-mono text-gray-600">{{ fecha }}</span></p>
            <p class="m-0 text-xs"><strong class="text-gray-700 uppercase">Usuario:</strong> <span class="text-gray-600 font-bold truncate max-w-[150px] inline-block align-bottom">{{ receiptData.usuario || 'Sistema' }}</span></p>
          </div>
        </div>
      </div>
      
      <!-- DATOS DEL ALUMNO -->
      <div class="grid grid-cols-4 gap-6 mb-10 bg-gray-50/80 p-6 rounded-xl border border-gray-200 shadow-inner">
        <div class="col-span-2">
          <label class="block text-[10px] uppercase text-brand-teal font-black tracking-widest mb-1.5">Nombre del Alumno</label>
          <div class="text-sm font-bold text-gray-800">{{ receiptData.nombreCompleto || 'ALUMNO NO ESPECIFICADO' }}</div>
        </div>
        <div>
          <label class="block text-[10px] uppercase text-brand-teal font-black tracking-widest mb-1.5">Matrícula</label>
          <div class="text-sm font-bold text-gray-800 font-mono">{{ receiptData.matricula || 'N/A' }}</div>
        </div>
        <div>
          <label class="block text-[10px] uppercase text-brand-teal font-black tracking-widest mb-1.5">Grado Escolar</label>
          <div class="text-sm font-bold text-gray-800">{{ receiptData.nivel || '' }} - {{ receiptData.grado || '' }} {{ receiptData.grupo || '' }}</div>
        </div>
      </div>
      
      <!-- DESGLOSE DE PAGOS EXACTAMENTE COMO LEGACY -->
      <div class="border border-gray-200 rounded-xl overflow-hidden mb-8">
        <table class="w-full border-collapse text-left">
          <thead>
            <tr>
              <th class="bg-gray-100/80 uppercase text-[10px] font-black tracking-widest text-gray-600 border-b border-gray-200 px-5 py-3">Concepto</th>
              <th class="bg-gray-100/80 uppercase text-[10px] font-black tracking-widest text-gray-600 border-b border-gray-200 px-5 py-3">Aplicable</th>
              <th class="bg-gray-100/80 uppercase text-[10px] font-black tracking-widest text-gray-600 border-b border-gray-200 px-5 py-3 text-center">Forma de Pago</th>
              <th class="bg-gray-100/80 uppercase text-[10px] font-black tracking-widest text-gray-600 border-b border-gray-200 px-5 py-3 text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in items" :key="r.folio">
              <td class="border-b border-gray-100 px-5 py-4 text-[13px] font-bold text-gray-900">{{ r.conceptoNombre }}</td>
              <td class="border-b border-gray-100 px-5 py-4 text-[12px] font-medium text-gray-700">{{ String(r.mes) === 'ev' ? new Date(r.fecha).toLocaleDateString() : (r.mesReal || r.mesLabel || `Mes ${r.mes}`) }}</td>
              <td class="border-b border-gray-100 px-5 py-4 text-[12px] text-gray-600 font-medium text-center bg-gray-50/50">{{ r.formaDePago }}</td>
              <td class="border-b border-gray-100 px-5 py-4 text-[14px] text-right font-black text-brand-campus font-mono">${{ Number(r.monto).toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- TOTAL Y LETRAS -->
      <div class="flex justify-between items-center p-6 bg-brand-leaf/10 rounded-xl border border-brand-leaf/30 mb-16">
        <div class="flex-1 pr-8">
          <div class="text-[10px] font-bold uppercase tracking-widest text-brand-teal mb-1">Importe en Letra</div>
          <div class="text-sm font-semibold text-gray-800 leading-tight">({{ letrasGeneradas }})</div>
        </div>
        <div class="text-right border-l border-brand-leaf/20 pl-8">
          <div class="text-xs font-bold uppercase tracking-widest text-brand-campus mb-1">Importe total</div>
          <div class="text-3xl font-black text-brand-campus font-mono">${{ total.toFixed(2) }}</div>
        </div>
      </div>

      <!-- FIRMAS Y PIE DE PÁGINA -->
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
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCookie } from '#app'
import dayjs from 'dayjs'
// Utilizing the new robust utility to match exact Mexican pesos terminology
import { numeroALetras } from '~/server/utils/numberToWords'

definePageMeta({ layout: false })

const route = useRoute()
const items = ref([])
const receiptData = ref({})
const fecha = dayjs().format('DD/MM/YYYY HH:mm:ss')
const isPreview = computed(() => route.query.preview === 'true')
const activeUserName = useCookie('auth_name').value || 'Administrador'

onMounted(async () => {
  if (isPreview.value) {
    try {
      const data = JSON.parse(sessionStorage.getItem('receipt_preview') || '{}')
      items.value = data.items || []
      receiptData.value = { ...data, usuario: activeUserName }
    } catch (e) {}
    return
  }

  const folios = route.query.folios
  if (!folios) return
  try {
    const res = await $fetch(`/api/payments/receipt?folios=${folios}`)
    if (res && res.length) {
      items.value = res
      receiptData.value = res[0]
      setTimeout(() => window.print(), 800)
    }
  } catch(e) {}
})

const total = computed(() => items.value.reduce((a,b) => a + Number(b.monto), 0))
const letrasGeneradas = computed(() => numeroALetras(total.value))
const institutoNombre = computed(() => {
  return receiptData.value.nivel === 'Secundaria' 
    ? 'INSTITUTO EDUCATIVO PARA EL DESARROLLO INTEGRAL DEL SABER SC' 
    : 'INSTITUTO EDUCATIVO LA CASITA DEL SABER SC'
})
</script>

<style scoped>
@media print {
  @page { margin: 0.5cm; size: letter portrait; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white !important; }
}
</style>