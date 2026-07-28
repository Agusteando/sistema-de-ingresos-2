<template>
  <div class="bg-white min-h-screen p-6 font-sans text-neutral-ink print:p-0 relative">
    <div class="max-w-[1400px] mx-auto mb-6 print:hidden flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200">
      <button class="btn btn-ghost" @click="closeWindow">Volver</button>
      <button class="btn btn-primary" @click="triggerPrint"><LucidePrinter :size="16" /> Imprimir corte</button>
    </div>

    <div class="max-w-[1400px] mx-auto border border-gray-200 p-7 rounded-2xl print:border-none print:p-3 relative bg-white min-h-[700px] flex flex-col">
      <div class="flex justify-between items-start mb-5 border-b border-gray-200 pb-4">
        <img src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp" alt="Logo Institucional" class="h-[46px] object-contain" />
        <div class="text-center flex-1 mx-4">
          <h2 class="m-0 text-[12px] font-bold text-gray-900 uppercase tracking-tight">Instituto Educativo para el Desarrollo Integral del Saber SC</h2>
          <p class="mt-1 text-[9px] text-gray-500">Bitácora completa por fecha de registro · Todos los ciclos y estatus</p>
        </div>
        <div class="text-right text-[9px] text-gray-600">
          <div class="font-bold text-[11px] mb-1 text-gray-900 uppercase">Corte de caja</div>
          <div>{{ generatedAt }}</div>
          <div>Plantel: {{ reportPlantel }}</div>
          <div>Periodo: {{ reportPeriod }}</div>
          <div>Generado por: {{ activeUserName }}</div>
        </div>
      </div>

      <table class="w-full text-[8px] border-collapse mb-5">
        <thead>
          <tr class="border-b border-gray-300">
            <th class="py-1.5 pr-1 text-left font-semibold text-gray-600 uppercase">Folio</th>
            <th class="py-1.5 pr-1 text-left font-semibold text-gray-600 uppercase">Registro</th>
            <th class="py-1.5 pr-1 text-left font-semibold text-gray-600 uppercase">Fecha pago</th>
            <th class="py-1.5 pr-1 text-left font-semibold text-gray-600 uppercase">Matrícula</th>
            <th class="py-1.5 pr-1 text-left font-semibold text-gray-600 uppercase">Ciclo</th>
            <th class="py-1.5 pr-1 text-left font-semibold text-gray-600 uppercase">Doc</th>
            <th class="py-1.5 pr-1 text-left font-semibold text-gray-600 uppercase">Mes</th>
            <th class="py-1.5 pr-1 text-left font-semibold text-gray-600 uppercase">Alumno</th>
            <th class="py-1.5 pr-1 text-left font-semibold text-gray-600 uppercase">Concepto</th>
            <th class="py-1.5 pr-1 text-left font-semibold text-gray-600 uppercase">Forma</th>
            <th class="py-1.5 pr-1 text-left font-semibold text-gray-600 uppercase">Usuario</th>
            <th class="py-1.5 pr-1 text-left font-semibold text-gray-600 uppercase">Estatus</th>
            <th class="py-1.5 pr-1 text-right font-semibold text-gray-600 uppercase">Registrado</th>
            <th class="py-1.5 text-right font-semibold text-gray-600 uppercase">Aplicado</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!rows.length">
            <td colspan="14" class="text-center py-6 text-gray-500 font-medium">No se encontraron movimientos registrados.</td>
          </tr>
          <tr v-else v-for="r in rows" :key="r.folio" class="border-b border-gray-100" :class="rowClass(r)">
            <td class="py-1.5 pr-1 text-gray-900 font-mono">{{ r.folio }}</td>
            <td class="py-1.5 pr-1 text-gray-900 whitespace-nowrap">{{ formatDateTime(r.fecha) }}</td>
            <td class="py-1.5 pr-1 text-gray-900 whitespace-nowrap">{{ formatDateTime(r.fechaPago) }}</td>
            <td class="py-1.5 pr-1 text-gray-900 font-mono">{{ r.matricula }}</td>
            <td class="py-1.5 pr-1 text-gray-900">{{ r.ciclo }}</td>
            <td class="py-1.5 pr-1 text-gray-900 font-mono">{{ String(r.documento || '').padStart(7, '0') }}</td>
            <td class="py-1.5 pr-1 text-gray-900">{{ r.mesReal || r.mes }}</td>
            <td class="py-1.5 pr-1 text-gray-900">{{ r.nombreCompleto }}</td>
            <td class="py-1.5 pr-1 text-gray-900">{{ r.conceptoNombre }}</td>
            <td class="py-1.5 pr-1 text-gray-900">{{ r.formaDePago }}</td>
            <td class="py-1.5 pr-1 text-gray-900">{{ formatUser(r) }}</td>
            <td class="py-1.5 pr-1 font-semibold">{{ r.estatusCorte }}</td>
            <td class="py-1.5 pr-1 text-right font-semibold text-gray-900">${{ Number(r.monto || 0).toFixed(2) }}</td>
            <td class="py-1.5 text-right font-bold text-gray-900">${{ Number(r.montoAplicado || 0).toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>

      <div class="mt-auto border-t border-gray-300 pt-4 flex justify-end">
        <div class="w-[360px] text-[9px]">
          <div v-for="t in totales" :key="t.formaDePago" class="flex justify-between py-1 border-b border-gray-100">
            <span class="font-semibold text-gray-600 uppercase">{{ t.formaDePago }} aplicado:</span>
            <span class="font-medium text-gray-900">${{ Number(t.total).toFixed(2) }}</span>
          </div>
          <div class="flex justify-between py-1 mt-1">
            <span class="font-semibold text-gray-600 uppercase">Importe registrado:</span>
            <span class="font-medium text-gray-900">${{ Number(totalRegistrado).toFixed(2) }}</span>
          </div>
          <div class="flex justify-between py-1">
            <span class="font-semibold text-gray-600 uppercase">Importe no aplicado:</span>
            <span class="font-medium text-gray-900">${{ Number(totalNoAplicado).toFixed(2) }}</span>
          </div>
          <div class="flex justify-between py-2 mt-1 border-t border-gray-800 font-bold text-[10px] text-gray-900 uppercase">
            <span>Importe total al corte:</span>
            <span>${{ Number(totalAplicado).toFixed(2) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCookie } from '#app'
import { LucidePrinter } from 'lucide-vue-next'

definePageMeta({ layout: false })

const route = useRoute()
const rows = ref([])
const totales = ref([])
const totalRegistrado = ref(0)
const totalNoAplicado = ref(0)
const totalAplicado = ref(0)
const activeUserName = ref(useCookie('auth_name').value || 'Administrador')
const reportPlantel = ref('')
const reportFilters = ref({ inicio: '', fin: '' })
const generatedAt = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  dateStyle: 'short',
  timeStyle: 'medium'
}).format(new Date())

const formatDateTime = (value) => {
  if (!value) return ''
  if (value instanceof Date) {
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(value)
  }
  const raw = String(value)
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/)
  if (!match) return raw
  return `${match[3]}/${match[2]}/${match[1]}${match[4] ? ` ${match[4]}:${match[5]}` : ''}`
}

const formatUser = (row) => {
  const name = String(row?.usuario || '').trim()
  const email = String(row?.usuario_email || '').trim().toLowerCase()
  if (name && email && name.toLowerCase() !== email) return `${name} (${email})`
  return email || name || 'No identificado'
}

const rowClass = (row) => {
  const status = String(row?.estatusCorte || '').toLowerCase()
  if (status.includes('cancel')) return 'bg-red-50 text-red-800'
  if (status.includes('depur')) return 'bg-amber-50 text-amber-800'
  return ''
}

const formatDateKey = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '')
}

const reportPeriod = computed(() => {
  const { inicio, fin } = reportFilters.value
  if (!inicio || !fin) return 'Hoy'
  if (inicio === fin) return formatDateKey(inicio)
  return `${formatDateKey(inicio)} al ${formatDateKey(fin)}`
})

onMounted(async () => {
  const query = new URLSearchParams(route.query).toString()
  try {
    const res = await $fetch(`/api/reports/corte_print?${query}`)
    rows.value = res.rows || []
    totales.value = res.totales || []
    totalRegistrado.value = Number(res.totalRegistrado || 0)
    totalNoAplicado.value = Number(res.totalNoAplicado || 0)
    totalAplicado.value = Number(res.total || 0)
    activeUserName.value = res.usuario?.nombre || activeUserName.value
    reportPlantel.value = res.filtros?.plantel || ''
    reportFilters.value = {
      inicio: res.filtros?.inicio || '',
      fin: res.filtros?.fin || ''
    }
    setTimeout(() => window.print(), 800)
  } catch (e) {}
})

const closeWindow = () => window.close()
const triggerPrint = () => window.print()
</script>

<style scoped>
@media print {
  @page { margin: 0.4cm; size: letter landscape; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white; }
}
</style>
