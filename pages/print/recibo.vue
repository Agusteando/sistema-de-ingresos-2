<template>
  <div class="bg-white min-h-screen p-10 font-sans text-neutral-ink print:p-0">
    <div class="max-w-[850px] mx-auto border border-neutral-mist p-10 rounded-lg print:border-none print:p-5">
      <div class="flex justify-between border-b-2 border-brand-campus pb-5 mb-8">
        <div class="flex items-center gap-5">
          <img src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp" alt="Logo" class="h-[70px] grayscale contrast-200" />
          <div>
            <h2 class="m-0 text-base font-bold text-brand-campus">{{ institutoNombre }}</h2>
            <p class="m-0 mt-1 text-xs text-brand-teal uppercase font-semibold">Comprobante de Caja</p>
          </div>
        </div>
        <div class="text-right text-xs text-gray-600">
          <p class="m-0 mb-1"><strong class="text-neutral-ink">Emisión:</strong> {{ fecha }}</p>
          <p class="m-0"><strong class="text-neutral-ink">Folios:</strong> {{ route.query.folios }}</p>
        </div>
      </div>
      
      <div class="grid grid-cols-3 gap-5 mb-8 bg-app p-4 rounded-md border border-neutral-mist">
        <div>
          <label class="block text-[10px] uppercase text-brand-teal font-bold mb-1">Alumno</label>
          <div class="text-sm font-semibold">{{ receiptData.nombreCompleto }}</div>
        </div>
        <div>
          <label class="block text-[10px] uppercase text-brand-teal font-bold mb-1">Matrícula</label>
          <div class="text-sm font-semibold">{{ receiptData.matricula }}</div>
        </div>
        <div>
          <label class="block text-[10px] uppercase text-brand-teal font-bold mb-1">Grado Escolar</label>
          <div class="text-sm font-semibold">{{ receiptData.nivel }} - {{ receiptData.grado }} {{ receiptData.grupo }}</div>
        </div>
      </div>
      
      <table class="w-full border-collapse mb-8 text-left">
        <thead>
          <tr>
            <th class="bg-app uppercase text-[11px] font-bold text-gray-600 border-b border-neutral-mist px-2 py-3">Folio Transacción</th>
            <th class="bg-app uppercase text-[11px] font-bold text-gray-600 border-b border-neutral-mist px-2 py-3">Concepto Desglosado</th>
            <th class="bg-app uppercase text-[11px] font-bold text-gray-600 border-b border-neutral-mist px-2 py-3">Vía de Pago</th>
            <th class="bg-app uppercase text-[11px] font-bold text-gray-600 border-b border-neutral-mist px-2 py-3 text-right">Importe Neto</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in items" :key="r.folio">
            <td class="border-b border-neutral-mist px-2 py-3 text-[13px]">{{ r.folio }}</td>
            <td class="border-b border-neutral-mist px-2 py-3 text-[13px]">{{ r.conceptoNombre }}</td>
            <td class="border-b border-neutral-mist px-2 py-3 text-[13px]">{{ r.formaDePago }}</td>
            <td class="border-b border-neutral-mist px-2 py-3 text-[13px] text-right">${{ Number(r.monto).toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>

      <div class="flex justify-between items-center p-4 bg-[#E6F2D8] rounded-md border border-brand-leaf mb-10">
        <div class="text-sm font-bold uppercase text-brand-campus">Suma Recibida (MXN)</div>
        <div class="text-2xl font-bold text-neutral-ink">${{ total.toFixed(2) }}</div>
      </div>

      <div class="text-center text-xs text-gray-600">
        <p class="mb-1">“Compartimos contigo la formación integral de tus hijos”</p>
        <p class="font-semibold text-neutral-ink">SISTEMA DE INGRESOS 2</p>
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

onMounted(async () => {
  const folios = route.query.folios
  if (!folios) return
  try {
    const res = await $fetch(`/api/payments/receipt?folios=${folios}&raw=true`)
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