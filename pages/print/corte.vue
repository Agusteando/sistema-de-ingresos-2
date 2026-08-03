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
          <p class="mt-1 text-[9px] text-gray-500">Bitácora incluida por fecha efectiva de pago · Todos los ciclos y estatus</p>
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
          <div class="payment-main">
            <div class="payment-identity">
              <span class="payment-folio">Folio {{ r.folio }}</span>
              <span class="payment-dot">·</span>
              <span class="payment-matricula">{{ r.matricula }}</span>
              <span class="payment-dot">·</span>
              <strong class="payment-student">{{ r.nombreCompleto }}</strong>
            </div>

            <div class="payment-amount-block">
              <span class="payment-amount-label">Aplicado</span>
              <strong class="payment-amount">${{ Number(r.montoAplicado || 0).toFixed(2) }}</strong>
              <span v-if="amountsDiffer(r)" class="payment-registered">
                Registrado ${{ Number(r.monto || 0).toFixed(2) }}
              </span>
            </div>
          </div>

          <div class="payment-concept">{{ r.conceptoNombre }}</div>

          <div class="payment-meta">
            <span>{{ formatPaymentDates(r) }}</span>
            <span>Doc. {{ String(r.documento || '').padStart(7, '0') }}</span>
            <span>Ciclo {{ r.ciclo }}</span>
            <span>{{ r.mesReal || r.mes }}</span>
            <span>{{ r.formaDePago }}</span>
            <span class="payment-user">{{ formatUserCompact(r) }}</span>
            <strong class="payment-status">{{ r.estatusCorte }}</strong>
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

const formatUserCompact = (row) => {
  const name = String(row?.usuario || '').trim()
  const email = String(row?.usuario_email || '').trim().toLowerCase()
  return name || email || 'No identificado'
}

const formatPaymentDates = (row) => {
  const registered = formatDateTime(row?.fecha)
  const paid = formatDateTime(row?.fechaPago)
  if (!paid || paid === registered) return registered
  return `Registro ${registered} · Pago ${paid}`
}

const amountsDiffer = (row) => (
  Math.abs(Number(row?.monto || 0) - Number(row?.montoAplicado || 0)) > 0.005
)

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
  width: 100%;
  min-width: 0;
  padding: 0.34rem 0.12rem 0.3rem;
  border-bottom: 1px solid #9ca3af;
  break-inside: avoid;
  page-break-inside: avoid;
}

.payment-card:first-of-type {
  border-top: 1px solid #9ca3af;
}

.payment-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 0.65rem;
}

.payment-identity {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  min-width: 0;
  gap: 0.12rem 0.24rem;
  color: #111827;
  font-size: 0.66rem;
  line-height: 1.2;
}

.payment-folio,
.payment-matricula {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-weight: 700;
  white-space: nowrap;
}

.payment-dot {
  color: #9ca3af;
}

.payment-student {
  min-width: 0;
  overflow-wrap: anywhere;
}

.payment-concept {
  margin-top: 0.08rem;
  padding-right: 5.2rem;
  color: #1f2937;
  font-size: 0.59rem;
  font-weight: 600;
  line-height: 1.22;
  overflow-wrap: anywhere;
}

.payment-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.08rem 0.68rem;
  margin-top: 0.13rem;
  color: #6b7280;
  font-size: 0.49rem;
  line-height: 1.2;
}

.payment-meta > span,
.payment-status {
  white-space: nowrap;
}

.payment-user {
  max-width: 16rem;
  white-space: normal !important;
  overflow-wrap: anywhere;
}

.payment-status {
  color: #374151;
}

.payment-amount-block {
  display: grid;
  justify-items: end;
  min-width: 4.8rem;
  text-align: right;
}

.payment-amount-label {
  color: #6b7280;
  font-size: 0.42rem;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
}

.payment-amount {
  color: #111827;
  font-size: 0.7rem;
  line-height: 1.08;
  white-space: nowrap;
}

.payment-registered {
  margin-top: 0.03rem;
  color: #6b7280;
  font-size: 0.43rem;
  line-height: 1.1;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .payment-concept {
    padding-right: 0;
  }

  .payment-user {
    max-width: 11rem;
  }
}

@media print {
  @page { margin: 0.35cm; size: letter portrait; }

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
    padding: 0.2rem 0.08rem 0.18rem;
  }

  .payment-main {
    gap: 0.45rem;
  }

  .payment-identity {
    gap: 0.08rem 0.18rem;
    font-size: 7pt;
    line-height: 1.14;
  }

  .payment-concept {
    margin-top: 0.04rem;
    padding-right: 4.8rem;
    font-size: 6.2pt;
    line-height: 1.14;
  }

  .payment-meta {
    gap: 0.04rem 0.48rem;
    margin-top: 0.07rem;
    font-size: 5.3pt;
    line-height: 1.12;
  }

  .payment-user {
    max-width: 13rem;
  }

  .payment-amount-block {
    min-width: 4.3rem;
  }

  .payment-amount-label {
    font-size: 4.6pt;
  }

  .payment-amount {
    font-size: 7.2pt;
  }

  .payment-registered {
    font-size: 4.7pt;
  }

}
</style>
