<template>
  <div class="bg-white min-h-screen p-10 font-sans text-neutral-ink print:p-0 relative overflow-hidden">
    
    <!-- Watermark for preview mode -->
    <div v-if="isPreview" class="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
      <div class="text-[120px] font-black text-gray-200 uppercase rotate-[-45deg] tracking-widest opacity-50">Vista Previa</div>
    </div>

    <div class="max-w-[850px] mx-auto border border-gray-200 p-10 rounded-2xl print:border-none print:p-5 relative z-10 bg-white/80 backdrop-blur-sm shadow-xl print:shadow-none">
      <div class="flex justify-between border-b-2 border-brand-campus pb-6 mb-8">
        <div class="flex items-center gap-6">
          <img src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp" alt="Logo" class="h-[70px] grayscale contrast-200" />
          <div>
            <h2 class="m-0 text-base font-bold text-gray-800">{{ institutoNombre }}</h2>
            <p class="m-0 mt-1 text-xs text-brand-teal uppercase font-bold tracking-wider">Comprobante de Caja</p>
          </div>
        </div>
        <div class="text-right text-xs text-gray-500 font-medium flex flex-col justify-center">
          <p class="m-0 mb-1"><strong class="text-gray-700">Emisión:</strong> {{ fecha }}</p>
          <p class="m-0"><strong class="text-gray-700">Folios:</strong> {{ route.query.folios }}</p>
        </div>
      </div>
      
      <div class="grid grid-cols-3 gap-6 mb-10 bg-gray-50 p-6 rounded-xl border border-gray-100 shadow-inner">
        <div>
          <label class="block text-[10px] uppercase text-brand-teal font-bold tracking-wider mb-1.5">Alumno</label>
          <div class="text-sm font-bold text-gray-800">{{ receiptData.nombreCompleto }}</div>
        </div>
        <div>
          <label class="block text-[10px] uppercase text-brand-teal font-bold tracking-wider mb-1.5">Matrícula</label>
          <div class="text-sm font-bold text-gray-800 font-mono">{{ receiptData.matricula }}</div>
        </div>
        <div>
          <label class="block text-[10px] uppercase text-brand-teal font-bold tracking-wider mb-1.5">Grado Escolar</label>
          <div class="text-sm font-bold text-gray-800">{{ receiptData.nivel }} - {{ receiptData.grado }} {{ receiptData.grupo }}</div>
        </div>
      </div>
      
      <table class="w-full border-collapse mb-10 text-left">
        <thead>
          <tr>
            <th class="bg-gray-100/50 uppercase text-[11px] font-bold tracking-wider text-gray-500 border-b-2 border-gray-200 px-4 py-3">Folio Transacción</th>
            <th class="bg-gray-100/50 uppercase text-[11px] font-bold tracking-wider text-gray-500 border-b-2 border-gray-200 px-4 py-3">Concepto Desglosado</th>
            <th class="bg-gray-100/50 uppercase text-[11px] font-bold tracking-wider text-gray-500 border-b-2 border-gray-200 px-4 py-3">Vía de Pago</th>
            <th class="bg-gray-100/50 uppercase text-[11px] font-bold tracking-wider text-gray-500 border-b-2 border-gray-200 px-4 py-3 text-right">Importe Neto</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in items" :key="r.folio">
            <td class="border-b border-gray-100 px-4 py-4 text-[13px] font-mono text-gray-600">{{ r.folio }}</td>
            <td class="border-b border-gray-100 px-4 py-4 text-[13px] font-bold text-gray-800">{{ r.conceptoNombre }}</td>
            <td class="border-b border-gray-100 px-4 py-4 text-[13px] text-gray-600 font-medium">{{ r.formaDePago }}</td>
            <td class="border-b border-gray-100 px-4 py-4 text-[14px] text-right font-bold text-brand-campus font-mono">${{ Number(r.monto).toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>

      <div class="flex justify-between items-center p-6 bg-brand-leaf/10 rounded-xl border border-brand-leaf/30 mb-12">
        <div class="text-sm font-bold uppercase tracking-wider text-brand-campus">Suma Recibida (MXN)</div>
        <div class="text-3xl font-black text-brand-campus font-mono">${{ total.toFixed(2) }}</div>
      </div>

      <div class="text-center text-xs text-gray-500 mt-12 border-t border-gray-100 pt-8">
        <p class="mb-2 italic font-medium">“Compartimos contigo la formación integral de tus hijos”</p>
        <p class="font-bold text-gray-800 tracking-widest uppercase">SISTEMA DE INGRESOS 2</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'

definePageMeta({ layout: false })

const route = useRoute()
const items = ref([])
const receiptData = ref({})
const fecha = dayjs().format('DD/MM/YYYY HH:mm')
const isPreview = computed(() => route.query.preview === 'true')

onMounted(async () => {
  if (isPreview.value) {
    try {
      const data = JSON.parse(sessionStorage.getItem('receipt_preview') || '{}')
      items.value = data.items ||[]
      receiptData.value = data
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
const institutoNombre = computed(() => {
  return receiptData.value.nivel === 'Secundaria' 
    ? 'INSTITUTO EDUCATIVO PARA EL DESARROLLO INTEGRAL DEL SABER SC' 
    : 'INSTITUTO EDUCATIVO LA CASITA DEL SABER SC'
})
</script>

<style scoped>
@media print {
  @page { margin: 0; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style>