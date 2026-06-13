<template>
  <Teleport to="body">
    <div class="tuition-overlay" @click.self="requestClose">
      <section
        class="tuition-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tuition-title"
      >
        <header class="tuition-header">
          <div class="tuition-title-wrap">
            <span class="tuition-icon"><LucideCircleDollarSign :size="19" /></span>
            <div>
              <p>{{ debt?.conceptoNombre || 'Documento' }} · Doc. {{ debt?.documento }}</p>
              <h2 id="tuition-title">{{ modalTitle }}</h2>
            </div>
          </div>
          <button type="button" aria-label="Cerrar" @click="requestClose">
            <LucideX :size="18" />
          </button>
        </header>

        <div class="tuition-body">
          <section class="tuition-current" :class="{ 'is-pending': isSetMode }">
            <div>
              <small>{{ currentAmountTitle }}</small>
              <strong>{{ currentAmountDisplay }}</strong>
              <span v-if="isSetMode">Proyección usada hoy: {{ currentProjectionLabel }}</span>
            </div>
            <LucideArrowRight :size="18" />
            <div class="is-new">
              <small>{{ proposedAmountTitle }}</small>
              <strong>${{ format(newAmount) }}</strong>
              <span>{{ affectedLabel }}</span>
            </div>
          </section>

          <label class="tuition-field">
            <span>{{ amountFieldLabel }}</span>
            <div class="tuition-money-input">
              <b>$</b>
              <input
                v-model.number="newAmount"
                type="number"
                min="1"
                step="1"
                inputmode="numeric"
                :disabled="saving"
                autofocus
                @input="amountEdited = true"
              />
            </div>
          </label>

          <section class="tuition-balance-preview" aria-label="Vista previa del saldo">
            <div class="tuition-balance-copy">
              <small>Saldo actual</small>
              <strong>${{ format(currentBalance) }}</strong>
            </div>
            <div class="tuition-balance-arrow">
              <LucideArrowRight :size="18" />
            </div>
            <div class="tuition-balance-copy is-projected">
              <small>Saldo con el nuevo monto</small>
              <strong>${{ format(correctedBalance) }}</strong>
            </div>
            <span class="tuition-balance-delta" :class="balanceDeltaClass">
              {{ balanceDeltaLabel }}
            </span>
          </section>

          <section class="tuition-summary" aria-label="Impacto del monto final">
            <div>
              <small>{{ affectedCountTitle }}</small>
              <strong>{{ affectedRows.length }}</strong>
            </div>
            <div>
              <small>Total actual</small>
              <strong>${{ format(currentTotal) }}</strong>
            </div>
            <div>
              <small>Total propuesto</small>
              <strong>${{ format(correctedTotal) }}</strong>
            </div>
            <div>
              <small>Pagado aplicado</small>
              <strong>${{ format(paidTotal) }}</strong>
            </div>
          </section>

          <section v-if="hasDifferentAmounts && !isSetMode" class="tuition-note">
            <LucideShieldCheck :size="17" />
            <p>Este documento tiene montos distintos. La corrección aplicará el mismo monto a todas sus mensualidades activas.</p>
          </section>

          <section v-if="paidTotal > 0" class="tuition-note">
            <LucideShieldCheck :size="17" />
            <p>Los pagos existentes se conservarán. Solo cambiará el monto usado para calcular el saldo.</p>
          </section>

          <label v-if="!isSetMode" class="tuition-field">
            <span>Motivo</span>
            <select v-model="reason" :disabled="saving">
              <option value="" disabled>Selecciona una opción</option>
              <option value="beca_historica">Beca histórica</option>
              <option value="convenio_no_registrado">Convenio no registrado</option>
              <option value="monto_incorrecto">Monto capturado incorrectamente</option>
              <option value="otro">Otro</option>
            </select>
          </label>

          <div v-if="belowPaymentFloor" class="tuition-error">
            El monto no puede ser menor a ${{ format(minimumAllowed) }} porque ya existen pagos registrados.
          </div>
          <div v-else-if="errorMessage" class="tuition-error">{{ errorMessage }}</div>

          <p class="tuition-footnote">
            {{ footnote }}
          </p>
        </div>

        <ModalDiscardDialog
          :show="showDiscardConfirmation"
          @continue="showDiscardConfirmation = false"
          @discard="discardAndClose"
        />

        <footer class="tuition-actions">
          <button type="button" class="tuition-secondary" :disabled="saving" @click="requestClose">
            Cancelar
          </button>
          <button type="button" class="tuition-primary" :disabled="!canSave" @click="save">
            <LucideLoader2 v-if="saving" class="animate-spin" :size="16" />
            <LucideCheckCircle2 v-else :size="16" />
            {{ saving ? savingLabel : primaryLabel }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  LucideArrowRight,
  LucideCheckCircle2,
  LucideCircleDollarSign,
  LucideLoader2,
  LucideShieldCheck,
  LucideX,
} from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { useScrollLock } from '~/composables/useScrollLock'

const props = defineProps({
  debt: { type: Object, required: true },
  documentDebts: { type: Array, default: () => [] },
  mode: { type: String, default: 'adjust' },
  ciclo: { type: String, default: '' },
})

const emit = defineEmits(['close', 'success'])
const { show } = useToast()
useScrollLock()

const saving = ref(false)
const amountEdited = ref(false)
const reason = ref('')
const errorMessage = ref('')
const showDiscardConfirmation = ref(false)

const isSetMode = computed(() => props.mode === 'set')
const allDocumentRows = computed(() => {
  const rows = Array.isArray(props.documentDebts) ? props.documentDebts : []
  return rows.length ? rows : [props.debt]
})

const affectedRows = computed(() => {
  if (!isSetMode.value) return allDocumentRows.value

  const selectedPeriodId = Number(props.debt?.periodoId || 0)
  const source = String(props.debt?.montoFinalSource || '')

  if (source === 'legacy-period' && selectedPeriodId) {
    const periodRows = allDocumentRows.value.filter(
      (row) => Number(row?.periodoId || 0) === selectedPeriodId,
    )
    return periodRows.length ? periodRows : [props.debt]
  }

  const documentRows = allDocumentRows.value.filter(
    (row) => String(row?.montoFinalSource || '') === 'legacy-documento',
  )
  return documentRows.length ? documentRows : [props.debt]
})

const monthlyAmounts = computed(() => affectedRows.value
  .map((row) => Number(row?.costoOriginal ?? row?.montoFinal ?? 0))
  .filter((value) => Number.isFinite(value) && value >= 0))

const uniqueAmounts = computed(() => Array.from(
  new Set(monthlyAmounts.value.map((value) => Number(value.toFixed(2)))),
))
const initialAmount = computed(() => Number(
  props.debt?.costoOriginal ?? props.debt?.montoFinal ?? uniqueAmounts.value[0] ?? 0,
))
const newAmount = ref(Math.max(1, Math.round(initialAmount.value || 0)))

watch(initialAmount, (value) => {
  if (!amountEdited.value) newAmount.value = Math.max(1, Math.round(Number(value || 0)))
})

const recurring = computed(() => Boolean(props.debt?.recurring && !props.debt?.isEventual))
const hasDifferentAmounts = computed(() => uniqueAmounts.value.length > 1)
const currentProjectionLabel = computed(() => {
  if (!uniqueAmounts.value.length) return '$0.00'
  if (uniqueAmounts.value.length === 1) return `$${format(uniqueAmounts.value[0])}`
  const min = Math.min(...uniqueAmounts.value)
  const max = Math.max(...uniqueAmounts.value)
  return `$${format(min)} – $${format(max)}`
})
const currentAmountDisplay = computed(() => isSetMode.value ? 'Sin definir' : currentProjectionLabel.value)

const resolvedForRow = (row) => Number(row?.resuelto ?? row?.pagos ?? 0)
const projectedSubtotalForRow = (row) => {
  const base = Math.max(0, Number(newAmount.value || 0))
  const resolved = resolvedForRow(row)
  const balanceBeforeLateFee = base - resolved
  const appliesLateFee = Boolean(
    row?.recargoActivo
      && !row?.isEventual
      && (row?.recargoManual || (row?.isLate && balanceBeforeLateFee > 10)),
  )
  return appliesLateFee ? Math.trunc(base * 1.1) : base
}

const currentTotal = computed(() => monthlyAmounts.value.reduce((sum, value) => sum + value, 0))
const currentBalance = computed(() => affectedRows.value.reduce(
  (sum, row) => sum + Math.max(0, Number(row?.saldo || 0)),
  0,
))
const paidTotal = computed(() => affectedRows.value.reduce(
  (sum, row) => sum + resolvedForRow(row),
  0,
))
const minimumAllowed = computed(() => Math.max(
  0,
  ...affectedRows.value.map((row) => resolvedForRow(row)),
))
const correctedTotal = computed(() => Math.max(0, Number(newAmount.value || 0)) * affectedRows.value.length)
const correctedBalance = computed(() => affectedRows.value.reduce(
  (sum, row) => sum + Math.max(0, projectedSubtotalForRow(row) - resolvedForRow(row)),
  0,
))
const balanceDelta = computed(() => correctedBalance.value - currentBalance.value)
const balanceDeltaClass = computed(() => {
  if (Math.abs(balanceDelta.value) < 0.01) return 'is-neutral'
  return balanceDelta.value < 0 ? 'is-lower' : 'is-higher'
})
const balanceDeltaLabel = computed(() => {
  if (Math.abs(balanceDelta.value) < 0.01) return 'Sin cambio en saldo'
  const value = `$${format(Math.abs(balanceDelta.value))}`
  return balanceDelta.value < 0 ? `Saldo baja ${value}` : `Saldo aumenta ${value}`
})

const belowPaymentFloor = computed(() => !isSetMode.value && Number(newAmount.value || 0) + 0.009 < minimumAllowed.value)
const isWholePositive = computed(() => {
  const value = Number(newAmount.value)
  return Number.isFinite(value) && value > 0 && Math.floor(value) === value
})
const unchanged = computed(() => !isSetMode.value && uniqueAmounts.value.length > 0 && uniqueAmounts.value.every(
  (value) => Math.abs(value - Number(newAmount.value || 0)) < 0.009,
))
const dirty = computed(() => amountEdited.value || Boolean(reason.value))
const canSave = computed(() => (
  !saving.value
  && isWholePositive.value
  && !belowPaymentFloor.value
  && !unchanged.value
  && (isSetMode.value || Boolean(reason.value))
))

const modalTitle = computed(() => isSetMode.value ? 'Fijar monto final' : 'Ajustar monto final')
const currentAmountTitle = computed(() => isSetMode.value ? 'Monto final actual' : (recurring.value ? 'Monto mensual actual' : 'Monto actual'))
const proposedAmountTitle = computed(() => isSetMode.value ? 'Monto final propuesto' : (recurring.value ? 'Monto mensual correcto' : 'Monto correcto'))
const amountFieldLabel = computed(() => recurring.value ? 'Monto final por mensualidad' : 'Monto final del cargo')
const affectedCountTitle = computed(() => recurring.value ? 'Mensualidades afectadas' : 'Cargos afectados')
const affectedLabel = computed(() => `${affectedRows.value.length} ${affectedRows.value.length === 1 ? (recurring.value ? 'mensualidad' : 'cargo') : (recurring.value ? 'mensualidades' : 'cargos')}`)
const primaryLabel = computed(() => isSetMode.value ? 'Fijar monto final' : 'Aplicar corrección')
const savingLabel = computed(() => isSetMode.value ? 'Guardando...' : 'Aplicando...')
const footnote = computed(() => isSetMode.value
  ? 'Esta vista previa no registra un pago. Solo define el monto que Estado de Cuenta usará para calcular el saldo.'
  : 'Los pagos, folios y fechas no se modificarán. El Estado de Cuenta recalculará el saldo con el nuevo monto.',
)

function format(value) {
  return Number(value || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function requestClose() {
  if (saving.value) return
  if (dirty.value) {
    showDiscardConfirmation.value = true
    return
  }
  emit('close')
}

function discardAndClose() {
  showDiscardConfirmation.value = false
  emit('close')
}

useModalEscape(requestClose)

async function save() {
  if (!canSave.value) return
  saving.value = true
  errorMessage.value = ''

  try {
    if (isSetMode.value) {
      await $fetch('/api/documentos/monto-final', {
        method: 'POST',
        body: {
          documento: props.debt.documento,
          mes: props.debt.mes,
          montoFinal: Number(newAmount.value),
          ciclo: props.ciclo,
        },
      })
      show('Monto final definido', 'success')
    } else {
      await $fetch(`/api/documentos/${props.debt.documento}/monto`, {
        method: 'PUT',
        body: {
          montoFinal: Number(newAmount.value),
          motivo: reason.value,
        },
      })
      show('Monto final actualizado', 'success')
    }
    emit('success')
  } catch (error) {
    errorMessage.value = error?.data?.message || error?.message || 'No se pudo actualizar el monto final.'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.tuition-overlay {
  position: fixed;
  inset: 0;
  z-index: 2300;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(20, 32, 47, 0.46);
  backdrop-filter: blur(5px);
}

.tuition-modal {
  position: relative;
  width: min(560px, 100%);
  max-height: min(820px, calc(100vh - 32px));
  overflow: auto;
  border: 1px solid rgba(207, 220, 232, 0.9);
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 28px 80px rgba(31, 52, 75, 0.24);
}

.tuition-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 22px 24px 18px;
  border-bottom: 1px solid #edf2f6;
}

.tuition-title-wrap {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.tuition-title-wrap > div {
  min-width: 0;
}

.tuition-icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 13px;
  color: #3f8f35;
  background: #edf8ea;
}

.tuition-header p,
.tuition-header h2 {
  margin: 0;
}

.tuition-header p {
  overflow: hidden;
  color: #7990a6;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.tuition-header h2 {
  margin-top: 2px;
  color: #20364b;
  font-size: 20px;
  line-height: 1.2;
}

.tuition-header > button {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid #e2eaf1;
  border-radius: 11px;
  color: #6f8498;
  background: #fff;
}

.tuition-body {
  display: grid;
  gap: 16px;
  padding: 22px 24px;
}

.tuition-current {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 14px;
  padding: 15px 16px;
  border: 1px solid #e5edf4;
  border-radius: 15px;
  background: linear-gradient(180deg, #fff, #f9fbfd);
}

.tuition-current.is-pending {
  border-color: #e4e9d8;
  background: linear-gradient(180deg, #fff, #fbfcf6);
}

.tuition-current div {
  min-width: 0;
}

.tuition-current small,
.tuition-summary small,
.tuition-balance-preview small {
  display: block;
  margin-bottom: 3px;
  color: #7d91a4;
  font-size: 11px;
  font-weight: 750;
}

.tuition-current strong {
  display: block;
  color: #29445f;
  font-size: 17px;
}

.tuition-current span {
  display: block;
  margin-top: 4px;
  color: #8b9baa;
  font-size: 10px;
  font-weight: 700;
}

.tuition-current .is-new strong {
  color: #3f8f35;
}

.tuition-current > svg {
  color: #a8b6c3;
}

.tuition-field {
  display: grid;
  gap: 7px;
}

.tuition-field > span {
  color: #4d6479;
  font-size: 12px;
  font-weight: 800;
}

.tuition-field select,
.tuition-money-input {
  min-height: 48px;
  border: 1px solid #d8e3ec;
  border-radius: 13px;
  background: #fff;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.tuition-field select:focus,
.tuition-money-input:focus-within {
  border-color: #7bb66f;
  box-shadow: 0 0 0 4px rgba(92, 164, 77, 0.11);
}

.tuition-field select {
  width: 100%;
  padding: 0 13px;
  color: #253f59;
  font-weight: 700;
  outline: none;
}

.tuition-money-input {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 13px;
}

.tuition-money-input b {
  color: #6f8598;
  font-size: 18px;
}

.tuition-money-input input {
  width: 100%;
  border: 0;
  outline: 0;
  color: #203a54;
  background: transparent;
  font-size: 21px;
  font-weight: 850;
}

.tuition-balance-preview {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 1px solid #dfe8ef;
  border-radius: 16px;
  background: #f8fafc;
}

.tuition-balance-copy strong {
  color: #29445f;
  font-size: 20px;
}

.tuition-balance-copy.is-projected {
  text-align: right;
}

.tuition-balance-copy.is-projected strong {
  color: #315f2b;
}

.tuition-balance-arrow {
  color: #9eafbd;
}

.tuition-balance-delta {
  position: absolute;
  right: 14px;
  bottom: -10px;
  padding: 4px 9px;
  border: 1px solid;
  border-radius: 999px;
  background: #fff;
  font-size: 10px;
  font-weight: 850;
}

.tuition-balance-delta.is-lower {
  border-color: #cde4c8;
  color: #3c7d33;
}

.tuition-balance-delta.is-higher {
  border-color: #efd5b8;
  color: #a55a17;
}

.tuition-balance-delta.is-neutral {
  border-color: #dce5ec;
  color: #6d8193;
}

.tuition-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-top: 4px;
}

.tuition-summary > div {
  min-width: 0;
  padding: 11px;
  border: 1px solid #e7edf3;
  border-radius: 12px;
  background: #fbfcfd;
}

.tuition-summary strong {
  display: block;
  overflow: hidden;
  color: #2b465f;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tuition-note {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 13px;
  border: 1px solid #dcebd8;
  border-radius: 13px;
  color: #466340;
  background: #f6fbf4;
}

.tuition-note svg {
  flex: 0 0 auto;
  margin-top: 1px;
  color: #4b9a3e;
}

.tuition-note p,
.tuition-footnote {
  margin: 0;
  font-size: 12px;
  line-height: 1.48;
}

.tuition-footnote {
  color: #7d8f9f;
}

.tuition-error {
  padding: 11px 13px;
  border: 1px solid #f4d6da;
  border-radius: 12px;
  color: #a92f3d;
  background: #fff4f5;
  font-size: 12px;
  font-weight: 750;
}

.tuition-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px 22px;
  border-top: 1px solid #edf2f6;
}

.tuition-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 40px;
  padding: 0 16px;
  border-radius: 12px;
  font-weight: 800;
}

.tuition-secondary {
  border: 1px solid #d9e4ec;
  color: #587086;
  background: #fff;
}

.tuition-primary {
  border: 1px solid #47983a;
  color: #fff;
  background: linear-gradient(180deg, #64b851, #409535);
  box-shadow: 0 8px 20px rgba(64, 149, 53, 0.2);
}

.tuition-primary:disabled {
  opacity: 0.48;
  box-shadow: none;
}

@media (max-width: 620px) {
  .tuition-overlay {
    padding: 10px;
  }

  .tuition-modal {
    border-radius: 18px;
  }

  .tuition-header,
  .tuition-body,
  .tuition-actions {
    padding-left: 17px;
    padding-right: 17px;
  }

  .tuition-current,
  .tuition-balance-preview {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .tuition-current > svg,
  .tuition-balance-arrow {
    display: none;
  }

  .tuition-balance-copy.is-projected {
    text-align: left;
  }

  .tuition-balance-delta {
    position: static;
    justify-self: start;
  }

  .tuition-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
