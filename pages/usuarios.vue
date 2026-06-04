<template>
  <div class="usuarios-page">
    <header class="users-hero">
      <div>
        <p class="eyebrow">Usuarios institucionales</p>
        <h1>Control de acceso</h1>
        <span>Gestión por plantel, permisos y estado operativo.</span>
      </div>
      <div class="hero-actions">
        <button type="button" class="soft-button" :disabled="loading" @click="loadUsers">
          <LucideRefreshCw :size="16" :class="{ spin: loading }" />
          Actualizar
        </button>
        <button type="button" class="soft-button" :disabled="!rows.length" @click="exportUsers">
          <LucideDownload :size="16" />
          Exportar vista
        </button>
        <button type="button" class="primary-button" @click="openModal()">
          <LucidePlus :size="16" />
          Nuevo usuario
        </button>
      </div>
    </header>

    <section class="toolbar-card">
      <div class="search-control">
        <LucideSearch :size="18" />
        <input v-model="filters.search" type="search" placeholder="Buscar usuario o correo..." autocomplete="off">
        <button v-if="filters.search" type="button" @click="filters.search = ''"><LucideX :size="14" /></button>
      </div>
      <label>
        <span>Acceso</span>
        <select v-model="filters.access">
          <option value="all">Todos</option>
          <option value="admin">Financiero</option>
          <option value="control">Control Escolar</option>
          <option value="admin_control">Ambos</option>
        </select>
      </label>
      <label>
        <span>Estado</span>
        <select v-model="filters.status">
          <option value="all">Todos</option>
          <option value="active">Activos</option>
          <option value="blocked">Bloqueados</option>
          <option value="protected">Protegidos</option>
        </select>
      </label>
      <label>
        <span>Actividad</span>
        <select v-model="filters.activity">
          <option value="all">Todas</option>
          <option value="today">Hoy</option>
          <option value="week">7 días</option>
          <option value="month">30 días</option>
          <option value="never">Nunca</option>
        </select>
      </label>
      <label>
        <span>Orden</span>
        <select v-model="filters.sort">
          <option value="last_login_desc">Último ingreso</option>
          <option value="name_asc">Nombre A-Z</option>
          <option value="access_asc">Acceso</option>
          <option value="status_asc">Estado</option>
          <option value="plantel_asc">Plantel</option>
        </select>
      </label>
    </section>

    <section class="metrics-grid">
      <article>
        <small>Total filtrado</small>
        <strong>{{ total }}</strong>
        <span>{{ globalFacets.total || total }} en búsqueda</span>
      </article>
      <article>
        <small>Financiero</small>
        <strong>{{ facets.access?.admin || 0 }}</strong>
        <span>Acceso operativo</span>
      </article>
      <article>
        <small>Control Escolar</small>
        <strong>{{ facets.access?.control || 0 }}</strong>
        <span>Solo ROLE_CTRL</span>
      </article>
      <article>
        <small>Ambos</small>
        <strong>{{ facets.access?.admin_control || 0 }}</strong>
        <span>Doble acceso</span>
      </article>
      <article>
        <small>Bloqueados</small>
        <strong>{{ facets.status?.blocked || 0 }}</strong>
        <span>Acceso restringido</span>
      </article>
    </section>

    <div v-if="error" class="error-card">
      <strong>No se pudo cargar Usuarios.</strong>
      <span>{{ error }}</span>
      <button type="button" class="soft-button" @click="loadUsers">Reintentar</button>
    </div>

    <main class="users-workspace">
      <UserPlantelSidebar
        :selected="filters.plantel"
        :facets="globalFacets"
        @select="setPlantel"
        @filter-status="setStatus"
        @filter-activity="setActivity"
      />

      <section class="workspace-main">
        <div class="view-tabs">
          <button type="button" :class="{ active: viewMode === 'table' }" @click="viewMode = 'table'">
            <LucideUsers :size="15" /> Tabla
          </button>
          <button type="button" :class="{ active: viewMode === 'matrix' }" @click="viewMode = 'matrix'">
            <LucideLayoutGrid :size="15" /> Matriz
          </button>
          <button type="button" :class="{ active: viewMode === 'issues' }" @click="viewMode = 'issues'">
            <LucideBan :size="15" /> Problemas
          </button>
        </div>

        <UserBulkActionBar
          :selected-count="selectedEmails.length"
          :total-count="total"
          :planteles="PLANTELES_LIST"
          :disabled="bulkSaving"
          @access="handleBulkAccess"
          @block="handleBulkBlock"
          @plantel="handleBulkPlantel"
          @clear="selectedEmails = []"
        />

        <template v-if="viewMode === 'table'">
          <UserAccessTable
            :rows="rows"
            :selected-emails="selectedEmails"
            :active-key="activeUserKey"
            :loading="loading"
            :all-selected="allPageSelected"
            :saving-key="savingUserKey"
            @select="selectUser"
            @toggle-user="toggleUserSelection"
            @toggle-page="togglePageSelection"
            @set-access="setUserAccess"
            @edit="openModal"
          />

          <footer class="pagination-bar">
            <span>Mostrando {{ pageStart }}-{{ pageEnd }} de {{ total }}</span>
            <div>
              <select v-model.number="pageSize">
                <option :value="25">25</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
              </select>
              <button type="button" :disabled="page <= 1" @click="page--"><LucideChevronLeft :size="15" /></button>
              <strong>Página {{ page }} / {{ totalPages }}</strong>
              <button type="button" :disabled="page >= totalPages" @click="page++"><LucideChevronRight :size="15" /></button>
            </div>
          </footer>
        </template>

        <section v-else-if="viewMode === 'matrix'" class="matrix-card">
          <table>
            <thead>
              <tr>
                <th>Plantel</th>
                <th>Total</th>
                <th>Financiero</th>
                <th>Control Escolar</th>
                <th>Ambos</th>
                <th>Bloqueados</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in matrixRows" :key="item.plantel" @click="setPlantel(item.plantel)">
                <td><strong>{{ item.label || item.plantel }}</strong></td>
                <td>{{ item.total || 0 }}</td>
                <td>{{ item.admin || 0 }}</td>
                <td>{{ item.control || 0 }}</td>
                <td>{{ item.admin_control || 0 }}</td>
                <td>{{ item.blocked || 0 }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-else class="issues-grid">
          <button type="button" @click="setStatus('blocked')">
            <strong>{{ globalFacets.alerts?.blocked || 0 }}</strong>
            <span>Bloqueados</span>
          </button>
          <button type="button" @click="setStatus('protected')">
            <strong>{{ globalFacets.alerts?.protected || 0 }}</strong>
            <span>Protegidos</span>
          </button>
          <button type="button" @click="setActivity('never')">
            <strong>{{ globalFacets.alerts?.noActivity || 0 }}</strong>
            <span>Sin actividad registrada</span>
          </button>
          <button type="button" @click="setPlantel('__sin_plantel__')">
            <strong>{{ globalFacets.alerts?.missingPlantel || 0 }}</strong>
            <span>Sin plantel</span>
          </button>
        </section>
      </section>

      <UserAccessDrawer
        :user="activeUser"
        :planteles="PLANTELES_LIST"
        :saving="Boolean(savingUserKey)"
        @set-access="setUserAccess"
        @save-planteles="saveUserPlanteles"
        @block="setUserBlocked"
        @edit="openModal"
      />
    </main>

    <UserAccessModal
      :open="showModal"
      :user="modalUser"
      :planteles="PLANTELES_LIST"
      :saving="modalSaving"
      @close="closeModal"
      @save="saveModalUser"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  LucideChevronLeft,
  LucideChevronRight,
  LucideDownload,
  LucideLayoutGrid,
  LucidePlus,
  LucideRefreshCw,
  LucideUsers,
  LucideSearch,
  LucideBan,
  LucideX
} from 'lucide-vue-next'
import { PLANTELES_LIST } from '~/utils/constants'
import { useToast } from '~/composables/useToast'

const { show } = useToast()

const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(25)
const totalPages = ref(1)
const facets = ref({ access: {}, status: {}, activity: {}, byPlantel: [], alerts: {} })
const globalFacets = ref({ total: 0, access: {}, status: {}, activity: {}, byPlantel: [], alerts: {} })
const loading = ref(false)
const bulkSaving = ref(false)
const modalSaving = ref(false)
const error = ref('')
const selectedEmails = ref([])
const activeUserKey = ref('')
const savingUserKey = ref('')
const viewMode = ref('table')
const showModal = ref(false)
const modalUser = ref(null)
let loadTimer = null

const filters = reactive({
  search: '',
  plantel: 'all',
  access: 'all',
  status: 'all',
  activity: 'all',
  sort: 'last_login_desc'
})

const normalizeEmail = (value) => String(value || '').trim().toLowerCase()
const userKey = (user) => normalizeEmail(user?.email) || String(user?.id || '')
const isBlocked = (user) => user?.ingresosBlocked === true || user?.ingresos_blocked === 1 || user?.ingresos_blocked === '1'
const activeUser = computed(() => rows.value.find((user) => userKey(user) === activeUserKey.value) || null)
const allPageSelected = computed(() => pageSelectableEmails.value.length > 0 && pageSelectableEmails.value.every((email) => selectedEmails.value.includes(email)))
const pageSelectableEmails = computed(() => rows.value.map((row) => normalizeEmail(row.email)).filter((email, index) => email && !rows.value[index]?.protected))
const pageStart = computed(() => total.value ? ((page.value - 1) * pageSize.value) + 1 : 0)
const pageEnd = computed(() => Math.min(total.value, page.value * pageSize.value))
const matrixRows = computed(() => (globalFacets.value.byPlantel || []).filter((item) => item.total))

const currentFilterScope = () => ({
  search: filters.search,
  plantel: filters.plantel,
  access: filters.access,
  status: filters.status,
  activity: filters.activity,
  sort: filters.sort
})

async function loadUsers () {
  loading.value = true
  error.value = ''
  try {
    const response = await $fetch('/api/users', {
      query: {
        server: '1',
        page: page.value,
        pageSize: pageSize.value,
        ...currentFilterScope()
      }
    })
    rows.value = Array.isArray(response?.rows) ? response.rows : []
    total.value = Number(response?.total || 0)
    totalPages.value = Number(response?.totalPages || 1)
    facets.value = response?.facets || facets.value
    globalFacets.value = response?.globalFacets || response?.facets || globalFacets.value
    selectedEmails.value = selectedEmails.value.filter((email) => rows.value.some((row) => normalizeEmail(row.email) === email))
    if (!rows.value.some((row) => userKey(row) === activeUserKey.value)) {
      activeUserKey.value = rows.value.length ? userKey(rows.value[0]) : ''
    }
  } catch (err) {
    error.value = err?.data?.message || err?.message || 'Error al cargar usuarios.'
    show(error.value, 'danger')
  } finally {
    loading.value = false
  }
}

watch([() => filters.search, () => filters.plantel, () => filters.access, () => filters.status, () => filters.activity, () => filters.sort, pageSize], () => {
  page.value = 1
  selectedEmails.value = []
  clearTimeout(loadTimer)
  loadTimer = setTimeout(loadUsers, 250)
})
watch(page, loadUsers)
onMounted(loadUsers)

function setPlantel (plantel) {
  filters.plantel = plantel || 'all'
}
function setStatus (status) {
  filters.status = status || 'all'
  viewMode.value = 'table'
}
function setActivity (activity) {
  filters.activity = activity || 'all'
  viewMode.value = 'table'
}
function selectUser (user) {
  activeUserKey.value = userKey(user)
}
function toggleUserSelection (user) {
  const email = normalizeEmail(user?.email)
  if (!email || user?.protected) return
  selectedEmails.value = selectedEmails.value.includes(email)
    ? selectedEmails.value.filter((item) => item !== email)
    : [...selectedEmails.value, email]
}
function togglePageSelection () {
  const emails = pageSelectableEmails.value
  selectedEmails.value = allPageSelected.value
    ? selectedEmails.value.filter((email) => !emails.includes(email))
    : Array.from(new Set([...selectedEmails.value, ...emails]))
}

const bulkPayloadForScope = (scope, patch) => {
  if (scope === 'filtered') return { filterScope: currentFilterScope(), ...patch }
  return { emails: selectedEmails.value, ...patch }
}
async function runBulk (payload, success = 'Usuarios actualizados.') {
  bulkSaving.value = true
  try {
    const response = await $fetch('/api/users/bulk', { method: 'PATCH', body: payload })
    show(`${success} (${response?.updated || 0})`)
    selectedEmails.value = []
    await loadUsers()
  } catch (err) {
    show(err?.data?.message || err?.message || 'Error al actualizar usuarios.', 'danger')
  } finally {
    bulkSaving.value = false
  }
}
function handleBulkAccess ({ scope, accessMode }) {
  runBulk(bulkPayloadForScope(scope, { accessMode }), 'Acceso actualizado')
}
function handleBulkBlock ({ scope, ingresosBlocked }) {
  runBulk(bulkPayloadForScope(scope, { ingresosBlocked }), ingresosBlocked ? 'Usuarios bloqueados' : 'Usuarios reactivados')
}
function handleBulkPlantel ({ scope, mode, plantel }) {
  if (!plantel) return
  const patch = mode === 'replace'
    ? { replacePlanteles: [plantel] }
    : mode === 'remove'
      ? { removePlanteles: [plantel] }
      : { addPlanteles: [plantel] }
  runBulk(bulkPayloadForScope(scope, patch), 'Planteles actualizados')
}

async function setUserAccess (user, accessMode) {
  const email = normalizeEmail(user?.email)
  if (!email || user?.protected) return
  savingUserKey.value = userKey(user)
  try {
    await $fetch('/api/users/bulk', { method: 'PATCH', body: { emails: [email], accessMode } })
    show('Acceso actualizado.')
    await loadUsers()
  } catch (err) {
    show(err?.data?.message || err?.message || 'Error al actualizar acceso.', 'danger')
  } finally {
    savingUserKey.value = ''
  }
}
async function saveUserPlanteles (user, planteles) {
  const email = normalizeEmail(user?.email)
  if (!email) return
  savingUserKey.value = userKey(user)
  try {
    await $fetch('/api/users/bulk', { method: 'PATCH', body: { emails: [email], replacePlanteles: planteles } })
    show('Planteles actualizados.')
    await loadUsers()
  } catch (err) {
    show(err?.data?.message || err?.message || 'Error al guardar planteles.', 'danger')
  } finally {
    savingUserKey.value = ''
  }
}
function setUserBlocked (user, blocked) {
  runBulk({ emails: [normalizeEmail(user.email)], ingresosBlocked: blocked }, blocked ? 'Usuario bloqueado' : 'Usuario reactivado')
}
function openModal (user = null) {
  modalUser.value = user
  showModal.value = true
}
function closeModal () {
  showModal.value = false
  modalUser.value = null
}
async function saveModalUser (payload) {
  modalSaving.value = true
  try {
    const editing = Boolean(payload.id)
    await $fetch(editing ? `/api/users/${payload.id}` : '/api/users', {
      method: editing ? 'PUT' : 'POST',
      body: {
        username: payload.username || payload.email,
        displayName: payload.displayName,
        email: payload.email,
        avatar: payload.avatar,
        picture: payload.picture || payload.avatar,
        planteles: payload.planteles,
        accessMode: payload.accessMode,
        ingresosBlocked: payload.ingresosBlocked
      }
    })
    show('Usuario guardado.')
    closeModal()
    await loadUsers()
  } catch (err) {
    show(err?.data?.message || err?.message || 'Error al guardar usuario.', 'danger')
  } finally {
    modalSaving.value = false
  }
}
function exportUsers () {
  const headers = ['Nombre', 'Correo', 'Planteles', 'Acceso', 'Estado', 'Ultimo ingreso', 'Rol']
  const lines = [headers.join(',')]
  for (const user of rows.value) {
    const values = [
      user.displayName || user.username || '',
      user.email || '',
      user.planteles || '',
      user.accessLabel || user.accessMode || '',
      user.protected ? 'Protegido' : isBlocked(user) ? 'Bloqueado' : 'Activo',
      user.last_login_at || user.lastLoginAt || '',
      user.role || ''
    ]
    lines.push(values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `usuarios-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.usuarios-page {
  min-height: 100vh;
  padding: 28px;
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.12), transparent 34%),
    linear-gradient(135deg, #f8fafc 0%, #eef2f7 100%);
  color: #0f172a;
}
.users-hero,
.toolbar-card,
.metrics-grid,
.users-workspace,
.pagination-bar {
  max-width: 1540px;
  margin: 0 auto;
}
.users-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}
.eyebrow {
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: #2563eb;
  font-size: 12px;
  font-weight: 900;
}
h1 { margin: 0; font-size: clamp(30px, 4vw, 48px); line-height: 1; }
.users-hero span { color: #64748b; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; }
.soft-button,
.primary-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 16px;
  padding: 11px 14px;
  font-weight: 850;
  cursor: pointer;
}
.soft-button { background: rgba(255,255,255,0.88); color: #334155; border: 1px solid rgba(15,23,42,0.08); }
.primary-button { background: #0f172a; color: white; box-shadow: 0 16px 34px rgba(15,23,42,0.18); }
.soft-button:disabled,
.primary-button:disabled { opacity: .55; cursor: not-allowed; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.toolbar-card {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) repeat(4, minmax(130px, 170px));
  gap: 12px;
  background: rgba(255,255,255,0.9);
  border: 1px solid rgba(15,23,42,0.08);
  border-radius: 26px;
  padding: 14px;
  box-shadow: 0 18px 44px rgba(15,23,42,0.07);
  margin-bottom: 16px;
}
.search-control {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f8fafc;
  border: 1px solid rgba(15,23,42,0.08);
  border-radius: 16px;
  padding: 0 12px;
}
.search-control input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; padding: 13px 0; }
.search-control button { border: 0; background: transparent; color: #64748b; cursor: pointer; }
.toolbar-card label { display: grid; gap: 5px; }
.toolbar-card label span { color: #64748b; font-size: 11px; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; }
.toolbar-card select { border: 1px solid rgba(15,23,42,0.1); border-radius: 14px; padding: 10px; background: #f8fafc; font-weight: 750; color: #334155; }
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.metrics-grid article {
  background: rgba(255,255,255,0.9);
  border: 1px solid rgba(15,23,42,0.08);
  border-radius: 22px;
  padding: 16px;
  box-shadow: 0 14px 34px rgba(15,23,42,0.05);
}
.metrics-grid small { color: #64748b; font-weight: 850; text-transform: uppercase; letter-spacing: .08em; }
.metrics-grid strong { display: block; font-size: 30px; margin: 6px 0 3px; }
.metrics-grid span { color: #64748b; font-size: 13px; }
.error-card {
  max-width: 1540px;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid rgba(185,28,28,0.16);
  border-radius: 18px;
  padding: 14px;
}
.error-card span { flex: 1; }
.users-workspace {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) 330px;
  gap: 16px;
  align-items: start;
}
.workspace-main { display: grid; gap: 14px; }
.view-tabs {
  display: flex;
  gap: 8px;
  background: rgba(255,255,255,0.84);
  border: 1px solid rgba(15,23,42,0.08);
  border-radius: 20px;
  padding: 8px;
  width: fit-content;
}
.view-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 0;
  border-radius: 14px;
  padding: 9px 12px;
  background: transparent;
  color: #64748b;
  font-weight: 850;
  cursor: pointer;
}
.view-tabs button.active { background: #0f172a; color: white; }
.pagination-bar {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  background: rgba(255,255,255,0.88);
  border: 1px solid rgba(15,23,42,0.08);
  border-radius: 20px;
  padding: 12px 14px;
  color: #64748b;
  font-weight: 750;
}
.pagination-bar div { display: flex; align-items: center; gap: 8px; }
.pagination-bar button,
.pagination-bar select { border: 1px solid rgba(15,23,42,0.12); background: white; border-radius: 12px; padding: 8px 10px; font-weight: 800; }
.matrix-card {
  background: white;
  border: 1px solid rgba(15,23,42,0.08);
  border-radius: 26px;
  overflow: hidden;
  box-shadow: 0 18px 48px rgba(15,23,42,0.08);
}
.matrix-card table { width: 100%; border-collapse: collapse; }
.matrix-card th, .matrix-card td { padding: 14px 16px; border-top: 1px solid rgba(15,23,42,0.06); text-align: left; }
.matrix-card th { background: #f8fafc; color: #64748b; text-transform: uppercase; letter-spacing: .08em; font-size: 11px; }
.matrix-card tr { cursor: pointer; }
.matrix-card tbody tr:hover { background: #f8fafc; }
.issues-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.issues-grid button {
  background: white;
  border: 1px solid rgba(15,23,42,0.08);
  border-radius: 24px;
  padding: 20px;
  text-align: left;
  box-shadow: 0 16px 40px rgba(15,23,42,0.06);
  cursor: pointer;
}
.issues-grid strong { display: block; font-size: 34px; color: #0f172a; }
.issues-grid span { color: #64748b; font-weight: 800; }
@media (max-width: 1280px) {
  .users-workspace { grid-template-columns: 210px minmax(0, 1fr); }
  .users-workspace > :last-child { grid-column: 1 / -1; }
}
@media (max-width: 940px) {
  .usuarios-page { padding: 18px; }
  .users-hero { align-items: flex-start; flex-direction: column; }
  .toolbar-card { grid-template-columns: 1fr 1fr; }
  .search-control { grid-column: 1 / -1; }
  .metrics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .users-workspace { grid-template-columns: 1fr; }
  .issues-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 620px) {
  .toolbar-card, .metrics-grid, .issues-grid { grid-template-columns: 1fr; }
  .pagination-bar { align-items: flex-start; flex-direction: column; }
}
</style>
