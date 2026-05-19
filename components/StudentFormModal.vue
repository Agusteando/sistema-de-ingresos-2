<template>
  <Teleport to="body">
    <div class="student-form-overlay" @click.self="requestClose">
      <section class="student-form-modal" role="dialog" aria-modal="true" :aria-labelledby="formTitleId">
        <button class="student-form-close" type="button" aria-label="Cerrar" @click="requestClose">
          <LucideX :size="27" />
        </button>

        <header class="student-form-hero">
          <span class="student-form-hero-veil" aria-hidden="true"></span>
          <span class="student-form-hero-curve blue" aria-hidden="true"></span>
          <span class="student-form-hero-curve green" aria-hidden="true"></span>

          <span class="student-form-avatar" aria-hidden="true">
            <LucideUserPlus v-if="!isEdit" :size="44" :stroke-width="1.9" />
            <span v-else>{{ editInitials }}</span>
          </span>
          <div class="student-form-title-copy">
            <h2 :id="formTitleId">{{ isEdit ? 'Editar alumno' : 'Nuevo alumno' }}</h2>
            <p>{{ isEdit ? 'Actualiza sus datos personales y académicos.' : 'Captura sus datos personales y académicos para registrarlo en el sistema.' }}</p>
          </div>
        </header>

        <form @submit.prevent="submit">
          <div class="student-form-content">
            <ModalDraftStatus :restored="draftRestored" :status="draftSaveState" :dirty="hasUnsavedChanges" />
            <section v-if="isEdit" class="student-edit-strip">
              <div>
                <small>Matrícula</small>
                <strong>{{ form.matricula }}</strong>
              </div>
              <span :class="['student-status-chip', props.student?.estatus === 'Activo' ? 'active' : 'inactive']">
                {{ props.student?.estatus || 'Activo' }}
              </span>
            </section>

            <div class="student-form-grid">
              <section class="form-panel personal-panel" aria-labelledby="personal-title">
                <div class="section-heading green">
                  <span aria-hidden="true"><LucideUserRound :size="24" /></span>
                  <h3 id="personal-title">1. Datos personales</h3>
                </div>

                <div class="field-stack">
                  <label class="polished-field">
                    <span>A. paterno</span>
                    <input :value="form.apellidoPaterno" type="text" placeholder="Ingresa el apellido paterno" required @input="handleNameInput('apellidoPaterno', $event)" @blur="normalizeNameField('apellidoPaterno')" />
                  </label>

                  <label class="polished-field">
                    <span>A. materno</span>
                    <input :value="form.apellidoMaterno" type="text" placeholder="Ingresa el apellido materno" required @input="handleNameInput('apellidoMaterno', $event)" @blur="normalizeNameField('apellidoMaterno')" />
                  </label>

                  <label class="polished-field">
                    <span>Nombre(s)</span>
                    <input :value="form.nombres" type="text" placeholder="Ingresa el o los nombres" required @input="handleNameInput('nombres', $event)" @blur="normalizeNameField('nombres')" />
                  </label>

                  <label class="polished-field curp-field">
                    <span>CURP</span>
                    <input
                      :value="form.curp"
                      type="text"
                      maxlength="18"
                      autocomplete="off"
                      spellcheck="false"
                      placeholder="Ingresa la CURP"
                      required
                      @input="normalizeCurpField"
                      @blur="normalizeCurpField"
                    />
                  </label>

                  <Transition name="curp-insights" mode="out-in">
                    <section v-if="curpHasValue" :key="curpInferenceKey" :class="['curp-insight-card', curpStatusClass]" aria-live="polite">
                      <span class="curp-card-glow" aria-hidden="true"></span>
                      <div class="curp-insight-header">
                        <span class="curp-insight-icon" aria-hidden="true">
                          <LucideShieldCheck v-if="curpInfo.isValid" :size="22" />
                          <LucideInfo v-else :size="22" />
                        </span>
                        <div>
                          <strong>{{ curpInsightTitle }}</strong>
                          <p>{{ curpInfo.message }}</p>
                        </div>
                      </div>

                      <div v-if="curpInfo.isValid" class="curp-data-grid">
                        <div>
                          <small>Nacimiento</small>
                          <strong>{{ inferredBirthLabel }}</strong>
                        </div>
                        <div>
                          <small>Edad</small>
                          <strong>{{ curpInfo.age }} años</strong>
                        </div>
                        <div>
                          <small>Género</small>
                          <strong>{{ curpInfo.genderLabel }}</strong>
                        </div>
                      </div>
                    </section>
                  </Transition>
                </div>

                <div class="section-divider"></div>

                <div class="section-heading amber">
                  <span aria-hidden="true"><LucideUsersRound :size="24" /></span>
                  <h3>3. Contacto familiar</h3>
                </div>

                <div class="field-stack compact">
                  <label class="polished-field">
                    <span>Padre/Tutor</span>
                    <input :value="form.padre" type="text" placeholder="Ingresa el nombre completo" required @input="handleNameInput('padre', $event)" @blur="normalizeNameField('padre')" />
                  </label>
                  <div class="two-field-grid">
                    <label class="polished-field">
                      <span>Teléfono</span>
                      <input v-model="form.telefono" type="text" inputmode="tel" placeholder="Ingresa el teléfono" @blur="trimField('telefono')" />
                    </label>
                    <label class="polished-field">
                      <span>Correo electrónico</span>
                      <input v-model="form.correo" type="email" placeholder="Ingresa el correo electrónico" required @blur="normalizeEmailField" />
                    </label>
                  </div>
                </div>
              </section>

              <section class="form-panel academic-panel" aria-labelledby="academic-title">
                <div class="section-heading blue">
                  <span aria-hidden="true"><LucideGraduationCap :size="25" /></span>
                  <h3 id="academic-title">2. Grado</h3>
                </div>

                <div class="field-stack compact academic-grade-only">
                  <label class="polished-field select-field">
                    <span>Grado</span>
                    <select v-model="form.grado" required>
                      <option v-for="g in availableGrades" :key="g" :value="g">{{ g }}</option>
                    </select>
                    <LucideChevronDown :size="18" aria-hidden="true" />
                  </label>

                  <label v-if="isEdit" class="polished-field select-field">
                    <span>Grupo</span>
                    <select v-model="form.grupo">
                      <option value="">Sin grupo</option>
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                    </select>
                    <LucideChevronDown :size="18" aria-hidden="true" />
                  </label>
                </div>

                <Transition name="result-card" mode="out-in">
                  <section :key="resultAnimationKey" :class="['alta-ingreso-card', visibleTipoIngreso.value]" aria-live="polite">
                    <span class="alta-card-shine" aria-hidden="true"></span>
                    <div class="alta-card-kicker">{{ ingresoCardKicker }}</div>
                    <div class="alta-result-main">
                      <span class="alta-result-orb" aria-hidden="true">
                        <LucideShieldCheck v-if="visibleTipoIngreso.value === 'interno'" :size="32" />
                        <LucideGlobe2 v-else :size="32" />
                      </span>
                      <strong>{{ visibleTipoIngresoLabel }} en {{ currentCicloLabel }}</strong>
                    </div>
                    <p v-html="ingresoCardCopy"></p>
                    <small>
                      <LucideInfo :size="17" />
                      El ciclo de ingreso quedará registrado como {{ ingresoCicloLabel }}.
                    </small>
                  </section>
                </Transition>

                <section class="cycle-summary-card" aria-label="Ciclo de ingreso y estado visible">
                  <div>
                    <span><LucideCalendarDays :size="19" /></span>
                    <p>Ciclo de ingreso</p>
                    <strong>{{ ingresoCicloLabel }}</strong>
                  </div>
                  <div>
                    <span><LucideUserRound :size="19" /></span>
                    <p>Estado visible</p>
                    <strong>{{ visibleTipoIngresoLabel }} en {{ currentCicloLabel }}</strong>
                  </div>
                </section>

                <button
                  class="change-cycle-button"
                  type="button"
                  :aria-expanded="showCyclePicker"
                  @click="showCyclePicker = !showCyclePicker"
                >
                  <span><LucideCalendarDays :size="19" /></span>
                  <strong>{{ showCyclePicker ? 'Ocultar cambio de ciclo' : 'Cambiar ciclo de ingreso' }}</strong>
                  <LucideChevronDown :class="{ open: showCyclePicker }" :size="18" />
                </button>

                <Transition name="cycle-picker">
                  <section v-if="showCyclePicker" class="inline-cycle-picker" aria-label="Seleccionar ciclo de ingreso">
                    <div class="cycle-tile-grid">
                      <button
                        v-for="option in primaryCicloOptions"
                        :key="option.value"
                        type="button"
                        :class="['cycle-tile', { selected: option.value === form.ciclo, current: option.value === currentCicloKey }]"
                        @click="selectIngresoCiclo(option.value)"
                      >
                        <span v-if="option.value === form.ciclo" class="cycle-check" aria-hidden="true"><LucideCheck :size="16" /></span>
                        <strong>{{ option.label }}</strong>
                        <small>{{ cycleTileLabel(option.value) }}</small>
                        <i aria-hidden="true"><LucideCalendarDays :size="18" /></i>
                      </button>
                    </div>

                    <button class="older-cycle-toggle" type="button" :aria-expanded="showOlderCycles" @click="showOlderCycles = !showOlderCycles">
                      <LucideList :size="18" />
                      <span>{{ showOlderCycles ? 'Ocultar ciclos anteriores' : 'Ver ciclos anteriores' }}</span>
                      <LucideChevronDown :class="{ open: showOlderCycles }" :size="17" />
                    </button>

                    <Transition name="older-cycles">
                      <div v-if="showOlderCycles" class="older-cycle-grid">
                        <button
                          v-for="option in olderCicloOptions"
                          :key="option.value"
                          type="button"
                          :class="['older-cycle-option', { selected: option.value === form.ciclo }]"
                          @click="selectIngresoCiclo(option.value)"
                        >
                          <span>{{ option.label }}</span>
                          <small>{{ cycleTileLabel(option.value) }}</small>
                        </button>
                      </div>
                    </Transition>
                  </section>
                </Transition>

                <section v-if="isEdit" class="edit-admin-card">
                  <label class="polished-field">
                    <span>Estatus</span>
                    <input v-model="form.estatus" type="text" required placeholder="Activo o motivo de baja" />
                  </label>
                  <label class="polished-field select-field">
                    <span>Nivel manual</span>
                    <select v-model="form.nivel">
                      <option value="">Calculado por plantel ({{ inferredNivel }})</option>
                      <option v-for="nivel in nivelOptions" :key="nivel" :value="nivel">{{ nivel }}</option>
                    </select>
                    <LucideChevronDown :size="18" aria-hidden="true" />
                  </label>
                  <div class="two-field-grid">
                    <label class="polished-field">
                      <span>Matrícula anterior</span>
                      <input v-model="form.matriculaAnterior" type="text" />
                    </label>
                    <label class="polished-field">
                      <span>Matrícula sucesora</span>
                      <input v-model="form.matriculaSiguiente" type="text" />
                    </label>
                  </div>
                </section>
              </section>
            </div>
          </div>

          <ModalDiscardDialog
            :show="showDiscardConfirmation"
            @continue="continueEditing"
            @discard="discardAndClose"
          />

          <footer :class="['student-form-footer', { 'actions-only': isEdit }]">
            <div v-if="!isEdit" class="footer-matricula-strip" aria-label="Secuencia de matrícula">
              <div>
                <span>Plantel</span>
                <strong>{{ form.plantel }}</strong>
              </div>
              <div>
                <span>Última matrícula</span>
                <strong>{{ matriculaPreviewLoading ? '…' : (matriculaLast || '—') }}</strong>
              </div>
              <div>
                <span>Nueva matrícula</span>
                <strong>{{ matriculaPreviewLoading ? '…' : (matriculaNext || '—') }}</strong>
              </div>
            </div>
            <div class="footer-actions">
              <button class="student-form-cancel" type="button" :disabled="loading" @click="requestClose">Cancelar</button>
              <button class="student-form-save" type="submit" :disabled="loading">
                <LucideLoader2 v-if="loading" class="animate-spin" :size="18" />
                <LucideSave v-else :size="18" />
                {{ loading ? 'Guardando...' : (isEdit ? 'Guardar cambios' : 'Guardar alumno') }}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, ref, onMounted, watch } from 'vue'
import {
  LucideCalendarDays,
  LucideCheck,
  LucideChevronDown,
  LucideGlobe2,
  LucideGraduationCap,
  LucideInfo,
  LucideList,
  LucideLoader2,
  LucideSave,
  LucideShieldCheck,
  LucideUserPlus,
  LucideUserRound,
  LucideUsersRound,
  LucideX
} from 'lucide-vue-next'
import { useState, useCookie } from '#app'
import { useToast } from '~/composables/useToast'
import { useScrollLock } from '~/composables/useScrollLock'
import { useModalDraftPersistence } from '~/composables/useModalDraftPersistence'
import { normalizeCicloKey, formatCicloLabel } from '~/shared/utils/ciclo'
import { formatBirthDate, normalizeCurp, parseCurp } from '~/shared/utils/curp'
import { NIVELES_ESCOLARES, displayGrado, gradeOptionsForPlantel, nivelFromPlantel, normalizeNivelEscolar, resolveNivelEscolar } from '~/shared/utils/grado'
import { formatTipoIngresoValue, resolveTipoIngreso } from '~/shared/utils/tipoIngreso'

const props = defineProps({ student: Object })
const emit = defineEmits(['close', 'success'])
const state = useState('globalState')
const { show } = useToast()

useScrollLock()

const activePlantel = String(useCookie('auth_active_plantel').value || 'PT').trim().toUpperCase()
const userPlanteles = String(useCookie('auth_planteles').value || '').split(',').map(p => p.trim().toUpperCase()).filter(Boolean)
const defaultPlantel = activePlantel && activePlantel !== 'GLOBAL' ? activePlantel : (userPlanteles[0] || 'PT')
const isEdit = !!props.student
const loading = ref(false)
const matriculaLast = ref('')
const matriculaNext = ref('')
const matriculaPreviewLoading = ref(false)
const showCyclePicker = ref(false)
const showOlderCycles = ref(false)
const cycleChangedByUser = ref(false)
const formTitleId = `student-form-title-${Math.random().toString(36).slice(2, 8)}`

const currentCicloKey = computed(() => normalizeCicloKey(state.value.ciclo))
const currentCicloLabel = computed(() => formatCicloLabel(currentCicloKey.value))

const form = ref({
  matricula: '', apellidoPaterno: '', apellidoMaterno: '', nombres: '',
  curp: '', birth: '', genero: '1', plantel: defaultPlantel, nivel: '', grado: 'Primero', grupo: '',
  padre: '', telefono: '', correo: '', ciclo: currentCicloKey.value, estatus: 'Activo',
  matriculaAnterior: '', matriculaSiguiente: ''
})

const originalAcademic = ref({
  plantel: defaultPlantel,
  nivel: nivelFromPlantel(defaultPlantel),
  grado: 'Primero',
  ciclo: currentCicloKey.value
})

const nivelOptions = NIVELES_ESCOLARES
const inferredNivel = computed(() => nivelFromPlantel(form.value.plantel))
const academicNivel = computed(() => resolveNivelEscolar({ plantel: form.value.plantel, nivel: form.value.nivel }))
const availableGrades = computed(() => gradeOptionsForPlantel(form.value.plantel, academicNivel.value))

const studentDraftFields = [
  'matricula',
  'apellidoPaterno',
  'apellidoMaterno',
  'nombres',
  'curp',
  'birth',
  'genero',
  'plantel',
  'nivel',
  'grado',
  'grupo',
  'padre',
  'telefono',
  'correo',
  'ciclo',
  'estatus',
  'matriculaAnterior',
  'matriculaSiguiente'
]

const readStudentDraft = () => studentDraftFields.reduce((draft, field) => {
  draft[field] = form.value[field] ?? ''
  return draft
}, {})

const writeStudentDraft = (draft) => {
  if (!draft || typeof draft !== 'object') return

  const restored = { ...form.value }
  for (const field of studentDraftFields) {
    if (Object.prototype.hasOwnProperty.call(draft, field)) restored[field] = draft[field] ?? ''
  }

  restored.curp = normalizeCurp(restored.curp)
  restored.ciclo = normalizeCicloKey(restored.ciclo || currentCicloKey.value)
  restored.grado = displayGrado(restored.grado || availableGrades.value[0] || 'Primero')
  form.value = restored
  cycleChangedByUser.value = true
}

const studentDraftCicloScope = currentCicloKey.value
const studentDraftKey = computed(() => {
  const mode = isEdit ? `edit:${props.student?.matricula || form.value.matricula || 'unknown'}` : `alta:${defaultPlantel}:${studentDraftCicloScope}`
  return `student-form:${mode}`
})

const studentDraftHasContent = (draft) => {
  if (!draft || typeof draft !== 'object') return false
  const relevantFields = ['apellidoPaterno', 'apellidoMaterno', 'nombres', 'curp', 'padre', 'telefono', 'correo', 'matriculaAnterior', 'matriculaSiguiente']
  if (relevantFields.some(field => String(draft[field] || '').trim().length > 0)) return true
  if (String(draft.plantel || defaultPlantel) !== defaultPlantel) return true
  if (String(draft.nivel || '').trim().length > 0) return true
  if (String(draft.grado || 'Primero') !== 'Primero') return true
  if (normalizeCicloKey(draft.ciclo || currentCicloKey.value) !== currentCicloKey.value) return true
  if (isEdit && String(draft.estatus || 'Activo') !== 'Activo') return true
  return false
}

const {
  draftRestored,
  draftSaveState,
  hasUnsavedChanges,
  showDiscardConfirmation,
  initializeDraft,
  markSaved,
  requestClose,
  continueEditing,
  discardAndClose
} = useModalDraftPersistence({
  key: studentDraftKey,
  read: readStudentDraft,
  write: writeStudentDraft,
  onClose: () => emit('close'),
  canRequestClose: () => !loading.value,
  isDraftMeaningful: studentDraftHasContent
})
const ingresoCicloLabel = computed(() => formatCicloLabel(form.value.ciclo))
const curpInfo = computed(() => parseCurp(form.value.curp))
const curpHasValue = computed(() => curpInfo.value.normalized.length > 0)
const curpStatusClass = computed(() => curpInfo.value.isValid ? 'valid' : curpInfo.value.isComplete ? 'invalid' : 'pending')
const curpInferenceKey = computed(() => `${curpStatusClass.value}-${curpInfo.value.normalized}`)
const curpInsightTitle = computed(() => {
  if (curpInfo.value.isValid) return 'Datos calculados desde la CURP'
  if (curpInfo.value.isComplete) return 'CURP no válida'
  return 'Validando CURP'
})
const inferredBirthLabel = computed(() => formatBirthDate(curpInfo.value.birthDate))

const visibleTipoIngreso = computed(() => resolveTipoIngreso({ ciclo: form.value.ciclo, cicloBase: form.value.ciclo }, currentCicloKey.value))
const visibleTipoIngresoLabel = computed(() => formatTipoIngresoValue(visibleTipoIngreso.value))
const resultAnimationKey = computed(() => `${form.value.ciclo}-${currentCicloKey.value}-${visibleTipoIngreso.value.value}`)

const ingresoCardKicker = computed(() => {
  if (form.value.ciclo === currentCicloKey.value) return 'Ingreso en ciclo actual'
  return 'Ingreso en ciclo anterior'
})

const ingresoCardCopy = computed(() => {
  if (form.value.ciclo === currentCicloKey.value) {
    return `Al dar de alta a un alumno nuevo, el sistema registra ${currentCicloLabel.value} como su ciclo de ingreso. Por eso se mostrará como <strong>externo</strong> en este ciclo.`
  }

  return `El ciclo de ingreso elegido es ${ingresoCicloLabel.value}. Para el ciclo seleccionado (${currentCicloLabel.value}) el sistema lo mostrará como <strong>${visibleTipoIngresoLabel.value.toLowerCase()}</strong>.`
})

const editInitials = computed(() => String(props.student?.nombreCompleto || 'A')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part.charAt(0).toUpperCase())
  .join('') || 'A')

const academicChanged = computed(() => {
  if (!isEdit) return true

  const current = {
    plantel: String(form.value.plantel || '').trim(),
    nivel: academicNivel.value,
    grado: displayGrado(form.value.grado || 'Primero').toLowerCase(),
    ciclo: normalizeCicloKey(form.value.ciclo)
  }

  return current.plantel !== originalAcademic.value.plantel ||
    current.nivel !== originalAcademic.value.nivel ||
    current.grado !== originalAcademic.value.grado.toLowerCase() ||
    current.ciclo !== originalAcademic.value.ciclo
})

const cicloOptions = computed(() => {
  const currentYear = Number(currentCicloKey.value)
  const selectedYear = Number(normalizeCicloKey(form.value.ciclo))
  const range = []

  for (let year = currentYear; year >= currentYear - 11; year -= 1) {
    range.push(String(year))
  }

  if (Number.isFinite(selectedYear) && !range.includes(String(selectedYear))) {
    range.splice(range.length - 1, 1, String(selectedYear))
  }

  return range
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((a, b) => Number(b) - Number(a))
    .map(value => ({ value, label: formatCicloLabel(value) }))
})

const primaryCicloOptions = computed(() => cicloOptions.value.slice(0, 4))
const olderCicloOptions = computed(() => cicloOptions.value.slice(4))

const cycleTileLabel = (value) => {
  if (value === currentCicloKey.value) return 'Ciclo actual'
  if (value === form.value.ciclo) return 'Seleccionado'
  return 'Anterior'
}

const selectIngresoCiclo = (value) => {
  form.value.ciclo = normalizeCicloKey(value)
  cycleChangedByUser.value = true
}

watch([() => form.value.plantel, () => form.value.nivel], () => {
  const selected = availableGrades.value.find(g => g.toLowerCase() === String(form.value.grado || '').toLowerCase())
  form.value.grado = selected || availableGrades.value[0]
}, { immediate: true })

watch(curpInfo, (info) => {
  if (!info.isValid) return
  form.value.birth = info.birthDate
  form.value.genero = info.gender
}, { immediate: true })

watch(currentCicloKey, (value, oldValue) => {
  if (!isEdit && !cycleChangedByUser.value && form.value.ciclo === oldValue) {
    form.value.ciclo = value
  }
})

watch(() => form.value.ciclo, (value) => {
  if (olderCicloOptions.value.some(option => option.value === value)) showOlderCycles.value = true
})

onMounted(() => {
  if (isEdit) {
    const s = props.student
    form.value = {
      matricula: s.matricula,
      apellidoPaterno: s.apellidoPaterno || '',
      apellidoMaterno: s.apellidoMaterno || '',
      nombres: s.nombres || '',
      curp: normalizeCurp(s.curp || s.CURP || ''),
      birth: s.birth ? s.birth.split('T')[0] : '',
      genero: s.genero || '1',
      plantel: s.plantel || defaultPlantel,
      nivel: normalizeNivelEscolar(s.nivel) && normalizeNivelEscolar(s.nivel) !== nivelFromPlantel(s.plantel || defaultPlantel) ? normalizeNivelEscolar(s.nivel) : '',
      grado: displayGrado(s.gradoBase || s.grado || 'Primero'),
      grupo: s.grupo || 'A',
      padre: s.padre || '',
      telefono: s.telefono || '',
      correo: s.correo || '',
      ciclo: normalizeCicloKey(s.cicloBase || s.ciclo || currentCicloKey.value),
      estatus: s.estatus || 'Activo',
      matriculaAnterior: s.matriculaAnterior || '',
      matriculaSiguiente: s.matriculaSiguiente || ''
    }
    originalAcademic.value = {
      plantel: String(form.value.plantel || '').trim(),
      nivel: academicNivel.value,
      grado: displayGrado(form.value.grado || 'Primero'),
      ciclo: normalizeCicloKey(form.value.ciclo)
    }
  }

  initializeDraft()
})

const NAME_PARTICLES = new Set(['de', 'del', 'de la', 'de las', 'de los', 'la', 'las', 'los', 'y'])

const titleWord = (word, index, words) => {
  const lower = word.toLocaleLowerCase('es-MX')
  const nextTwo = `${lower} ${words[index + 1]?.toLocaleLowerCase('es-MX') || ''}`.trim()
  if (index > 0 && NAME_PARTICLES.has(lower)) return lower
  if (index > 0 && NAME_PARTICLES.has(nextTwo)) return lower
  return lower.replace(/^([\p{L}ÑñÁÉÍÓÚÜáéíóúü])|([-'’][\p{L}ÑñÁÉÍÓÚÜáéíóúü])/gu, match => match.toLocaleUpperCase('es-MX'))
}

const toNameCase = (value) => {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word, index, words) => titleWord(word, index, words))
    .join(' ')
}

const toLiveNameCase = (value) => {
  const source = String(value || '')
  const parts = source.split(/(\s+)/)
  const words = parts.filter(part => part && !/^\s+$/.test(part))
  let wordIndex = 0

  return parts.map((part) => {
    if (!part || /^\s+$/.test(part)) return part
    const normalized = titleWord(part, wordIndex, words)
    wordIndex += 1
    return normalized
  }).join('')
}

const handleNameInput = (field, event) => {
  const input = event?.target
  const rawValue = String(input?.value || '')
  const caret = typeof input?.selectionStart === 'number' ? input.selectionStart : rawValue.length
  const rawBeforeCaret = rawValue.slice(0, caret)
  const normalizedValue = toLiveNameCase(rawValue)
  const normalizedBeforeCaret = toLiveNameCase(rawBeforeCaret)

  form.value[field] = normalizedValue

  if (input && input.value !== normalizedValue) {
    nextTick(() => {
      const nextCaret = normalizedBeforeCaret.length
      input.setSelectionRange(nextCaret, nextCaret)
    })
  }
}

const normalizeNameField = (field) => {
  form.value[field] = toNameCase(form.value[field])
}

const trimField = (field) => {
  form.value[field] = String(form.value[field] || '').trim()
}

const normalizeEmailField = () => {
  form.value.correo = String(form.value.correo || '').trim().toLowerCase()
}

const normalizeCurpField = (event) => {
  const value = event?.target ? event.target.value : form.value.curp
  form.value.curp = normalizeCurp(value)
}

const loadMatriculaPreview = async () => {
  if (isEdit) return
  const plantel = String(form.value.plantel || '').trim().toUpperCase()
  if (!plantel || plantel === 'GLOBAL') {
    matriculaLast.value = ''
    matriculaNext.value = ''
    return
  }

  matriculaPreviewLoading.value = true
  try {
    const response = await $fetch('/api/students/matricula-preview', { query: { plantel } })
    matriculaLast.value = String(response?.lastMatricula || '')
    matriculaNext.value = String(response?.nextMatricula || response?.preview || '')
  } catch (error) {
    matriculaLast.value = ''
    matriculaNext.value = ''
  } finally {
    matriculaPreviewLoading.value = false
  }
}

watch(() => form.value.plantel, loadMatriculaPreview, { immediate: true })

const normalizeNamesBeforeSubmit = () => {
  ;['apellidoPaterno', 'apellidoMaterno', 'nombres', 'padre'].forEach(normalizeNameField)
  normalizeCurpField()
  trimField('telefono')
  normalizeEmailField()
}

const submit = async () => {
  normalizeNamesBeforeSubmit()
  if (!curpInfo.value.isValid) {
    show(curpInfo.value.message || 'Captura una CURP válida antes de guardar.', 'danger')
    return
  }

  loading.value = true
  try {
    const cicloKey = normalizeCicloKey(form.value.ciclo || currentCicloKey.value)
    const url = isEdit ? `/api/students/${form.value.matricula}` : '/api/students'
    const method = isEdit ? 'PUT' : 'POST'
    await $fetch(url, {
      method,
      body: {
        ...form.value,
        grupo: isEdit ? form.value.grupo : '',
        nivel: form.value.nivel,
        resolvedNivel: academicNivel.value,
        ciclo: cicloKey,
        academicChanged: academicChanged.value
      }
    })
    show(isEdit ? 'Alumno actualizado correctamente' : 'Alumno registrado exitosamente', 'success')
    markSaved()
    emit('success')
  } catch (e) {
    show('Error guardando la información', 'danger')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.student-form-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: clamp(18px, 3.2vh, 40px);
  background: rgba(15, 23, 42, 0.34);
  backdrop-filter: blur(14px) saturate(1.04);
}

.student-form-modal {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(1320px, calc(100vw - 56px));
  max-height: min(940px, calc(100dvh - 48px));
  overflow: hidden;
  border: 1px solid rgba(203, 213, 225, 0.92);
  border-radius: 34px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 251, 255, 0.97)),
    #fff;
  box-shadow:
    0 36px 96px rgba(15, 23, 42, 0.26),
    0 12px 28px rgba(15, 23, 42, 0.12);
  color: #12213c;
  font-family: var(--students-font, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
}

.student-form-modal > form {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
}

.student-form-close {
  position: absolute;
  top: 38px;
  right: 44px;
  z-index: 5;
  display: inline-flex;
  width: 58px;
  height: 58px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(203, 213, 225, 0.82);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
  color: #0f1d35;
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.13);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease,
    border-color 0.18s ease;
}

.student-form-close:hover {
  transform: translateY(-1px);
  border-color: rgba(184, 201, 222, 1);
  background: #fff;
  box-shadow: 0 22px 48px rgba(15, 23, 42, 0.18);
}

.student-form-hero {
  position: relative;
  display: flex;
  min-height: 132px;
  flex: 0 0 auto;
  align-items: center;
  gap: 26px;
  overflow: hidden;
  padding: 30px 104px 28px 48px;
  border-bottom: 1px solid rgba(203, 213, 225, 0.72);
  background:
    linear-gradient(110deg, rgba(255, 255, 255, 0.99), rgba(247, 251, 255, 0.94) 58%, rgba(235, 249, 238, 0.92));
}

.student-form-hero-veil,
.student-form-hero-curve {
  position: absolute;
  pointer-events: none;
}

.student-form-hero-veil {
  inset: 0;
  background:
    radial-gradient(circle at 28% -50%, rgba(59, 130, 246, 0.1), transparent 44%),
    radial-gradient(circle at 82% -26%, rgba(47, 147, 57, 0.18), transparent 42%);
}

.student-form-hero-curve {
  right: -7%;
  left: 58%;
  border-radius: 999px;
  opacity: 0.78;
}

.student-form-hero-curve.blue {
  top: -76px;
  height: 154px;
  background: linear-gradient(98deg, rgba(66, 141, 226, 0.11), rgba(255, 255, 255, 0));
  transform: rotate(-4deg);
}

.student-form-hero-curve.green {
  top: -34px;
  height: 178px;
  background: linear-gradient(104deg, rgba(255, 255, 255, 0), rgba(87, 180, 103, 0.22));
  transform: rotate(5deg);
}

.student-form-avatar {
  position: relative;
  z-index: 1;
  display: inline-flex;
  width: 82px;
  height: 82px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 4px solid rgba(255, 255, 255, 0.94);
  border-radius: 999px;
  background: linear-gradient(145deg, #f7fff8, #ffffff);
  color: #2f9339;
  box-shadow:
    0 18px 44px rgba(47, 147, 57, 0.14),
    inset 0 0 0 1px rgba(47, 147, 57, 0.16);
  font-size: 24px;
  font-weight: 900;
}

.student-form-title-copy {
  position: relative;
  z-index: 1;
  min-width: 0;
}

.student-form-title-copy h2 {
  margin: 0;
  color: #12213c;
  font-size: clamp(30px, 3.1vw, 42px);
  font-weight: 930;
  letter-spacing: -0.055em;
  line-height: 1.02;
}

.student-form-title-copy p {
  margin: 8px 0 0;
  color: #60708d;
  font-size: 15.5px;
  font-weight: 650;
  line-height: 1.35;
}

.student-form-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 32px 44px;
  scrollbar-gutter: stable;
}

.student-edit-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  padding: 15px 18px;
  border: 1px solid rgba(203, 213, 225, 0.86);
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.84);
}

.student-edit-strip small {
  display: block;
  color: #6b7892;
  font-size: 11px;
  font-weight: 850;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.student-edit-strip strong {
  display: block;
  color: #2f9339;
  font-size: 18px;
  font-weight: 900;
}

.student-status-chip {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
}

.student-status-chip.active {
  border: 1px solid #bde7c4;
  background: #eaf8ed;
  color: #24772d;
}

.student-status-chip.inactive {
  border: 1px solid #fecdd3;
  background: #fff1f2;
  color: #be123c;
}

.student-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(410px, 1fr);
  gap: clamp(34px, 4.2vw, 56px);
}

.form-panel {
  min-width: 0;
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 21px;
}

.section-heading > span {
  display: inline-flex;
  width: 46px;
  height: 46px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
}

.section-heading h3 {
  margin: 0;
  font-size: 19px;
  font-weight: 900;
  letter-spacing: -0.02em;
  line-height: 1;
}

.section-heading.green {
  color: #24822f;
}

.section-heading.green > span {
  background: #eaf8ed;
  box-shadow: inset 0 0 0 1px rgba(47, 147, 57, 0.12);
}

.section-heading.blue {
  color: #256ee4;
}

.section-heading.blue > span {
  background: #edf4ff;
  box-shadow: inset 0 0 0 1px rgba(37, 110, 228, 0.12);
}

.section-heading.amber {
  color: #e27d00;
}

.section-heading.amber > span {
  background: #fff7ed;
  box-shadow: inset 0 0 0 1px rgba(226, 125, 0, 0.12);
}

.field-stack {
  display: grid;
  gap: 22px;
}

.field-stack.compact {
  gap: 17px;
}

.two-field-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
}

.polished-field {
  display: grid;
  gap: 9px;
  color: #5b6680;
  font-size: 14px;
  font-weight: 830;
}

.polished-field span {
  line-height: 1;
}

.polished-field input,
.polished-field select {
  width: 100%;
  height: 54px;
  appearance: none;
  border: 1px solid #d7e0ef;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.93);
  color: #15233e;
  box-shadow:
    inset 0 1px 2px rgba(15, 23, 42, 0.025),
    0 1px 0 rgba(255, 255, 255, 0.9);
  font: inherit;
  font-size: 16px;
  font-weight: 650;
  outline: none;
  padding: 0 18px;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    background 0.16s ease;
}

.polished-field input::placeholder {
  color: #9aabc3;
}

.polished-field input:focus,
.polished-field select:focus {
  border-color: rgba(47, 147, 57, 0.62);
  background: #fff;
  box-shadow: 0 0 0 4px rgba(47, 147, 57, 0.12);
}

.select-field {
  position: relative;
}

.select-field > svg {
  position: absolute;
  right: 15px;
  bottom: 18px;
  color: #12213c;
  pointer-events: none;
}

.select-field select {
  padding-right: 44px;
}

.section-divider {
  height: 1px;
  margin: 32px 0 24px;
  background: linear-gradient(90deg, rgba(203, 213, 225, 0), rgba(203, 213, 225, 0.88), rgba(203, 213, 225, 0));
}

.curp-field input {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 17px;
  font-weight: 820;
  letter-spacing: 0.075em;
  text-transform: uppercase;
}

.curp-insight-card {
  position: relative;
  overflow: hidden;
  display: grid;
  gap: 16px;
  padding: 17px;
  border: 1px solid #d7e0ef;
  border-radius: 18px;
  background: linear-gradient(145deg, rgba(248, 251, 255, 0.96), rgba(255, 255, 255, 0.98));
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.05);
}

.curp-insight-card.valid {
  border-color: rgba(47, 147, 57, 0.34);
  background: linear-gradient(145deg, rgba(246, 255, 248, 0.96), rgba(255, 255, 255, 0.98));
}

.curp-insight-card.invalid {
  border-color: rgba(244, 63, 94, 0.38);
  background: linear-gradient(145deg, rgba(255, 247, 247, 0.96), rgba(255, 255, 255, 0.98));
}

.curp-card-glow {
  position: absolute;
  inset: -42% -24%;
  pointer-events: none;
  background: radial-gradient(circle at 18% 42%, rgba(37, 110, 228, 0.11), transparent 34%);
  opacity: 0.74;
  animation: curp-glow-drift 4200ms ease-in-out infinite;
}

.curp-insight-card.valid .curp-card-glow {
  background: radial-gradient(circle at 18% 42%, rgba(47, 147, 57, 0.14), transparent 35%);
}

.curp-insight-card.invalid .curp-card-glow {
  background: radial-gradient(circle at 18% 42%, rgba(244, 63, 94, 0.11), transparent 35%);
}

.curp-insight-header {
  position: relative;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 13px;
  align-items: center;
}

.curp-insight-icon {
  display: inline-flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #edf4ff;
  color: #256ee4;
}

.curp-insight-card.valid .curp-insight-icon {
  background: #eaf8ed;
  color: #2f9339;
}

.curp-insight-card.invalid .curp-insight-icon {
  background: #fff1f2;
  color: #e11d48;
}

.curp-insight-header strong {
  display: block;
  color: #142340;
  font-size: 15.5px;
  font-weight: 920;
  letter-spacing: -0.01em;
  line-height: 1.15;
}

.curp-insight-header p {
  margin: 5px 0 0;
  color: #63718d;
  font-size: 13.5px;
  font-weight: 640;
  line-height: 1.35;
}

.curp-insight-card.invalid .curp-insight-header p {
  color: #a93c4d;
}

.curp-data-grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.curp-data-grid > div {
  min-width: 0;
  padding: 12px 13px;
  border: 1px solid rgba(203, 213, 225, 0.74);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.8);
}

.curp-data-grid small {
  display: block;
  color: #6a7893;
  font-size: 10.5px;
  font-weight: 900;
  letter-spacing: 0.055em;
  line-height: 1;
  text-transform: uppercase;
}

.curp-data-grid strong {
  display: block;
  margin-top: 7px;
  overflow: hidden;
  color: #15233e;
  font-size: 14px;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.academic-grade-only {
  max-width: 360px;
}

.alta-ingreso-card {
  position: relative;
  overflow: hidden;
  margin-top: 20px;
  padding: 21px 23px 20px;
  border: 1px solid rgba(95, 177, 109, 0.48);
  border-radius: 16px;
  background:
    linear-gradient(145deg, rgba(247, 255, 248, 0.94), rgba(255, 255, 255, 0.96)),
    #fff;
  box-shadow: 0 16px 44px rgba(47, 147, 57, 0.09);
}

.alta-ingreso-card.externo {
  border-color: rgba(74, 144, 226, 0.36);
  background: linear-gradient(145deg, rgba(245, 250, 255, 0.96), rgba(255, 255, 255, 0.97));
  box-shadow: 0 16px 44px rgba(74, 144, 226, 0.08);
}

.alta-card-shine {
  position: absolute;
  inset: -35% -45%;
  background: linear-gradient(112deg, transparent 28%, rgba(255, 255, 255, 0.72) 46%, transparent 62%);
  opacity: 0.68;
  transform: translateX(-34%);
  animation: alta-card-sheen 2700ms cubic-bezier(0.22, 0.61, 0.36, 1) infinite;
}

.alta-card-kicker {
  position: relative;
  margin-bottom: 11px;
  color: #24772d;
  font-size: 16px;
  font-weight: 900;
}

.alta-ingreso-card.externo .alta-card-kicker {
  color: #256ee4;
}

.alta-result-main {
  position: relative;
  display: flex;
  align-items: center;
  gap: 18px;
}

.alta-result-orb {
  display: inline-flex;
  width: 56px;
  height: 56px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: linear-gradient(145deg, #46b052, #2f9339);
  color: #fff;
  box-shadow:
    0 17px 32px rgba(47, 147, 57, 0.25),
    inset 0 0 0 4px rgba(255, 255, 255, 0.2);
  animation: alta-orb-breathe 2400ms ease-in-out infinite;
}

.alta-ingreso-card.externo .alta-result-orb {
  background: linear-gradient(145deg, #5a9cf0, #256ee4);
  box-shadow:
    0 17px 32px rgba(37, 110, 228, 0.22),
    inset 0 0 0 4px rgba(255, 255, 255, 0.22);
}

.alta-result-main strong {
  display: inline-flex;
  min-height: 46px;
  align-items: center;
  padding: 0 22px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(47, 147, 57, 0.13), rgba(47, 147, 57, 0.04));
  color: #2f9339;
  font-size: clamp(21px, 2vw, 26px);
  font-weight: 940;
  letter-spacing: -0.04em;
  line-height: 1;
}

.alta-ingreso-card.externo .alta-result-main strong {
  background: linear-gradient(90deg, rgba(37, 110, 228, 0.13), rgba(37, 110, 228, 0.04));
  color: #256ee4;
}

.alta-ingreso-card p {
  position: relative;
  margin: 17px 0 10px;
  color: #53627d;
  font-size: 15px;
  font-weight: 590;
  line-height: 1.5;
}

.alta-ingreso-card p :deep(strong) {
  color: #24772d;
  font-weight: 900;
}

.alta-ingreso-card.externo p :deep(strong) {
  color: #256ee4;
}

.alta-ingreso-card small {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #63718d;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.3;
}

.cycle-summary-card {
  display: grid;
  gap: 0;
  margin-top: 17px;
  overflow: hidden;
  border: 1px solid #d7e0ef;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
}

.cycle-summary-card > div {
  display: grid;
  grid-template-columns: 34px 1fr auto;
  align-items: center;
  gap: 14px;
  min-height: 55px;
  padding: 11px 20px;
}

.cycle-summary-card > div + div {
  border-top: 1px solid rgba(215, 224, 239, 0.76);
}

.cycle-summary-card span {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #edf4ff;
  color: #256ee4;
}

.cycle-summary-card > div:nth-child(2) span {
  background: #eaf8ed;
  color: #2f9339;
}

.cycle-summary-card p {
  margin: 0;
  color: #44506a;
  font-size: 14px;
  font-weight: 820;
}

.cycle-summary-card strong {
  color: #256ee4;
  font-size: 17px;
  font-weight: 900;
  text-align: right;
}

.cycle-summary-card > div:nth-child(2) strong {
  color: #24822f;
}

.change-cycle-button,
.older-cycle-toggle {
  display: flex;
  width: 100%;
  min-height: 50px;
  align-items: center;
  gap: 13px;
  margin-top: 15px;
  padding: 0 18px;
  border: 1px solid #d7e0ef;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.84);
  color: #4d5b77;
  font-size: 14px;
  font-weight: 850;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}

.change-cycle-button:hover,
.older-cycle-toggle:hover {
  border-color: rgba(47, 147, 57, 0.38);
  background: #fff;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
}

.change-cycle-button > span {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #edf4ff;
  color: #256ee4;
}

.change-cycle-button strong {
  flex: 1;
  text-align: left;
}

.change-cycle-button svg:last-child,
.older-cycle-toggle svg:last-child {
  transition: transform 0.18s ease;
}

.change-cycle-button svg.open,
.older-cycle-toggle svg.open {
  transform: rotate(180deg);
}

.inline-cycle-picker {
  margin-top: 14px;
  padding: 16px;
  border: 1px solid rgba(215, 224, 239, 0.92);
  border-radius: 18px;
  background: rgba(248, 251, 255, 0.84);
}

.cycle-tile-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.cycle-tile {
  position: relative;
  display: grid;
  min-height: 104px;
  align-content: center;
  justify-items: center;
  gap: 7px;
  border: 1px solid #d7e0ef;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
  color: #16233e;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    background 0.16s ease;
}

.cycle-tile:hover {
  transform: translateY(-1px);
  border-color: rgba(37, 110, 228, 0.38);
  box-shadow: 0 14px 30px rgba(37, 110, 228, 0.08);
}

.cycle-tile.selected {
  border-color: #256ee4;
  box-shadow:
    inset 0 0 0 1px rgba(37, 110, 228, 0.5),
    0 14px 32px rgba(37, 110, 228, 0.12);
}

.cycle-tile.current:not(.selected) {
  border-color: rgba(47, 147, 57, 0.3);
  background: linear-gradient(180deg, #f7fff8, #fff);
}

.cycle-tile strong {
  font-size: 15px;
  font-weight: 920;
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.cycle-tile small {
  color: #256ee4;
  font-size: 12px;
  font-weight: 800;
}

.cycle-tile.current small {
  color: #24822f;
}

.cycle-tile i {
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #f1f5f9;
  color: #63718d;
  font-style: normal;
}

.cycle-tile.selected i {
  background: #edf4ff;
  color: #256ee4;
}

.cycle-tile.current:not(.selected) i {
  background: #eaf8ed;
  color: #2f9339;
}

.cycle-check {
  position: absolute;
  top: -10px;
  right: -10px;
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #256ee4;
  color: #fff;
  box-shadow: 0 12px 22px rgba(37, 110, 228, 0.24);
}

.older-cycle-toggle {
  min-height: 46px;
  justify-content: flex-start;
  margin-top: 12px;
}

.older-cycle-toggle span {
  flex: 1;
  text-align: left;
}

.older-cycle-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.older-cycle-option {
  display: grid;
  min-height: 46px;
  align-content: center;
  gap: 2px;
  border: 1px solid #d7e0ef;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.86);
  color: #16233e;
  font-weight: 850;
}

.older-cycle-option small {
  color: #6b7892;
  font-size: 10px;
  font-weight: 780;
}

.older-cycle-option.selected {
  border-color: #256ee4;
  background: #f4f8ff;
  color: #256ee4;
}

.edit-admin-card {
  display: grid;
  gap: 16px;
  margin-top: 18px;
  padding: 16px;
  border: 1px solid rgba(215, 224, 239, 0.9);
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.76);
}

.student-form-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  min-height: 98px;
  padding: 22px 48px;
  border-top: 1px solid rgba(203, 213, 225, 0.72);
  background: rgba(255, 255, 255, 0.9);
}

.student-form-footer.actions-only {
  justify-content: flex-end;
}

.footer-matricula-strip {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  overflow: hidden;
}

.footer-matricula-strip > div {
  display: grid;
  min-width: 118px;
  gap: 4px;
  padding: 10px 14px;
  border: 1px solid rgba(215, 224, 239, 0.88);
  border-radius: 14px;
  background: rgba(248, 251, 255, 0.72);
}

.footer-matricula-strip span {
  color: #6b7892;
  font-size: 10.5px;
  font-weight: 900;
  letter-spacing: 0.06em;
  line-height: 1;
  text-transform: uppercase;
}

.footer-matricula-strip strong {
  overflow: hidden;
  color: #12213c;
  font-size: 15px;
  font-weight: 920;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.footer-matricula-strip > div:last-child strong {
  color: #2f9339;
}

.footer-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 18px;
}

.student-form-cancel,
.student-form-save {
  display: inline-flex;
  min-width: 168px;
  height: 56px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 900;
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease,
    background 0.16s ease,
    border-color 0.16s ease;
}

.student-form-cancel {
  border: 1px solid #d7e0ef;
  background: #fff;
  color: #44506a;
}

.student-form-save {
  border: 1px solid rgba(47, 147, 57, 0.62);
  background: linear-gradient(180deg, #3caf47, #2f9339);
  color: #fff;
  box-shadow: 0 18px 34px rgba(47, 147, 57, 0.24);
}

.student-form-cancel:hover,
.student-form-save:hover {
  transform: translateY(-1px);
}

.student-form-save:disabled,
.student-form-cancel:disabled {
  cursor: not-allowed;
  opacity: 0.62;
  transform: none;
}

.curp-insights-enter-active,
.curp-insights-leave-active,
.result-card-enter-active,
.result-card-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.curp-insights-enter-from,
.curp-insights-leave-to,
.result-card-enter-from,
.result-card-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.cycle-picker-enter-active,
.cycle-picker-leave-active,
.older-cycles-enter-active,
.older-cycles-leave-active {
  overflow: hidden;
  transition:
    opacity 0.2s ease,
    transform 0.2s ease,
    max-height 0.22s ease;
}

.cycle-picker-enter-from,
.cycle-picker-leave-to,
.older-cycles-enter-from,
.older-cycles-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-4px);
}

.cycle-picker-enter-to,
.cycle-picker-leave-from,
.older-cycles-enter-to,
.older-cycles-leave-from {
  max-height: 520px;
}

@keyframes curp-glow-drift {
  0%, 100% {
    opacity: 0.48;
    transform: translateX(-2%);
  }
  50% {
    opacity: 0.82;
    transform: translateX(2%);
  }
}

@keyframes alta-card-sheen {
  0% {
    opacity: 0.2;
    transform: translateX(-34%);
  }
  38% {
    opacity: 0.72;
  }
  100% {
    opacity: 0.12;
    transform: translateX(34%);
  }
}

@keyframes alta-orb-breathe {
  0%, 100% {
    filter: saturate(1);
    transform: translateY(0);
  }
  50% {
    filter: saturate(1.08);
    transform: translateY(-1px);
  }
}

@media (max-height: 820px) and (min-width: 900px) {
  .student-form-overlay {
    padding-block: 16px;
  }

  .student-form-modal {
    max-height: calc(100dvh - 32px);
  }

  .student-form-hero {
    min-height: 112px;
    padding-block: 22px;
  }

  .student-form-avatar {
    width: 70px;
    height: 70px;
  }

  .student-form-title-copy h2 {
    font-size: 34px;
  }

  .student-form-content {
    padding-block: 26px;
  }

  .field-stack {
    gap: 18px;
  }

  .field-stack.compact {
    gap: 14px;
  }

  .polished-field input,
  .polished-field select {
    height: 50px;
  }

  .alta-ingreso-card {
    margin-top: 16px;
    padding: 18px 20px;
  }

  .student-form-footer {
    min-height: 84px;
    padding-block: 16px;
  }
}

@media (max-width: 1180px) {
  .student-form-modal {
    width: min(980px, calc(100vw - 28px));
  }

  .student-form-grid {
    grid-template-columns: 1fr;
    gap: 34px;
  }
}

@media (max-width: 760px) {
  .student-form-overlay {
    align-items: flex-start;
    padding: 10px;
  }

  .student-form-modal {
    width: 100%;
    max-height: calc(100dvh - 20px);
    border-radius: 24px;
  }

  .student-form-hero {
    min-height: auto;
    gap: 18px;
    padding: 28px 80px 26px 24px;
  }

  .student-form-close {
    top: 22px;
    right: 22px;
    width: 50px;
    height: 50px;
  }

  .student-form-avatar {
    width: 68px;
    height: 68px;
  }

  .student-form-title-copy h2 {
    font-size: 28px;
  }

  .student-form-content {
    padding: 24px 22px;
  }

  .curp-data-grid,
  .two-field-grid,
  .cycle-tile-grid,
  .older-cycle-grid {
    grid-template-columns: 1fr;
  }

  .cycle-summary-card > div {
    grid-template-columns: 34px 1fr;
  }

  .cycle-summary-card strong {
    grid-column: 2;
    justify-self: start;
    text-align: left;
  }

  .student-form-footer {
    flex-direction: column;
    align-items: stretch;
    padding: 20px 22px;
  }

  .footer-matricula-strip {
    display: grid;
    grid-template-columns: 1fr;
  }

  .footer-matricula-strip > div {
    min-width: 0;
  }

  .footer-actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .student-form-cancel,
  .student-form-save {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .curp-card-glow,
  .alta-card-shine,
  .alta-result-orb {
    animation: none;
  }

  .student-form-close,
  .cycle-tile,
  .student-form-cancel,
  .student-form-save,
  .curp-insights-enter-active,
  .curp-insights-leave-active,
  .change-cycle-button,
  .older-cycle-toggle,
  .result-card-enter-active,
  .result-card-leave-active,
  .cycle-picker-enter-active,
  .cycle-picker-leave-active,
  .older-cycles-enter-active,
  .older-cycles-leave-active {
    transition: none;
  }
}
</style>
