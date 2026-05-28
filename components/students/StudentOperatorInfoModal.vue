<template>
  <Teleport to="body">
    <div class="operator-info-backdrop" role="dialog" aria-modal="true" @click.self="$emit('close')">
      <section class="operator-info-modal" aria-label="Ver información de alumno">
        <header class="operator-info-header">
          <div class="operator-info-heading">
            <span>Vista de operador</span>
            <h2>Expediente del alumno</h2>
            <p>Consulta de solo lectura del expediente completo del alumno.</p>
          </div>

          <div class="operator-info-actions">
            <button type="button" class="operator-action" :disabled="loading" @click="loadDetail({ bypassCache: true })">
              <LucideRefreshCw :size="18" :class="{ spinning: loading }" />
              Actualizar
            </button>
            <button type="button" class="operator-action" @click="copyMatricula">
              <LucideCopy :size="18" />
              {{ copied ? 'Copiada' : 'Copiar matrícula' }}
            </button>
            <button type="button" class="operator-close" aria-label="Cerrar información de alumno" @click="$emit('close')">
              <LucideX :size="24" />
            </button>
          </div>
        </header>

        <div v-if="error" :class="['operator-alert', readyToRender ? 'warning' : 'error']">
          <LucideAlertTriangle :size="16" />
          <span>{{ error }}</span>
        </div>

        <div v-if="readyToRender" class="operator-hero">
          <div class="operator-avatar" aria-hidden="true">
            <span>{{ initials }}</span>
          </div>

          <div class="operator-hero-main">
            <h3>{{ fullName }}</h3>
            <div class="operator-chips">
              <span class="chip matricula">{{ safeMatricula }}</span>
              <span :class="['chip', expedienteComplete ? 'complete' : 'pending']"><LucideCheckCircle2 :size="15" /> {{ sourceLabel }}</span>
            </div>
            <div class="operator-progress-mini" :aria-label="`Expediente ${expedienteProgress}% completo`">
              <span><b>{{ expedienteProgress }}%</b> completo</span>
              <i><em :style="{ width: `${expedienteProgress}%` }"></em></i>
            </div>
          </div>

          <div class="operator-academic-strip">
            <div>
              <strong>{{ displayNivel }}</strong>
              <small>Nivel</small>
            </div>
            <div>
              <strong>{{ displayGrado }}</strong>
              <small>Grado</small>
            </div>
            <div>
              <strong>{{ displayGrupo }}</strong>
              <small>Grupo</small>
            </div>
          </div>

          <div class="operator-service-pill">
            <LucideBadgeCheck :size="15" />
            {{ displayServiceBadge }}
            <span>Servicio</span>
          </div>

          <span class="operator-watermark" aria-hidden="true">{{ initials }}</span>
        </div>

        <div v-if="!readyToRender && !error" class="operator-loading-stage" aria-live="polite">
          <div class="operator-loading-copy">
            <span class="operator-spinner large" aria-hidden="true"></span>
            <div>
              <strong>Preparando expediente completo</strong>
              <p>Estamos cargando los datos del alumno. La información aparecerá cuando esté lista.</p>
            </div>
          </div>
          <div class="operator-skeleton-hero">
            <span class="skeleton-avatar"></span>
            <div class="skeleton-lines">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
          <div class="operator-skeleton-grid">
            <span v-for="index in 4" :key="index" class="operator-skeleton-panel"></span>
          </div>
        </div>

        <div v-if="readyToRender" class="operator-grid">
          <article class="operator-panel summary-panel">
            <h4><LucideGraduationCap :size="21" /> Resumen escolar</h4>
            <div class="summary-grid">
              <div v-for="item in schoolSummary" :key="item.label" class="summary-tile">
                <span class="summary-icon"><component :is="item.icon" :size="22" /></span>
                <div>
                  <small>{{ item.label }}</small>
                  <strong>{{ item.value }}</strong>
                </div>
              </div>
            </div>
          </article>

          <article class="operator-panel identity-panel">
            <h4><LucideUserRound :size="21" /> Identidad</h4>
            <dl class="info-table">
              <div v-for="row in identityRows" :key="row.label">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            </dl>
          </article>

          <article class="operator-panel family-panel">
            <h4><LucideUsersRound :size="21" /> Familia</h4>
            <div class="family-grid">
              <section :class="['family-card', { complete: fatherComplete }]">
                <h5><LucideUsersRound :size="19" /> Padre</h5>
                <dl>
                  <div><dt>Nombre</dt><dd>{{ fatherName }}</dd></div>
                  <div><dt>Teléfono</dt><dd :class="{ invalid: fatherPhoneInvalid }">{{ fatherPhone }}</dd></div>
                  <div><dt>Email</dt><dd :class="{ invalid: fatherEmailInvalid }">{{ fatherEmail }}</dd></div>
                  <div><dt>Ocupación</dt><dd>{{ parentOccupation }}</dd></div>
                </dl>
              </section>
              <section :class="['family-card', { complete: motherComplete }]">
                <h5><LucideUsersRound :size="19" /> Madre</h5>
                <dl>
                  <div><dt>Nombre</dt><dd>{{ motherName }}</dd></div>
                  <div><dt>Teléfono</dt><dd :class="{ invalid: motherPhoneInvalid }">{{ motherPhone }}</dd></div>
                  <div><dt>Email</dt><dd :class="{ invalid: motherEmailInvalid }">{{ motherEmail }}</dd></div>
                  <div><dt>Ocupación</dt><dd>{{ motherOccupation }}</dd></div>
                </dl>
              </section>
            </div>
            <div class="soft-note">
              <LucideInfo :size="16" />
              Un contacto familiar se considera completo solo con nombre, teléfono de 10 dígitos y email válido.
            </div>
          </article>

          <article class="operator-panel sync-panel">
            <h4><LucideRefreshCw :size="21" /> Registro del expediente</h4>
            <dl class="info-table sync-table">
              <div v-for="row in syncRows" :key="row.label">
                <dt>{{ row.label }}</dt>
                <dd>
                  <span v-if="row.kind === 'status'" class="sync-pill"><LucideCheckCircle2 :size="14" /> {{ row.value }}</span>
                  <span v-else>{{ row.value }}</span>
                </dd>
              </div>
            </dl>
            <div class="readonly-note">
              <LucideInfo :size="16" />
              Este expediente es de solo lectura y refleja la información consolidada.
            </div>
          </article>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  LucideAlertTriangle,
  LucideBadgeCheck,
  LucideBookOpen,
  LucideBuilding2,
  LucideCheckCircle2,
  LucideCopy,
  LucideDatabase,
  LucideGraduationCap,
  LucideInfo,
  LucideMail,
  LucideRefreshCw,
  LucideSchool,
  LucideShieldCheck,
  LucideUserRound,
  LucideUsersRound,
  LucideX
} from 'lucide-vue-next'

const props = defineProps({
  student: { type: Object, required: true }
})

defineEmits(['close'])

const detail = ref(null)
const loading = ref(false)
const error = ref('')
const copied = ref(false)
let requestId = 0
let copyTimer = null

const displayText = (value) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  if (Array.isArray(value)) return value.map(displayText).filter(Boolean).join(' / ')
  if (typeof value === 'object') {
    for (const key of ['label', 'nombre', 'name', 'value', 'servicio', 'descripcion', 'description', 'text', 'title']) {
      const text = displayText(value?.[key])
      if (text) return text
    }
    return ''
  }
  return ''
}
const hasValue = (value) => displayText(value) !== ''
const firstValue = (...values) => values.map(displayText).find(Boolean) || ''
const fallbackText = (value, fallback = 'Sin registrar') => hasValue(value) ? displayText(value) : fallback
const titleCase = (value) => {
  const text = displayText(value)
  if (!text) return ''
  return text.toLocaleLowerCase('es-MX').replace(/(^|\s|\/|-)(\p{L})/gu, (_, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('es-MX')}`)
}

const OPERATOR_DETAIL_CACHE_PREFIX = 'student-operator-detail:v4:'
const OPERATOR_DETAIL_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000

const localStudentSnapshot = () => {
  const base = props.student || {}
  return {
    ...base,
    ...(base.centralMatricula || {}),
    matricula: firstValue(base.matricula, base.centralMatricula?.matricula)
  }
}

const operatorCacheKey = computed(() => `${OPERATOR_DETAIL_CACHE_PREFIX}${safeMatricula.value}`)

const readCachedDetail = () => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage?.getItem(operatorCacheKey.value) || window.sessionStorage?.getItem(operatorCacheKey.value)
    if (!raw) return null
    const payload = JSON.parse(raw)
    if (!payload || typeof payload.updatedAt !== 'number' || !payload.detail) return null
    if (Date.now() - payload.updatedAt > OPERATOR_DETAIL_CACHE_MAX_AGE_MS) {
      window.localStorage?.removeItem(operatorCacheKey.value); window.sessionStorage?.removeItem(operatorCacheKey.value)
      return null
    }
    return payload.detail
  } catch (_) {
    return null
  }
}

const writeCachedDetail = (value) => {
  if (typeof window === 'undefined' || !value) return
  try {
    window.localStorage?.setItem(operatorCacheKey.value, JSON.stringify({ updatedAt: Date.now(), detail: value }))
  } catch (_) {}
}

const loadDetail = async (options = {}) => {
  const matricula = String(props.student?.matricula || props.student?.centralMatricula?.matricula || '').trim()
  if (!matricula) return

  const fallbackDetail = localStudentSnapshot()
  if (!detail.value) detail.value = fallbackDetail

  const bypassCache = Boolean(options?.bypassCache)
  if (!bypassCache) {
    const cached = readCachedDetail()
    if (cached) {
      detail.value = { ...fallbackDetail, ...cached }
      error.value = ''
      loading.value = false
      return
    }
  }

  const currentId = ++requestId
  loading.value = true
  error.value = ''

  try {
    const response = await $fetch('/api/students/matricula-overlays', {
      method: 'POST',
      body: { matriculas: [matricula] }
    })
    if (currentId !== requestId) return
    const overlayStudent = (response?.overlays || [])
      .map((item) => item?.student)
      .find((item) => String(item?.matricula || '').trim().toUpperCase() === matricula.toUpperCase())
    const nextDetail = overlayStudent
      ? { ...fallbackDetail, ...overlayStudent, centralMatricula: overlayStudent }
      : fallbackDetail
    detail.value = nextDetail
    if (overlayStudent) writeCachedDetail(nextDetail)
    if (!overlayStudent && response?.ok === false) {
      error.value = 'No se pudo actualizar el enriquecimiento; se muestran los datos disponibles.'
    }
  } catch (err) {
    if (currentId !== requestId) return
    detail.value = detail.value || fallbackDetail
    error.value = 'No se pudo actualizar el enriquecimiento; se muestran los datos disponibles.'
    writeCachedDetail(detail.value)
  } finally {
    if (currentId === requestId) loading.value = false
  }
}

const source = computed(() => ({ ...(props.student || {}), ...(props.student?.centralMatricula || {}), ...(detail.value || {}) }))

const safeMatricula = computed(() => fallbackText(firstValue(source.value.matricula, props.student?.matricula), 'Sin matrícula'))
const fullName = computed(() => fallbackText(firstValue(source.value.fullName, source.value.nombreCompleto, source.value.nombre, props.student?.nombre), 'Alumno'))
const displayNivel = computed(() => titleCase(firstValue(source.value.nivel, props.student?.nivel)) || 'Nivel')
const displayGrado = computed(() => titleCase(firstValue(source.value.grado, props.student?.grado)) || 'Grado')
const displayGrupo = computed(() => {
  const group = firstValue(source.value.group, source.value.grupo, props.student?.grupo)
  return group ? `Grupo ${String(group).replace(/^grupo\s+/i, '')}` : 'Grupo'
})
const displayServicio = computed(() => titleCase(firstValue(source.value.servicio, source.value.program, source.value.nivel, props.student?.servicio)))
const displayServiceBadge = computed(() => titleCase(firstValue(source.value.tipoIngreso, source.value.tipo_ingreso, source.value.ingreso, props.student?.tipoIngreso, 'Externo')))
const sourceLabel = computed(() => expedienteComplete.value ? 'Expediente completo' : `Expediente ${expedienteProgress.value}% completo`)
const readyToRender = computed(() => Boolean(firstValue(source.value.matricula, props.student?.matricula)))

const initials = computed(() => {
  const paternal = firstValue(source.value.apellidoPaterno, source.value.apellido_paterno)
  const maternal = firstValue(source.value.apellidoMaterno, source.value.apellido_materno)
  if (paternal || maternal) return `${String(paternal || '').charAt(0)}${String(maternal || '').charAt(0)}`.toUpperCase() || 'AL'
  const parts = fullName.value.split(/\s+/).filter(Boolean)
  return `${parts[0]?.charAt(0) || 'A'}${parts[1]?.charAt(0) || 'L'}`.toUpperCase()
})

const identityRows = computed(() => [
  { label: 'Matrícula', value: safeMatricula.value },
  { label: 'CURP', value: fallbackText(firstValue(source.value.curp, source.value.CURP)) },
  { label: 'Nombre completo', value: fullName.value },
  { label: 'Apellido paterno', value: fallbackText(firstValue(source.value.apellidoPaterno, source.value.apellido_paterno)) },
  { label: 'Apellido materno', value: fallbackText(firstValue(source.value.apellidoMaterno, source.value.apellido_materno)) },
  { label: 'Nombre(s)', value: fallbackText(source.value.nombres) }
])

const schoolSummary = computed(() => [
  { label: 'Plantel', value: fallbackText(firstValue(source.value.plantel, source.value.basePlantel)), icon: LucideBuilding2 },
  { label: 'Nivel', value: fallbackText(displayNivel.value), icon: LucideBookOpen },
  { label: 'Grado', value: fallbackText(displayGrado.value), icon: LucideSchool },
  { label: 'Grupo', value: fallbackText(firstValue(source.value.group, source.value.grupo)), icon: LucideUsersRound },
  { label: 'Servicio', value: fallbackText(displayServicio.value), icon: LucideBadgeCheck },
  { label: 'Interno', value: fallbackText(source.value.interno), icon: LucideDatabase },

])

const phoneDigits = (value) => displayText(value).replace(/\D/g, '')
const validPhone = (value) => phoneDigits(value).length >= 10
const normalizedEmail = (value) => displayText(value).toLowerCase()
const validFamilyEmail = (value) => {
  const email = normalizedEmail(value)
  if (!email || email.includes('@casita')) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
const joinedName = (...values) => values.map(displayText).filter(Boolean).join(' ')
const fatherNameRaw = computed(() => firstValue(
  joinedName(source.value.nombrePadre, source.value.apellidoPaternoPadre, source.value.apellidoMaternoPadre),
  source.value.fatherName,
  source.value.nombrePadreCompleto,
  source.value.padre
))
const motherNameRaw = computed(() => firstValue(
  joinedName(source.value.nombreMadre, source.value.apellidoPaternoMadre, source.value.apellidoMaternoMadre),
  source.value.motherName,
  source.value.nombreMadreCompleto,
  source.value.madre
))
const fatherPhoneRaw = computed(() => firstValue(source.value.telefonoPadre, source.value.phone, source.value.telefono))
const motherPhoneRaw = computed(() => firstValue(source.value.telefonoMadre, source.value.celularMadre))
const fatherEmailRaw = computed(() => firstValue(source.value.emailPadre, source.value.email, source.value.correo))
const motherEmailRaw = computed(() => firstValue(source.value.emailMadre, source.value.correoMadre))
const fatherName = computed(() => fallbackText(fatherNameRaw.value))
const motherName = computed(() => fallbackText(motherNameRaw.value))
const fatherPhoneInvalid = computed(() => hasValue(fatherPhoneRaw.value) && !validPhone(fatherPhoneRaw.value))
const motherPhoneInvalid = computed(() => hasValue(motherPhoneRaw.value) && !validPhone(motherPhoneRaw.value))
const fatherEmailInvalid = computed(() => hasValue(fatherEmailRaw.value) && !validFamilyEmail(fatherEmailRaw.value))
const motherEmailInvalid = computed(() => hasValue(motherEmailRaw.value) && !validFamilyEmail(motherEmailRaw.value))
const fatherPhone = computed(() => fatherPhoneInvalid.value ? `${displayText(fatherPhoneRaw.value)} · no válido` : fallbackText(fatherPhoneRaw.value))
const motherPhone = computed(() => motherPhoneInvalid.value ? `${displayText(motherPhoneRaw.value)} · no válido` : fallbackText(motherPhoneRaw.value))
const fatherEmail = computed(() => fatherEmailInvalid.value ? `${displayText(fatherEmailRaw.value)} · no válido` : fallbackText(fatherEmailRaw.value))
const motherEmail = computed(() => motherEmailInvalid.value ? `${displayText(motherEmailRaw.value)} · no válido` : fallbackText(motherEmailRaw.value))
const fatherComplete = computed(() => Boolean(fatherNameRaw.value && validPhone(fatherPhoneRaw.value) && validFamilyEmail(fatherEmailRaw.value)))
const motherComplete = computed(() => Boolean(motherNameRaw.value && validPhone(motherPhoneRaw.value) && validFamilyEmail(motherEmailRaw.value)))
const expedienteChecks = computed(() => [
  hasValue(firstValue(source.value.curp, source.value.CURP)),
  fatherComplete.value,
  motherComplete.value
])
const expedienteProgress = computed(() => {
  const checks = expedienteChecks.value
  if (!checks.length) return 0
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
})
const expedienteComplete = computed(() => expedienteProgress.value >= 100)
const parentOccupation = computed(() => fallbackText(firstValue(source.value.ocupacionPadre, source.value.ocupacionTutor)))
const motherOccupation = computed(() => fallbackText(source.value.ocupacionMadre))

const formatDate = (value) => {
  if (!hasValue(value)) return 'Sin registrar'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date).replace('.', '')
}

const syncRows = computed(() => [
  { label: 'Avance del expediente', value: sourceLabel.value, kind: 'status' },
  { label: 'Última actualización', value: formatDate(source.value.updatedAt) },
  { label: 'Modo', value: 'Solo lectura' },
  { label: 'Notas', value: expedienteComplete.value ? 'Información completa para consulta operativa.' : 'Faltan datos familiares o de identidad por completar.' }
])

const copyMatricula = async () => {
  try {
    await navigator.clipboard?.writeText(safeMatricula.value)
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copied.value = false }, 1400)
  } catch (_) {
    copied.value = false
  }
}

watch(() => props.student?.matricula, () => {
  detail.value = null
  error.value = ''
  loadDetail()
}, { immediate: true })
</script>

<style scoped>
.operator-info-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(18, 28, 24, .52);
  backdrop-filter: blur(8px) saturate(112%);
}

.operator-info-modal {
  width: min(1096px, calc(100vw - 3rem));
  height: min(848px, calc(100vh - 3rem));
  display: grid;
  grid-template-rows: auto auto auto 1fr;
  overflow: hidden;
  position: relative;
  border: 1px solid rgba(216, 227, 220, .96);
  border-radius: 28px;
  background:
    radial-gradient(circle at 96% 18%, rgba(96, 166, 115, .08), transparent 24%),
    linear-gradient(180deg, rgba(255,255,255,.99), rgba(250,252,250,.98));
  box-shadow: 0 34px 90px rgba(21, 32, 28, .30);
  color: #17263a;
}

.operator-info-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.25rem;
  padding: 2rem 2rem .95rem;
}

.operator-info-heading span {
  display: block;
  font-size: .68rem;
  line-height: 1;
  font-weight: 950;
  letter-spacing: .22em;
  text-transform: uppercase;
  color: #697f70;
}

.operator-info-heading h2 {
  margin: .45rem 0 .35rem;
  color: #10213c;
  font-size: 1.68rem;
  line-height: .98;
  font-weight: 950;
  letter-spacing: -.04em;
}

.operator-info-heading p {
  margin: 0;
  color: #7b8797;
  font-size: .78rem;
  font-weight: 650;
}

.operator-info-actions {
  display: flex;
  align-items: center;
  gap: .72rem;
  flex-shrink: 0;
}

.operator-action,
.operator-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(202, 215, 207, .95);
  background: rgba(255, 255, 255, .93);
  color: #244932;
  box-shadow: 0 10px 22px rgba(28, 44, 34, .06);
}

.operator-action {
  gap: .55rem;
  height: 2.55rem;
  padding: 0 1rem;
  border-radius: 12px;
  font-size: .82rem;
  font-weight: 900;
}

.operator-action:disabled { opacity: .7; cursor: wait; }

.operator-close {
  width: 2.8rem;
  height: 2.8rem;
  border-radius: 999px;
  color: #304538;
}

.spinning { animation: operator-spin .85s linear infinite; }
@keyframes operator-spin { to { transform: rotate(360deg); } }

.operator-alert {
  display: flex;
  align-items: center;
  gap: .48rem;
  margin: 0 2rem .7rem;
  padding: .55rem .75rem;
  border-radius: 12px;
  font-size: .75rem;
  font-weight: 800;
}

.operator-alert.error {
  border: 1px solid rgba(214, 92, 92, .22);
  background: rgba(255, 245, 245, .92);
  color: #9a3434;
}

.operator-alert.warning {
  border: 1px solid rgba(213, 165, 72, .24);
  background: rgba(255, 250, 239, .94);
  color: #8a5a16;
}

.operator-hero {
  position: relative;
  display: grid;
  grid-template-columns: 7.4rem minmax(0, 1fr) auto;
  grid-template-rows: 1fr auto;
  align-items: center;
  gap: 0 1.55rem;
  min-height: 136px;
  margin: 0 2rem 1rem;
  padding: 1.08rem 1.45rem;
  overflow: hidden;
  border: 1px solid rgba(216, 226, 221, .92);
  border-radius: 17px;
  background: linear-gradient(120deg, #fff 0%, #fff 76%, rgba(233, 245, 236, .72) 100%);
  box-shadow: 0 16px 42px rgba(21, 50, 34, .055);
}

.operator-avatar {
  grid-row: 1 / span 2;
  position: relative;
  width: 6.1rem;
  height: 6.1rem;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background:
    radial-gradient(circle at center, #f8fbff 0 43%, transparent 44%),
    conic-gradient(from -20deg, #73e0bd, #e7efd1, #edf1f3, #73e0bd);
  box-shadow: inset 0 0 0 1px rgba(133, 225, 188, .35), 0 10px 24px rgba(40, 76, 52, .08);
}

.operator-avatar::after {
  content: '';
  position: absolute;
  inset: .72rem;
  border-radius: inherit;
  background: #f9fbff;
  box-shadow: inset 0 0 0 1px rgba(201, 218, 207, .86), 0 14px 22px rgba(20, 47, 34, .08);
}

.operator-avatar span {
  position: relative;
  z-index: 1;
  color: #426dd7;
  font-size: 1.85rem;
  font-weight: 950;
  letter-spacing: -.06em;
}

.operator-hero-main {
  min-width: 0;
  align-self: center;
}

.operator-hero-main h3 {
  margin: 0 0 1.05rem;
  color: #0d1730;
  font-size: 1.22rem;
  line-height: 1.04;
  font-weight: 950;
  letter-spacing: -.035em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.operator-chips {
  display: flex;
  flex-wrap: wrap;
  gap: .45rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: .38rem;
  min-height: 1.65rem;
  border-radius: 999px;
  padding: .28rem .64rem;
  font-size: .72rem;
  font-weight: 900;
  border: 1px solid transparent;
}

.chip.matricula {
  color: #007f78;
  background: rgba(217, 249, 242, .88);
  border-color: rgba(75, 212, 191, .42);
}

.chip.status {
  color: #19751b;
  background: rgba(241, 251, 239, .96);
  border-color: rgba(174, 221, 162, .58);
}

.chip.status span {
  width: .34rem;
  height: .34rem;
  border-radius: 999px;
  background: currentColor;
  box-shadow: 0 0 0 4px rgba(34, 145, 35, .08);
}

.chip.complete {
  color: #245f36;
  background: rgba(239, 251, 242, .96);
  border-color: rgba(186, 226, 195, .86);
}

.operator-academic-strip {
  position: relative;
  z-index: 1;
  grid-column: 3;
  grid-row: 1;
  display: grid;
  grid-template-columns: repeat(3, 5.05rem);
  align-self: center;
  overflow: hidden;
  border: 1px solid rgba(220, 227, 223, .95);
  border-radius: 11px;
  background: rgba(255,255,255,.88);
  box-shadow: 0 8px 24px rgba(20, 38, 29, .04);
}

.operator-academic-strip div {
  min-height: 4.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: .44rem;
}

.operator-academic-strip div + div { border-left: 1px solid rgba(220, 227, 223, .95); }
.operator-academic-strip strong { color: #1d5130; font-size: .78rem; font-weight: 950; text-transform: capitalize; }
.operator-academic-strip small { color: #6b756f; font-size: .56rem; font-weight: 950; letter-spacing: .12em; text-transform: uppercase; }

.operator-service-pill {
  position: relative;
  z-index: 1;
  grid-column: 3;
  grid-row: 2;
  justify-self: end;
  display: inline-flex;
  align-items: center;
  gap: .38rem;
  min-height: 1.72rem;
  margin-top: .4rem;
  border-radius: 999px;
  padding: .3rem .72rem;
  color: #1d5fd1;
  background: rgba(248, 251, 255, .94);
  border: 1px solid rgba(194, 211, 244, .8);
  font-size: .74rem;
  font-weight: 950;
}
.operator-service-pill span { color: #6f7b85; font-size: .55rem; letter-spacing: .13em; text-transform: uppercase; margin-left: .28rem; }

.operator-watermark {
  position: absolute;
  right: 1.8rem;
  top: -.65rem;
  color: rgba(95, 151, 103, .10);
  font-size: 9.5rem;
  line-height: 1;
  font-weight: 950;
  letter-spacing: -.12em;
  pointer-events: none;
}


.operator-inline-loading {
  display: inline-flex;
  align-items: center;
  gap: .55rem;
  width: fit-content;
  margin: 0 2rem .75rem;
  padding: .5rem .78rem;
  border-radius: 999px;
  border: 1px solid rgba(36, 98, 59, .14);
  background: rgba(239, 252, 244, .86);
  color: #24623b;
  font-size: .78rem;
  font-weight: 850;
}
.operator-loading {
  margin: 0 2rem;
  display: flex;
  align-items: center;
  gap: .55rem;
  color: #53685a;
  font-size: .82rem;
  font-weight: 850;
  padding: .8rem 1rem;
  border: 1px dashed rgba(156, 179, 163, .65);
  border-radius: 14px;
  background: rgba(248, 251, 248, .92);
}
.operator-spinner {
  width: 1rem;
  height: 1rem;
  border-radius: 999px;
  border: 2px solid rgba(112, 151, 122, .25);
  border-top-color: #3a8750;
  animation: operator-spin .85s linear infinite;
}

.operator-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: 1.02fr .98fr;
  grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  gap: .9rem 1rem;
  padding: 0 2rem 2rem;
}

.operator-panel {
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(217, 226, 221, .95);
  border-radius: 17px;
  background: rgba(255,255,255,.82);
  box-shadow: 0 16px 35px rgba(23, 49, 33, .045);
  padding: 1.05rem 1rem;
}

.operator-panel h4 {
  display: flex;
  align-items: center;
  gap: .62rem;
  margin: 0 0 1rem;
  color: #18233a;
  font-size: .96rem;
  line-height: 1;
  font-weight: 950;
  letter-spacing: -.01em;
}
.operator-panel h4 svg { color: #24623b; }

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: .6rem;
}

.summary-tile {
  min-height: 5rem;
  display: flex;
  align-items: center;
  gap: .64rem;
  border: 1px solid rgba(220, 229, 223, .96);
  border-radius: 11px;
  background: rgba(255,255,255,.8);
  padding: .65rem .55rem;
}

.summary-icon {
  width: 2.05rem;
  height: 2.05rem;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 999px;
  color: #2f9a42;
  background: rgba(239, 251, 240, .96);
  box-shadow: inset 0 0 0 1px rgba(195, 231, 198, .75);
}
.summary-tile small {
  display: block;
  margin-bottom: .24rem;
  color: #7d8992;
  font-size: .64rem;
  font-weight: 760;
}
.summary-tile strong {
  display: block;
  color: #163b2b;
  font-size: .78rem;
  font-weight: 950;
  line-height: 1.08;
  overflow-wrap: anywhere;
}

.info-table {
  margin: 0;
  overflow: hidden;
  border: 1px solid rgba(221, 227, 224, .98);
  border-radius: 11px;
  background: rgba(255,255,255,.92);
}
.info-table div {
  display: grid;
  grid-template-columns: 11rem minmax(0, 1fr);
  align-items: center;
  min-height: 2.36rem;
}
.info-table div + div { border-top: 1px solid rgba(221, 227, 224, .96); }
.info-table dt, .info-table dd { margin: 0; }
.info-table dt {
  color: #536070;
  font-size: .74rem;
  font-weight: 780;
  padding-left: .92rem;
}
.info-table dd {
  color: #293347;
  font-size: .75rem;
  font-weight: 920;
  padding-right: .92rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.family-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: .75rem;
}
.family-card {
  border: 1px solid rgba(220, 228, 223, .96);
  border-radius: 12px;
  background: rgba(255,255,255,.86);
  padding: .8rem .72rem;
}
.family-card.complete {
  border-color: rgba(120, 201, 141, .68);
  background: linear-gradient(180deg, rgba(246, 253, 248, .96), rgba(255,255,255,.9));
}
.family-card h5 {
  display: flex;
  align-items: center;
  gap: .45rem;
  margin: 0 0 .65rem;
  color: #3b5a45;
  font-size: .86rem;
  font-weight: 760;
}
.family-card dl { display: grid; gap: .46rem; margin: 0; }
.family-card div { display: grid; grid-template-columns: 5.4rem minmax(0, 1fr); align-items: center; }
.family-card dt, .family-card dd { margin: 0; }
.family-card dt { color: #667384; font-size: .66rem; font-weight: 900; }
.family-card dd { color: #8c97a3; font-size: .68rem; font-weight: 760; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.family-card dd.invalid { color: #b24040; font-weight: 900; }

.soft-note,
.readonly-note {
  display: flex;
  align-items: center;
  gap: .42rem;
  margin-top: .8rem;
  border-radius: 9px;
  padding: .55rem .7rem;
  font-size: .7rem;
  font-weight: 740;
}
.soft-note {
  color: #5c7a60;
  border: 1px solid rgba(204, 226, 204, .92);
  background: rgba(242, 251, 241, .96);
}
.readonly-note {
  color: #3a67bb;
  border: 1px solid rgba(199, 215, 247, .9);
  background: rgba(241, 246, 255, .96);
}

.sync-table { margin-top: .05rem; }
.sync-pill {
  display: inline-flex;
  align-items: center;
  gap: .32rem;
  color: #257e2e;
  background: rgba(238, 250, 236, .95);
  border: 1px solid rgba(184, 226, 174, .8);
  border-radius: 999px;
  padding: .18rem .48rem;
  font-size: .68rem;
  font-weight: 900;
}


.operator-loading-stage {
  margin: 0 2rem 2rem;
  display: grid;
  gap: .95rem;
}
.operator-loading-copy {
  display: flex;
  align-items: center;
  gap: .85rem;
  padding: .9rem 1rem;
  border-radius: 16px;
  border: 1px solid rgba(189, 218, 198, .86);
  background: linear-gradient(135deg, rgba(246, 253, 248, .96), rgba(255,255,255,.94));
  color: #214d30;
  box-shadow: 0 14px 28px rgba(24, 64, 38, .05);
}
.operator-loading-copy strong {
  display: block;
  font-size: .9rem;
  font-weight: 950;
}
.operator-loading-copy p {
  margin: .18rem 0 0;
  color: #6f7d73;
  font-size: .76rem;
  font-weight: 720;
}
.operator-spinner.large {
  width: 1.45rem;
  height: 1.45rem;
  border-width: 3px;
}
.operator-skeleton-hero,
.operator-skeleton-panel {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(219, 228, 223, .92);
  background: rgba(255,255,255,.88);
  box-shadow: 0 14px 32px rgba(23, 49, 33, .04);
}
.operator-skeleton-hero {
  min-height: 136px;
  border-radius: 17px;
  display: grid;
  grid-template-columns: 7rem 1fr;
  gap: 1.25rem;
  align-items: center;
  padding: 1rem 1.25rem;
}
.skeleton-avatar,
.skeleton-lines span,
.operator-skeleton-panel {
  background: linear-gradient(90deg, rgba(232,239,234,.82), rgba(249,252,249,.98), rgba(232,239,234,.82));
  background-size: 220% 100%;
  animation: operator-shimmer 1.08s ease-in-out infinite;
}
.skeleton-avatar {
  width: 5.8rem;
  height: 5.8rem;
  border-radius: 999px;
}
.skeleton-lines { display: grid; gap: .62rem; }
.skeleton-lines span { display: block; height: .85rem; border-radius: 999px; }
.skeleton-lines span:first-child { width: 46%; height: 1.15rem; }
.skeleton-lines span:nth-child(2) { width: 66%; }
.skeleton-lines span:nth-child(3) { width: 36%; }
.operator-skeleton-grid {
  display: grid;
  grid-template-columns: 1.02fr .98fr;
  gap: .9rem 1rem;
}
.operator-skeleton-panel {
  min-height: 185px;
  border-radius: 17px;
}
@keyframes operator-shimmer {
  0% { background-position: 120% 0; }
  100% { background-position: -120% 0; }
}

@media (max-height: 840px), (max-width: 1180px) {
  .operator-info-modal {
    width: min(1030px, calc(100vw - 2rem));
    height: min(780px, calc(100vh - 2rem));
    border-radius: 24px;
  }
  .operator-info-header { padding: 1.35rem 1.45rem .7rem; }
  .operator-info-heading h2 { font-size: 1.45rem; }
  .operator-hero { min-height: 120px; margin: 0 1.45rem .75rem; padding: .85rem 1rem; }
  .operator-avatar { width: 5.35rem; height: 5.35rem; }
  .operator-avatar span { font-size: 1.55rem; }
  .operator-grid { gap: .7rem; padding: 0 1.45rem 1.45rem; }
  .operator-panel { padding: .82rem .82rem; }
  .operator-panel h4 { margin-bottom: .72rem; font-size: .86rem; }
  .summary-tile { min-height: 4.35rem; padding: .48rem; }
  .summary-icon { width: 1.8rem; height: 1.8rem; }
  .operator-academic-strip { grid-template-columns: repeat(3, 4.6rem); }
  .operator-academic-strip div { min-height: 3.95rem; }
  .info-table div { min-height: 2.05rem; grid-template-columns: 9.5rem minmax(0, 1fr); }
  .family-card { padding: .65rem; }
  .family-card dl { gap: .34rem; }
  .soft-note, .readonly-note { margin-top: .55rem; padding: .42rem .55rem; }
}

@media (max-width: 860px) {
  .operator-info-backdrop { align-items: flex-start; padding: .75rem; overflow: auto; }
  .operator-info-modal { width: 100%; height: auto; min-height: calc(100vh - 1.5rem); overflow: visible; }
  .operator-info-header, .operator-info-actions { flex-direction: column; align-items: stretch; }
  .operator-info-actions { display: grid; grid-template-columns: 1fr 1fr auto; gap: .5rem; }
  .operator-hero { grid-template-columns: 4.8rem minmax(0, 1fr); grid-template-rows: auto auto auto; }
  .operator-academic-strip, .operator-service-pill { grid-column: 1 / -1; justify-self: stretch; }
  .operator-grid, .operator-skeleton-grid { grid-template-columns: 1fr; grid-template-rows: none; }
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .family-grid { grid-template-columns: 1fr; }
}

.operator-progress-mini {
  display: grid;
  gap: .36rem;
  width: min(300px, 100%);
  margin-top: .65rem;
}

.operator-progress-mini span {
  color: #65756c;
  font-size: .72rem;
  font-weight: 900;
}

.operator-progress-mini span b { color: #223d2e; }

.operator-progress-mini i {
  display: block;
  height: .42rem;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(33, 71, 48, .11);
}

.operator-progress-mini em {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #7aa985, #2f7a4c);
}

.chip.pending {
  background: rgba(245, 158, 11, .12);
  color: #92400e;
  border-color: rgba(245, 158, 11, .25);
}

</style>
