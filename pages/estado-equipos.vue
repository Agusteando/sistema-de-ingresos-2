<template>
  <div class="fleet">
    <header class="fleet-hero">
      <div class="fleet-hero-copy">
        <span class="fleet-eyebrow"><LucideActivity :size="15" /> Supervisión · Superadmin</span>
        <h2>Estado de los equipos</h2>
        <p>DB Bridge, Aurora Local y versiones instaladas. Información recibida directamente de cada equipo, sin interrumpir su operación.</p>
      </div>
      <div class="fleet-actions">
        <button class="fleet-copy" type="button" :disabled="!report" @click="copyDiagnostics">
          <LucideCopy :size="17" /> {{ copied ? 'Diagnóstico copiado' : 'Copiar diagnóstico JSON' }}
        </button>
        <button class="fleet-refresh" type="button" :disabled="loading" @click="load">
          <LucideRefreshCw :size="17" :class="{ spin: loading }" />
          {{ loading ? 'Consultando' : 'Actualizar' }}
        </button>
      </div>
    </header>

    <div v-if="error" class="fleet-error" role="alert">
      <LucideAlertTriangle :size="19" />
      <span>{{ error }}</span>
      <button type="button" @click="load">Reintentar</button>
    </div>

    <template v-if="report">
      <div class="fleet-stats">
        <div class="stat"><span class="stat-icon green"><LucideWifi :size="19" /></span><div><strong>{{ onlineCount }}</strong><small>Agentes conectados</small></div></div>
        <div class="stat"><span class="stat-icon mint"><LucideMonitorCheck :size="19" /></span><div><strong>{{ readyCount }}</strong><small>Aurora Local saludable</small></div></div>
        <div class="stat"><span class="stat-icon amber"><LucideGitCompareArrows :size="19" /></span><div><strong>{{ differentCount }}</strong><small>Versiones distintas al objetivo</small></div></div>
        <div class="stat"><span class="stat-icon neutral"><LucideCircleHelp :size="19" /></span><div><strong>{{ unknownCount }}</strong><small>Sin diagnóstico actual</small></div></div>
      </div>

      <div class="fleet-section-head">
        <div>
          <h3>Planteles</h3>
          <p>Conexión del agente y salud de la aplicación son señales independientes.</p>
        </div>
        <div class="fleet-meta"><LucideClock3 :size="15" /> {{ formatDate(checkedAt) }}</div>
      </div>

      <div class="fleet-grid">
        <article v-for="agent in report.agents" :key="agent.plantel" class="machine" :class="{ 'machine-unseen': !agent.observed }">
          <header class="machine-head">
            <div class="plantel-mark">{{ agent.plantel }}</div>
            <span class="state-pill" :class="agent.online ? 'pill-online' : agent.observed ? 'pill-offline' : 'pill-unknown'">
              <span class="state-dot" />
              {{ agent.online ? 'Conectado' : agent.observed ? 'Desconectado' : 'Sin registro' }}
            </span>
          </header>
          <div class="machine-name">{{ agent.hostname || 'Equipo no identificado' }}</div>
          <div class="machine-checks">
            <div class="check-row">
              <span><LucideServer :size="16" /> DB Agent</span>
              <strong :class="agent.online ? 'ok' : 'muted'">{{ agent.online ? 'En línea' : agent.observed ? 'Sin conexión' : 'Sin datos' }}</strong>
            </div>
            <div class="check-row">
              <span><LucideMonitor :size="16" /> Aurora Local</span>
              <strong :class="signalClass(agent, 'aurora')">{{ signalText(agent, 'aurora') }}</strong>
            </div>
            <div class="check-row">
              <span><LucideDatabase :size="16" /> MySQL local</span>
              <strong :class="signalClass(agent, 'mysql')">{{ signalText(agent, 'mysql') }}</strong>
            </div>
            <div class="check-row">
              <span><LucideSettings2 :size="16" /> Manager</span>
              <strong :class="signalClass(agent, 'manager')">{{ signalText(agent, 'manager') }}</strong>
            </div>
          </div>

          <div class="machine-releases">
            <div>
              <small>DB Agent · versión en ejecución</small>
              <span class="sha-line">
                <code>{{ shortSha(agent.commitSha) }}</code>
                <span class="version-tag" :class="agent.versionStatus">{{ versionLabel(agent) }}</span>
              </span>
              <span class="secondary-value">{{ agent.agentVersion || 'Versión no reportada' }}</span>
            </div>
            <div>
              <small>Aurora Local · versión instalada</small>
              <span class="sha-line"><code>{{ shortSha(agent.diagnostics?.installedSha) }}</code></span>
              <span class="secondary-value">{{ agent.diagnostics?.installedVersion || 'No reportada' }}</span>
            </div>
          </div>

          <footer class="machine-foot">
            <span :title="agent.lastSeenAt || ''"><LucideClock3 :size="14" /> {{ agent.observed ? 'Último contacto: ' + formatDate(agent.lastSeenAt) : 'Sin contacto registrado' }}</span>
            <span v-if="agent.telemetry === 'historical'" class="historical"><LucideHistory :size="14" /> Último diagnóstico histórico</span>
            <span v-else-if="agent.online && agent.telemetry === 'unknown'" class="historical"><LucideInfo :size="14" /> Agente sin telemetría nueva</span>
            <span v-else-if="agent.diagnostics?.lastUpdate?.ok === false" class="historical warning"><LucideAlertTriangle :size="14" /> Última actualización local fallida</span>
            <span v-else-if="agent.diagnosticsAt">Diagnóstico: {{ formatDate(agent.diagnosticsAt) }}</span>
          </footer>
        </article>
      </div>

      <div class="fleet-notes">
        <LucideInfo :size="19" />
        <p><strong>Interpretación:</strong> “Conectado” indica que el relayer recibe al DB Agent; no significa que Aurora Local esté lista. “Saludable” exige respuesta de Aurora y MySQL locales. Los equipos sin telemetría pueden tener un agente antiguo. Una versión distinta no implica por sí sola que sea más antigua. El arranque automático después de reiniciar Windows y el acceso offline completo requieren validación específica.</p>
      </div>
      <p class="fleet-source">
        <span v-if="report.targetSha">SHA objetivo del agente: <code>{{ report.targetSha.slice(0, 12) }}</code>.</span>
        <span v-else>SHA objetivo no configurado; la comparación de versiones está pendiente.</span>
        <span v-if="!report.relaySupportsDiagnostics">El relayer aún no admite telemetría detallada; se muestra la información compatible.</span>
        <span>Los datos históricos se conservan únicamente durante la ejecución actual del relayer.</span>
      </p>
    </template>
    <div v-else-if="loading" class="fleet-loading"><LucideLoader2 class="spin" :size="25" /> Consultando equipos…</div>
  </div>
</template>

<script setup lang="ts">
type Signal = 'ready' | 'unavailable' | 'unknown'
type Diagnosis = {
  manager: Signal
  aurora: Signal
  mysql: Signal
  installedSha: string | null
  installedVersion: string | null
  lastUpdate: { ok: boolean; at: string | null } | null
}
type Station = {
  plantel: string
  observed: boolean
  online: boolean
  hostname: string | null
  agentVersion: string | null
  commitSha: string | null
  versionStatus: 'current' | 'different' | 'unknown'
  lastSeenAt: string | null
  diagnosticsAt: string | null
  telemetry: 'live' | 'historical' | 'unknown'
  diagnostics: Diagnosis | null
}
type Report = { agents: Station[]; targetSha: string | null; relaySupportsDiagnostics: boolean }

const roleCookie = useCookie<string>('auth_role')
const authorized = computed(() => String(roleCookie.value || '').split(',').some(role => role.trim().toLowerCase() === 'superadmin'))
const report = ref<Report | null>(null)
const loading = ref(false)
const error = ref('')
const copied = ref(false)
const checkedAt = ref('')
let poll: ReturnType<typeof setInterval> | null = null

const onlineCount = computed(() => report.value?.agents.filter(a => a.online).length || 0)
const readyCount = computed(() => report.value?.agents.filter(a => a.online && a.telemetry === 'live' && a.diagnostics?.aurora === 'ready').length || 0)
const differentCount = computed(() => report.value?.agents.filter(a => a.versionStatus === 'different').length || 0)
const unknownCount = computed(() => report.value?.agents.filter(a => !a.online || a.telemetry !== 'live').length || 0)

async function load() {
  if (loading.value || !authorized.value) return
  loading.value = true
  error.value = ''
  try {
    report.value = await $fetch<Report>('/api/admin/sql-console/agents', { retry: 0 })
    copied.value = false
    checkedAt.value = new Date().toISOString()
  } catch (cause: any) {
    error.value = cause?.data?.message || 'No se pudo consultar el DB Relayer. Los datos anteriores se conservan.'
  } finally {
    loading.value = false
  }
}

async function copyDiagnostics() {
  if (!report.value) return
  const evidence = {
    schemaVersion: 1,
    collectedAt: new Date().toISOString(),
    source: 'aurora-superadmin-estado-equipos',
    ...report.value
  }
  try {
    await navigator.clipboard.writeText(JSON.stringify(evidence, null, 2))
    copied.value = true
  } catch {
    error.value = 'No se pudo copiar el diagnóstico. Verifica los permisos del portapapeles.'
  }
}

function signalText(agent: Station, key: 'manager' | 'aurora' | 'mysql') {
  if (!agent.online || agent.telemetry !== 'live') return 'Sin verificar'
  const value = agent.diagnostics?.[key] || 'unknown'
  return value === 'ready' ? 'Saludable' : value === 'unavailable' ? 'No disponible' : 'Sin verificar'
}
function signalClass(agent: Station, key: 'manager' | 'aurora' | 'mysql') {
  if (!agent.online || agent.telemetry !== 'live') return 'muted'
  return agent.diagnostics?.[key] === 'ready' ? 'ok' : agent.diagnostics?.[key] === 'unavailable' ? 'bad' : 'muted'
}
function shortSha(sha?: string | null) { return sha ? sha.slice(0, 10) : 'No reportado' }
function versionLabel(agent: Station) {
  return agent.versionStatus === 'current' ? 'Objetivo' : agent.versionStatus === 'different' ? 'Difiere' : 'Por verificar'
}
function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(date) : '—'
}
onMounted(() => {
  if (!authorized.value) { void navigateTo('/'); return }
  void load()
  poll = setInterval(() => { void load() }, 60000)
})
onUnmounted(() => { if (poll) clearInterval(poll) })
</script>

<style scoped>
.fleet { max-width: 1500px; margin: 0 auto; padding: clamp(12px, 2vw, 28px); font-family: Montserrat, sans-serif; color: #233c39; }
.fleet-hero { display: flex; justify-content: space-between; gap: 20px; align-items: center; border-radius: 27px; background: linear-gradient(120deg,#e8f6ef,#f6faf7 57%,#e9f2ff); padding: clamp(22px,3vw,38px); border: 1px solid #dcece4; }
.fleet-eyebrow { display: inline-flex; align-items: center; gap: 7px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; font-size: 11px; color: #3e8b74; }
.fleet-hero h2 { font-family: Fredoka, Montserrat, sans-serif; font-size: clamp(28px,3vw,38px); font-weight: 600; margin: 9px 0 7px; color: #254a3f; }
.fleet-hero p { line-height: 1.65; max-width: 610px; color: #607772; margin: 0; font-size: 13px; }
.fleet-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.fleet-copy { display:inline-flex; align-items:center; gap:8px; border:1px solid #bedbcc; border-radius:15px; background:white; color:#286f59; padding:12px 15px; font-family:inherit; font-size:12px; font-weight:700; cursor:pointer; }
.fleet-copy:disabled { opacity:.55; cursor:not-allowed; }
.fleet-refresh { display: inline-flex; align-items: center; gap: 9px; border: 0; border-radius: 15px; background: #286f59; color: white; padding: 13px 17px; font-weight: 700; font-size: 12px; cursor: pointer; white-space: nowrap; transition: transform .2s, box-shadow .2s; }
.fleet-refresh:not(:disabled):hover { transform: translateY(-2px); box-shadow: 0 8px 20px #286f5933; } .fleet-refresh:disabled { opacity: .6; cursor: wait; }
.fleet-stats { display:grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 13px; margin: 20px 0 29px; }
.stat { display:flex; align-items:center; gap:14px; background: white; padding: 17px; border-radius: 19px; border: 1px solid #e7efeb; box-shadow: 0 4px 20px #214c3810; min-width: 0; }
.stat-icon { width: 44px; height: 44px; border-radius: 15px; display: grid; place-items: center; flex-shrink: 0; }
.green { background: #e0f4e7; color: #24825b; } .mint { background: #e0f5f3; color: #217e7f; } .amber { background:#fff2dc; color:#a76e16; } .neutral { background: #edf1f5; color:#60717f; }
.stat strong { display:block; font-size: 26px; font-weight: 800; line-height: 1.1; } .stat small { display:block; color:#778881; font-size: 11px; margin-top: 5px; line-height: 1.4; }
.fleet-section-head { display:flex; justify-content:space-between; align-items:center; gap:15px; margin-bottom:15px; }
.fleet-section-head h3 { margin:0; font-family:Fredoka,Montserrat,sans-serif; font-weight:600; font-size:23px; }
.fleet-section-head p { margin:3px 0 0; color:#8a9992; font-size:12px; }
.fleet-meta { display:flex; align-items:center; gap:6px; white-space:nowrap; font-size:11px; color:#84958d; }
.fleet-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr)); gap:15px; }
.machine { background:white; border:1px solid #e2eee7; border-radius:22px; padding:20px; min-width:0; box-shadow:0 4px 18px #1f5a3c0b; transition:transform .22s,box-shadow .22s,border-color .22s; }
.machine:hover { transform:translateY(-3px); box-shadow:0 12px 30px #1f5a3c15; border-color:#bddccc; }
.machine-unseen { background:#fcfdfc; }
.machine-head { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.plantel-mark { font-family:Fredoka,Montserrat,sans-serif; font-size:25px; font-weight:600; color:#286c55; }
.state-pill { display:inline-flex; align-items:center; gap:7px; border-radius:30px; padding:7px 10px; font-size:10px; font-weight:800; white-space:nowrap; }
.pill-online { background:#e7f6ed; color:#267d4e; } .pill-offline { background:#fff0e7; color:#af6948; } .pill-unknown { background:#edf2f1; color:#7c8c86; }
.state-dot { width:7px; height:7px; border-radius:50%; background:currentColor; }
.machine-name { font-size:12px; color:#8a9890; margin:2px 0 17px; overflow-wrap:anywhere; min-height:17px; }
.machine-checks { display:grid; gap:11px; border-radius:15px; background:#f8fbf9; padding:15px; }
.check-row { display:flex; justify-content:space-between; align-items:center; gap:10px; font-size:11px; }
.check-row span { display:inline-flex; align-items:center; gap:8px; color:#687b73; }
.check-row strong { font-weight:750; text-align:right; } .ok { color:#238557; } .bad { color:#c07740; } .muted { color:#9aa5a0; }
.machine-releases { display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-top:16px; }
.machine-releases > div { min-width:0; } .machine-releases small { display:block; font-size:10px; color:#8b9a92; min-height:28px; line-height:1.4; }
.sha-line { display:flex; align-items:center; gap:5px; flex-wrap:wrap; margin-top:5px; }
.sha-line code { color:#30574c; font-size:11px; font-weight:700; }
.version-tag { border-radius:6px; padding:2px 5px; font-size:9px; font-weight:700; color:#8d9791; background:#edf0ed; }
.version-tag.current { background:#e6f4e8; color:#358356; } .version-tag.different { background:#fff0df; color:#ad792d; }
.secondary-value { display:block; font-size:10px; color:#9da9a2; margin-top:6px; overflow-wrap:anywhere; }
.machine-foot { border-top:1px solid #eef2ef; margin-top:17px; padding-top:13px; display:flex; flex-direction:column; gap:8px; font-size:10px; color:#8a9991; }
.machine-foot span { display:inline-flex; align-items:center; gap:6px; } .historical { color:#9a7b4d; } .historical.warning { color:#bd7440; }
.fleet-notes { display:flex; align-items:flex-start; gap:12px; padding:18px; margin-top:20px; background:#f3f8f5; color:#627a6e; border-radius:17px; font-size:11px; line-height:1.7; }
.fleet-notes svg { flex-shrink:0; } .fleet-notes p { margin:0; } .fleet-source { color:#91a096; font-size:10px; line-height:1.7; display:flex; flex-wrap:wrap; gap:8px 18px; margin:13px 4px; }
.fleet-error { display:flex;align-items:center;gap:10px;padding:16px;margin:16px 0;background:#fff3ec;color:#9e5e39;border-radius:14px;font-size:12px; } .fleet-error button { border:0;background:transparent;text-decoration:underline;color:inherit;cursor:pointer;font-weight:700; }
.fleet-loading { display:flex;gap:10px;align-items:center;justify-content:center;padding:65px;color:#789084;font-size:13px; }
.spin { animation:spin 1s linear infinite; } @keyframes spin { to {transform:rotate(360deg);} }
@media(max-width:1040px) { .fleet-stats { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media(max-width:600px) { .fleet { padding:10px; } .fleet-hero { align-items:flex-start; flex-direction:column; } .fleet-refresh { width:100%; justify-content:center; } .fleet-stats { gap:9px; } .stat { padding:12px; gap:9px; } .stat-icon { width:36px;height:36px; } .stat strong { font-size:22px; } .fleet-section-head { align-items:flex-start;flex-direction:column; } .machine { padding:17px; } }
</style>
