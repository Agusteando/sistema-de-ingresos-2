<template>
  <Teleport to="body">
    <div class="operator-info-backdrop" role="dialog" aria-modal="true" @click.self="$emit('close')">
      <section class="operator-info-modal" aria-label="Expediente del alumno">
        <header class="operator-info-header">
          <div class="operator-info-heading">
            <span>Control Escolar</span>
            <h2>Expediente del alumno</h2>
            <p>Vista financiera de solo lectura con datos consolidados de matrícula.</p>
          </div>

          <div class="operator-info-actions">
            <button type="button" class="operator-action" :disabled="loading" @click="loadDetail({ bypassCache: true })">
              <LucideRefreshCw :size="17" :class="{ spinning: loading }" />
              Actualizar
            </button>
            <button type="button" class="operator-action" @click="copyMatricula">
              <LucideCopy :size="17" />
              {{ copied ? 'Copiada' : 'Copiar matrícula' }}
            </button>
            <button type="button" class="operator-close" aria-label="Cerrar expediente" @click="$emit('close')">
              <LucideX :size="23" />
            </button>
          </div>
        </header>

        <div v-if="error" :class="['operator-alert', readyToRender ? 'warning' : 'error']">
          <LucideAlertTriangle :size="16" />
          <span>{{ error }}</span>
        </div>

        <div v-if="readyToRender" class="operator-hero">
          <StudentAccountPhotoCard
            class="operator-photo-card"
            :student="presentationStudent"
            :photo-url="resolvedPhotoUrl"
            :photo-loading="photoLoading"
          />

          <div class="operator-identity">
            <div class="operator-eyebrow-row">
              <span>{{ sourcePillLabel }}</span>
              <span>{{ displayTipoIngreso }}</span>
            </div>
            <h3>{{ fullName }}</h3>
            <div class="operator-identity-meta">
              <span>{{ safeMatricula }}</span>
              <span>{{ displayNivel }}</span>
              <span>{{ displayGrado }}</span>
              <span>{{ displayGrupo }}</span>
            </div>
          </div>

          <div class="operator-progress-pair" aria-label="Estado del expediente">
            <button type="button" class="operator-progress-card" @click="activeSection = 'basic'">
              <span>Expediente básico</span>
              <strong>{{ basicTier.progress }}%</strong>
              <small>{{ basicTier.completed }} de {{ basicTier.total }} campos</small>
              <i><em :style="{ width: `${basicTier.progress}%` }"></em></i>
            </button>
            <button type="button" class="operator-progress-card advanced" @click="activeSection = 'advanced'">
              <span>Expediente avanzado</span>
              <strong>{{ advancedTier.progress }}%</strong>
              <small>{{ advancedTier.completed }} de {{ advancedTier.total }} campos</small>
              <i><em :style="{ width: `${advancedTier.progress}%` }"></em></i>
            </button>
          </div>
        </div>

        <div v-if="readyToRender" class="operator-quick-strip">
          <article v-for="item in quickFacts" :key="item.label">
            <component :is="item.icon" :size="16" />
            <div>
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </article>
        </div>

        <nav v-if="readyToRender" class="operator-tabs" aria-label="Secciones del expediente">
          <button
            v-for="tab in sections"
            :key="tab.key"
            type="button"
            :class="{ active: activeSection === tab.key }"
            @click="activeSection = tab.key"
          >
            <component :is="tab.icon" :size="15" />
            {{ tab.label }}
          </button>
        </nav>

        <div v-if="!readyToRender && !error" class="operator-loading-stage" aria-live="polite">
          <span class="operator-spinner large" aria-hidden="true"></span>
          <div>
            <strong>Preparando expediente</strong>
            <p>Se están leyendo los datos disponibles del alumno.</p>
          </div>
        </div>

        <main v-if="readyToRender" class="operator-body">
          <section v-show="activeSection === 'overview'" class="operator-section-panel overview-panel">
            <div class="operator-overview-grid">
              <article class="operator-panel progress-summary-panel">
                <div class="operator-panel-heading">
                  <span><LucideShieldCheck :size="17" /></span>
                  <div>
                    <h4>Lectura de expediente</h4>
                    <p>Separado por básico y avanzado.</p>
                  </div>
                </div>
                <div class="operator-metric-row">
                  <button type="button" class="operator-metric-card" @click="activeSection = 'basic'">
                    <span>Básico</span>
                    <strong>{{ basicTier.progress }}%</strong>
                    <small>{{ basicTier.summary }}</small>
                  </button>
                  <button type="button" class="operator-metric-card" @click="activeSection = 'advanced'">
                    <span>Avanzado</span>
                    <strong>{{ advancedTier.progress }}%</strong>
                    <small>{{ advancedTier.summary }}</small>
                  </button>
                </div>
                <div class="operator-missing-preview">
                  <strong>Pendientes principales</strong>
                  <div v-if="priorityMissingLabels.length" class="operator-chip-list">
                    <span v-for="label in priorityMissingLabels" :key="label">{{ label }}</span>
                  </div>
                  <p v-else>Sin pendientes visibles en los campos evaluados.</p>
                </div>
              </article>

              <article class="operator-panel identity-panel">
                <div class="operator-panel-heading">
                  <span><LucideUserRound :size="17" /></span>
                  <div>
                    <h4>Identidad</h4>
                    <p>Datos base de Control Escolar.</p>
                  </div>
                </div>
                <dl class="operator-data-list">
                  <div v-for="row in identityRows" :key="row.label">
                    <dt>{{ row.label }}</dt>
                    <dd>{{ row.value }}</dd>
                  </div>
                </dl>
              </article>

              <article class="operator-panel family-panel">
                <div class="operator-panel-heading">
                  <span><LucideUsersRound :size="17" /></span>
                  <div>
                    <h4>Familia</h4>
                    <p>Padre, madre y contacto.</p>
                  </div>
                </div>
                <div class="operator-family-cards">
                  <section v-for="card in familyCards" :key="card.key" :class="['operator-family-card', { complete: card.complete }]">
                    <div>
                      <strong>{{ card.title }}</strong>
                      <small>{{ card.complete ? 'Completo' : 'Pendiente' }}</small>
                    </div>
                    <p>{{ card.name }}</p>
                    <span>{{ card.contact }}</span>
                  </section>
                </div>
              </article>

              <article class="operator-panel documents-panel">
                <div class="operator-panel-heading">
                  <span><LucidePaperclip :size="17" /></span>
                  <div>
                    <h4>Documentos</h4>
                    <p>Adjuntos del expediente avanzado.</p>
                  </div>
                </div>
                <div class="operator-document-grid">
                  <span v-for="doc in documentRows" :key="doc.key" :class="{ present: doc.present }">
                    <LucideCheckCircle2 v-if="doc.present" :size="14" />
                    <LucideAlertTriangle v-else :size="14" />
                    {{ doc.label }}
                  </span>
                </div>
              </article>
            </div>
          </section>

          <section v-show="activeSection === 'basic'" class="operator-section-panel">
            <article class="operator-panel full-panel">
              <div class="operator-panel-heading">
                <span><LucideShieldCheck :size="17" /></span>
                <div>
                  <h4>Expediente básico</h4>
                  <p>{{ basicTier.completed }} de {{ basicTier.total }} campos completos.</p>
                </div>
              </div>
              <div class="operator-field-grid">
                <div v-for="field in basicFieldRows" :key="field.key" :class="['operator-field-row', { complete: field.present }]">
                  <span class="operator-field-status"></span>
                  <div>
                    <strong>{{ field.label }}</strong>
                    <small>{{ field.value }}</small>
                  </div>
                </div>
              </div>
            </article>
          </section>

          <section v-show="activeSection === 'advanced'" class="operator-section-panel">
            <article class="operator-panel full-panel">
              <div class="operator-panel-heading">
                <span><LucideClipboardList :size="17" /></span>
                <div>
                  <h4>Expediente avanzado</h4>
                  <p>{{ advancedTier.completed }} de {{ advancedTier.total }} campos completos.</p>
                </div>
              </div>
              <div class="operator-advanced-groups">
                <section v-for="group in advancedGroups" :key="group.title" class="operator-advanced-group">
                  <h5>{{ group.title }}</h5>
                  <div class="operator-field-grid compact">
                    <div v-for="field in group.fields" :key="field.key" :class="['operator-field-row', { complete: field.present }]">
                      <span class="operator-field-status"></span>
                      <div>
                        <strong>{{ field.label }}</strong>
                        <small>{{ field.value }}</small>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </article>
          </section>

          <section v-show="activeSection === 'family'" class="operator-section-panel">
            <article class="operator-panel full-panel">
              <div class="operator-panel-heading">
                <span><LucideUsersRound :size="17" /></span>
                <div>
                  <h4>Datos familiares y domicilio</h4>
                  <p>Lectura operativa para cobranza y seguimiento.</p>
                </div>
              </div>
              <div class="operator-family-detail-grid">
                <dl v-for="section in familyDetailSections" :key="section.title" class="operator-data-list tall">
                  <div class="operator-list-title">
                    <dt>{{ section.title }}</dt>
                    <dd>{{ section.status }}</dd>
                  </div>
                  <div v-for="row in section.rows" :key="row.label">
                    <dt>{{ row.label }}</dt>
                    <dd>{{ row.value }}</dd>
                  </div>
                </dl>
              </div>
            </article>
          </section>
        </main>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  LucideAlertTriangle,
  LucideBadgeCheck,
  LucideBookOpen,
  LucideBuilding2,
  LucideCheckCircle2,
  LucideClipboardList,
  LucideCopy,
  LucideDatabase,
  LucideGraduationCap,
  LucidePaperclip,
  LucideRefreshCw,
  LucideSchool,
  LucideShieldCheck,
  LucideUserRound,
  LucideUsersRound,
  LucideX
} from 'lucide-vue-next'
import StudentAccountPhotoCard from '~/components/students/StudentAccountPhotoCard.vue'
import {
  CONTROL_ESCOLAR_BASIC_REQUIRED_FIELDS,
  CONTROL_ESCOLAR_COMPLETE_REQUIRED_FIELDS,
  inferMexicanCurpIdentity,
  photoStorageKey,
  resolveControlEscolarCompleteness
} from '~/shared/utils/studentPresentation'

const props = defineProps({
  student: { type: Object, required: true }
})

defineEmits(['close'])

const detail = ref(null)
const loading = ref(false)
const error = ref('')
const copied = ref(false)
const activeSection = ref('overview')
const photoUrl = ref('')
const photoLoading = ref(false)
let requestId = 0
let photoRequestId = 0
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
const joinedName = (...values) => values.map(displayText).filter(Boolean).join(' ')
const normalizedMatricula = (value) => String(value || '').trim().toUpperCase()

const OPERATOR_DETAIL_CACHE_PREFIX = 'student-operator-detail:v5:'
const OPERATOR_DETAIL_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000

const extractOverlayStudent = (payload) => {
  if (!payload || typeof payload !== 'object') return null
  const candidate = payload.student && typeof payload.student === 'object'
    ? payload.student
    : payload.centralMatricula?.student && typeof payload.centralMatricula.student === 'object'
      ? payload.centralMatricula.student
      : payload
  return [
    candidate.matricula, candidate.curp, candidate.padre, candidate.madre,
    candidate.nombrePadre, candidate.nombreMadre, candidate.emailPadre, candidate.emailMadre,
    candidate.telefonoPadre, candidate.telefonoMadre, candidate.lugarNacimiento, candidate.certificadoMedicoAdjunto
  ].some(hasValue) ? candidate : null
}

const localStudentSnapshot = () => {
  const base = props.student || {}
  const central = extractOverlayStudent(base.centralMatricula) || {}
  return {
    ...base,
    ...central,
    overlayExists: Boolean(base.overlayExists || base.centralMatricula?.overlayExists || central.overlayExists),
    centralMatricula: central,
    matricula: firstValue(base.matricula, central.matricula)
  }
}

const safeMatricula = computed(() => fallbackText(firstValue(source.value.matricula, props.student?.matricula), 'Sin matrícula'))
const operatorCacheKey = computed(() => `${OPERATOR_DETAIL_CACHE_PREFIX}${normalizedMatricula(safeMatricula.value)}`)

const readCachedDetail = () => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage?.getItem(operatorCacheKey.value) || window.sessionStorage?.getItem(operatorCacheKey.value)
    if (!raw) return null
    const payload = JSON.parse(raw)
    if (!payload || typeof payload.updatedAt !== 'number' || !payload.detail) return null
    if (Date.now() - payload.updatedAt > OPERATOR_DETAIL_CACHE_MAX_AGE_MS) {
      window.localStorage?.removeItem(operatorCacheKey.value)
      window.sessionStorage?.removeItem(operatorCacheKey.value)
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
  const matricula = firstValue(props.student?.matricula, props.student?.centralMatricula?.matricula)
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
      .map(extractOverlayStudent)
      .find((item) => normalizedMatricula(item?.matricula) === normalizedMatricula(matricula))
    const nextDetail = overlayStudent
      ? { ...fallbackDetail, ...overlayStudent, overlayExists: true, centralMatricula: { ...overlayStudent, overlayExists: true } }
      : fallbackDetail
    detail.value = nextDetail
    if (overlayStudent) writeCachedDetail(nextDetail)
    if (!overlayStudent && response?.ok === false) {
      error.value = 'No se pudo actualizar Control Escolar; se muestran los datos disponibles.'
    }
  } catch (_) {
    if (currentId !== requestId) return
    detail.value = detail.value || fallbackDetail
    error.value = 'No se pudo actualizar Control Escolar; se muestran los datos disponibles.'
    writeCachedDetail(detail.value)
  } finally {
    if (currentId === requestId) loading.value = false
  }
}

const source = computed(() => ({
  ...(props.student || {}),
  ...(extractOverlayStudent(props.student?.centralMatricula) || {}),
  ...(extractOverlayStudent(detail.value) || detail.value || {})
}))

const fullName = computed(() => fallbackText(firstValue(source.value.fullName, source.value.nombreCompleto, source.value.nombreCompletoAlumno, source.value.nombre, props.student?.nombre), 'Alumno'))
const displayNivel = computed(() => titleCase(firstValue(source.value.nivel, props.student?.nivel)) || 'Nivel')
const displayGrado = computed(() => titleCase(firstValue(source.value.grado, props.student?.grado)) || 'Grado')
const displayGrupo = computed(() => {
  const group = firstValue(source.value.group, source.value.grupo, props.student?.grupo)
  return group ? `Grupo ${String(group).replace(/^grupo\s+/i, '')}` : 'Sin grupo'
})
const displayServicio = computed(() => titleCase(firstValue(source.value.servicio, source.value.program, props.student?.servicio)))
const displayTipoIngreso = computed(() => titleCase(firstValue(source.value.tipoIngreso, source.value.tipo_ingreso, source.value.ingreso, props.student?.tipoIngreso, source.value.interno, 'Externo')))
const sourcePillLabel = computed(() => source.value.overlayExists || source.value.centralMatricula?.overlayExists ? 'Datos de Control Escolar' : 'Datos financieros')
const readyToRender = computed(() => Boolean(firstValue(source.value.matricula, props.student?.matricula)))
const presentationStudent = computed(() => ({ ...source.value, nombreCompleto: fullName.value, fullName: fullName.value }))
const readStoredPhoto = (matricula) => {
  if (typeof window === 'undefined') return ''
  try {
    return window.sessionStorage?.getItem(photoStorageKey(matricula)) || ''
  } catch (_) {
    return ''
  }
}

const writeStoredPhoto = (matricula, value) => {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage?.setItem(photoStorageKey(matricula), value || 'none')
  } catch (_) {}
}

const loadPhoto = async () => {
  const matricula = normalizedMatricula(firstValue(source.value.matricula, props.student?.matricula))
  if (!matricula) return

  const directPhoto = firstValue(source.value.photoUrl, source.value.fotoUrl, source.value.foto)
  if (/^https?:\/\//i.test(directPhoto)) {
    photoUrl.value = directPhoto
    return
  }

  const cached = readStoredPhoto(matricula)
  if (cached) {
    photoUrl.value = cached
    return
  }

  const currentId = ++photoRequestId
  photoLoading.value = true
  try {
    const response = await $fetch(`/api/students/${encodeURIComponent(matricula)}/photo`, { query: { format: 'json' } })
    if (currentId !== photoRequestId) return
    const nextUrl = displayText(response?.photoUrl)
    photoUrl.value = nextUrl || 'none'
    writeStoredPhoto(matricula, photoUrl.value)
  } catch (_) {
    if (currentId !== photoRequestId) return
    photoUrl.value = 'none'
    writeStoredPhoto(matricula, 'none')
  } finally {
    if (currentId === photoRequestId) photoLoading.value = false
  }
}

const resolvedPhotoUrl = computed(() => photoUrl.value && photoUrl.value !== 'none' ? photoUrl.value : '')

const controlCompleteness = computed(() => resolveControlEscolarCompleteness(source.value, { honorEnrollmentState: false }))
const basicTier = computed(() => controlCompleteness.value.basic)
const advancedTier = computed(() => controlCompleteness.value.complete)
const basicMissingSet = computed(() => new Set(basicTier.value.missingFields || []))
const advancedMissingSet = computed(() => new Set(advancedTier.value.missingFields || []))

const phoneDigits = (value) => displayText(value).replace(/\D/g, '')
const validPhone = (value) => phoneDigits(value).length >= 10
const normalizedEmail = (value) => displayText(value).toLowerCase()
const validFamilyEmail = (value) => {
  const email = normalizedEmail(value)
  if (!email || email.includes('@casita')) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const fatherParts = computed(() => ({
  nombre: firstValue(source.value.nombrePadre),
  apellidoPaterno: firstValue(source.value.apellidoPaternoPadre),
  apellidoMaterno: firstValue(source.value.apellidoMaternoPadre),
  completo: firstValue(
    joinedName(source.value.nombrePadre, source.value.apellidoPaternoPadre, source.value.apellidoMaternoPadre),
    source.value.fatherName,
    source.value.nombrePadreCompleto,
    source.value.padre,
    source.value.tutor,
    source.value.padreTutor
  )
}))
const motherParts = computed(() => ({
  nombre: firstValue(source.value.nombreMadre),
  apellidoPaterno: firstValue(source.value.apellidoPaternoMadre),
  apellidoMaterno: firstValue(source.value.apellidoMaternoMadre),
  completo: firstValue(
    joinedName(source.value.nombreMadre, source.value.apellidoPaternoMadre, source.value.apellidoMaternoMadre),
    source.value.motherName,
    source.value.nombreMadreCompleto,
    source.value.madre
  )
}))

const fatherPhoneRaw = computed(() => firstValue(source.value.telefonoPadre, source.value.celularPadre, source.value.phone, source.value.telefono))
const motherPhoneRaw = computed(() => firstValue(source.value.telefonoMadre, source.value.celularMadre))
const fatherEmailRaw = computed(() => firstValue(source.value.emailPadre, source.value.correoPadre, source.value.email, source.value.correo))
const motherEmailRaw = computed(() => firstValue(source.value.emailMadre, source.value.correoMadre))
const fatherComplete = computed(() => Boolean(fatherParts.value.nombre && fatherParts.value.apellidoPaterno && validPhone(fatherPhoneRaw.value) && validFamilyEmail(fatherEmailRaw.value)))
const motherComplete = computed(() => Boolean(motherParts.value.nombre && motherParts.value.apellidoPaterno && validPhone(motherPhoneRaw.value) && validFamilyEmail(motherEmailRaw.value)))

const curpIdentity = computed(() => inferMexicanCurpIdentity(firstValue(source.value.curp, source.value.CURP)))
const displayDate = (value) => {
  const text = displayText(value)
  if (!text) return 'Sin registrar'
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(date).replace('.', '')
}
const fieldValueFor = (key) => {
  const map = {
    curp: firstValue(source.value.curp, source.value.CURP),
    padreNombre: fatherParts.value.nombre,
    padreApellidoPaterno: fatherParts.value.apellidoPaterno,
    padreTelefono: validPhone(fatherPhoneRaw.value) ? fatherPhoneRaw.value : firstValue(fatherPhoneRaw.value, 'Sin teléfono válido'),
    padreEmail: validFamilyEmail(fatherEmailRaw.value) ? fatherEmailRaw.value : firstValue(fatherEmailRaw.value, 'Sin email válido'),
    madreNombre: motherParts.value.nombre,
    madreApellidoPaterno: motherParts.value.apellidoPaterno,
    madreTelefono: validPhone(motherPhoneRaw.value) ? motherPhoneRaw.value : firstValue(motherPhoneRaw.value, 'Sin teléfono válido'),
    madreEmail: validFamilyEmail(motherEmailRaw.value) ? motherEmailRaw.value : firstValue(motherEmailRaw.value, 'Sin email válido'),
    lugarNacimiento: firstValue(source.value.lugarNacimiento),
    talla: firstValue(source.value.talla),
    peso: firstValue(source.value.peso),
    tipoSangre: firstValue(source.value.tipoSangre),
    alergias: firstValue(source.value.alergias),
    certificadoMedicoAdjunto: firstValue(source.value.certificadoMedicoAdjunto),
    certificadoVacunacionCovid19Adjunto: firstValue(source.value.certificadoVacunacionCovid19Adjunto),
    actaNacimientoAdjunta: firstValue(source.value.actaNacimientoAdjunta),
    curpAlumnoAdjunto: firstValue(source.value.curpAlumnoAdjunto),
    certificadoPrimariaAdjunto: firstValue(source.value.certificadoPrimariaAdjunto),
    boletaSextoPrimariaAdjunta: firstValue(source.value.boletaSextoPrimariaAdjunta),
    boletaPrimeroSecundariaAdjunta: firstValue(source.value.boletaPrimeroSecundariaAdjunta),
    boletaSegundoSecundariaAdjunta: firstValue(source.value.boletaSegundoSecundariaAdjunta),
    estadoCivilPadre: firstValue(source.value.estadoCivilPadre),
    fechaNacimientoPadre: displayText(source.value.fechaNacimientoPadre),
    inePadre: firstValue(source.value.inePadre),
    curpPadre: firstValue(source.value.curpPadre),
    estadoCivilMadre: firstValue(source.value.estadoCivilMadre),
    fechaNacimientoMadre: displayText(source.value.fechaNacimientoMadre),
    ineMadre: firstValue(source.value.ineMadre),
    curpMadre: firstValue(source.value.curpMadre),
    domicilioCalle: firstValue(source.value.domicilioCalle),
    domicilioNumero: firstValue(source.value.domicilioNumero, source.value.domicilioNum, source.value.domicioNum),
    domicilioColonia: firstValue(source.value.domicilioColonia),
    domicilioCp: firstValue(source.value.domicilioCp),
    domicilioMunicipio: firstValue(source.value.domicilioMunicipio)
  }
  return map[key] || ''
}
const fieldRow = (field, missingSet) => {
  const value = fieldValueFor(field.key)
  const present = !missingSet.has(field.key)
  const displayValue = present
    ? (String(field.key).toLowerCase().includes('adjunt') || String(field.key).toLowerCase().includes('boleta') || String(field.key).toLowerCase().includes('certificado') || field.key === 'actaNacimientoAdjunta' ? 'Archivo cargado' : fallbackText(value))
    : fallbackText(value, 'Pendiente')
  return { ...field, present, value: displayValue }
}
const basicFieldRows = computed(() => CONTROL_ESCOLAR_BASIC_REQUIRED_FIELDS.map(field => fieldRow(field, basicMissingSet.value)))
const advancedFieldRows = computed(() => CONTROL_ESCOLAR_COMPLETE_REQUIRED_FIELDS.map(field => fieldRow(field, advancedMissingSet.value)))
const advancedFieldByKey = computed(() => new Map(advancedFieldRows.value.map(field => [field.key, field])))
const advancedGroup = (title, keys) => ({
  title,
  fields: keys.map(key => advancedFieldByKey.value.get(key)).filter(Boolean)
})
const advancedGroups = computed(() => [
  advancedGroup('Salud e identidad', ['lugarNacimiento', 'talla', 'peso', 'tipoSangre', 'alergias']),
  advancedGroup('Padre', ['estadoCivilPadre', 'fechaNacimientoPadre', 'inePadre', 'curpPadre']),
  advancedGroup('Madre', ['estadoCivilMadre', 'fechaNacimientoMadre', 'ineMadre', 'curpMadre']),
  advancedGroup('Domicilio', ['domicilioCalle', 'domicilioNumero', 'domicilioColonia', 'domicilioCp', 'domicilioMunicipio']),
  advancedGroup('Documentos', ['certificadoMedicoAdjunto', 'certificadoVacunacionCovid19Adjunto', 'actaNacimientoAdjunta', 'curpAlumnoAdjunto', 'certificadoPrimariaAdjunto', 'boletaSextoPrimariaAdjunta', 'boletaPrimeroSecundariaAdjunta', 'boletaSegundoSecundariaAdjunta'])
])
const documentRows = computed(() => advancedGroup('Documentos', ['certificadoMedicoAdjunto', 'certificadoVacunacionCovid19Adjunto', 'actaNacimientoAdjunta', 'curpAlumnoAdjunto', 'certificadoPrimariaAdjunto', 'boletaSextoPrimariaAdjunta', 'boletaPrimeroSecundariaAdjunta', 'boletaSegundoSecundariaAdjunta']).fields)
const priorityMissingLabels = computed(() => [
  ...(basicTier.value.missingLabels || []),
  ...(advancedTier.value.missingLabels || [])
].slice(0, 6))

const identityRows = computed(() => [
  { label: 'Matrícula', value: safeMatricula.value },
  { label: 'CURP', value: fallbackText(firstValue(source.value.curp, source.value.CURP)) },
  { label: 'Nombre completo', value: fullName.value },
  { label: 'Fecha nacimiento', value: fallbackText(firstValue(source.value.fechaNacimiento, curpIdentity.value.fechaNacimiento)) },
  { label: 'Sexo inferido', value: fallbackText(curpIdentity.value.sexo) },
  { label: 'Última actualización', value: displayDate(source.value.updatedAt || source.value.fechaActualizacion) }
])
const quickFacts = computed(() => [
  { label: 'Plantel', value: fallbackText(firstValue(source.value.plantel, source.value.basePlantel)), icon: LucideBuilding2 },
  { label: 'Nivel', value: fallbackText(displayNivel.value), icon: LucideBookOpen },
  { label: 'Grado', value: fallbackText(displayGrado.value), icon: LucideSchool },
  { label: 'Grupo', value: fallbackText(displayGrupo.value), icon: LucideUsersRound },
  { label: 'Servicio', value: fallbackText(displayServicio.value), icon: LucideBadgeCheck },
  { label: 'Ingreso', value: fallbackText(displayTipoIngreso.value), icon: LucideDatabase }
])
const familyCards = computed(() => [
  {
    key: 'padre',
    title: 'Padre',
    complete: fatherComplete.value,
    name: fallbackText(fatherParts.value.completo),
    contact: `${fallbackText(fatherPhoneRaw.value)} · ${fallbackText(fatherEmailRaw.value)}`
  },
  {
    key: 'madre',
    title: 'Madre',
    complete: motherComplete.value,
    name: fallbackText(motherParts.value.completo),
    contact: `${fallbackText(motherPhoneRaw.value)} · ${fallbackText(motherEmailRaw.value)}`
  }
])
const familyDetailSections = computed(() => [
  {
    title: 'Padre',
    status: fatherComplete.value ? 'Completo' : 'Pendiente',
    rows: [
      { label: 'Nombre', value: fallbackText(fatherParts.value.completo) },
      { label: 'Teléfono', value: fallbackText(fatherPhoneRaw.value) },
      { label: 'Email', value: fallbackText(fatherEmailRaw.value) },
      { label: 'Estado civil', value: fallbackText(source.value.estadoCivilPadre) },
      { label: 'Fecha nacimiento', value: fallbackText(source.value.fechaNacimientoPadre) },
      { label: 'CURP', value: fallbackText(source.value.curpPadre) },
      { label: 'INE', value: fallbackText(source.value.inePadre) }
    ]
  },
  {
    title: 'Madre',
    status: motherComplete.value ? 'Completo' : 'Pendiente',
    rows: [
      { label: 'Nombre', value: fallbackText(motherParts.value.completo) },
      { label: 'Teléfono', value: fallbackText(motherPhoneRaw.value) },
      { label: 'Email', value: fallbackText(motherEmailRaw.value) },
      { label: 'Estado civil', value: fallbackText(source.value.estadoCivilMadre) },
      { label: 'Fecha nacimiento', value: fallbackText(source.value.fechaNacimientoMadre) },
      { label: 'CURP', value: fallbackText(source.value.curpMadre) },
      { label: 'INE', value: fallbackText(source.value.ineMadre) }
    ]
  },
  {
    title: 'Domicilio',
    status: advancedGroups.value.find(group => group.title === 'Domicilio')?.fields.every(field => field.present) ? 'Completo' : 'Pendiente',
    rows: [
      { label: 'Calle', value: fallbackText(source.value.domicilioCalle) },
      { label: 'Número', value: fallbackText(firstValue(source.value.domicilioNumero, source.value.domicilioNum, source.value.domicioNum)) },
      { label: 'Colonia', value: fallbackText(source.value.domicilioColonia) },
      { label: 'Código postal', value: fallbackText(source.value.domicilioCp) },
      { label: 'Municipio', value: fallbackText(source.value.domicilioMunicipio) }
    ]
  }
])
const sections = [
  { key: 'overview', label: 'Resumen', icon: LucideGraduationCap },
  { key: 'basic', label: 'Básico', icon: LucideShieldCheck },
  { key: 'advanced', label: 'Avanzado', icon: LucideClipboardList },
  { key: 'family', label: 'Familia', icon: LucideUsersRound }
]

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
  photoUrl.value = ''
  activeSection.value = 'overview'
  loadDetail()
}, { immediate: true })

watch(() => firstValue(source.value.matricula, props.student?.matricula), () => {
  loadPhoto()
}, { immediate: true })

onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer)
})
</script>

<style scoped>
.operator-info-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 1.35rem;
  background: rgba(18, 28, 24, .54);
  backdrop-filter: blur(9px) saturate(112%);
}

.operator-info-modal {
  width: min(1140px, calc(100vw - 2.7rem));
  height: min(860px, calc(100vh - 2.7rem));
  min-height: 620px;
  display: grid;
  grid-template-rows: auto auto auto auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid rgba(215, 226, 220, .96);
  border-radius: 28px;
  background:
    radial-gradient(circle at 94% 12%, rgba(94, 159, 113, .10), transparent 28%),
    radial-gradient(circle at 10% 0%, rgba(70, 123, 214, .07), transparent 26%),
    linear-gradient(180deg, rgba(255, 255, 255, .99), rgba(248, 251, 249, .98));
  color: #14223a;
  box-shadow: 0 34px 90px rgba(21, 32, 28, .31);
}

.operator-info-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.25rem;
  padding: 1.45rem 1.65rem .75rem;
}

.operator-info-heading span,
.operator-eyebrow-row span,
.operator-panel-heading p,
.operator-data-list dt,
.operator-field-row small,
.operator-progress-card span,
.operator-progress-card small,
.operator-metric-card span,
.operator-metric-card small,
.operator-quick-strip article span,
.operator-family-card small,
.operator-family-card span {
  color: #718092;
}

.operator-info-heading span {
  display: block;
  font-size: .66rem;
  line-height: 1;
  font-weight: 950;
  letter-spacing: .22em;
  text-transform: uppercase;
}

.operator-info-heading h2 {
  margin: .4rem 0 .26rem;
  color: #10213c;
  font-size: 1.55rem;
  line-height: 1;
  font-weight: 950;
  letter-spacing: -.045em;
}

.operator-info-heading p {
  margin: 0;
  color: #778598;
  font-size: .78rem;
  font-weight: 690;
}

.operator-info-actions {
  display: flex;
  align-items: center;
  gap: .65rem;
}

.operator-action,
.operator-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(203, 216, 208, .95);
  background: rgba(255, 255, 255, .94);
  color: #244932;
  box-shadow: 0 10px 22px rgba(28, 44, 34, .06);
}

.operator-action {
  gap: .5rem;
  height: 2.38rem;
  padding: 0 .86rem;
  border-radius: 12px;
  font-size: .78rem;
  font-weight: 900;
}

.operator-action:disabled {
  opacity: .7;
  cursor: wait;
}

.operator-close {
  width: 2.54rem;
  height: 2.54rem;
  border-radius: 999px;
  color: #304538;
}

.spinning { animation: operator-spin .85s linear infinite; }
@keyframes operator-spin { to { transform: rotate(360deg); } }

.operator-alert {
  display: flex;
  align-items: center;
  gap: .5rem;
  margin: 0 1.65rem .68rem;
  padding: .55rem .76rem;
  border-radius: 13px;
  font-size: .75rem;
  font-weight: 820;
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
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(310px, 390px);
  align-items: center;
  gap: 1rem;
  margin: 0 1.65rem .78rem;
  padding: 1rem 1.1rem;
  border: 1px solid rgba(216, 226, 221, .92);
  border-radius: 22px;
  background: linear-gradient(135deg, rgba(255, 255, 255, .96), rgba(250, 253, 251, .92));
  box-shadow: 0 18px 42px rgba(21, 50, 34, .055);
}

.operator-photo-card {
  --student-account-photo-size: 92px;
  --student-account-photo-radius: 26px;
  --student-account-photo-inner-radius: 21px;
  --student-account-photo-fallback-size: 62px;
  --student-account-photo-fallback-font-size: 21px;
}

.operator-identity {
  min-width: 0;
}

.operator-eyebrow-row,
.operator-identity-meta {
  display: flex;
  flex-wrap: wrap;
  gap: .42rem;
}

.operator-eyebrow-row span,
.operator-identity-meta span {
  display: inline-flex;
  align-items: center;
  min-height: 1.45rem;
  border: 1px solid rgba(218, 226, 222, .9);
  border-radius: 999px;
  background: rgba(255, 255, 255, .8);
  padding: .18rem .52rem;
  font-size: .66rem;
  font-weight: 900;
}

.operator-eyebrow-row span:first-child {
  color: #25643a;
  background: rgba(240, 251, 242, .9);
  border-color: rgba(191, 229, 195, .85);
}

.operator-identity h3 {
  margin: .5rem 0 .58rem;
  color: #0d1730;
  font-size: 1.4rem;
  line-height: 1.02;
  font-weight: 950;
  letter-spacing: -.04em;
  overflow-wrap: anywhere;
}

.operator-identity-meta span {
  color: #31435d;
  background: rgba(248, 251, 255, .9);
  border-color: rgba(210, 221, 238, .9);
}

.operator-progress-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: .7rem;
}

.operator-progress-card,
.operator-metric-card {
  text-align: left;
  border: 1px solid rgba(218, 227, 222, .95);
  background: rgba(255, 255, 255, .88);
  color: inherit;
  cursor: pointer;
}

.operator-progress-card {
  min-height: 102px;
  padding: .78rem;
  border-radius: 17px;
}

.operator-progress-card.advanced {
  background: linear-gradient(180deg, rgba(249, 251, 255, .94), rgba(255, 255, 255, .88));
}

.operator-progress-card span,
.operator-progress-card small,
.operator-metric-card span,
.operator-metric-card small {
  display: block;
  font-size: .65rem;
  font-weight: 900;
}

.operator-progress-card strong,
.operator-metric-card strong {
  display: block;
  margin: .28rem 0 .08rem;
  color: #16263b;
  font-size: 1.34rem;
  line-height: 1;
  font-weight: 950;
  letter-spacing: -.045em;
}

.operator-progress-card i {
  display: block;
  height: .38rem;
  margin-top: .62rem;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(33, 71, 48, .11);
}

.operator-progress-card em {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #7aa985, #2f7a4c);
}

.operator-progress-card.advanced em {
  background: linear-gradient(90deg, #7a96c8, #3f6fbe);
}

.operator-quick-strip {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: .55rem;
  margin: 0 1.65rem .78rem;
}

.operator-quick-strip article {
  display: flex;
  align-items: center;
  gap: .55rem;
  min-width: 0;
  min-height: 3.05rem;
  border: 1px solid rgba(218, 227, 222, .9);
  border-radius: 15px;
  background: rgba(255, 255, 255, .72);
  padding: .55rem .6rem;
}

.operator-quick-strip svg {
  color: #2f7a4c;
  flex: 0 0 auto;
}

.operator-quick-strip article div {
  min-width: 0;
}

.operator-quick-strip article span,
.operator-quick-strip article strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.operator-quick-strip article span {
  font-size: .58rem;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.operator-quick-strip article strong {
  margin-top: .12rem;
  color: #182942;
  font-size: .73rem;
  font-weight: 950;
}

.operator-tabs {
  display: flex;
  gap: .45rem;
  margin: 0 1.65rem .82rem;
  padding: .3rem;
  border: 1px solid rgba(218, 227, 222, .9);
  border-radius: 15px;
  background: rgba(245, 249, 246, .82);
}

.operator-tabs button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: .4rem;
  min-height: 2.1rem;
  flex: 1;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: #647083;
  font-size: .73rem;
  font-weight: 930;
}

.operator-tabs button.active {
  background: #fff;
  color: #245f36;
  box-shadow: 0 9px 20px rgba(23, 49, 33, .07);
}

.operator-body {
  min-height: 0;
  overflow: auto;
  padding: 0 1.65rem 1.55rem;
  scrollbar-width: thin;
  scrollbar-color: rgba(100, 136, 113, .45) rgba(232, 240, 235, .62);
}

.operator-body::-webkit-scrollbar { width: 10px; }
.operator-body::-webkit-scrollbar-track { background: rgba(232, 240, 235, .62); border-radius: 999px; }
.operator-body::-webkit-scrollbar-thumb { background: rgba(100, 136, 113, .45); border: 3px solid rgba(232, 240, 235, .62); border-radius: 999px; }

.operator-section-panel {
  min-height: 100%;
}

.operator-overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.06fr) minmax(0, .94fr);
  gap: .85rem;
}

.operator-panel {
  min-width: 0;
  border: 1px solid rgba(217, 226, 221, .95);
  border-radius: 19px;
  background: rgba(255, 255, 255, .80);
  box-shadow: 0 16px 35px rgba(23, 49, 33, .042);
  padding: .95rem;
}

.full-panel {
  min-height: 100%;
}

.operator-panel-heading {
  display: flex;
  align-items: flex-start;
  gap: .62rem;
  margin-bottom: .82rem;
}

.operator-panel-heading > span {
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 999px;
  color: #24623b;
  background: rgba(239, 251, 240, .96);
  box-shadow: inset 0 0 0 1px rgba(195, 231, 198, .75);
}

.operator-panel-heading h4 {
  margin: 0;
  color: #18233a;
  font-size: .94rem;
  line-height: 1.05;
  font-weight: 950;
  letter-spacing: -.02em;
}

.operator-panel-heading p {
  margin: .18rem 0 0;
  font-size: .68rem;
  font-weight: 760;
}

.operator-metric-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: .65rem;
}

.operator-metric-card {
  min-height: 6.25rem;
  padding: .78rem;
  border-radius: 15px;
}

.operator-missing-preview {
  margin-top: .85rem;
  padding-top: .78rem;
  border-top: 1px solid rgba(221, 228, 224, .92);
}

.operator-missing-preview > strong {
  display: block;
  margin-bottom: .5rem;
  color: #26354d;
  font-size: .76rem;
  font-weight: 950;
}

.operator-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: .38rem;
}

.operator-chip-list span {
  display: inline-flex;
  align-items: center;
  min-height: 1.52rem;
  border: 1px solid rgba(239, 154, 154, .6);
  border-radius: 999px;
  background: rgba(255, 246, 246, .9);
  color: #a23e3e;
  padding: .17rem .52rem;
  font-size: .63rem;
  font-weight: 900;
}

.operator-missing-preview p {
  margin: 0;
  color: #557062;
  font-size: .73rem;
  font-weight: 820;
}

.operator-data-list {
  margin: 0;
  overflow: hidden;
  border: 1px solid rgba(221, 227, 224, .98);
  border-radius: 13px;
  background: rgba(255, 255, 255, .86);
}

.operator-data-list div {
  display: grid;
  grid-template-columns: 9.2rem minmax(0, 1fr);
  align-items: center;
  min-height: 2.34rem;
}

.operator-data-list div + div {
  border-top: 1px solid rgba(221, 227, 224, .96);
}

.operator-data-list dt,
.operator-data-list dd {
  margin: 0;
}

.operator-data-list dt {
  padding-left: .85rem;
  font-size: .69rem;
  font-weight: 850;
}

.operator-data-list dd {
  min-width: 0;
  padding-right: .85rem;
  color: #293347;
  font-size: .73rem;
  font-weight: 910;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.operator-family-cards,
.operator-document-grid,
.operator-field-grid,
.operator-family-detail-grid {
  display: grid;
  gap: .62rem;
}

.operator-family-cards {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.operator-family-card {
  min-width: 0;
  border: 1px solid rgba(227, 218, 216, .95);
  border-radius: 15px;
  background: rgba(255, 252, 250, .86);
  padding: .75rem;
}

.operator-family-card.complete {
  border-color: rgba(178, 223, 185, .86);
  background: rgba(248, 253, 248, .92);
}

.operator-family-card div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .55rem;
}

.operator-family-card strong {
  color: #24364e;
  font-size: .78rem;
  font-weight: 950;
}

.operator-family-card small {
  font-size: .61rem;
  font-weight: 950;
}

.operator-family-card p,
.operator-family-card span {
  display: block;
  margin: .45rem 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.operator-family-card p {
  color: #182942;
  font-size: .74rem;
  font-weight: 900;
}

.operator-family-card span {
  font-size: .64rem;
  font-weight: 760;
}

.operator-document-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.operator-document-grid span {
  display: flex;
  align-items: center;
  gap: .38rem;
  min-width: 0;
  min-height: 2.1rem;
  border: 1px solid rgba(238, 199, 199, .78);
  border-radius: 12px;
  background: rgba(255, 247, 247, .82);
  color: #a33b3b;
  padding: .38rem .5rem;
  font-size: .63rem;
  font-weight: 880;
}

.operator-document-grid span.present {
  border-color: rgba(184, 226, 174, .78);
  background: rgba(244, 252, 242, .88);
  color: #257e2e;
}

.operator-field-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.operator-field-grid.compact {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.operator-field-row {
  display: flex;
  align-items: center;
  gap: .55rem;
  min-width: 0;
  min-height: 3.1rem;
  border: 1px solid rgba(236, 203, 203, .78);
  border-radius: 14px;
  background: rgba(255, 248, 248, .82);
  padding: .58rem .65rem;
}

.operator-field-row.complete {
  border-color: rgba(190, 226, 195, .9);
  background: rgba(248, 253, 249, .9);
}

.operator-field-status {
  width: .58rem;
  height: .58rem;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #e05a5a;
  box-shadow: 0 0 0 4px rgba(224, 90, 90, .11);
}

.operator-field-row.complete .operator-field-status {
  background: #35a853;
  box-shadow: 0 0 0 4px rgba(53, 168, 83, .11);
}

.operator-field-row div {
  min-width: 0;
}

.operator-field-row strong,
.operator-field-row small {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.operator-field-row strong {
  color: #22334a;
  font-size: .7rem;
  font-weight: 950;
}

.operator-field-row small {
  margin-top: .12rem;
  font-size: .64rem;
  font-weight: 760;
}

.operator-advanced-groups {
  display: grid;
  gap: .9rem;
}

.operator-advanced-group h5 {
  margin: 0 0 .5rem;
  color: #506174;
  font-size: .68rem;
  font-weight: 950;
  letter-spacing: .12em;
  text-transform: uppercase;
}

.operator-family-detail-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.operator-data-list.tall div {
  grid-template-columns: 7.2rem minmax(0, 1fr);
}

.operator-list-title {
  background: rgba(247, 250, 248, .92);
}

.operator-list-title dt,
.operator-list-title dd {
  color: #245f36;
  font-weight: 950;
}

.operator-loading-stage {
  align-self: start;
  display: flex;
  align-items: center;
  gap: .85rem;
  margin: 0 1.65rem 1.65rem;
  padding: 1rem;
  border: 1px solid rgba(189, 218, 198, .86);
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(246, 253, 248, .96), rgba(255, 255, 255, .94));
  color: #214d30;
  box-shadow: 0 14px 28px rgba(24, 64, 38, .05);
}

.operator-loading-stage strong {
  display: block;
  font-size: .9rem;
  font-weight: 950;
}

.operator-loading-stage p {
  margin: .18rem 0 0;
  color: #6f7d73;
  font-size: .76rem;
  font-weight: 720;
}

.operator-spinner {
  width: 1rem;
  height: 1rem;
  border-radius: 999px;
  border: 2px solid rgba(112, 151, 122, .25);
  border-top-color: #3a8750;
  animation: operator-spin .85s linear infinite;
}

.operator-spinner.large {
  width: 1.45rem;
  height: 1.45rem;
  border-width: 3px;
}

@media (max-width: 1120px), (max-height: 820px) {
  .operator-info-backdrop { padding: 1rem; }
  .operator-info-modal { width: min(1060px, calc(100vw - 2rem)); height: min(800px, calc(100vh - 2rem)); border-radius: 24px; }
  .operator-info-header { padding: 1.18rem 1.25rem .62rem; }
  .operator-info-heading h2 { font-size: 1.36rem; }
  .operator-hero { grid-template-columns: auto minmax(0, 1fr) minmax(290px, 350px); margin-inline: 1.25rem; padding: .82rem; }
  .operator-photo-card { --student-account-photo-size: 78px; --student-account-photo-radius: 22px; --student-account-photo-fallback-size: 54px; --student-account-photo-fallback-font-size: 18px; }
  .operator-identity h3 { font-size: 1.2rem; }
  .operator-progress-card { min-height: 88px; padding: .64rem; }
  .operator-progress-card strong { font-size: 1.14rem; }
  .operator-quick-strip, .operator-tabs { margin-inline: 1.25rem; }
  .operator-body { padding-inline: 1.25rem; }
  .operator-quick-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .operator-field-grid.compact { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 880px) {
  .operator-info-backdrop { align-items: flex-start; overflow: auto; padding: .75rem; }
  .operator-info-modal { width: 100%; height: auto; min-height: calc(100vh - 1.5rem); }
  .operator-info-header, .operator-info-actions { flex-direction: column; align-items: stretch; }
  .operator-info-actions { display: grid; grid-template-columns: 1fr 1fr auto; }
  .operator-hero { grid-template-columns: auto minmax(0, 1fr); }
  .operator-progress-pair { grid-column: 1 / -1; }
  .operator-quick-strip, .operator-overview-grid, .operator-field-grid, .operator-field-grid.compact, .operator-family-detail-grid { grid-template-columns: 1fr; }
  .operator-family-cards, .operator-document-grid, .operator-metric-row { grid-template-columns: 1fr; }
  .operator-tabs { overflow-x: auto; }
  .operator-tabs button { flex: 0 0 auto; min-width: 8rem; }
}

@media (prefers-reduced-motion: reduce) {
  .spinning,
  .operator-spinner {
    animation: none;
  }
}
</style>
