<template>
  <Teleport to="body">
    <div class="modal-overlay payment-history-modal-overlay" @click.self="emit('close')">
      <section class="modal-container payment-history-modal" role="dialog" aria-modal="true" aria-labelledby="payment-history-title">
        <header class="payment-history-modal__header">
          <div class="payment-history-modal__heading">
            <span class="payment-history-modal__eyebrow">Pagos registrados</span>
            <h2 id="payment-history-title">{{ title }}</h2>
            <p>{{ subtitle }}</p>
          </div>
          <button class="plain-icon-button" type="button" aria-label="Cerrar" title="Cerrar" @click="emit('close')">
            <LucideX :size="19" />
          </button>
        </header>

        <div class="payment-history-modal__summary" aria-label="Resumen de pagos">
          <article>
            <span>Pagado vigente</span>
            <strong>${{ money(activePaidTotal) }}</strong>
          </article>
          <article>
            <span>Pagos</span>
            <strong>{{ activeCount }}</strong>
          </article>
          <article v-if="cancelledCount">
            <span>Cancelados</span>
            <strong>{{ cancelledCount }}</strong>
          </article>
        </div>

        <div class="payment-history-modal__body">
          <div v-if="!paymentItems.length" class="payment-history-modal__empty">
            <LucideReceiptText :size="28" />
            <strong>Sin pagos registrados</strong>
            <span>Este concepto todavía no tiene movimientos individuales.</span>
          </div>

          <article
            v-for="item in paymentItems"
            :key="`${item.payment.folio}-${item.debt.documento}-${item.debt.mes}`"
            :class="['payment-history-item', { 'is-cancelled': item.cancelled }]"
          >
            <div class="payment-history-item__main">
              <div class="payment-history-item__icon" aria-hidden="true">
                <LucideReceiptText :size="18" />
              </div>
              <div class="payment-history-item__copy">
                <div class="payment-history-item__title-row">
                  <strong>Folio {{ item.payment.folio_plantel || item.payment.folio }}</strong>
                  <span v-if="item.cancelled" class="payment-status-badge is-cancelled">Cancelado</span>
                  <span v-else-if="isOtherCampus(item.payment)" class="payment-status-badge is-external">Otro plantel</span>
                  <span v-else-if="item.payment.depurado" class="payment-status-badge is-audit">Depurado</span>
                  <span v-else class="payment-status-badge is-active">Vigente</span>
                </div>
                <span>{{ item.debt.mesLabel || item.payment.mesReal || item.payment.mes || 'Cargo' }}</span>
                <div class="payment-history-item__meta">
                  <span><LucideCalendarClock :size="13" /> {{ formatDateTime(item.payment.fecha) }}</span>
                  <span><LucideCreditCard :size="13" /> {{ paymentMethodLabel(item.payment) }}</span>
                  <span v-if="isOtherCampus(item.payment)"><LucideBuilding2 :size="13" /> {{ paymentCampusLabel(item.payment) }}</span>
                </div>
                <small v-if="hasAdjustedDate(item.payment)">
                  Fecha original: {{ formatDateTime(item.payment.fecha_original) }}
                </small>
              </div>
              <div class="payment-history-item__amount">
                <span>Importe</span>
                <strong>${{ money(item.payment.monto) }}</strong>
              </div>
            </div>

            <div class="payment-history-item__actions">
              <button
                type="button"
                class="payment-item-action"
                :disabled="item.cancelled"
                @click="emit('receipt', item)"
              >
                <LucideDownload :size="14" />
                Descargar recibo
              </button>
              <button
                v-if="!item.payment.depurado"
                type="button"
                class="payment-item-action"
                :disabled="item.cancelled"
                @click="emit('invoice', item)"
              >
                <LucideFileText :size="14" />
                Facturar
              </button>
              <button
                type="button"
                class="payment-item-action payment-item-action--danger"
                :disabled="item.cancelled"
                @click="emit('cancel', item)"
              >
                <LucideBan :size="14" />
                Cancelar pago
              </button>
            </div>
          </article>
        </div>

        <footer class="payment-history-modal__footer">
          <button class="btn btn-ghost" type="button" @click="emit('close')">Cerrar</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import {
  LucideBan,
  LucideBuilding2,
  LucideCalendarClock,
  LucideCreditCard,
  LucideDownload,
  LucideFileText,
  LucideReceiptText,
  LucideX,
} from 'lucide-vue-next'
import { useModalEscape } from '~/composables/useModalEscape'
import { useScrollLock } from '~/composables/useScrollLock'

const props = defineProps({
  debts: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'receipt', 'invoice', 'cancel'])

useScrollLock()
useModalEscape(() => emit('close'))

const statusKey = (value) => String(value || '').trim().toLowerCase()
const normalizedMethod = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()
const truthyFlag = (value) => ['1', 'true'].includes(String(value ?? '').trim().toLowerCase())
const isCancelled = (payment) => ['cancelada', 'cancelado'].includes(statusKey(payment?.estatus))
const isOtherCampus = (payment) => {
  if (truthyFlag(payment?.pagoOtroPlantel ?? payment?.pago_otro_plantel)) return true
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
  const plantel = String(payment?.plantelPago || payment?.plantel_pago || '').trim().toUpperCase()
  return plantel ? `Plantel ${plantel}` : 'Plantel no especificado'
}
const paymentDateKey = (value) => String(value || '').slice(0, 10)
const hasAdjustedDate = (payment) => Boolean(
  payment?.fecha_original &&
  paymentDateKey(payment.fecha) &&
  paymentDateKey(payment.fecha) !== paymentDateKey(payment.fecha_original),
)

const paymentItems = computed(() => {
  const seen = new Set()
  const rows = []

  for (const debt of props.debts || []) {
    for (const payment of debt?.historialPagos || []) {
      const key = `${payment?.folio || ''}:${debt?.documento || ''}:${payment?.mes || debt?.mes || ''}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ debt, payment, cancelled: isCancelled(payment) })
    }
  }

  return rows.sort((a, b) => {
    const aDate = new Date(a.payment?.fecha || 0).getTime() || 0
    const bDate = new Date(b.payment?.fecha || 0).getTime() || 0
    if (aDate !== bDate) return bDate - aDate
    return Number(b.payment?.folio || 0) - Number(a.payment?.folio || 0)
  })
})

const activeItems = computed(() => paymentItems.value.filter((item) => !item.cancelled))
const activePaidTotal = computed(() => activeItems.value.reduce((sum, item) => sum + Number(item.payment?.monto || 0), 0))
const activeCount = computed(() => activeItems.value.length)
const cancelledCount = computed(() => paymentItems.value.filter((item) => item.cancelled).length)

const title = computed(() => {
  const names = Array.from(new Set((props.debts || []).map((debt) => debt?.conceptoNombre).filter(Boolean)))
  return names.length === 1 ? names[0] : 'Pagos del concepto'
})

const subtitle = computed(() => {
  const months = Array.from(new Set((props.debts || []).map((debt) => debt?.mesLabel).filter(Boolean)))
  const document = (props.debts || []).find((debt) => debt?.documento)?.documento
  const parts = []
  if (months.length === 1) parts.push(months[0])
  else if (months.length > 1) parts.push(`${months.length} mensualidades`)
  if (document) parts.push(`Documento ${document}`)
  return parts.join(' · ') || 'Detalle de movimientos individuales'
})

const money = (value) => Number(value || 0).toFixed(2)
const formatDateTime = (value) => {
  if (!value) return 'Sin fecha'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<style scoped>
.payment-history-modal-overlay {
  padding: 20px;
  overflow-y: auto;
}

.payment-history-modal {
  width: min(760px, 100%);
  max-height: min(820px, calc(100vh - 40px));
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  overflow: hidden;
}

.payment-history-modal__header,
.payment-history-modal__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  background: #fff;
}

.payment-history-modal__header {
  border-bottom: 1px solid var(--students-border-soft, #edf2f7);
}

.payment-history-modal__footer {
  justify-content: flex-end;
  border-top: 1px solid var(--students-border-soft, #edf2f7);
}

.payment-history-modal__heading {
  min-width: 0;
}

.payment-history-modal__eyebrow {
  display: block;
  margin-bottom: 4px;
  color: var(--brand-teal, #167b79);
  font-size: 10px;
  font-weight: 850;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.payment-history-modal__heading h2,
.payment-history-modal__heading p {
  margin: 0;
}

.payment-history-modal__heading h2 {
  color: #17243b;
  font-size: 19px;
  line-height: 1.2;
}

.payment-history-modal__heading p {
  margin-top: 5px;
  color: #738096;
  font-size: 12px;
}

.payment-history-modal__summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 14px 20px;
  background: #f8fafc;
  border-bottom: 1px solid var(--students-border-soft, #edf2f7);
}

.payment-history-modal__summary article {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #e5ebf2;
  border-radius: 11px;
  background: #fff;
}

.payment-history-modal__summary span,
.payment-history-item__amount span {
  color: #7b8799;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: .05em;
  text-transform: uppercase;
}

.payment-history-modal__summary strong {
  color: #1c2b43;
  font-size: 15px;
}

.payment-history-modal__body {
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 0;
  padding: 16px 20px 20px;
  overflow-y: auto;
  background: #fbfcfe;
}

.payment-history-modal__empty {
  display: grid;
  justify-items: center;
  gap: 7px;
  padding: 42px 20px;
  color: #8793a4;
  text-align: center;
}

.payment-history-modal__empty strong {
  color: #435069;
}

.payment-history-item {
  padding: 14px;
  border: 1px solid #e2e9f1;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 22px rgba(31, 43, 67, .045);
}

.payment-history-item.is-cancelled {
  background: #fafafa;
  opacity: .72;
}

.payment-history-item__main {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.payment-history-item__icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 11px;
  background: #edf8f2;
  color: #2f7f4d;
}

.payment-history-item__copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.payment-history-item__title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
}

.payment-history-item__title-row strong {
  color: #18253c;
  font-size: 13px;
}

.payment-history-item__copy > span {
  overflow: hidden;
  color: #5e6c82;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.payment-history-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: #6f7b8e;
  font-size: 10px;
}

.payment-history-item__meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.payment-history-item__copy small {
  color: #8a6470;
  font-size: 9px;
}

.payment-history-item__amount {
  display: grid;
  justify-items: end;
  gap: 2px;
  white-space: nowrap;
}

.payment-history-item__amount strong {
  color: #2f7f4d;
  font-size: 16px;
}

.payment-status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 800;
}

.payment-status-badge.is-active {
  background: #eaf7ef;
  color: #287744;
}

.payment-status-badge.is-external {
  background: #fff5df;
  color: #9b6516;
}

.payment-status-badge.is-audit {
  background: #f1f5f9;
  color: #52606f;
}

.payment-status-badge.is-cancelled {
  background: #f3f4f6;
  color: #707786;
}

.payment-history-item__actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px solid #edf1f5;
}

.payment-item-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 31px;
  padding: 0 10px;
  border: 1px solid #dfe7ef;
  border-radius: 9px;
  background: #fff;
  color: #2f6f57;
  font-size: 10px;
  font-weight: 800;
}

.payment-item-action:hover:not(:disabled) {
  border-color: #b8d3c4;
  background: #f4faf6;
}

.payment-item-action--danger {
  color: #be413f;
}

.payment-item-action--danger:hover:not(:disabled) {
  border-color: #efc6c5;
  background: #fff7f7;
}

.payment-item-action:disabled {
  cursor: default;
  opacity: .45;
}

@media (max-width: 620px) {
  .payment-history-modal-overlay {
    padding: 8px;
  }

  .payment-history-modal {
    max-height: calc(100vh - 16px);
  }

  .payment-history-modal__summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .payment-history-item__main {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .payment-history-item__amount {
    grid-column: 2;
    justify-items: start;
  }

  .payment-history-item__actions {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
