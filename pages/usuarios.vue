<template>
  <div class="max-w-7xl mx-auto workspace-users-page">
    <div class="workspace-users-header">
      <div>
        <p class="workspace-eyebrow">Usuarios institucionales</p>
        <h2 class="workspace-title">Usuarios</h2>
        <p class="workspace-subtitle">Control rápido de accesos, bloqueos y último ingreso.</p>
      </div>
      <div class="workspace-header-actions">
        <button class="btn btn-ghost" :disabled="loadingTable" @click="loadUsers">
          <LucideRefreshCw :size="16" :class="{ 'animate-spin': loadingTable }" />
          Actualizar
        </button>
        <button class="btn btn-primary" @click="openModal()">
          <LucideUserPlus :size="16" />
          Nuevo usuario
        </button>
      </div>
    </div>

    <section class="workspace-users-toolbar card">
      <div class="workspace-search-wrap">
        <LucideSearch :size="17" class="workspace-search-icon" />
        <input
          v-model="searchQuery"
          type="search"
          class="workspace-search-input"
          placeholder="Buscar por nombre, correo, rol, estado o acceso..."
          autocomplete="off"
        >
        <button v-if="searchQuery" type="button" class="workspace-search-clear" @click="searchQuery = ''">
          <LucideX :size="15" />
        </button>
      </div>

      <div class="workspace-stats">
        <span class="workspace-stat-pill neutral"><LucideUsers :size="15" /> {{ usuarios.length }} usuarios</span>
        <span class="workspace-stat-pill admin"><LucideShieldCheck :size="15" /> {{ defaultCount }} default</span>
        <span class="workspace-stat-pill control"><LucideGraduationCap :size="15" /> {{ controlCount }} ROLE_CTRL</span>
        <span class="workspace-stat-pill blocked"><LucideBan :size="15" /> {{ blockedCount }} bloqueados</span>
      </div>
    </section>

    <section v-if="selectedEmails.length" class="workspace-bulk-bar card">
      <span class="workspace-bulk-count">{{ selectedEmails.length }} seleccionados</span>
      <div class="workspace-bulk-actions">
        <button type="button" class="btn btn-ghost" :disabled="bulkSaving" @click="bulkUpdate({ accessMode: 'control' }, 'Asignar ROLE_CTRL a los seleccionados?')">
          <LucideGraduationCap :size="15" /> ROLE_CTRL
        </button>
        <button type="button" class="btn btn-ghost" :disabled="bulkSaving" @click="bulkUpdate({ accessMode: 'admin' }, 'Quitar ROLE_CTRL a los seleccionados?')">
          <LucideShieldCheck :size="15" /> Default
        </button>
        <button type="button" class="btn btn-ghost text-accent-coral hover:bg-accent-coral/10" :disabled="bulkSaving" @click="bulkUpdate({ ingresosBlocked: true }, 'Bloquear acceso a los seleccionados?')">
          <LucideBan :size="15" /> Bloquear
        </button>
        <button type="button" class="btn btn-ghost" :disabled="bulkSaving" @click="bulkUpdate({ ingresosBlocked: false }, 'Reactivar acceso a los seleccionados?')">
          <LucideUnlock :size="15" /> Reactivar
        </button>
      </div>
    </section>

    <div class="card table-wrapper workspace-users-table-card">
      <table class="w-full workspace-users-table">
        <thead>
          <tr>
            <th class="w-10 text-center">
              <input type="checkbox" :checked="allVisibleSelected" :indeterminate.prop="someVisibleSelected" @change="toggleAllVisible">
            </th>
            <th>Usuario</th>
            <th>Correo</th>
            <th>Acceso</th>
            <th>Estado</th>
            <th>Último ingreso</th>
            <th class="text-center w-28">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loadingTable">
            <td colspan="7" class="text-center py-12 text-gray-500 font-medium">Cargando...</td>
          </tr>
          <tr v-else-if="!filteredUsuarios.length">
            <td colspan="7" class="text-center py-12 text-gray-500">No hay usuarios para mostrar.</td>
          </tr>
          <tr
            v-else
            v-for="u in filteredUsuarios"
            :key="u.email || u.id"
            class="workspace-user-row cursor-context-menu"
            :class="{ blocked: isBlocked(u) }"
            @contextmenu.prevent="showContextMenu($event, u)"
          >
            <td class="text-center">
              <input type="checkbox" :checked="isSelected(u)" :disabled="isProtectedUser(u)" @change="toggleSelection(u)">
            </td>
            <td>
              <div class="workspace-user-cell">
                <img :src="avatarFor(u)" class="workspace-user-avatar" :alt="displayNameFor(u)">
                <div class="min-w-0">
                  <div class="workspace-user-name">{{ displayNameFor(u) }}</div>
                  <div class="workspace-user-source">{{ u.duplicateCount > 1 ? `Workspace · ${u.duplicateCount} registros` : 'Workspace' }}</div>
                </div>
              </div>
            </td>
            <td class="workspace-email-cell">{{ u.email || '—' }}</td>
            <td>
              <span :class="['workspace-access-badge', accessBadgeClass(u)]">
                <component :is="accessIcon(u)" :size="14" />
                {{ accessLabel(u) }}
              </span>
              <div class="workspace-role-raw">{{ u.role || '—' }}</div>
            </td>
            <td>
              <span :class="['workspace-status-badge', isBlocked(u) ? 'blocked' : 'active']">
                <component :is="isBlocked(u) ? LucideBan : LucideCheckCircle2" :size="14" />
                {{ isBlocked(u) ? 'Bloqueado' : 'Activo' }}
              </span>
            </td>
            <td class="workspace-last-login">
              <LucideClock :size="14" />
              <span>{{ formatLastLogin(u.last_login_at || u.lastLoginAt) }}</span>
            </td>
            <td class="text-center">
              <div class="workspace-row-actions">
                <button class="workspace-row-action" @click="openModal(u)" aria-label="Editar usuario">
                  <LucideSettings :size="15" />
                </button>
                <button
                  class="workspace-row-action"
                  :class="{ danger: !isBlocked(u) }"
                  :disabled="isProtectedUser(u)"
                  @click="toggleBlocked(u)"
                  :aria-label="isBlocked(u) ? 'Reactivar usuario' : 'Bloquear usuario'"
                >
                  <component :is="isBlocked(u) ? LucideUnlock : LucideBan" :size="15" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
        <div class="modal-container large workspace-user-modal">
          <div class="modal-header">
            <div>
              <p class="workspace-modal-eyebrow">Workspace</p>
              <h2 class="workspace-modal-title">{{ editingId ? 'Editar usuario' : 'Nuevo usuario' }}</h2>
              <p class="workspace-modal-copy">Selecciona la cuenta institucional y define su acceso.</p>
            </div>
            <button type="button" class="btn btn-ghost px-2" @click="closeModal"><LucideX :size="18" /></button>
          </div>

          <form @submit.prevent="saveUser">
            <div class="modal-content grid grid-cols-1 lg:grid-cols-[1.06fr_.94fr] gap-5">
              <section class="workspace-picker-card">
                <div class="workspace-card-heading">
                  <label class="form-label mb-0">Buscar usuario</label>
                  <span>@casitaiedis.edu.mx</span>
                </div>
                <div class="relative">
                  <LucideSearch :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    v-model="directoryQuery"
                    type="search"
                    class="input-field pl-9"
                    placeholder="Nombre o correo institucional..."
                    autocomplete="off"
                    @focus="ensureDirectoryResults"
                  >
                  <button v-if="directoryQuery" type="button" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700" @click="directoryQuery = ''">
                    <LucideX :size="15" />
                  </button>
                </div>

                <div class="directory-results mt-3">
                  <div v-if="directoryLoading" class="directory-empty">
                    <LucideLoader2 :size="18" class="animate-spin" /> Buscando usuarios...
                  </div>
                  <div v-else-if="directoryError" class="directory-error">
                    {{ directoryError }}
                  </div>
                  <button
                    v-else
                    v-for="person in directoryResults"
                    :key="person.email"
                    type="button"
                    :disabled="person.suspended || person.archived"
                    class="directory-option"
                    :class="{ selected: form.email === person.email, disabled: person.suspended || person.archived }"
                    @click="selectWorkspaceUser(person)"
                  >
                    <img :src="person.avatar" class="w-10 h-10 rounded-full object-cover border border-white shadow-sm" :alt="person.name">
                    <span class="min-w-0 flex-1 text-left">
                      <span class="block font-bold text-gray-800 truncate">{{ person.name }}</span>
                      <span class="block text-xs text-gray-500 truncate">{{ person.email }}</span>
                    </span>
                    <span v-if="person.suspended || person.archived" class="badge badge-neutral text-[10px]">Inactivo</span>
                    <LucideCheckCircle2 v-else-if="form.email === person.email" :size="17" class="text-brand-leaf" />
                  </button>
                  <div v-if="!directoryLoading && !directoryError && !directoryResults.length" class="directory-empty">
                    No hay resultados para esta búsqueda.
                  </div>
                </div>
              </section>

              <section class="workspace-access-card">
                <div class="selected-workspace-user">
                  <img :src="selectedAvatar" class="w-14 h-14 rounded-full border border-gray-200 object-cover bg-white" alt="Usuario seleccionado">
                  <div class="min-w-0">
                    <p class="text-xs font-bold text-gray-400 uppercase tracking-wide">Usuario seleccionado</p>
                    <h3 class="font-black text-gray-900 truncate">{{ form.displayName || 'Seleccione un usuario' }}</h3>
                    <p class="text-sm text-gray-500 truncate">{{ form.email || 'Sin correo asignado' }}</p>
                  </div>
                </div>

                <div class="form-group mb-0 mt-4">
                  <label class="form-label">Acceso</label>
                  <div class="workspace-access-options">
                    <button
                      v-for="option in accessOptions"
                      :key="option.value"
                      type="button"
                      class="workspace-access-option"
                      :class="[{ active: form.accessMode === option.value }, option.value]"
                      @click="form.accessMode = option.value"
                    >
                      <component :is="option.icon" :size="17" />
                      <span>{{ option.label }}</span>
                    </button>
                  </div>
                </div>

                <div class="form-group mb-0 mt-4 p-4 bg-white border border-gray-200 rounded-lg">
                  <label class="form-label mb-2">Estado en Sistema de Ingresos</label>
                  <label class="workspace-block-toggle" :class="{ active: form.ingresosBlocked }">
                    <input type="checkbox" v-model="form.ingresosBlocked" :disabled="isProtectedEmail(form.email)">
                    <span>{{ form.ingresosBlocked ? 'Bloqueado' : 'Activo' }}</span>
                  </label>
                </div>

                <div class="form-group mb-0 mt-4 p-4 bg-white border border-gray-200 rounded-lg">
                  <label class="form-label mb-2">Planteles</label>
                  <div class="grid grid-cols-4 md:grid-cols-6 gap-2">
                    <label
                      v-for="p in PLANTELES_LIST"
                      :key="p"
                      class="workspace-plantel-check"
                      :class="{ active: form.planteles.includes(p) }"
                    >
                      <input type="checkbox" :value="p" v-model="form.planteles" class="w-3.5 h-3.5 text-brand-leaf rounded border-gray-300">
                      {{ p }}
                    </label>
                  </div>
                </div>

                <div class="workspace-selected-summary mt-4">
                  <span :class="['workspace-access-badge', previewAccessBadgeClass]">
                    <component :is="previewAccessIcon" :size="14" />
                    {{ previewAccessLabel }}
                  </span>
                  <span :class="['workspace-status-badge', form.ingresosBlocked ? 'blocked' : 'active']">
                    {{ form.ingresosBlocked ? 'Bloqueado' : 'Activo' }}
                  </span>
                </div>
              </section>
            </div>

            <div class="modal-footer flex justify-between">
              <div class="workspace-selected-domain">{{ form.email || 'Pendiente' }}</div>
              <div class="flex gap-2">
                <button type="button" class="btn btn-ghost" @click="closeModal">Cancelar</button>
                <button type="submit" class="btn btn-primary" :disabled="saving || !canSave">
                  <LucideLoader2 v-if="saving" :size="16" class="animate-spin" />
                  Guardar
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import {
  LucideBan,
  LucideBriefcase,
  LucideCheckCircle2,
  LucideClock,
  LucideGraduationCap,
  LucideLoader2,
  LucideRefreshCw,
  LucideSearch,
  LucideSettings,
  LucideShieldCheck,
  LucideUnlock,
  LucideUserPlus,
  LucideUsers,
  LucideX
} from 'lucide-vue-next'
import { PLANTELES_LIST } from '~/utils/constants'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'

const { show } = useToast()
const { openMenu } = useContextMenu()

const WORKSPACE_DOMAIN = 'casitaiedis.edu.mx'
const PROTECTED_EMAILS = new Set([
  `desarrollo.tecnologico@${WORKSPACE_DOMAIN}`,
  `coord.admon@${WORKSPACE_DOMAIN}`
])
const usuarios = ref([])
const loadingTable = ref(false)
const bulkSaving = ref(false)
const selectedEmails = ref([])
const showModal = ref(false)
const saving = ref(false)
const editingId = ref(null)
const searchQuery = ref('')
const directoryQuery = ref('')
const directoryResults = ref([])
const directoryLoading = ref(false)
const directoryError = ref('')
let directoryTimer = null

const accessOptions = [
  { value: 'admin', label: 'Default', icon: LucideShieldCheck },
  { value: 'control', label: 'Control Escolar only', icon: LucideGraduationCap },
  { value: 'admin_control', label: 'Default + Control Escolar', icon: LucideBriefcase }
]

const normalizeEmail = (email) => String(email || '').trim().toLowerCase()
const roleTokens = (role) => String(role || '')
  .split(',')
  .map(entry => entry.trim().toLowerCase())
  .filter(Boolean)
const hasControlEscolarRole = (role) => roleTokens(role).includes('role_ctrl')
const hasAdminRole = (role) => {
  const tokens = roleTokens(role)
  if (!tokens.length) return true
  if (tokens.length === 1 && tokens[0] === 'role_ctrl') return false
  return true
}
const accessModeForRole = (role) => {
  const control = hasControlEscolarRole(role)
  const admin = hasAdminRole(role)
  if (control && admin) return 'admin_control'
  if (control) return 'control'
  return 'admin'
}

const accessLabelForMode = (mode) => {
  if (mode === 'control') return 'Control Escolar only'
  if (mode === 'admin_control') return 'Default + Control Escolar'
  return 'Default'
}
const accessIconForMode = (mode) => {
  if (mode === 'control') return LucideGraduationCap
  if (mode === 'admin_control') return LucideBriefcase
  return LucideShieldCheck
}
const accessClassForMode = (mode) => {
  if (mode === 'control') return 'control'
  if (mode === 'admin_control') return 'admin-control'
  return 'admin'
}

const emptyForm = () => ({
  username: '',
  displayName: '',
  email: '',
  avatar: '',
  picture: '',
  planteles: ['PT'],
  accessMode: 'admin',
  ingresosBlocked: false
})
const form = ref(emptyForm())

const isWorkspaceEmail = (email) => normalizeEmail(email).endsWith(`@${WORKSPACE_DOMAIN}`)
const isProtectedEmail = (email) => PROTECTED_EMAILS.has(normalizeEmail(email))
const isProtectedUser = (u) => Boolean(u?.protected) || isProtectedEmail(u?.email)
const isBlocked = (u) => u?.ingresosBlocked === true || u?.ingresos_blocked === 1 || u?.ingresos_blocked === '1'
const selectedAvatar = computed(() => form.value.avatar || form.value.picture || avatarFor(form.value))
const canSave = computed(() => isWorkspaceEmail(form.value.email) && form.value.planteles.length > 0 && accessOptions.some(option => option.value === form.value.accessMode))

const displayNameFor = (u) => u?.displayName || u?.workspaceName || u?.username || u?.email || 'Usuario'
const avatarFor = (u) => {
  if (u?.avatar || u?.picture) return u.avatar || u.picture
  const params = new URLSearchParams({ email: u?.email || '', name: displayNameFor(u) })
  return `/api/directory/photo?${params.toString()}`
}
const plantelesFor = (u) => String(u?.planteles || u?.plantel || '')
  .split(',')
  .map(p => p.trim())
  .filter(Boolean)
const accessLabel = (u) => accessLabelForMode(accessModeForRole(u?.role))
const accessIcon = (u) => accessIconForMode(accessModeForRole(u?.role))
const accessBadgeClass = (u) => accessClassForMode(accessModeForRole(u?.role))
const previewAccessLabel = computed(() => accessLabelForMode(form.value.accessMode))
const previewAccessIcon = computed(() => accessIconForMode(form.value.accessMode))
const previewAccessBadgeClass = computed(() => accessClassForMode(form.value.accessMode))

const filteredUsuarios = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const rows = [...usuarios.value].sort((a, b) => lastLoginMs(b) - lastLoginMs(a) || displayNameFor(a).localeCompare(displayNameFor(b)))
  if (!query) return rows
  return rows.filter((u) => [
    displayNameFor(u),
    u.email,
    u.role,
    u.planteles,
    u.plantel,
    accessLabel(u),
    isBlocked(u) ? 'bloqueado' : 'activo'
  ].some(value => String(value || '').toLowerCase().includes(query)))
})
const controlCount = computed(() => usuarios.value.filter(u => hasControlEscolarRole(u.role)).length)
const defaultCount = computed(() => usuarios.value.filter(u => !hasControlEscolarRole(u.role)).length)
const blockedCount = computed(() => usuarios.value.filter(isBlocked).length)
const visibleSelectableEmails = computed(() => filteredUsuarios.value.filter(u => !isProtectedUser(u)).map(u => normalizeEmail(u.email)).filter(Boolean))
const allVisibleSelected = computed(() => visibleSelectableEmails.value.length > 0 && visibleSelectableEmails.value.every(email => selectedEmails.value.includes(email)))
const someVisibleSelected = computed(() => visibleSelectableEmails.value.some(email => selectedEmails.value.includes(email)) && !allVisibleSelected.value)

const lastLoginMs = (u) => {
  const parsed = new Date(u?.last_login_at || u?.lastLoginAt || 0).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}
const formatLastLogin = (value) => {
  if (!value) return 'Nunca'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Nunca'
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}

watch(showModal, (val) => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = val ? 'hidden' : ''
  }
})

watch(directoryQuery, () => {
  if (!showModal.value) return
  if (directoryTimer) clearTimeout(directoryTimer)
  directoryTimer = setTimeout(searchDirectory, 220)
})

onUnmounted(() => {
  if (directoryTimer) clearTimeout(directoryTimer)
  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
  }
})

const loadUsers = async () => {
  loadingTable.value = true
  try {
    const rows = await $fetch('/api/users')
    usuarios.value = Array.isArray(rows) ? rows.filter(u => isWorkspaceEmail(u.email)) : []
    selectedEmails.value = selectedEmails.value.filter(email => usuarios.value.some(u => normalizeEmail(u.email) === email))
  } catch (e) {
    show(e?.data?.message || 'Error cargando usuarios', 'danger')
  } finally {
    loadingTable.value = false
  }
}

onMounted(loadUsers)

const isSelected = (u) => selectedEmails.value.includes(normalizeEmail(u?.email))
const toggleSelection = (u) => {
  const email = normalizeEmail(u?.email)
  if (!email || isProtectedUser(u)) return
  selectedEmails.value = selectedEmails.value.includes(email)
    ? selectedEmails.value.filter(item => item !== email)
    : [...selectedEmails.value, email]
}
const toggleAllVisible = () => {
  const visible = visibleSelectableEmails.value
  if (allVisibleSelected.value) {
    selectedEmails.value = selectedEmails.value.filter(email => !visible.includes(email))
  } else {
    selectedEmails.value = Array.from(new Set([...selectedEmails.value, ...visible]))
  }
}

const searchDirectory = async () => {
  directoryLoading.value = true
  directoryError.value = ''
  try {
    const response = await $fetch('/api/directory/users', {
      query: { q: directoryQuery.value, limit: 12 }
    })
    directoryResults.value = Array.isArray(response?.users)
      ? response.users.filter(person => isWorkspaceEmail(person.email))
      : []
  } catch (e) {
    directoryResults.value = []
    directoryError.value = e?.data?.message || 'No se pudo consultar Workspace.'
  } finally {
    directoryLoading.value = false
  }
}

const ensureDirectoryResults = () => {
  if (!directoryResults.value.length && !directoryLoading.value) searchDirectory()
}

const selectWorkspaceUser = (person) => {
  if (!person || !isWorkspaceEmail(person.email) || person.suspended || person.archived) return
  form.value.displayName = person.name || person.displayName || person.email
  form.value.username = person.email
  form.value.email = person.email
  form.value.avatar = person.avatar || avatarFor(person)
  form.value.picture = person.avatar || avatarFor(person)
}

const bulkUpdate = async (patch, confirmation) => {
  const emails = selectedEmails.value.filter(email => !isProtectedEmail(email))
  if (!emails.length) return
  if (confirmation && !confirm(confirmation)) return
  bulkSaving.value = true
  try {
    await $fetch('/api/users/bulk', {
      method: 'PATCH',
      body: { emails, ...patch }
    })
    show('Usuarios actualizados.')
    selectedEmails.value = []
    await loadUsers()
  } catch (e) {
    show(e?.data?.message || 'Error al actualizar usuarios', 'danger')
  } finally {
    bulkSaving.value = false
  }
}

const toggleBlocked = async (u) => {
  if (!u || isProtectedUser(u)) return
  const blocked = !isBlocked(u)
  if (!confirm(blocked ? `Bloquear acceso a ${u.email}?` : `Reactivar acceso a ${u.email}?`)) return
  selectedEmails.value = [normalizeEmail(u.email)]
  await bulkUpdate({ ingresosBlocked: blocked }, '')
}

const showContextMenu = (event, u) => {
  openMenu(event, [
    { label: 'Opciones', disabled: true },
    { label: '-' },
    { label: 'Editar usuario', icon: LucideSettings, action: () => openModal(u) },
    { label: 'Asignar ROLE_CTRL', icon: LucideGraduationCap, action: async () => { selectedEmails.value = [normalizeEmail(u.email)]; await bulkUpdate({ accessMode: 'control' }, '') } },
    { label: 'Quitar ROLE_CTRL', icon: LucideShieldCheck, action: async () => { selectedEmails.value = [normalizeEmail(u.email)]; await bulkUpdate({ accessMode: 'admin' }, '') } },
    { label: isBlocked(u) ? 'Reactivar acceso' : 'Bloquear acceso', icon: isBlocked(u) ? LucideUnlock : LucideBan, disabled: isProtectedUser(u), action: () => toggleBlocked(u) }
  ])
}

const openModal = (u = null) => {
  if (u) {
    editingId.value = u.id
    form.value = {
      username: u.email || u.username || '',
      displayName: displayNameFor(u),
      email: u.email,
      avatar: avatarFor(u),
      picture: avatarFor(u),
      planteles: plantelesFor(u).length ? plantelesFor(u) : ['PT'],
      accessMode: accessModeForRole(u.role),
      ingresosBlocked: isBlocked(u)
    }
    directoryQuery.value = u.email || displayNameFor(u)
  } else {
    editingId.value = null
    form.value = emptyForm()
    directoryQuery.value = ''
  }
  directoryResults.value = []
  directoryError.value = ''
  showModal.value = true
  setTimeout(searchDirectory, 0)
}

const closeModal = () => {
  showModal.value = false
}

const saveUser = async () => {
  if (!canSave.value) {
    show(`Seleccione una cuenta @${WORKSPACE_DOMAIN} y al menos un plantel.`, 'danger')
    return
  }
  saving.value = true
  try {
    const url = editingId.value ? `/api/users/${editingId.value}` : '/api/users'
    const method = editingId.value ? 'PUT' : 'POST'
    await $fetch(url, {
      method,
      body: {
        username: form.value.username || form.value.email,
        displayName: form.value.displayName,
        email: form.value.email,
        avatar: form.value.avatar,
        picture: form.value.picture || form.value.avatar,
        planteles: form.value.planteles,
        accessMode: form.value.accessMode,
        ingresosBlocked: form.value.ingresosBlocked
      }
    })
    show('Usuario guardado.')
    closeModal()
    await loadUsers()
  } catch (e) {
    show(e?.data?.message || 'Error al guardar', 'danger')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.workspace-users-page {
  padding-bottom: 32px;
}

.workspace-users-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.workspace-eyebrow,
.workspace-modal-eyebrow {
  color: rgb(22 163 74);
  font-size: 11px;
  line-height: 1;
  font-weight: 900;
  letter-spacing: .22em;
  text-transform: uppercase;
}

.workspace-title {
  margin-top: 6px;
  color: rgb(15 23 42);
  font-size: 28px;
  line-height: 1.08;
  font-weight: 950;
  letter-spacing: -.04em;
}

.workspace-subtitle,
.workspace-modal-copy {
  margin-top: 6px;
  color: rgb(100 116 139);
  font-size: 14px;
  line-height: 1.45;
}

.workspace-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.workspace-users-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px;
  margin-bottom: 14px;
}

.workspace-search-wrap {
  position: relative;
  flex: 1;
  min-width: min(520px, 100%);
}

.workspace-search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: rgb(100 116 139);
}

.workspace-search-input {
  width: 100%;
  min-height: 44px;
  border: 1px solid rgb(226 232 240);
  border-radius: 16px;
  background: rgba(255, 255, 255, .92);
  padding: 0 42px 0 42px;
  color: rgb(15 23 42);
  font-size: 14px;
  font-weight: 750;
  outline: none;
  transition: border-color .16s ease, box-shadow .16s ease;
}

.workspace-search-input:focus {
  border-color: rgba(34, 197, 94, .52);
  box-shadow: 0 0 0 4px rgba(34, 197, 94, .10);
}

.workspace-search-clear {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: rgb(100 116 139);
}

.workspace-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.workspace-stat-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.workspace-stat-pill.neutral {
  color: rgb(51 65 85);
  background: rgb(248 250 252);
  border-color: rgb(226 232 240);
}

.workspace-stat-pill.control {
  color: rgb(29 78 216);
  background: rgb(239 246 255);
  border-color: rgb(191 219 254);
}

.workspace-stat-pill.admin {
  color: rgb(21 128 61);
  background: rgb(240 253 244);
  border-color: rgb(187 247 208);
}

.workspace-users-table-card {
  overflow: hidden;
}

.workspace-users-table th {
  color: rgb(71 85 105);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.workspace-user-row {
  transition: background-color .14s ease, box-shadow .14s ease;
}

.workspace-user-row:hover {
  background: rgba(240, 253, 244, .48);
}

.workspace-user-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.workspace-user-avatar {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  border: 1px solid rgb(226 232 240);
  background: white;
  object-fit: cover;
  box-shadow: 0 8px 18px rgba(15, 23, 42, .07);
}

.workspace-user-name {
  color: rgb(15 23 42);
  font-size: 14px;
  font-weight: 950;
  max-width: 310px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-user-source {
  color: rgb(34 197 94);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .12em;
  text-transform: uppercase;
}

.workspace-email-cell {
  color: rgb(71 85 105);
  font-size: 13px;
  font-weight: 700;
}

.workspace-planteles {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  max-width: 280px;
}

.workspace-plantel-chip,
.workspace-plantel-check {
  border-radius: 999px;
  border: 1px solid rgba(34, 197, 94, .18);
  background: rgba(34, 197, 94, .08);
  color: rgb(21 128 61);
  padding: 4px 8px;
  font-size: 10px;
  line-height: 1;
  font-weight: 950;
}

.workspace-plantel-chip.muted {
  color: rgb(100 116 139);
  background: rgb(248 250 252);
  border-color: rgb(226 232 240);
}

.workspace-access-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 0 11px;
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
}

.workspace-access-badge.admin {
  color: rgb(21 128 61);
  background: rgb(240 253 244);
  border-color: rgb(187 247 208);
}

.workspace-access-badge.control {
  color: rgb(29 78 216);
  background: rgb(239 246 255);
  border-color: rgb(191 219 254);
}

.workspace-access-badge.admin-control {
  color: rgb(126 34 206);
  background: rgb(250 245 255);
  border-color: rgb(221 214 254);
}

.workspace-row-action {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  border: 1px solid rgb(226 232 240);
  background: white;
  color: rgb(15 23 42);
  box-shadow: 0 8px 18px rgba(15, 23, 42, .06);
  transition: transform .16s ease, border-color .16s ease, color .16s ease;
}

.workspace-row-action:hover {
  transform: translateY(-1px);
  border-color: rgba(34, 197, 94, .45);
  color: rgb(22 163 74);
}

.workspace-user-modal {
  max-width: min(980px, calc(100vw - 32px));
}

.workspace-modal-title {
  color: rgb(15 23 42);
  font-size: 20px;
  line-height: 1.14;
  font-weight: 950;
  letter-spacing: -.03em;
}

.workspace-picker-card,
.workspace-access-card {
  border: 1px solid rgb(226 232 240);
  background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(248,250,252,.86));
  border-radius: 18px;
  padding: 16px;
}

.workspace-card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.workspace-card-heading span {
  color: rgb(148 163 184);
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .14em;
}

.directory-results {
  min-height: 250px;
  max-height: 330px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.directory-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid rgb(226 232 240);
  background: white;
  border-radius: 14px;
  padding: 10px;
  transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
}

.directory-option:hover:not(.disabled),
.directory-option.selected {
  border-color: rgba(77, 159, 101, .55);
  box-shadow: 0 10px 25px rgba(15, 23, 42, .07);
  transform: translateY(-1px);
}

.directory-option.disabled {
  opacity: .55;
  cursor: not-allowed;
}

.directory-empty,
.directory-error {
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed rgb(203 213 225);
  border-radius: 14px;
  color: rgb(100 116 139);
  font-size: 13px;
  font-weight: 700;
  text-align: center;
  padding: 20px;
}

.directory-error {
  color: rgb(190 18 60);
  background: rgb(255 241 242);
  border-color: rgb(254 205 211);
}

.selected-workspace-user {
  display: flex;
  align-items: center;
  gap: 14px;
  border-radius: 16px;
  border: 1px solid rgb(226 232 240);
  background: white;
  padding: 14px;
}

.workspace-access-options {
  display: grid;
  gap: 10px;
}

.workspace-access-option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  border-radius: 15px;
  border: 1px solid rgb(226 232 240);
  background: white;
  color: rgb(71 85 105);
  padding: 0 13px;
  font-size: 13px;
  font-weight: 950;
  text-align: left;
  transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease, color .16s ease, background .16s ease;
}

.workspace-access-option:hover,
.workspace-access-option.active {
  transform: translateY(-1px);
  box-shadow: 0 10px 25px rgba(15, 23, 42, .07);
}

.workspace-access-option.admin.active {
  color: rgb(21 128 61);
  background: rgb(240 253 244);
  border-color: rgb(187 247 208);
}

.workspace-access-option.control.active {
  color: rgb(29 78 216);
  background: rgb(239 246 255);
  border-color: rgb(191 219 254);
}

.workspace-access-option.admin_control.active {
  color: rgb(126 34 206);
  background: rgb(250 245 255);
  border-color: rgb(221 214 254);
}

.workspace-plantel-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  border-radius: 10px;
  background: rgb(248 250 252);
  border-color: rgb(226 232 240);
  color: rgb(51 65 85);
  padding: 7px 8px;
}

.workspace-plantel-check.active {
  color: rgb(21 128 61);
  background: rgb(240 253 244);
  border-color: rgb(187 247 208);
}

.workspace-selected-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid rgb(226 232 240);
  background: white;
  border-radius: 15px;
  padding: 12px;
}

.workspace-selected-domain {
  min-width: 0;
  color: rgb(100 116 139);
  font-size: 12px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}


.workspace-stat-pill.blocked {
  color: rgb(190 18 60);
  background: rgb(255 241 242);
  border-color: rgb(254 205 211);
}

.workspace-bulk-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 14px;
}

.workspace-bulk-count {
  color: rgb(15 23 42);
  font-size: 13px;
  font-weight: 950;
}

.workspace-bulk-actions,
.workspace-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.workspace-user-row.blocked {
  background: rgba(255, 241, 242, .42);
}

.workspace-role-raw {
  margin-top: 5px;
  color: rgb(148 163 184);
  font-size: 10px;
  font-weight: 850;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
}

.workspace-status-badge.active {
  color: rgb(21 128 61);
  background: rgb(240 253 244);
  border-color: rgb(187 247 208);
}

.workspace-status-badge.blocked {
  color: rgb(190 18 60);
  background: rgb(255 241 242);
  border-color: rgb(254 205 211);
}

.workspace-last-login {
  color: rgb(71 85 105);
  font-size: 12px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
}

.workspace-row-action.danger {
  color: rgb(190 18 60);
}

.workspace-row-action:disabled {
  opacity: .42;
  cursor: not-allowed;
  transform: none;
}

.workspace-block-toggle {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 38px;
  border-radius: 12px;
  border: 1px solid rgb(226 232 240);
  background: rgb(248 250 252);
  color: rgb(51 65 85);
  padding: 0 12px;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.workspace-block-toggle.active {
  color: rgb(190 18 60);
  background: rgb(255 241 242);
  border-color: rgb(254 205 211);
}

.workspace-block-toggle input:disabled + span {
  opacity: .55;
}

@media (max-width: 900px) {
  .workspace-users-header,
  .workspace-users-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .workspace-header-actions {
    justify-content: flex-start;
  }

  .workspace-search-wrap {
    min-width: 0;
  }
}
</style>
