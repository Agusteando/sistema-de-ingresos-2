<template>
  <div class="online-page">
    <header class="online-hero">
      <div>
        <div class="online-title-row">
          <span class="live-dot" aria-hidden="true"></span>
          <p>Monitoreo en vivo</p>
        </div>
        <h2>Usuarios en línea</h2>
        <span class="online-subtitle">Sesiones de Aurora activas en los últimos {{ ttlMinutes }} min.</span>
      </div>
      <button type="button" class="refresh-button" :disabled="loading" @click="loadOnlineUsers(false)">
        <LucideRefreshCw :size="16" :class="{ 'animate-spin': loading }" />
        Actualizar
      </button>
    </header>

    <section class="metrics-grid" aria-label="Resumen de usuarios en línea">
      <article class="metric-card">
        <span>En línea</span>
        <strong>{{ totalUsers }}</strong>
        <small>usuarios</small>
      </article>
      <article class="metric-card">
        <span>Sesiones</span>
        <strong>{{ totalSessions }}</strong>
        <small>navegadores / dispositivos</small>
      </article>
      <article class="metric-card">
        <span>Planteles activos</span>
        <strong>{{ activePlantelCount }}</strong>
        <small>en este momento</small>
      </article>
      <article class="metric-card update-card">
        <span>Actualizado</span>
        <strong class="update-time">{{ updatedAtLabel }}</strong>
        <small>refresco automático cada 10 s</small>
      </article>
    </section>

    <section class="online-panel">
      <div class="panel-toolbar">
        <label class="search-box">
          <LucideSearch :size="17" />
          <input v-model.trim="search" type="search" placeholder="Buscar usuario, correo o IP..." autocomplete="off">
        </label>
        <label class="plantel-filter">
          <span>Plantel</span>
          <select v-model="plantelFilter">
            <option value="all">Todos</option>
            <option v-for="plantel in plantelOptions" :key="plantel" :value="plantel">{{ plantel }}</option>
          </select>
        </label>
      </div>

      <div v-if="loading && !users.length" class="state-card">
        <LucideLoader2 :size="24" class="animate-spin" />
        <strong>Cargando sesiones activas</strong>
      </div>

      <div v-else-if="errorMessage" class="state-card error-state">
        <LucideCircleAlert :size="24" />
        <strong>No se pudo consultar usuarios en línea</strong>
        <span>{{ errorMessage }}</span>
        <button type="button" @click="loadOnlineUsers(false)">Reintentar</button>
      </div>

      <div v-else-if="!filteredUsers.length" class="state-card">
        <LucideUsers :size="26" />
        <strong>{{ users.length ? 'Sin coincidencias' : 'No hay otros usuarios en línea' }}</strong>
        <span>{{ users.length ? 'Ajusta la búsqueda o el filtro de plantel.' : 'Las sesiones aparecerán aquí al usar Aurora.' }}</span>
      </div>

      <template v-else>
        <div class="desktop-table-wrap">
          <table class="online-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Plantel</th>
                <th>Acceso</th>
                <th>IP actual</th>
                <th>Sesiones</th>
                <th>Última señal</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in filteredUsers" :key="user.email">
                <td>
                  <div class="user-cell">
                    <span class="presence-dot" aria-label="En línea"></span>
                    <div>
                      <strong>{{ user.name || user.email }}</strong>
                      <span>{{ user.email }}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="plantel-cell">
                    <strong>{{ user.activePlantel || '—' }}</strong>
                    <span>{{ assignedPlanteles(user) }}</span>
                  </div>
                </td>
                <td><span class="role-badge">{{ roleLabel(user.role) }}</span></td>
                <td>
                  <div class="ip-list">
                    <code v-for="ip in user.ips" :key="`${user.email}-${ip}`">{{ ip }}</code>
                  </div>
                </td>
                <td>
                  <span class="session-count">{{ user.sessionCount }}</span>
                </td>
                <td>
                  <div class="last-seen-cell">
                    <strong>{{ relativeTime(user.lastSeenAt) }}</strong>
                    <span>{{ absoluteTime(user.lastSeenAt) }}</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mobile-list">
          <article v-for="user in filteredUsers" :key="`mobile-${user.email}`" class="online-user-card">
            <div class="mobile-user-head">
              <span class="presence-dot"></span>
              <div>
                <strong>{{ user.name || user.email }}</strong>
                <span>{{ user.email }}</span>
              </div>
              <span class="role-badge">{{ roleLabel(user.role) }}</span>
            </div>
            <dl>
              <div><dt>Plantel</dt><dd>{{ user.activePlantel || '—' }}</dd></div>
              <div><dt>IP actual</dt><dd class="mobile-ip"><code v-for="ip in user.ips" :key="`mobile-${user.email}-${ip}`">{{ ip }}</code></dd></div>
              <div><dt>Sesiones</dt><dd>{{ user.sessionCount }}</dd></div>
              <div><dt>Última señal</dt><dd>{{ relativeTime(user.lastSeenAt) }}</dd></div>
            </dl>
          </article>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  LucideCircleAlert,
  LucideLoader2,
  LucideRefreshCw,
  LucideSearch,
  LucideUsers
} from 'lucide-vue-next'

type OnlineUser = {
  email: string
  name: string
  role: string
  roles: string[]
  activePlantel: string
  homePlantel: string
  planteles: string[]
  ips: string[]
  sessionCount: number
  firstSeenAt: string
  lastSeenAt: string
}

type OnlineResponse = {
  ok: boolean
  users: OnlineUser[]
  totalUsers: number
  totalSessions: number
  generatedAt: string
  ttlSeconds: number
}

definePageMeta({
  middleware: () => {
    const role = String(useCookie('auth_role').value || '')
    const isSuperAdmin = role.split(',').some((entry) => entry.trim().toLowerCase() === 'superadmin')
    if (!isSuperAdmin) return navigateTo('/')
  }
})

useHead({ title: 'Usuarios en línea · Aurora' })

const users = ref<OnlineUser[]>([])
const totalUsers = ref(0)
const totalSessions = ref(0)
const ttlSeconds = ref(120)
const updatedAt = ref('')
const loading = ref(true)
const errorMessage = ref('')
const search = ref('')
const plantelFilter = ref('all')
let refreshTimer: ReturnType<typeof setInterval> | undefined

const ttlMinutes = computed(() => Math.max(1, Math.round(ttlSeconds.value / 60)))
const activePlantelCount = computed(() => new Set(users.value.map((user) => user.activePlantel).filter(Boolean)).size)
const plantelOptions = computed(() => Array.from(new Set(users.value.flatMap((user) => [user.activePlantel, ...user.planteles]).filter(Boolean))).sort())
const updatedAtLabel = computed(() => updatedAt.value ? new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(updatedAt.value)) : '—')

const filteredUsers = computed(() => {
  const query = search.value.toLowerCase()
  return users.value.filter((user) => {
    const matchesPlantel = plantelFilter.value === 'all' || user.activePlantel === plantelFilter.value || user.planteles.includes(plantelFilter.value)
    if (!matchesPlantel) return false
    if (!query) return true
    return [user.name, user.email, user.role, user.activePlantel, ...user.planteles, ...user.ips]
      .some((value) => String(value || '').toLowerCase().includes(query))
  })
})

const loadOnlineUsers = async (silent = true) => {
  if (!silent) loading.value = true
  try {
    const response = await $fetch<OnlineResponse>('/api/auth/online', { retry: 0 })
    users.value = Array.isArray(response.users) ? response.users : []
    totalUsers.value = Number(response.totalUsers || users.value.length)
    totalSessions.value = Number(response.totalSessions || 0)
    ttlSeconds.value = Number(response.ttlSeconds || 120)
    updatedAt.value = response.generatedAt || new Date().toISOString()
    errorMessage.value = ''
  } catch (error: any) {
    const status = Number(error?.statusCode || error?.status || error?.response?.status || 0)
    if (status === 403) {
      await navigateTo('/')
      return
    }
    errorMessage.value = String(error?.data?.message || error?.message || 'Error al consultar presencia.').replace(/\s+/g, ' ').trim()
  } finally {
    loading.value = false
  }
}

const roleLabel = (role: string) => {
  const roles = String(role || '').split(',').map((value) => value.trim()).filter(Boolean)
  if (roles.some((value) => value.toLowerCase() === 'superadmin')) return 'Superadmin'
  if (roles.includes('ROLE_CTRL') && roles.includes('ROLE_ADMON')) return 'Control + Finanzas'
  if (roles.includes('ROLE_ADMON')) return 'Finanzas'
  if (roles.includes('ROLE_CTRL')) return 'Control Escolar'
  return roles.join(' · ') || 'Usuario'
}

const assignedPlanteles = (user: OnlineUser) => {
  if (user.role.toLowerCase().includes('superadmin')) return 'Todos los planteles'
  return user.planteles.length ? user.planteles.join(', ') : (user.homePlantel || 'Sin plantel asignado')
}

const absoluteTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date)
}

const relativeTime = (value: string) => {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return '—'
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 5) return 'Ahora'
  if (seconds < 60) return `Hace ${seconds} s`
  return `Hace ${Math.floor(seconds / 60)} min`
}

onMounted(() => {
  void loadOnlineUsers(false)
  refreshTimer = setInterval(() => void loadOnlineUsers(true), 10_000)
})

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
.online-page {
  width: min(1500px, 100%);
  margin: 0 auto;
  padding: 18px 22px 36px;
  color: #172033;
}

.online-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.online-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.online-title-row p {
  margin: 0;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: #64748b;
}

.live-dot,
.presence-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  flex: 0 0 9px;
  border-radius: 999px;
  background: #16a34a;
  box-shadow: 0 0 0 4px rgba(22, 163, 74, .12);
}

.online-hero h2 {
  margin: 0;
  font-size: clamp(28px, 3vw, 38px);
  line-height: 1.05;
  letter-spacing: -.035em;
}

.online-subtitle {
  display: block;
  margin-top: 7px;
  color: #64748b;
  font-size: 14px;
}

.refresh-button,
.state-card button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid #dbe3ee;
  border-radius: 11px;
  background: #fff;
  color: #25324a;
  font-weight: 750;
  cursor: pointer;
}

.refresh-button:disabled { opacity: .6; cursor: default; }

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.metric-card {
  min-width: 0;
  padding: 15px 16px;
  border: 1px solid #e3e9f1;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(30, 41, 59, .045);
}

.metric-card span,
.metric-card small {
  display: block;
  color: #708096;
  font-size: 12px;
}

.metric-card > strong {
  display: block;
  margin: 3px 0;
  font-size: 27px;
  line-height: 1;
  letter-spacing: -.025em;
}

.metric-card .update-time { font-size: 19px; line-height: 1.35; }

.online-panel {
  overflow: hidden;
  border: 1px solid #e1e7ef;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 12px 35px rgba(30, 41, 59, .05);
}

.panel-toolbar {
  display: flex;
  align-items: end;
  gap: 12px;
  padding: 14px;
  border-bottom: 1px solid #edf1f6;
  background: #fbfcfe;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 1;
  min-width: 220px;
  height: 42px;
  padding: 0 12px;
  border: 1px solid #dbe3ed;
  border-radius: 11px;
  background: #fff;
  color: #7a8799;
}

.search-box input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #1e293b;
  font: inherit;
}

.plantel-filter {
  display: grid;
  gap: 4px;
  min-width: 145px;
}

.plantel-filter span {
  font-size: 11px;
  font-weight: 800;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.plantel-filter select {
  height: 42px;
  border: 1px solid #dbe3ed;
  border-radius: 11px;
  padding: 0 30px 0 10px;
  background: #fff;
  color: #263247;
  font: inherit;
}

.desktop-table-wrap { overflow-x: auto; }

.online-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 950px;
}

.online-table th {
  padding: 11px 14px;
  border-bottom: 1px solid #e8edf3;
  background: #f8fafc;
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: .045em;
}

.online-table td {
  padding: 13px 14px;
  border-bottom: 1px solid #edf1f5;
  vertical-align: middle;
}

.online-table tbody tr:last-child td { border-bottom: 0; }
.online-table tbody tr:hover { background: #fbfdfc; }

.user-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 230px;
}

.user-cell div,
.plantel-cell,
.last-seen-cell {
  display: grid;
  gap: 2px;
}

.user-cell strong,
.plantel-cell strong,
.last-seen-cell strong {
  font-size: 13px;
  color: #243047;
}

.user-cell span,
.plantel-cell span,
.last-seen-cell span {
  font-size: 11px;
  color: #7a8799;
}

.role-badge,
.session-count {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 9px;
  border-radius: 999px;
  background: #eef4ff;
  color: #315ca8;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.session-count {
  justify-content: center;
  min-width: 28px;
  background: #f1f5f9;
  color: #475569;
}

.ip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  max-width: 260px;
}

.ip-list code,
.mobile-ip code {
  padding: 4px 7px;
  border-radius: 7px;
  background: #f4f6f9;
  color: #344155;
  font-size: 11px;
}

.state-card {
  display: flex;
  min-height: 220px;
  padding: 30px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  color: #64748b;
  text-align: center;
}

.state-card strong { color: #334155; }
.state-card span { max-width: 520px; font-size: 13px; }
.error-state { color: #b42318; }

.mobile-list { display: none; }

.animate-spin { animation: online-spin .8s linear infinite; }
@keyframes online-spin { to { transform: rotate(360deg); } }

@media (max-width: 1050px) {
  .metrics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 760px) {
  .online-page { padding: 12px 10px 26px; }
  .online-hero { align-items: stretch; flex-direction: column; gap: 12px; }
  .refresh-button { align-self: flex-start; }
  .metrics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .metric-card { padding: 12px; border-radius: 13px; }
  .metric-card > strong { font-size: 23px; }
  .metric-card .update-time { font-size: 16px; }
  .panel-toolbar { align-items: stretch; flex-direction: column; }
  .search-box, .plantel-filter { width: 100%; min-width: 0; }
  .desktop-table-wrap { display: none; }
  .mobile-list { display: grid; gap: 0; }
  .online-user-card { padding: 15px; border-bottom: 1px solid #edf1f5; }
  .online-user-card:last-child { border-bottom: 0; }
  .mobile-user-head { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; align-items: center; gap: 10px; }
  .mobile-user-head > div { display: grid; gap: 2px; min-width: 0; }
  .mobile-user-head strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #243047; font-size: 13px; }
  .mobile-user-head span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #7a8799; font-size: 11px; }
  .mobile-user-head .role-badge { color: #315ca8; }
  .online-user-card dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 14px 0 0; }
  .online-user-card dl > div { min-width: 0; }
  .online-user-card dt { margin-bottom: 3px; color: #8390a2; font-size: 10px; font-weight: 800; text-transform: uppercase; }
  .online-user-card dd { margin: 0; color: #344155; font-size: 12px; font-weight: 700; }
  .mobile-ip { display: flex; flex-wrap: wrap; gap: 4px; }
}
</style>
