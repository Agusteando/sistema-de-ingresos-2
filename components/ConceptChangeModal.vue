<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-container concept-modal">
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
            @click="$emit('close')"
          >
            <LucideX :size="18" />
          </button>
        </div>

        <div class="modal-content concept-content">
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
              <LucidePlus :size="13" /> ${{ format(diferenciaMonto) }} ·
              Diferencia
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
  LucideCheckCircle,
  LucideLoader2,
  LucidePlus,
  LucideX,
} from "lucide-vue-next";
import { useScrollLock } from "~/composables/useScrollLock";
import { useToast } from "~/composables/useToast";
import ConceptSearchSelect from "~/components/ConceptSearchSelect.vue";
import { normalizeCicloKey } from "~/shared/utils/ciclo";

const props = defineProps({ debt: Object });
const emit = defineEmits(["close", "success"]);

useModalEscape(() => {
  if (!busy.value) emit("close");
});
const state = useState("globalState");
const { show } = useToast();

useScrollLock();

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
const totalMonths = computed(() =>
  Number(props.debt?.documentTimeline?.totalMonths || 1),
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
  if (!props.debt?.documento) return;

  busyAction.value = action;
  try {
    await $fetch("/api/documentos/period", {
      method: "POST",
      body: {
        action,
        documento: props.debt.documento,
        fromMes: props.debt.mes,
        ciclo: normalizeCicloKey(state.value.ciclo),
        ...extraBody,
      },
    });
    show("Concepto actualizado", "success");
    emit("success");
  } catch (e) {
    show(e?.data?.message || "No se pudo ajustar el concepto", "danger");
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
  const end = totalMonths.value;
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
</style>
