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
        <label>
          <span class="sr-only">Periodo de facturas</span>
          <select :value="scope" @change="emit('update:scope', $event.target.value)">
            <option value="current">{{ compact ? 'Ciclo' : 'Ciclo seleccionado' }}</option>
            <option value="all">{{ compact ? 'Todas' : 'Todo el historial' }}</option>
          </select>
        </label>
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
      <span>No hay CFDI asociados a esta matrícula en el periodo seleccionado.</span>
    </div>

    <div v-else class="student-invoice-ledger__list">
      <article
        v-for="invoice in invoices"
        :key="invoice.providerInvoiceId || invoice.id"
        :class="[
          'student-invoice-row',
          { 'is-highlighted': String(invoice.providerInvoiceId || invoice.id) === String(highlightInvoiceId || '') },
        ]"
      >
        <div class="student-invoice-row__identity">
          <div class="student-invoice-row__title">
            <strong>{{ invoice.folio ? `Folio ${invoice.folio}` : `Factura #${invoice.id}` }}</strong>
            <span :class="['student-invoice-status', statusTone(invoice)]">{{ statusLabel(invoice) }}</span>
          </div>
          <div class="student-invoice-row__meta">
            <span>{{ formatDate(invoice.issuedAt) }}</span>
            <span v-if="invoice.receiverTaxId">RFC {{ invoice.receiverTaxId }}</span>
            <span v-if="invoice.receiverName">{{ invoice.receiverName }}</span>
            <span v-if="invoice.uuid" class="student-invoice-row__uuid" :title="invoice.uuid">UUID {{ compactUuid(invoice.uuid) }}</span>
          </div>
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

        <strong class="student-invoice-row__total">{{ money(invoice.total) }}</strong>

        <div class="student-invoice-row__actions" @click.stop>
          <button type="button" title="Descargar PDF" :disabled="!invoice.actionable" @click="emit('download', invoice, 'pdf')">
            <LucideFileDown :size="15" />
          </button>
          <button type="button" title="Descargar XML" :disabled="!invoice.actionable" @click="emit('download', invoice, 'xml')">
            <LucideFileText :size="15" />
          </button>
          <button type="button" title="Descargar ZIP" :disabled="!invoice.actionable" @click="emit('download', invoice, 'zip')">
            <LucideArchive :size="15" />
          </button>
          <button type="button" title="Enviar por correo" :disabled="!invoice.actionable" @click="emit('email', invoice)">
            <LucideMail :size="15" />
          </button>
          <button
            type="button"
            class="is-danger"
            title="Cancelar factura"
            :disabled="!canCancel(invoice)"
            @click="emit('cancel', invoice)"
          >
            <LucideBan :size="15" />
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import {
  LucideAlertTriangle,
  LucideArchive,
  LucideBan,
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
  scope: { type: String, default: 'current' },
  highlightInvoiceId: { type: [String, Number], default: '' },
  compact: { type: Boolean, default: false },
})

const emit = defineEmits(['refresh', 'update:scope', 'download', 'email', 'cancel'])

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

<style scoped>
.student-invoice-ledger {
  min-height: 0;
  overflow: visible;
  border: 1px solid var(--students-border-soft, #edf2f7);
  border-radius: 13px;
  background: #fff;
  box-shadow: 0 8px 18px rgba(21, 35, 60, 0.03);
}

.student-invoice-ledger__toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #e8edf3;
  background: rgba(255, 255, 255, 0.96);
  padding: 10px 12px;
  backdrop-filter: blur(10px);
}

.student-invoice-ledger.is-compact .student-invoice-ledger__toolbar {
  min-height: 34px;
  padding: 3px 8px;
}

.student-invoice-ledger__compact-count {
  color: #475569;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
}

.student-invoice-ledger.is-compact .student-invoice-ledger__compact-count {
  font-size: 10px;
}

.student-invoice-ledger__toolbar span,
.student-invoice-ledger__toolbar strong {
  display: block;
}

.student-invoice-ledger__toolbar span {
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.student-invoice-ledger__toolbar strong {
  color: #172033;
  font-size: 13px;
}

.student-invoice-ledger__toolbar-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.student-invoice-ledger__toolbar select,
.student-invoice-ledger__toolbar button {
  min-height: 31px;
  border: 1px solid #dce3eb;
  border-radius: 8px;
  background: #fff;
  color: #475569;
  font-size: 11px;
  font-weight: 700;
}

.student-invoice-ledger__toolbar select { padding: 0 8px; }
.student-invoice-ledger__toolbar button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
}

.student-invoice-ledger.is-compact .student-invoice-ledger__toolbar-actions {
  margin-left: auto;
  gap: 5px;
}

.student-invoice-ledger.is-compact .student-invoice-ledger__toolbar select,
.student-invoice-ledger.is-compact .student-invoice-ledger__toolbar button {
  min-height: 27px;
  border-radius: 7px;
  font-size: 10px;
}

.student-invoice-ledger.is-compact .student-invoice-ledger__toolbar select {
  max-width: 82px;
  padding-inline: 6px 20px;
}

.student-invoice-ledger.is-compact .student-invoice-ledger__toolbar button {
  width: 28px;
  padding: 0;
  justify-content: center;
}

.student-invoice-ledger__warning {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid #fde68a;
  background: #fffbeb;
  padding: 9px 12px;
  color: #92400e;
  font-size: 11px;
}

.student-invoice-ledger.is-compact .student-invoice-ledger__warning {
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  font-size: 9px;
}

.student-invoice-ledger.is-compact .student-invoice-ledger__warning span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.student-invoice-ledger__state {
  display: grid;
  justify-items: center;
  gap: 7px;
  min-height: 190px;
  padding: 35px 20px;
  color: #64748b;
  text-align: center;
}

.student-invoice-ledger__state strong { color: #334155; }
.student-invoice-ledger__state span { max-width: 360px; font-size: 12px; }
.student-invoice-ledger__state button {
  border: 1px solid #dbe3ec;
  border-radius: 8px;
  background: #fff;
  padding: 6px 10px;
  color: #334155;
  font-size: 11px;
  font-weight: 700;
}
.student-invoice-ledger__state.is-error { color: #b42318; }
.student-invoice-ledger__state.is-error strong { color: #b42318; }

.student-invoice-ledger.is-compact .student-invoice-ledger__state {
  grid-template-columns: auto minmax(0, 1fr) auto;
  justify-items: start;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 8px 10px;
  text-align: left;
}

.student-invoice-ledger.is-compact .student-invoice-ledger__state strong {
  font-size: 11px;
}

.student-invoice-ledger.is-compact .student-invoice-ledger__state span {
  display: none;
}

.student-invoice-ledger.is-compact .student-invoice-ledger__state button {
  padding: 4px 8px;
}

.student-invoice-ledger__list { display: grid; }
.student-invoice-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(92px, auto) 174px;
  align-items: center;
  gap: 12px;
  min-height: 72px;
  border-bottom: 1px solid #edf2f7;
  padding: 9px 12px;
  transition: background 150ms ease, box-shadow 150ms ease;
}
.student-invoice-row:last-child { border-bottom: 0; }
.student-invoice-row:hover,
.student-invoice-row.is-highlighted {
  background: #f7fbf6;
  box-shadow: inset 3px 0 0 rgba(69, 163, 65, 0.65);
}
.student-invoice-row__identity { min-width: 0; }
.student-invoice-row__title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.student-invoice-row__title strong {
  overflow: hidden;
  color: #172033;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.student-invoice-status {
  flex: none;
  border-radius: 999px;
  padding: 2px 7px;
  font-size: 9px;
  font-weight: 800;
}
.student-invoice-status.is-active { background: #ecfdf3; color: #027a48; }
.student-invoice-status.is-pending { background: #eff6ff; color: #175cd3; }
.student-invoice-status.is-warning { background: #fffaeb; color: #b54708; }
.student-invoice-status.is-cancelled { background: #fef3f2; color: #b42318; }
.student-invoice-row__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 9px;
  margin-top: 4px;
  color: #64748b;
  font-size: 10px;
}
.student-invoice-row__uuid { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.student-invoice-row__sources {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}
.student-invoice-row__sources span,
.student-invoice-row__sources small {
  border-radius: 999px;
  background: #f1f5f9;
  padding: 2px 6px;
  color: #475569;
  font-size: 9px;
  font-weight: 700;
}
.student-invoice-row__total {
  color: #285d32;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  text-align: right;
}
.student-invoice-row__actions {
  display: flex;
  justify-content: flex-end;
  gap: 5px;
}
.student-invoice-row__actions button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid #dce3eb;
  border-radius: 8px;
  background: #fff;
  color: #475569;
}
.student-invoice-row__actions button:hover:not(:disabled) {
  border-color: #a9c7aa;
  background: #f3faf3;
  color: #285d32;
}
.student-invoice-row__actions button.is-danger:hover:not(:disabled) {
  border-color: #fda29b;
  background: #fff5f4;
  color: #b42318;
}
.student-invoice-row__actions button:disabled { cursor: not-allowed; opacity: .38; }

.student-invoice-ledger.is-compact .student-invoice-row {
  grid-template-columns: minmax(0, 1fr) minmax(82px, auto) 154px;
  gap: 8px;
  min-height: 56px;
  padding: 6px 9px;
}

.student-invoice-ledger.is-compact .student-invoice-row__title strong,
.student-invoice-ledger.is-compact .student-invoice-row__total {
  font-size: 11px;
}

.student-invoice-ledger.is-compact .student-invoice-row__meta {
  gap: 1px 7px;
  margin-top: 2px;
  font-size: 9px;
}

.student-invoice-ledger.is-compact .student-invoice-row__meta > span:nth-child(n + 4),
.student-invoice-ledger.is-compact .student-invoice-row__sources {
  display: none;
}

.student-invoice-ledger.is-compact .student-invoice-row__actions {
  gap: 3px;
}

.student-invoice-ledger.is-compact .student-invoice-row__actions button {
  width: 27px;
  height: 27px;
  border-radius: 7px;
}

@media (max-width: 760px) {
  .student-invoice-ledger:not(.is-compact) .student-invoice-ledger__toolbar { align-items: flex-start; }
  .student-invoice-ledger:not(.is-compact) .student-invoice-ledger__toolbar-actions {
    align-items: stretch;
    flex-direction: column;
  }
  .student-invoice-ledger:not(.is-compact) .student-invoice-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .student-invoice-ledger:not(.is-compact) .student-invoice-row__actions {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }
}

@media (max-width: 520px) {
  .student-invoice-ledger.is-compact .student-invoice-ledger__compact-count { display: none; }
  .student-invoice-ledger.is-compact .student-invoice-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .student-invoice-ledger.is-compact .student-invoice-row__actions {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }
}
</style>
