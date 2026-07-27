<template>
  <Teleport to="body">
    <div class="modal-overlay payment-history-modal-overlay" @click.self="emit('close')">
      <section
        class="modal-container payment-history-modal"
        :class="{ 'has-payment-tools': paymentItems.length }"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-history-title"
      >
        <header class="payment-history-modal__header">
          <div class="payment-history-modal__heading">
            <span class="payment-history-modal__eyebrow">Recibos de pago</span>
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
            <span>Pagos vigentes</span>
            <strong>{{ activeCount }}</strong>
          </article>
          <article>
            <span>Conceptos</span>
            <strong>{{ conceptCount }}</strong>
          </article>
        </div>

        <div v-if="paymentItems.length" class="payment-history-modal__tools">
          <label class="payment-history-search">
            <LucideSearch :size="15" aria-hidden="true" />
            <input
              v-model.trim="searchQuery"
              type="search"
              autocomplete="off"
              placeholder="Buscar folio, concepto, mes o método"
              aria-label="Buscar pagos"
            />
          </label>
          <button
            type="button"
            class="payment-selection-toggle"
            :disabled="!visibleSelectableItems.length || (selectionLimitReached && !allVisibleSelected)"
            @click="toggleVisibleSelection"
          >
            {{ allVisibleSelected ? 'Quitar visibles' : 'Seleccionar visibles' }}
          </button>
          <button
            v-if="selectedCount"
            type="button"
            class="payment-selection-clear"
            @click="clearSelection"
          >
            Limpiar
          </button>
        </div>

        <div class="payment-history-modal__body">
          <div v-if="!paymentItems.length" class="payment-history-modal__empty">
            <LucideReceiptText :size="28" />
            <strong>Sin pagos registrados</strong>
            <span>Los conceptos seleccionados todavía no tienen movimientos individuales.</span>
          </div>

          <div v-else-if="!filteredPaymentItems.length" class="payment-history-modal__empty payment-history-modal__empty--compact">
            <LucideSearch :size="25" />
            <strong>Sin coincidencias</strong>
            <span>Prueba con otro folio, concepto, mes o método de pago.</span>
          </div>

          <template v-else>
            <article
              v-for="item in filteredPaymentItems"
              :key="paymentItemKey(item)"
              :class="[
                'payment-history-item',
                {
                  'is-cancelled': item.cancelled,
                  'is-selected': isSelected(item),
                  'is-selectable': !isItemSelectionDisabled(item),
                  'is-limit-disabled': isItemSelectionDisabled(item) && !item.cancelled,
                },
              ]"
              @click="toggleItem(item)"
            >
              <div class="payment-history-item__main">
                <label
                  class="payment-history-item__selector"
                  :class="{ 'is-disabled': isItemSelectionDisabled(item) }"
                  :aria-label="selectionLabel(item)"
                  @click.stop
                >
                  <input
                    type="checkbox"
                    :checked="isSelected(item)"
                    :disabled="isItemSelectionDisabled(item)"
                    @change="toggleItem(item)"
                  />
                  <span aria-hidden="true"></span>
                </label>

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
                  <span class="payment-history-item__concept">{{ conceptLabel(item) }}</span>
                  <span class="payment-history-item__period">{{ periodLabel(item) }}</span>
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

              <div class="payment-history-item__actions" @click.stop>
                <button
                  type="button"
                  class="payment-item-action"
                  :disabled="item.cancelled"
                  @click="emitReceipt([item])"
                >
                  <LucideDownload :size="14" />
                  Recibo individual
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
          </template>
        </div>

        <footer class="payment-history-modal__footer">
          <div :class="['payment-selection-summary', { 'is-empty': !selectedCount }]" aria-live="polite">
            <span>{{ selectedCount ? 'Selección actual' : 'Recibo combinado' }}</span>
            <strong v-if="selectedCount">{{ selectedCount }} pago{{ selectedCount === 1 ? '' : 's' }} · ${{ money(selectedTotal) }}</strong>
            <strong v-else>Selecciona uno o varios pagos</strong>
            <small v-if="selectionLimitReached">
              Máximo de {{ MAX_COMBINED_RECEIPT_PAYMENTS }} pagos alcanzado para este recibo.
            </small>
            <small v-else-if="selectedCount">
              {{ selectedConceptCount }} concepto{{ selectedConceptCount === 1 ? '' : 's' }} en un solo recibo
            </small>
            <small v-else>Puedes combinar pagos de conceptos y fechas distintas.</small>
          </div>
          <div class="payment-history-modal__footer-actions">
            <button class="btn btn-ghost" type="button" @click="emit('close')">Cerrar</button>
            <button
              class="btn btn-primary payment-history-generate"
              type="button"
              :disabled="!selectedCount"
              @click="emitReceipt(selectedItems)"
            >
              <LucideDownload :size="15" />
              {{ selectedCount > 1 ? 'Generar recibo combinado' : 'Generar recibo' }}
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { MAX_COMBINED_RECEIPT_PAYMENTS } from '~/shared/constants/paymentReceipt'
import {
  LucideBan,
  LucideBuilding2,
  LucideCalendarClock,
  LucideCreditCard,
  LucideDownload,
  LucideFileText,
  LucideReceiptText,
  LucideSearch,
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

const searchQuery = ref('')
const selectedKeys = ref(new Set())

const statusKey = (value) => String(value || '').trim().toLowerCase()
const normalizedText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()
const normalizedMethod = normalizedText
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
const paymentItemKey = (item) => {
  const folio = Number(item?.payment?.folio)
  if (Number.isInteger(folio) && folio > 0) return `folio:${folio}`

  return [
    'payment',
    item?.debt?.documento || item?.payment?.documento || '',
    item?.payment?.mes || item?.debt?.mes || '',
    item?.payment?.fecha || '',
    item?.payment?.monto || '',
  ].join(':')
}
const conceptLabel = (item) => item?.payment?.conceptoNombre || item?.debt?.conceptoNombre || 'Concepto financiero'
const periodLabel = (item) => item?.debt?.mesLabel || item?.payment?.mesReal || item?.payment?.mes || 'Cargo'

const paymentItems = computed(() => {
  const seen = new Set()
  const rows = []

  for (const debt of props.debts || []) {
    for (const payment of debt?.historialPagos || []) {
      const row = { debt, payment, cancelled: isCancelled(payment) }
      const key = paymentItemKey(row)
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(row)
    }
  }

  return rows.sort((a, b) => {
    const aDate = new Date(a.payment?.fecha || 0).getTime() || 0
    const bDate = new Date(b.payment?.fecha || 0).getTime() || 0
    if (aDate !== bDate) return bDate - aDate
    return Number(b.payment?.folio || 0) - Number(a.payment?.folio || 0)
  })
})

watch(paymentItems, (items) => {
  const validKeys = new Set(items.filter((item) => !item.cancelled).map(paymentItemKey))
  selectedKeys.value = new Set([...selectedKeys.value].filter((key) => validKeys.has(key)))
}, { immediate: true })

const filteredPaymentItems = computed(() => {
  const query = normalizedText(searchQuery.value)
  if (!query) return paymentItems.value

  return paymentItems.value.filter((item) => {
    const haystack = [
      item.payment?.folio,
      item.payment?.folio_plantel,
      conceptLabel(item),
      periodLabel(item),
      paymentMethodLabel(item.payment),
      paymentCampusLabel(item.payment),
      item.payment?.fecha,
      item.payment?.monto,
    ].map(normalizedText).join(' ')
    return haystack.includes(query)
  })
})

const paymentConceptNames = computed(() => Array.from(new Set(paymentItems.value.map(conceptLabel).filter(Boolean))))
const activeItems = computed(() => paymentItems.value.filter((item) => !item.cancelled))
const visibleSelectableItems = computed(() => filteredPaymentItems.value.filter((item) => !item.cancelled))
const activePaidTotal = computed(() => activeItems.value.reduce((sum, item) => sum + Number(item.payment?.monto || 0), 0))
const activeCount = computed(() => activeItems.value.length)
const conceptCount = computed(() => paymentConceptNames.value.length)
const selectedItems = computed(() => paymentItems.value.filter((item) => selectedKeys.value.has(paymentItemKey(item)) && !item.cancelled))
const selectedCount = computed(() => selectedItems.value.length)
const selectedTotal = computed(() => selectedItems.value.reduce((sum, item) => sum + Number(item.payment?.monto || 0), 0))
const selectedConceptCount = computed(() => new Set(selectedItems.value.map(conceptLabel)).size)
const allVisibleSelected = computed(() => (
  visibleSelectableItems.value.length > 0 &&
  visibleSelectableItems.value.every((item) => selectedKeys.value.has(paymentItemKey(item)))
))
const selectionLimitReached = computed(() => selectedCount.value >= MAX_COMBINED_RECEIPT_PAYMENTS)

const isSelected = (item) => selectedKeys.value.has(paymentItemKey(item))
const isItemSelectionDisabled = (item) => (
  Boolean(item?.cancelled) || (selectionLimitReached.value && !isSelected(item))
)
const selectionLabel = (item) => {
  if (item?.cancelled) return 'Pago cancelado'
  if (isItemSelectionDisabled(item)) return `Límite de ${MAX_COMBINED_RECEIPT_PAYMENTS} pagos alcanzado`
  const action = isSelected(item) ? 'Quitar' : 'Seleccionar'
  return `${action} folio ${item?.payment?.folio_plantel || item?.payment?.folio}`
}
const toggleItem = (item) => {
  if (!item || item.cancelled) return
  const key = paymentItemKey(item)
  const next = new Set(selectedKeys.value)
  if (next.has(key)) next.delete(key)
  else if (next.size < MAX_COMBINED_RECEIPT_PAYMENTS) next.add(key)
  selectedKeys.value = next
}
const toggleVisibleSelection = () => {
  if (!visibleSelectableItems.value.length) return
  const next = new Set(selectedKeys.value)
  if (allVisibleSelected.value) {
    visibleSelectableItems.value.forEach((item) => next.delete(paymentItemKey(item)))
  } else {
    for (const item of visibleSelectableItems.value) {
      if (next.size >= MAX_COMBINED_RECEIPT_PAYMENTS) break
      next.add(paymentItemKey(item))
    }
  }
  selectedKeys.value = next
}
const clearSelection = () => {
  selectedKeys.value = new Set()
}
const emitReceipt = (items) => {
  const normalizedItems = (Array.isArray(items) ? items : []).filter((item) => item && !item.cancelled)
  const folios = Array.from(new Set(normalizedItems
    .map((item) => Number(item.payment?.folio))
    .filter((folio) => Number.isInteger(folio) && folio > 0)))
  if (!folios.length) return
  emit('receipt', { items: normalizedItems, folios, payment: normalizedItems[0]?.payment })
}

const title = computed(() => (
  paymentConceptNames.value.length === 1
    ? paymentConceptNames.value[0]
    : 'Seleccionar pagos para recibo'
))

const subtitle = computed(() => {
  if (paymentConceptNames.value.length > 1) {
    return `${paymentConceptNames.value.length} conceptos con pagos · combina movimientos en un solo recibo`
  }

  const periods = Array.from(new Set(paymentItems.value.map(periodLabel).filter(Boolean)))
  const documents = Array.from(new Set(paymentItems.value
    .map((item) => item?.debt?.documento || item?.payment?.documento)
    .filter(Boolean)))
  const parts = []
  if (periods.length === 1) parts.push(periods[0])
  else if (periods.length > 1) parts.push(`${periods.length} periodos`)
  if (documents.length === 1) parts.push(`Documento ${documents[0]}`)
  else if (documents.length > 1) parts.push(`${documents.length} documentos`)
  return parts.join(' · ') || 'Selecciona uno o varios movimientos vigentes'
})

const money = (value) => Number(value || 0).toLocaleString('es-MX', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
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
  width: min(860px, 100%);
  max-height: min(880px, calc(100vh - 40px));
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  overflow: hidden;
}

.payment-history-modal.has-payment-tools {
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
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
  align-items: flex-end;
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
.payment-history-item__amount span,
.payment-selection-summary > span {
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

.payment-history-modal__tools {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 20px;
  border-bottom: 1px solid #edf1f5;
  background: #fff;
}

.payment-history-search {
  display: flex;
  flex: 1 1 280px;
  min-width: 160px;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid #dfe7ef;
  border-radius: 10px;
  background: #fbfcfe;
  color: #7b8799;
}

.payment-history-search:focus-within {
  border-color: #94c3aa;
  box-shadow: 0 0 0 3px rgba(47, 127, 77, .08);
}

.payment-history-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #25324a;
  font: inherit;
  font-size: 11px;
}

.payment-selection-toggle,
.payment-selection-clear {
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid #dfe7ef;
  border-radius: 10px;
  background: #fff;
  color: #2f6f57;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
}

.payment-selection-toggle:hover:not(:disabled),
.payment-selection-clear:hover {
  border-color: #b8d3c4;
  background: #f4faf6;
}

.payment-selection-clear {
  color: #677386;
}

.payment-selection-toggle:disabled {
  cursor: default;
  opacity: .45;
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

.payment-history-modal__empty--compact {
  padding-block: 30px;
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
  transition: border-color 150ms ease, box-shadow 150ms ease, background 150ms ease;
}

.payment-history-item.is-selectable {
  cursor: pointer;
}

.payment-history-item.is-selectable:hover {
  border-color: #bdd5c6;
}

.payment-history-item.is-selected {
  border-color: #68a97c;
  background: #fbfefc;
  box-shadow: 0 0 0 3px rgba(47, 127, 77, .08), 0 10px 24px rgba(31, 43, 67, .055);
}

.payment-history-item.is-limit-disabled {
  cursor: default;
}

.payment-history-item:focus-visible {
  outline: 3px solid rgba(47, 127, 77, .16);
  outline-offset: 2px;
}

.payment-history-item.is-cancelled {
  background: #fafafa;
  opacity: .72;
}

.payment-history-item__main {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.payment-history-item__selector {
  position: relative;
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  cursor: pointer;
}

.payment-history-item__selector input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  opacity: 0;
  white-space: nowrap;
}

.payment-history-item__selector span {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border: 1.5px solid #bcc7d4;
  border-radius: 5px;
  background: #fff;
  transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
}

.payment-history-item__selector span::after {
  width: 8px;
  height: 4px;
  border-bottom: 2px solid #fff;
  border-left: 2px solid #fff;
  content: '';
  opacity: 0;
  transform: translateY(-1px) rotate(-45deg) scale(.7);
  transition: opacity 120ms ease, transform 120ms ease;
}

.payment-history-item__selector input:checked + span {
  border-color: #2f7f4d;
  background: #2f7f4d;
  box-shadow: 0 3px 8px rgba(47, 127, 77, .2);
}

.payment-history-item__selector input:checked + span::after {
  opacity: 1;
  transform: translateY(-1px) rotate(-45deg) scale(1);
}

.payment-history-item__selector input:focus-visible + span {
  box-shadow: 0 0 0 3px rgba(47, 127, 77, .14);
}

.payment-history-item__selector.is-disabled {
  cursor: default;
}

.payment-history-item__selector.is-disabled span {
  background: #f1f3f5;
  opacity: .65;
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
  gap: 3px;
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

.payment-history-item__concept,
.payment-history-item__period {
  overflow-wrap: anywhere;
}

.payment-history-item__concept {
  color: #33425a;
  font-size: 11px;
  font-weight: 750;
}

.payment-history-item__period {
  color: #69768a;
  font-size: 10px;
}

.payment-history-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 2px;
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

.payment-selection-summary {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.payment-selection-summary strong {
  color: #203047;
  font-size: 13px;
}

.payment-selection-summary small {
  color: #6d798b;
  font-size: 10px;
}

.payment-selection-summary.is-empty strong {
  color: #536177;
}

.payment-history-modal__footer-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.payment-history-generate {
  min-width: 194px;
}

@media (max-width: 720px) {
  .payment-history-modal-overlay {
    padding: 8px;
  }

  .payment-history-modal {
    max-height: calc(100vh - 16px);
  }

  .payment-history-modal__tools {
    flex-wrap: wrap;
  }

  .payment-history-search {
    flex-basis: 100%;
  }

  .payment-history-item__main {
    grid-template-columns: auto auto minmax(0, 1fr);
  }

  .payment-history-item__amount {
    grid-column: 3;
    justify-items: start;
  }

  .payment-history-modal__footer {
    align-items: stretch;
    flex-direction: column;
  }

  .payment-history-modal__footer-actions {
    display: grid;
    grid-template-columns: minmax(0, .65fr) minmax(0, 1.35fr);
  }

  .payment-history-generate {
    min-width: 0;
  }
}

@media (max-width: 520px) {
  .payment-history-modal__summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .payment-history-modal__summary article:last-child {
    grid-column: 1 / -1;
  }

  .payment-history-item__main {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
  }

  .payment-history-item__icon {
    display: none;
  }

  .payment-history-item__amount {
    grid-column: 2;
  }

  .payment-history-item__actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .payment-history-modal__footer-actions {
    grid-template-columns: 1fr;
  }
}
</style>
