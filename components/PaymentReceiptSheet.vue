<template>
  <article
    class="receipt-sheet mx-auto border border-gray-200 p-8 rounded-2xl relative z-10 bg-white shadow-lg w-full"
    :class="sheetClass"
  >
    <div class="receipt-content">
      <section class="receipt-context">
        <div class="receipt-header flex justify-between items-start border-b border-gray-300 pb-5 mb-6">
          <div class="flex items-center gap-5 w-2/3">
            <img :src="logoSrc" alt="Logo" class="receipt-logo h-[60px] object-contain" />
            <div>
              <h2 class="receipt-institute-name m-0 text-sm font-bold text-gray-900 tracking-tight">{{ institutoNombre }}</h2>
              <p class="m-0 mt-0.5 text-[11px] text-brand-teal uppercase font-semibold">
                {{ isPreview ? 'Vista previa, carece de validez' : receiptHeading }}
              </p>
              <p class="m-0 mt-1 text-[10px] text-gray-500">Documento no válido como comprobante fiscal.</p>
            </div>
          </div>
          <div class="w-1/3 text-right flex flex-col justify-center">
            <div class="bg-gray-50 border border-gray-200 rounded p-2 text-left w-full text-[11px]">
              <p class="m-0 mb-1 flex justify-between gap-3">
                <strong class="text-gray-600 uppercase">Emisión:</strong>
                <span class="font-mono text-gray-800">{{ issuedAt }}</span>
              </p>
              <p class="m-0 flex justify-between gap-3">
                <strong class="text-gray-600 uppercase">Administrador:</strong>
                <span class="receipt-admin text-gray-800 truncate max-w-[120px]">{{ receiptData.usuario || activeUserName }}</span>
              </p>
              <p v-if="auditStatus" class="m-0 mt-1 flex justify-between gap-3">
                <strong class="text-gray-600 uppercase">Estatus:</strong>
                <span class="receipt-status" :class="auditStatusClass">{{ auditStatus }}</span>
              </p>
            </div>
          </div>
        </div>

        <table class="student-summary w-full text-xs mb-6 border-y border-gray-200">
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
              <td class="py-2 text-gray-700">{{ formatCicloLabel(receiptData.ciclo || '') }}</td>
              <td class="py-2 text-gray-700">{{ receiptData.grado || '' }} {{ receiptData.grupo || '' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-for="(payment, index) in items" :key="payment.folio || index" class="receipt-item mb-6">
        <div v-if="hasMultiplePayments" class="receipt-item-index">
          Pago {{ index + 1 }} de {{ items.length }}
        </div>
        <table class="receipt-item-table w-full text-[11px] border-collapse">
          <tbody>
            <tr class="bg-gray-50/80 border-b border-gray-200">
              <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase">Folio</th>
              <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase">Método</th>
              <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase">Saldo</th>
              <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase">Total Doc.</th>
              <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase text-brand-campus">Pago</th>
            </tr>
            <tr>
              <td class="py-1.5 px-2 font-mono font-semibold text-gray-800">{{ paymentFolio(payment) }}</td>
              <td class="py-1.5 px-2 text-gray-700">{{ paymentMethodLabel(payment) }}</td>
              <td class="py-1.5 px-2 text-gray-700">{{ currency(payment.saldoDespues) }}</td>
              <td class="py-1.5 px-2 text-gray-700">{{ currency(payment.importeTotal) }}</td>
              <td class="py-1.5 px-2 font-bold text-brand-campus">{{ currency(payment.monto) }}</td>
            </tr>

            <tr class="bg-gray-50/80 border-b border-t border-gray-200">
              <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase">Documento</th>
              <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase">Saldo previo</th>
              <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase">Acumulado</th>
              <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase">Nuevo Acum.</th>
              <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase">Mes/Ref</th>
            </tr>
            <tr>
              <td class="py-1.5 px-2 font-mono text-gray-700">{{ String(payment.documento || '').padStart(7, '0') }}</td>
              <td class="py-1.5 px-2 text-gray-700">{{ currency(payment.saldoAntes) }}</td>
              <td class="py-1.5 px-2 text-gray-700">{{ currency(payment.pagos) }}</td>
              <td class="py-1.5 px-2 text-gray-700">{{ currency(payment.pagosDespues) }}</td>
              <td class="py-1.5 px-2 text-gray-700">{{ paymentReference(payment) }}</td>
            </tr>

            <tr class="bg-gray-50/80 border-b border-t border-gray-200">
              <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase">Concepto:</th>
              <th class="py-1.5 px-2 text-left font-semibold text-gray-500 uppercase" colspan="4">Detalle</th>
            </tr>
            <tr>
              <td class="py-1.5 px-2 font-semibold text-gray-800">{{ payment.conceptoNombre }}</td>
              <td class="py-1.5 px-2 text-gray-700">{{ formatPaymentDate(payment.fecha) }}</td>
              <td class="py-1.5 px-2 text-gray-600 italic" colspan="3">{{ payment.montoLetra || numeroALetras(Number(payment.monto || 0)) }} 00/100 MXN</td>
            </tr>
          </tbody>
        </table>
        <div
          v-if="isOtherCampusPayment(payment)"
          class="mt-2 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px]"
        >
          <span class="font-semibold text-amber-900">Pago realizado en otro plantel</span>
          <span class="font-bold text-amber-800">{{ paymentCampusLabel(payment) }}</span>
        </div>
        <hr class="receipt-item-divider mt-4 border-gray-200 border-dashed" />
      </section>

      <div class="receipt-summary flex justify-between items-center p-5 bg-brand-leaf/5 rounded-lg border border-brand-leaf/20 mt-4 mb-6">
        <div class="flex-1 pr-6">
          <div class="text-[10px] font-semibold uppercase text-brand-teal mb-1">Importe en Letra</div>
          <div class="text-xs font-medium text-gray-700 leading-tight">{{ amountInWords }}</div>
        </div>
        <div class="text-right border-l border-brand-leaf/20 pl-6">
          <div class="text-[10px] font-semibold uppercase text-brand-campus mb-1">Total abonado</div>
          <div class="receipt-total-amount text-xl font-bold text-brand-campus font-mono">{{ currency(total) }}</div>
          <div v-if="hasNonAppliedAmount" class="receipt-applied-amount">Aplicado al corte: {{ currency(appliedTotal) }}</div>
        </div>
      </div>
    </div>

    <div class="receipt-footer">
      <div class="receipt-footer-rule text-center mt-6 mb-2 pt-4 border-t border-dashed border-gray-300">
        <p class="italic text-gray-400 text-[10px]">“Compartimos contigo la formación integral de tus hijos”</p>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import { numeroALetras } from '~/server/utils/numberToWords'
import { formatCicloLabel } from '~/shared/utils/ciclo'

const props = defineProps({
  items: { type: Array, default: () => [] },
  receiptData: { type: Object, default: () => ({}) },
  issuedAt: { type: String, default: '' },
  activeUserName: { type: String, default: 'Administrador' },
  isPreview: { type: Boolean, default: false },
  variant: { type: String, default: 'default' },
  folioMode: { type: String, default: 'preferred' }
})

const hasMultiplePayments = computed(() => props.items.length > 1)
const receiptHeading = computed(() => hasMultiplePayments.value ? 'Comprobante de pagos' : 'Comprobante de pago')
const total = computed(() => props.items.reduce((sum, item) => sum + Number(item?.monto || 0), 0))
const appliedTotal = computed(() => props.items.reduce((sum, item) => {
  const applied = item?.montoAplicado
  return sum + Number(applied === null || applied === undefined ? item?.monto || 0 : applied)
}, 0))
const hasNonAppliedAmount = computed(() => Math.abs(total.value - appliedTotal.value) > 0.004)
const amountInWords = computed(() => numeroALetras(total.value))
const logoSrc = computed(() => 'https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp')
const institutoNombre = computed(() => props.receiptData?.nivel === 'Secundaria'
  ? 'INSTITUTO EDUCATIVO PARA EL DESARROLLO INTEGRAL DEL SABER SC'
  : 'INSTITUTO EDUCATIVO LA CASITA DEL SABER SC')
const auditStatus = computed(() => String(props.receiptData?.estatusCorte || props.items[0]?.estatusCorte || '').trim())
const auditStatusClass = computed(() => {
  const status = auditStatus.value.toLowerCase()
  if (status.includes('cancel')) return 'receipt-status--cancelled'
  if (status.includes('depur')) return 'receipt-status--adjustment'
  return 'receipt-status--active'
})
const sheetClass = computed(() => {
  if (props.variant === 'strip') return 'receipt-sheet--strip'
  return hasMultiplePayments.value ? 'receipt-sheet--multi' : 'receipt-sheet--single'
})

const currency = (value) => `$${Number(value || 0).toFixed(2)}`
const paymentFolio = (payment) => props.folioMode === 'corte'
  ? (payment?.folio ?? '')
  : (payment?.folio_plantel || payment?.folio || '')

const normalizedMethod = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()
const truthyFlag = (value) => ['1', 'true'].includes(String(value ?? '').trim().toLowerCase())
const isOtherCampusPayment = (payment) => {
  if (truthyFlag(payment?.pago_otro_plantel)) return true
  const method = normalizedMethod(payment?.formaDePago)
  if (method === 'pago realizado en otro plantel') return true
  return truthyFlag(payment?.depurado) && method !== 'depuracion'
}
const paymentMethodLabel = (payment) => {
  const method = String(payment?.formaDePago || '').trim()
  return normalizedMethod(method) === 'pago realizado en otro plantel'
    ? 'Método no registrado'
    : (method || 'Sin método')
}
const paymentCampusLabel = (payment) => {
  const plantel = String(payment?.plantel_pago || '').trim().toUpperCase()
  return plantel ? `Plantel ${plantel}` : 'Plantel no especificado'
}
const formatPaymentDate = (value) => {
  if (!value) return ''
  const raw = String(value)
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return `${match[3]}/${match[2]}/${match[1]}`
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString('es-MX')
}
const paymentReference = (payment) => payment?.mes === 'ev'
  ? formatPaymentDate(payment?.fecha)
  : (payment?.mesReal || payment?.mes || '')
</script>

<style scoped>
.receipt-sheet {
  max-width: 850px;
  min-height: 8.5in;
}

.receipt-sheet--single,
.receipt-sheet--strip {
  display: flex;
  flex-direction: column;
}

.receipt-sheet--strip {
  min-height: 5.05in;
}

.receipt-sheet--single .receipt-content,
.receipt-sheet--strip .receipt-content {
  flex: 1;
}

.receipt-sheet--single .receipt-footer,
.receipt-sheet--strip .receipt-footer {
  margin-top: auto;
}

.receipt-item-index {
  margin-bottom: 0.35rem;
  color: #667085;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.receipt-status {
  border-radius: 999px;
  padding: 1px 7px;
  font-size: 9px;
  font-weight: 800;
}

.receipt-status--active {
  background: #ecfdf3;
  color: #027a48;
}

.receipt-status--cancelled {
  background: #fef3f2;
  color: #b42318;
}

.receipt-status--adjustment {
  background: #fffaeb;
  color: #b54708;
}

.receipt-applied-amount {
  margin-top: 2px;
  color: #b42318;
  font-size: 9px;
  font-weight: 750;
}

@media print {
  :global(html),
  :global(body) {
    width: auto;
    min-height: 0;
    overflow: visible;
    background-color: white;
  }

  :global(body) {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .receipt-sheet {
    width: 100%;
    height: auto;
    min-height: 0;
    max-width: none;
    overflow: visible;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    padding: 0;
  }

  .receipt-sheet--single {
    min-height: 5.18in;
  }

  .receipt-sheet--strip {
    min-height: 5.05in;
  }

  .receipt-sheet--multi {
    display: block;
  }

  .receipt-context,
  .receipt-header,
  .student-summary,
  .receipt-item,
  .receipt-item-table,
  .receipt-summary,
  .receipt-footer {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .receipt-item {
    overflow: visible;
  }

  .receipt-header {
    padding-bottom: 0.11in;
    margin-bottom: 0.1in;
  }

  .receipt-logo {
    max-height: 0.42in;
  }

  .receipt-institute-name {
    font-size: 10.5px;
    line-height: 1.08;
  }

  .receipt-admin {
    max-width: none;
    overflow: visible;
    text-align: right;
    text-overflow: clip;
    white-space: normal;
  }

  .student-summary,
  .receipt-item-table {
    margin-bottom: 0.08in;
    font-size: 8.4px;
    line-height: 1.12;
  }

  .student-summary th,
  .student-summary td,
  .receipt-item-table th,
  .receipt-item-table td {
    overflow-wrap: anywhere;
    padding-top: 0.025in;
    padding-bottom: 0.025in;
    white-space: normal;
    word-break: normal;
  }

  .student-summary,
  .receipt-item-table {
    table-layout: fixed;
  }

  .student-summary,
  .receipt-item,
  .receipt-summary {
    margin-bottom: 0.08in;
  }

  .receipt-item-divider,
  .receipt-summary {
    margin-top: 0.05in;
  }

  .receipt-summary {
    padding: 0.08in;
  }

  .receipt-total-amount {
    font-size: 15px;
    line-height: 1.05;
  }

  .receipt-footer {
    margin-top: 0.05in;
  }

  .receipt-footer-rule {
    margin-top: 0.05in;
    padding-top: 0.05in;
  }

  .receipt-sheet--multi .receipt-item {
    margin-bottom: 0.13in;
  }

  .receipt-sheet--multi .receipt-item-index {
    margin-bottom: 0.04in;
  }
}
</style>
