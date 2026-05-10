<template>
  <div class="bg-white min-h-screen p-10 font-sans text-neutral-ink print:p-0 relative">
    <div class="max-w-[1000px] mx-auto mb-6 print:hidden flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200">
      <button class="btn btn-ghost" @click="closeWindow">Volver</button>
      <button class="btn btn-primary" @click="triggerPrint"><LucidePrinter :size="16" /> Imprimir reporte</button>
    </div>

    <div class="max-w-[1000px] mx-auto border border-gray-200 p-10 rounded-2xl print:border-none print:p-5 relative bg-white min-h-[900px] flex flex-col">
      <div class="flex justify-between items-start mb-8 border-b border-gray-200 pb-5">
        <img src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp" alt="Logo Institucional" class="h-[50px] object-contain" />
        <div class="text-center flex-1 mx-4">
          <h2 class="m-0 text-[13px] font-bold text-gray-900 uppercase tracking-tight">Instituto Educativo para el Desarrollo Integral del Saber SC</h2>
          <div class="mt-2 text-[12px] font-semibold text-gray-700">Reporte por concepto</div>
          <div class="text-[12px] text-gray-600">{{ concepto?.concepto || 'Concepto' }}</div>
        </div>
        <div class="text-right text-[11px] text-gray-600">
          <div class="font-bold text-[12px] mb-1 text-gray-900 uppercase">Reporte</div>
          <div>{{ new Date().toLocaleString('es-MX') }}</div>
          <div>Usuario: {{ activeUserName }}</div>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3 mb-6 text-[11px]">
        <div class="border border-gray-200 rounded-lg p-3">
          <div class="text-gray-500 uppercase font-bold">Total</div>
          <div class="text-gray-900 font-bold text-[14px]">${{ Number(resumen.total || 0).toFixed(2) }}</div>
        </div>
        <div class="border border-gray-200 rounded-lg p-3">
          <div class="text-gray-500 uppercase font-bold">Movimientos</div>
          <div class="text-gray-900 font-bold text-[14px]">{{ resumen.transacciones || 0 }}</div>
        </div>
        <div class="border border-gray-200 rounded-lg p-3">
          <div class="text-gray-500 uppercase font-bold">Alumnos</div>
          <div class="text-gray-900 font-bold text-[14px]">{{ resumen.alumnos || 0 }}</div>
        </div>
      </div>

      <table class="w-full text-[11px] border-collapse mb-8">
        <thead>
          <tr class="border-b border-gray-300">
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Folio</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Fecha</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Matrícula</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Doc</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Mes</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Alumno</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Forma</th>
            <th class="py-2 text-right font-semibold text-gray-600 uppercase">Monto</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!rows.length">
            <td colspan="8" class="text-center py-6 text-gray-500 font-medium">No se encontraron movimientos.</td>
          </tr>
          <tr v-else v-for="r in rows" :key="r.folio" class="border-b border-gray-100">
            <td class="py-2 text-gray-900 font-mono">{{ r.folio }}</td>
            <td class="py-2 text-gray-900">{{ new Date(r.fecha).toLocaleDateString('es-MX') }}</td>
            <td class="py-2 text-gray-900 font-mono">{{ r.matricula }}</td>
            <td class="py-2 text-gray-900 font-mono">{{ String(r.documento).padStart(7, '0') }}</td>
            <td class="py-2 text-gray-900">{{ r.mesReal || r.mes }}</td>
            <td class="py-2 text-gray-900">{{ r.nombreCompleto }}</td>
            <td class="py-2 text-gray-900">{{ r.formaDePago }}</td>
            <td class="py-2 text-right font-bold text-gray-900">${{ Number(r.monto).toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>

      <div class="mt-auto border-t border-gray-300 pt-5 flex justify-end">
        <div class="w-1/3 text-[11px]">
          <div v-for="t in resumen.formasPago" :key="t.formaDePago" class="flex justify-between py-1 border-b border-gray-100">
            <span class="font-semibold text-gray-600 uppercase">{{ t.formaDePago }}:</span>
            <span class="font-medium text-gray-900">${{ Number(t.total).toFixed(2) }}</span>
          </div>
          <div class="flex justify-between py-2 mt-2 border-t border-gray-800 font-bold text-[12px] text-gray-900 uppercase">
            <span>Importe total:</span>
            <span>${{ Number(resumen.total || 0).toFixed(2) }}</span>
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
const concepto = ref(null)
const resumen = ref({ total: 0, transacciones: 0, alumnos: 0, formasPago: [] })
const activeUserName = useCookie('auth_name').value || 'Usuario'

onMounted(async () => {
  const query = new URLSearchParams(route.query).toString()
  try {
    const res = await $fetch(`/api/reports/concepto?${query}`)
    rows.value = res.rows || []
    concepto.value = res.concepto || null
    resumen.value = res.resumen || resumen.value
    setTimeout(() => window.print(), 800)
  } catch (e) {}
})

const closeWindow = () => window.close()
const triggerPrint = () => window.print()
</script>

<style scoped>
@media print {
  @page { margin: 0.5cm; size: letter portrait; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white; }
}
</style>
