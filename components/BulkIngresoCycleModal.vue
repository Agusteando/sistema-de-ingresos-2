<template>
  <Teleport to="body">
    <div class="bulk-ingreso-overlay" @click.self="!saving && $emit('close')">
      <section class="bulk-ingreso-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-ingreso-title">
        <button class="bulk-ingreso-close" type="button" aria-label="Cerrar" :disabled="saving" @click="$emit('close')">
          <LucideX :size="22" />
        </button>

        <header class="bulk-ingreso-hero">
          <div class="bulk-ingreso-hero__icon"><LucideCalendarClock :size="30" /></div>
          <div>
            <span>Acción masiva</span>
            <h2 id="bulk-ingreso-title">Actualizar ciclo de ingreso</h2>
            <p>Define el ciclo y la posición académica base para la selección sin perder alumnos al buscar de nuevo.</p>
          </div>
        </header>

        <div v-if="result" class="bulk-ingreso-result">
          <span class="bulk-ingreso-result__icon"><LucideShieldCheck :size="36" /></span>
          <div>
            <p>Actualización completada</p>
            <h3>{{ result.updated || 0 }} alumnos actualizados</h3>
            <small>
              {{ result.skipped || 0 }} sin cambios
              <template v-if="result.failed"> · {{ result.failed }} con error</template>
            </small>
          </div>

          <div v-if="resultRows.length" class="bulk-ingreso-result__rows">
            <article v-for="row in resultRows" :key="`result-${row.matricula}`">
              <strong>{{ row.nombreCompleto || row.matricula }}</strong>
              <span>{{ resultStatusLabel(row) }}</span>
            </article>
          </div>

          <footer class="bulk-ingreso-footer result-footer">
            <button class="btn btn-primary" type="button" @click="$emit('close')">Cerrar y volver a alumnos</button>
          </footer>
        </div>

        <template v-else>
          <div class="bulk-ingreso-body">
            <aside class="bulk-ingreso-selected">
              <div class="bulk-ingreso-section-heading">
                <div>
                  <span>Selección acumulada</span>
                  <h3>{{ selectedStudents.length }} alumnos</h3>
                </div>
                <LucideUsers :size="24" />
              </div>

              <label class="bulk-ingreso-search">
                <LucideSearch :size="17" />
                <input v-model="selectedSearch" type="search" placeholder="Buscar dentro de la selección" />
              </label>

              <div class="bulk-ingreso-selected-list">
                <article v-for="student in filteredSelectedStudents" :key="`bulk-ingreso-selected-${student.matricula}`">
                  <span class="bulk-ingreso-avatar">{{ initials(student) }}</span>
                  <div>
                    <strong>{{ student.nombreCompleto }}</strong>
                    <small>{{ student.matricula }} · {{ currentPositionCopy(student) }}</small>
                  </div>
                  <button type="button" :disabled="saving" @click="$emit('remove-student', student.matricula)">
                    <LucideMinus :size="16" />
                  </button>
                </article>
              </div>
            </aside>

            <main class="bulk-ingreso-config">
              <section class="bulk-ingreso-card">
                <div class="bulk-ingreso-section-heading compact">
                  <div>
                    <span>1. Ciclo de ingreso</span>
                    <h3>{{ formatCicloLabel(selectedIngresoCiclo) }}</h3>
                  </div>
                </div>

                <div class="bulk-ingreso-cycle-grid">
                  <button
                    v-for="option in cicloOptions"
                    :key="option.value"
                    type="button"
                    :class="['bulk-ingreso-cycle', { active: option.value === selectedIngresoCiclo, current: option.value === targetCicloKey }]"
                    :disabled="saving"
                    @click="selectedIngresoCiclo = option.value"
                  >
                    <strong>{{ option.label }}</strong>
                    <span>{{ option.value === targetCicloKey ? 'Ciclo actual' : 'Ciclo anterior' }}</span>
                  </button>
                </div>
              </section>

              <section class="bulk-ingreso-card">
                <div class="bulk-ingreso-section-heading compact">
                  <div>
                    <span>2. Posición académica en {{ formatCicloLabel(targetCicloKey) }}</span>
                    <h3>{{ targetPositionLabel }}</h3>
                  </div>
                </div>

                <div class="bulk-ingreso-stepper" role="group" aria-label="Ajustar nivel y grado">
                  <button type="button" :disabled="saving || !canMovePrevious" @click="shiftPosition(-1)">
                    <span aria-hidden="true">‹</span>
                    Anterior
                  </button>
                  <div>
                    <small>Nivel y grado ligados</small>
                    <strong>{{ targetPositionLabel }}</strong>
                  </div>
                  <button type="button" :disabled="saving || !canMoveNext" @click="shiftPosition(1)">
                    Siguiente
                    <span aria-hidden="true">›</span>
                  </button>
                </div>

                <div class="bulk-ingreso-fields">
                  <label>
                    <span>Nivel</span>
                    <select v-model="selectedNivel" :disabled="saving">
                      <option v-for="nivel in positionNivelOptions" :key="nivel" :value="nivel">{{ nivel }}</option>
                    </select>
                  </label>
                  <label>
                    <span>Grado</span>
                    <select v-model="selectedGrado" :disabled="saving">
                      <option v-for="grado in availablePositionGrades" :key="grado" :value="grado">{{ grado }}</option>
                    </select>
                  </label>
                </div>
              </section>

              <section class="bulk-ingreso-card preview-card">
                <div class="bulk-ingreso-section-heading compact">
                  <div>
                    <span>3. Vista previa</span>
                    <h3>{{ readyRows.length }} listos · {{ unchangedRows.length }} sin cambios</h3>
                  </div>
                  <span v-if="invalidRows.length" class="bulk-ingreso-warning">{{ invalidRows.length }} revisar</span>
                </div>

                <div class="bulk-ingreso-preview-table">
                  <div class="bulk-ingreso-preview-row head">
                    <span>Alumno</span>
                    <span>Actual</span>
                    <span>Nuevo</span>
                    <span>Estado</span>
                  </div>
                  <div v-for="row in previewRows" :key="`preview-${row.matricula}`" class="bulk-ingreso-preview-row">
                    <strong>{{ row.nombreCompleto }}</strong>
                    <span>{{ row.beforeLabel }}</span>
                    <span>{{ row.afterLabel }}</span>
                    <em :class="row.status">{{ row.statusLabel }}</em>
                  </div>
                </div>
              </section>
            </main>
          </div>

          <footer class="bulk-ingreso-footer">
            <p>
              <LucideInfo :size="17" />
              Se actualizará el ciclo de ingreso y la posición base. Matrícula y grupo no se modifican.
            </p>
            <div>
              <button class="btn btn-ghost" type="button" :disabled="saving" @click="$emit('close')">Cancelar</button>
              <button class="btn btn-primary" type="button" :disabled="!canConfirm" @click="confirmBulkUpdate">
                <LucideLoader2 v-if="saving" class="animate-spin" :size="16" />
                Actualizar {{ selectedStudents.length }} alumnos
              </button>
            </div>
          </footer>
        </template>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  LucideCalendarClock,
  LucideInfo,
  LucideLoader2,
  LucideMinus,
  LucideSearch,
  LucideShieldCheck,
  LucideUsers,
  LucideX
} from 'lucide-vue-next'
import { CICLOS_LIST } from '~/utils/constants'
import { formatCicloLabel } from '~/shared/utils/ciclo'
import { normalizeCicloForTipoIngreso } from '~/shared/utils/tipoIngreso'
import {
  NIVEL_SEQUENCE,
  academicPositionIndex,
  academicPositionSequence,
  displayGrado,
  gradeOptionsForNivel,
  normalizeGradoForPlantel,
  normalizeNivelEscolar,
  projectPlantelForNivel,
  resolveNivelEscolar
} from '~/shared/utils/grado'
import { normalizeStudentMatricula } from '~/shared/utils/studentPresentation'

const props = defineProps({
  selectedStudents: { type: Array, default: () => [] },
  targetCiclo: { type: [String, Number], required: true },
  saving: { type: Boolean, default: false },
  result: { type: Object, default: null }
})

const emit = defineEmits(['close', 'confirm', 'remove-student'])

const fallbackCiclo = normalizeCicloForTipoIngreso(CICLOS_LIST[0]?.value) || '2025'
const targetCicloKey = computed(() => normalizeCicloForTipoIngreso(props.targetCiclo) || fallbackCiclo)
const selectedIngresoCiclo = ref(targetCicloKey.value)
const selectedSearch = ref('')

watch(targetCicloKey, (value) => {
  selectedIngresoCiclo.value = value
})

const positionOptions = computed(() => academicPositionSequence())
const positionNivelOptions = NIVEL_SEQUENCE

const currentPositionForStudent = (student) => {
  const plantel = student?.plantelBase ?? student?.plantel
  const nivel = normalizeNivelEscolar(student?.nivelBase ?? student?.nivel) || resolveNivelEscolar(plantel, student?.nivelBase ?? student?.nivel)
  const grado = normalizeGradoForPlantel(student?.gradoBase ?? student?.grado, plantel, nivel)

  return {
    plantel: projectPlantelForNivel(plantel, nivel),
    nivel,
    grado
  }
}

const initialPositionIndex = computed(() => {
  const counts = new Map()
  props.selectedStudents.forEach((student) => {
    const currentPosition = currentPositionForStudent(student)
    const index = academicPositionIndex(currentPosition.nivel, currentPosition.grado)
    if (index < 0) return
    counts.set(index, (counts.get(index) || 0) + 1)
  })

  const winner = Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]
  return winner?.[0] ?? academicPositionIndex('Primaria', 'primero')
})

const selectedPositionIndex = ref(initialPositionIndex.value)
watch(initialPositionIndex, (value) => {
  if (Number.isFinite(value)) selectedPositionIndex.value = value
}, { immediate: true })

const selectedPosition = computed(() => positionOptions.value[selectedPositionIndex.value] || positionOptions.value[0])
const targetPositionLabel = computed(() => `${selectedPosition.value.nivel} · ${displayGrado(selectedPosition.value.grado)}`)
const availablePositionGrades = computed(() => gradeOptionsForNivel(selectedPosition.value.nivel))
const canMovePrevious = computed(() => selectedPositionIndex.value > 0)
const canMoveNext = computed(() => selectedPositionIndex.value < positionOptions.value.length - 1)

const selectedNivel = computed({
  get: () => selectedPosition.value.nivel,
  set: (nivel) => {
    const sameGradeIndex = academicPositionIndex(nivel, selectedPosition.value.grado)
    if (sameGradeIndex >= 0) {
      selectedPositionIndex.value = sameGradeIndex
      return
    }

    const firstForNivel = positionOptions.value.find(position => position.nivel === nivel)
    if (firstForNivel) selectedPositionIndex.value = firstForNivel.index
  }
})

const selectedGrado = computed({
  get: () => displayGrado(selectedPosition.value.grado),
  set: (grado) => {
    const index = academicPositionIndex(selectedPosition.value.nivel, grado)
    if (index >= 0) selectedPositionIndex.value = index
  }
})

const shiftPosition = (direction) => {
  const nextIndex = selectedPositionIndex.value + Number(direction || 0)
  if (nextIndex >= 0 && nextIndex < positionOptions.value.length) selectedPositionIndex.value = nextIndex
}

const cicloOptions = computed(() => {
  const target = Number(targetCicloKey.value)
  const values = []
  for (let year = target; year >= target - 9; year -= 1) values.push(String(year))

  CICLOS_LIST.forEach((option) => {
    const normalized = normalizeCicloForTipoIngreso(option.value)
    if (normalized && !values.includes(normalized)) values.push(normalized)
  })

  return values
    .filter((value, index, list) => list.indexOf(value) === index)
    .sort((left, right) => Number(right) - Number(left))
    .map(value => ({ value, label: formatCicloLabel(value) }))
})

const filteredSelectedStudents = computed(() => {
  const term = selectedSearch.value.trim().toLowerCase()
  if (!term) return props.selectedStudents
  return props.selectedStudents.filter((student) => {
    const haystack = `${student?.nombreCompleto || ''} ${student?.matricula || ''}`.toLowerCase()
    return haystack.includes(term)
  })
})

const initials = (student) => String(student?.nombreCompleto || 'A')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part.charAt(0).toUpperCase())
  .join('') || 'A'

const currentPositionCopy = (student) => {
  const currentPosition = currentPositionForStudent(student)
  return `${currentPosition.nivel} · ${displayGrado(currentPosition.grado)}`
}

const normalizeBaseGrado = (value) => displayGrado(value).toLowerCase()
const normalizeCiclo = (value) => normalizeCicloForTipoIngreso(value) || ''

const previewRows = computed(() => props.selectedStudents.map((student) => {
  const currentPosition = currentPositionForStudent(student)
  const targetPlantel = currentPosition?.plantel || student?.plantelBase || student?.plantel
  const placementPlantel = projectPlantelForNivel(targetPlantel, selectedPosition.value.nivel)
  const placementGrado = normalizeGradoForPlantel(
    selectedPosition.value.grado,
    placementPlantel,
    selectedPosition.value.nivel
  )
  const placementInvalid = academicPositionIndex(selectedPosition.value.nivel, placementGrado) < 0
  const beforeCiclo = normalizeCiclo(student?.cicloBase ?? student?.ciclo)
  const beforeNivel = student?.nivelBase || student?.nivel || ''
  const beforeGrado = student?.gradoBase || student?.grado || ''
  const unchanged = !placementInvalid &&
    beforeCiclo === selectedIngresoCiclo.value &&
    String(beforeNivel || '').toLowerCase() === String(selectedPosition.value.nivel || '').toLowerCase() &&
    normalizeBaseGrado(beforeGrado) === normalizeBaseGrado(placementGrado)

  const status = placementInvalid ? 'invalid' : unchanged ? 'unchanged' : 'ready'

  return {
    matricula: normalizeStudentMatricula(student?.matricula),
    nombreCompleto: student?.nombreCompleto || student?.matricula,
    beforeLabel: `${formatCicloLabel(beforeCiclo || targetCicloKey.value)} · ${beforeNivel || currentPosition.nivel} · ${displayGrado(beforeGrado || currentPosition.grado)}`,
    afterLabel: placementInvalid
      ? 'No válido'
      : `${formatCicloLabel(selectedIngresoCiclo.value)} · ${selectedPosition.value.nivel} · ${displayGrado(placementGrado)}`,
    status,
    statusLabel: status === 'invalid' ? 'Revisar' : status === 'unchanged' ? 'Sin cambios' : 'Listo'
  }
}))

const readyRows = computed(() => previewRows.value.filter(row => row.status === 'ready'))
const unchangedRows = computed(() => previewRows.value.filter(row => row.status === 'unchanged'))
const invalidRows = computed(() => previewRows.value.filter(row => row.status === 'invalid'))
const canConfirm = computed(() => !props.saving && props.selectedStudents.length > 0 && invalidRows.value.length === 0)

const confirmBulkUpdate = () => {
  if (!canConfirm.value) return
  emit('confirm', {
    ciclo: selectedIngresoCiclo.value,
    targetCiclo: targetCicloKey.value,
    targetNivel: selectedPosition.value.nivel,
    targetGrado: selectedPosition.value.grado
  })
}

const resultRows = computed(() => Array.isArray(props.result?.results) ? props.result.results.slice(0, 80) : [])
const resultStatusLabel = (row) => {
  if (row.status === 'updated') return 'Actualizado'
  if (row.status === 'skipped') return 'Sin cambios'
  return row.message || 'No actualizado'
}
</script>

<style scoped>
.bulk-ingreso-overlay {
  position: fixed;
  inset: 0;
  z-index: 10040;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(16px, 3vw, 34px);
  overflow: auto;
  background: rgba(15, 23, 42, 0.38);
  backdrop-filter: blur(14px) saturate(1.08);
}

.bulk-ingreso-modal {
  position: relative;
  width: min(1180px, calc(100vw - 48px));
  max-height: min(820px, calc(100dvh - 48px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(220, 229, 240, 0.98);
  border-radius: 30px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), #fff 58%, #f8fafc 100%);
  box-shadow: 0 34px 90px rgba(15, 23, 42, 0.24);
  color: #13223b;
}

.bulk-ingreso-close {
  position: absolute;
  top: 24px;
  right: 24px;
  z-index: 3;
  display: inline-flex;
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(214, 226, 239, 0.98);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #13223b;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.1);
}

.bulk-ingreso-hero {
  display: flex;
  gap: 18px;
  align-items: center;
  padding: 28px 92px 26px 34px;
  border-bottom: 1px solid rgba(220, 229, 240, 0.94);
  background:
    radial-gradient(circle at 92% -18%, rgba(79, 188, 99, 0.18), transparent 31%),
    linear-gradient(112deg, #fff, #f5f9ff 58%, #edf8f0);
}

.bulk-ingreso-hero__icon {
  display: inline-flex;
  width: 62px;
  height: 62px;
  align-items: center;
  justify-content: center;
  border-radius: 20px;
  background: linear-gradient(180deg, #edf5ff, #e4efff);
  color: #2f72d9;
  box-shadow: 0 16px 34px rgba(47, 114, 217, 0.12);
}

.bulk-ingreso-hero span,
.bulk-ingreso-section-heading span {
  color: #6c7b92;
  font-size: 12px;
  font-weight: 860;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.bulk-ingreso-hero h2 {
  margin: 4px 0 5px;
  font-size: clamp(27px, 2.7vw, 36px);
  line-height: 1.02;
  font-weight: 950;
  letter-spacing: -0.06em;
}

.bulk-ingreso-hero p {
  margin: 0;
  color: #5f6f89;
  font-size: 15px;
  font-weight: 640;
}

.bulk-ingreso-body {
  display: grid;
  grid-template-columns: minmax(300px, 0.34fr) minmax(0, 1fr);
  gap: 16px;
  min-height: 0;
  overflow: auto;
  padding: 22px;
}

.bulk-ingreso-selected,
.bulk-ingreso-card {
  border: 1px solid rgba(220, 229, 240, 0.98);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 16px 38px rgba(15, 23, 42, 0.05);
}

.bulk-ingreso-selected {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 18px;
}

.bulk-ingreso-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.bulk-ingreso-section-heading h3 {
  margin: 4px 0 0;
  color: #13223b;
  font-size: 21px;
  font-weight: 930;
  letter-spacing: -0.04em;
}

.bulk-ingreso-section-heading.compact h3 {
  font-size: 18px;
}

.bulk-ingreso-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 0 12px;
  padding: 10px 12px;
  border: 1px solid rgba(216, 226, 238, 0.98);
  border-radius: 14px;
  background: #f8fafc;
  color: #64748b;
}

.bulk-ingreso-search input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #13223b;
  font-size: 14px;
  font-weight: 650;
}

.bulk-ingreso-selected-list {
  display: grid;
  gap: 10px;
  overflow: auto;
  padding-right: 3px;
}

.bulk-ingreso-selected-list article {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid rgba(226, 233, 242, 0.95);
  border-radius: 15px;
  background: #fff;
}

.bulk-ingreso-avatar {
  display: inline-flex;
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #eef6ff;
  color: #2f72d9;
  font-size: 12px;
  font-weight: 920;
}

.bulk-ingreso-selected-list strong,
.bulk-ingreso-preview-row strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bulk-ingreso-selected-list small {
  display: block;
  overflow: hidden;
  color: #6b7b94;
  font-size: 12px;
  font-weight: 670;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bulk-ingreso-selected-list button {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(225, 232, 241, 0.98);
  border-radius: 999px;
  background: #fff;
  color: #64748b;
}

.bulk-ingreso-config {
  display: grid;
  align-content: start;
  gap: 16px;
}

.bulk-ingreso-card {
  display: grid;
  gap: 16px;
  padding: 18px;
}

.bulk-ingreso-cycle-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.bulk-ingreso-cycle {
  display: grid;
  gap: 4px;
  min-height: 72px;
  align-content: center;
  padding: 12px 10px;
  border: 1px solid rgba(216, 226, 238, 0.98);
  border-radius: 15px;
  background: linear-gradient(180deg, #fff, #f8fafc);
  color: #13223b;
  text-align: center;
}

.bulk-ingreso-cycle.active {
  border-color: rgba(47, 114, 217, 0.48);
  background: linear-gradient(180deg, #f2f7ff, #fff);
  box-shadow: 0 14px 30px rgba(47, 114, 217, 0.11);
}

.bulk-ingreso-cycle strong {
  font-size: 14px;
  font-weight: 910;
}

.bulk-ingreso-cycle span {
  color: #6b7b94;
  font-size: 11px;
  font-weight: 760;
}

.bulk-ingreso-stepper {
  display: grid;
  grid-template-columns: 1fr minmax(190px, 1fr) 1fr;
  align-items: stretch;
  gap: 10px;
}

.bulk-ingreso-stepper button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid rgba(216, 226, 238, 0.98);
  border-radius: 15px;
  background: #fff;
  color: #13223b;
  font-weight: 850;
}

.bulk-ingreso-stepper button span {
  color: inherit;
  font-size: 26px;
  line-height: 1;
}

.bulk-ingreso-stepper div {
  display: grid;
  place-items: center;
  gap: 4px;
  padding: 16px;
  border-radius: 16px;
  background: linear-gradient(180deg, #f7fbff, #eef6ff);
  text-align: center;
}

.bulk-ingreso-stepper small {
  color: #6b7b94;
  font-size: 12px;
  font-weight: 760;
}

.bulk-ingreso-stepper strong {
  font-size: 17px;
  font-weight: 930;
}

.bulk-ingreso-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.bulk-ingreso-fields label {
  display: grid;
  gap: 7px;
}

.bulk-ingreso-fields label span {
  color: #5f6f89;
  font-size: 12px;
  font-weight: 820;
}

.bulk-ingreso-fields select {
  width: 100%;
  min-height: 44px;
  border: 1px solid rgba(216, 226, 238, 0.98);
  border-radius: 13px;
  background: #fff;
  color: #13223b;
  font-weight: 760;
  padding: 0 12px;
}

.preview-card {
  min-height: 248px;
}

.bulk-ingreso-warning {
  display: inline-flex;
  padding: 7px 10px;
  border-radius: 999px;
  background: #fff7ed;
  color: #b45309;
  font-size: 12px;
  font-weight: 860;
}

.bulk-ingreso-preview-table {
  display: grid;
  max-height: 280px;
  overflow: auto;
  border: 1px solid rgba(224, 231, 241, 0.98);
  border-radius: 15px;
}

.bulk-ingreso-preview-row {
  display: grid;
  grid-template-columns: minmax(180px, 1.15fr) minmax(150px, 0.85fr) minmax(150px, 0.85fr) minmax(86px, 0.4fr);
  gap: 12px;
  align-items: center;
  min-width: 740px;
  padding: 11px 13px;
  border-bottom: 1px solid rgba(228, 235, 244, 0.95);
  color: #42526b;
  font-size: 12px;
  font-weight: 690;
}

.bulk-ingreso-preview-row:last-child {
  border-bottom: 0;
}

.bulk-ingreso-preview-row.head {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f8fafc;
  color: #6b7b94;
  font-size: 11px;
  font-weight: 890;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.bulk-ingreso-preview-row em {
  justify-self: start;
  padding: 6px 9px;
  border-radius: 999px;
  font-style: normal;
  font-weight: 880;
}

.bulk-ingreso-preview-row em.ready {
  background: #ecfdf3;
  color: #15803d;
}

.bulk-ingreso-preview-row em.unchanged {
  background: #f1f5f9;
  color: #64748b;
}

.bulk-ingreso-preview-row em.invalid {
  background: #fff7ed;
  color: #b45309;
}

.bulk-ingreso-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 24px 22px;
  border-top: 1px solid rgba(220, 229, 240, 0.94);
  background: #fff;
}

.bulk-ingreso-footer p {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: #64748b;
  font-size: 13px;
  font-weight: 690;
}

.bulk-ingreso-footer div {
  display: inline-flex;
  gap: 10px;
}

.bulk-ingreso-result {
  display: grid;
  justify-items: center;
  gap: 16px;
  padding: 44px 34px 24px;
  text-align: center;
}

.bulk-ingreso-result__icon {
  display: inline-flex;
  width: 76px;
  height: 76px;
  align-items: center;
  justify-content: center;
  border-radius: 24px;
  background: #ecfdf3;
  color: #15803d;
}

.bulk-ingreso-result p {
  margin: 0 0 4px;
  color: #6b7b94;
  font-size: 12px;
  font-weight: 860;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.bulk-ingreso-result h3 {
  margin: 0;
  font-size: 30px;
  font-weight: 950;
  letter-spacing: -0.05em;
}

.bulk-ingreso-result small {
  color: #64748b;
  font-size: 14px;
  font-weight: 720;
}

.bulk-ingreso-result__rows {
  display: grid;
  width: min(640px, 100%);
  max-height: 260px;
  overflow: auto;
  border: 1px solid rgba(224, 231, 241, 0.98);
  border-radius: 16px;
  text-align: left;
}

.bulk-ingreso-result__rows article {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 13px;
  border-bottom: 1px solid rgba(228, 235, 244, 0.95);
  font-size: 13px;
}

.bulk-ingreso-result__rows article:last-child {
  border-bottom: 0;
}

.result-footer {
  width: 100%;
  justify-content: center;
  border-top: 0;
  padding-bottom: 0;
}

.btn {
  display: inline-flex;
  min-height: 43px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 999px;
  padding: 0 18px;
  font-size: 14px;
  font-weight: 850;
}

.btn-primary {
  border: 1px solid #2f72d9;
  background: #2f72d9;
  color: #fff;
}

.btn-ghost {
  border: 1px solid rgba(216, 226, 238, 0.98);
  background: #fff;
  color: #13223b;
}

button:disabled,
select:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@media (max-width: 980px) {
  .bulk-ingreso-body {
    grid-template-columns: 1fr;
  }

  .bulk-ingreso-cycle-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .bulk-ingreso-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .bulk-ingreso-footer div,
  .bulk-ingreso-footer button {
    width: 100%;
  }
}
</style>
