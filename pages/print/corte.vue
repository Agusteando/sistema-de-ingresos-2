<template>
  <div class="bg-white min-h-screen p-10 font-sans text-neutral-ink print:p-0 relative">
    <div class="max-w-[1000px] mx-auto mb-6 print:hidden flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200">
      <button class="btn btn-ghost" @click="closeWindow">Volver</button>
      <button class="btn btn-primary" @click="triggerPrint"><LucidePrinter :size="16" /> Imprimir corte de caja</button>
    </div>

    <div class="max-w-[1000px] mx-auto border border-gray-200 p-10 rounded-2xl print:border-none print:p-5 relative bg-white min-h-[900px] flex flex-col">
      
      <div class="flex justify-between items-start mb-10 border-b border-gray-200 pb-6">
        <img src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp" alt="Logo Institucional" class="h-[60px] object-contain" />
        <div class="text-center flex-1 mx-4">
          <h2 class="m-0 text-[14px] font-black text-gray-900 uppercase tracking-tight">Instituto Educativo para el Desarrollo Integral del Saber SC</h2>
        </div>
        <div class="text-right text-[11px] text-gray-600">
          <div class="font-bold text-[12px] mb-1 text-gray-900 uppercase tracking-wider">Corte de caja</div>
          <div>Fecha Impresión: {{ new Date().toLocaleString('es-MX') }}</div>
          <div>Usuario: {{ activeUserName }}</div>
        </div>
      </div>

      <table class="w-full text-[11px] border-collapse mb-10">
        <thead>
          <tr class="border-b border-gray-300">
            <th class="py-2 text-left font-bold text-gray-800">Folio</th>
            <th class="py-2 text-left font-bold text-gray-800">Fecha</th>
            <th class="py-2 text-left font-bold text-gray-800">Matrícula</th>
            <th class="py-2 text-left font-bold text-gray-800">Documento</th>
            <th class="py-2 text-left font-bold text-gray-800">Mes</th>
            <th class="py-2 text-left font-bold text-gray-800">Nombre Completo</th>
            <th class="py-2 text-left font-bold text-gray-800">Concepto</th>
            <th class="py-2 text-right font-bold text-gray-800">Monto</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!rows.length">
            <td colspan="8" class="text-center py-6 text-gray-500 font-medium">No se encontraron movimientos en este periodo.</td>
          </tr>
          <tr v-else v-for="r in rows" :key="r.folio" class="border-b border-gray-100">
            <td class="py-2 text-gray-900 font-medium">{{ r.folio }}</td>
            <td class="py-2 text-gray-900">{{ new Date(r.fecha).toLocaleDateString('es-MX') }}</td>
            <td class="py-2 text-gray-900">{{ r.matricula }}</td>
            <td class="py-2 text-gray-900">{{ String(r.documento).padStart(7, '0') }}</td>
            <td class="py-2 text-gray-900">{{ r.mes }}</td>
            <td class="py-2 text-gray-900">{{ r.nombreCompleto }}</td>
            <td class="py-2 text-gray-900">{{ r.conceptoNombre }}</td>
            <td class="py-2 text-right font-bold text-gray-900">${{ Number(r.monto).toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>

      <div class="mt-auto border-t border-gray-300 pt-6 flex justify-end">
        <div class="w-1/3 text-[11px]">
          <div v-for="t in totales" :key="t.formaDePago" class="flex justify-between py-1 border-b border-gray-100">
            <span class="font-bold text-gray-700 uppercase tracking-wide">{{ t.formaDePago }}:</span>
            <span class="font-medium text-gray-900">${{ Number(t.total).toFixed(2) }}</span>
          </div>
          <div class="flex justify-between py-2 mt-2 border-t-2 border-gray-800 font-black text-[13px] text-gray-900 uppercase">
            <span>Importe Total:</span>
            <span>${{ totales.reduce((acc, t) => acc + Number(t.total), 0).toFixed(2) }}</span>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCookie } from '#app'
import { LucidePrinter } from 'lucide-vue-next'

definePageMeta({ layout: false })

const route = useRoute()
const rows = ref([])
const totales = ref([])
const activeUserName = useCookie('auth_name').value || 'Administrador'

onMounted(async () => {
  const query = new URLSearchParams(route.query).toString()
  try {
    const res = await $fetch(`/api/reports/corte_print?${query}`)
    rows.value = res.rows || []
    totales.value = res.totales || []
    setTimeout(() => window.print(), 800)
  } catch(e) {}
})

const closeWindow = () => window.close()
const triggerPrint = () => window.print()
</script>

<style scoped>
@media print {
  @page { margin: 0.5cm; size: letter portrait; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white !important; }
}
</style>