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
              <p>Colegiatura · Doc. {{ debt?.documento }}</p>
              <h2 id="tuition-title">Ajustar monto final</h2>
            </div>
          </div>
          <button type="button" aria-label="Cerrar" @click="requestClose">
            <LucideX :size="18" />
          </button>
        </header>

        <div class="tuition-body">
          <section class="tuition-current">
            <div>
              <small>Monto mensual actual</small>
              <strong>{{ currentAmountLabel }}</strong>
            </div>
            <LucideArrowRight :size="18" />
            <div class="is-new">
              <small>Monto mensual correcto</small>
              <strong>${{ format(newAmount) }}</strong>
            </div>
          </section>

          <label class="tuition-field">
            <span>Monto mensual correcto</span>
            <div class="tuition-money-input">
              <b>$</b>
              <input
                v-model.number="newAmount"
                type="number"
                min="1"
                step="1"
                inputmode="numeric"
                :disabled="saving"
                @input="amountEdited = true"
              />
            </div>
          </label>

          <section class="tuition-summary" aria-label="Impacto de la corrección">
            <div>
              <small>Mensualidades</small>
              <strong>{{ activeRows.length }}</strong>
            </div>
            <div>
              <small>Total actual</small>
              <strong>${{ format(currentTotal) }}</strong>
            </div>
            <div>
              <small>Total corregido</small>
              <strong>${{ format(correctedTotal) }}</strong>
            </div>
            <div>
              <small>Saldo estimado</small>
              <strong>${{ format(correctedBalance) }}</strong>
            </div>
          </section>

          <section v-if="hasDifferentAmounts" class="tuition-note">
            <LucideShieldCheck :size="17" />
            <p>Este documento tiene montos distintos. La corrección aplicará el mismo monto a todas sus mensualidades activas.</p>
          </section>

          <section v-if="paidTotal > 0" class="tuition-note">
            <LucideShieldCheck :size="17" />
            <p>Los pagos existentes se conservarán. El monto no puede quedar por debajo de lo ya pagado en una mensualidad.</p>
          </section>

          <label class="tuition-field">
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
            Los pagos, folios y fechas no se modificarán. El Estado de Cuenta recalculará el saldo con el nuevo monto.
          </p>
        </div>

        <footer class="tuition-actions">
          <button type="button" class="tuition-secondary" :disabled="saving" @click="requestClose">
            Cancelar
          </button>
          <button type="button" class="tuition-primary" :disabled="!canSave" @click="save">
            <LucideLoader2 v-if="saving" class="animate-spin" :size="16" />
            <LucideCheckCircle2 v-else :size="16" />
            Aplicar corrección
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

const props = defineProps({
  debt: { type: Object, required: true },
  documentDebts: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'success'])
const { show } = useToast()

const saving = ref(false)
const amountEdited = ref(false)
const reason = ref('')
const errorMessage = ref('')

const activeRows = computed(() => {
  const rows = Array.isArray(props.documentDebts) ? props.documentDebts : []
  return rows.length ? rows : [props.debt]
})

const monthlyAmounts = computed(() => activeRows.value
  .map((row) => Number(row?.costoOriginal ?? row?.montoFinal ?? 0))
  .filter((value) => Number.isFinite(value) && value >= 0))

const uniqueAmounts = computed(() => Array.from(new Set(monthlyAmounts.value.map((value) => Number(value.toFixed(2))))))
const initialAmount = computed(() => Number(props.debt?.costoOriginal ?? props.debt?.montoFinal ?? uniqueAmounts.value[0] ?? 0))
const newAmount = ref(Math.max(1, Math.round(initialAmount.value || 0)))

watch(initialAmount, (value) => {
  if (!amountEdited.value) newAmount.value = Math.max(1, Math.round(Number(value || 0)))
})

const hasDifferentAmounts = computed(() => uniqueAmounts.value.length > 1)
const currentAmountLabel = computed(() => {
  if (!uniqueAmounts.value.length) return '$0.00'
  if (uniqueAmounts.value.length === 1) return `$${format(uniqueAmounts.value[0])}`
  const min = Math.min(...uniqueAmounts.value)
  const max = Math.max(...uniqueAmounts.value)
  return `$${format(min)} – $${format(max)}`
})

const currentTotal = computed(() => monthlyAmounts.value.reduce((sum, value) => sum + value, 0))
const paidTotal = computed(() => activeRows.value.reduce((sum, row) => sum + Number(row?.resuelto ?? row?.pagos ?? 0), 0))
const minimumAllowed = computed(() => Math.max(0, ...activeRows.value.map((row) => Number(row?.resuelto ?? row?.pagos ?? 0))))
const correctedTotal = computed(() => Math.max(0, Number(newAmount.value || 0)) * activeRows.value.length)
const correctedBalance = computed(() => activeRows.value.reduce(
  (sum, row) => sum + Math.max(0, Number(newAmount.value || 0) - Number(row?.resuelto ?? row?.pagos ?? 0)),
  0,
))
const belowPaymentFloor = computed(() => Number(newAmount.value || 0) + 0.009 < minimumAllowed.value)
const isWholePositive = computed(() => {
  const value = Number(newAmount.value)
  return Number.isFinite(value) && value > 0 && Math.floor(value) === value
})
const unchanged = computed(() => uniqueAmounts.value.length > 0 && uniqueAmounts.value.every(
  (value) => Math.abs(value - Number(newAmount.value || 0)) < 0.009,
))
const dirty = computed(() => amountEdited.value || Boolean(reason.value))
const canSave = computed(() => !saving.value && isWholePositive.value && !belowPaymentFloor.value && !unchanged.value && Boolean(reason.value))

function format(value) {
  return Number(value || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function requestClose() {
  if (saving.value) return
  if (dirty.value && !window.confirm('Hay cambios sin guardar. ¿Salir sin guardar?')) return
  emit('close')
}

async function save() {
  if (!canSave.value) return
  saving.value = true
  errorMessage.value = ''

  try {
    await $fetch(`/api/documentos/${props.debt.documento}/monto`, {
      method: 'PUT',
      body: {
        montoFinal: Number(newAmount.value),
        motivo: reason.value,
      },
    })
    show('Monto final actualizado', 'success')
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
  width: min(520px, 100%);
  max-height: min(760px, calc(100vh - 32px));
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
  align-items: center;
  gap: 12px;
}

.tuition-icon {
  display: grid;
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
  color: #7990a6;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.tuition-header h2 {
  margin-top: 2px;
  color: #20364b;
  font-size: 20px;
  line-height: 1.2;
}

.tuition-header > button {
  display: grid;
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

.tuition-current div {
  min-width: 0;
}

.tuition-current small,
.tuition-summary small {
  display: block;
  margin-bottom: 3px;
  color: #7d91a4;
  font-size: 11px;
  font-weight: 750;
}

.tuition-current strong {
  color: #29445f;
  font-size: 17px;
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
  min-height: 44px;
  border: 1px solid #d8e3ec;
  border-radius: 12px;
  background: #fff;
}

.tuition-field select {
  width: 100%;
  padding: 0 13px;
  color: #253f59;
  font-weight: 700;
}

.tuition-money-input {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 13px;
}

.tuition-money-input b {
  color: #6f8598;
}

.tuition-money-input input {
  width: 100%;
  border: 0;
  outline: 0;
  color: #203a54;
  background: transparent;
  font-size: 20px;
  font-weight: 850;
}

.tuition-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
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

  .tuition-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
