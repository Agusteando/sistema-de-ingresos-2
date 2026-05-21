<template>
  <Teleport to="body">
    <div class="operator-info-backdrop" role="dialog" aria-modal="true" @click.self="$emit('close')">
      <section class="operator-info-modal" aria-label="Ver información de alumno">
        <header class="operator-info-header">
          <div class="operator-info-heading">
            <span>Vista de operador</span>
            <h2>Expediente del alumno</h2>
            <p>Consulta de solo lectura del expediente ampliado desde base del plantel y matrícula centralizada.</p>
          </div>

          <div class="operator-info-actions">
            <button type="button" class="operator-action" :disabled="loading" @click="loadDetail">
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

        <div v-if="error" class="operator-alert error">
          <LucideAlertTriangle :size="16" />
          <span>{{ error }}</span>
        </div>

        <div class="operator-hero">
          <div class="operator-avatar" aria-hidden="true">
            <span>{{ initials }}</span>
          </div>

          <div class="operator-hero-main">
            <h3>{{ fullName }}</h3>
            <div class="operator-chips">
              <span class="chip matricula">{{ safeMatricula }}</span>
              <span class="chip status"><span></span>{{ displayStatus }}</span>
              <span class="chip source"><LucideDatabase :size="15" /> {{ sourceLabel }}</span>
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

        <div v-if="loading && !detail" class="operator-loading">
          <span class="operator-spinner" aria-hidden="true"></span>
          Cargando expediente consolidado…
        </div>

        <div v-else class="operator-grid">
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
            <h4><LucideUsersRound :size="21" /> Familia / tutores</h4>
            <div class="family-grid">
              <section class="family-card">
                <h5><LucideUsersRound :size="19" /> Padre / tutor</h5>
                <dl>
                  <div><dt>Teléfono</dt><dd>{{ parentPhone }}</dd></div>
                  <div><dt>Email</dt><dd>{{ parentEmail }}</dd></div>
                  <div><dt>Ocupación</dt><dd>{{ parentOccupation }}</dd></div>
                </dl>
              </section>
              <section class="family-card">
                <h5><LucideMail :size="19" /> Madre</h5>
                <dl>
                  <div><dt>Email</dt><dd>{{ motherEmail }}</dd></div>
                  <div><dt>Teléfono</dt><dd>{{ motherPhone }}</dd></div>
                  <div><dt>Ocupación</dt><dd>{{ motherOccupation }}</dd></div>
                </dl>
              </section>
            </div>
            <div class="soft-note">
              <LucideInfo :size="16" />
              La información de tutores se muestra solo cuando está registrada en el sistema.
            </div>
          </article>

          <article class="operator-panel sync-panel">
            <h4><LucideRefreshCw :size="21" /> Sistema / sincronización</h4>
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

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== ''
const firstValue = (...values) => values.find(hasValue) || ''
const fallbackText = (value, fallback = 'Sin registrar') => hasValue(value) ? String(value) : fallback
const titleCase = (value) => {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.toLocaleLowerCase('es-MX').replace(/(^|\s|\/|-)(\p{L})/gu, (_, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('es-MX')}`)
}

const loadDetail = async () => {
  const matricula = String(props.student?.matricula || '').trim()
  if (!matricula) return

  const currentId = ++requestId
  loading.value = true
  error.value = ''

  try {
    const response = await $fetch(`/api/students/${encodeURIComponent(matricula)}/operator-info`)
    if (currentId !== requestId) return
    detail.value = response || null
  } catch (err) {
    if (currentId !== requestId) return
    detail.value = null
    error.value = err?.data?.message || err?.message || 'No se pudo cargar el expediente del alumno.'
  } finally {
    if (currentId === requestId) loading.value = false
  }
}

const source = computed(() => ({ ...(props.student || {}), ...(detail.value || {}) }))

const safeMatricula = computed(() => fallbackText(firstValue(source.value.matricula, props.student?.matricula), 'Sin matrícula'))
const fullName = computed(() => fallbackText(firstValue(source.value.fullName, source.value.nombreCompleto, source.value.nombre, props.student?.nombre), 'Alumno'))
const displayStatus = computed(() => titleCase(firstValue(source.value.status, source.value.estatus, 'Activo')))
const displayNivel = computed(() => titleCase(firstValue(source.value.nivel, props.student?.nivel)) || 'Nivel')
const displayGrado = computed(() => titleCase(firstValue(source.value.grado, props.student?.grado)) || 'Grado')
const displayGrupo = computed(() => {
  const group = firstValue(source.value.group, source.value.grupo, props.student?.grupo)
  return group ? `Grupo ${String(group).replace(/^grupo\s+/i, '')}` : 'Grupo'
})
const displayServicio = computed(() => titleCase(firstValue(source.value.servicio, source.value.program, source.value.nivel, props.student?.servicio)))
const displayServiceBadge = computed(() => titleCase(firstValue(source.value.tipoIngreso, source.value.tipo_ingreso, source.value.ingreso, props.student?.tipoIngreso, 'Externo')))
const sourceLabel = computed(() => 'Base local')

const initials = computed(() => {
  const paternal = firstValue(source.value.apellidoPaterno, source.value.apellido_paterno)
  const maternal = firstValue(source.value.apellidoMaterno, source.value.apellido_materno)
  if (paternal || maternal) return `${String(paternal || '').charAt(0)}${String(maternal || '').charAt(0)}`.toUpperCase() || 'AL'
  const parts = fullName.value.split(/\s+/).filter(Boolean)
  return `${parts[0]?.charAt(0) || 'A'}${parts[1]?.charAt(0) || 'L'}`.toUpperCase()
})

const identityRows = computed(() => [
  { label: 'Matrícula', value: safeMatricula.value },
  { label: 'Nombre completo', value: fullName.value },
  { label: 'Apellido paterno', value: fallbackText(source.value.apellidoPaterno) },
  { label: 'Apellido materno', value: fallbackText(source.value.apellidoMaterno) },
  { label: 'Nombre(s)', value: fallbackText(source.value.nombres) }
])

const schoolSummary = computed(() => [
  { label: 'Plantel', value: fallbackText(firstValue(source.value.plantel, source.value.basePlantel)), icon: LucideBuilding2 },
  { label: 'Nivel', value: fallbackText(displayNivel.value), icon: LucideBookOpen },
  { label: 'Grado', value: fallbackText(displayGrado.value), icon: LucideSchool },
  { label: 'Grupo', value: fallbackText(firstValue(source.value.group, source.value.grupo)), icon: LucideUsersRound },
  { label: 'Servicio', value: fallbackText(displayServicio.value), icon: LucideBadgeCheck },
  { label: 'Interno', value: fallbackText(source.value.interno), icon: LucideDatabase },
  { label: 'Estatus', value: fallbackText(displayStatus.value), icon: LucideShieldCheck },
  { label: 'Fuente', value: detail.value?.detailSource === 'base+matricula' ? 'base + matrícula' : 'base', icon: LucideDatabase }
])

const parentPhone = computed(() => fallbackText(firstValue(source.value.telefonoPadre, source.value.phone, source.value.telefono)))
const parentEmail = computed(() => fallbackText(firstValue(source.value.emailPadre, source.value.email, source.value.correo)))
const parentOccupation = computed(() => fallbackText(firstValue(source.value.ocupacionPadre, source.value.ocupacionTutor)))
const motherEmail = computed(() => fallbackText(source.value.emailMadre))
const motherPhone = computed(() => fallbackText(source.value.telefonoMadre))
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
  { label: 'Fuente de datos', value: 'Base local (plantel)' },
  { label: 'Estado de sincronización', value: detail.value?.detailSource === 'base+matricula' ? 'Sincronizado' : 'Base local', kind: 'status' },
  { label: 'Última actualización', value: formatDate(source.value.updatedAt) },
  { label: 'Referencia centralizada', value: detail.value?.rawMatricula && Object.keys(detail.value.rawMatricula).length ? 'Expediente en matrícula centralizada' : 'Sin overlay centralizado' },
  { label: 'Notas', value: 'Consulta de solo lectura. Datos consolidados.' }
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

.chip.source {
  color: #3162c5;
  background: rgba(247, 250, 255, .96);
  border-color: rgba(198, 216, 247, .8);
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
  .operator-grid { grid-template-columns: 1fr; grid-template-rows: none; }
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .family-grid { grid-template-columns: 1fr; }
}
</style>
