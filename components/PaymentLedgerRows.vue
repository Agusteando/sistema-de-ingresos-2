<template>
  <div v-if="paymentItems.length" class="payment-ledger-rows">
    <article
      v-for="(item, itemIndex) in paymentItems"
      :key="paymentItemKey(item)"
      :class="[
        'payment-ledger-row',
        {
          'is-selected': isSelected(item),
          'is-cancelled': item.cancelled,
          'has-pay-action': itemIndex === 0 && pendingTotal > 0,
        },
      ]"
    >
      <label
        class="payment-ledger-row__selector"
        :class="{ 'is-disabled': selectionDisabled(item) }"
        :aria-label="selectionLabel(item)"
        @click.stop
      >
        <input
          type="checkbox"
          :checked="isSelected(item)"
          :disabled="selectionDisabled(item)"
          @change.stop="emit('toggle', item)"
        />
        <span aria-hidden="true"></span>
      </label>

      <div class="payment-ledger-row__identity">
        <div class="payment-ledger-row__title">
          <strong>{{ paymentConceptLabel(item) }}</strong>
          <span :class="['payment-ledger-status', paymentStatusClass(item)]">
            {{ paymentStatusLabel(item) }}
          </span>
        </div>
        <div class="payment-ledger-row__subline">
          <b>Folio {{ displayFolio(item.payment) }}</b>
          <span v-if="item.debt?.documento">Doc. {{ item.debt.documento }}</span>
          <span>{{ paymentPeriodLabel(item) }}</span>
          <span>{{ formatDate(item.payment?.fecha || item.payment?.fecha_original) }}</span>
          <span>{{ paymentMethodLabel(item.payment) }}</span>
        </div>
      </div>

      <strong class="payment-ledger-row__amount">
        ${{ money(item.payment?.monto) }}
      </strong>

      <div class="payment-ledger-row__actions" @click.stop>
        <button
          v-if="itemIndex === 0 && pendingTotal > 0"
          type="button"
          class="payment-ledger-action payment-ledger-action--pay"
          :title="`Pagar saldo de $${money(pendingTotal)}`"
          aria-label="Pagar saldo pendiente"
          @click="emit('pay')"
        >
          <LucideCreditCard :size="15" />
        </button>
        <button
          type="button"
          class="payment-ledger-action"
          title="Descargar recibo"
          aria-label="Descargar recibo"
          :disabled="item.cancelled"
          @click="emit('receipt', item)"
        >
          <LucideDownload :size="15" />
        </button>
        <button
          v-if="!item.payment?.depurado"
          type="button"
          class="payment-ledger-action"
          title="Facturar pago"
          aria-label="Facturar pago"
          :disabled="item.cancelled"
          @click="emit('invoice', item)"
        >
          <LucideFileText :size="15" />
        </button>
        <button
          type="button"
          class="payment-ledger-action payment-ledger-action--danger"
          title="Cancelar pago"
          aria-label="Cancelar pago"
          :disabled="item.cancelled"
          @click="emit('cancel', item)"
        >
          <LucideBan :size="15" />
        </button>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  LucideBan,
  LucideCreditCard,
  LucideDownload,
  LucideFileText,
} from 'lucide-vue-next'
import { MAX_COMBINED_RECEIPT_PAYMENTS } from '~/shared/constants/paymentReceipt'
import {
  buildPaymentItems,
  paymentConceptLabel,
  paymentItemKey,
  paymentPeriodLabel,
} from '~/shared/utils/paymentItems'

const props = defineProps({
  debts: { type: Array, default: () => [] },
  selectedKeys: { type: Array, default: () => [] },
  pendingTotal: { type: Number, default: 0 },
})

const emit = defineEmits(['toggle', 'receipt', 'invoice', 'cancel', 'pay'])

const paymentItems = computed(() => buildPaymentItems(props.debts as any[]))
const selectedKeySet = computed(() => new Set((props.selectedKeys || []).map(String)))
const selectionLimitReached = computed(
  () => selectedKeySet.value.size >= MAX_COMBINED_RECEIPT_PAYMENTS,
)

const isSelected = (item: any) => selectedKeySet.value.has(paymentItemKey(item))
const selectionDisabled = (item: any) =>
  Boolean(item?.cancelled) || (selectionLimitReached.value && !isSelected(item))
const selectionLabel = (item: any) => {
  if (item?.cancelled) return 'Pago cancelado'
  if (selectionDisabled(item)) {
    return `Límite de ${MAX_COMBINED_RECEIPT_PAYMENTS} pagos alcanzado`
  }
  return `${isSelected(item) ? 'Quitar' : 'Seleccionar'} folio ${displayFolio(item?.payment)}`
}

const displayFolio = (payment: any) =>
  String(payment?.folio_plantel || payment?.folio || 'Sin folio')

const normalizedText = (value: unknown) => String(value || '').trim().toLowerCase()
const paymentMethodLabel = (payment: any) => {
  const method = String(payment?.formaDePago || '').trim()
  return normalizedText(method) === 'pago realizado en otro plantel'
    ? 'Otro plantel'
    : method || 'Sin método'
}

const paymentStatusLabel = (item: any) => {
  if (item?.cancelled) return 'Cancelado'
  if (item?.payment?.depurado) return 'Depurado'
  return 'Vigente'
}
const paymentStatusClass = (item: any) => {
  if (item?.cancelled) return 'is-cancelled'
  if (item?.payment?.depurado) return 'is-audit'
  return 'is-active'
}

const money = (value: unknown) =>
  Number(value || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const formatDate = (value: unknown) => {
  if (!value) return 'Sin fecha'
  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
</script>

<style scoped>
.payment-ledger-rows {
  display: grid;
  border-top: 1px solid #edf2f7;
}

.payment-ledger-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) minmax(78px, auto) 104px;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  border-bottom: 1px solid #f0f3f7;
  background: #fff;
  padding: 6px 10px;
  transition: background 150ms ease, box-shadow 150ms ease;
}

.payment-ledger-row:last-child {
  border-bottom: 0;
}

.payment-ledger-row.has-pay-action {
  grid-template-columns: 28px minmax(0, 1fr) minmax(78px, auto) 136px;
}

.payment-ledger-row:hover,
.payment-ledger-row:focus-within {
  background: #f8fbf8;
  box-shadow: inset 3px 0 0 rgba(69, 163, 65, 0.62);
}

.payment-ledger-row.is-selected {
  background: #f1f9ef;
  box-shadow: inset 3px 0 0 #45a341;
}

.payment-ledger-row.is-cancelled {
  background: #fffafa;
}

.payment-ledger-row__selector {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  cursor: pointer;
}

.payment-ledger-row__selector input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.payment-ledger-row__selector span {
  position: relative;
  width: 17px;
  height: 17px;
  border: 1.5px solid #bdcad8;
  border-radius: 6px;
  background: #fff;
  transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
}

.payment-ledger-row__selector span::after {
  position: absolute;
  top: 3px;
  left: 5px;
  width: 4px;
  height: 7px;
  border-right: 2px solid #fff;
  border-bottom: 2px solid #fff;
  content: '';
  opacity: 0;
  transform: rotate(45deg);
}

.payment-ledger-row__selector input:checked + span {
  border-color: #3d9238;
  background: #45a341;
}

.payment-ledger-row__selector input:checked + span::after {
  opacity: 1;
}

.payment-ledger-row__selector input:focus-visible + span {
  box-shadow: 0 0 0 3px rgba(69, 163, 65, 0.17);
}

.payment-ledger-row__selector.is-disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.payment-ledger-row__identity {
  min-width: 0;
}

.payment-ledger-row__title,
.payment-ledger-row__subline {
  display: flex;
  align-items: center;
  min-width: 0;
}

.payment-ledger-row__title {
  gap: 7px;
}

.payment-ledger-row__title strong {
  overflow: hidden;
  color: #17243c;
  font-size: 0.7rem;
  font-weight: 850;
  letter-spacing: -0.015em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.payment-ledger-row__subline {
  gap: 6px;
  margin-top: 2px;
  overflow: hidden;
  color: #7c8899;
  font-size: 0.59rem;
  font-weight: 690;
  white-space: nowrap;
}

.payment-ledger-row__subline > * {
  overflow: hidden;
  text-overflow: ellipsis;
}

.payment-ledger-row__subline > * + *::before {
  margin-right: 6px;
  color: #c0c9d4;
  content: '·';
}

.payment-ledger-row__subline b {
  flex: 0 0 auto;
  color: #526176;
  font-weight: 800;
}

.payment-ledger-status {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 2px 6px;
  font-size: 0.52rem;
  font-weight: 850;
  letter-spacing: 0.02em;
}

.payment-ledger-status.is-active {
  background: #eaf7e8;
  color: #2e7d32;
}

.payment-ledger-status.is-audit {
  background: #fff5dd;
  color: #8a6816;
}

.payment-ledger-status.is-cancelled {
  background: #fff0ef;
  color: #b94b45;
}

.payment-ledger-row__amount {
  color: #2f8040;
  font-size: 0.72rem;
  font-weight: 880;
  text-align: right;
  white-space: nowrap;
}

.payment-ledger-row.is-cancelled .payment-ledger-row__amount {
  color: #9a5960;
  text-decoration: line-through;
}

.payment-ledger-row__actions {
  display: inline-flex;
  justify-content: flex-end;
  gap: 4px;
  opacity: 0;
  transform: translateX(4px);
  transition: opacity 150ms ease, transform 150ms ease;
}

.payment-ledger-row:hover .payment-ledger-row__actions,
.payment-ledger-row:focus-within .payment-ledger-row__actions,
.payment-ledger-row.is-selected .payment-ledger-row__actions {
  opacity: 1;
  transform: translateX(0);
}

.payment-ledger-action {
  display: inline-grid;
  width: 28px;
  height: 28px;
  border: 1px solid #dce5ee;
  border-radius: 9px;
  background: #fff;
  color: #386f55;
  cursor: pointer;
  place-items: center;
  transition: border-color 140ms ease, background 140ms ease, color 140ms ease, transform 140ms ease;
}

.payment-ledger-action:hover:not(:disabled) {
  border-color: #bcd9c4;
  background: #eef8f0;
  color: #246b3d;
  transform: translateY(-1px);
}

.payment-ledger-action--pay {
  border-color: #c9e1c5;
  background: #f2faf0;
  color: #2e7d32;
}

.payment-ledger-action--danger {
  color: #b54a46;
}

.payment-ledger-action--danger:hover:not(:disabled) {
  border-color: #efc9c6;
  background: #fff3f2;
  color: #a73531;
}

.payment-ledger-action:disabled {
  cursor: not-allowed;
  opacity: 0.34;
}

@media (hover: none) {
  .payment-ledger-row__actions {
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 720px) {
  .payment-ledger-row {
    grid-template-columns: 26px minmax(0, 1fr) auto;
    gap: 8px;
    padding: 7px 8px;
  }

  .payment-ledger-row__amount {
    grid-column: 3;
    grid-row: 1;
  }

  .payment-ledger-row__actions {
    grid-column: 2 / -1;
    justify-content: flex-start;
  }

  .payment-ledger-row__subline span:nth-last-child(-n + 2) {
    display: none;
  }
}
</style>
