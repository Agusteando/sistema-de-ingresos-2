<template>
  <Teleport to="body">
    <div class="student-form-overlay" @click.self="$emit('close')">
      <section class="student-form-modal" role="dialog" aria-modal="true" :aria-labelledby="formTitleId">
        <button class="student-form-close" type="button" aria-label="Cerrar" @click="$emit('close')">
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
                    <input v-model="form.apellidoPaterno" type="text" placeholder="Ingresa el apellido paterno" required @blur="normalizeNameField('apellidoPaterno')" />
                  </label>

                  <label class="polished-field">
                    <span>A. materno</span>
                    <input v-model="form.apellidoMaterno" type="text" placeholder="Ingresa el apellido materno" required @blur="normalizeNameField('apellidoMaterno')" />
                  </label>

                  <label class="polished-field">
                    <span>Nombre(s)</span>
                    <input v-model="form.nombres" type="text" placeholder="Ingresa el o los nombres" required @blur="normalizeNameField('nombres')" />
                  </label>

                  <div class="two-field-grid">
                    <label class="polished-field">
                      <span>Nacimiento</span>
                      <input v-model="form.birth" type="date" required />
                    </label>
                    <label class="polished-field select-field">
                      <span>Género</span>
                      <select v-model="form.genero" required>
                        <option value="1">Masculino</option>
                        <option value="0">Femenino</option>
                      </select>
                      <LucideChevronDown :size="18" aria-hidden="true" />
                    </label>
                  </div>
                </div>

                <div class="section-divider"></div>

                <div class="section-heading amber">
                  <span aria-hidden="true"><LucideUsersRound :size="24" /></span>
                  <h3>3. Contacto familiar</h3>
                </div>

                <div class="field-stack compact">
                  <label class="polished-field">
                    <span>Padre/Tutor</span>
                    <input v-model="form.padre" type="text" placeholder="Ingresa el nombre completo" required @blur="normalizeNameField('padre')" />
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
                  <h3 id="academic-title">2. Información académica</h3>
                </div>

                <div class="field-stack compact">
                  <label class="polished-field select-field">
                    <span>Plantel</span>
                    <select v-model="form.plantel" required>
                      <option v-for="p in PLANTELES_LIST" :key="p" :value="p">Plantel {{ p }}</option>
                    </select>
                    <LucideChevronDown :size="18" aria-hidden="true" />
                  </label>

                  <div class="two-field-grid">
                    <label class="polished-field readonly-field">
                      <span>Nivel</span>
                      <input type="text" :value="derivedNivel" disabled />
                    </label>
                    <label class="polished-field select-field">
                      <span>Grado</span>
                      <select v-model="form.grado" required>
                        <option v-for="g in availableGrades" :key="g" :value="g">{{ g }}</option>
                      </select>
                      <LucideChevronDown :size="18" aria-hidden="true" />
                    </label>
                  </div>

                  <label class="polished-field select-field">
                    <span>Grupo</span>
                    <select v-model="form.grupo" required>
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

          <footer class="student-form-footer">
            <div class="footer-note">
              <span aria-hidden="true"><LucideShieldCheck :size="23" /></span>
              <p>El alta usa el ciclo seleccionado como ciclo de ingreso del alumno.</p>
            </div>
            <div class="footer-actions">
              <button class="student-form-cancel" type="button" :disabled="loading" @click="$emit('close')">Cancelar</button>
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
import { computed, ref, onMounted, watch } from 'vue'
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
import { PLANTELES_LIST } from '~/utils/constants'
import { useState, useCookie } from '#app'
import { useToast } from '~/composables/useToast'
import { useScrollLock } from '~/composables/useScrollLock'
import { normalizeCicloKey, formatCicloLabel } from '~/shared/utils/ciclo'
import { displayGrado, gradeOptionsForPlantel, nivelFromPlantel } from '~/shared/utils/grado'
import { formatTipoIngresoValue, resolveTipoIngreso } from '~/shared/utils/tipoIngreso'

const props = defineProps({ student: Object })
const emit = defineEmits(['close', 'success'])
const state = useState('globalState')
const { show } = useToast()

useScrollLock()

const activePlantel = useCookie('auth_active_plantel').value || 'PT'
const defaultPlantel = activePlantel === 'GLOBAL' ? 'PT' : activePlantel
const isEdit = !!props.student
const loading = ref(false)
const showCyclePicker = ref(false)
const showOlderCycles = ref(false)
const cycleChangedByUser = ref(false)
const formTitleId = `student-form-title-${Math.random().toString(36).slice(2, 8)}`

const currentCicloKey = computed(() => normalizeCicloKey(state.value.ciclo))
const currentCicloLabel = computed(() => formatCicloLabel(currentCicloKey.value))

const form = ref({
  matricula: '', apellidoPaterno: '', apellidoMaterno: '', nombres: '',
  birth: '', genero: '1', plantel: defaultPlantel, nivel: nivelFromPlantel(defaultPlantel), grado: 'Primero', grupo: 'A',
  padre: '', telefono: '', correo: '', ciclo: currentCicloKey.value, estatus: 'Activo',
  matriculaAnterior: '', matriculaSiguiente: ''
})

const originalAcademic = ref({
  plantel: defaultPlantel,
  grado: 'Primero',
  ciclo: currentCicloKey.value
})

const derivedNivel = computed(() => nivelFromPlantel(form.value.plantel))
const availableGrades = computed(() => gradeOptionsForPlantel(form.value.plantel))
const ingresoCicloLabel = computed(() => formatCicloLabel(form.value.ciclo))

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
    grado: displayGrado(form.value.grado || 'Primero').toLowerCase(),
    ciclo: normalizeCicloKey(form.value.ciclo)
  }

  return current.plantel !== originalAcademic.value.plantel ||
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

watch(() => form.value.plantel, () => {
  form.value.nivel = derivedNivel.value
  const selected = availableGrades.value.find(g => g.toLowerCase() === String(form.value.grado || '').toLowerCase())
  form.value.grado = selected || availableGrades.value[0]
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
      birth: s.birth ? s.birth.split('T')[0] : '',
      genero: s.genero || '1',
      plantel: s.plantel || defaultPlantel,
      nivel: nivelFromPlantel(s.plantel || defaultPlantel),
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
      grado: displayGrado(form.value.grado || 'Primero'),
      ciclo: normalizeCicloKey(form.value.ciclo)
    }
  }
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

const normalizeNameField = (field) => {
  form.value[field] = toNameCase(form.value[field])
}

const trimField = (field) => {
  form.value[field] = String(form.value[field] || '').trim()
}

const normalizeEmailField = () => {
  form.value.correo = String(form.value.correo || '').trim().toLowerCase()
}

const normalizeNamesBeforeSubmit = () => {
  ;['apellidoPaterno', 'apellidoMaterno', 'nombres', 'padre'].forEach(normalizeNameField)
  trimField('telefono')
  normalizeEmailField()
}

const submit = async () => {
  loading.value = true
  try {
    normalizeNamesBeforeSubmit()
    const cicloKey = normalizeCicloKey(form.value.ciclo || currentCicloKey.value)
    const url = isEdit ? `/api/students/${form.value.matricula}` : '/api/students'
    const method = isEdit ? 'PUT' : 'POST'
    await $fetch(url, {
      method,
      body: {
        ...form.value,
        nivel: derivedNivel.value,
        ciclo: cicloKey,
        academicChanged: academicChanged.value
      }
    })
    show(isEdit ? 'Alumno actualizado correctamente' : 'Alumno registrado exitosamente', 'success')
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
  padding: clamp(18px, 3.4vh, 42px);
  background: rgba(15, 23, 42, 0.34);
  backdrop-filter: blur(14px) saturate(1.04);
  overflow: auto;
}

.student-form-modal {
  position: relative;
  width: min(1600px, calc(100vw - 48px));
  max-height: min(980px, calc(100vh - 44px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(203, 213, 225, 0.92);
  border-radius: 34px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(248, 251, 255, 0.96)),
    #fff;
  box-shadow: 0 36px 96px rgba(15, 23, 42, 0.26), 0 12px 28px rgba(15, 23, 42, 0.12);
  font-family: var(--students-font, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  color: #12213c;
}

.student-form-close {
  position: absolute;
  top: 46px;
  right: 54px;
  z-index: 4;
  width: 64px;
  height: 64px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(203, 213, 225, 0.82);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  color: #0f1d35;
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.13);
  transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
}

.student-form-close:hover {
  transform: translateY(-1px);
  background: #fff;
  box-shadow: 0 22px 48px rgba(15, 23, 42, 0.18);
}

.student-form-hero {
  position: relative;
  min-height: 154px;
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 34px 112px 32px 54px;
  border-bottom: 1px solid rgba(203, 213, 225, 0.72);
  overflow: hidden;
  background: linear-gradient(112deg, rgba(255, 255, 255, 0.98), rgba(241, 247, 255, 0.9) 55%, rgba(228, 246, 233, 0.92));
}

.student-form-hero-veil,
.student-form-hero-curve {
  position: absolute;
  pointer-events: none;
}

.student-form-hero-veil {
  inset: 0;
  background:
    radial-gradient(circle at 28% -50%, rgba(59, 130, 246, 0.12), transparent 44%),
    radial-gradient(circle at 78% -24%, rgba(47, 147, 57, 0.16), transparent 45%);
}

.student-form-hero-curve {
  left: 44%;
  right: -4%;
  height: 124px;
  border-radius: 0 0 100% 100%;
  transform: rotate(-5deg);
  opacity: 0.92;
}

.student-form-hero-curve.blue {
  top: -76px;
  background: linear-gradient(90deg, rgba(58, 139, 226, 0.13), rgba(255, 255, 255, 0));
}

.student-form-hero-curve.green {
  top: 22px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(87, 180, 103, 0.24));
}

.student-form-avatar {
  position: relative;
  z-index: 1;
  width: 88px;
  height: 88px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 4px solid rgba(255, 255, 255, 0.94);
  border-radius: 999px;
  background: linear-gradient(145deg, #f7fff8, #ffffff);
  color: #2f9339;
  box-shadow: 0 18px 44px rgba(47, 147, 57, 0.14), inset 0 0 0 1px rgba(47, 147, 57, 0.16);
  font-size: 24px;
  font-weight: 900;
}

.student-form-title-copy {
  position: relative;
  z-index: 1;
}

.student-form-title-copy h2 {
  margin: 0;
  color: #12213c;
  font-size: clamp(30px, 3.4vw, 42px);
  line-height: 1.02;
  letter-spacing: -0.055em;
  font-weight: 930;
}

.student-form-title-copy p {
  margin: 8px 0 0;
  color: #60708d;
  font-size: 15.5px;
  font-weight: 650;
}

.student-form-content {
  overflow: auto;
  padding: 34px 46px 34px;
}

.student-edit-strip {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
  text-transform: uppercase;
  letter-spacing: .06em;
}

.student-edit-strip strong {
  display: block;
  color: #2f9339;
  font-size: 18px;
  font-weight: 900;
}

.student-status-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
}

.student-status-chip.active {
  color: #24772d;
  background: #eaf8ed;
  border: 1px solid #bde7c4;
}

.student-status-chip.inactive {
  color: #be123c;
  background: #fff1f2;
  border: 1px solid #fecdd3;
}

.student-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(420px, 1fr);
  gap: 56px;
}

.form-panel {
  min-width: 0;
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 22px;
}

.section-heading > span {
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
}

.section-heading h3 {
  margin: 0;
  font-size: 20px;
  line-height: 1;
  font-weight: 900;
  letter-spacing: -0.02em;
}

.section-heading.green { color: #24822f; }
.section-heading.green > span { background: #eaf8ed; box-shadow: inset 0 0 0 1px rgba(47, 147, 57, .12); }
.section-heading.blue { color: #256ee4; }
.section-heading.blue > span { background: #edf4ff; box-shadow: inset 0 0 0 1px rgba(37, 110, 228, .12); }
.section-heading.amber { color: #e27d00; }
.section-heading.amber > span { background: #fff7ed; box-shadow: inset 0 0 0 1px rgba(226, 125, 0, .12); }

.field-stack {
  display: grid;
  gap: 24px;
}

.field-stack.compact {
  gap: 18px;
}

.two-field-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 28px;
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
  height: 56px;
  appearance: none;
  border: 1px solid #d7e0ef;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.93);
  color: #15233e;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, .025), 0 1px 0 rgba(255, 255, 255, .9);
  font: inherit;
  font-size: 16px;
  font-weight: 650;
  outline: none;
  padding: 0 18px;
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

.polished-field input::placeholder {
  color: #9aabc3;
}

.polished-field input:focus,
.polished-field select:focus {
  border-color: rgba(47, 147, 57, .62);
  box-shadow: 0 0 0 4px rgba(47, 147, 57, .12);
  background: #fff;
}

.readonly-field input:disabled {
  color: #8996ac;
  background: #f8fafc;
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
  margin: 34px 0 24px;
  background: linear-gradient(90deg, rgba(203, 213, 225, 0), rgba(203, 213, 225, .88), rgba(203, 213, 225, 0));
}

.alta-ingreso-card {
  position: relative;
  overflow: hidden;
  margin-top: 22px;
  padding: 22px 24px 21px;
  border-radius: 16px;
  border: 1px solid rgba(95, 177, 109, .48);
  background:
    linear-gradient(145deg, rgba(247, 255, 248, .94), rgba(255, 255, 255, .96)),
    #fff;
  box-shadow: 0 16px 44px rgba(47, 147, 57, .09);
}

.alta-ingreso-card.externo {
  border-color: rgba(74, 144, 226, .36);
  background: linear-gradient(145deg, rgba(245, 250, 255, .96), rgba(255, 255, 255, .97));
  box-shadow: 0 16px 44px rgba(74, 144, 226, .08);
}

.alta-card-shine {
  position: absolute;
  inset: -35% -45%;
  background: linear-gradient(112deg, transparent 28%, rgba(255,255,255,.72) 46%, transparent 62%);
  transform: translateX(-34%);
  opacity: .68;
  animation: alta-card-sheen 2700ms cubic-bezier(.22, .61, .36, 1) infinite;
}

.alta-card-kicker {
  position: relative;
  color: #24772d;
  font-size: 16px;
  font-weight: 900;
  margin-bottom: 12px;
}

.alta-ingreso-card.externo .alta-card-kicker { color: #256ee4; }

.alta-result-main {
  position: relative;
  display: flex;
  align-items: center;
  gap: 20px;
}

.alta-result-orb {
  width: 58px;
  height: 58px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: #fff;
  background: linear-gradient(145deg, #46b052, #2f9339);
  box-shadow: 0 17px 32px rgba(47, 147, 57, .25), inset 0 0 0 4px rgba(255,255,255,.2);
  animation: alta-orb-breathe 2400ms ease-in-out infinite;
}

.alta-ingreso-card.externo .alta-result-orb {
  background: linear-gradient(145deg, #5a9cf0, #256ee4);
  box-shadow: 0 17px 32px rgba(37, 110, 228, .22), inset 0 0 0 4px rgba(255,255,255,.22);
}

.alta-result-main strong {
  display: inline-flex;
  align-items: center;
  min-height: 48px;
  padding: 0 24px;
  border-radius: 999px;
  color: #2f9339;
  background: linear-gradient(90deg, rgba(47, 147, 57, .13), rgba(47, 147, 57, .04));
  font-size: clamp(21px, 2.1vw, 26px);
  font-weight: 940;
  letter-spacing: -0.04em;
}

.alta-ingreso-card.externo .alta-result-main strong {
  color: #256ee4;
  background: linear-gradient(90deg, rgba(37, 110, 228, .13), rgba(37, 110, 228, .04));
}

.alta-ingreso-card p {
  position: relative;
  margin: 18px 0 10px;
  color: #53627d;
  font-size: 15.5px;
  line-height: 1.5;
  font-weight: 590;
}

.alta-ingreso-card p :deep(strong) {
  color: #24772d;
  font-weight: 900;
}

.alta-ingreso-card.externo p :deep(strong) { color: #256ee4; }

.alta-ingreso-card small {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #63718d;
  font-size: 14px;
  line-height: 1.3;
  font-weight: 650;
}

.cycle-summary-card {
  display: grid;
  gap: 0;
  margin-top: 18px;
  border: 1px solid #d7e0ef;
  border-radius: 16px;
  background: rgba(255,255,255,.92);
  overflow: hidden;
}

.cycle-summary-card > div {
  display: grid;
  grid-template-columns: 34px 1fr auto;
  align-items: center;
  gap: 14px;
  min-height: 57px;
  padding: 12px 20px;
}

.cycle-summary-card > div + div {
  border-top: 1px solid rgba(215, 224, 239, .76);
}

.cycle-summary-card span {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: #256ee4;
  background: #edf4ff;
}

.cycle-summary-card > div:nth-child(2) span {
  color: #2f9339;
  background: #eaf8ed;
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

.cycle-summary-card > div:nth-child(2) strong { color: #24822f; }

.change-cycle-button,
.older-cycle-toggle {
  width: 100%;
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 13px;
  margin-top: 16px;
  padding: 0 18px;
  border: 1px solid #d7e0ef;
  border-radius: 14px;
  background: rgba(255,255,255,.82);
  color: #4d5b77;
  font-size: 14px;
  font-weight: 850;
  transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

.change-cycle-button:hover,
.older-cycle-toggle:hover {
  border-color: rgba(47, 147, 57, .38);
  background: #fff;
  box-shadow: 0 10px 24px rgba(15, 23, 42, .05);
}

.change-cycle-button > span {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: #256ee4;
  background: #edf4ff;
}

.change-cycle-button strong { flex: 1; text-align: left; }
.change-cycle-button svg:last-child,
.older-cycle-toggle svg:last-child { transition: transform 180ms ease; }
.change-cycle-button svg.open,
.older-cycle-toggle svg.open { transform: rotate(180deg); }

.inline-cycle-picker {
  margin-top: 14px;
  padding: 16px;
  border: 1px solid rgba(215, 224, 239, .92);
  border-radius: 18px;
  background: rgba(248, 251, 255, .84);
}

.cycle-tile-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.cycle-tile {
  position: relative;
  min-height: 112px;
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 7px;
  border: 1px solid #d7e0ef;
  border-radius: 16px;
  background: rgba(255,255,255,.9);
  color: #16233e;
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

.cycle-tile:hover {
  transform: translateY(-1px);
  border-color: rgba(37, 110, 228, .38);
  box-shadow: 0 14px 30px rgba(37, 110, 228, .08);
}

.cycle-tile.selected {
  border-color: #256ee4;
  box-shadow: inset 0 0 0 1px rgba(37, 110, 228, .5), 0 14px 32px rgba(37, 110, 228, .12);
}

.cycle-tile.current:not(.selected) {
  border-color: rgba(47, 147, 57, .3);
  background: linear-gradient(180deg, #f7fff8, #fff);
}

.cycle-tile strong {
  font-size: 15.5px;
  font-weight: 920;
  letter-spacing: -0.02em;
}

.cycle-tile small {
  color: #256ee4;
  font-size: 12px;
  font-weight: 800;
}

.cycle-tile.current small { color: #24822f; }

.cycle-tile i {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: #63718d;
  background: #f1f5f9;
  font-style: normal;
}

.cycle-tile.selected i {
  color: #256ee4;
  background: #edf4ff;
}

.cycle-tile.current:not(.selected) i {
  color: #2f9339;
  background: #eaf8ed;
}

.cycle-check {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: #fff;
  background: #256ee4;
  box-shadow: 0 12px 22px rgba(37, 110, 228, .24);
}

.older-cycle-toggle {
  margin-top: 12px;
  min-height: 46px;
  justify-content: flex-start;
}

.older-cycle-toggle span { flex: 1; text-align: left; }

.older-cycle-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.older-cycle-option {
  min-height: 46px;
  display: grid;
  align-content: center;
  gap: 2px;
  border: 1px solid #d7e0ef;
  border-radius: 12px;
  background: rgba(255,255,255,.86);
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
  color: #256ee4;
  background: #f4f8ff;
}

.edit-admin-card {
  display: grid;
  gap: 16px;
  margin-top: 18px;
  padding: 16px;
  border: 1px solid rgba(215, 224, 239, .9);
  border-radius: 18px;
  background: rgba(248, 250, 252, .76);
}

.student-form-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  min-height: 112px;
  padding: 24px 54px;
  border-top: 1px solid rgba(203, 213, 225, .72);
  background: rgba(255,255,255,.88);
}

.footer-note {
  display: flex;
  align-items: center;
  gap: 17px;
  color: #60708d;
  min-width: 0;
}

.footer-note > span {
  width: 54px;
  height: 54px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: #2f9339;
  background: #eaf8ed;
}

.footer-note p {
  margin: 0;
  font-size: 14.5px;
  font-weight: 660;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 18px;
}

.student-form-cancel,
.student-form-save {
  min-width: 168px;
  height: 58px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 900;
  transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease, border-color 160ms ease;
}

.student-form-cancel {
  border: 1px solid #d7e0ef;
  background: #fff;
  color: #44506a;
}

.student-form-save {
  border: 1px solid rgba(47, 147, 57, .62);
  color: #fff;
  background: linear-gradient(180deg, #3caf47, #2f9339);
  box-shadow: 0 18px 34px rgba(47, 147, 57, .24);
}

.student-form-cancel:hover,
.student-form-save:hover {
  transform: translateY(-1px);
}

.student-form-save:disabled,
.student-form-cancel:disabled {
  opacity: .62;
  cursor: not-allowed;
  transform: none;
}

.result-card-enter-active,
.result-card-leave-active {
  transition: opacity 220ms ease, transform 220ms ease;
}

.result-card-enter-from,
.result-card-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.cycle-picker-enter-active,
.cycle-picker-leave-active,
.older-cycles-enter-active,
.older-cycles-leave-active {
  transition: opacity 200ms ease, transform 200ms ease, max-height 220ms ease;
  overflow: hidden;
}

.cycle-picker-enter-from,
.cycle-picker-leave-to,
.older-cycles-enter-from,
.older-cycles-leave-to {
  opacity: 0;
  transform: translateY(-4px);
  max-height: 0;
}

.cycle-picker-enter-to,
.cycle-picker-leave-from,
.older-cycles-enter-to,
.older-cycles-leave-from {
  max-height: 520px;
}

@keyframes alta-card-sheen {
  0% { transform: translateX(-34%); opacity: .2; }
  38% { opacity: .72; }
  100% { transform: translateX(34%); opacity: .12; }
}

@keyframes alta-orb-breathe {
  0%, 100% { transform: translateY(0); filter: saturate(1); }
  50% { transform: translateY(-1px); filter: saturate(1.08); }
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
    padding: 10px;
    align-items: flex-start;
  }

  .student-form-modal {
    width: 100%;
    max-height: calc(100vh - 20px);
    border-radius: 24px;
  }

  .student-form-hero {
    min-height: auto;
    padding: 28px 80px 26px 24px;
    gap: 18px;
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

  .two-field-grid,
  .cycle-tile-grid,
  .older-cycle-grid {
    grid-template-columns: 1fr;
  }

  .student-form-footer {
    flex-direction: column;
    align-items: stretch;
    padding: 20px 22px;
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
  .alta-card-shine,
  .alta-result-orb {
    animation: none;
  }

  .student-form-close,
  .cycle-tile,
  .student-form-cancel,
  .student-form-save,
  .change-cycle-button,
  .older-cycle-toggle {
    transition: none;
  }
}
</style>
