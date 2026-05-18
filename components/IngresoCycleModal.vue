<template>
  <Teleport to="body">
    <div
      class="modal-overlay ingreso-cycle-overlay"
      @click.self="$emit('close')"
    >
      <section
        class="ingreso-cycle-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ingreso-cycle-title"
      >
        <button
          class="ingreso-close-button"
          type="button"
          aria-label="Cerrar"
          @click="$emit('close')"
        >
          <LucideX :size="25" />
        </button>

        <header class="ingreso-hero">
          <span class="ingreso-hero-veil" aria-hidden="true"></span>
          <span
            class="ingreso-hero-curve ingreso-hero-curve-blue"
            aria-hidden="true"
          ></span>
          <span
            class="ingreso-hero-curve ingreso-hero-curve-green"
            aria-hidden="true"
          ></span>

          <div class="ingreso-student-context">
            <span class="ingreso-avatar" aria-hidden="true">
              <img v-if="photoUrl" :src="photoUrl" alt="" />
              <span v-else>{{ initials }}</span>
            </span>
            <span class="ingreso-title-copy">
              <strong>{{ student?.nombreCompleto }}</strong>
              <small
                >{{ student?.matricula }} <i></i> {{ student?.nivel }} <i></i>
                {{ currentGradeLabel }}</small
              >
            </span>
          </div>
        </header>

        <div class="ingreso-body">
          <div class="ingreso-heading-row">
            <span class="ingreso-heading-icon" aria-hidden="true">
              <LucideCalendarDays :size="27" />
            </span>
            <div>
              <h2 id="ingreso-cycle-title">Definir ciclo de ingreso</h2>
              <p>
                Selecciona el primer ciclo escolar en el que el alumno
                perteneció al plantel.
              </p>
              <p>
                Con este dato el sistema determina cómo se mostrará en cada
                ciclo.
              </p>
            </div>
          </div>

          <div class="ingreso-main-grid">
            <section
              class="ingreso-panel ingreso-picker-panel"
              aria-labelledby="ingreso-picker-title"
            >
              <h3 id="ingreso-picker-title">1. Primer ciclo en el plantel</h3>

              <div
                class="ingreso-primary-cycles"
                role="radiogroup"
                aria-label="Ciclos principales"
              >
                <button
                  v-for="option in primaryCicloOptions"
                  :key="option.value"
                  type="button"
                  :class="[
                    'ingreso-cycle-tile',
                    {
                      selected: option.value === selectedIngresoCiclo,
                      current: option.value === targetCicloKey,
                    },
                  ]"
                  role="radio"
                  :aria-checked="option.value === selectedIngresoCiclo"
                  @click="selectCiclo(option.value)"
                >
                  <span
                    v-if="option.value === selectedIngresoCiclo"
                    class="ingreso-selected-check"
                    aria-hidden="true"
                  >
                    <LucideCheck :size="18" />
                  </span>
                  <strong>{{ option.label }}</strong>
                  <small>{{ cycleTileLabel(option.value) }}</small>
                  <span class="ingreso-cycle-tile-icon" aria-hidden="true">
                    <LucideCalendarDays :size="21" />
                  </span>
                </button>
              </div>

              <button
                class="ingreso-older-toggle"
                type="button"
                :aria-expanded="showOlderCycles"
                @click="showOlderCycles = !showOlderCycles"
              >
                <span class="ingreso-older-toggle-icon" aria-hidden="true"
                  ><LucideList :size="22"
                /></span>
                <span>{{
                  showOlderCycles
                    ? "Ocultar ciclos anteriores"
                    : "Ver ciclos anteriores"
                }}</span>
                <LucideChevronDown
                  :class="['ingreso-chevron', { open: showOlderCycles }]"
                  :size="20"
                />
              </button>

              <Transition name="older-cycles">
                <div
                  v-if="showOlderCycles"
                  class="ingreso-older-grid"
                  role="radiogroup"
                  aria-label="Ciclos anteriores"
                >
                  <button
                    v-for="option in olderCicloOptions"
                    :key="option.value"
                    type="button"
                    :class="[
                      'ingreso-older-option',
                      {
                        selected: option.value === selectedIngresoCiclo,
                        registered: option.value === currentIngresoCicloKey,
                      },
                    ]"
                    role="radio"
                    :aria-checked="option.value === selectedIngresoCiclo"
                    @click="selectCiclo(option.value)"
                  >
                    <span>{{ option.label }}</span>
                    <small>{{ cycleTileLabel(option.value) }}</small>
                  </button>
                </div>
              </Transition>

              <p class="ingreso-picker-note">
                <LucideInfo :size="18" />
                Puedes elegir un ciclo anterior si estás actualizando un alumno
                de años pasados.
              </p>
            </section>

            <section
              class="ingreso-panel ingreso-result-panel"
              aria-labelledby="ingreso-result-title"
            >
              <h3 id="ingreso-result-title">2. Resultado</h3>

              <Transition name="result-swap" mode="out-in">
                <div
                  :key="resultAnimationKey"
                  :class="['ingreso-result-banner', previewTargetTipo.value]"
                >
                  <span class="ingreso-result-orb" aria-hidden="true">
                    <LucideShieldCheck
                      v-if="previewTargetTipo.value === 'interno'"
                      :size="32"
                    />
                    <LucideGlobe2 v-else :size="32" />
                  </span>
                  <strong
                    >{{ previewTargetLabel }} en
                    {{ formatCicloLabel(targetCicloKey) }}</strong
                  >
                </div>
              </Transition>

              <Transition name="result-copy" mode="out-in">
                <p
                  :key="`${resultAnimationKey}-copy`"
                  class="ingreso-result-copy"
                  v-html="resultExplanation"
                ></p>
              </Transition>

              <div class="ingreso-interpretation-card">
                <h4>Cómo se interpretará</h4>
                <div
                  class="ingreso-timeline"
                  aria-label="Interpretación por ciclo"
                >
                  <div
                    v-for="(item, index) in timelineItems"
                    :key="`${item.ciclo}-${item.tipo.value}`"
                    :class="[
                      'ingreso-timeline-item',
                      item.tipo.value,
                      {
                        anchor: item.ciclo === selectedIngresoCiclo,
                        current: item.ciclo === targetCicloKey,
                      },
                    ]"
                    :style="{ '--step-index': index }"
                  >
                    <span
                      class="ingreso-timeline-dot"
                      aria-hidden="true"
                    ></span>
                    <span class="ingreso-timeline-cycle">{{ item.label }}</span>
                    <strong>{{ item.tipoLabel }}</strong>
                    <small>{{ item.contextLabel }}</small>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        <footer class="ingreso-cycle-footer">
          <span class="ingreso-footer-note">
            <span aria-hidden="true"><LucideShieldCheck :size="22" /></span>
            Este cambio solo actualiza el ciclo de ingreso y el estado derivado
            por ciclo.
          </span>
          <div class="ingreso-footer-actions">
            <button
              class="btn btn-ghost"
              type="button"
              :disabled="saving"
              @click="$emit('close')"
            >
              Cancelar
            </button>
            <button
              class="btn btn-primary"
              type="button"
              :disabled="
                saving || selectedIngresoCiclo === currentIngresoCicloKey
              "
              @click="confirmSelection"
            >
              <LucideLoader2 v-if="saving" class="animate-spin" :size="16" />
              Guardar ciclo de ingreso
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import {
  LucideCalendarDays,
  LucideCheck,
  LucideChevronDown,
  LucideGlobe2,
  LucideInfo,
  LucideList,
  LucideLoader2,
  LucideShieldCheck,
  LucideX,
} from "lucide-vue-next";
import { CICLOS_LIST } from "~/utils/constants";
import { formatCicloLabel } from "~/shared/utils/ciclo";
import { displayGrado } from "~/shared/utils/grado";
import {
  normalizeCicloForTipoIngreso,
  nextCicloKey,
  resolveTipoIngreso,
  formatTipoIngresoValue,
} from "~/shared/utils/tipoIngreso";

const props = defineProps({
  student: { type: Object, required: true },
  targetCiclo: { type: [String, Number], required: true },
  currentTipoIngreso: { type: Object, required: true },
  photoUrl: { type: String, default: "" },
  saving: { type: Boolean, default: false },
  enrollmentConcepts: { type: Array, default: () => [] },
});

const emit = defineEmits(["close", "confirm"]);

const fallbackCiclo =
  normalizeCicloForTipoIngreso(CICLOS_LIST[0]?.value) || "2025";
const targetCicloKey = computed(
  () => normalizeCicloForTipoIngreso(props.targetCiclo) || fallbackCiclo,
);
const currentIngresoCicloKey = computed(
  () =>
    normalizeCicloForTipoIngreso(
      props.student?.cicloBase ?? props.student?.ciclo,
    ) || targetCicloKey.value,
);
const selectedIngresoCiclo = ref(currentIngresoCicloKey.value);
const showOlderCycles = ref(false);

watch(currentIngresoCicloKey, (value) => {
  selectedIngresoCiclo.value = value;
});

watch(selectedIngresoCiclo, (value) => {
  if (olderCicloOptions.value.some((option) => option.value === value))
    showOlderCycles.value = true;
});

const initials = computed(
  () =>
    String(props.student?.nombreCompleto || "A")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "A",
);

const currentGradeLabel = computed(() =>
  displayGrado(props.student?.gradoBase || props.student?.grado),
);

const cicloOptions = computed(() => {
  const targetYear = Number(targetCicloKey.value);
  const registeredYear = Number(currentIngresoCicloKey.value);
  const range = [];

  for (let year = targetYear; year >= targetYear - 11; year -= 1) {
    range.push(String(year));
  }

  if (
    Number.isFinite(registeredYear) &&
    !range.includes(String(registeredYear))
  ) {
    range.splice(range.length - 1, 1, String(registeredYear));
  }

  return range
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((left, right) => Number(right) - Number(left))
    .map((value) => ({ value, label: formatCicloLabel(value) }));
});

const primaryCicloOptions = computed(() => cicloOptions.value.slice(0, 4));
const olderCicloOptions = computed(() => cicloOptions.value.slice(4));

const simulatedStudent = computed(() => ({
  ...props.student,
  ciclo: selectedIngresoCiclo.value,
  cicloBase: selectedIngresoCiclo.value,
}));

const previewTargetTipo = computed(() =>
  resolveTipoIngreso(simulatedStudent.value, targetCicloKey.value, {
    enrollmentConcepts: props.enrollmentConcepts,
  }),
);
const previewTargetLabel = computed(() =>
  formatTipoIngresoValue(previewTargetTipo.value),
);
const resultAnimationKey = computed(
  () =>
    `${selectedIngresoCiclo.value}-${targetCicloKey.value}-${previewTargetTipo.value.value}`,
);

const resultExplanation = computed(() => {
  const selected = Number(selectedIngresoCiclo.value);
  const target = Number(targetCicloKey.value);
  const targetLabel = formatCicloLabel(targetCicloKey.value);

  if (selected === target) {
    return `Como ingresó en el ciclo actual, este alumno se mostrará como <strong>externo</strong> en ${targetLabel}.`;
  }

  if (selected < target) {
    return `Como ingresó antes del ciclo actual, este alumno se mostrará como <strong>interno</strong> en ${targetLabel}.`;
  }

  return `El ciclo elegido queda después del ciclo seleccionado; revisa que corresponda al primer ciclo en el plantel.`;
});

const timelineItems = computed(() => {
  const anchor =
    normalizeCicloForTipoIngreso(selectedIngresoCiclo.value) ||
    currentIngresoCicloKey.value;
  const target = targetCicloKey.value;
  const anchorYear = Number(anchor);
  const targetYear = Number(target);
  const keys = [];

  const addKey = (value) => {
    const normalized = normalizeCicloForTipoIngreso(value);
    if (normalized && !keys.includes(normalized)) keys.push(normalized);
  };

  addKey(anchor);
  addKey(target);

  if (Number.isFinite(anchorYear) && Number.isFinite(targetYear)) {
    if (anchorYear === targetYear) {
      addKey(nextCicloKey(anchor));
      addKey(nextCicloKey(nextCicloKey(anchor)));
    } else {
      addKey(nextCicloKey(target));
      if (keys.length < 3) addKey(nextCicloKey(anchor));
    }
  }

  return keys
    .sort((left, right) => Number(left) - Number(right))
    .slice(0, 3)
    .map((ciclo) => {
      const tipo = resolveTipoIngreso(simulatedStudent.value, ciclo, {
        enrollmentConcepts: props.enrollmentConcepts,
      });
      const contextLabel =
        ciclo === anchor
          ? "Ciclo de ingreso"
          : ciclo === target
            ? "Ciclo actual"
            : "Ciclo posterior";

      return {
        ciclo,
        label: formatCicloLabel(ciclo),
        tipo,
        tipoLabel: formatTipoIngresoValue(tipo),
        contextLabel,
      };
    });
});

const cycleTileLabel = (value) => {
  if (value === selectedIngresoCiclo.value) return "Seleccionado";
  if (value === targetCicloKey.value) return "Ciclo actual";
  if (value === currentIngresoCicloKey.value) return "Registrado";
  return "Anterior";
};

const selectCiclo = (value) => {
  const normalized = normalizeCicloForTipoIngreso(value);
  if (normalized) selectedIngresoCiclo.value = normalized;
};

const confirmSelection = () => {
  const normalized = normalizeCicloForTipoIngreso(selectedIngresoCiclo.value);
  if (!normalized) return;
  emit("confirm", normalized);
};
</script>

<style scoped>
.ingreso-cycle-overlay {
  z-index: 90;
  align-items: center;
  justify-content: center;
  padding: 30px;
  background: rgba(18, 28, 44, 0.35);
  backdrop-filter: blur(12px) saturate(1.08);
}

.ingreso-cycle-modal {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(1120px, calc(100vw - 64px));
  max-height: min(91vh, calc(100dvh - 56px));
  overflow: hidden;
  border: 1px solid rgba(214, 225, 236, 0.98);
  border-radius: 33px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.99),
    #fff 52%,
    #fbfcfe 100%
  );
  box-shadow:
    0 34px 92px rgba(18, 29, 49, 0.27),
    inset 0 1px 0 rgba(255, 255, 255, 0.98);
  color: #14233c;
  animation: ingresoModalIn 0.34s cubic-bezier(0.16, 1, 0.3, 1);
}

.ingreso-close-button {
  position: absolute;
  top: 36px;
  right: 34px;
  z-index: 8;
  display: inline-flex;
  width: 56px;
  height: 56px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(213, 224, 237, 0.98);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
  color: #142139;
  box-shadow: 0 16px 34px rgba(21, 35, 60, 0.1);
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.ingreso-close-button:hover {
  border-color: rgba(184, 201, 222, 1);
  background: #fff;
  box-shadow: 0 18px 38px rgba(21, 35, 60, 0.13);
  transform: translateY(-1px);
}

.ingreso-hero {
  position: relative;
  min-height: 126px;
  padding: 32px 96px 22px 38px;
  overflow: hidden;
  border-bottom: 1px solid rgba(218, 227, 238, 0.88);
}

.ingreso-hero-veil {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 87% 0%, rgba(64, 165, 82, 0.18), transparent 24%),
    radial-gradient(
      circle at 70% -30%,
      rgba(92, 128, 178, 0.1),
      transparent 34%
    ),
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.36),
      rgba(255, 255, 255, 0.82)
    );
  pointer-events: none;
}

.ingreso-hero-curve {
  position: absolute;
  left: -8%;
  right: -8%;
  bottom: -35px;
  height: 94px;
  border-radius: 50%;
  pointer-events: none;
}

.ingreso-hero-curve-blue {
  border-top: 4px solid rgba(50, 119, 217, 0.62);
  transform: rotate(-2.8deg);
  box-shadow: 0 -16px 30px rgba(50, 119, 217, 0.12);
}

.ingreso-hero-curve-green {
  bottom: -24px;
  border-top: 3px solid rgba(75, 188, 100, 0.62);
  transform: rotate(3.1deg);
  box-shadow: 0 -16px 30px rgba(75, 188, 100, 0.11);
}

.ingreso-student-context {
  position: relative;
  z-index: 2;
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 18px;
}

.ingreso-avatar {
  display: inline-flex;
  width: 76px;
  height: 76px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid rgba(210, 225, 214, 0.98);
  border-radius: 999px;
  background: radial-gradient(circle at 34% 24%, #fff, #edf8ef 72%);
  color: #2f8a3d;
  font-size: 20px;
  font-weight: 930;
  box-shadow:
    0 16px 38px rgba(68, 131, 78, 0.14),
    inset 0 0 0 7px rgba(255, 255, 255, 0.55);
}

.ingreso-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ingreso-title-copy {
  display: grid;
  min-width: 0;
  gap: 8px;
}

.ingreso-title-copy strong {
  overflow: hidden;
  color: #13223b;
  font-size: 22px;
  font-weight: 940;
  letter-spacing: -0.045em;
  line-height: 1.02;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ingreso-title-copy small {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: #60708c;
  font-size: 14px;
  font-weight: 760;
}

.ingreso-title-copy small i {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: #aeb8c8;
}

.ingreso-body {
  display: grid;
  gap: 22px;
  min-height: 0;
  padding: 30px 40px 26px;
  overflow-y: auto;
}

.ingreso-heading-row {
  display: flex;
  align-items: flex-start;
  gap: 18px;
}

.ingreso-heading-icon {
  display: inline-flex;
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: linear-gradient(180deg, #eef5ff, #e7f0ff);
  color: #2f72d9;
  box-shadow: 0 12px 24px rgba(47, 114, 217, 0.12);
}

.ingreso-heading-row h2 {
  margin: 0;
  color: #13223b;
  font-size: clamp(24px, 2.2vw, 31px);
  font-weight: 950;
  letter-spacing: -0.055em;
  line-height: 1.02;
}

.ingreso-heading-row p {
  margin: 8px 0 0;
  color: #64738e;
  font-size: 15px;
  font-weight: 630;
  line-height: 1.28;
}

.ingreso-heading-row p + p {
  margin-top: 4px;
}

.ingreso-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(390px, 0.92fr);
  gap: 12px;
}

.ingreso-panel {
  min-width: 0;
  border: 1px solid rgba(218, 227, 238, 0.98);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow:
    0 16px 40px rgba(21, 35, 60, 0.055),
    inset 0 1px 0 rgba(255, 255, 255, 0.94);
}

.ingreso-panel h3 {
  margin: 0;
  color: #13223b;
  font-size: 18px;
  font-weight: 930;
  letter-spacing: -0.035em;
}

.ingreso-picker-panel,
.ingreso-result-panel {
  display: grid;
  align-content: start;
  gap: 22px;
  padding: 28px 24px 24px;
}

.ingreso-primary-cycles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.ingreso-cycle-tile {
  position: relative;
  display: grid;
  min-height: 128px;
  align-content: center;
  justify-items: center;
  gap: 8px;
  padding: 18px 12px 14px;
  border: 1px solid rgba(218, 227, 238, 0.98);
  border-radius: 15px;
  background: linear-gradient(180deg, #fff, #fbfcfd);
  color: #14233c;
  box-shadow: 0 12px 28px rgba(21, 35, 60, 0.045);
  transition:
    border-color 0.22s ease,
    box-shadow 0.22s ease,
    background 0.22s ease,
    transform 0.2s ease;
}

.ingreso-cycle-tile:hover {
  border-color: rgba(47, 114, 217, 0.32);
  box-shadow: 0 15px 34px rgba(47, 114, 217, 0.09);
  transform: translateY(-1px);
}

.ingreso-cycle-tile.current {
  border-color: rgba(51, 151, 62, 0.2);
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.98),
    rgba(249, 254, 250, 0.98)
  );
}

.ingreso-cycle-tile.selected {
  border-color: rgba(47, 114, 217, 0.78);
  background:
    radial-gradient(
      circle at 50% 105%,
      rgba(47, 114, 217, 0.1),
      transparent 42%
    ),
    linear-gradient(180deg, #fff, #f7faff);
  box-shadow:
    0 16px 36px rgba(47, 114, 217, 0.13),
    inset 0 0 0 1px rgba(47, 114, 217, 0.06);
}

.ingreso-cycle-tile.current.selected {
  border-color: rgba(51, 151, 62, 0.44);
  background:
    radial-gradient(
      circle at 50% 105%,
      rgba(51, 151, 62, 0.1),
      transparent 42%
    ),
    linear-gradient(180deg, #fff, #f8fff9);
}

.ingreso-cycle-tile strong {
  color: #13223b;
  font-size: 18px;
  font-weight: 900;
  letter-spacing: -0.025em;
}

.ingreso-cycle-tile small {
  color: #62718c;
  font-size: 13px;
  font-weight: 770;
}

.ingreso-cycle-tile.current small {
  color: #2f8f3d;
}

.ingreso-cycle-tile.selected small {
  color: #2f72d9;
}

.ingreso-cycle-tile-icon {
  display: inline-flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #edf4ff;
  color: #2f72d9;
}

.ingreso-cycle-tile.current .ingreso-cycle-tile-icon {
  background: #ebf8ed;
  color: #32963f;
}

.ingreso-selected-check {
  position: absolute;
  top: -11px;
  right: -11px;
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #3779df;
  color: #fff;
  box-shadow: 0 10px 20px rgba(55, 121, 223, 0.24);
  animation: selectedCheckIn 0.28s cubic-bezier(0.2, 1.25, 0.35, 1);
}

.ingreso-older-toggle {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 18px;
  min-height: 58px;
  padding: 0 20px;
  border: 1px solid rgba(218, 227, 238, 0.98);
  border-radius: 15px;
  background: #fff;
  color: #62718c;
  font-size: 14px;
  font-weight: 770;
  text-align: left;
  box-shadow: 0 10px 24px rgba(21, 35, 60, 0.035);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    color 0.2s ease;
}

.ingreso-older-toggle:hover {
  border-color: rgba(47, 114, 217, 0.26);
  color: #2f4a75;
  box-shadow: 0 13px 28px rgba(21, 35, 60, 0.055);
}

.ingreso-older-toggle-icon {
  display: inline-flex;
  color: #6d7c96;
}

.ingreso-chevron {
  transition: transform 0.22s ease;
}

.ingreso-chevron.open {
  transform: rotate(180deg);
}

.ingreso-older-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: -8px;
}

.ingreso-older-option {
  display: grid;
  gap: 4px;
  min-height: 58px;
  padding: 10px 12px;
  border: 1px solid rgba(224, 232, 241, 0.96);
  border-radius: 13px;
  background: #fff;
  color: #14233c;
  text-align: left;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.ingreso-older-option:hover,
.ingreso-older-option.selected {
  border-color: rgba(47, 114, 217, 0.42);
  background: #f7faff;
  box-shadow: 0 10px 22px rgba(47, 114, 217, 0.07);
}

.ingreso-older-option span {
  font-size: 13px;
  font-weight: 880;
}

.ingreso-older-option small {
  color: #77849a;
  font-size: 11px;
  font-weight: 720;
}

.ingreso-picker-note {
  display: inline-flex;
  align-items: flex-start;
  gap: 9px;
  margin: 0;
  color: #64738e;
  font-size: 13px;
  font-weight: 630;
  line-height: 1.35;
}

.ingreso-picker-note svg {
  flex: 0 0 auto;
  color: #2f72d9;
}

.ingreso-result-banner {
  position: relative;
  display: flex;
  min-height: 74px;
  align-items: center;
  gap: 16px;
  overflow: hidden;
  padding: 16px 20px;
  border: 1px solid rgba(60, 153, 70, 0.3);
  border-radius: 13px;
  background:
    linear-gradient(
      90deg,
      rgba(246, 255, 248, 0.96),
      rgba(255, 255, 255, 0.96)
    ),
    radial-gradient(circle at 0% 50%, rgba(51, 151, 62, 0.14), transparent 40%);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.68);
  animation:
    resultBannerIn 0.42s cubic-bezier(0.16, 1, 0.3, 1),
    resultBreath 2.6s ease-in-out 0.42s 2;
}

.ingreso-result-banner::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    110deg,
    transparent 0%,
    rgba(255, 255, 255, 0) 34%,
    rgba(255, 255, 255, 0.72) 50%,
    rgba(255, 255, 255, 0) 66%,
    transparent 100%
  );
  transform: translateX(-110%);
  animation: resultSheen 1.45s cubic-bezier(0.4, 0, 0.2, 1) 0.18s 1;
  pointer-events: none;
}

.ingreso-result-banner.externo {
  border-color: rgba(47, 114, 217, 0.3);
  background:
    linear-gradient(
      90deg,
      rgba(247, 251, 255, 0.96),
      rgba(255, 255, 255, 0.96)
    ),
    radial-gradient(circle at 0% 50%, rgba(47, 114, 217, 0.13), transparent 40%);
}

.ingreso-result-orb {
  position: relative;
  display: inline-flex;
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: linear-gradient(180deg, #39a447, #2f8f3d);
  color: #fff;
  box-shadow: 0 14px 30px rgba(51, 151, 62, 0.24);
}

.ingreso-result-orb::before {
  content: "";
  position: absolute;
  inset: -6px;
  border-radius: inherit;
  border: 1px solid rgba(51, 151, 62, 0.22);
  animation: resultRing 1.7s ease-out 0.18s 2;
}

.ingreso-result-banner.externo .ingreso-result-orb {
  background: linear-gradient(180deg, #3f82e4, #2f6fd2);
  box-shadow: 0 14px 30px rgba(47, 114, 217, 0.22);
}

.ingreso-result-banner.externo .ingreso-result-orb::before {
  border-color: rgba(47, 114, 217, 0.22);
}

.ingreso-result-banner strong {
  color: #2e8a39;
  font-size: 24px;
  font-weight: 950;
  letter-spacing: -0.045em;
  line-height: 1.06;
}

.ingreso-result-banner.externo strong {
  color: #2f6fd2;
}

.ingreso-result-copy {
  margin: 0;
  color: #64738e;
  font-size: 15px;
  font-weight: 630;
  line-height: 1.55;
}

.ingreso-result-copy :deep(strong) {
  color: #2f8f3d;
  font-weight: 900;
}

.ingreso-interpretation-card {
  overflow: hidden;
  border: 1px solid rgba(218, 227, 238, 0.98);
  border-radius: 12px;
  background: #fff;
}

.ingreso-interpretation-card h4 {
  margin: 0;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(226, 233, 242, 0.96);
  color: #2f405f;
  font-size: 13px;
  font-weight: 900;
}

.ingreso-timeline {
  position: relative;
  display: grid;
  gap: 0;
  padding: 10px 16px 14px;
}

.ingreso-timeline::before {
  content: "";
  position: absolute;
  top: 26px;
  bottom: 26px;
  left: 27px;
  width: 2px;
  border-radius: 99px;
  background: linear-gradient(
    180deg,
    rgba(47, 114, 217, 0.2),
    rgba(51, 151, 62, 0.4),
    rgba(51, 151, 62, 0.18)
  );
  transform-origin: top;
  animation: timelineDraw 0.52s cubic-bezier(0.16, 1, 0.3, 1) 0.12s both;
}

.ingreso-timeline-item {
  position: relative;
  display: grid;
  grid-template-columns: 28px minmax(108px, 0.72fr) minmax(86px, 0.5fr) minmax(
      104px,
      0.78fr
    );
  align-items: center;
  gap: 10px;
  min-height: 38px;
  opacity: 0;
  animation: timelineItemIn 0.38s cubic-bezier(0.16, 1, 0.3, 1)
    calc(0.12s + (var(--step-index) * 0.07s)) both;
}

.ingreso-timeline-dot {
  position: relative;
  z-index: 1;
  display: inline-flex;
  width: 15px;
  height: 15px;
  margin-left: 3px;
  border: 2px solid rgba(47, 114, 217, 0.24);
  border-radius: 999px;
  background: #fff;
}

.ingreso-timeline-item.current .ingreso-timeline-dot,
.ingreso-timeline-item.interno .ingreso-timeline-dot {
  border-color: rgba(51, 151, 62, 0.45);
  background: #40a94e;
  box-shadow: 0 0 0 4px rgba(51, 151, 62, 0.12);
}

.ingreso-timeline-cycle {
  display: inline-flex;
  min-height: 27px;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border: 1px solid rgba(226, 233, 242, 0.96);
  border-radius: 999px;
  background: #fbfcfe;
  color: #24334f;
  font-size: 13px;
  font-weight: 840;
}

.ingreso-timeline-item strong {
  display: inline-flex;
  min-height: 27px;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border-radius: 999px;
  background: #eaf3ff;
  color: #2f6fd2;
  font-size: 12px;
  font-weight: 900;
}

.ingreso-timeline-item.interno strong {
  background: #eaf8ed;
  color: #2f8a3d;
}

.ingreso-timeline-item small {
  color: #63728e;
  font-size: 12px;
  font-weight: 700;
}

.ingreso-cycle-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 22px 40px 24px;
  border-top: 1px solid rgba(220, 229, 240, 0.92);
  background: rgba(252, 253, 255, 0.94);
}

.ingreso-footer-note {
  display: inline-flex;
  align-items: center;
  gap: 13px;
  color: #63728e;
  font-size: 13px;
  font-weight: 650;
}

.ingreso-footer-note span {
  display: inline-flex;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #eaf8ed;
  color: #2f8f3d;
}

.ingreso-footer-actions {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.ingreso-footer-actions .btn {
  min-height: 42px;
  border-radius: 12px;
  padding-inline: 28px;
}

.ingreso-footer-actions .btn-primary {
  min-width: 202px;
  box-shadow: 0 14px 28px rgba(51, 151, 62, 0.18);
}

.result-swap-enter-active,
.result-swap-leave-active,
.result-copy-enter-active,
.result-copy-leave-active,
.older-cycles-enter-active,
.older-cycles-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease,
    max-height 0.24s ease;
}

.result-swap-enter-from,
.result-swap-leave-to,
.result-copy-enter-from,
.result-copy-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.older-cycles-enter-from,
.older-cycles-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-4px);
}

.older-cycles-enter-to,
.older-cycles-leave-from {
  max-height: 190px;
  opacity: 1;
}

@keyframes ingresoModalIn {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes selectedCheckIn {
  from {
    opacity: 0;
    transform: scale(0.72);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes resultBannerIn {
  from {
    opacity: 0;
    transform: translateY(7px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes resultBreath {
  0%,
  100% {
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.68);
  }
  50% {
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.68),
      0 0 0 4px rgba(51, 151, 62, 0.07);
  }
}

@keyframes resultSheen {
  to {
    transform: translateX(110%);
  }
}

@keyframes resultRing {
  0% {
    opacity: 0.8;
    transform: scale(0.82);
  }
  100% {
    opacity: 0;
    transform: scale(1.2);
  }
}

@keyframes timelineDraw {
  from {
    transform: scaleY(0);
    opacity: 0;
  }
  to {
    transform: scaleY(1);
    opacity: 1;
  }
}

@keyframes timelineItemIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1040px) {
  .ingreso-main-grid {
    grid-template-columns: 1fr;
  }

  .ingreso-result-panel {
    min-width: 0;
  }
}

@media (max-width: 760px) {
  .ingreso-cycle-overlay {
    padding: 12px;
  }

  .ingreso-cycle-modal {
    width: calc(100vw - 24px);
    border-radius: 26px;
  }

  .ingreso-hero {
    min-height: 112px;
    padding: 26px 78px 20px 22px;
  }

  .ingreso-close-button {
    top: 25px;
    right: 22px;
    width: 46px;
    height: 46px;
  }

  .ingreso-avatar {
    width: 62px;
    height: 62px;
  }

  .ingreso-title-copy strong {
    font-size: 18px;
  }

  .ingreso-title-copy small {
    flex-wrap: wrap;
    font-size: 12px;
  }

  .ingreso-body {
    padding: 24px 18px 20px;
  }

  .ingreso-heading-row {
    gap: 12px;
  }

  .ingreso-primary-cycles,
  .ingreso-older-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ingreso-cycle-footer {
    align-items: stretch;
    flex-direction: column;
    padding: 18px;
  }

  .ingreso-footer-actions {
    width: 100%;
  }

  .ingreso-footer-actions .btn {
    flex: 1;
    min-width: 0;
    padding-inline: 14px;
  }

  .ingreso-timeline-item {
    grid-template-columns: 24px 1fr auto;
  }

  .ingreso-timeline-item small {
    grid-column: 2 / -1;
    padding-left: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ingreso-cycle-modal,
  .ingreso-selected-check,
  .ingreso-result-banner,
  .ingreso-result-banner::after,
  .ingreso-result-orb::before,
  .ingreso-timeline::before,
  .ingreso-timeline-item {
    animation: none !important;
  }

  .ingreso-close-button,
  .ingreso-cycle-tile,
  .ingreso-older-toggle,
  .ingreso-older-option,
  .ingreso-chevron {
    transition: none !important;
  }

  .ingreso-timeline-item {
    opacity: 1;
  }
}
</style>
