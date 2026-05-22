<template>
  <div class="users-access-page">
    <section class="users-hero card">
      <div class="hero-copy">
        <p class="eyebrow">Google Workspace · @casitaiedis.edu.mx</p>
        <h1>Acceso a Control Escolar</h1>
        <p>
          Gestiona qué cuentas institucionales pueden entrar al módulo de Control Escolar. La identidad viene de Google Workspace; aquí solo se guarda la configuración de acceso del sistema.
        </p>
      </div>
      <div class="hero-actions">
        <button class="btn btn-ghost" :disabled="loadingTable" @click="loadUsers">
          <LucideRefreshCw :size="16" :class="{ 'animate-spin': loadingTable }" />
          Actualizar
        </button>
        <button class="btn btn-primary" @click="openModal()">
          <LucideUserPlus :size="16" />
          Conceder acceso
        </button>
      </div>
    </section>

    <section class="kpi-grid">
      <article class="kpi-card card kpi-total">
        <span class="kpi-icon"><LucideUsers :size="22" /></span>
        <div>
          <p>Cuentas cargadas</p>
          <strong>{{ stats.total }}</strong>
        </div>
      </article>
      <article class="kpi-card card kpi-access">
        <span class="kpi-icon"><LucideShieldCheck :size="22" /></span>
        <div>
          <p>Con acceso</p>
          <strong>{{ stats.withAccess }}</strong>
        </div>
      </article>
      <article class="kpi-card card">
        <span class="kpi-icon"><LucideUserX :size="22" /></span>
        <div>
          <p>Sin acceso</p>
          <strong>{{ stats.withoutAccess }}</strong>
        </div>
      </article>
      <article class="kpi-card card kpi-muted">
        <span class="kpi-icon"><LucideAlertTriangle :size="22" /></span>
        <div>
          <p>Inactivas</p>
          <strong>{{ stats.inactive }}</strong>
        </div>
      </article>
    </section>

    <section class="users-toolbar card">
      <div class="filter-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          type="button"
          class="tab-pill"
          :class="{ active: activeTab === tab.value }"
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
          <span>{{ tab.count }}</span>
        </button>
      </div>
      <div class="toolbar-controls">
        <div class="search-box">
          <LucideSearch :size="17" />
          <input
            v-model="search"
            type="search"
            placeholder="Buscar por nombre o correo institucional..."
            autocomplete="off"
          >
          <button v-if="search" type="button" @click="search = ''"><LucideX :size="15" /></button>
        </div>
        <select v-model="plantelFilter" class="plantel-filter" aria-label="Filtrar por plantel">
          <option value="">Todos los planteles</option>
          <option v-for="plantel in PLANTELES_LIST" :key="plantel" :value="plantel">{{ plantel }}</option>
        </select>
      </div>
    </section>

    <section class="card users-table-card">
      <div class="table-header-row">
        <div>
          <h2>Usuarios institucionales</h2>
          <p>{{ filteredUsers.length }} visibles · {{ stats.roleCtrl }} con permiso explícito de Control Escolar</p>
        </div>
        <span class="directory-source"><LucideBadgeCheck :size="14" /> Directorio institucional</span>
      </div>

      <div v-if="loadingTable" class="state-box">
        <LucideLoader2 :size="22" class="animate-spin" />
        Cargando usuarios de Google Workspace...
      </div>

      <div v-else-if="loadError" class="state-box state-error">
        <LucideAlertTriangle :size="22" />
        <div>
          <strong>No se pudo cargar Usuarios.</strong>
          <p>{{ loadError }}</p>
        </div>
      </div>

      <div v-else-if="!filteredUsers.length" class="state-box">
        <LucideSearch :size="22" />
        No hay cuentas que coincidan con la búsqueda actual.
      </div>

      <div v-else class="users-list">
        <article v-for="user in filteredUsers" :key="user.email" class="user-row" :class="{ inactive: !isAvailable(user) }">
          <div class="user-identity">
            <img :src="avatarFor(user)" class="avatar" :alt="user.name || user.email">
            <div class="identity-copy">
              <div class="name-line">
                <strong>{{ user.name || user.displayName || user.email }}</strong>
                <span v-if="user.isSuperAdmin" class="mini-badge admin">Administrador</span>
                <span v-else-if="user.hasControlEscolarRole" class="mini-badge success">Control Escolar</span>
                <span v-else class="mini-badge muted">Sin acceso</span>
              </div>
              <p><LucideMail :size="13" /> {{ user.email }}</p>
              <small v-if="user.orgUnitPath">{{ user.orgUnitPath }}</small>
            </div>
          </div>

          <div class="plantel-cell">
            <template v-if="plantelesFor(user).length">
              <span v-for="plantel in plantelesFor(user)" :key="`${user.email}-${plantel}`" class="plantel-chip">{{ plantel }}</span>
            </template>
            <span v-else class="empty-chip">Sin plantel asignado</span>
          </div>

          <div class="role-cell">
            <span class="role-title">{{ user.roleLabel }}</span>
            <span class="role-detail">{{ roleDisplay(user.role) }}</span>
          </div>

          <div class="action-cell">
            <button
              type="button"
              class="access-switch"
              :class="{ on: user.hasControlEscolarRole || user.isSuperAdmin }"
              :disabled="isSaving(user.email) || !isAvailable(user) || user.isSuperAdmin"
              @click="quickToggleAccess(user)"
            >
              <LucideLoader2 v-if="isSaving(user.email)" :size="15" class="animate-spin" />
              <LucideShieldCheck v-else-if="user.hasControlEscolarRole || user.isSuperAdmin" :size="15" />
              <LucideUserPlus v-else :size="15" />
              {{ accessButtonLabel(user) }}
            </button>
            <button type="button" class="btn btn-ghost row-config" @click="openModal(user)">
              <LucideSettings :size="15" />
              Configurar
            </button>
          </div>
        </article>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="requestCloseModal">
        <div class="modal-container large access-modal">
          <div class="modal-header access-modal-header">
            <div>
              <p class="eyebrow">Acceso institucional</p>
              <h2>{{ selectedUser ? 'Configurar acceso' : 'Conceder acceso a Control Escolar' }}</h2>
              <p>Selecciona una cuenta institucional, define planteles y guarda los cambios.</p>
            </div>
            <button type="button" class="btn btn-ghost px-2" @click="requestCloseModal"><LucideX :size="18" /></button>
          </div>

          <div class="modal-content access-modal-content">
            <section class="directory-panel">
              <div class="panel-title">
                <span><LucideUsers :size="16" /> Cuentas Workspace</span>
                <small>@casitaiedis.edu.mx</small>
              </div>
              <div class="modal-search search-box">
                <LucideSearch :size="16" />
                <input v-model="modalSearch" type="search" placeholder="Buscar cuenta..." autocomplete="off">
                <button v-if="modalSearch" type="button" @click="modalSearch = ''"><LucideX :size="14" /></button>
              </div>

              <div class="modal-user-list">
                <button
                  v-for="candidate in modalCandidates"
                  :key="candidate.email"
                  type="button"
                  class="candidate-row"
                  :class="{ active: form.email === candidate.email, disabled: !isAvailable(candidate) }"
                  :disabled="!isAvailable(candidate)"
                  @click="selectUser(candidate)"
                >
                  <img :src="avatarFor(candidate)" :alt="candidate.name || candidate.email">
                  <span>
                    <strong>{{ candidate.name || candidate.email }}</strong>
                    <small>{{ candidate.email }}</small>
                  </span>
                  <LucideCheckCircle2 v-if="form.email === candidate.email" :size="16" />
                </button>
                <div v-if="!modalCandidates.length" class="mini-empty">Sin coincidencias.</div>
              </div>
            </section>

            <section class="access-panel">
              <div class="selected-card">
                <img :src="form.avatar || avatarFor(form)" alt="Usuario seleccionado">
                <div>
                  <p>Usuario seleccionado</p>
                  <h3>{{ form.name || 'Seleccione una cuenta' }}</h3>
                  <span>{{ form.email || 'Sin correo seleccionado' }}</span>
                </div>
              </div>

              <div class="access-toggle-card" :class="{ enabled: form.enabled }">
                <div>
                  <strong>Acceso a Control Escolar</strong>
                  <p>{{ form.enabled ? 'La cuenta podrá abrir el módulo de Control Escolar.' : 'La cuenta no tendrá acceso al módulo.' }}</p>
                </div>
                <button type="button" class="toggle-control" :class="{ on: form.enabled }" @click="form.enabled = !form.enabled" :disabled="form.isSuperAdmin">
                  <span></span>
                </button>
              </div>

              <div v-if="form.enabled" class="form-group mb-0">
                <label class="form-label">Tipo de acceso</label>
                <select v-model="form.exclusive" class="input-field">
                  <option :value="false">Control Escolar adicional, conservando otros permisos</option>
                  <option :value="true">Solo Control Escolar</option>
                </select>
              </div>

              <div class="form-group mb-0">
                <label class="form-label">Planteles autorizados</label>
                <div class="plantel-grid">
                  <label v-for="plantel in PLANTELES_LIST" :key="plantel" :class="{ checked: form.planteles.includes(plantel) }">
                    <input type="checkbox" :value="plantel" v-model="form.planteles">
                    <span>{{ plantel }}</span>
                  </label>
                </div>
              </div>

              <div class="role-preview">
                <div>
                  <span>Resultado</span>
                  <strong>{{ previewLabel }}</strong>
                </div>
                <code>{{ previewRole }}</code>
              </div>
            </section>
          </div>

          <div class="modal-footer access-footer">
            <div class="save-state" :class="saveStateClass">
              <LucideCheckCircle2 v-if="!isDirty" :size="15" />
              <LucideAlertTriangle v-else :size="15" />
              {{ saveStateText }}
            </div>
            <div class="footer-actions">
              <button type="button" class="btn btn-ghost" @click="requestCloseModal">Cancelar</button>
              <button type="button" class="btn btn-primary" :disabled="saving || !canSave || !isDirty" @click="saveAccess">
                <LucideLoader2 v-if="saving" :size="16" class="animate-spin" />
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  LucideAlertTriangle,
  LucideBadgeCheck,
  LucideCheckCircle2,
  LucideLoader2,
  LucideMail,
  LucideRefreshCw,
  LucideSearch,
  LucideSettings,
  LucideShieldCheck,
  LucideUserPlus,
  LucideUsers,
  LucideUserX,
  LucideX
} from 'lucide-vue-next'
import { PLANTELES_LIST } from '~/utils/constants'
import { useToast } from '~/composables/useToast'

const { show } = useToast()

const WORKSPACE_DOMAIN = 'casitaiedis.edu.mx'
const CONTROL_ROLE = 'ROLE_CTRL'
const users = ref([])
const statsFromServer = ref({ total: 0, withAccess: 0, roleCtrl: 0, withoutAccess: 0, inactive: 0 })
const loadingTable = ref(false)
const loadError = ref('')
const search = ref('')
const plantelFilter = ref('')
const activeTab = ref('all')
const showModal = ref(false)
const selectedUser = ref(null)
const modalSearch = ref('')
const saving = ref(false)
const savingEmails = ref(new Set())
const lastSavedSnapshot = ref('')
let searchTimer = null

const emptyForm = () => ({
  name: '',
  email: '',
  avatar: '',
  role: 'plantel',
  planteles: [],
  enabled: true,
  exclusive: false,
  isSuperAdmin: false
})
const form = ref(emptyForm())

const roleTokens = (value) => String(value || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)

const normalizedRoleTokens = (value) => {
  const seen = new Set()
  return roleTokens(value)
    .map((entry) => entry.toLowerCase() === 'role_ctrl' ? CONTROL_ROLE : entry)
    .filter((entry) => {
      const key = entry.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

const hasControlRole = (value) => normalizedRoleTokens(value).some((entry) => entry.toLowerCase() === 'role_ctrl')
const isWorkspaceEmail = (email) => String(email || '').trim().toLowerCase().endsWith(`@${WORKSPACE_DOMAIN}`)
const isAvailable = (user) => Boolean(user?.available !== false && !user?.suspended && !user?.archived)
const plantelesFor = (user) => String(user?.planteles || '').split(',').map((entry) => entry.trim()).filter(Boolean)
const roleDisplay = (role) => normalizedRoleTokens(role).join(', ') || 'plantel'

const buildPreviewRole = (role, enabled, exclusive) => {
  if (enabled && exclusive) return CONTROL_ROLE
  const tokens = normalizedRoleTokens(role).filter((entry) => entry.toLowerCase() !== 'role_ctrl')
  if (enabled) return [...(tokens.length ? tokens : ['plantel']), CONTROL_ROLE].join(',')
  return (tokens.length ? tokens : ['plantel']).join(',')
}

const snapshotFor = (value = form.value) => JSON.stringify({
  email: value.email,
  enabled: Boolean(value.enabled),
  exclusive: Boolean(value.exclusive),
  role: buildPreviewRole(value.role, value.enabled, value.exclusive),
  planteles: [...value.planteles].sort()
})

const previewRole = computed(() => buildPreviewRole(form.value.role, form.value.enabled, form.value.exclusive))
const previewLabel = computed(() => {
  if (form.value.isSuperAdmin) return 'Administrador global'
  if (!form.value.enabled) return 'Sin acceso a Control Escolar'
  return form.value.exclusive ? 'Solo Control Escolar' : 'Control Escolar habilitado'
})
const canSave = computed(() => isWorkspaceEmail(form.value.email) && form.value.planteles.length > 0 && !form.value.isSuperAdmin)
const isDirty = computed(() => snapshotFor() !== lastSavedSnapshot.value)
const saveStateText = computed(() => {
  if (!form.value.email) return 'Seleccione una cuenta para continuar.'
  if (form.value.isSuperAdmin) return 'Los administradores globales ya tienen acceso.'
  if (!form.value.planteles.length) return 'Seleccione al menos un plantel.'
  if (saving.value) return 'Guardando cambios...'
  return isDirty.value ? 'Hay cambios sin guardar.' : 'Cambios guardados.'
})
const saveStateClass = computed(() => isDirty.value ? 'dirty' : 'saved')

const normalizedSearch = computed(() => search.value.trim().toLowerCase())

const localFilteredUsers = computed(() => {
  const q = normalizedSearch.value
  return users.value.filter((user) => {
    const matchesText = !q || [user.name, user.displayName, user.email, user.orgUnitPath, user.roleLabel]
      .join(' ')
      .toLowerCase()
      .includes(q)
    const matchesPlantel = !plantelFilter.value || plantelesFor(user).includes(plantelFilter.value)
    const matchesTab = activeTab.value === 'all'
      || (activeTab.value === 'access' && user.hasControlEscolarAccess)
      || (activeTab.value === 'role_ctrl' && user.hasControlEscolarRole)
      || (activeTab.value === 'without' && !user.hasControlEscolarAccess && isAvailable(user))
      || (activeTab.value === 'inactive' && !isAvailable(user))
    return matchesText && matchesPlantel && matchesTab
  })
})

const filteredUsers = computed(() => localFilteredUsers.value)
const stats = computed(() => {
  const source = users.value.length ? users.value : []
  return {
    total: statsFromServer.value.total || source.length,
    withAccess: statsFromServer.value.withAccess || source.filter((u) => u.hasControlEscolarAccess).length,
    roleCtrl: statsFromServer.value.roleCtrl || source.filter((u) => u.hasControlEscolarRole).length,
    withoutAccess: statsFromServer.value.withoutAccess || source.filter((u) => !u.hasControlEscolarAccess && isAvailable(u)).length,
    inactive: statsFromServer.value.inactive || source.filter((u) => !isAvailable(u)).length
  }
})

const tabs = computed(() => [
  { value: 'all', label: 'Todos', count: stats.value.total },
  { value: 'access', label: 'Con acceso', count: stats.value.withAccess },
  { value: 'role_ctrl', label: 'Permiso explícito', count: stats.value.roleCtrl },
  { value: 'without', label: 'Sin acceso', count: stats.value.withoutAccess },
  { value: 'inactive', label: 'Inactivos', count: stats.value.inactive }
])

const modalCandidates = computed(() => {
  const q = modalSearch.value.trim().toLowerCase()
  return users.value
    .filter((user) => !q || [user.name, user.email, user.orgUnitPath].join(' ').toLowerCase().includes(q))
    .slice(0, 80)
})

watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadUsers(), 350)
})

watch(showModal, (visible) => {
  if (typeof document !== 'undefined') document.body.style.overflow = visible ? 'hidden' : ''
})

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})

onMounted(loadUsers)

const avatarFor = (user) => {
  if (user?.avatar) return user.avatar
  const params = new URLSearchParams({ email: user?.email || '', name: user?.name || user?.displayName || user?.email || 'Usuario' })
  return `/api/directory/photo?${params.toString()}`
}

const loadUsers = async () => {
  loadingTable.value = true
  loadError.value = ''
  try {
    const response = await $fetch('/api/users', {
      query: { q: search.value.trim(), limit: 150 }
    })
    users.value = Array.isArray(response?.users) ? response.users : []
    statsFromServer.value = response?.stats || { total: 0, withAccess: 0, roleCtrl: 0, withoutAccess: 0, inactive: 0 }
  } catch (error) {
    users.value = []
    statsFromServer.value = { total: 0, withAccess: 0, roleCtrl: 0, withoutAccess: 0, inactive: 0 }
    loadError.value = error?.data?.message || error?.message || 'Error cargando usuarios.'
    show(loadError.value, 'danger')
  } finally {
    loadingTable.value = false
  }
}

const isSaving = (email) => savingEmails.value.has(email)
const setSaving = (email, value) => {
  const next = new Set(savingEmails.value)
  if (value) next.add(email)
  else next.delete(email)
  savingEmails.value = next
}

const userToForm = (user) => {
  const planteles = plantelesFor(user)
  return {
    name: user?.name || user?.displayName || user?.email || '',
    email: user?.email || '',
    avatar: avatarFor(user),
    role: user?.role || 'plantel',
    planteles: planteles.length ? planteles : [PLANTELES_LIST[0]],
    enabled: Boolean(user?.hasControlEscolarRole),
    exclusive: Boolean(user?.isControlEscolarOnly),
    isSuperAdmin: Boolean(user?.isSuperAdmin)
  }
}

const selectUser = (user) => {
  selectedUser.value = user
  form.value = userToForm(user)
  lastSavedSnapshot.value = snapshotFor(form.value)
}

const openModal = (user = null) => {
  showModal.value = true
  modalSearch.value = ''
  if (user) {
    selectUser(user)
    modalSearch.value = user.name || user.email || ''
  } else {
    selectedUser.value = null
    form.value = emptyForm()
    lastSavedSnapshot.value = snapshotFor(form.value)
  }
}

const requestCloseModal = () => {
  if (isDirty.value && !confirm('Hay cambios sin guardar. ¿Desea cerrar sin guardar?')) return
  showModal.value = false
}

const accessButtonLabel = (user) => {
  if (isSaving(user.email)) return 'Guardando'
  if (!isAvailable(user)) return 'Inactivo'
  if (user.isSuperAdmin) return 'Admin'
  return user.hasControlEscolarRole ? 'Revocar' : 'Conceder'
}

const quickToggleAccess = async (user) => {
  if (!user || user.isSuperAdmin || !isAvailable(user)) return
  const nextEnabled = !user.hasControlEscolarRole
  if (!nextEnabled && !confirm(`¿Revocar acceso a Control Escolar para ${user.name || user.email}?`)) return

  setSaving(user.email, true)
  try {
    const nextRole = buildPreviewRole(user.role, nextEnabled, false)
    await $fetch('/api/users', {
      method: 'POST',
      body: {
        email: user.email,
        username: user.name || user.email,
        avatar: avatarFor(user),
        planteles: plantelesFor(user).length ? plantelesFor(user) : [PLANTELES_LIST[0]],
        role: nextRole,
        enabled: nextEnabled,
        exclusive: false
      }
    })
    show(nextEnabled ? 'Acceso concedido.' : 'Acceso revocado.')
    await loadUsers()
  } catch (error) {
    show(error?.data?.message || 'No se pudo actualizar el acceso.', 'danger')
  } finally {
    setSaving(user.email, false)
  }
}

const saveAccess = async () => {
  if (!canSave.value) {
    show(saveStateText.value, 'danger')
    return
  }
  saving.value = true
  try {
    await $fetch('/api/users', {
      method: 'POST',
      body: {
        email: form.value.email,
        username: form.value.name || form.value.email,
        avatar: form.value.avatar,
        planteles: form.value.planteles,
        role: previewRole.value,
        enabled: form.value.enabled,
        exclusive: form.value.exclusive
      }
    })
    lastSavedSnapshot.value = snapshotFor()
    show('Acceso actualizado.')
    await loadUsers()
    const refreshed = users.value.find((entry) => entry.email === form.value.email)
    if (refreshed) selectUser(refreshed)
  } catch (error) {
    show(error?.data?.message || 'No se pudo guardar el acceso.', 'danger')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.users-access-page {
  width: min(100%, 1280px);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.users-hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
  padding: 22px 24px;
  border: 1px solid rgba(203, 213, 225, .8);
  background: radial-gradient(circle at top right, rgba(77, 159, 101, .08), transparent 38%), linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,250,252,.9));
}

.eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  line-height: 1.2;
  font-weight: 900;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: rgb(77 159 101);
}

.hero-copy h1,
.access-modal-header h2 {
  margin: 0;
  color: rgb(15 34 62);
  font-weight: 950;
  letter-spacing: -.03em;
}

.hero-copy h1 {
  font-size: clamp(24px, 3vw, 34px);
}

.hero-copy p:not(.eyebrow),
.access-modal-header p {
  max-width: 760px;
  margin: 6px 0 0;
  color: rgb(100 116 139);
  font-size: 14px;
  line-height: 1.55;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.kpi-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  min-height: 96px;
  border: 1px solid rgba(203, 213, 225, .82);
}

.kpi-card .kpi-icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  color: rgb(52 112 68);
  background: rgba(77, 159, 101, .12);
  border: 1px solid rgba(77, 159, 101, .22);
}

.kpi-card p {
  margin: 0;
  color: rgb(100 116 139);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.kpi-card strong {
  display: block;
  margin-top: 4px;
  color: rgb(15 34 62);
  font-size: 30px;
  line-height: 1;
  font-weight: 950;
}

.kpi-access .kpi-icon { color: rgb(16 130 97); background: rgba(20, 184, 166, .1); border-color: rgba(20, 184, 166, .24); }
.kpi-muted .kpi-icon { color: rgb(185 103 21); background: rgba(245, 158, 11, .1); border-color: rgba(245, 158, 11, .24); }

.users-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px;
  border: 1px solid rgba(203, 213, 225, .82);
}

.filter-tabs,
.toolbar-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.tab-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgb(226 232 240);
  border-radius: 14px;
  background: white;
  padding: 10px 14px;
  color: rgb(15 34 62);
  font-size: 13px;
  font-weight: 900;
  transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease;
}

.tab-pill span {
  min-width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: rgb(241 245 249);
  color: rgb(71 85 105);
  font-size: 11px;
}

.tab-pill.active {
  color: white;
  background: linear-gradient(135deg, rgb(73 171 78), rgb(48 145 61));
  border-color: transparent;
  box-shadow: 0 10px 22px rgba(58, 151, 68, .24);
}

.tab-pill.active span {
  background: rgba(255,255,255,.22);
  color: white;
}

.search-box {
  min-width: min(420px, 48vw);
  height: 46px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid rgb(226 232 240);
  border-radius: 16px;
  background: white;
  padding: 0 12px;
  color: rgb(100 116 139);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.82);
}

.search-box input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: rgb(15 34 62);
  font-size: 14px;
  font-weight: 700;
}

.search-box input::placeholder {
  color: rgb(148 163 184);
}

.search-box button {
  color: rgb(100 116 139);
}

.plantel-filter {
  height: 46px;
  min-width: 160px;
  border: 1px solid rgb(226 232 240);
  border-radius: 16px;
  background: white;
  color: rgb(15 34 62);
  padding: 0 12px;
  font-size: 13px;
  font-weight: 900;
  outline: 0;
}

.users-table-card {
  overflow: hidden;
  border: 1px solid rgba(203, 213, 225, .82);
}

.table-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid rgb(226 232 240);
  background: linear-gradient(180deg, rgba(248,250,252,.9), rgba(255,255,255,.98));
}

.table-header-row h2 {
  margin: 0;
  color: rgb(15 34 62);
  font-size: 18px;
  font-weight: 950;
  letter-spacing: -.02em;
}

.table-header-row p {
  margin: 3px 0 0;
  color: rgb(100 116 139);
  font-size: 12px;
  font-weight: 800;
}

.directory-source {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(77, 159, 101, .22);
  border-radius: 999px;
  background: rgba(77, 159, 101, .08);
  color: rgb(52 112 68);
  padding: 8px 11px;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.state-box {
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: rgb(100 116 139);
  font-weight: 850;
  text-align: center;
  padding: 30px;
}

.state-error {
  color: rgb(153 27 27);
  align-items: flex-start;
}

.state-error p {
  margin: 4px 0 0;
  color: rgb(185 28 28);
  font-size: 13px;
}

.users-list {
  display: flex;
  flex-direction: column;
}

.user-row {
  display: grid;
  grid-template-columns: minmax(300px, 1.35fr) minmax(160px, .62fr) minmax(190px, .72fr) auto;
  gap: 16px;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid rgb(226 232 240);
  background: rgba(255,255,255,.94);
}

.user-row:last-child {
  border-bottom: 0;
}

.user-row.inactive {
  opacity: .66;
}

.user-identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.avatar,
.user-identity .avatar {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  object-fit: cover;
  background: white;
  border: 1px solid rgb(226 232 240);
  box-shadow: 0 8px 20px rgba(15, 23, 42, .07);
  flex-shrink: 0;
}

.identity-copy {
  min-width: 0;
}

.name-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.name-line strong {
  color: rgb(15 34 62);
  font-size: 15px;
  font-weight: 950;
  line-height: 1.22;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.identity-copy p {
  margin: 4px 0 0;
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgb(100 116 139);
  font-size: 12px;
  font-weight: 800;
  min-width: 0;
}

.identity-copy small {
  display: block;
  margin-top: 3px;
  color: rgb(148 163 184);
  font-size: 11px;
  font-weight: 750;
}

.mini-badge,
.plantel-chip,
.empty-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 5px 8px;
  font-size: 10px;
  line-height: 1;
  font-weight: 950;
  white-space: nowrap;
}

.mini-badge.success,
.plantel-chip {
  color: rgb(52 112 68);
  background: rgba(77, 159, 101, .12);
  border: 1px solid rgba(77, 159, 101, .24);
}

.mini-badge.admin {
  color: rgb(146 64 14);
  background: rgba(245, 158, 11, .14);
  border: 1px solid rgba(245, 158, 11, .26);
}

.mini-badge.muted,
.empty-chip {
  color: rgb(100 116 139);
  background: rgb(248 250 252);
  border: 1px solid rgb(226 232 240);
}

.plantel-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.role-cell {
  min-width: 0;
}

.role-title {
  display: block;
  color: rgb(15 34 62);
  font-size: 13px;
  font-weight: 950;
}

.role-detail {
  display: block;
  margin-top: 3px;
  color: rgb(100 116 139);
  font-size: 11px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
}

.access-switch,
.row-config {
  min-height: 40px;
  border-radius: 13px;
  font-size: 12px;
  font-weight: 950;
}

.access-switch {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(77, 159, 101, .26);
  color: rgb(52 112 68);
  background: rgba(77, 159, 101, .08);
  padding: 0 12px;
}

.access-switch.on {
  color: white;
  background: linear-gradient(135deg, rgb(73 171 78), rgb(48 145 61));
  border-color: transparent;
  box-shadow: 0 8px 18px rgba(58, 151, 68, .18);
}

.access-switch:disabled {
  cursor: not-allowed;
  opacity: .68;
}

.access-modal {
  max-width: min(1120px, calc(100vw - 32px));
}

.access-modal-header h2 {
  font-size: 22px;
}

.access-modal-content {
  display: grid;
  grid-template-columns: minmax(310px, .9fr) minmax(420px, 1.1fr);
  gap: 16px;
}

.directory-panel,
.access-panel {
  border: 1px solid rgb(226 232 240);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,250,252,.88));
  padding: 16px;
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.panel-title span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: rgb(15 34 62);
  font-weight: 950;
}

.panel-title small {
  color: rgb(100 116 139);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.modal-search {
  min-width: 100%;
  height: 42px;
  border-radius: 14px;
}

.modal-user-list {
  height: 390px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding-right: 3px;
}

.candidate-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 1px solid rgb(226 232 240);
  border-radius: 15px;
  background: white;
  padding: 10px;
  text-align: left;
  transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
}

.candidate-row:hover:not(.disabled),
.candidate-row.active {
  border-color: rgba(77, 159, 101, .48);
  box-shadow: 0 10px 22px rgba(15, 23, 42, .07);
  transform: translateY(-1px);
}

.candidate-row.disabled {
  opacity: .55;
  cursor: not-allowed;
}

.candidate-row img {
  width: 38px;
  height: 38px;
  border-radius: 13px;
  object-fit: cover;
  flex-shrink: 0;
}

.candidate-row span {
  min-width: 0;
  flex: 1;
}

.candidate-row strong,
.candidate-row small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.candidate-row strong {
  color: rgb(15 34 62);
  font-size: 13px;
  font-weight: 950;
}

.candidate-row small {
  color: rgb(100 116 139);
  font-size: 11px;
  font-weight: 800;
}

.mini-empty {
  min-height: 100px;
  display: grid;
  place-items: center;
  color: rgb(100 116 139);
  font-weight: 800;
}

.access-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.selected-card {
  display: flex;
  align-items: center;
  gap: 14px;
  border: 1px solid rgb(226 232 240);
  border-radius: 18px;
  background: white;
  padding: 14px;
}

.selected-card img {
  width: 58px;
  height: 58px;
  border-radius: 18px;
  border: 1px solid rgb(226 232 240);
  object-fit: cover;
  flex-shrink: 0;
}

.selected-card p,
.selected-card h3,
.selected-card span {
  margin: 0;
}

.selected-card p {
  color: rgb(100 116 139);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .12em;
  text-transform: uppercase;
}

.selected-card h3 {
  color: rgb(15 34 62);
  font-size: 18px;
  font-weight: 950;
  line-height: 1.2;
}

.selected-card span {
  color: rgb(100 116 139);
  font-size: 13px;
  font-weight: 750;
}

.access-toggle-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid rgb(226 232 240);
  border-radius: 18px;
  background: white;
  padding: 14px;
}

.access-toggle-card.enabled {
  border-color: rgba(77, 159, 101, .32);
  background: rgba(77, 159, 101, .05);
}

.access-toggle-card strong {
  color: rgb(15 34 62);
  font-size: 15px;
  font-weight: 950;
}

.access-toggle-card p {
  margin: 3px 0 0;
  color: rgb(100 116 139);
  font-size: 12px;
  font-weight: 750;
}

.toggle-control {
  width: 54px;
  height: 30px;
  border-radius: 999px;
  background: rgb(203 213 225);
  padding: 3px;
  transition: background .16s ease;
  flex-shrink: 0;
}

.toggle-control span {
  width: 24px;
  height: 24px;
  display: block;
  border-radius: 999px;
  background: white;
  box-shadow: 0 4px 10px rgba(15, 23, 42, .14);
  transition: transform .16s ease;
}

.toggle-control.on {
  background: rgb(73 171 78);
}

.toggle-control.on span {
  transform: translateX(24px);
}

.plantel-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.plantel-grid label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  border: 1px solid rgb(226 232 240);
  border-radius: 13px;
  background: white;
  color: rgb(51 65 85);
  cursor: pointer;
  font-size: 12px;
  font-weight: 950;
}

.plantel-grid label.checked {
  color: rgb(52 112 68);
  border-color: rgba(77, 159, 101, .42);
  background: rgba(77, 159, 101, .08);
}

.plantel-grid input {
  width: 14px;
  height: 14px;
  accent-color: rgb(73 171 78);
}

.role-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: 16px;
  border: 1px solid rgba(14, 165, 233, .22);
  background: rgba(14, 165, 233, .06);
  padding: 12px;
}

.role-preview span {
  display: block;
  color: rgb(100 116 139);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .1em;
  text-transform: uppercase;
}

.role-preview strong {
  display: block;
  color: rgb(15 34 62);
  font-size: 13px;
  font-weight: 950;
}

.role-preview code {
  color: rgb(12 74 110);
  font-size: 11px;
  font-weight: 950;
  background: white;
  border: 1px solid rgba(14, 165, 233, .2);
  border-radius: 999px;
  padding: 7px 9px;
  white-space: nowrap;
}

.access-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.save-state {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 900;
}

.save-state.saved { color: rgb(52 112 68); }
.save-state.dirty { color: rgb(146 64 14); }

.footer-actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 1180px) {
  .users-hero,
  .users-toolbar,
  .table-header-row {
    align-items: stretch;
    flex-direction: column;
  }

  .hero-actions,
  .toolbar-controls {
    justify-content: flex-start;
  }

  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .user-row {
    grid-template-columns: minmax(260px, 1fr) minmax(150px, .6fr);
  }

  .action-cell {
    justify-content: flex-start;
  }
}

@media (max-width: 860px) {
  .kpi-grid,
  .access-modal-content,
  .user-row {
    grid-template-columns: 1fr;
  }

  .search-box {
    min-width: 100%;
  }

  .plantel-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .access-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .footer-actions {
    justify-content: flex-end;
  }
}
</style>
