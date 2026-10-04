<template>
  <section :class="['student-invoice-ledger', { 'is-compact': compact }]" aria-label="Facturas del alumno">
    <header class="student-invoice-ledger__toolbar">
      <div v-if="!compact" class="student-invoice-ledger__heading">
        <span>Historial fiscal</span>
        <strong>{{ invoices.length }} factura{{ invoices.length === 1 ? '' : 's' }}</strong>
      </div>
      <strong v-else class="student-invoice-ledger__compact-count">
        {{ invoices.length }} factura{{ invoices.length === 1 ? '' : 's' }}
      </strong>
      <div class="student-invoice-ledger__toolbar-actions">
        <button
          type="button"
          :disabled="loading"
          title="Actualizar facturas"
          aria-label="Actualizar facturas"
          @click="emit('refresh')"
        >
          <LucideRefreshCw :class="{ 'animate-spin': loading }" :size="14" />
          <span v-if="!compact">Actualizar</span>
        </button>
      </div>
    </header>

    <div v-if="warning" class="student-invoice-ledger__warning" role="status">
      <LucideAlertTriangle :size="16" />
      <span>{{ warning }}</span>
    </div>

    <div v-if="loading && !invoices.length" class="student-invoice-ledger__state">
      <LucideLoader2 class="animate-spin" :size="20" />
      <strong>Cargando facturas...</strong>
    </div>
    <div v-else-if="error && !invoices.length" class="student-invoice-ledger__state is-error">
      <LucideXCircle :size="20" />
      <strong>No se pudieron cargar las facturas</strong>
      <span>{{ error }}</span>
      <button type="button" @click="emit('refresh')">Reintentar</button>
    </div>
    <div v-else-if="!invoices.length" class="student-invoice-ledger__state">
      <LucideReceiptText :size="22" />
      <strong>Sin facturas registradas</strong>
      <span>No hay CFDI para el RFC fiscal guardado del alumno.</span>
    </div>

    <div v-else class="student-invoice-ledger__list">
      <article
        v-for="invoice in invoices"
        :key="invoice.providerInvoiceId || invoice.id"
        :class="[
          'student-invoice-row account-ledger-row',
          { 'is-highlighted': String(invoice.providerInvoiceId || invoice.id) === String(highlightInvoiceId || '') },
        ]"
      >
        <div class="student-invoice-row__identity">
          <div class="student-invoice-row__title account-ledger-title">
            <strong>{{ invoice.folio ? `Folio ${invoice.folio}` : `Factura #${invoice.id}` }}</strong>
            <span :class="['student-invoice-status account-ledger-status', statusTone(invoice)]">{{ statusLabel(invoice) }}</span>
          </div>
          <div class="student-invoice-row__meta account-ledger-meta">
            <span>{{ formatDate(invoice.issuedAt) }}</span>
            <span v-if="invoice.receiverTaxId">RFC {{ invoice.receiverTaxId }}</span>
            <span v-if="invoice.receiverName">{{ invoice.receiverName }}</span>
            <details v-if="invoice.uuid || invoice.sourcePayments?.length" class="student-invoice-row__references" :open="!compact">
              <summary aria-label="Ver UUID y pagos de origen" title="UUID y pagos de origen"><LucideChevronRight :size="12" /> Referencias</summary>
              <div class="student-invoice-row__reference-body">
                <span v-if="invoice.uuid" class="student-invoice-row__uuid" :title="invoice.uuid">UUID {{ compactUuid(invoice.uuid) }}</span>
                <div v-if="invoice.sourcePayments?.length" class="student-invoice-row__sources">
                  <span
                    v-for="(source, sourceIndex) in invoice.sourcePayments.slice(0, 4)"
                    :key="sourceKey(source, sourceIndex)"
                    :title="source.concepto || ''"
                  >
                    {{ source.folioPlantel || (source.folio ? `Folio ${source.folio}` : source.documento ? `Doc. ${source.documento}` : 'Pago') }}
                  </span>
                  <small v-if="invoice.sourcePayments.length > 4">+{{ invoice.sourcePayments.length - 4 }}</small>
                </div>
              </div>
            </details>
          </div>
        </div>

        <strong class="student-invoice-row__total account-ledger-amount">{{ money(invoice.total) }}</strong>

        <div class="student-invoice-row__actions account-ledger-actions" @click.stop>
          <button type="button" title="Descargar PDF" aria-label="Descargar PDF" :disabled="!invoice.actionable" @click="emit('download', invoice, 'pdf')">
            <LucideFileDown :size="15" />
          </button>
          <button type="button" title="Descargar XML" aria-label="Descargar XML" :disabled="!invoice.actionable" @click="emit('download', invoice, 'xml')">
            <LucideFileText :size="15" />
          </button>
          <button type="button" title="Descargar ZIP" aria-label="Descargar ZIP" :disabled="!invoice.actionable" @click="emit('download', invoice, 'zip')">
            <LucideArchive :size="15" />
          </button>
          <button type="button" title="Enviar por correo" aria-label="Enviar por correo" :disabled="!invoice.actionable" @click="emit('email', invoice)">
            <LucideMail :size="15" />
          </button>
          <button
            type="button"
            class="is-danger"
            title="Cancelar factura" aria-label="Cancelar factura"
            :disabled="!canCancel(invoice)"
            @click="emit('cancel', invoice)"
          >
            <LucideBan :size="15" />
          </button>
        </div>
      </article>
    </div>

    <footer v-if="pages > 1 && !loading" class="student-invoice-ledger__pager" aria-label="Paginación de facturas">
      <span>{{ total }} facturas · Página {{ page }} de {{ pages }}</span>
      <div>
        <button
          type="button"
          title="Página anterior"
          aria-label="Página anterior"
          :disabled="page <= 1"
          @click="emit('page-change', page - 1)"
        >
          <LucideChevronLeft :size="15" />
        </button>
        <button
          type="button"
          title="Página siguiente"
          aria-label="Página siguiente"
          :disabled="page >= pages"
          @click="emit('page-change', page + 1)"
        >
          <LucideChevronRight :size="15" />
        </button>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import {
  LucideAlertTriangle,
  LucideArchive,
  LucideBan,
  LucideChevronLeft,
  LucideChevronRight,
  LucideFileDown,
  LucideFileText,
  LucideLoader2,
  LucideMail,
  LucideReceiptText,
  LucideRefreshCw,
  LucideXCircle,
} from 'lucide-vue-next'

const props = defineProps({
  invoices: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  warning: { type: String, default: '' },
  highlightInvoiceId: { type: [String, Number], default: '' },
  compact: { type: Boolean, default: false },
  page: { type: Number, default: 1 },
  pages: { type: Number, default: 1 },
  total: { type: Number, default: 0 },
})

const emit = defineEmits(['refresh', 'page-change', 'download', 'email', 'cancel'])

const normalized = (value: unknown) => String(value || '').trim().toLowerCase()
const statusLabel = (invoice: any) => {
  const cancel = normalized(invoice?.cancellationStatus)
  const status = normalized(invoice?.status)
  if (cancel === 'pending') return 'Cancelación pendiente'
  if (cancel === 'rejected') return 'Cancelación rechazada'
  if (cancel === 'accepted' || status === 'canceled') return 'Cancelada'
  return 'Vigente'
}
const statusTone = (invoice: any) => {
  const label = statusLabel(invoice).toLowerCase()
  if (label.includes('rechazada')) return 'is-warning'
  if (label.includes('pendiente')) return 'is-pending'
  if (label.includes('cancelada')) return 'is-cancelled'
  return 'is-active'
}
const canCancel = (invoice: any) => Boolean(
  invoice?.actionable
  && normalized(invoice?.status) !== 'canceled'
  && !['pending', 'accepted'].includes(normalized(invoice?.cancellationStatus)),
)
const money = (value: unknown) => Number(value || 0).toLocaleString('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const formatDate = (value: unknown) => {
  if (!value) return 'Sin fecha'
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
const compactUuid = (value: unknown) => {
  const uuid = String(value || '')
  return uuid.length > 18 ? `${uuid.slice(0, 8)}…${uuid.slice(-6)}` : uuid
}
const sourceKey = (source: any, index: number) => [
  source?.folio,
  source?.folioPlantel,
  source?.documento,
  source?.ciclo,
  source?.concepto,
  source?.monto,
  index,
].filter((value) => value !== null && value !== undefined && value !== '').join('-')
</script>


<style scoped src="./students/accountLedger.css"></style>
<style scoped>
.student-invoice-ledger { container: invoice-ledger / inline-size; min-width: 0; min-height: 0; background: #fff; }
.student-invoice-ledger__toolbar { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 38px; padding: 5px 10px; border-bottom: 1px solid #e8edf0; background: #fff; }
.student-invoice-ledger__heading { display: flex; align-items: center; gap: 8px; }
.student-invoice-ledger__heading > span { color: #68766f; font-size: 11px; }
.student-invoice-ledger__heading strong, .student-invoice-ledger__compact-count { color: #495e52; font-size: 12px; font-weight: 500; }
.student-invoice-ledger__toolbar-actions button, .student-invoice-ledger__pager button, .student-invoice-ledger__state button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 30px; padding: 0 8px; border: 1px solid #dfe7e0; border-radius: 7px; background: #fff; color: #4e6858; font-size: 11px; font-weight: 500; cursor: pointer; }
.student-invoice-ledger button:focus-visible { outline: 2px solid var(--action-primary, #4e844e); outline-offset: 2px; }
.student-invoice-ledger button:disabled { cursor: not-allowed; opacity: .38; }
.student-invoice-ledger__warning { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; color: #916016; background: #fff8eb; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.student-invoice-ledger__warning svg { flex: none; margin-top: 2px; }
.student-invoice-ledger__state { display: grid; justify-items: center; gap: 8px; min-height: 140px; padding: 24px 16px; color: #68766f; text-align: center; font-size: 12px; }
.student-invoice-ledger__state strong { font-size: 13px; font-weight: 500; color: #495e52; }
.student-invoice-ledger__state span { max-width: 360px; overflow-wrap: anywhere; }
.student-invoice-ledger__state.is-error, .student-invoice-ledger__state.is-error strong { color: #a84d45; }
.student-invoice-ledger__list { display: grid; }
.student-invoice-row { padding-block: 4px; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; }
.student-invoice-row__identity { min-width: 0; }
.student-invoice-row__uuid { font-variant-numeric: tabular-nums; }
.student-invoice-row__sources { display: flex; flex-wrap: wrap; gap: 4px; }
.student-invoice-row__sources span, .student-invoice-row__sources small { padding: 1px 5px; border-radius: 4px; background: #f3f6f3; color: #68766f; font-size: 10px; font-weight: 450; }
.student-invoice-ledger__pager { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 10px; border-top: 1px solid #e8edf0; color: #68766f; font-size: 11px; }
.student-invoice-ledger__pager > div { display: flex; gap: 5px; }
@container invoice-ledger (max-width: 480px) {
 .student-invoice-row { grid-template-columns: minmax(0, 1fr) auto; gap: 5px 8px; }
 .student-invoice-row__actions { grid-column: 1 / -1; justify-content: flex-start; }
}

.student-invoice-row__references { min-width: 0; }
.student-invoice-row__references[open] { flex-basis: 100%; }
.student-invoice-row__references summary { display: flex; align-items: center; gap: 3px; color: #4e6858; cursor: pointer; font-size: 11px; line-height: 1.25; list-style: none; }
.student-invoice-row__references summary::-webkit-details-marker { display: none; }
.student-invoice-row__references[open] summary svg { transform: rotate(90deg); }
.student-invoice-row__references summary:focus-visible { outline: 2px solid var(--action-primary, #4e844e); outline-offset: 2px; border-radius: 3px; }
.student-invoice-row__reference-body { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; padding-block: 4px 2px; }
.student-invoice-ledger:not(.is-compact) .student-invoice-row__references summary { display: none; }
</style>
