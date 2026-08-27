<template>
  <div class="bg-white min-h-screen p-10 font-sans text-neutral-ink print:p-0 relative">
    <div class="max-w-[1180px] mx-auto mb-6 print:hidden flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200">
      <button class="btn btn-ghost" @click="closeWindow">Volver</button>
      <button class="btn btn-primary" @click="triggerPrint"><LucidePrinter :size="16" /> Imprimir reporte</button>
    </div>

    <div class="max-w-[1180px] mx-auto border border-gray-200 p-8 rounded-2xl print:border-none print:p-4 relative bg-white min-h-[900px] flex flex-col">
      <div class="flex justify-between items-start mb-6 border-b border-gray-200 pb-5">
        <img src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp" alt="Logo Institucional" class="h-[50px] object-contain" />
        <div class="text-center flex-1 mx-4">
          <h2 class="m-0 text-[13px] font-bold text-gray-900 uppercase tracking-tight">{{ institutionName }}</h2>
          <div class="mt-2 text-[12px] font-semibold text-gray-700">{{ isMissingMode ? 'Alumnos inscritos sin concepto' : 'Reporte por concepto' }}</div>
          <div class="text-[12px] text-gray-600">{{ conceptLabel }}</div>
          <div class="text-[11px] text-gray-500">{{ isMissingMode ? `${cycleLabel} · Solo alumnos inscritos` : 'Histórico financiero del periodo seleccionado' }}</div>
        </div>
        <div class="text-right text-[11px] text-gray-600">
          <div class="font-bold text-[12px] mb-1 text-gray-900 uppercase">Reporte</div>
          <div>{{ new Date().toLocaleString('es-MX') }}</div>
          <div>Usuario: {{ activeUserName }}</div>
        </div>
      </div>

      <div v-if="!isMissingMode" class="grid grid-cols-4 gap-3 mb-6 text-[11px]">
        <div class="border border-gray-200 rounded-lg p-3">
          <div class="text-gray-500 uppercase font-bold">Registrado</div>
          <div class="text-gray-900 font-bold text-[14px]">${{ Number(resumen.totalRegistrado || 0).toFixed(2) }}</div>
        </div>
        <div class="border border-gray-200 rounded-lg p-3">
          <div class="text-gray-500 uppercase font-bold">Aplicado</div>
          <div class="text-gray-900 font-bold text-[14px]">${{ Number(resumen.total || 0).toFixed(2) }}</div>
        </div>
        <div class="border border-gray-200 rounded-lg p-3">
          <div class="text-gray-500 uppercase font-bold">No aplicado</div>
          <div class="text-gray-900 font-bold text-[14px]">${{ Number(resumen.totalNoAplicado || 0).toFixed(2) }}</div>
        </div>
        <div class="border border-gray-200 rounded-lg p-3">
          <div class="text-gray-500 uppercase font-bold">Movimientos</div>
          <div class="text-gray-900 font-bold text-[14px]">{{ resumen.transacciones || 0 }}</div>
        </div>
      </div>

      <div v-else class="grid grid-cols-4 gap-3 mb-6 text-[11px]">
        <div class="border border-gray-200 rounded-lg p-3">
          <div class="text-gray-500 uppercase font-bold">Inscritos revisados</div>
          <div class="text-gray-900 font-bold text-[14px]">{{ resumen.inscritos || 0 }}</div>
        </div>
        <div class="border border-gray-200 rounded-lg p-3">
          <div class="text-gray-500 uppercase font-bold">Con faltantes</div>
          <div class="text-gray-900 font-bold text-[14px]">{{ resumen.alumnos || 0 }}</div>
        </div>
        <div class="border border-gray-200 rounded-lg p-3">
          <div class="text-gray-500 uppercase font-bold">Selección completa</div>
          <div class="text-gray-900 font-bold text-[14px]">{{ resumen.completos || 0 }}</div>
        </div>
        <div class="border border-gray-200 rounded-lg p-3">
          <div class="text-gray-500 uppercase font-bold">Cobertura</div>
          <div class="text-gray-900 font-bold text-[14px]">{{ Number(resumen.cobertura || 0).toFixed(1) }}%</div>
        </div>
      </div>

      <div v-if="!isMissingMode" class="mb-4 text-[10px] text-gray-600">
        Incluye movimientos vigentes, cancelados y depurados del historial financiero. Cancelados y depuraciones permanecen visibles y muestran importe aplicado de $0.00 cuando corresponde.
      </div>
      <div v-else class="mb-4 text-[10px] text-gray-600">
        Se incluyen únicamente alumnos con estado de inscripción “inscrito” en {{ cycleLabel }}. Una asignación activa o un pago vigente del mismo ciclo cuenta como presencia del concepto.
      </div>

      <table v-if="!isMissingMode" class="w-full text-[8px] border-collapse mb-8">
        <thead>
          <tr class="border-b border-gray-300">
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Folio</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Fecha</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Matrícula</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Nombres</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">A. paterno</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">A. materno</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Nivel</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Grado</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">CURP</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Nacimiento</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Doc</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Mes</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Concepto</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Forma</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Estatus</th>
            <th class="py-2 text-right font-semibold text-gray-600 uppercase">Registrado</th>
            <th class="py-2 text-right font-semibold text-gray-600 uppercase">Aplicado</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!rows.length">
            <td colspan="17" class="text-center py-6 text-gray-500 font-medium">No se encontraron movimientos.</td>
          </tr>
          <tr v-else v-for="r in rows" :key="`${r.folio}-${r.concepto}`" class="border-b border-gray-100">
            <td class="py-2 text-gray-900 font-mono">{{ r.folio }}</td>
            <td class="py-2 text-gray-900">{{ formatDate(r.fecha) }}</td>
            <td class="py-2 text-gray-900 font-mono">{{ r.matricula }}</td>
            <td class="py-2 text-gray-900">{{ r.nombres || '—' }}</td>
            <td class="py-2 text-gray-900">{{ r.apellidoPaterno || '—' }}</td>
            <td class="py-2 text-gray-900">{{ r.apellidoMaterno || '—' }}</td>
            <td class="py-2 text-gray-900">{{ r.nivel || '—' }}</td>
            <td class="py-2 text-gray-900">{{ r.grado || '—' }}</td>
            <td class="py-2 text-gray-900 font-mono">{{ r.curp || '—' }}</td>
            <td class="py-2 text-gray-900">{{ formatDate(r.fechaNacimiento) || '—' }}</td>
            <td class="py-2 text-gray-900 font-mono">{{ String(r.documento).padStart(7, '0') }}</td>
            <td class="py-2 text-gray-900">{{ r.mesReal || r.mes }}</td>
            <td class="py-2 text-gray-900">{{ r.conceptoNombre || r.concepto }}</td>
            <td class="py-2 text-gray-900">{{ r.formaDePago }}</td>
            <td class="py-2 text-gray-900 font-semibold">{{ r.estatusReporte || r.estatus || 'Vigente' }}</td>
            <td class="py-2 text-right font-semibold text-gray-900">${{ Number(r.montoRegistrado ?? r.monto ?? 0).toFixed(2) }}</td>
            <td class="py-2 text-right font-bold text-gray-900">${{ Number(r.montoAplicado || 0).toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>

      <table v-else class="w-full text-[8px] border-collapse mb-8">
        <thead>
          <tr class="border-b border-gray-300">
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Matrícula</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Nombres</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">A. paterno</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">A. materno</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Nivel</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Grado</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">CURP</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Nacimiento</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Plantel</th>
            <th class="py-2 text-left font-semibold text-gray-600 uppercase">Concepto(s) faltante(s)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!rows.length">
            <td colspan="10" class="text-center py-6 text-gray-500 font-medium">{{ Number(resumen.inscritos || 0) === 0 ? 'No hay alumnos inscritos para el ciclo y plantel seleccionados.' : 'Todos los alumnos inscritos tienen la selección completa.' }}</td>
          </tr>
          <tr v-else v-for="r in rows" :key="`${r.matricula}-${r.conceptosFaltantesTexto}`" class="border-b border-gray-100">
            <td class="py-2 text-gray-900 font-mono">{{ r.matricula }}</td>
            <td class="py-2 text-gray-900">{{ r.nombres || '—' }}</td>
            <td class="py-2 text-gray-900">{{ r.apellidoPaterno || '—' }}</td>
            <td class="py-2 text-gray-900">{{ r.apellidoMaterno || '—' }}</td>
            <td class="py-2 text-gray-900">{{ r.nivel || '—' }}</td>
            <td class="py-2 text-gray-900">{{ r.grado || '—' }}</td>
            <td class="py-2 text-gray-900 font-mono">{{ r.curp || '—' }}</td>
            <td class="py-2 text-gray-900">{{ formatDate(r.fechaNacimiento) || '—' }}</td>
            <td class="py-2 text-gray-900">{{ r.plantel || '—' }}</td>
            <td class="py-2 text-gray-900">{{ r.conceptosFaltantesTexto || '—' }}</td>
          </tr>
        </tbody>
      </table>

      <div v-if="!isMissingMode" class="mt-auto border-t border-gray-300 pt-5 flex justify-end">
        <div class="w-[360px] text-[11px]">
          <div v-for="t in resumen.formasPago" :key="t.formaDePago" class="flex justify-between py-1 border-b border-gray-100">
            <span class="font-semibold text-gray-600 uppercase">{{ t.formaDePago }} aplicado:</span>
            <span class="font-medium text-gray-900">${{ Number(t.total).toFixed(2) }}</span>
          </div>
          <div class="flex justify-between py-1 mt-2">
            <span class="font-semibold text-gray-600 uppercase">Importe registrado:</span>
            <span class="font-medium text-gray-900">${{ Number(resumen.totalRegistrado || 0).toFixed(2) }}</span>
          </div>
          <div class="flex justify-between py-1">
            <span class="font-semibold text-gray-600 uppercase">Importe no aplicado:</span>
            <span class="font-medium text-gray-900">${{ Number(resumen.totalNoAplicado || 0).toFixed(2) }}</span>
          </div>
          <div class="flex justify-between py-2 mt-1 border-t border-gray-800 font-bold text-[12px] text-gray-900 uppercase">
            <span>Importe aplicado:</span>
            <span>${{ Number(resumen.total || 0).toFixed(2) }}</span>
          </div>
        </div>
      </div>
      <div v-else class="mt-auto border-t border-gray-300 pt-4 text-[10px] text-gray-600 flex justify-between gap-6">
        <span>Plantel: {{ reportPlantel || '—' }} · {{ cycleLabel }}</span>
        <span>Conceptos faltantes: {{ resumen.conceptosFaltantes ?? resumen.asignacionesFaltantes ?? 0 }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCookie } from '#app'
import { LucidePrinter } from 'lucide-vue-next'
import { institutionNameForPlantel } from '~/shared/utils/institution'

definePageMeta({ layout: false })

const route = useRoute()
const rows = ref([])
const conceptos = ref([])
const resumen = ref({ total: 0, totalRegistrado: 0, totalNoAplicado: 0, transacciones: 0, alumnos: 0, formasPago: [], inscritos: 0, completos: 0, cobertura: 0, conceptosFaltantes: 0, asignacionesFaltantes: 0 })
const reportMode = ref('movements')
const reportCycleLabel = ref('')
const activeUserName = useCookie('auth_name').value || 'Usuario'
const reportPlantel = ref('')
const institutionName = computed(() => institutionNameForPlantel(reportPlantel.value))
const isMissingMode = computed(() => reportMode.value === 'missing')
const cycleLabel = computed(() => reportCycleLabel.value || String(route.query.ciclo || 'Ciclo escolar'))
const conceptLabel = computed(() => {
  const names = conceptos.value.map(item => item?.concepto).filter(Boolean)
  if (!names.length) return 'Concepto'
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
})

const formatDate = (value) => {
  if (!value) return ''
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value)
}

onMounted(async () => {
  const query = new URLSearchParams(route.query).toString()
  try {
    const res = await $fetch(`/api/reports/concepto?${query}`)
    rows.value = res.rows || []
    conceptos.value = Array.isArray(res.conceptos) ? res.conceptos : (res.concepto ? [res.concepto] : [])
    resumen.value = res.resumen || resumen.value
    reportMode.value = res.modo === 'missing' ? 'missing' : 'movements'
    reportCycleLabel.value = res.filtros?.cicloLabel || res.filtros?.ciclo || ''
    reportPlantel.value = res.filtros?.plantel || res.rows?.[0]?.scopePlantel || res.rows?.[0]?.plantel || route.query.plantel || ''
    setTimeout(() => window.print(), 800)
  } catch (e) {}
})

const closeWindow = () => window.close()
const triggerPrint = () => window.print()
</script>

<style scoped>
@media print {
  @page { margin: 0.45cm; size: letter landscape; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white; }
}
</style>
