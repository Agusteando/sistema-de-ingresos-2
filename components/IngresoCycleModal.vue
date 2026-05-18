<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-container ingreso-cycle-modal">
      <div class="modal-header ingreso-cycle-header">
        <div class="ingreso-student-context">
          <span class="ingreso-avatar" aria-hidden="true">
            <img v-if="photoUrl" :src="photoUrl" alt="" />
            <span v-else>{{ initials }}</span>
          </span>
          <span>
            <h2 class="modal-title">¿Cuándo ingresó este alumno?</h2>
            <p class="modal-subtitle">{{ student?.nombreCompleto }}</p>
          </span>
        </div>
        <button class="modal-icon-button" type="button" aria-label="Cerrar" @click="$emit('close')">
          <LucideX :size="18" />
        </button>
      </div>

      <div class="modal-content ingreso-cycle-content">
        <section class="ingreso-current-state">
          <div>
            <span>Ciclo seleccionado</span>
            <strong>{{ formatCicloLabel(targetCicloKey) }}</strong>
          </div>
          <div>
            <span>Estado resuelto ahora</span>
            <strong :class="['ingreso-status-pill', currentTipoIngreso.value]">{{ currentTipoIngresoLabel }}</strong>
          </div>
          <div>
            <span>Ingreso registrado</span>
            <strong>{{ formatCicloLabel(currentIngresoCicloKey) }}</strong>
          </div>
        </section>

        <label class="ingreso-cycle-field">
          <span>Ciclo de ingreso</span>
          <select v-model="selectedIngresoCiclo" class="input-field">
            <option v-for="option in cicloOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>

        <p class="ingreso-explanation">
          El ciclo de ingreso es el ciclo donde este alumno se considera <strong>Externo</strong>. En ciclos posteriores se resolverá como <strong>Interno</strong> para el ciclo seleccionado, usando el mismo criterio en detalles, KPIs, filtros, tablas y exportaciones.
        </p>

        <section class="ingreso-simulation" aria-label="Simulación de ciclos">
          <header>
            <LucideGitBranch :size="15" />
            <span>Simulación</span>
          </header>
          <div class="ingreso-timeline">
            <div
              v-for="item in timelineItems"
              :key="item.ciclo"
              :class="['ingreso-timeline-item', item.tipo.value, { selected: item.ciclo === targetCicloKey, anchor: item.ciclo === selectedIngresoCiclo }]"
            >
              <span class="timeline-cycle">{{ item.label }}</span>
              <strong>{{ item.tipoLabel }}</strong>
              <small>{{ item.gradeLabel }}</small>
            </div>
          </div>
        </section>
      </div>

      <div class="modal-footer ingreso-cycle-footer">
        <button class="btn btn-ghost" type="button" :disabled="saving" @click="$emit('close')">Cancelar</button>
        <button class="btn btn-primary" type="button" :disabled="saving || selectedIngresoCiclo === currentIngresoCicloKey" @click="confirmSelection">
          <LucideLoader2 v-if="saving" class="animate-spin" :size="15" />
          Guardar ciclo de ingreso
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { LucideGitBranch, LucideLoader2, LucideX } from 'lucide-vue-next'
import { CICLOS_LIST } from '~/utils/constants'
import { formatCicloLabel } from '~/shared/utils/ciclo'
import { calculatePromotedGrado, displayGrado } from '~/shared/utils/grado'
import { normalizeCicloForTipoIngreso, nextCicloKey, previousCicloKey, resolveTipoIngreso, formatTipoIngresoValue } from '~/shared/utils/tipoIngreso'

const props = defineProps({
  student: { type: Object, required: true },
  targetCiclo: { type: [String, Number], required: true },
  currentTipoIngreso: { type: Object, required: true },
  photoUrl: { type: String, default: '' },
  saving: { type: Boolean, default: false },
  enrollmentConcepts: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'confirm'])

const targetCicloKey = computed(() => normalizeCicloForTipoIngreso(props.targetCiclo) || normalizeCicloForTipoIngreso(CICLOS_LIST[0]?.value) || '2025')
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

const currentTipoIngresoLabel = computed(() => formatTipoIngresoValue(props.currentTipoIngreso))

const cicloOptions = computed(() => {
  const keys = new Set(CICLOS_LIST.map(option => String(option.value)))
  const important = [
    targetCicloKey.value,
    currentIngresoCicloKey.value,
    previousCicloKey(targetCicloKey.value),
    previousCicloKey(currentIngresoCicloKey.value),
    nextCicloKey(targetCicloKey.value),
    nextCicloKey(currentIngresoCicloKey.value)
  ]

  important.forEach((key) => {
    const normalized = normalizeCicloForTipoIngreso(key)
    if (normalized) keys.add(normalized)
  })

  return Array.from(keys)
    .sort((left, right) => Number(left) - Number(right))
    .map(value => ({ value, label: formatCicloLabel(value) }))
})

const timelineItems = computed(() => {
  const anchor = normalizeCicloForTipoIngreso(selectedIngresoCiclo.value) || currentIngresoCicloKey.value
  const years = new Set([anchor, nextCicloKey(anchor), nextCicloKey(nextCicloKey(anchor)), targetCicloKey.value])

  return Array.from(years)
    .sort((left, right) => Number(left) - Number(right))
    .map((ciclo) => {
      const simulatedStudent = {
        ...props.student,
        ciclo,
        cicloBase: anchor,
        internoBase: 0
      }
      const tipo = resolveTipoIngreso(simulatedStudent, ciclo, { enrollmentConcepts: props.enrollmentConcepts })
      const projected = calculatePromotedGrado(props.student?.gradoBase || props.student?.grado, props.student?.plantel, anchor, ciclo)

      return {
        ciclo,
        label: ciclo === anchor ? `Ingreso: ${formatCicloLabel(ciclo)}` : formatCicloLabel(ciclo),
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
.ingreso-cycle-modal {
  width: min(620px, calc(100vw - 28px));
}

.ingreso-cycle-header {
  align-items: center;
}

.ingreso-student-context {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.ingreso-avatar {
  display: inline-flex;
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid #dfe7f0;
  border-radius: 14px;
  background: #f6faf7;
  color: #2f7f32;
  font-size: 14px;
  font-weight: 900;
}

.ingreso-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ingreso-cycle-content {
  display: grid;
  gap: 16px;
}

.ingreso-current-state {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.ingreso-current-state div {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 12px;
  border: 1px solid #e3eaf2;
  border-radius: 14px;
  background: #fbfcfd;
}

.ingreso-current-state span,
.ingreso-cycle-field > span {
  color: #74809a;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: .055em;
  text-transform: uppercase;
}

.ingreso-current-state strong {
  color: #17243c;
  font-size: 13px;
  font-weight: 860;
}

.ingreso-status-pill {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.ingreso-status-pill.interno {
  border: 1px solid rgba(22, 159, 150, .22);
  background: rgba(22, 159, 150, .09);
  color: #16877f;
}

.ingreso-status-pill.externo {
  border: 1px solid rgba(65, 112, 205, .2);
  background: rgba(65, 112, 205, .08);
  color: #2f62b8;
}

.ingreso-cycle-field {
  display: grid;
  gap: 7px;
}

.ingreso-explanation {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid #e7edf4;
  border-radius: 14px;
  background: #fff;
  color: #5f6b83;
  font-size: 12.5px;
  font-weight: 590;
  line-height: 1.45;
}

.ingreso-explanation strong {
  color: #17243c;
  font-weight: 850;
}

.ingreso-simulation {
  display: grid;
  gap: 10px;
}

.ingreso-simulation header {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #2f7f32;
  font-size: 12px;
  font-weight: 850;
}

.ingreso-timeline {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
  gap: 9px;
}

.ingreso-timeline-item {
  display: grid;
  gap: 4px;
  min-height: 86px;
  padding: 12px;
  border: 1px solid #e3eaf2;
  border-radius: 14px;
  background: #fbfcfd;
}

.ingreso-timeline-item.anchor {
  border-color: rgba(65, 112, 205, .28);
  background: #f7faff;
}

.ingreso-timeline-item.selected {
  box-shadow: inset 0 0 0 1px rgba(63, 145, 56, .22);
}

.timeline-cycle {
  color: #6f7b95;
  font-size: 10.5px;
  font-weight: 820;
}

.ingreso-timeline-item strong {
  color: #17243c;
  font-size: 15px;
  font-weight: 900;
}

.ingreso-timeline-item.interno strong {
  color: #16877f;
}

.ingreso-timeline-item.externo strong {
  color: #2f62b8;
}

.ingreso-timeline-item small {
  color: #74809a;
  font-size: 11px;
  font-weight: 720;
}

.ingreso-cycle-footer {
  gap: 10px;
}

@media (max-width: 640px) {
  .ingreso-current-state {
    grid-template-columns: 1fr;
  }
}
</style>
