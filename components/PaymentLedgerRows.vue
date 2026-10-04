<template>
  <div v-if="paymentItems.length" class="payment-ledger-rows">
    <article
      v-for="(item, itemIndex) in paymentItems"
      :key="paymentItemKey(item)"
      :class="[
        'payment-ledger-row account-ledger-row',
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
        <div class="payment-ledger-row__title account-ledger-title">
          <strong :title="paymentConceptLabel(item)">{{ paymentConceptLabel(item) }}</strong>
          <span :class="['payment-ledger-status account-ledger-status', paymentStatusClass(item)]">
            {{ paymentStatusLabel(item) }}
          </span>
        </div>
        <div class="payment-ledger-row__subline account-ledger-meta">
          <b>Folio {{ displayFolio(item.payment) }}</b>
          <span v-if="item.debt?.documento">Doc. {{ item.debt.documento }}</span>
          <span>{{ paymentPeriodLabel(item) }}</span>
          <span>{{ formatDate(item.payment?.fecha || item.payment?.fecha_original) }}</span>
          <span>{{ paymentMethodLabel(item.payment) }}</span>
        </div>
      </div>

      <strong class="payment-ledger-row__amount account-ledger-amount">
        ${{ money(item.payment?.monto) }}
      </strong>

      <div class="payment-ledger-row__actions account-ledger-actions" @click.stop>
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
          v-if="!item.payment?.depurado && invoiceForItem(item)"
          type="button"
          class="payment-ledger-action payment-ledger-action--invoiced"
          :title="`Ver factura ${invoiceForItem(item)?.folio || ''}`"
          :aria-label="`Ver factura ${invoiceForItem(item)?.folio || ''}`"
          @click="emit('open-invoice', invoiceForItem(item))"
        >
          <LucideBadgeCheck :size="15" />
        </button>
        <button
          v-else-if="!item.payment?.depurado"
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
  LucideBadgeCheck,
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
  invoiceLinks: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['toggle', 'receipt', 'invoice', 'open-invoice', 'cancel', 'pay'])

const paymentItems = computed(() => buildPaymentItems(props.debts as any[]))
const selectedKeySet = computed(() => new Set((props.selectedKeys || []).map(String)))
const selectionLimitReached = computed(
  () => selectedKeySet.value.size >= MAX_COMBINED_RECEIPT_PAYMENTS,
)

const invoiceForItem = (item: any) => {
  const payment = item?.payment || {}
  const folio = String(payment?.folio || '').trim()
  const folioPlantel = String(payment?.folio_plantel || '').trim().toUpperCase()
  return (folio && props.invoiceLinks?.[`folio:${folio}`])
    || (folioPlantel && props.invoiceLinks?.[`plantel:${folioPlantel}`])
    || null
}

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


<style scoped src="./students/accountLedger.css"></style>
<style scoped>
.payment-ledger-rows { container: payment-ledger / inline-size; display: grid; }
.payment-ledger-row { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto auto; }
.payment-ledger-row__identity { min-width: 0; }
.payment-ledger-row.is-cancelled { background: #fffafa; }
.payment-ledger-row.is-cancelled .payment-ledger-row__amount { color: #a84d45; text-decoration: line-through; }
.payment-ledger-row__selector { position: relative; display: grid; width: 24px; height: 28px; place-items: center; cursor: pointer; }
.payment-ledger-row__selector input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.payment-ledger-row__selector span { position: relative; width: 17px; height: 17px; border: 1px solid #b9c8bc; border-radius: 5px; background: #fff; }
.payment-ledger-row__selector span::after { position: absolute; top: 2px; left: 5px; width: 4px; height: 8px; border-right: 2px solid #fff; border-bottom: 2px solid #fff; content: ''; opacity: 0; transform: rotate(45deg); }
.payment-ledger-row__selector input:checked + span { border-color: var(--action-primary, #4e844e); background: var(--action-primary, #4e844e); }
.payment-ledger-row__selector input:checked + span::after { opacity: 1; }
.payment-ledger-row__selector input:focus-visible + span { outline: 2px solid var(--action-primary, #4e844e); outline-offset: 2px; }
.payment-ledger-row__selector.is-disabled { opacity: .42; cursor: not-allowed; }
.payment-ledger-action--invoiced { color: var(--action-primary, #4e844e) !important; background: #edf5e8 !important; }
@container payment-ledger (max-width: 420px) {
 .payment-ledger-row { grid-template-columns: 24px minmax(0, 1fr) auto; gap: 5px 8px; }
 .payment-ledger-row__actions { grid-column: 2 / -1; justify-content: flex-start; }
}
@container payment-ledger (max-width: 350px) {
 .payment-ledger-row__title { align-items: flex-start; }
 .payment-ledger-row__amount { font-size: 12px; }
}
</style>
