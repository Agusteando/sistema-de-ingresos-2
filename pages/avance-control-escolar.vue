<template>
  <div class="control-audit-page">
    <section class="audit-hero">
      <div class="audit-hero-copy">
        <span>Auditoría Control Escolar</span>
        <h1>Avance Control Escolar</h1>
        <p>
          Resumen ligero por plantel y ciclo escolar: quién entró, qué vistas se resolvieron,
          qué alumnos fueron actualizados y qué avance tenía la captura cuando Control Escolar estuvo en pantalla.
        </p>
      </div>
      <div class="audit-hero-actions">
        <label>
          <small>Plantel</small>
          <select v-model="selectedPlantel" @change="loadAudit({ force: true })">
            <option v-if="isSuperAdmin" value="ALL">Todos</option>
            <option v-for="plantel in visiblePlanteles" :key="plantel" :value="plantel">Plantel {{ plantel }}</option>
          </select>
        </label>
        <label>
          <small>Ciclo</small>
          <select v-model="selectedCiclo" @change="loadAudit({ force: true })">
            <option value="">Todos</option>
            <option v-for="ciclo in CICLOS_LIST" :key="ciclo.value" :value="ciclo.value">{{ ciclo.label }}</option>
          </select>
        </label>
        <button type="button" :disabled="loading" @click="loadAudit({ force: true })">
          <LucideRefreshCw :class="{ spinning: loading }" :size="17" />
          Actualizar
        </button>
      </div>
    </section>

    <section class="audit-summary-grid">
      <div v-if="error" class="audit-error-card">
        {{ error }}
      </div>
      <article class="audit-progress-card">
        <div class="audit-progress-ring" :style="progressRingStyle">
          <strong>{{ progressPercentLabel }}</strong>
          <span>avance</span>
        </div>
        <div>
          <small>Ciclo observado</small>
          <h2>{{ watchedCicloLabel }}</h2>
          <p>
            {{ summary.completedStudents || 0 }} expedientes completos de
            {{ summary.totalStudents || 0 }} evaluados. Pendientes: {{ summary.pendingStudents || 0 }}.
          </p>
        </div>
      </article>

      <article class="audit-stat-card">
        <small>Actualizaciones alumno</small>
        <strong>{{ summary.studentUpdateCount || 0 }}</strong>
        <span>Matrículas modificadas recientemente</span>
      </article>
      <article class="audit-stat-card">
        <small>Vistas auditadas</small>
        <strong>{{ summary.snapshotCount || 0 }}</strong>
        <span>Snapshots de estado capturados</span>
      </article>
      <article class="audit-stat-card">
        <small>Logins Control Escolar</small>
        <strong>{{ summary.loginCount || 0 }}</strong>
        <span>Entradas registradas</span>
      </article>
    </section>

    <section class="audit-content-grid">
      <article class="audit-panel audit-panel-main">
        <header>
          <div>
            <small>Timeline</small>
            <h2>Última actividad</h2>
          </div>
          <span>{{ timeline.length }} eventos</span>
        </header>

        <div v-if="loading && !timeline.length" class="audit-empty-state">
          <LucideRefreshCw class="spinning" :size="20" />
          Cargando auditoría reciente…
        </div>

        <ol v-else-if="timeline.length" class="audit-timeline">
          <li v-for="event in timeline" :key="`${event.plantel}-${event.id}-${event.createdAt}`" :class="`is-${eventTone(event.type)}`">
            <div class="audit-timeline-marker">
              <component :is="eventIcon(event.type)" :size="16" />
            </div>
            <div class="audit-timeline-card">
              <div class="audit-timeline-head">
                <div>
                  <span>{{ eventTypeLabel(event.type) }}</span>
                  <h3>{{ event.summary }}</h3>
                </div>
                <time>{{ formatDateTime(event.createdAt) }}</time>
              </div>
              <div class="audit-timeline-meta">
                <b>Plantel {{ event.plantel || selectedPlantel }}</b>
                <b v-if="event.ciclo">Ciclo {{ event.ciclo }}</b>
                <b v-if="event.matricula">Matrícula {{ event.matricula }}</b>
                <b v-if="event.progressPercent != null">{{ Number(event.progressPercent).toFixed(0) }}% avance</b>
              </div>
              <p v-if="event.actorName || event.actorEmail">
                {{ event.actorName || event.actorEmail }}
                <span v-if="event.sourceFlow">· {{ event.sourceFlow }}</span>
              </p>
            </div>
          </li>
        </ol>

        <div v-else class="audit-empty-state">
          <LucideClock3 :size="20" />
          Aún no hay actividad de Control Escolar para este filtro.
        </div>
      </article>

      <aside class="audit-side-stack">
        <article class="audit-panel">
          <header>
            <div>
              <small>Análisis</small>
              <h2>Estado más reciente</h2>
            </div>
          </header>
          <dl class="audit-facts">
            <div>
              <dt>Base usada</dt>
              <dd>{{ summary.sourceBase || 'Sin snapshot reciente' }}</dd>
            </div>
            <div>
              <dt>Flujo</dt>
              <dd>{{ summary.sourceFlow || 'Sin flujo registrado' }}</dd>
            </div>
            <div>
              <dt>Última actividad</dt>
              <dd>{{ summary.latestAt ? formatDateTime(summary.latestAt) : 'Sin registro' }}</dd>
            </div>
            <div>
              <dt>Planteles observados</dt>
              <dd>{{ watchedPlantelesLabel }}</dd>
            </div>
          </dl>
          <p class="audit-note">
            Se conserva actividad reciente y se limita el historial por plantel/ciclo para evitar crecimiento innecesario.
          </p>
        </article>

        <article class="audit-panel">
          <header>
            <div>
              <small>Matrículas</small>
              <h2>Últimos alumnos actualizados</h2>
            </div>
          </header>
          <div v-if="updatedStudents.length" class="audit-student-list">
            <div v-for="student in updatedStudents" :key="`${student.plantel || selectedPlantel}-${student.matricula}`">
              <strong>{{ student.matricula }}</strong>
              <span>{{ student.plantel ? `Plantel ${student.plantel}` : `Plantel ${selectedPlantel}` }}</span>
              <small>{{ student.total }} cambio{{ Number(student.total) === 1 ? '' : 's' }} · {{ formatDateTime(student.lastAt) }}</small>
            </div>
          </div>
          <div v-else class="audit-mini-empty">Sin matrículas actualizadas en este filtro.</div>
        </article>

        <article class="audit-panel">
          <header>
            <div>
              <small>Pendientes</small>
              <h2>Qué falta por actualizar</h2>
            </div>
          </header>
          <div v-if="pendingBreakdown.length" class="audit-pending-grid">
            <div v-for="item in pendingBreakdown" :key="item.label">
              <strong>{{ item.value }}</strong>
              <span>{{ item.label }}</span>
            </div>
          </div>
          <div v-else class="audit-mini-empty">Sin desglose de pendientes en el último snapshot.</div>
        </article>
      </aside>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useCookie } from '#app'
import {
  LucideCheckCircle,
  LucideClock3,
  LucideEdit3,
  LucideEye,
  LucideLogIn,
  LucideRefreshCw,
} from 'lucide-vue-next'
import { CICLOS_LIST, PLANTELES_LIST, normalizeCicloOption } from '~/utils/constants'

const loading = ref(false)
const error = ref('')
const audit = ref({ summary: {}, timeline: [], updatedStudents: [], filters: {} })
const activePlantelCookie = useCookie('auth_active_plantel')
const plantelesCookie = useCookie('auth_planteles')
const roleCookie = useCookie('auth_role')
const superAdminCookie = useCookie('auth_is_super_admin')
const activeCicloCookie = useCookie('active_ciclo')

const roleTokens = computed(() => String(roleCookie.value || '').split(',').map((role) => role.trim().toLowerCase()).filter(Boolean))
const isSuperAdmin = computed(() => superAdminCookie.value === 'true' || roleTokens.value.some((role) => ['global', 'superadmin', 'role_super_admin', 'role_superadmin'].includes(role)))
const visiblePlanteles = computed(() => {
  if (isSuperAdmin.value) return [...PLANTELES_LIST]
  const parsed = String(plantelesCookie.value || '')
    .split(',')
    .map((plantel) => plantel.trim().toUpperCase())
    .filter((plantel) => PLANTELES_LIST.includes(plantel))
  return parsed.length ? parsed : [...PLANTELES_LIST]
})
const defaultPlantel = computed(() => {
  const active = String(activePlantelCookie.value || '').trim().toUpperCase()
  if (isSuperAdmin.value && (!active || active === 'GLOBAL')) return 'ALL'
  return visiblePlanteles.value.includes(active) ? active : visiblePlanteles.value[0]
})
const selectedPlantel = ref(defaultPlantel.value)
const selectedCiclo = ref(normalizeCicloOption(activeCicloCookie.value || ''))

const summary = computed(() => audit.value.summary || {})
const timeline = computed(() => audit.value.timeline || [])
const updatedStudents = computed(() => audit.value.updatedStudents || [])
const latestSnapshot = computed(() => timeline.value.find((event) => event.type === 'page_snapshot') || null)
const latestCounters = computed(() => latestSnapshot.value?.payload?.counters || {})
const pendingBreakdown = computed(() => [
  { label: 'Sin CURP', value: latestCounters.value.sinCurp },
  { label: 'Sin padre/tutor', value: latestCounters.value.sinPadre },
  { label: 'Sin madre', value: latestCounters.value.sinMadre },
  { label: 'Sin contacto', value: latestCounters.value.sinContacto },
  { label: 'Sin ficha matrícula', value: latestCounters.value.sinFichaMatricula },
].filter((item) => Number(item.value || 0) > 0))
const watchedCicloLabel = computed(() => summary.value.watchedCiclo || selectedCiclo.value || 'Todos los ciclos')
const progressPercent = computed(() => {
  const value = Number(summary.value.progressPercent)
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
})
const progressPercentLabel = computed(() => `${Math.round(progressPercent.value)}%`)
const progressRingStyle = computed(() => ({ '--audit-progress': `${progressPercent.value}%` }))
const watchedPlantelesLabel = computed(() => {
  const list = audit.value.filters?.watchedPlanteles || []
  if (!list.length) return selectedPlantel.value === 'ALL' ? 'Todos' : `Plantel ${selectedPlantel.value}`
  if (list.length > 4) return `${list.length} planteles`
  return list.map((plantel) => `Plantel ${plantel}`).join(', ')
})

const eventTone = (type) => ({
  control_login: 'login',
  page_snapshot: 'snapshot',
  student_update: 'update',
}[type] || 'snapshot')
const eventIcon = (type) => ({
  control_login: LucideLogIn,
  page_snapshot: LucideEye,
  student_update: LucideEdit3,
}[type] || LucideCheckCircle)
const eventTypeLabel = (type) => ({
  control_login: 'Login Control Escolar',
  page_snapshot: 'Snapshot de avance',
  student_update: 'Actualización de alumno',
}[type] || 'Evento')
const formatDateTime = (value) => {
  if (!value) return 'Sin fecha'
  try {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return String(value)
  }
}

const loadAudit = async () => {
  loading.value = true
  error.value = ''
  try {
    audit.value = await $fetch('/api/control-escolar/audit', {
      query: {
        plantel: selectedPlantel.value,
        ciclo: selectedCiclo.value,
        limit: 60,
      },
    })
  } catch (requestError) {
    error.value = requestError?.data?.message || requestError?.message || 'No se pudo cargar la auditoría.'
  } finally {
    loading.value = false
  }
}

onMounted(loadAudit)
</script>

<style scoped>
.control-audit-page {
  display: grid;
  gap: 1.15rem;
  min-height: 100%;
  padding: 1rem;
  color: #16243a;
}

.audit-hero,
.audit-panel,
.audit-progress-card,
.audit-stat-card {
  border: 1px solid rgba(215, 226, 218, .9);
  background: rgba(255, 255, 255, .94);
  box-shadow: 0 18px 44px rgba(28, 53, 72, .07);
}

.audit-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: end;
  border-radius: 26px;
  padding: 1.35rem;
  background:
    radial-gradient(circle at top right, rgba(124, 207, 92, .15), transparent 28rem),
    linear-gradient(135deg, rgba(255,255,255,.98), rgba(246,252,245,.94));
}

.audit-hero-copy span,
.audit-panel header small,
.audit-stat-card small,
.audit-progress-card small,
.audit-hero-actions small {
  color: #2b7338;
  font-size: .68rem;
  font-weight: 900;
  letter-spacing: .1em;
  text-transform: uppercase;
}

.audit-hero h1,
.audit-panel h2,
.audit-progress-card h2 {
  margin: .2rem 0 0;
  color: #172033;
  font-weight: 920;
  letter-spacing: -.045em;
}

.audit-hero h1 { font-size: clamp(1.8rem, 3vw, 2.8rem); }
.audit-panel h2 { font-size: 1rem; }
.audit-progress-card h2 { font-size: 1.2rem; }

.audit-hero p,
.audit-progress-card p,
.audit-note,
.audit-timeline-card p {
  margin: .55rem 0 0;
  color: #617085;
  line-height: 1.55;
}

.audit-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: .65rem;
  justify-content: flex-end;
}

.audit-hero-actions label {
  display: grid;
  gap: .3rem;
}

.audit-hero-actions select,
.audit-hero-actions button {
  min-height: 42px;
  border: 1px solid rgba(204, 220, 207, .95);
  border-radius: 14px;
  background: white;
  padding: 0 .85rem;
  color: #21314a;
  font-weight: 800;
}

.audit-hero-actions button {
  display: inline-flex;
  align-items: center;
  gap: .45rem;
  align-self: end;
  cursor: pointer;
}

.spinning { animation: auditSpin 900ms linear infinite; }

.audit-summary-grid {
  display: grid;
  grid-template-columns: minmax(280px, 1.35fr) repeat(3, minmax(160px, .65fr));
  gap: 1rem;
}

.audit-error-card {
  grid-column: 1 / -1;
  border: 1px solid rgba(245, 190, 178, .95);
  border-radius: 18px;
  background: #fff4f1;
  padding: .85rem 1rem;
  color: #a83a2f;
  font-size: .86rem;
  font-weight: 820;
}

.audit-progress-card {
  display: flex;
  gap: 1rem;
  align-items: center;
  border-radius: 24px;
  padding: 1rem;
}

.audit-progress-ring {
  display: grid;
  width: 118px;
  height: 118px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 999px;
  background:
    radial-gradient(circle at center, #fff 0 56%, transparent 57%),
    conic-gradient(#2f9d4a var(--audit-progress), #e8f0ea 0);
  box-shadow: inset 0 0 0 1px rgba(210, 225, 213, .9), 0 14px 28px rgba(26, 101, 48, .11);
}

.audit-progress-ring strong {
  align-self: end;
  color: #176b31;
  font-size: 1.75rem;
  font-weight: 950;
  line-height: 1;
}

.audit-progress-ring span {
  align-self: start;
  color: #6a7c72;
  font-size: .68rem;
  font-weight: 900;
  text-transform: uppercase;
}

.audit-stat-card {
  display: grid;
  align-content: center;
  gap: .35rem;
  min-height: 134px;
  border-radius: 22px;
  padding: 1rem;
}

.audit-stat-card strong {
  color: #172033;
  font-size: 2rem;
  font-weight: 950;
  line-height: 1;
}

.audit-stat-card span {
  color: #68768a;
  font-size: .82rem;
  font-weight: 760;
}

.audit-content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, .42fr);
  gap: 1rem;
  min-height: 0;
}

.audit-side-stack {
  display: grid;
  align-content: start;
  gap: 1rem;
}

.audit-panel {
  border-radius: 24px;
  padding: 1rem;
}

.audit-panel header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: .9rem;
  margin-bottom: 1rem;
}

.audit-panel header > span {
  border-radius: 999px;
  background: #edf8ea;
  color: #257735;
  padding: .38rem .62rem;
  font-size: .72rem;
  font-weight: 900;
}

.audit-timeline {
  display: grid;
  gap: .75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.audit-timeline li {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: .75rem;
}

.audit-timeline-marker {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 999px;
  background: #eef6ff;
  color: #2c6ca8;
}

.audit-timeline li.is-login .audit-timeline-marker { background: #eef7ff; color: #2767a8; }
.audit-timeline li.is-snapshot .audit-timeline-marker { background: #f0f8ed; color: #2d7c36; }
.audit-timeline li.is-update .audit-timeline-marker { background: #fff7e8; color: #aa681b; }

.audit-timeline-card {
  border: 1px solid rgba(224, 232, 226, .94);
  border-radius: 18px;
  background: linear-gradient(180deg, #fff, #fbfdfb);
  padding: .9rem;
}

.audit-timeline-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.audit-timeline-head span {
  color: #78869a;
  font-size: .68rem;
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.audit-timeline-head h3 {
  margin: .2rem 0 0;
  color: #18243a;
  font-size: .95rem;
  font-weight: 860;
}

.audit-timeline-head time {
  flex: 0 0 auto;
  color: #7b8797;
  font-size: .74rem;
  font-weight: 800;
}

.audit-timeline-meta {
  display: flex;
  flex-wrap: wrap;
  gap: .4rem;
  margin-top: .7rem;
}

.audit-timeline-meta b {
  border-radius: 999px;
  background: #f3f6f5;
  color: #445369;
  padding: .28rem .48rem;
  font-size: .68rem;
  font-weight: 850;
}

.audit-facts {
  display: grid;
  gap: .65rem;
  margin: 0;
}

.audit-facts div,
.audit-student-list div {
  display: grid;
  gap: .2rem;
  border: 1px solid rgba(224, 232, 226, .92);
  border-radius: 16px;
  background: #fbfdfb;
  padding: .75rem;
}

.audit-facts dt,
.audit-student-list span,
.audit-student-list small {
  color: #7a8795;
  font-size: .68rem;
  font-weight: 850;
  letter-spacing: .05em;
  text-transform: uppercase;
}

.audit-facts dd {
  margin: 0;
  color: #1d2d45;
  font-size: .82rem;
  font-weight: 760;
  overflow-wrap: anywhere;
}

.audit-note {
  border-radius: 16px;
  background: #f3faf2;
  padding: .75rem;
  color: #4e7158;
  font-size: .78rem;
  font-weight: 730;
}

.audit-student-list {
  display: grid;
  gap: .6rem;
}

.audit-pending-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: .6rem;
}

.audit-pending-grid div {
  display: grid;
  gap: .2rem;
  border: 1px solid rgba(235, 219, 191, .95);
  border-radius: 16px;
  background: #fffaf1;
  padding: .75rem;
}

.audit-pending-grid strong {
  color: #985d16;
  font-size: 1.25rem;
  font-weight: 950;
}

.audit-pending-grid span {
  color: #8a7351;
  font-size: .68rem;
  font-weight: 850;
  letter-spacing: .05em;
  text-transform: uppercase;
}

.audit-student-list strong {
  color: #16243a;
  font-size: .96rem;
  font-weight: 900;
}

.audit-mini-empty,
.audit-empty-state {
  display: flex;
  align-items: center;
  gap: .55rem;
  border: 1px dashed rgba(198, 214, 204, .95);
  border-radius: 18px;
  padding: 1rem;
  color: #607083;
  font-weight: 760;
}

@keyframes auditSpin { to { transform: rotate(360deg); } }

@media (max-width: 1180px) {
  .audit-summary-grid,
  .audit-content-grid,
  .audit-hero {
    grid-template-columns: 1fr;
  }
  .audit-hero-actions { justify-content: flex-start; }
}

@media (max-width: 720px) {
  .audit-progress-card,
  .audit-timeline-head {
    flex-direction: column;
  }
  .audit-timeline-head time { flex: initial; }
}
</style>
