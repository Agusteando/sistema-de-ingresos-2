<template>
  <div class="max-w-6xl mx-auto workspace-users-page">
    <div class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-6">
      <div>
        <p class="text-[11px] font-black uppercase tracking-[.22em] text-brand-leaf">Google Workspace · @casitaiedis.edu.mx</p>
        <h2 class="text-xl font-bold text-gray-800 tracking-tight">Usuarios / ROLE_CTRL</h2>
        <p class="text-sm text-gray-500 mt-1 max-w-2xl">
          Asigna roles de workspace desde el directorio institucional. El acceso normal no queda restringido; ROLE_CTRL se aplica solo cuando se selecciona explícitamente.
        </p>
      </div>
      <button class="btn btn-primary" @click="openModal()"><LucideUserPlus :size="16"/> Asignar usuario</button>
    </div>

    <div class="card table-wrapper">
      <table class="w-full">
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Correo</th>
            <th>Planteles</th>
            <th>Acceso</th>
            <th class="text-center w-24">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loadingTable"><td colspan="5" class="text-center py-12 text-gray-500 font-medium">Cargando...</td></tr>
          <tr v-else-if="!usuarios.length"><td colspan="5" class="text-center py-12 text-gray-500">No hay usuarios registrados.</td></tr>
          <tr v-else v-for="u in usuarios" :key="u.id" 
              class="cursor-context-menu"
              @contextmenu.prevent="showContextMenu($event, u)">
            <td>
              <div class="flex items-center gap-3 min-w-0">
                <img :src="avatarFor(u)" class="w-9 h-9 rounded-full border border-gray-200 bg-white object-cover" :alt="u.username || u.email">
                <div class="min-w-0">
                  <div class="font-semibold text-gray-800 truncate">{{ u.username || u.displayName || u.email }}</div>
                  <div class="text-[11px] text-gray-400 uppercase font-bold tracking-wide">{{ u.source === 'external' ? 'External users' : 'Local fallback' }}</div>
                </div>
              </div>
            </td>
            <td class="text-gray-600 text-sm">{{ u.email || '—' }}</td>
            <td>
              <div class="flex flex-wrap gap-1 max-w-[220px]">
                <span v-for="p in (u.planteles ? u.planteles.split(',') : [])" :key="p" class="badge badge-neutral text-[10px]">{{ p }}</span>
              </div>
            </td>
            <td>
              <span :class="['badge', isSuperAdminRole(u.role) ? 'badge-warning' : isControlEscolarOnlyRole(u.role) ? 'badge-info' : 'badge-neutral']">
                {{ roleLabel(u.role) }}
              </span>
            </td>
            <td class="text-center">
              <button class="btn btn-ghost px-2 py-1 text-xs text-brand-teal" @click="openModal(u)"><LucideSettings :size="14"/></button>
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
              <p class="text-[10px] font-black uppercase tracking-[.22em] text-brand-leaf">Directorio institucional</p>
              <h2 class="text-lg font-bold text-gray-800">{{ editingId ? 'Editar acceso de workspace' : 'Asignar usuario de workspace' }}</h2>
              <p class="text-xs text-gray-500 mt-1">Solo se permiten cuentas @casitaiedis.edu.mx. El rol predeterminado es acceso normal.</p>
            </div>
            <button type="button" class="btn btn-ghost px-2" @click="closeModal"><LucideX :size="18"/></button>
          </div>

          <form @submit.prevent="saveUser">
            <div class="modal-content grid grid-cols-1 lg:grid-cols-[1.05fr_.95fr] gap-5">
              <section class="workspace-picker-card">
                <div class="flex items-center justify-between gap-3 mb-3">
                  <label class="form-label mb-0">Buscar en Google Workspace</label>
                  <span class="text-[10px] font-bold uppercase text-gray-400">@casitaiedis.edu.mx</span>
                </div>
                <div class="relative">
                  <LucideSearch :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                  <input
                    v-model="directoryQuery"
                    type="search"
                    class="input-field pl-9"
                    placeholder="Buscar por nombre o correo institucional..."
                    autocomplete="off"
                    @focus="ensureDirectoryResults"
                  >
                  <button v-if="directoryQuery" type="button" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700" @click="directoryQuery = ''">
                    <LucideX :size="15"/>
                  </button>
                </div>

                <div class="directory-results mt-3">
                  <div v-if="directoryLoading" class="directory-empty">
                    <LucideLoader2 :size="18" class="animate-spin"/> Buscando usuarios...
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
                    <LucideCheckCircle2 v-else-if="form.email === person.email" :size="17" class="text-brand-leaf"/>
                  </button>
                  <div v-if="!directoryLoading && !directoryError && !directoryResults.length" class="directory-empty">
                    No hay resultados del directorio para esta búsqueda.
                  </div>
                </div>
              </section>

              <section class="workspace-access-card">
                <div class="selected-workspace-user">
                  <img :src="selectedAvatar" class="w-14 h-14 rounded-full border border-gray-200 object-cover bg-white" alt="Usuario seleccionado">
                  <div class="min-w-0">
                    <p class="text-xs font-bold text-gray-400 uppercase tracking-wide">Usuario seleccionado</p>
                    <h3 class="font-black text-gray-900 truncate">{{ form.username || 'Seleccione un usuario' }}</h3>
                    <p class="text-sm text-gray-500 truncate">{{ form.email || 'Sin correo asignado' }}</p>
                  </div>
                </div>

                <div class="form-group mb-0 mt-4">
                  <label class="form-label">Rol de workspace</label>
                  <select v-model="form.role" class="input-field" required>
                    <option value="plantel">Acceso normal · no restringido</option>
                    <option value="ROLE_CTRL">ROLE_CTRL · solo Control Escolar</option>
                    <option value="global">Super Admin</option>
                  </select>
                  <p class="text-xs text-gray-500 mt-1">
                    ROLE_CTRL restringe la sesión al workspace de Control Escolar. No se asigna por defecto.
                  </p>
                </div>

                <div class="form-group mb-0 mt-4 p-4 bg-white border border-gray-200 rounded-lg">
                  <label class="form-label mb-2">Planteles donde puede operar</label>
                  <div class="grid grid-cols-4 md:grid-cols-6 gap-2">
                    <label v-for="p in PLANTELES_LIST" :key="p" class="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-700 bg-gray-50 px-2 py-1.5 rounded-md border border-gray-200 hover:border-brand-leaf transition-colors" :class="{'bg-brand-leaf/5 border-brand-leaf': form.planteles.includes(p)}">
                      <input type="checkbox" :value="p" v-model="form.planteles" class="w-3.5 h-3.5 text-brand-leaf rounded border-gray-300">
                      {{ p }}
                    </label>
                  </div>
                </div>

                <div class="workspace-note mt-4">
                  <LucideShieldCheck :size="16"/>
                  <p>
                    La lista de usuarios se busca en Google Workspace. La asignación de rol se guarda en la tabla externa <code>users</code> del módulo centralizado, sin bloquear la carga normal de alumnos.
                  </p>
                </div>
              </section>
            </div>

            <div class="modal-footer flex justify-between">
              <button type="button" class="btn btn-ghost text-accent-coral hover:bg-accent-coral/10 hover:text-accent-coral" v-if="editingId" @click="deleteUser"><LucideTrash2 :size="16"/> Eliminar</button>
              <div v-else></div>
              <div class="flex gap-2">
                <button type="button" class="btn btn-ghost" @click="closeModal">Cancelar</button>
                <button type="submit" class="btn btn-primary" :disabled="saving || !canSave">
                  <LucideLoader2 v-if="saving" :size="16" class="animate-spin"/>
                  Guardar acceso
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
  LucideCheckCircle2,
  LucideLoader2,
  LucideSearch,
  LucideSettings,
  LucideShieldCheck,
  LucideTrash2,
  LucideUserPlus,
  LucideX
} from 'lucide-vue-next'
import { PLANTELES_LIST } from '~/utils/constants'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'

const { show } = useToast()
const { openMenu } = useContextMenu()

const WORKSPACE_DOMAIN = 'casitaiedis.edu.mx'
const usuarios = ref([])
const loadingTable = ref(false)
const showModal = ref(false)
const saving = ref(false)
const editingId = ref(null)
const directoryQuery = ref('')
const directoryResults = ref([])
const directoryLoading = ref(false)
const directoryError = ref('')
let directoryTimer = null

const SUPERADMIN_ROLES = new Set(['global', 'superadmin', 'role_super_admin', 'role_superadmin'])
const roleTokens = (role) => String(role || '')
  .split(',')
  .map(entry => entry.trim().toLowerCase())
  .filter(Boolean)
const isSuperAdminRole = (role) => roleTokens(role).some(entry => SUPERADMIN_ROLES.has(entry))
const isControlEscolarRole = (role) => roleTokens(role).includes('role_ctrl')
const isControlEscolarOnlyRole = (role) => {
  const roles = roleTokens(role)
  return roles.length === 1 && roles[0] === 'role_ctrl'
}
const roleLabel = (role) => {
  if (isSuperAdminRole(role)) return 'ADMIN'
  if (isControlEscolarRole(role)) return 'CONTROL ESCOLAR'
  return 'USUARIO NORMAL'
}

const emptyForm = () => ({ username: '', password: '', email: '', avatar: '', planteles: ['PT'], role: 'plantel' })
const form = ref(emptyForm())

const isWorkspaceEmail = (email) => String(email || '').trim().toLowerCase().endsWith(`@${WORKSPACE_DOMAIN}`)
const selectedAvatar = computed(() => form.value.avatar || avatarFor(form.value))
const canSave = computed(() => isWorkspaceEmail(form.value.email) && form.value.planteles.length > 0 && ['plantel', 'ROLE_CTRL', 'global'].includes(form.value.role))

const avatarFor = (u) => {
  if (u?.avatar) return u.avatar
  const params = new URLSearchParams({ email: u?.email || '', name: u?.username || u?.displayName || u?.email || 'Usuario' })
  return `/api/directory/photo?${params.toString()}`
}

watch(showModal, (val) => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = val ? 'hidden' : ''
  }
})

watch(directoryQuery, () => {
  if (!showModal.value) return
  if (directoryTimer) clearTimeout(directoryTimer)
  directoryTimer = setTimeout(searchDirectory, 280)
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
    usuarios.value = await $fetch('/api/users')
  } catch (e) {
    show(e?.data?.message || 'Error cargando usuarios', 'danger')
  } finally {
    loadingTable.value = false
  }
}

onMounted(loadUsers)

const searchDirectory = async () => {
  directoryLoading.value = true
  directoryError.value = ''
  try {
    const response = await $fetch('/api/directory/users', {
      query: { q: directoryQuery.value, limit: 12 }
    })
    directoryResults.value = Array.isArray(response?.users) ? response.users : []
  } catch (e) {
    directoryResults.value = []
    directoryError.value = e?.data?.message || 'No se pudo consultar Google Workspace Directory.'
  } finally {
    directoryLoading.value = false
  }
}

const ensureDirectoryResults = () => {
  if (!directoryResults.value.length && !directoryLoading.value) searchDirectory()
}

const selectWorkspaceUser = (person) => {
  if (!person || !isWorkspaceEmail(person.email) || person.suspended || person.archived) return
  form.value.username = person.name || person.displayName || person.email
  form.value.email = person.email
  form.value.avatar = person.avatar || avatarFor(person)
}

const showContextMenu = (event, u) => {
  openMenu(event, [
    { label: 'Opciones', disabled: true },
    { label: '-' },
    { label: 'Editar acceso', icon: LucideSettings, action: () => openModal(u) }
  ])
}

const openModal = (u = null) => {
  if (u) {
    editingId.value = u.id
    form.value = {
      username: u.username || u.displayName || u.email,
      password: '',
      email: u.email,
      avatar: avatarFor(u),
      planteles: u.planteles ? u.planteles.split(',').filter(Boolean) : ['PT'],
      role: u.role || 'plantel'
    }
    directoryQuery.value = u.email || ''
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
    show(`Seleccione un usuario @${WORKSPACE_DOMAIN} y al menos un plantel.`, 'danger')
    return
  }
  saving.value = true
  try {
    const url = editingId.value ? `/api/users/${editingId.value}` : '/api/users'
    const method = editingId.value ? 'PUT' : 'POST'
    await $fetch(url, { method, body: { ...form.value, password: '' } })
    show('Acceso guardado en usuarios externos.')
    closeModal()
    loadUsers()
  } catch (e) {
    show(e?.data?.message || 'Error al guardar', 'danger')
  } finally {
    saving.value = false
  }
}

const deleteUser = async () => {
  if (!confirm('¿Confirma la eliminación de esta asignación de workspace?')) return
  try {
    await $fetch(`/api/users/${editingId.value}`, { method: 'DELETE' })
    show('Asignación eliminada.')
    closeModal()
    loadUsers()
  } catch (e) {
    show(e?.data?.message || 'Error al eliminar', 'danger')
  }
}
</script>

<style scoped>
.workspace-user-modal {
  max-width: min(980px, calc(100vw - 32px));
}

.workspace-picker-card,
.workspace-access-card {
  border: 1px solid rgb(226 232 240);
  background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(248,250,252,.86));
  border-radius: 18px;
  padding: 16px;
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

.workspace-note {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  border: 1px solid rgba(77, 159, 101, .22);
  background: rgba(77, 159, 101, .06);
  border-radius: 14px;
  padding: 12px;
  color: rgb(51 65 85);
  font-size: 12px;
  line-height: 1.5;
}

.workspace-note svg {
  color: rgb(59 130 76);
  flex-shrink: 0;
  margin-top: 1px;
}

.workspace-note code {
  font-weight: 800;
  color: rgb(15 23 42);
}
</style>
