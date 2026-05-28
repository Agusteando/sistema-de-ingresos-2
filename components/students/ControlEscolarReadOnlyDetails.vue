<template>
  <section class="ce-readonly-card" aria-label="Información de alumno">
    <header class="ce-readonly-header">
      <div>
        <span>{{ eyebrow }}</span>
        <h3>{{ title }}</h3>
        <p>{{ description }}</p>
      </div>
      <button type="button" class="ce-readonly-refresh" :disabled="loading" @click="loadDetail">
        <LucideRefreshCw :size="14" :class="{ spinning: loading }" />
        Actualizar
      </button>
    </header>

    <div v-if="loading && !detail" class="ce-readonly-state">
      <span class="mini-spinner" aria-hidden="true"></span>
      Cargando expediente completo…
    </div>

    <div v-else-if="error" class="ce-readonly-state error">
      <LucideAlertTriangle :size="16" /> {{ error }}
    </div>

    <template v-else-if="detail">
      <div class="ce-readonly-grid">
        <article v-for="section in visibleSections" :key="section.title" class="ce-readonly-section">
          <h4><component :is="section.icon" :size="15" /> {{ section.title }}</h4>
          <dl>
            <template v-for="field in section.fields" :key="`${section.title}-${field.label}`">
              <div v-if="hasValue(field.value)">
                <dt>{{ field.label }}</dt>
                <dd>{{ field.value }}</dd>
              </div>
            </template>
          </dl>
        </article>
      </div>

      <details v-if="rawRows.length" class="ce-readonly-raw">
        <summary>
          <LucideDatabase :size="14" /> Ver campos técnicos disponibles
          <span>{{ rawRows.length }} campos</span>
        </summary>
        <div class="ce-raw-grid">
          <div v-for="row in rawRows" :key="`${row.source}-${row.key}`" class="ce-raw-item">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
            <small>{{ row.source }}</small>
          </div>
        </div>
      </details>
    </template>

    <div v-else class="ce-readonly-state muted">
      Sin expediente adicional para mostrar.
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  LucideAlertTriangle,
  LucideBookOpen,
  LucideDatabase,
  LucideGraduationCap,
  LucideHome,
  LucideMail,
  LucideRefreshCw,
  LucideShieldCheck,
  LucideUsersRound
} from 'lucide-vue-next'

const props = defineProps({
  matricula: { type: String, default: '' },
  fallbackStudent: { type: Object, default: null },
  endpointSuffix: { type: String, default: 'operator-info' },
  eyebrow: { type: String, default: 'Información de alumno' },
  title: { type: String, default: 'Expediente Control Escolar' },
  description: { type: String, default: 'Lectura desde el enriquecimiento de Control Escolar aplicado por matrícula.' }
})

const detail = ref(null)
const loading = ref(false)
const error = ref('')
let requestId = 0

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== ''
const firstValue = (...values) => values.find(hasValue) || ''
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
    candidate.telefonoPadre, candidate.telefonoMadre
  ].some(hasValue) ? candidate : null
}
const normalizeLabel = (key) => String(key || '')
  .replace(/_/g, ' ')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/\s+/g, ' ')
  .trim()

const fallbackDetail = () => {
  const base = props.fallbackStudent || {}
  const central = extractOverlayStudent(base.centralMatricula) || {}
  return {
    ...base,
    ...central,
    centralMatricula: central,
    matricula: firstValue(base.matricula, central.matricula, props.matricula)
  }
}

const loadDetail = async () => {
  const matricula = String(props.matricula || '').trim()
  if (!matricula) return

  const currentId = ++requestId
  const fallback = fallbackDetail()
  detail.value = Object.keys(fallback).length ? fallback : detail.value
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
      .find((item) => String(item?.matricula || '').trim().toUpperCase() === matricula.toUpperCase())
    detail.value = overlayStudent ? { ...fallback, ...overlayStudent, centralMatricula: overlayStudent } : fallback
    if (!overlayStudent && !Object.keys(detail.value || {}).length) {
      error.value = response?.message || 'No se pudo cargar el enriquecimiento de Control Escolar.'
    }
  } catch (err) {
    if (currentId !== requestId) return
    detail.value = detail.value || fallback
    if (!Object.keys(detail.value || {}).length) {
      error.value = err?.data?.message || err?.message || 'No se pudo cargar el enriquecimiento de Control Escolar.'
    }
  } finally {
    if (currentId === requestId) loading.value = false
  }
}

watch(() => props.matricula, () => {
  detail.value = null
  error.value = ''
  loadDetail()
}, { immediate: true })

const source = computed(() => detail.value || props.fallbackStudent || {})

const sections = computed(() => [
  {
    title: 'Escolar',
    icon: LucideGraduationCap,
    fields: [
      { label: 'Plantel', value: firstValue(source.value.plantel, source.value.basePlantel) },
      { label: 'Nivel', value: source.value.nivel },
      { label: 'Grado', value: source.value.grado },
      { label: 'Grupo', value: firstValue(source.value.group, source.value.grupo) },
      { label: 'Estatus', value: source.value.status || source.value.estatus },
      { label: 'Fuente', value: source.value.detailSource }
    ]
  },
  {
    title: 'Identidad',
    icon: LucideBookOpen,
    fields: [
      { label: 'Matrícula', value: source.value.matricula },
      { label: 'Nombre completo', value: firstValue(source.value.fullName, source.value.nombreCompleto) },
      { label: 'Apellido paterno', value: source.value.apellidoPaterno },
      { label: 'Apellido materno', value: source.value.apellidoMaterno },
      { label: 'Nombre(s)', value: source.value.nombres },
      { label: 'CURP', value: source.value.curp }
    ]
  },
  {
    title: 'Padre / tutor',
    icon: LucideUsersRound,
    fields: [
      { label: 'Nombre padre', value: firstValue(source.value.fatherName, source.value.nombrePadre) },
      { label: 'Teléfono padre', value: firstValue(source.value.telefonoPadre, source.value.phone, source.value.telefono) },
      { label: 'Email padre', value: firstValue(source.value.emailPadre, source.value.email, source.value.correo) },
      { label: 'Tutor principal', value: source.value.guardianName }
    ]
  },
  {
    title: 'Madre',
    icon: LucideMail,
    fields: [
      { label: 'Nombre madre', value: firstValue(source.value.motherName, source.value.nombreMadre) },
      { label: 'Teléfono madre', value: source.value.telefonoMadre },
      { label: 'Email madre', value: source.value.emailMadre }
    ]
  },
  {
    title: 'Domicilio',
    icon: LucideHome,
    fields: [
      { label: 'Dirección', value: source.value.address || source.value.direccion || source.value.domicilio },
      { label: 'Última actualización', value: source.value.updatedAt }
    ]
  },
  {
    title: 'Baja / seguimiento',
    icon: LucideShieldCheck,
    fields: [
      { label: 'Baja', value: source.value.baja ? 'Sí' : '' },
      { label: 'Motivo', value: source.value.motivoBaja },
      { label: 'Categoría', value: source.value.categoriaBaja },
      { label: 'Seguimiento', value: source.value.seguimientoBaja }
    ]
  }
])

const visibleSections = computed(() => sections.value.filter((section) => section.fields.some((field) => hasValue(field.value))))

const hiddenRawKeys = new Set([
  'matricula', 'plantel', 'grado', 'grupo', 'nivel', 'nombres', 'apellido_paterno', 'apellidoPaterno',
  'apellido_materno', 'apellidoMaterno', 'curp', 'email_padre', 'emailPadre', 'email_madre', 'emailMadre',
  'telefono_padre', 'telefonoPadre', 'telefono_madre', 'telefonoMadre', 'nombre_padre', 'nombrePadre',
  'nombre_madre', 'nombreMadre', 'baja', 'motivo_baja', 'motivoBaja', 'categoria_baja', 'categoriaBaja',
  'seguimiento_baja', 'seguimientoBaja', 'servicio', 'direccion', 'domicilio', 'calle', 'foto'
])

const rawRows = computed(() => {
  const rows = []
  const addRows = (sourceName, record) => {
    Object.entries(record || {}).forEach(([key, value]) => {
      if (hiddenRawKeys.has(key) || !hasValue(value)) return
      rows.push({ source: sourceName, key, label: normalizeLabel(key), value })
    })
  }
  addRows('matricula', detail.value?.rawMatricula)
  addRows('base', detail.value?.rawBase)
  return rows.slice(0, 80)
})
</script>

<style scoped>
.ce-readonly-card {
  border: 1px solid rgba(205, 221, 210, 0.92);
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(248,252,248,.92));
  box-shadow: 0 18px 40px rgba(55, 86, 66, 0.08);
  padding: 1rem;
}

.ce-readonly-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: .85rem;
}

.ce-readonly-header span {
  display: block;
  font-size: .62rem;
  font-weight: 900;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: #6f8678;
}

.ce-readonly-header h3 {
  margin: .12rem 0;
  font-size: 1rem;
  color: #1f3a2b;
}

.ce-readonly-header p {
  margin: 0;
  font-size: .74rem;
  color: #708071;
}

.ce-readonly-refresh {
  display: inline-flex;
  align-items: center;
  gap: .35rem;
  border: 1px solid rgba(118, 153, 128, .28);
  border-radius: 999px;
  background: #fff;
  color: #35533e;
  font-size: .72rem;
  font-weight: 800;
  padding: .42rem .66rem;
}

.ce-readonly-refresh:disabled { opacity: .65; cursor: wait; }
.spinning { animation: ce-spin .8s linear infinite; }
@keyframes ce-spin { to { transform: rotate(360deg); } }

.ce-readonly-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: .72rem;
}

.ce-readonly-section {
  border: 1px solid rgba(216, 226, 219, .88);
  border-radius: 18px;
  background: rgba(255,255,255,.78);
  padding: .78rem;
}

.ce-readonly-section h4 {
  display: flex;
  align-items: center;
  gap: .4rem;
  margin: 0 0 .55rem;
  font-size: .78rem;
  color: #243b2c;
}

.ce-readonly-section dl,
.ce-readonly-section div {
  margin: 0;
}

.ce-readonly-section dl {
  display: grid;
  gap: .46rem;
}

.ce-readonly-section dt,
.ce-raw-item dt {
  font-size: .6rem;
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: #829185;
}

.ce-readonly-section dd,
.ce-raw-item dd {
  margin: .08rem 0 0;
  color: #24372a;
  font-size: .78rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.ce-readonly-state {
  display: flex;
  align-items: center;
  gap: .5rem;
  border: 1px dashed rgba(143, 164, 149, .6);
  border-radius: 16px;
  color: #6c7d70;
  font-size: .82rem;
  font-weight: 700;
  padding: .9rem;
}

.ce-readonly-state.error {
  border-color: rgba(217, 91, 91, .3);
  color: #9a3434;
  background: rgba(255, 244, 244, .74);
}

.mini-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(104, 141, 113, .25);
  border-top-color: rgba(104, 141, 113, .95);
  border-radius: 999px;
  animation: ce-spin .8s linear infinite;
}

.ce-readonly-raw {
  margin-top: .8rem;
  border-top: 1px solid rgba(218, 226, 220, .85);
  padding-top: .72rem;
}

.ce-readonly-raw summary {
  display: flex;
  align-items: center;
  gap: .45rem;
  cursor: pointer;
  color: #48604d;
  font-size: .76rem;
  font-weight: 900;
}

.ce-readonly-raw summary span {
  margin-left: auto;
  color: #829185;
  font-size: .68rem;
}

.ce-raw-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: .5rem;
  margin-top: .7rem;
}

.ce-raw-item {
  border-radius: 12px;
  background: rgba(247, 250, 247, .95);
  padding: .55rem;
}

.ce-raw-item small {
  display: block;
  margin-top: .2rem;
  color: #9aa89d;
  font-size: .6rem;
  font-weight: 800;
}

@media (max-width: 980px) {
  .ce-readonly-grid,
  .ce-raw-grid { grid-template-columns: 1fr; }
}
</style>
