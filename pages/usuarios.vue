<template>
  <div class="usuarios-page">
    <div class="usuarios-main">
      <header class="usuarios-hero">
        <div>
          <p class="eyebrow">Usuarios institucionales</p>
          <h2>Usuarios</h2>
          <p>Consulta y administra los accesos al Sistema de Ingresos.</p>
        </div>
        <div class="hero-actions">
          <button type="button" class="soft-button" :disabled="loadingTable" @click="loadUsers">
            <LucideRefreshCw :size="16" :class="{ 'animate-spin': loadingTable }" />
            Actualizar
          </button>
          <button type="button" class="soft-button" :disabled="!filteredUsuarios.length" @click="exportUsers">
            <LucideDownload :size="16" />
            Exportar
          </button>
          <button type="button" class="primary-button" @click="openModal()">
            <LucidePlus :size="16" />
            Nuevo usuario
          </button>
        </div>
      </header>

      <section class="metric-grid">
        <article class="metric-card">
          <span class="metric-icon green"><LucideUsers :size="24" /></span>
          <div>
            <p>Total usuarios</p>
            <strong>{{ usuarios.length }}</strong>
            <small>Registros institucionales</small>
          </div>
        </article>
        <article class="metric-card">
          <span class="metric-icon green"><LucideShieldCheck :size="24" /></span>
          <div>
            <p>Acceso general</p>
            <strong>{{ defaultCount }}</strong>
            <small>Vista normal del sistema</small>
          </div>
        </article>
        <article class="metric-card">
          <span class="metric-icon blue"><LucideGraduationCap :size="24" /></span>
          <div>
            <p>Solo Control Escolar</p>
            <strong>{{ controlCount }}</strong>
            <small>Acceso limitado</small>
          </div>
        </article>
        <article class="metric-card">
          <span class="metric-icon red"><LucideBan :size="24" /></span>
          <div>
            <p>Bloqueados</p>
            <strong>{{ blockedCount }}</strong>
            <small>Sin acceso a Ingresos</small>
          </div>
        </article>
        <article class="metric-card">
          <span class="metric-icon purple"><LucideShield :size="24" /></span>
          <div>
            <p>Protegidos</p>
            <strong>{{ protectedCount }}</strong>
            <small>Cuentas superadmin</small>
          </div>
        </article>
        <article class="metric-card">
          <span class="metric-icon cyan"><LucideActivity :size="24" /></span>
          <div>
            <p>Actividad hoy</p>
            <strong>{{ todayCount }}</strong>
            <small>Últimas 24 horas</small>
          </div>
        </article>
      </section>

      <section v-if="!hideTruthCard" class="truth-card">
        <span class="google-mark">G</span>
        <div>
          <strong>Google Workspace es la identidad.</strong>
          <p>Cualquier cuenta @casitaiedis.edu.mx entra por defecto con acceso general.</p>
        </div>
        <div>
          <strong>Solo Control Escolar</strong>
          <p>Limita el acceso a Control Escolar.</p>
        </div>
        <div>
          <strong>Bloquear desactiva este sistema.</strong>
          <p>No elimina la cuenta de Google ni afecta otras aplicaciones.</p>
        </div>
        <button type="button" class="truth-close" aria-label="Ocultar nota" @click="hideTruthCard = true" v-if="!hideTruthCard">
          <LucideX :size="17" />
        </button>
      </section>

      <section v-if="debugEntries.length" class="debug-card" :class="{ danger: Boolean(fetchError) }">
        <div class="debug-head">
          <div>
            <strong>Diagnóstico de Usuarios</strong>
            <p>{{ debugSummary }}</p>
          </div>
          <button type="button" class="debug-toggle" @click="debugOpen = !debugOpen">
            {{ debugOpen ? 'Ocultar detalles' : 'Ver detalles' }}
          </button>
        </div>
        <div v-if="debugOpen" class="debug-body">
          <div v-for="entry in debugEntries" :key="entry.id" class="debug-row">
            <span>{{ entry.time }}</span>
            <strong>{{ entry.label }}</strong>
            <p>{{ entry.message }}</p>
          </div>
          <pre v-if="latestDebugPayload">{{ latestDebugPayload }}</pre>
        </div>
      </section>

      <section class="filters-card">
        <div class="search-control">
          <LucideSearch :size="18" />
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Buscar por nombre, correo o Google ID..."
            autocomplete="off"
          >
          <button v-if="searchQuery" type="button" @click="searchQuery = ''"><LucideX :size="15" /></button>
        </div>

        <label class="select-control">
          <span>Estado</span>
          <select v-model="statusFilter">
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="blocked">Bloqueados</option>
            <option value="protected">Protegidos</option>
          </select>
        </label>

        <label class="select-control">
          <span>Acceso efectivo</span>
          <select v-model="accessFilter">
            <option value="all">Todos</option>
            <option value="admin">Acceso general</option>
            <option value="control">Solo Control Escolar</option>
            <option value="admin_control">General + Control Escolar</option>
          </select>
        </label>

        <label class="select-control">
          <span>Actividad</span>
          <select v-model="activityFilter">
            <option value="all">Todas</option>
            <option value="today">Últimas 24 horas</option>
            <option value="week">Últimos 7 días</option>
            <option value="never">Nunca</option>
          </select>
        </label>

        <label class="select-control sort-control">
          <span>Ordenar por</span>
          <select v-model="sortBy">
            <option value="last_login_desc">Último ingreso</option>
            <option value="name_asc">Nombre</option>
            <option value="access_asc">Acceso</option>
            <option value="status_asc">Estado</option>
          </select>
        </label>
      </section>

      <section v-if="selectedEmails.length" class="bulk-card">
        <strong>{{ selectedEmails.length }} seleccionados</strong>
        <div class="bulk-actions">
          <button type="button" class="bulk-button blue" :disabled="bulkSaving" @click="requestBulkUpdate({ accessMode: 'control' }, 'Asignar acceso Control Escolar', 'Los usuarios seleccionados quedarán limitados a Control Escolar.')">
            <LucideGraduationCap :size="15" /> Asignar acceso Control Escolar
          </button>
          <button type="button" class="bulk-button green" :disabled="bulkSaving" @click="requestBulkUpdate({ accessMode: 'admin' }, 'Restaurar acceso general', 'Los usuarios seleccionados volverán a la vista normal del sistema.')">
            <LucideShieldCheck :size="15" /> Restaurar acceso general
          </button>
          <button type="button" class="bulk-button red" :disabled="bulkSaving" @click="requestBulkUpdate({ ingresosBlocked: true }, `¿Bloquear ${selectedEmails.length} usuarios?`, 'Se desactivará su acceso al Sistema de Ingresos. No se elimina la cuenta de Google.', 'danger')">
            <LucideBan :size="15" /> Bloquear seleccionados
          </button>
          <button type="button" class="bulk-button green" :disabled="bulkSaving" @click="requestBulkUpdate({ ingresosBlocked: false }, 'Reactivar usuarios', 'Los usuarios seleccionados podrán entrar nuevamente al Sistema de Ingresos.')">
            <LucideUnlock :size="15" /> Reactivar seleccionados
          </button>
        </div>
        <button type="button" class="bulk-close" @click="selectedEmails = []"><LucideX :size="16" /></button>
      </section>

      <section class="users-table-card">
        <table class="users-table">
          <thead>
            <tr>
              <th class="check-col"><input type="checkbox" :checked="allVisibleSelected" :indeterminate.prop="someVisibleSelected" @change="toggleAllVisible"></th>
              <th>Usuario</th>
              <th>Acceso efectivo</th>
              <th>Estado</th>
              <th>Último ingreso</th>
              <th class="actions-col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loadingTable">
              <td colspan="6" class="table-empty"><LucideLoader2 :size="18" class="animate-spin" /> Cargando usuarios...</td>
            </tr>
            <tr v-else-if="!pagedUsuarios.length">
              <td colspan="6" class="table-empty">No hay usuarios para mostrar.</td>
            </tr>
            <tr
              v-else
              v-for="u in pagedUsuarios"
              :key="u.email || u.id"
              class="user-row"
              :class="{ active: activeUserKey === userKey(u), blocked: isBlocked(u) }"
              @click="selectUser(u)"
              @contextmenu.prevent="showContextMenu($event, u)"
            >
              <td class="check-col" @click.stop>
                <input type="checkbox" :checked="isSelected(u)" :disabled="isProtectedUser(u)" @change="toggleSelection(u)">
              </td>
              <td>
                <div class="user-cell">
                  <img :src="avatarFor(u)" :alt="displayNameFor(u)" class="user-avatar">
                  <div>
                    <strong>{{ displayNameFor(u) }}</strong>
                    <span>{{ u.email }}</span>
                    <small v-if="u.duplicateCount > 1">{{ u.duplicateCount }} registros externos</small>
                  </div>
                </div>
              </td>
              <td>
                <span :class="['access-badge', accessBadgeClass(u)]">
                  <component :is="accessIcon(u)" :size="14" />
                  {{ accessLabel(u) }}
                </span>
                <p class="access-copy">{{ accessDescription(u) }}</p>
              </td>
              <td>
                <span :class="['status-badge', statusClass(u)]">
                  <component :is="statusIcon(u)" :size="14" />
                  {{ statusLabel(u) }}
                </span>
              </td>
              <td class="last-login-cell">
                <LucideCalendarDays :size="15" />
                <span>{{ formatLastLogin(u.last_login_at || u.lastLoginAt) }}</span>
                <small>{{ relativeLastLogin(u.last_login_at || u.lastLoginAt) }}</small>
              </td>
              <td class="actions-col" @click.stop>
                <button type="button" class="icon-button" aria-label="Editar acceso" @click="openModal(u)">
                  <LucidePencil :size="15" />
                </button>
                <button type="button" class="icon-button" :disabled="isProtectedUser(u)" :aria-label="isBlocked(u) ? 'Reactivar acceso' : 'Bloquear acceso'" @click="requestToggleBlocked(u)">
                  <component :is="isBlocked(u) ? LucideUnlock : LucideLock" :size="15" />
                </button>
                <button type="button" class="icon-button" aria-label="Más opciones" @click="showContextMenu($event, u)">
                  <LucideMoreVertical :size="15" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <footer class="table-footer">
          <span>Mostrando {{ pageStart }} a {{ pageEnd }} de {{ filteredUsuarios.length }} usuarios</span>
          <div class="pagination">
            <button type="button" :disabled="page <= 1" @click="page--"><LucideChevronLeft :size="16" /></button>
            <button
              v-for="item in pageItems"
              :key="item.key"
              type="button"
              :disabled="item.ellipsis"
              :class="{ active: item.page === page }"
              @click="!item.ellipsis && (page = item.page)"
            >{{ item.label }}</button>
            <button type="button" :disabled="page >= totalPages" @click="page++"><LucideChevronRight :size="16" /></button>
          </div>
          <label class="page-size-control">
            <select v-model.number="pageSize">
              <option :value="10">10 por página</option>
              <option :value="25">25 por página</option>
              <option :value="50">50 por página</option>
            </select>
          </label>
        </footer>
      </section>
    </div>

    <aside class="user-drawer" v-if="activeUser">
      <button type="button" class="drawer-close" @click="activeUserKey = ''"><LucideX :size="18" /></button>
      <div class="drawer-profile">
        <img :src="avatarFor(activeUser)" :alt="displayNameFor(activeUser)">
        <span :class="['status-badge', statusClass(activeUser)]">
          <component :is="statusIcon(activeUser)" :size="14" />
          {{ statusLabel(activeUser) }}
        </span>
        <h3>{{ displayNameFor(activeUser) }}</h3>
        <p>{{ activeUser.email }}</p>
      </div>

      <div class="drawer-section">
        <h4>Acceso efectivo</h4>
        <span :class="['access-badge', accessBadgeClass(activeUser)]">
          <component :is="accessIcon(activeUser)" :size="14" />
          {{ accessLabel(activeUser) }}
        </span>
        <p>{{ accessDescription(activeUser) }}</p>
        <button type="button" class="drawer-link" @click="openModal(activeUser)">Editar acceso</button>
        <button v-if="!isBlocked(activeUser) && !isProtectedUser(activeUser)" type="button" class="drawer-link danger" @click="requestToggleBlocked(activeUser)">Bloquear acceso</button>
        <button v-else-if="isBlocked(activeUser) && !isProtectedUser(activeUser)" type="button" class="drawer-link" @click="requestToggleBlocked(activeUser)">Reactivar acceso</button>
      </div>

      <div class="drawer-section">
        <h4>Último ingreso</h4>
        <div class="drawer-row">
          <LucideCalendarDays :size="16" />
          <div>
            <strong>{{ formatLastLogin(activeUser.last_login_at || activeUser.lastLoginAt) }}</strong>
            <span>{{ relativeLastLogin(activeUser.last_login_at || activeUser.lastLoginAt) }}</span>
          </div>
        </div>
      </div>

      <div class="drawer-section">
        <h4>Información general</h4>
        <dl class="drawer-list">
          <div><dt>Google ID</dt><dd>{{ activeUser.email }}</dd></div>
          <div><dt>Nombre completo</dt><dd>{{ displayNameFor(activeUser) }}</dd></div>
          <div><dt>Primera vez</dt><dd>{{ formatDateOnly(activeUser.created_at) }}</dd></div>
          <div><dt>Acceso técnico</dt><dd>{{ technicalAccessLabel(activeUser) }}</dd></div>
          <div><dt>Protegido por</dt><dd>{{ isProtectedUser(activeUser) ? 'Sistema' : '—' }}</dd></div>
        </dl>
      </div>
    </aside>

    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
        <div class="user-modal">
          <header class="modal-top">
            <div>
              <p class="eyebrow">Workspace</p>
              <h3>{{ editingId ? 'Editar usuario' : 'Nuevo usuario' }}</h3>
              <span>Selecciona la cuenta institucional y define su acceso.</span>
            </div>
            <button type="button" class="icon-button" @click="closeModal"><LucideX :size="18" /></button>
          </header>

          <form @submit.prevent="saveUser">
            <div class="modal-grid">
              <section class="modal-panel">
                <label class="field-label">Buscar usuario</label>
                <div class="directory-search">
                  <LucideSearch :size="16" />
                  <input v-model="directoryQuery" type="search" placeholder="Nombre o correo institucional..." autocomplete="off" @focus="ensureDirectoryResults">
                  <button v-if="directoryQuery" type="button" @click="directoryQuery = ''"><LucideX :size="15" /></button>
                </div>

                <div class="directory-list">
                  <div v-if="directoryLoading" class="directory-empty"><LucideLoader2 :size="18" class="animate-spin" /> Buscando usuarios...</div>
                  <div v-else-if="directoryError" class="directory-error">{{ directoryError }}</div>
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
                    <img :src="person.avatar" :alt="person.name">
                    <span>
                      <strong>{{ person.name }}</strong>
                      <small>{{ person.email }}</small>
                    </span>
                    <em v-if="person.suspended || person.archived">Inactivo</em>
                    <LucideCheckCircle2 v-else-if="form.email === person.email" :size="17" />
                  </button>
                  <div v-if="!directoryLoading && !directoryError && !directoryResults.length" class="directory-empty">No hay resultados para esta búsqueda.</div>
                </div>
              </section>

              <section class="modal-panel">
                <div class="selected-user-card">
                  <img :src="selectedAvatar" alt="Usuario seleccionado">
                  <div>
                    <small>Usuario seleccionado</small>
                    <strong>{{ form.displayName || 'Seleccione un usuario' }}</strong>
                    <span>{{ form.email || 'Sin correo asignado' }}</span>
                  </div>
                </div>

                <label class="field-label">Acceso</label>
                <div class="access-options">
                  <button
                    v-for="option in accessOptions"
                    :key="option.value"
                    type="button"
                    class="access-option"
                    :class="[{ active: form.accessMode === option.value }, option.value]"
                    @click="form.accessMode = option.value"
                  >
                    <component :is="option.icon" :size="17" />
                    <span>{{ option.label }}</span>
                    <small>{{ option.description }}</small>
                  </button>
                </div>

                <label class="field-label">Estado en Sistema de Ingresos</label>
                <label class="block-toggle" :class="{ active: form.ingresosBlocked }">
                  <input type="checkbox" v-model="form.ingresosBlocked" :disabled="isProtectedEmail(form.email)">
                  <span>{{ form.ingresosBlocked ? 'Bloqueado' : 'Activo' }}</span>
                </label>

                <label class="field-label">Planteles</label>
                <div class="plantel-grid">
                  <label v-for="p in PLANTELES_LIST" :key="p" :class="{ active: form.planteles.includes(p) }">
                    <input type="checkbox" :value="p" v-model="form.planteles">
                    {{ p }}
                  </label>
                </div>
              </section>
            </div>

            <footer class="modal-footer">
              <span>{{ form.email || 'Pendiente' }}</span>
              <div>
                <button type="button" class="soft-button" @click="closeModal">Cancelar</button>
                <button type="submit" class="primary-button" :disabled="saving || !canSave">
                  <LucideLoader2 v-if="saving" :size="16" class="animate-spin" />
                  Guardar
                </button>
              </div>
            </footer>
          </form>
        </div>
      </div>

      <div v-if="pendingAction" class="modal-overlay" @click.self="pendingAction = null">
        <div class="confirm-modal">
          <button type="button" class="confirm-close" @click="pendingAction = null"><LucideX :size="18" /></button>
          <span :class="['confirm-icon', pendingAction.tone === 'danger' ? 'danger' : 'safe']">
            <component :is="pendingAction.tone === 'danger' ? LucideBan : LucideShieldCheck" :size="34" />
          </span>
          <h3>{{ pendingAction.title }}</h3>
          <div v-if="pendingAction.tone === 'danger'" class="confirm-warning">
            <ul>
              <li>Esto no elimina la cuenta de Google.</li>
              <li>El usuario seguirá existiendo en tu organización.</li>
              <li>El bloqueo no afecta el acceso a otras aplicaciones.</li>
            </ul>
          </div>
          <p>{{ pendingAction.body }}</p>
          <div class="confirm-actions">
            <button type="button" class="soft-button" @click="pendingAction = null">Cancelar</button>
            <button type="button" class="primary-button" :class="{ danger: pendingAction.tone === 'danger' }" :disabled="bulkSaving" @click="runPendingAction">
              <LucideLoader2 v-if="bulkSaving" :size="16" class="animate-spin" />
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import {
  LucideActivity,
  LucideBan,
  LucideBriefcase,
  LucideCalendarDays,
  LucideCheckCircle2,
  LucideChevronLeft,
  LucideChevronRight,
  LucideDownload,
  LucideGraduationCap,
  LucideLoader2,
  LucideLock,
  LucideMoreVertical,
  LucidePencil,
  LucidePlus,
  LucideRefreshCw,
  LucideSearch,
  LucideShield,
  LucideShieldCheck,
  LucideUnlock,
  LucideUsers,
  LucideX
} from 'lucide-vue-next'
import { PLANTELES_LIST } from '~/utils/constants'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'

const { show } = useToast()
const { openMenu } = useContextMenu()

const WORKSPACE_DOMAIN = 'casitaiedis.edu.mx'
const CONTROL_ROLE = 'ROLE_CTRL'
const PROTECTED_EMAILS = new Set([
  `desarrollo.tecnologico@${WORKSPACE_DOMAIN}`,
  `coord.admon@${WORKSPACE_DOMAIN}`
])

const usuarios = ref([])
const loadingTable = ref(false)
const bulkSaving = ref(false)
const selectedEmails = ref([])
const activeUserKey = ref('')
const showModal = ref(false)
const saving = ref(false)
const editingId = ref(null)
const searchQuery = ref('')
const statusFilter = ref('all')
const accessFilter = ref('all')
const activityFilter = ref('all')
const sortBy = ref('last_login_desc')
const page = ref(1)
const pageSize = ref(10)
const directoryQuery = ref('')
const directoryResults = ref([])
const directoryLoading = ref(false)
const directoryError = ref('')
const pendingAction = ref(null)
const debugEntries = ref([])
const debugOpen = ref(false)
const fetchError = ref(null)
const hideTruthCard = ref(false)
let directoryTimer = null
let debugId = 0

const accessOptions = [
  { value: 'admin', label: 'Acceso general', description: 'Vista normal del sistema.', icon: LucideShieldCheck },
  { value: 'control', label: 'Solo Control Escolar', description: 'Acceso limitado a Control Escolar.', icon: LucideGraduationCap },
  { value: 'admin_control', label: 'General + Control Escolar', description: 'Vista normal con entrada a Control Escolar.', icon: LucideBriefcase }
]

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

const normalizeEmail = (email) => String(email || '').trim().toLowerCase()
const roleTokens = (role) => String(role || '').split(',').map(entry => entry.trim().toLowerCase()).filter(Boolean)
const hasControlEscolarRole = (role) => roleTokens(role).includes(CONTROL_ROLE.toLowerCase())
const hasOnlyControlRole = (role) => {
  const tokens = roleTokens(role)
  return tokens.length === 1 && tokens[0] === CONTROL_ROLE.toLowerCase()
}
const isWorkspaceEmail = (email) => normalizeEmail(email).endsWith(`@${WORKSPACE_DOMAIN}`)
const isProtectedEmail = (email) => PROTECTED_EMAILS.has(normalizeEmail(email))
const isProtectedUser = (u) => Boolean(u?.protected) || isProtectedEmail(u?.email)
const isBlocked = (u) => u?.ingresosBlocked === true || u?.ingresos_blocked === 1 || u?.ingresos_blocked === '1'
const userKey = (u) => normalizeEmail(u?.email) || String(u?.id || '')

const displayNameFor = (u) => u?.workspaceName || u?.displayName || u?.username || u?.email || 'Usuario'
const avatarFor = (u) => {
  if (u?.workspaceAvatar || u?.avatar || u?.picture) return u.workspaceAvatar || u.avatar || u.picture
  const params = new URLSearchParams({ email: u?.email || '', name: displayNameFor(u) })
  return `/api/directory/photo?${params.toString()}`
}
const plantelesFor = (u) => String(u?.planteles || u?.plantel || '').split(',').map(p => p.trim()).filter(Boolean)

const accessModeForRole = (role) => {
  if (hasOnlyControlRole(role)) return 'control'
  if (hasControlEscolarRole(role)) return 'admin_control'
  return 'admin'
}
const accessLabelForMode = (mode) => {
  if (mode === 'control') return 'Solo Control Escolar'
  if (mode === 'admin_control') return 'General + Control Escolar'
  return 'Acceso general'
}
const accessDescriptionForMode = (mode) => {
  if (mode === 'control') return 'Acceso limitado a Control Escolar.'
  if (mode === 'admin_control') return 'Acceso completo + Control Escolar.'
  return 'Acceso completo.'
}
const accessIconForMode = (mode) => {
  if (mode === 'control') return LucideGraduationCap
  if (mode === 'admin_control') return LucideBriefcase
  return LucideShieldCheck
}
const accessClassForMode = (mode) => {
  if (mode === 'control') return 'control'
  if (mode === 'admin_control') return 'mixed'
  return 'general'
}
const accessMode = (u) => accessModeForRole(u?.role)
const accessLabel = (u) => accessLabelForMode(accessMode(u))
const accessDescription = (u) => accessDescriptionForMode(accessMode(u))
const accessIcon = (u) => accessIconForMode(accessMode(u))
const accessBadgeClass = (u) => accessClassForMode(accessMode(u))
const technicalAccessLabel = (u) => accessLabel(u)

const statusLabel = (u) => {
  if (isProtectedUser(u)) return 'Protegido'
  return isBlocked(u) ? 'Bloqueado' : 'Activo'
}
const statusClass = (u) => {
  if (isProtectedUser(u)) return 'protected'
  return isBlocked(u) ? 'blocked' : 'active'
}
const statusIcon = (u) => {
  if (isProtectedUser(u)) return LucideShield
  return isBlocked(u) ? LucideBan : LucideCheckCircle2
}

const selectedAvatar = computed(() => form.value.avatar || form.value.picture || avatarFor(form.value))
const canSave = computed(() => isWorkspaceEmail(form.value.email) && form.value.planteles.length > 0 && accessOptions.some(option => option.value === form.value.accessMode))
const activeUser = computed(() => activeUserKey.value ? (usuarios.value.find(u => userKey(u) === activeUserKey.value) || null) : null)

const lastLoginMs = (u) => {
  const parsed = new Date(u?.last_login_at || u?.lastLoginAt || 0).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}
const isWithinDays = (u, days) => {
  const ms = lastLoginMs(u)
  return ms > 0 && Date.now() - ms <= days * 24 * 60 * 60 * 1000
}

const filteredUsuarios = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  let rows = usuarios.value.filter((u) => {
    if (!isWorkspaceEmail(u.email)) return false
    if (statusFilter.value === 'active' && (isBlocked(u) || isProtectedUser(u))) return false
    if (statusFilter.value === 'blocked' && !isBlocked(u)) return false
    if (statusFilter.value === 'protected' && !isProtectedUser(u)) return false
    if (accessFilter.value !== 'all' && accessMode(u) !== accessFilter.value) return false
    if (activityFilter.value === 'today' && !isWithinDays(u, 1)) return false
    if (activityFilter.value === 'week' && !isWithinDays(u, 7)) return false
    if (activityFilter.value === 'never' && lastLoginMs(u) > 0) return false
    if (!query) return true
    return [displayNameFor(u), u.email, accessLabel(u), statusLabel(u), u.planteles, u.plantel]
      .some(value => String(value || '').toLowerCase().includes(query))
  })

  rows = [...rows].sort((a, b) => {
    if (sortBy.value === 'name_asc') return displayNameFor(a).localeCompare(displayNameFor(b))
    if (sortBy.value === 'access_asc') return accessLabel(a).localeCompare(accessLabel(b)) || displayNameFor(a).localeCompare(displayNameFor(b))
    if (sortBy.value === 'status_asc') return statusLabel(a).localeCompare(statusLabel(b)) || displayNameFor(a).localeCompare(displayNameFor(b))
    return lastLoginMs(b) - lastLoginMs(a) || displayNameFor(a).localeCompare(displayNameFor(b))
  })

  return rows
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredUsuarios.value.length / pageSize.value)))
const pagedUsuarios = computed(() => filteredUsuarios.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const pageStart = computed(() => filteredUsuarios.value.length ? ((page.value - 1) * pageSize.value) + 1 : 0)
const pageEnd = computed(() => Math.min(filteredUsuarios.value.length, page.value * pageSize.value))
const pageItems = computed(() => {
  const total = totalPages.value
  const current = page.value
  const values = new Set([1, total, current, current - 1, current + 1].filter(n => n >= 1 && n <= total))
  const sorted = Array.from(values).sort((a, b) => a - b)
  const items = []
  sorted.forEach((item, index) => {
    if (index && item - sorted[index - 1] > 1) items.push({ key: `ellipsis-${item}`, label: '…', ellipsis: true })
    items.push({ key: `page-${item}`, label: String(item), page: item })
  })
  return items
})

const controlCount = computed(() => usuarios.value.filter(u => accessMode(u) === 'control').length)
const defaultCount = computed(() => usuarios.value.filter(u => accessMode(u) === 'admin').length)
const blockedCount = computed(() => usuarios.value.filter(isBlocked).length)
const protectedCount = computed(() => usuarios.value.filter(isProtectedUser).length)
const todayCount = computed(() => usuarios.value.filter(u => isWithinDays(u, 1)).length)
const visibleSelectableEmails = computed(() => pagedUsuarios.value.filter(u => !isProtectedUser(u)).map(u => normalizeEmail(u.email)).filter(Boolean))
const allVisibleSelected = computed(() => visibleSelectableEmails.value.length > 0 && visibleSelectableEmails.value.every(email => selectedEmails.value.includes(email)))
const someVisibleSelected = computed(() => visibleSelectableEmails.value.some(email => selectedEmails.value.includes(email)) && !allVisibleSelected.value)
const debugSummary = computed(() => fetchError.value ? `Error ${fetchError.value.status || ''}: ${fetchError.value.message}` : `${usuarios.value.length} usuarios cargados desde la base externa.`)
const latestDebugPayload = computed(() => {
  const payload = debugEntries.value.find(entry => entry.payload)?.payload
  return payload ? JSON.stringify(payload, null, 2) : ''
})

watch([searchQuery, statusFilter, accessFilter, activityFilter, sortBy, pageSize], () => { page.value = 1 })
watch(totalPages, (total) => { if (page.value > total) page.value = total })
watch(showModal, (val) => {
  if (typeof document !== 'undefined') document.body.style.overflow = val ? 'hidden' : ''
})
watch(directoryQuery, () => {
  if (!showModal.value) return
  if (directoryTimer) clearTimeout(directoryTimer)
  directoryTimer = setTimeout(searchDirectory, 220)
})

onMounted(loadUsers)
onUnmounted(() => {
  if (directoryTimer) clearTimeout(directoryTimer)
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})

const addDebug = (label, message, payload = null) => {
  debugEntries.value = [{
    id: ++debugId,
    time: new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()),
    label,
    message,
    payload
  }, ...debugEntries.value].slice(0, 12)
}
const extractStatus = (e) => e?.statusCode || e?.response?.status || e?.data?.statusCode || e?.response?._data?.statusCode || null
const extractMessage = (e) => e?.data?.message || e?.response?._data?.message || e?.message || 'Error cargando usuarios'
const extractDebug = (e) => e?.data?.data?.debug || e?.data?.debug || e?.response?._data?.data?.debug || e?.response?._data?.debug || null

const hydrateWorkspaceProfiles = async (rows) => {
  const emails = rows.map(row => normalizeEmail(row.email)).filter(Boolean).slice(0, 250)
  if (!emails.length) return rows

  try {
    addDebug('POST /api/directory/users', 'Enriqueciendo nombre e imagen desde Google Workspace.')
    const response = await $fetch('/api/directory/users', {
      method: 'POST',
      body: { emails }
    })
    const profiles = new Map((response?.users || []).map(profile => [normalizeEmail(profile.email || profile.primaryEmail), profile]))
    addDebug('200 /api/directory/users', `${profiles.size} perfiles de Workspace aplicados.`, { requested: emails.length, applied: profiles.size, errors: response?.errors?.length || 0 })
    return rows.map((row) => {
      const profile = profiles.get(normalizeEmail(row.email))
      if (!profile) return row
      return {
        ...row,
        workspaceName: profile.name || profile.displayName || row.workspaceName,
        workspaceAvatar: profile.avatar || row.workspaceAvatar,
        workspaceSuspended: Boolean(profile.suspended),
        workspaceArchived: Boolean(profile.archived),
        workspaceOrgUnitPath: profile.orgUnitPath || ''
      }
    })
  } catch (e) {
    addDebug('WARN /api/directory/users', extractMessage(e) || 'No se pudo enriquecer desde Google Workspace.', extractDebug(e) || e?.data || e?.response?._data || null)
    return rows
  }
}

async function loadUsers () {
  loadingTable.value = true
  fetchError.value = null
  addDebug('GET /api/users', 'Solicitando usuarios desde la base externa central.')
  try {
    const rows = await $fetch('/api/users')
    const visibleRows = Array.isArray(rows) ? rows.filter(u => isWorkspaceEmail(u.email)) : []
    usuarios.value = await hydrateWorkspaceProfiles(visibleRows)
    selectedEmails.value = selectedEmails.value.filter(email => usuarios.value.some(u => normalizeEmail(u.email) === email))
    if (!usuarios.value.some(u => userKey(u) === activeUserKey.value)) activeUserKey.value = usuarios.value.length ? userKey(usuarios.value[0]) : ''
    addDebug('200 /api/users', `${usuarios.value.length} usuarios visibles después del filtro institucional.`, { receivedRows: Array.isArray(rows) ? rows.length : 0, visibleRows: usuarios.value.length })
  } catch (e) {
    const status = extractStatus(e)
    const message = extractMessage(e)
    const serverDebug = extractDebug(e)
    fetchError.value = { status, message, debug: serverDebug }
    debugOpen.value = true
    addDebug(`${status || 'ERR'} /api/users`, message, serverDebug || e?.data || e?.response?._data || null)
    show(message, 'danger')
  } finally {
    loadingTable.value = false
  }
}

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
  selectedEmails.value = allVisibleSelected.value
    ? selectedEmails.value.filter(email => !visible.includes(email))
    : Array.from(new Set([...selectedEmails.value, ...visible]))
}
const selectUser = (u) => { activeUserKey.value = userKey(u) }

const searchDirectory = async () => {
  directoryLoading.value = true
  directoryError.value = ''
  try {
    const response = await $fetch('/api/directory/users', { query: { q: directoryQuery.value, limit: 12 } })
    directoryResults.value = Array.isArray(response?.users) ? response.users.filter(person => isWorkspaceEmail(person.email)) : []
  } catch (e) {
    directoryResults.value = []
    directoryError.value = extractMessage(e) || 'No se pudo consultar Workspace.'
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

const requestBulkUpdate = (patch, title, body, tone = 'safe', sourceEmails = selectedEmails.value) => {
  const emails = sourceEmails.map(normalizeEmail).filter(email => email && !isProtectedEmail(email))
  if (!emails.length) return
  pendingAction.value = { patch, title, body, tone, emails }
}
const requestToggleBlocked = (u) => {
  if (!u || isProtectedUser(u)) return
  const blocked = !isBlocked(u)
  requestBulkUpdate(
    { ingresosBlocked: blocked },
    blocked ? `¿Bloquear a ${displayNameFor(u)}?` : `¿Reactivar a ${displayNameFor(u)}?`,
    blocked ? 'Se desactivará su acceso al Sistema de Ingresos.' : 'El usuario podrá entrar nuevamente al Sistema de Ingresos.',
    blocked ? 'danger' : 'safe',
    [u.email]
  )
}
const runPendingAction = async () => {
  if (!pendingAction.value) return
  bulkSaving.value = true
  try {
    await $fetch('/api/users/bulk', {
      method: 'PATCH',
      body: { emails: pendingAction.value.emails, ...pendingAction.value.patch }
    })
    show('Usuarios actualizados.')
    selectedEmails.value = []
    pendingAction.value = null
    await loadUsers()
  } catch (e) {
    const message = extractMessage(e) || 'Error al actualizar usuarios'
    const serverDebug = extractDebug(e)
    if (serverDebug) addDebug('PATCH /api/users/bulk', message, serverDebug)
    show(message, 'danger')
  } finally {
    bulkSaving.value = false
  }
}

const showContextMenu = (event, u) => {
  openMenu(event, [
    { label: 'Opciones', disabled: true, action: () => {} },
    { label: 'Editar usuario', icon: LucidePencil, action: () => openModal(u) },
    { label: 'Asignar acceso Control Escolar', icon: LucideGraduationCap, disabled: isProtectedUser(u), action: () => requestBulkUpdate({ accessMode: 'control' }, 'Asignar acceso Control Escolar', 'El usuario quedará limitado a Control Escolar.', 'safe', [u.email]) },
    { label: 'Restaurar acceso general', icon: LucideShieldCheck, disabled: isProtectedUser(u), action: () => requestBulkUpdate({ accessMode: 'admin' }, 'Restaurar acceso general', 'El usuario volverá a la vista normal del sistema.', 'safe', [u.email]) },
    { label: isBlocked(u) ? 'Reactivar acceso' : 'Bloquear acceso', icon: isBlocked(u) ? LucideUnlock : LucideBan, disabled: isProtectedUser(u), action: () => requestToggleBlocked(u) }
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
const closeModal = () => { showModal.value = false }

const saveUser = async () => {
  if (!canSave.value) {
    show(`Seleccione una cuenta @${WORKSPACE_DOMAIN} y al menos un plantel.`, 'danger')
    return
  }
  saving.value = true
  const url = editingId.value ? `/api/users/${editingId.value}` : '/api/users'
  const method = editingId.value ? 'PUT' : 'POST'
  try {
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
    const message = extractMessage(e) || 'Error al guardar'
    const serverDebug = extractDebug(e)
    if (serverDebug) addDebug(`${method} ${url}`, message, serverDebug)
    show(message, 'danger')
  } finally {
    saving.value = false
  }
}

const formatLastLogin = (value) => {
  if (!value) return 'Nunca'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Nunca'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
const formatDateOnly = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
const relativeLastLogin = (value) => {
  if (!value) return 'Sin registro'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Sin registro'
  const diff = Date.now() - date.getTime()
  if (diff < 60 * 1000) return 'hace menos de un minuto'
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} hora${hours === 1 ? '' : 's'}`
  const days = Math.floor(hours / 24)
  return `hace ${days} día${days === 1 ? '' : 's'}`
}

const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
const exportUsers = () => {
  const headers = ['nombre', 'email', 'acceso', 'estado', 'ultimo_ingreso']
  const rows = filteredUsuarios.value.map(u => [displayNameFor(u), u.email, accessLabel(u), statusLabel(u), formatLastLogin(u.last_login_at || u.lastLoginAt)])
  const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `usuarios-sistema-ingresos-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.usuarios-page {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 24px;
  max-width: 1540px;
  margin: 0 auto;
  padding-bottom: 28px;
}

.usuarios-main {
  min-width: 0;
}

.usuarios-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.eyebrow {
  color: #138a2e;
  font-size: 11px;
  line-height: 1;
  font-weight: 950;
  letter-spacing: .18em;
  text-transform: uppercase;
}

.usuarios-hero h2 {
  margin-top: 8px;
  color: #14213d;
  font-size: 31px;
  line-height: 1;
  font-weight: 950;
  letter-spacing: -.045em;
}

.usuarios-hero p:not(.eyebrow) {
  margin-top: 8px;
  color: #65728a;
  font-size: 14px;
  font-weight: 650;
}

.hero-actions,
.bulk-actions,
.confirm-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.soft-button,
.primary-button,
.icon-button,
.bulk-button,
.debug-toggle {
  border: 0;
  font-weight: 900;
  transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease;
}

.soft-button,
.primary-button {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 13px;
  padding: 0 17px;
  font-size: 13px;
}

.soft-button {
  color: #263653;
  background: #fff;
  border: 1px solid #dfe6f0;
  box-shadow: 0 8px 24px rgba(20, 33, 61, .06);
}

.primary-button {
  color: #fff;
  background: linear-gradient(135deg, #38b54a, #1e9a38);
  box-shadow: 0 14px 30px rgba(30, 154, 56, .25);
}

.primary-button.danger {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  box-shadow: 0 14px 30px rgba(220, 38, 38, .22);
}

.soft-button:hover:not(:disabled),
.primary-button:hover:not(:disabled),
.icon-button:hover:not(:disabled),
.bulk-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

button:disabled {
  opacity: .48;
  cursor: not-allowed;
  transform: none !important;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.metric-card {
  min-height: 94px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  border: 1px solid #dce5ef;
  border-radius: 18px;
  background: rgba(255, 255, 255, .94);
  box-shadow: 0 18px 45px rgba(20, 33, 61, .05);
}

.metric-icon {
  width: 50px;
  height: 50px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
}

.metric-icon.green { color: #17963a; background: #eafbea; }
.metric-icon.blue { color: #2563eb; background: #eaf2ff; }
.metric-icon.red { color: #dc2626; background: #fff0f0; }
.metric-icon.purple { color: #7c3aed; background: #f3edff; }
.metric-icon.cyan { color: #0f9f9a; background: #e8fbf8; }

.metric-card p {
  color: #516078;
  font-size: 11px;
  font-weight: 950;
}

.metric-card strong {
  display: block;
  color: #14213d;
  font-size: 22px;
  line-height: 1.12;
  font-weight: 950;
}

.metric-card small {
  color: #78869b;
  font-size: 10px;
  font-weight: 800;
}

.truth-card {
  position: relative;
  display: grid;
  grid-template-columns: auto repeat(3, minmax(0, 1fr));
  gap: 22px;
  align-items: center;
  margin-bottom: 18px;
  padding: 17px 44px 17px 22px;
  border: 1px solid #cce9d4;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(244, 253, 246, .97), rgba(255, 255, 255, .96));
  color: #1d2b46;
}

.google-mark {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d7e5f2;
  border-radius: 12px;
  color: #24324b;
  background: #ffffff;
  box-shadow: 0 10px 24px rgba(22, 37, 67, .08);
  font-size: 22px;
  font-weight: 950;
}

.truth-card strong {
  font-size: 12px;
  font-weight: 950;
}

.truth-card p {
  margin-top: 5px;
  color: #55637a;
  font-size: 12px;
  line-height: 1.45;
  font-weight: 700;
}

.truth-close {
  position: absolute;
  top: 12px;
  right: 12px;
  color: #45546c;
  background: transparent;
  border: 0;
}

.debug-card,
.filters-card,
.bulk-card,
.users-table-card,
.user-drawer,
.user-modal,
.confirm-modal {
  border: 1px solid #dce5ef;
  background: rgba(255, 255, 255, .96);
  box-shadow: 0 18px 45px rgba(20, 33, 61, .06);
}

.debug-card {
  margin-bottom: 16px;
  border-radius: 16px;
  padding: 14px;
}

.debug-card.danger {
  border-color: #fecdd3;
  background: #fff7f8;
}

.debug-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.debug-head strong {
  color: #14213d;
  font-size: 13px;
  font-weight: 950;
}

.debug-head p {
  margin-top: 4px;
  color: #65728a;
  font-size: 12px;
  font-weight: 700;
}

.debug-toggle {
  color: #2563eb;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 11px;
}

.debug-body {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}

.debug-row {
  display: grid;
  grid-template-columns: 80px 150px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 10px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #e7edf5;
  font-size: 12px;
}

.debug-row span {
  color: #7a879a;
  font-weight: 850;
}

.debug-row strong {
  color: #14213d;
  font-weight: 950;
}

.debug-row p {
  color: #48566e;
  font-weight: 700;
}

.debug-body pre {
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  padding: 12px;
  border-radius: 12px;
  background: #0f172a;
  color: #dbeafe;
  font-size: 11px;
  line-height: 1.5;
}

.filters-card {
  display: grid;
  grid-template-columns: minmax(260px, 1.35fr) repeat(4, minmax(140px, .6fr));
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
  padding: 13px;
  border-radius: 16px;
}

.search-control,
.directory-search {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 9px;
  border: 1px solid #dce5ef;
  border-radius: 13px;
  background: #fff;
  padding: 0 12px;
  color: #6b778e;
}

.search-control input,
.directory-search input,
.select-control select,
.page-size-control select {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #1d2b46;
  font-size: 12px;
  font-weight: 850;
}

.search-control button,
.directory-search button {
  border: 0;
  background: transparent;
  color: #78869b;
}

.select-control {
  min-height: 44px;
  display: grid;
  align-content: center;
  gap: 2px;
  border: 1px solid #dce5ef;
  border-radius: 13px;
  background: #fff;
  padding: 7px 12px;
}

.select-control span {
  color: #65728a;
  font-size: 10px;
  line-height: 1;
  font-weight: 950;
}

.bulk-card {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 0;
  padding: 12px 48px 12px 16px;
  border-radius: 16px 16px 0 0;
  border-color: #cce9d4;
  background: #f3fcf5;
}

.bulk-card strong {
  color: #138a2e;
  font-size: 13px;
  font-weight: 950;
}

.bulk-button {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border-radius: 10px;
  padding: 0 12px;
  font-size: 12px;
  background: #fff;
  border: 1px solid #dce5ef;
}

.bulk-button.green { color: #178c36; border-color: #bfe8cb; background: #f7fdf8; }
.bulk-button.blue { color: #2563eb; border-color: #bfdbfe; background: #f8fbff; }
.bulk-button.red { color: #dc2626; border-color: #fecaca; background: #fff8f8; }

.bulk-close {
  position: absolute;
  top: 15px;
  right: 14px;
  border: 0;
  background: transparent;
  color: #65728a;
}

.users-table-card {
  overflow: hidden;
  border-radius: 0 0 18px 18px;
}

.bulk-card + .users-table-card {
  border-top: 0;
}

.users-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.users-table th {
  height: 48px;
  color: #47546b;
  background: #f8fafc;
  border-bottom: 1px solid #e4ebf3;
  padding: 0 15px;
  font-size: 11px;
  font-weight: 950;
  text-align: left;
  text-transform: uppercase;
}

.users-table td {
  height: 62px;
  padding: 10px 15px;
  border-bottom: 1px solid #edf2f7;
  vertical-align: middle;
}

.user-row {
  cursor: pointer;
  transition: background .16s ease, box-shadow .16s ease;
}

.user-row:hover,
.user-row.active {
  background: #f8fbff;
}

.user-row.blocked {
  background: rgba(255, 241, 242, .42);
}

.check-col {
  width: 44px;
  text-align: center !important;
}

.actions-col {
  width: 142px;
  text-align: right !important;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.user-avatar {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border-radius: 999px;
  object-fit: cover;
  border: 2px solid #fff;
  box-shadow: 0 7px 18px rgba(20, 33, 61, .12);
  background: #eef2f7;
}

.user-cell strong {
  display: block;
  color: #14213d;
  font-size: 13px;
  font-weight: 950;
  line-height: 1.2;
}

.user-cell span,
.user-cell small {
  display: block;
  color: #65728a;
  font-size: 11px;
  font-weight: 800;
}

.access-badge,
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 28px;
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
}

.access-badge.general { color: #15803d; background: #effcf3; border-color: #bbf7d0; }
.access-badge.control { color: #2563eb; background: #eff6ff; border-color: #bfdbfe; }
.access-badge.mixed { color: #7c3aed; background: #f5f0ff; border-color: #ddd6fe; }
.status-badge.active { color: #15803d; background: #effcf3; border-color: #bbf7d0; }
.status-badge.blocked { color: #dc2626; background: #fff1f2; border-color: #fecdd3; }
.status-badge.protected { color: #7c3aed; background: #f5f0ff; border-color: #ddd6fe; }

.access-copy {
  margin-top: 4px;
  color: #65728a;
  font-size: 11px;
  line-height: 1.25;
  font-weight: 700;
}

.last-login-cell {
  color: #47546b;
  font-size: 12px;
  font-weight: 850;
}

.last-login-cell svg {
  display: inline-block;
  margin-right: 7px;
  vertical-align: -3px;
  color: #65728a;
}

.last-login-cell small {
  display: block;
  margin-top: 3px;
  color: #7a879a;
  font-size: 11px;
  font-weight: 750;
}

.icon-button {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
  color: #263653;
  background: #fff;
  border: 1px solid #dce5ef;
  border-radius: 11px;
  box-shadow: 0 8px 18px rgba(20, 33, 61, .05);
}

.icon-button:hover:not(:disabled) {
  color: #15803d;
  border-color: #bfe8cb;
}

.table-empty {
  height: 180px !important;
  text-align: center;
  color: #65728a;
  font-size: 13px;
  font-weight: 850;
}

.table-empty svg {
  display: inline-block;
  margin-right: 8px;
  vertical-align: -4px;
}

.table-footer {
  min-height: 58px;
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 14px;
  align-items: center;
  padding: 0 16px;
  color: #65728a;
  font-size: 12px;
  font-weight: 800;
}

.pagination {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pagination button,
.page-size-control {
  min-width: 33px;
  height: 33px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 10px;
  color: #47546b;
  background: transparent;
  font-size: 12px;
  font-weight: 900;
}

.pagination button.active {
  color: #fff;
  background: #42b946;
  box-shadow: 0 8px 20px rgba(66, 185, 70, .22);
}

.page-size-control {
  min-width: 124px;
  padding: 0 10px;
  border-color: #dce5ef;
  background: #fff;
}

.user-drawer {
  position: sticky;
  top: 18px;
  align-self: start;
  min-height: calc(100vh - 118px);
  border-radius: 0;
  border-top: 0;
  border-bottom: 0;
  border-right: 0;
  padding: 30px 24px;
  background: rgba(255,255,255,.96);
}

.drawer-close {
  position: absolute;
  top: 18px;
  right: 18px;
  color: #14213d;
  background: transparent;
  border: 0;
}

.drawer-profile {
  padding-top: 8px;
  text-align: left;
}

.drawer-profile img {
  width: 70px;
  height: 70px;
  display: block;
  border-radius: 999px;
  object-fit: cover;
  box-shadow: 0 14px 28px rgba(20,33,61,.12);
  margin-bottom: 12px;
}

.drawer-profile h3 {
  margin-top: 14px;
  color: #14213d;
  font-size: 20px;
  line-height: 1.16;
  font-weight: 950;
  letter-spacing: -.035em;
}

.drawer-profile p {
  margin-top: 5px;
  color: #65728a;
  font-size: 13px;
  font-weight: 800;
  word-break: break-word;
}

.drawer-section {
  border-top: 1px solid #e5edf5;
  margin-top: 22px;
  padding-top: 18px;
}

.drawer-section h4 {
  margin-bottom: 12px;
  color: #263653;
  font-size: 13px;
  font-weight: 950;
}

.drawer-section p {
  margin-top: 9px;
  color: #65728a;
  font-size: 12px;
  line-height: 1.45;
  font-weight: 750;
}

.drawer-link {
  display: block;
  margin-top: 10px;
  padding: 0;
  color: #2563eb;
  background: transparent;
  border: 0;
  font-size: 12px;
  font-weight: 950;
  text-decoration: underline;
}

.drawer-link.danger { color: #dc2626; }

.drawer-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: #65728a;
}

.drawer-row strong,
.drawer-row span {
  display: block;
  color: #263653;
  font-size: 12px;
  font-weight: 850;
}

.drawer-row span { color: #65728a; margin-top: 2px; }

.drawer-list {
  display: grid;
  gap: 12px;
}

.drawer-list div {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 10px;
}

.drawer-list dt {
  color: #65728a;
  font-size: 12px;
  font-weight: 850;
}

.drawer-list dd {
  min-width: 0;
  color: #263653;
  font-size: 12px;
  font-weight: 850;
  word-break: break-word;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, .42);
  backdrop-filter: blur(7px);
}

.user-modal {
  width: min(980px, calc(100vw - 40px));
  max-height: calc(100vh - 40px);
  overflow: auto;
  border-radius: 22px;
}

.modal-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 22px 22px 16px;
  border-bottom: 1px solid #e5edf5;
}

.modal-top h3 {
  margin-top: 7px;
  color: #14213d;
  font-size: 22px;
  font-weight: 950;
  letter-spacing: -.035em;
}

.modal-top span {
  display: block;
  margin-top: 5px;
  color: #65728a;
  font-size: 13px;
  font-weight: 750;
}

.modal-grid {
  display: grid;
  grid-template-columns: 1.04fr .96fr;
  gap: 16px;
  padding: 18px 22px;
}

.modal-panel {
  border: 1px solid #dce5ef;
  border-radius: 18px;
  padding: 16px;
  background: linear-gradient(180deg, #fff, #f8fafc);
}

.field-label {
  display: block;
  margin: 14px 0 9px;
  color: #263653;
  font-size: 12px;
  font-weight: 950;
}

.field-label:first-child { margin-top: 0; }

.directory-list {
  min-height: 300px;
  max-height: 355px;
  overflow: auto;
  display: grid;
  align-content: start;
  gap: 9px;
  margin-top: 12px;
}

.directory-option {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 62px;
  padding: 10px;
  border: 1px solid #dce5ef;
  border-radius: 15px;
  background: #fff;
  text-align: left;
}

.directory-option.selected {
  border-color: #9ddbac;
  box-shadow: 0 10px 25px rgba(20,33,61,.07);
}

.directory-option.disabled {
  opacity: .55;
  cursor: not-allowed;
}

.directory-option img {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  object-fit: cover;
}

.directory-option span {
  min-width: 0;
  flex: 1;
}

.directory-option strong,
.directory-option small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.directory-option strong {
  color: #14213d;
  font-size: 13px;
  font-weight: 950;
}

.directory-option small {
  color: #65728a;
  font-size: 11px;
  font-weight: 800;
}

.directory-option em {
  color: #64748b;
  background: #f1f5f9;
  border-radius: 999px;
  padding: 5px 8px;
  font-size: 10px;
  font-style: normal;
  font-weight: 950;
}

.directory-empty,
.directory-error {
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed #cbd5e1;
  border-radius: 15px;
  color: #65728a;
  font-size: 13px;
  font-weight: 850;
  text-align: center;
  padding: 20px;
}

.directory-error {
  color: #be123c;
  background: #fff1f2;
  border-color: #fecdd3;
}

.selected-user-card {
  display: flex;
  align-items: center;
  gap: 14px;
  border: 1px solid #dce5ef;
  border-radius: 16px;
  background: #fff;
  padding: 14px;
}

.selected-user-card img {
  width: 56px;
  height: 56px;
  border-radius: 999px;
  object-fit: cover;
}

.selected-user-card small,
.selected-user-card strong,
.selected-user-card span {
  display: block;
}

.selected-user-card small {
  color: #8a95a7;
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
}

.selected-user-card strong {
  color: #14213d;
  font-size: 14px;
  font-weight: 950;
}

.selected-user-card span {
  color: #65728a;
  font-size: 12px;
  font-weight: 750;
}

.access-options {
  display: grid;
  gap: 10px;
}

.access-option {
  min-height: 56px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 10px;
  align-items: center;
  border: 1px solid #dce5ef;
  border-radius: 15px;
  background: #fff;
  color: #263653;
  padding: 10px 12px;
  text-align: left;
}

.access-option svg {
  grid-row: span 2;
}

.access-option span {
  font-size: 13px;
  font-weight: 950;
}

.access-option small {
  color: #65728a;
  font-size: 11px;
  font-weight: 750;
}

.access-option.active.admin { color: #15803d; background: #effcf3; border-color: #bbf7d0; }
.access-option.active.control { color: #2563eb; background: #eff6ff; border-color: #bfdbfe; }
.access-option.active.admin_control { color: #7c3aed; background: #f5f0ff; border-color: #ddd6fe; }

.block-toggle {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  border: 1px solid #dce5ef;
  border-radius: 13px;
  background: #fff;
  padding: 0 13px;
  color: #263653;
  font-size: 12px;
  font-weight: 950;
}

.block-toggle.active {
  color: #dc2626;
  background: #fff1f2;
  border-color: #fecdd3;
}

.plantel-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.plantel-grid label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  border: 1px solid #dce5ef;
  border-radius: 10px;
  background: #fff;
  color: #47546b;
  font-size: 11px;
  font-weight: 900;
}

.plantel-grid label.active {
  color: #15803d;
  background: #effcf3;
  border-color: #bbf7d0;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 22px 22px;
  border-top: 1px solid #e5edf5;
}

.modal-footer span {
  min-width: 0;
  color: #65728a;
  font-size: 12px;
  font-weight: 850;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-footer div {
  display: flex;
  gap: 10px;
}

.confirm-modal {
  position: relative;
  width: min(430px, calc(100vw - 40px));
  border-radius: 22px;
  padding: 28px 24px 20px;
  text-align: center;
}

.confirm-close {
  position: absolute;
  top: 16px;
  right: 16px;
  border: 0;
  color: #14213d;
  background: transparent;
}

.confirm-icon {
  width: 68px;
  height: 68px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
}

.confirm-icon.safe { color: #15803d; background: #effcf3; }
.confirm-icon.danger { color: #dc2626; background: #fff1f2; }

.confirm-modal h3 {
  margin-top: 16px;
  color: #14213d;
  font-size: 19px;
  font-weight: 950;
  letter-spacing: -.025em;
}

.confirm-modal p {
  margin-top: 12px;
  color: #65728a;
  font-size: 13px;
  line-height: 1.5;
  font-weight: 750;
}

.confirm-warning {
  margin-top: 16px;
  padding: 13px 16px;
  border: 1px solid #fed7aa;
  border-radius: 13px;
  background: #fffbeb;
  color: #9a3412;
  text-align: left;
  font-size: 12px;
  font-weight: 800;
}

.confirm-warning ul {
  list-style: disc;
  padding-left: 18px;
}

.confirm-actions {
  justify-content: center;
  margin-top: 20px;
}

@media (max-width: 1320px) {
  .usuarios-page {
    grid-template-columns: minmax(0, 1fr);
  }
  .user-drawer {
    position: static;
    min-height: 0;
    border: 1px solid #dce5ef;
    border-radius: 18px;
  }
  .metric-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .usuarios-hero,
  .truth-card,
  .bulk-card,
  .table-footer {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }
  .filters-card,
  .modal-grid,
  .metric-grid {
    grid-template-columns: 1fr;
  }
  .users-table-card {
    overflow-x: auto;
  }
  .users-table {
    min-width: 860px;
  }
}
</style>
