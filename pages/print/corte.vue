<template>
  <div class="corte-print-page bg-white min-h-screen p-6 font-sans text-neutral-ink print:p-0 relative">
    <div class="max-w-[1400px] mx-auto mb-6 print:hidden flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200">
      <button class="btn btn-ghost" @click="closeWindow">Volver</button>
      <button class="btn btn-primary" @click="triggerPrint"><LucidePrinter :size="16" /> Imprimir corte</button>
    </div>

    <div class="corte-document max-w-[1400px] mx-auto border border-gray-200 p-7 rounded-2xl print:border-none print:p-3 relative bg-white min-h-[700px] flex flex-col">
      <div class="corte-header flex justify-between items-start mb-5 border-b border-gray-200 pb-4">
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

      <section class="payments-list" aria-label="Movimientos del corte de caja">
        <div v-if="!rows.length" class="payments-empty">
          No se encontraron movimientos registrados.
        </div>

        <article
          v-for="r in rows"
          v-else
          :key="r.folio"
          class="payment-card"
          :class="rowClass(r)"
        >
          <div class="payment-field field-folio">
            <span class="payment-label">Folio</span>
            <strong class="payment-value payment-mono">{{ r.folio }}</strong>
          </div>
          <div class="payment-field field-registro">
            <span class="payment-label">Registro</span>
            <span class="payment-value">{{ formatDateTime(r.fecha) }}</span>
          </div>
          <div class="payment-field field-fecha-pago">
            <span class="payment-label">Fecha pago</span>
            <span class="payment-value">{{ formatDateTime(r.fechaPago) }}</span>
          </div>
          <div class="payment-field field-estatus">
            <span class="payment-label">Estatus</span>
            <strong class="payment-value">{{ r.estatusCorte }}</strong>
          </div>

          <div class="payment-field field-matricula">
            <span class="payment-label">Matrícula</span>
            <span class="payment-value payment-mono">{{ r.matricula }}</span>
          </div>
          <div class="payment-field field-alumno">
            <span class="payment-label">Alumno</span>
            <span class="payment-value">{{ r.nombreCompleto }}</span>
          </div>
          <div class="payment-field field-usuario">
            <span class="payment-label">Usuario</span>
            <span class="payment-value">{{ formatUser(r) }}</span>
          </div>

          <div class="payment-field field-ciclo">
            <span class="payment-label">Ciclo</span>
            <span class="payment-value">{{ r.ciclo }}</span>
          </div>
          <div class="payment-field field-documento">
            <span class="payment-label">Doc.</span>
            <span class="payment-value payment-mono">{{ String(r.documento || '').padStart(7, '0') }}</span>
          </div>
          <div class="payment-field field-mes">
            <span class="payment-label">Mes</span>
            <span class="payment-value">{{ r.mesReal || r.mes }}</span>
          </div>
          <div class="payment-field field-forma">
            <span class="payment-label">Forma</span>
            <span class="payment-value">{{ r.formaDePago }}</span>
          </div>

          <div class="payment-field field-concepto">
            <span class="payment-label">Concepto</span>
            <span class="payment-value">{{ r.conceptoNombre }}</span>
          </div>
          <div class="payment-field field-registrado">
            <span class="payment-label">Registrado</span>
            <strong class="payment-value payment-amount">${{ Number(r.monto || 0).toFixed(2) }}</strong>
          </div>
          <div class="payment-field field-aplicado">
            <span class="payment-label">Aplicado</span>
            <strong class="payment-value payment-amount">${{ Number(r.montoAplicado || 0).toFixed(2) }}</strong>
          </div>
        </article>
      </section>

      <div class="corte-totals mt-auto border-t border-gray-300 pt-4 flex justify-end">
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
.payments-list {
  width: 100%;
  margin-bottom: 1.25rem;
}

.payments-empty {
  padding: 1.5rem 0;
  color: #6b7280;
  font-size: 0.75rem;
  font-weight: 500;
  text-align: center;
}

.payment-card {
  display: grid;
  grid-template-columns:
    minmax(5.8rem, 0.78fr)
    minmax(7.4rem, 1fr)
    minmax(9rem, 1.28fr)
    minmax(7rem, 0.94fr);
  grid-template-areas:
    "folio registro fecha-pago estatus"
    "matricula alumno alumno usuario"
    "ciclo documento mes forma"
    "concepto concepto registrado aplicado";
  width: 100%;
  min-width: 0;
  border-bottom: 1px solid #6b7280;
  break-inside: avoid;
  page-break-inside: avoid;
}

.payment-card:first-of-type {
  border-top: 1px solid #6b7280;
}

.payment-field {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: baseline;
  min-width: 0;
  column-gap: 0.28rem;
  padding: 0.17rem 0.38rem 0.17rem 0;
  border-right: 1px solid #e5e7eb;
}

.payment-field:nth-child(4),
.payment-field:nth-child(7),
.payment-field:nth-child(11),
.payment-field:nth-child(14) {
  border-right: 0;
}

.payment-label {
  color: #6b7280;
  font-size: 0.42rem;
  font-weight: 700;
  line-height: 1.15;
  text-transform: uppercase;
  white-space: nowrap;
}

.payment-value {
  min-width: 0;
  color: #111827;
  font-size: 0.48rem;
  line-height: 1.18;
  overflow-wrap: anywhere;
  word-break: normal;
}

.payment-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.payment-amount {
  display: block;
  text-align: right;
  white-space: nowrap;
}

.field-folio { grid-area: folio; }
.field-registro { grid-area: registro; }
.field-fecha-pago { grid-area: fecha-pago; }
.field-estatus { grid-area: estatus; }
.field-matricula { grid-area: matricula; }
.field-alumno { grid-area: alumno; }
.field-usuario { grid-area: usuario; }
.field-ciclo { grid-area: ciclo; }
.field-documento { grid-area: documento; }
.field-mes { grid-area: mes; }
.field-forma { grid-area: forma; }
.field-concepto { grid-area: concepto; }
.field-registrado { grid-area: registrado; }
.field-aplicado { grid-area: aplicado; }

@media (max-width: 900px) {
  .payment-card {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-areas:
      "folio estatus"
      "registro fecha-pago"
      "matricula ciclo"
      "alumno alumno"
      "usuario usuario"
      "documento mes"
      "forma forma"
      "concepto concepto"
      "registrado aplicado";
  }

  .payment-field {
    border-right: 1px solid #e5e7eb;
  }

  .field-estatus,
  .field-fecha-pago,
  .field-ciclo,
  .field-alumno,
  .field-usuario,
  .field-mes,
  .field-forma,
  .field-concepto,
  .field-aplicado {
    border-right: 0;
  }
}

@media print {
  @page { margin: 0.35cm; size: letter landscape; }

  :global(html),
  :global(body) {
    width: 100%;
    margin: 0;
    overflow: visible;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    background-color: white;
  }

  .corte-print-page,
  .corte-document {
    width: 100%;
    max-width: none;
    min-width: 0;
    overflow: visible;
    box-sizing: border-box;
  }

  .corte-header,
  .corte-totals {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .payment-card {
    grid-template-columns:
      minmax(4.9rem, 0.76fr)
      minmax(6.5rem, 0.98fr)
      minmax(8.2rem, 1.3fr)
      minmax(6.2rem, 0.96fr);
    grid-template-areas:
      "folio registro fecha-pago estatus"
      "matricula alumno alumno usuario"
      "ciclo documento mes forma"
      "concepto concepto registrado aplicado";
  }

  .payment-field {
    column-gap: 0.16rem;
    padding: 0.08rem 0.2rem 0.08rem 0;
  }

  .payment-label {
    font-size: 5.2pt;
    line-height: 1.08;
  }

  .payment-value {
    font-size: 6.1pt;
    line-height: 1.1;
  }
}
</style>
