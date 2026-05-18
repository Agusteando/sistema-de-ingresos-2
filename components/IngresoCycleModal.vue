<template>
  <Teleport to="body">
    <div class="modal-overlay ingreso-cycle-overlay" @click.self="$emit('close')">
      <section class="ingreso-cycle-modal" role="dialog" aria-modal="true" aria-labelledby="ingreso-cycle-title">
        <button class="ingreso-close-button" type="button" aria-label="Cerrar" @click="$emit('close')">
          <LucideX :size="21" />
        </button>

        <header class="ingreso-hero">
          <span class="ingreso-hero-wave ingreso-hero-wave-blue" aria-hidden="true"></span>
          <span class="ingreso-hero-wave ingreso-hero-wave-green" aria-hidden="true"></span>

          <div class="ingreso-student-context">
            <span class="ingreso-avatar" aria-hidden="true">
              <img v-if="photoUrl" :src="photoUrl" alt="" />
              <span v-else>{{ initials }}</span>
            </span>
            <span class="ingreso-title-copy">
              <strong>{{ student?.nombreCompleto }}</strong>
              <small>{{ student?.matricula }} <i></i> {{ student?.nivel }} <i></i> {{ currentGradeLabel }}</small>
            </span>
          </div>
        </header>

        <div class="ingreso-cycle-content">
          <div class="ingreso-prompt">
            <h2 id="ingreso-cycle-title">¿Cuándo ingresó este alumno?</h2>
            <p>Selecciona el ciclo en el que inició en el plantel.</p>
          </div>

          <section class="ingreso-status-preview" aria-label="Resultado actual">
            <article :class="['ingreso-result-card', 'externo', { active: selectedIngresoCiclo === targetCicloKey }]">
              <span class="ingreso-result-orb"><LucideGlobe2 :size="26" /></span>
              <strong>Externo</strong>
              <small>Durante {{ formatCicloLabel(selectedIngresoCiclo) }}</small>
            </article>

            <article :class="['ingreso-result-card', previewTargetTipo.value, { active: selectedIngresoCiclo !== targetCicloKey }]">
              <span class="ingreso-result-orb">
                <LucideBuilding2 v-if="previewTargetTipo.value === 'interno'" :size="26" />
                <LucideGlobe2 v-else :size="26" />
              </span>
              <strong>{{ formatTipoIngresoValue(previewTargetTipo) }}</strong>
              <small>En el ciclo actual: {{ formatCicloLabel(targetCicloKey) }}</small>
            </article>
          </section>

          <section class="ingreso-picker-panel" aria-label="Ciclo de ingreso">
            <div class="ingreso-picker-heading">
              <span>Elige ciclo de ingreso</span>
              <strong>{{ formatCicloLabel(selectedIngresoCiclo) }}</strong>
            </div>

            <div class="ingreso-cycle-grid" role="radiogroup" aria-label="Ciclos disponibles">
              <button
                v-for="option in cicloOptions"
                :key="option.value"
                type="button"
                :class="[
                  'ingreso-cycle-option',
                  {
                    selected: option.value === selectedIngresoCiclo,
                    current: option.value === targetCicloKey,
                    registered: option.value === currentIngresoCicloKey,
                    nearby: option.isNearby
                  }
                ]"
                role="radio"
                :aria-checked="option.value === selectedIngresoCiclo"
                @click="selectedIngresoCiclo = option.value"
              >
                <span>{{ option.label }}</span>
                <small>
                  <template v-if="option.value === selectedIngresoCiclo">Ingreso seleccionado</template>
                  <template v-else-if="option.value === currentIngresoCicloKey">Ingreso registrado</template>
                  <template v-else-if="option.value === targetCicloKey">Ciclo actual</template>
                  <template v-else-if="option.isNearby">Ciclo reciente</template>
                  <template v-else>Disponible</template>
                </small>
              </button>
            </div>
          </section>

          <section class="ingreso-outcome-strip" aria-label="Vista por ciclo">
            <div
              v-for="item in timelineItems"
              :key="item.ciclo"
              :class="['ingreso-outcome-item', item.tipo.value, { selected: item.ciclo === targetCicloKey, anchor: item.ciclo === selectedIngresoCiclo }]"
            >
              <span>{{ item.label }}</span>
              <strong>{{ item.tipoLabel }}</strong>
              <small>{{ item.gradeLabel }}</small>
            </div>
          </section>

          <aside class="ingreso-help-panel">
            <span class="ingreso-help-icon" aria-hidden="true"><LucideSparkles :size="23" /></span>
            <span>
              <strong>¿No estás seguro?</strong>
              <small>Puedes corregir esta fecha más adelante desde este mismo perfil.</small>
            </span>
            <em>El ciclo elegido queda como ingreso.</em>
          </aside>
        </div>

        <footer class="ingreso-cycle-footer">
          <span><LucideLockKeyhole :size="14" /> Esta elección se puede modificar cuando sea necesario.</span>
          <div>
            <button class="btn btn-ghost" type="button" :disabled="saving" @click="$emit('close')">Cancelar</button>
            <button class="btn btn-primary" type="button" :disabled="saving || selectedIngresoCiclo === currentIngresoCicloKey" @click="confirmSelection">
              <LucideLoader2 v-if="saving" class="animate-spin" :size="15" />
              Guardar ciclo
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { LucideBuilding2, LucideGlobe2, LucideLoader2, LucideLockKeyhole, LucideSparkles, LucideX } from 'lucide-vue-next'
import { CICLOS_LIST } from '~/utils/constants'
import { formatCicloLabel } from '~/shared/utils/ciclo'
import { calculatePromotedGrado, displayGrado } from '~/shared/utils/grado'
import { normalizeCicloForTipoIngreso, nextCicloKey, resolveTipoIngreso, formatTipoIngresoValue } from '~/shared/utils/tipoIngreso'

const props = defineProps({
  student: { type: Object, required: true },
  targetCiclo: { type: [String, Number], required: true },
  currentTipoIngreso: { type: Object, required: true },
  photoUrl: { type: String, default: '' },
  saving: { type: Boolean, default: false },
  enrollmentConcepts: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'confirm'])

const fallbackCiclo = normalizeCicloForTipoIngreso(CICLOS_LIST[0]?.value) || '2025'
const targetCicloKey = computed(() => normalizeCicloForTipoIngreso(props.targetCiclo) || fallbackCiclo)
const currentIngresoCicloKey = computed(() => normalizeCicloForTipoIngreso(props.student?.cicloBase ?? props.student?.ciclo) || targetCicloKey.value)
const selectedIngresoCiclo = ref(currentIngresoCicloKey.value)

watch(currentIngresoCicloKey, (value) => {
  selectedIngresoCiclo.value = value
})

const initials = computed(() => String(props.student?.nombreCompleto || 'A')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part.charAt(0).toUpperCase())
  .join('') || 'A')

const currentGradeLabel = computed(() => displayGrado(props.student?.gradoBase || props.student?.grado))

const cicloOptions = computed(() => {
  const targetYear = Number(targetCicloKey.value)
  const ingresoYear = Number(currentIngresoCicloKey.value)
  const maxVisible = 12
  let start = targetYear - (maxVisible - 1)
  let end = targetYear

  if (Number.isFinite(ingresoYear) && ingresoYear < start) {
    start = ingresoYear
    end = start + (maxVisible - 1)
  }

  if (Number.isFinite(ingresoYear) && ingresoYear > end) {
    end = ingresoYear
    start = end - (maxVisible - 1)
  }

  const years = []
  for (let year = end; year >= start; year -= 1) {
    years.push(String(year))
  }

  return years.map((value) => {
    const distance = Math.abs(Number(value) - targetYear)
    return {
      value,
      label: formatCicloLabel(value),
      isNearby: distance <= 2
    }
  })
})

const simulatedStudent = computed(() => ({
  ...props.student,
  ciclo: selectedIngresoCiclo.value,
  cicloBase: selectedIngresoCiclo.value,
  internoBase: 0
}))

const previewTargetTipo = computed(() => resolveTipoIngreso(simulatedStudent.value, targetCicloKey.value, { enrollmentConcepts: props.enrollmentConcepts }))

const timelineItems = computed(() => {
  const anchor = normalizeCicloForTipoIngreso(selectedIngresoCiclo.value) || currentIngresoCicloKey.value
  const target = targetCicloKey.value
  const anchorNumber = Number(anchor)
  const targetNumber = Number(target)
  const keys = new Set([anchor, target])

  if (Number.isFinite(anchorNumber) && Number.isFinite(targetNumber)) {
    const direction = targetNumber >= anchorNumber ? 1 : -1
    let year = anchorNumber
    while (keys.size < 4 && year !== targetNumber) {
      keys.add(String(year))
      year += direction
    }
    keys.add(target)

    if (keys.size < 4) {
      keys.add(nextCicloKey(anchor))
      keys.add(nextCicloKey(nextCicloKey(anchor)))
    }
  } else {
    keys.add(nextCicloKey(anchor))
    keys.add(nextCicloKey(nextCicloKey(anchor)))
  }

  return Array.from(keys)
    .sort((left, right) => Number(left) - Number(right))
    .slice(0, 4)
    .map((ciclo) => {
      const tipo = resolveTipoIngreso(simulatedStudent.value, ciclo, { enrollmentConcepts: props.enrollmentConcepts })
      const projected = calculatePromotedGrado(props.student?.gradoBase || props.student?.grado, props.student?.plantel, anchor, ciclo)

      return {
        ciclo,
        label: ciclo === anchor ? `Ingreso · ${formatCicloLabel(ciclo)}` : formatCicloLabel(ciclo),
        tipo,
        tipoLabel: formatTipoIngresoValue(tipo),
        gradeLabel: projected.egresado ? 'Egresado' : displayGrado(projected.grado)
      }
    })
})

const confirmSelection = () => {
  const normalized = normalizeCicloForTipoIngreso(selectedIngresoCiclo.value)
  if (!normalized) return
  emit('confirm', normalized)
}
</script>

<style scoped>
.ingreso-cycle-overlay {
  z-index: 90;
  align-items: center;
  background: rgba(22, 31, 48, .34);
  backdrop-filter: blur(10px) saturate(1.05);
}

.ingreso-cycle-modal {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(680px, calc(100vw - 32px));
  max-height: min(92vh, calc(100dvh - 32px));
  overflow: hidden;
  border: 1px solid rgba(216, 226, 236, .95);
  border-radius: 34px;
  background:
    radial-gradient(circle at 12% 6%, rgba(85, 171, 96, .11), transparent 28%),
    linear-gradient(180deg, rgba(255, 255, 255, .98), #fff 50%, #fbfcfe 100%);
  box-shadow: 0 28px 80px rgba(21, 31, 52, .22), 0 3px 0 rgba(255,255,255,.86) inset;
  color: #14233c;
  animation: ingresoModalIn .22s cubic-bezier(.16, 1, .3, 1);
}

.ingreso-close-button {
  position: absolute;
  top: 28px;
  right: 28px;
  z-index: 5;
  display: inline-flex;
  width: 46px;
  height: 46px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(215, 225, 238, .95);
  border-radius: 999px;
  background: rgba(255,255,255,.78);
  color: #17243c;
  box-shadow: 0 14px 30px rgba(21, 35, 60, .08);
  transition: background .18s ease, border-color .18s ease, transform .18s ease;
}

.ingreso-close-button:hover {
  border-color: rgba(186, 202, 222, 1);
  background: #fff;
  transform: translateY(-1px);
}

.ingreso-hero {
  position: relative;
  min-height: 132px;
  padding: 34px 88px 18px 36px;
  overflow: hidden;
}

.ingreso-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 88% -8%, rgba(60, 170, 84, .22), transparent 22%),
    radial-gradient(circle at 10% 88%, rgba(57, 127, 232, .12), transparent 24%);
  pointer-events: none;
}

.ingreso-hero-wave {
  position: absolute;
  left: -5%;
  right: -5%;
  height: 78px;
  border-radius: 50%;
  pointer-events: none;
  opacity: .88;
}

.ingreso-hero-wave-blue {
  bottom: -33px;
  border-top: 4px solid rgba(57, 127, 232, .66);
  transform: rotate(-3deg);
  box-shadow: 0 -12px 28px rgba(57, 127, 232, .12);
}

.ingreso-hero-wave-green {
  bottom: -21px;
  border-top: 3px solid rgba(81, 189, 104, .66);
  transform: rotate(3deg);
  box-shadow: 0 -12px 28px rgba(81, 189, 104, .10);
}

.ingreso-student-context {
  position: relative;
  z-index: 2;
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 18px;
}

.ingreso-title-copy {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.ingreso-title-copy strong {
  overflow: hidden;
  color: #13223b;
  font-size: 19px;
  font-weight: 900;
  letter-spacing: -.035em;
  line-height: 1.05;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ingreso-title-copy small {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #60708c;
  font-size: 13px;
  font-weight: 720;
}

.ingreso-title-copy small i {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: #b7c1d0;
}

.ingreso-avatar {
  display: inline-flex;
  width: 72px;
  height: 72px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid rgba(204, 221, 206, .96);
  border-radius: 999px;
  background: radial-gradient(circle at 34% 24%, #fff, #edf8ef 72%);
  color: #2f8a3d;
  font-size: 20px;
  font-weight: 930;
  box-shadow: 0 16px 38px rgba(68, 131, 78, .14), inset 0 0 0 8px rgba(255,255,255,.52);
}

.ingreso-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ingreso-cycle-content {
  display: grid;
  gap: 20px;
  min-height: 0;
  padding: 18px 28px 22px;
  overflow-y: auto;
}

.ingreso-prompt {
  display: grid;
  justify-items: center;
  gap: 7px;
  text-align: center;
}

.ingreso-prompt h2 {
  margin: 0;
  color: #13223b;
  font-size: clamp(22px, 2.2vw, 28px);
  font-weight: 930;
  letter-spacing: -.045em;
  line-height: 1.04;
}

.ingreso-prompt p {
  margin: 0;
  color: #687793;
  font-size: 14px;
  font-weight: 610;
}

.ingreso-status-preview {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
  padding-top: 10px;
}

.ingreso-result-card {
  position: relative;
  display: grid;
  justify-items: center;
  min-height: 170px;
  padding: 54px 22px 24px;
  border: 1px solid rgba(211, 222, 235, .96);
  border-radius: 20px;
  background: linear-gradient(180deg, #fff, #fbfdff);
  text-align: center;
  box-shadow: 0 14px 34px rgba(21, 35, 60, .05);
}

.ingreso-result-card.active {
  border-color: rgba(65, 112, 205, .42);
  box-shadow: 0 16px 38px rgba(65, 112, 205, .10), inset 0 0 0 1px rgba(65, 112, 205, .06);
}

.ingreso-result-card.interno.active {
  border-color: rgba(47, 127, 50, .42);
  box-shadow: 0 16px 38px rgba(47, 127, 50, .10), inset 0 0 0 1px rgba(47, 127, 50, .06);
}

.ingreso-result-orb {
  position: absolute;
  top: -28px;
  display: inline-flex;
  width: 76px;
  height: 76px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(210, 223, 239, .96);
  border-radius: 999px;
  background: radial-gradient(circle at 34% 24%, #fff, #edf5ff 74%);
  color: #2f62c3;
  box-shadow: 0 18px 32px rgba(45, 99, 192, .16), inset 0 0 0 10px rgba(255,255,255,.55);
}

.ingreso-result-card.interno .ingreso-result-orb {
  border-color: rgba(205, 225, 207, .98);
  background: radial-gradient(circle at 34% 24%, #fff, #ecf8ef 74%);
  color: #2f8a3d;
  box-shadow: 0 18px 32px rgba(48, 139, 61, .15), inset 0 0 0 10px rgba(255,255,255,.55);
}

.ingreso-result-card strong {
  color: #2f62c3;
  font-size: 20px;
  font-weight: 930;
  letter-spacing: -.035em;
}

.ingreso-result-card.interno strong {
  color: #2f7f32;
}

.ingreso-result-card small {
  max-width: 210px;
  color: #63728e;
  font-size: 13px;
  font-weight: 620;
  line-height: 1.35;
}

.ingreso-picker-panel {
  display: grid;
  gap: 12px;
  padding: 15px;
  border: 1px solid rgba(223, 230, 239, .98);
  border-radius: 20px;
  background: rgba(255,255,255,.76);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.92);
}

.ingreso-picker-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.ingreso-picker-heading span {
  color: #60708c;
  font-size: 12px;
  font-weight: 850;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.ingreso-picker-heading strong {
  color: #17243c;
  font-size: 14px;
  font-weight: 890;
}

.ingreso-cycle-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
}

.ingreso-cycle-option {
  display: grid;
  gap: 4px;
  min-height: 64px;
  padding: 10px 10px 9px;
  border: 1px solid #e3eaf3;
  border-radius: 15px;
  background: linear-gradient(180deg, #fff, #fbfcfd);
  color: #17243c;
  text-align: left;
  box-shadow: 0 9px 20px rgba(21, 35, 60, .035);
  transition: border-color .18s ease, box-shadow .18s ease, background .18s ease, transform .18s ease;
}

.ingreso-cycle-option:hover {
  border-color: rgba(65, 112, 205, .32);
  transform: translateY(-1px);
}

.ingreso-cycle-option span {
  font-size: 13px;
  font-weight: 890;
  letter-spacing: -.015em;
}

.ingreso-cycle-option small {
  color: #7b879d;
  font-size: 10.5px;
  font-weight: 720;
  line-height: 1.2;
}

.ingreso-cycle-option.nearby {
  background: linear-gradient(180deg, #fff, #f8fbff);
}

.ingreso-cycle-option.current {
  border-color: rgba(47, 127, 50, .2);
}

.ingreso-cycle-option.registered {
  border-color: rgba(65, 112, 205, .22);
}

.ingreso-cycle-option.selected {
  border-color: rgba(65, 112, 205, .68);
  background:
    radial-gradient(circle at 88% 8%, rgba(65, 112, 205, .14), transparent 34%),
    linear-gradient(180deg, #fbfdff, #f2f7ff);
  box-shadow: 0 14px 30px rgba(65, 112, 205, .13), inset 0 0 0 1px rgba(65, 112, 205, .08);
}

.ingreso-cycle-option.selected small {
  color: #2f62c3;
}

.ingreso-outcome-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.ingreso-outcome-item {
  display: grid;
  gap: 3px;
  min-height: 73px;
  padding: 11px;
  border: 1px solid #e6edf4;
  border-radius: 16px;
  background: #fff;
}

.ingreso-outcome-item.anchor {
  border-color: rgba(65, 112, 205, .24);
  background: #f7faff;
}

.ingreso-outcome-item.selected {
  box-shadow: inset 0 0 0 1px rgba(63, 145, 56, .18);
}

.ingreso-outcome-item span {
  color: #6f7b95;
  font-size: 10.5px;
  font-weight: 810;
}

.ingreso-outcome-item strong {
  color: #2f62c3;
  font-size: 14px;
  font-weight: 900;
}

.ingreso-outcome-item.interno strong {
  color: #2f7f32;
}

.ingreso-outcome-item small {
  color: #74809a;
  font-size: 11px;
  font-weight: 700;
}

.ingreso-help-panel {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 14px 15px;
  border: 1px solid rgba(223, 230, 239, .98);
  border-radius: 18px;
  background: rgba(255,255,255,.82);
  box-shadow: 0 13px 30px rgba(21, 35, 60, .045);
}

.ingreso-help-icon {
  display: inline-flex;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: #f1edff;
  color: #6556d9;
  box-shadow: 0 10px 20px rgba(101, 86, 217, .12);
}

.ingreso-help-panel span:not(.ingreso-help-icon) {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.ingreso-help-panel strong {
  color: #17243c;
  font-size: 13px;
  font-weight: 900;
}

.ingreso-help-panel small {
  color: #65738f;
  font-size: 12px;
  font-weight: 620;
}

.ingreso-help-panel em {
  margin-left: auto;
  color: #52617d;
  font-size: 11.5px;
  font-style: normal;
  font-weight: 820;
  white-space: nowrap;
}

.ingreso-cycle-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 14px 28px 20px;
  border-top: 1px solid rgba(224, 231, 240, .9);
  background: rgba(251, 252, 254, .9);
}

.ingreso-cycle-footer > span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #74809a;
  font-size: 12px;
  font-weight: 670;
}

.ingreso-cycle-footer > div {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.ingreso-cycle-footer .btn-primary {
  min-width: 132px;
}

@keyframes ingresoModalIn {
  from { opacity: 0; transform: translateY(12px) scale(.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@media (max-width: 740px) {
  .ingreso-cycle-modal {
    border-radius: 26px;
  }

  .ingreso-hero {
    padding: 28px 74px 18px 24px;
  }

  .ingreso-cycle-content {
    padding-inline: 18px;
  }

  .ingreso-status-preview,
  .ingreso-outcome-strip {
    grid-template-columns: 1fr;
  }

  .ingreso-cycle-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ingreso-cycle-footer,
  .ingreso-help-panel {
    align-items: stretch;
    flex-direction: column;
  }

  .ingreso-help-panel em {
    margin-left: 0;
  }

  .ingreso-cycle-footer > div {
    justify-content: flex-end;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ingreso-cycle-modal,
  .ingreso-close-button,
  .ingreso-cycle-option {
    animation: none;
    transition-duration: .01ms;
  }

  .ingreso-cycle-option:hover,
  .ingreso-close-button:hover {
    transform: none;
  }
}
</style>
