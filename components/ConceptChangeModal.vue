<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="!busy && $emit('close')">
      <div class="modal-container concept-modal" role="dialog" aria-modal="true" aria-label="Ajustar concepto">
        <div class="modal-header">
          <div>
            <h2 class="modal-title">Ajustar concepto</h2>
            <p class="modal-subtitle">
              Doc. {{ debt?.documento }} · {{ debt?.mesLabel }}
            </p>
          </div>
          <button
            class="modal-icon-button"
            type="button"
            aria-label="Cerrar"
            :disabled="busy"
            @click="$emit('close')"
          >
            <LucideX :size="18" />
          </button>
        </div>

        <div class="modal-content concept-content">
          <div class="adjust-tabs" aria-label="Tipo de ajuste">
            <button type="button" :class="{ selected: mode === 'concept' }" :aria-pressed="mode === 'concept'" :disabled="busy" @click="mode = 'concept'">Concepto</button>
            <button type="button" :class="{ selected: mode === 'amount' }" :aria-pressed="mode === 'amount'" :disabled="busy" @click="openAmountAdjustment"><LucideCircleDollarSign :size="15" /> Importe</button>
            <button v-if="canAdjustStart" type="button" :class="{ selected: mode === 'start' }" :aria-pressed="mode === 'start'" :disabled="busy" @click="openStartAdjustment">Mes de inicio</button>
          </div>

          <section v-if="mode === 'start'" class="start-card">
            <div class="start-heading">
              <LucideCalendarDays :size="19" />
              <div><h3>Comenzar la tira más adelante</h3><p>Retira únicamente los meses anteriores al nuevo inicio.</p></div>
            </div>
            <div v-if="loadingStart" class="start-feedback" role="status"><LucideLoader2 :size="16" class="animate-spin" /> Revisando meses y pagos…</div>
            <div v-else-if="startError" class="start-feedback error" role="alert">{{ startError }} <button type="button" class="btn btn-outline" @click="loadStartPreview">Reintentar</button></div>
            <template v-else-if="startPreview?.eligible">
              <div class="start-select-row">
                <div class="start-current"><small>Inicio actual</small><strong>{{ startPreview.months[0]?.label }}</strong></div>
                <LucideArrowRight :size="16" class="start-arrow" />
                <label class="field-block"><span>Nuevo inicio</span><select v-model.number="startMes" class="input-field" :disabled="busy">
                  <option value="">Seleccionar mes</option>
                  <option v-for="month in startOptions" :key="month.mes" :value="month.mes" :disabled="isStartBlocked(month.mes)">{{ month.label }}{{ isStartBlocked(month.mes) ? ' · meses anteriores con pagos' : '' }}</option>
                </select></label>
              </div>
              <div class="start-review" aria-live="polite">
                <template v-if="removedMonths.length">
                  <div class="start-review-label">Se retirará{{ removedMonths.length === 1 ? '' : 'n' }}</div>
                  <div class="start-months"><span v-for="month in removedMonths" :key="month.mes" :class="{ blocked: month.paymentCount > 0 }">{{ month.label }}<LucideLockKeyhole v-if="month.paymentCount > 0" :size="12" /></span></div>
                  <p v-if="blockedMonths.length" class="start-warning" role="alert">{{ blockedMonths.map(month => month.label).join(', ') }} tiene pagos vigentes. Elija un inicio anterior.</p>
                  <p v-else>Se conserva {{ keptRange }}, con sus pagos e importes actuales.</p>
                </template>
                <p v-else>Elija el primer mes que corresponde cobrar. Un mes con pagos vigentes no se puede retirar.</p>
              </div>
              <label class="field-block"><span>Motivo del ajuste</span><textarea v-model="startReason" class="input-field start-reason" rows="3" maxlength="2000" :disabled="busy" placeholder="Ej. Inicia colegiatura en octubre por cambio de categoría." /></label>
              <p class="start-audit"><LucideHistory :size="14" /> Quedará registrado en Cancelaciones, con su nombre y motivo. No requiere código.</p>

            </template>
            <p v-else class="start-feedback">Esta tira no tiene meses anteriores que puedan retirarse conservando meses activos.</p>
          </section>

          <section v-if="mode === 'amount'" class="amount-workspace" aria-label="Corrección de importe">
            <div v-if="loadingAmount" class="amount-feedback" role="status">
              <LucideLoader2 :size="16" class="animate-spin" /> Revisando pagos…
            </div>
            <div v-else-if="!amountPreview" class="amount-feedback amount-error" role="alert">
              <span>{{ amountError || 'No se pudo revisar el documento.' }}</span>
              <button type="button" class="btn btn-outline" @click="loadAmountPreview">Reintentar</button>
            </div>
            <template v-else>
              <div class="amount-intro">
                <div class="amount-intro-icon"><LucideCircleDollarSign :size="20" /></div>
                <div>
                  <h3>Importe del documento #{{ amountPreview.documento }}</h3>
                  <p>{{ amountPreview.conceptoNombre }}</p>
                </div>
              </div>
              <div v-if="!amountSelectedEditable" class="amount-feedback amount-error" role="status">
                Este mes tiene un importe propio por un cambio de concepto. No se altera desde aquí.
              </div>
              <template v-else>
                <div class="amount-compare">
                  <div class="amount-value-before">
                    <span>Importe actual</span>
                    <strong>{{ money(amountSelected?.currentAmount) }}</strong>
                  </div>
                  <LucideArrowRight class="amount-compare-arrow" :size="20" />
                  <label class="amount-value-after" :class="{ 'amount-input-invalid': amountBelowMinimum }">
                    <span>Nuevo importe</span>
                    <span class="amount-input-line">
                      <span>$</span>
                      <input v-model="amountInput" type="text" inputmode="decimal" autocomplete="off"
                        aria-label="Nuevo importe de este documento" :aria-invalid="amountBelowMinimum || amountFormatInvalid"
                        placeholder="0.00" :disabled="busy" @input="amountConfirming = false" />
                    </span>
                  </label>
                </div>
                <div class="amount-stats">
                  <div><span>Pagado · {{ amountSelected?.label }}</span><strong>{{ money(amountSelected?.paid) }}</strong></div>
                  <div><span>Mínimo permitido</span><strong>{{ money(amountPreview.minimumAllowed) }}</strong></div>
                  <div><span>Saldo base resultante</span>
                    <strong :class="{ 'amount-balanced': amountProjectedBalance === 0 && amountHasValidInput }">
                      {{ amountHasValidInput ? money(amountProjectedBalance) : '—' }}
                    </strong>
                  </div>
                </div>
                <div v-if="amountBelowMinimum" class="amount-minimum-guidance" role="alert">
                  <LucideAlertCircle :size="17" />
                  <div><strong>Ya hay pagos por {{ money(amountPreview.minimumAllowed) }}.</strong>
                    <p>El nuevo importe debe cubrirlos.</p>
                    <button type="button" :disabled="busy" @click="useMinimumAmount">Usar {{ money(amountPreview.minimumAllowed) }}</button>
                  </div>
                </div>
                <div v-else-if="amountFormatInvalid" class="amount-feedback amount-error" role="alert">
                  Ingresa un importe mayor a $0.00, con máximo dos decimales.
                </div>
                <div v-else-if="amountHasValidInput && amountProjectedBalance === 0" class="amount-feedback amount-ok">
                  <LucideCheckCircle :size="16" /> Saldo base del mes: $0.00.
                </div>
                <p v-if="amountPreview.affectedMonths > 1 || amountPreview.excludedMonths" class="amount-scope">
                  <LucideLayers3 :size="16" />
                  <span>
                    {{ amountPreview.affectedMonths }} {{ amountPreview.affectedMonths === 1 ? 'mes' : 'meses' }} de este documento {{ amountPreview.affectedMonths === 1 ? 'usa' : 'usan' }} el importe base.
                    <template v-if="amountPreview.excludedMonths"> Los meses con cambio de concepto conservan su importe.</template>
                  </span>
                </p>
                <div v-if="amountError" class="amount-feedback amount-error" role="alert">
                  <span>{{ amountError }}</span>
                  <button type="button" @click="loadAmountPreview">Actualizar</button>
                </div>
                <p class="amount-audit"><LucideHistory :size="16" />
                  Se registrará el cambio con tu usuario y se notificará en Telegram.
                </p>
                <div v-if="amountConfirming" class="amount-final-review" role="status">
                  <strong>Confirmar cambio</strong>
                  <p><b>{{ money(amountSelected?.currentAmount) }}</b> <LucideArrowRight :size="14" /> <b>{{ money(amountNumber) }}</b> · Doc. #{{ amountPreview.documento }}</p>
                </div>
              </template>
            </template>
          </section>

          <template v-if="mode === 'concept'">
          <section class="current-card">
            <div class="current-token">
              <small>Actual</small>
              <strong>{{ debt?.conceptoNombre }}</strong>
            </div>
            <div class="current-arrow"><LucideArrowRight :size="16" /></div>
            <div class="current-token active">
              <small>Desde</small>
              <strong>{{ debt?.mesLabel }}</strong>
            </div>
          </section>

          <section class="change-grid">
            <label class="field-block">
              <span>Nuevo concepto</span>
              <ConceptSearchSelect
                v-model="selectedConceptId"
                :concepts="conceptos"
                :loading="loadingConcepts"
                :disabled="busy"
                placeholder="Buscar concepto..."
              />
            </label>

            <label class="field-block compact-field">
              <span>Diferencia</span>
              <input
                v-model.number="diferenciaMontoInput"
                type="number"
                min="0"
                step="1"
                class="input-field"
              />
            </label>
          </section>

          <section class="preview-card">
            <div class="preview-track">
              <div
                v-for="segment in previewSegments"
                :key="`${segment.conceptoNombre}-${segment.startMes}-${segment.endMes}`"
                :class="['preview-segment', segment.tone]"
                :style="{ flexGrow: segment.weight }"
              >
                <strong>{{ segment.conceptoNombre }}</strong>
                <span>{{ segment.rangeLabel }}</span>
              </div>
            </div>
            <div v-if="diferenciaMonto > 0" class="differential-pill">
              <LucidePlus :size="13" /> +${{ format(diferenciaMonto) }}
              <span>en este ajuste</span>
            </div>
          </section>

          <div class="modal-action-row">
            <button
              class="btn btn-primary"
              type="button"
              :disabled="busy || !selectedConceptId"
              @click="submitChange"
            >
              <LucideLoader2
                v-if="busyAction === 'change'"
                class="animate-spin"
                :size="15"
              />
              <LucideCheckCircle v-else :size="15" />
              Guardar cambio
            </button>
          </div>

          <section class="cancel-card">
            <button
              class="btn btn-outline"
              type="button"
              :disabled="busy"
              @click="cancelFromMonth"
            >
              <LucideLoader2
                v-if="busyAction === 'cancel_from'"
                class="animate-spin"
                :size="15"
              />
              <LucideCalendarX v-else :size="15" />
              Cancelar desde {{ debt?.mesLabel }}
            </button>
            <button
              class="btn btn-danger"
              type="button"
              :disabled="busy"
              @click="cancelFull"
            >
              <LucideLoader2
                v-if="busyAction === 'cancel_full'"
                class="animate-spin"
                :size="15"
              />
              <LucideBan v-else :size="15" />
              Cancelar completo
            </button>
          </section>
          </template>
        </div>
        <div v-if="mode === 'amount' && amountPreview && amountSelectedEditable && !loadingAmount" class="modal-footer amount-footer">
          <button class="btn btn-outline" type="button" :disabled="busy"
            @click="amountConfirming ? (amountConfirming = false) : (mode = 'concept')">
            {{ amountConfirming ? 'Editar' : 'Volver' }}
          </button>
          <button class="btn btn-primary amount-save" type="button"
            :disabled="busy || Boolean(amountValidation) || !amountHasChanges || Boolean(amountError)"
            @click="amountConfirming ? submitAmount() : reviewAmount()">
            <LucideLoader2 v-if="busyAction === 'correct_amount'" :size="16" class="animate-spin" />
            <LucideCheckCircle v-else :size="16" />
            {{ busyAction === 'correct_amount' ? 'Guardando…' : amountConfirming ? 'Confirmar cambio' : 'Guardar importe' }}
          </button>
        </div>
        <div v-if="mode === 'start' && startPreview?.eligible && !loadingStart && !startError" class="modal-footer start-footer">
              <button class="btn btn-primary start-save" type="button" :disabled="busy || !startMes || !startReason.trim() || !removedMonths.length || blockedMonths.length > 0" @click="submitStart">
                <LucideLoader2 v-if="busyAction === 'change_start'" class="animate-spin" :size="15" /><LucideCheckCircle v-else :size="15" />
                {{ startMes ? `Guardar inicio en ${schoolMonthLabel(startMes)}` : 'Guardar mes de inicio' }}
              </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useState } from "#app";
import {
  LucideArrowRight,
  LucideBan,
  LucideCalendarX,
  LucideCalendarDays,
  LucideHistory,
  LucideLockKeyhole,
  LucideCheckCircle,
  LucideLoader2,
  LucidePlus,
  LucideX,
  LucideAlertCircle,
  LucideCircleDollarSign,
  LucideLayers3,
} from "lucide-vue-next";
import { useScrollLock } from "~/composables/useScrollLock";
import { useToast } from "~/composables/useToast";
import ConceptSearchSelect from "~/components/ConceptSearchSelect.vue";
import { schoolMonthLabel } from "~/shared/utils/documentMonths";
import { normalizeCicloKey } from "~/shared/utils/ciclo";
import { amountToCents, centsToAmount } from "~/shared/utils/documentAmountCorrection";

const props = defineProps({ debt: Object, student: Object });
const emit = defineEmits(["close", "success"]);

useModalEscape(() => {
  if (!busy.value) emit("close");
});
const state = useState("globalState");
const { show } = useToast();

useScrollLock();

const mode = ref("concept");
const amountPreview = ref(null);
const loadingAmount = ref(false);
const amountError = ref('');
const amountInput = ref('');
const amountConfirming = ref(false);
const money = (value) => new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(Number(value || 0));
const amountSelected = computed(() => amountPreview.value?.months?.find(
  row => String(row.mes) === String(props.debt?.mes === 'ev' ? 1 : props.debt?.mes),
) || amountPreview.value?.months?.[0] || null);
const amountSelectedEditable = computed(() => Boolean(amountSelected.value?.editable));
const amountCents = computed(() => amountToCents(amountInput.value));
const amountHasValidInput = computed(() => amountCents.value !== null && amountCents.value > 0);
const amountNumber = computed(() => amountHasValidInput.value ? centsToAmount(amountCents.value) : 0);
const amountFormatInvalid = computed(() => Boolean(amountInput.value.trim()) && !amountHasValidInput.value);
const amountBelowMinimum = computed(() => amountHasValidInput.value
  && amountCents.value < amountToCents(amountPreview.value?.minimumAllowed ?? 0));
const amountProjectedBalance = computed(() => {
  if (!amountSelectedEditable.value || !amountHasValidInput.value) return 0;
  const paid = amountToCents(amountSelected.value.paid) || 0;
  const difference = amountToCents(amountSelected.value.difference) || 0;
  return centsToAmount(Math.max(0, amountCents.value + difference - paid));
});
const amountHasChanges = computed(() => amountHasValidInput.value && amountSelectedEditable.value
  && (amountToCents(amountSelected.value?.currentAmount) !== amountCents.value));
const amountValidation = computed(() => !amountSelectedEditable.value || !amountHasValidInput.value
  || amountBelowMinimum.value || !amountHasChanges.value);
const useMinimumAmount = () => {
  amountInput.value = Number(amountPreview.value.minimumAllowed).toFixed(2);
  amountConfirming.value = false;
};
const loadAmountPreview = async () => {
  if (loadingAmount.value) return;
  loadingAmount.value = true;
  amountError.value = '';
  try {
    const result = await $fetch(`/api/documentos/${props.debt.documento}/monto`, {
      query: { ciclo: normalizeCicloKey(state.value.ciclo) },
    });
    amountPreview.value = result;
    amountInput.value = Number(result.montoAnterior ?? 0).toFixed(2);
    amountConfirming.value = false;
  } catch (error) {
    amountPreview.value = null;
    amountError.value = error?.data?.message || 'No se pudieron revisar el importe y los pagos.';
  } finally {
    loadingAmount.value = false;
  }
};
const openAmountAdjustment = () => {
  mode.value = 'amount';
  if (!amountPreview.value) void loadAmountPreview();
};
const reviewAmount = () => {
  if (amountValidation.value || busy.value) return;
  amountConfirming.value = true;
};
const submitAmount = async () => {
  if (busy.value || !amountConfirming.value || amountValidation.value) return;
  busyAction.value = 'correct_amount';
  amountError.value = '';
  try {
    const result = await $fetch(`/api/documentos/${props.debt.documento}/monto`, {
      method: 'PUT',
      body: {
        ciclo: normalizeCicloKey(state.value.ciclo),
        mes: props.debt.mes,
        montoFinal: amountNumber.value,
        expectedStoredAmount: amountPreview.value.originalStoredAmount,
        motivo: 'monto_incorrecto',
      },
    });
    show(result?.notification?.delivered === false
      ? `Importe guardado (auditoría #${result.auditId}). Aviso de Telegram pendiente.`
      : `Importe actualizado · Auditoría #${result.auditId}`,
      result?.notification?.delivered === false ? 'danger' : 'success',
      { duration: 6500 });
    emit('success');
  } catch (error) {
    amountConfirming.value = false;
    const requestId = error?.data?.data?.diagnostic?.requestId || error?.data?.requestId || '';
    amountError.value = (error?.data?.message || 'No se pudo confirmar el cambio.')
      + (requestId ? ` · Ref: ${requestId}` : '');
  } finally {
    busyAction.value = '';
  }
};
const startPreview = ref(null);
const loadingStart = ref(false);
const startError = ref("");
const startMes = ref("");
const startReason = ref("");
const canAdjustStart = computed(() => !props.debt?.isEventual && String(props.debt?.mes).toLowerCase() !== 'ev' && (props.debt?.documentTimeline?.applicableMonths || props.debt?.applicableMonths || []).length > 1);
const startOptions = computed(() => (startPreview.value?.months || []).filter(month => startPreview.value.startOptions.includes(month.mes)));
const removedMonths = computed(() => (startPreview.value?.months || []).filter(month => startMes.value && month.mes < Number(startMes.value)));
const blockedMonths = computed(() => removedMonths.value.filter(month => month.paymentCount > 0));
const keptRange = computed(() => {
  const kept = (startPreview.value?.months || []).filter(month => month.mes >= Number(startMes.value));
  const continuous = kept.every((month, index) => index === 0 || month.mes === kept[index - 1].mes + 1);
  return kept.length > 1 && continuous ? `${kept[0].label} a ${kept[kept.length - 1].label}` : kept.map(month => month.label).join(', ');
});
const isStartBlocked = (mes) => (startPreview.value?.months || []).some(month => month.mes < mes && month.paymentCount > 0);
const loadStartPreview = async () => {
  if (loadingStart.value) return;
  loadingStart.value = true;
  startError.value = "";
  startMes.value = "";
  try {
    startPreview.value = await $fetch("/api/documentos/period", { method: "POST", body: { action: "preview_start", documento: props.debt.documento, ciclo: normalizeCicloKey(state.value.ciclo) } });
  } catch (e) {
    startPreview.value = null;
    startError.value = e?.data?.message || "No se pudieron revisar los meses y pagos.";
  } finally { loadingStart.value = false; }
};
const openStartAdjustment = () => {
  mode.value = "start";
  if (!startPreview.value) loadStartPreview();
};
const submitStart = () => {
  if (!startMes.value || !startReason.value.trim() || blockedMonths.value.length || !removedMonths.value.length) return;
  runOperation("change_start", { startMes: Number(startMes.value), motivo: startReason.value.trim(), coverage: startPreview.value.coverage });
};

const conceptos = ref([]);
const selectedConceptId = ref("");
const loadingConcepts = ref(false);
const busyAction = ref("");
const diferenciaMontoInput = ref(0);
const busy = computed(() => Boolean(busyAction.value));
const diferenciaMonto = computed(() => {
  const value = Number(diferenciaMontoInput.value || 0);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
});
const selectedConcept = computed(
  () =>
    conceptos.value.find(
      (item) => String(item.id) === String(selectedConceptId.value),
    ) || null,
);
const lastApplicableMonth = computed(() =>
  Number(
    props.debt?.documentTimeline?.lastMonth ||
    props.debt?.applicableMonths?.[props.debt?.applicableMonths?.length - 1] ||
    props.debt?.mes ||
    1
  ),
);
const fromMes = computed(() => {
  const raw = String(props.debt?.mes || "")
    .trim()
    .toLowerCase();
  if (raw === "ev") return 1;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
});

const loadConcepts = async () => {
  loadingConcepts.value = true;
  try {
    conceptos.value = await $fetch("/api/conceptos", {
      params: { ciclo: normalizeCicloKey(state.value.ciclo) },
    });
  } catch (e) {
    show("No se pudieron cargar los conceptos", "danger");
  } finally {
    loadingConcepts.value = false;
  }
};

const runOperation = async (action, extraBody = {}) => {
  if (busy.value || !props.debt?.documento) return;

  busyAction.value = action;
  try {
    const result = await $fetch("/api/documentos/period", {
      method: "POST",
      body: {
        action,
        documento: props.debt.documento,
        fromMes: props.debt.mes,
        ciclo: normalizeCicloKey(state.value.ciclo),
        ...extraBody,
      },
    });
    if (result?.servicio?.ok === false) {
      show("Concepto actualizado, pero Control Escolar no confirmó el taller. Revísalo en Talleres.", "danger", { duration: 6500 });
    } else {
      const serviceText = result?.servicio?.mapped ? ` · ${result.servicio.servicio?.nombre || "Taller actualizado"}` : "";
      show(action === "change_start" ? `Inicio ajustado a ${schoolMonthLabel(extraBody.startMes)} · registrado en Cancelaciones` : action === "cancel_full" ? `Documento ${result.documento || props.debt.documento} cancelado completo` : `Concepto actualizado${serviceText}`, "success");
    }
    if (result?.snapshotRefresh?.pending) {
      show(`Documento ${result.documento || props.debt.documento} actualizado. Talleres pendiente de sincronizar.`, 'success', { title: 'Sincronización pendiente', duration: 6500 });
    }
    emit("success");
  } catch (e) {
    const requestId = e?.data?.data?.requestId || e?.data?.requestId || e?.data?.data?.diagnostic?.requestId;
    show(`${e?.data?.message || "No se pudo ajustar el concepto"}${requestId ? ` · Ref: ${requestId}` : ''}`, "danger");
    if (action === 'change_start') await loadStartPreview();
  } finally {
    busyAction.value = "";
  }
};

watch(selectedConceptId, () => {
  diferenciaMontoInput.value = 0;
});

const format = (value) => Number(value || 0).toFixed(2);
const rangeLabel = (start, end) =>
  start === end ? `Mes ${start}` : `Mes ${start}-${end}`;

const buildBeforeSegments = () => {
  const start = fromMes.value;
  const timeline = props.debt?.documentTimeline?.segments || [];
  if (start <= 1) return [];

  const segments = [];
  timeline.forEach((segment) => {
    const segmentStart = Number(segment.startMes || 1);
    const segmentEnd = Number(segment.endMes || segmentStart);
    if (segmentStart >= start) return;
    const end = Math.min(segmentEnd, start - 1);
    if (end < segmentStart) return;
    segments.push({
      conceptoNombre: segment.conceptoNombre,
      startMes: segmentStart,
      endMes: end,
      rangeLabel: rangeLabel(segmentStart, end),
      weight: Math.max(1, end - segmentStart + 1),
      tone: segment.accion === "cambio" ? "changed" : "base",
    });
  });

  return segments;
};

const previewSegments = computed(() => {
  const nextConcept = selectedConcept.value?.concepto || "Nuevo concepto";
  const start = fromMes.value;
  const end = lastApplicableMonth.value;
  return [
    ...buildBeforeSegments(),
    {
      conceptoNombre: nextConcept,
      startMes: start,
      endMes: end,
      rangeLabel: rangeLabel(start, end),
      weight: Math.max(1, end - start + 1),
      tone: "next",
    },
  ];
});

const submitChange = () => {
  if (!selectedConceptId.value) return;
  if (diferenciaMonto.value !== Number(diferenciaMontoInput.value || 0)) {
    diferenciaMontoInput.value = diferenciaMonto.value;
  }
  runOperation("change", {
    conceptoId: selectedConceptId.value,
    montoFinal: Math.round(
      Number(props.debt?.montoFinal || props.debt?.costoOriginal || 0),
    ),
    diferenciaMonto: diferenciaMonto.value,
  });
};

const cancelFromMonth = () => {
  if (!confirm(`Cancelar desde ${props.debt?.mesLabel || "este mes"}?`)) return;
  runOperation("cancel_from");
};

const cancelFull = () => {
  if (!confirm("Cancelar concepto completo?")) return;
  runOperation("cancel_full");
};

onMounted(loadConcepts);
</script>

<style scoped>
.amount-workspace{display:grid;gap:13px;color:#263752}
.amount-intro{display:flex;align-items:center;gap:11px;min-width:0}
.amount-intro-icon{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:12px;background:#eef7f0;color:#398449}
.amount-intro h3{margin:0 0 3px;font-size:.94rem;font-weight:780;color:#263752}
.amount-intro p{margin:0;font-size:.77rem;color:#718095}
.amount-compare{display:grid;grid-template-columns:minmax(0,1fr) 20px minmax(0,1.2fr);gap:12px;align-items:center;padding:13px;border:1px solid #dde8df;border-radius:15px;background:#fafcfb}
.amount-value-before,.amount-value-after{min-width:0;display:flex;flex-direction:column;gap:7px}
.amount-value-before{padding:9px}
.amount-value-before>span,.amount-value-after>span:first-child{font-size:.68rem;letter-spacing:.03em;color:#718095;font-weight:750}
.amount-value-before strong{font-size:1.26rem;font-weight:760;color:#526275}
.amount-compare-arrow{color:#879e91}
.amount-value-after{padding:10px 12px;background:#fff;border:1px solid #b9dcc0;border-radius:12px}
.amount-value-after:focus-within{outline:2px solid #65ac7c;outline-offset:2px}
.amount-input-line{display:flex;align-items:baseline;gap:4px;font-size:1.24rem;font-weight:800;color:#277441}
.amount-input-line input{min-width:0;width:100%;border:0;background:transparent;outline:0;font:inherit;color:inherit}
.amount-input-invalid{border-color:#d7a286;background:#fffaf7}
.amount-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.amount-stats>div{display:grid;gap:5px;padding:11px;border:1px solid #e4eaf0;border-radius:12px;background:#fff}
.amount-stats span{font-size:.7rem;line-height:1.35;color:#718095;font-weight:650}
.amount-stats strong{font-size:.95rem;font-weight:790;overflow-wrap:anywhere}
.amount-balanced{color:#268448}
.amount-feedback{display:flex;align-items:center;gap:9px;padding:11px 12px;border-radius:12px;background:#f5f7fa;color:#526780;font-size:.77rem;line-height:1.5}
.amount-feedback button{margin-left:auto;border:0;background:transparent;color:inherit;font-weight:750;text-decoration:underline;cursor:pointer}
.amount-error{background:#fff2ef;color:#963f35}
.amount-ok{background:#eef9f0;color:#286d3b}
.amount-minimum-guidance{display:flex;align-items:flex-start;gap:10px;padding:12px;border:1px solid #f2dac5;border-radius:12px;background:#fff7ef;color:#80502e}
.amount-minimum-guidance svg{flex:none;margin-top:1px}
.amount-minimum-guidance strong{font-size:.8rem}
.amount-minimum-guidance p{font-size:.75rem;margin:3px 0 7px}
.amount-minimum-guidance button{padding:7px 11px;border:1px solid #dbb28b;border-radius:9px;background:#fff;font-size:.75rem;font-weight:780;color:#80502e;cursor:pointer}
.amount-scope,.amount-audit{display:flex;align-items:center;gap:9px;margin:0;padding:11px;border-radius:11px;background:#f6f8fa;color:#607188;font-size:.74rem;line-height:1.5}
.amount-scope svg,.amount-audit svg{flex:none}
.amount-audit{background:#faf8f1;color:#786d50}
.amount-final-review{padding:13px;border:1px solid #b9dec3;border-radius:12px;background:#f4fbf5}
.amount-final-review strong{font-size:.79rem;color:#245d36}
.amount-final-review p{display:flex;align-items:center;gap:8px;margin:7px 0 0;font-size:.82rem;color:#365848}
.amount-footer{display:flex;justify-content:flex-end;gap:9px}
.amount-save{min-width:170px}
@media(max-width:640px){
  .amount-compare{grid-template-columns:minmax(0,1fr)}
  .amount-compare-arrow{transform:rotate(90deg);justify-self:center}
  .amount-stats{grid-template-columns:1fr}
  .amount-footer{flex-wrap:wrap}
  .amount-footer button{flex:1 1 100%}
  .amount-value-after input{font-size:16px}
}
.concept-modal {
  max-width: 660px;
}

.modal-title {
  margin: 0;
  color: #263752;
  font-size: 1rem;
  font-weight: 780;
}

.modal-subtitle {
  margin: 3px 0 0;
  color: #7b8798;
  font-size: 0.78rem;
  font-weight: 560;
}

.modal-icon-button {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 10px;
  background: #f4f7fa;
  color: #6f7b8f;
  transition:
    background 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}

.modal-icon-button:hover {
  background: #edf2f7;
  color: #263752;
  transform: translateY(-1px);
}

.concept-content {
  display: grid;
  gap: 14px;
}

.current-card,
.change-grid,
.preview-card,
.cancel-card {
  border: 1px solid #e1e8f0;
  border-radius: 16px;
  background: #ffffff;
  padding: 14px;
}

.current-card {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  background: linear-gradient(135deg, #f7fbff, #ffffff);
}

.current-token {
  min-width: 0;
  border-radius: 14px;
  background: #f5f7fa;
  padding: 10px 12px;
}

.current-token.active {
  background: #eef8eb;
}

.current-token small,
.field-block span {
  display: block;
  color: #7b8798;
  font-size: 0.68rem;
  font-weight: 760;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.current-token strong {
  display: block;
  overflow: hidden;
  margin-top: 3px;
  color: #263752;
  font-size: 0.86rem;
  font-weight: 820;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.current-arrow {
  color: #9aa6b6;
}

.change-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px;
  gap: 12px;
}

.field-block {
  display: grid;
  gap: 7px;
}

.preview-card {
  display: grid;
  gap: 10px;
  background: #fbfcfe;
}

.preview-track {
  display: flex;
  min-height: 82px;
  gap: 7px;
}

.preview-segment {
  display: flex;
  min-width: 96px;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid #dde7f2;
  border-radius: 14px;
  background: #f7f9fc;
  padding: 10px;
}

.preview-segment.next {
  border-color: #cae6c2;
  background: #f4fbf1;
}

.preview-segment.changed {
  border-color: #e8d6a2;
  background: #fff9e7;
}

.preview-segment strong {
  overflow: hidden;
  color: #263752;
  font-size: 0.78rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-segment span {
  color: #6f7b8f;
  font-size: 0.7rem;
  font-weight: 720;
}

.differential-pill {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  background: #fff4db;
  color: #8a6616;
  padding: 6px 10px;
  font-size: 0.72rem;
  font-weight: 820;
}

.differential-pill span {
  color: #9b7723;
  font-weight: 700;
}

.modal-action-row,
.cancel-card {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.cancel-card {
  justify-content: space-between;
  border-color: #f0d8d5;
  background: #fffafa;
}

@media (max-width: 640px) {
  .current-card,
  .change-grid {
    grid-template-columns: 1fr;
  }

  .current-arrow {
    display: none;
  }

  .cancel-card,
  .modal-action-row {
    flex-direction: column;
  }
}
.adjust-tabs { display: flex; gap: 4px; padding: 4px; border: 1px solid #e1e8e4; border-radius: 12px; background: #f4f7f5; }
.adjust-tabs button { flex: 1; padding: 10px; border: 0; border-radius: 9px; background: transparent; color: #65746d; font: inherit; font-size: .82rem; cursor: pointer; }
.adjust-tabs button.selected { background: #fff; color: #00692f; font-weight: 650; box-shadow: 0 1px 4px #17342c0d; }
.start-card { display: grid; gap: 16px; border: 1px solid #dfe8e3; border-radius: 16px; padding: 18px; background: #fff; }
.start-heading { display: flex; align-items: flex-start; gap: 10px; color: #00692f; }
.start-heading h3 { margin: 0; font-size: .92rem; font-weight: 650; color: #263752; }
.start-heading p, .start-review p { margin: 5px 0 0; font-size: .8rem; line-height: 1.6; color: #68786f; }
.start-select-row { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1.5fr); align-items: center; gap: 12px; }
.start-select-row select { width: 100%; min-width: 0; }
.start-current small, .start-review-label { display: block; font-size: .72rem; color: #68786f; }
.start-current strong { display: block; margin-top: 6px; font-size: .9rem; font-weight: 600; }
.start-arrow { color: #8b9a92; }
.start-review { padding: 12px; border: 1px solid #e0e8e3; border-radius: 12px; background: #f7faf8; }
.start-months { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.start-months span { display: inline-flex; align-items: center; gap: 5px; padding: 5px 9px; border: 1px solid #e6d9c7; border-radius: 8px; background: #fff9ef; color: #806333; font-size: .78rem; }
.start-months span.blocked { color: #a13f35; border-color: #efcbc7; background: #fff2f0; }
.start-review .start-warning, .start-feedback.error { color: #a13f35; }
.start-reason { width: 100%; resize: vertical; min-height: 80px; line-height: 1.5; }
.start-audit { display: flex; align-items: flex-start; gap: 6px; margin: 0; color: #68786f; font-size: .74rem; line-height: 1.6; }
.start-audit svg { flex-shrink: 0; margin-top: 2px; }
.start-feedback { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: .82rem; line-height: 1.6; }
.start-save { justify-self: end; }
.start-footer { background: #fff; }
.adjust-tabs button:focus-visible { outline: 2px solid #007f92; outline-offset: 2px; }
@media (max-width: 640px) {
  .start-card { padding: 14px; }
  .start-select-row { grid-template-columns: 1fr; gap: 12px; }
  .start-arrow { display: none; }
  .start-save { width: 100%; }
  .start-card input, .start-card select, .start-card textarea { font-size: 16px; }
}
.adjust-tabs button{display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
@media(max-width:640px){.adjust-tabs button{font-size:.73rem;padding:9px 5px}}
</style>
