<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay" @click.self="$emit('close')">
      <div class="user-modal">
        <header class="modal-header">
          <div>
            <p>Usuario institucional</p>
            <h3>{{ editing ? 'Editar usuario' : 'Nuevo usuario' }}</h3>
          </div>
          <button type="button" class="close-button" @click="$emit('close')">×</button>
        </header>

        <div class="modal-grid">
          <section class="workspace-panel">
            <label class="field-label">Buscar en Google Workspace</label>
            <div class="search-box">
              <input v-model="directoryQuery" type="search" placeholder="Nombre o correo institucional" @focus="ensureDirectoryResults">
              <button type="button" :disabled="directoryLoading" @click="searchDirectory">Buscar</button>
            </div>
            <p v-if="directoryError" class="error-line">{{ directoryError }}</p>
            <div class="directory-results">
              <button
                v-for="person in directoryResults"
                :key="person.email"
                type="button"
                class="directory-person"
                :class="{ active: normalizeEmail(form.email) === normalizeEmail(person.email), disabled: person.suspended || person.archived }"
                @click="selectWorkspaceUser(person)"
              >
                <img :src="person.avatar || avatarFor(person)" :alt="person.name || person.email">
                <span>
                  <strong>{{ person.name || person.displayName || person.email }}</strong>
                  <small>{{ person.email }}</small>
                  <em v-if="person.suspended || person.archived">No disponible</em>
                </span>
              </button>
              <div v-if="directoryLoading" class="directory-empty">Buscando…</div>
              <div v-else-if="directoryQuery && !directoryResults.length" class="directory-empty">Sin resultados.</div>
            </div>
          </section>

          <section class="form-panel">
            <div class="profile-preview">
              <img :src="selectedAvatar" :alt="form.displayName || form.email || 'Usuario'">
              <div>
                <strong>{{ form.displayName || 'Selecciona usuario' }}</strong>
                <span>{{ form.email || 'correo institucional' }}</span>
              </div>
            </div>

            <label class="field-label">Nombre visible</label>
            <input v-model="form.displayName" class="text-input" type="text">

            <label class="field-label">Correo</label>
            <input v-model="form.email" class="text-input" type="email">

            <label class="field-label">Tipo de acceso</label>
            <div class="access-options">
              <label v-for="option in accessOptions" :key="option.value" :class="{ active: form.accessMode === option.value }">
                <input v-model="form.accessMode" type="radio" :value="option.value">
                <span>{{ option.label }}</span>
                <small>{{ option.description }}</small>
              </label>
            </div>

            <label class="field-label">Planteles</label>
            <div class="plantel-grid">
              <label v-for="plantel in planteles" :key="plantel">
                <input type="checkbox" :checked="form.planteles.includes(plantel)" @change="togglePlantel(plantel)">
                <span>{{ plantel }}</span>
              </label>
            </div>

            <label class="block-toggle">
              <input v-model="form.ingresosBlocked" type="checkbox">
              <span>Bloquear acceso al sistema</span>
            </label>
          </section>
        </div>

        <footer class="modal-footer">
          <button type="button" class="soft-button" @click="$emit('close')">Cancelar</button>
          <button type="button" class="primary-button" :disabled="saving || !canSave" @click="save">
            {{ saving ? 'Guardando…' : 'Guardar usuario' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
const props = defineProps({
  open: { type: Boolean, default: false },
  user: { type: Object, default: null },
  planteles: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'save'])
const WORKSPACE_DOMAIN = 'casitaiedis.edu.mx'
const CONTROL_ROLE = 'role_ctrl'
const directoryQuery = ref('')
const directoryResults = ref([])
const directoryLoading = ref(false)
const directoryError = ref('')
let directoryTimer = null

const emptyForm = () => ({
  id: null,
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
const normalizeEmail = (value) => String(value || '').trim().toLowerCase()
const roleTokens = (role) => String(role || '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean)
const accessModeForRole = (role) => {
  const tokens = roleTokens(role)
  const base = tokens.filter((token) => token !== CONTROL_ROLE)
  if (tokens.includes(CONTROL_ROLE) && base.length) return 'admin_control'
  if (tokens.includes(CONTROL_ROLE)) return 'control'
  return 'admin'
}
const isBlocked = (u) => u?.ingresosBlocked === true || u?.ingresos_blocked === 1 || u?.ingresos_blocked === '1'
const plantelesFor = (u) => Array.isArray(u?.plantelesList) ? u.plantelesList : String(u?.planteles || u?.plantel || '').split(',').map((p) => p.trim()).filter(Boolean)
const displayName = (u) => u?.workspaceName || u?.displayName || u?.username || u?.email || 'Usuario'
const avatarFor = (u) => {
  const params = new URLSearchParams({ email: u?.email || '', name: u?.name || u?.displayName || u?.email || '' })
  return `/api/directory/photo?${params.toString()}`
}
const isWorkspaceEmail = (email) => normalizeEmail(email).endsWith(`@${WORKSPACE_DOMAIN}`)
const editing = computed(() => Boolean(props.user?.id))
const selectedAvatar = computed(() => form.value.avatar || form.value.picture || avatarFor(form.value))
const canSave = computed(() => isWorkspaceEmail(form.value.email) && form.value.displayName && form.value.planteles.length > 0)
const accessOptions = [
  { value: 'admin', label: 'Financiero', description: 'Acceso operativo estándar.' },
  { value: 'control', label: 'Control Escolar', description: 'Solo ROLE_CTRL.' },
  { value: 'admin_control', label: 'Ambos', description: 'Financiero + Control Escolar.' }
]

watch(() => props.open, (open) => {
  if (!open) return
  if (props.user) {
    form.value = {
      id: props.user.id,
      username: props.user.email || props.user.username || '',
      displayName: displayName(props.user),
      email: props.user.email || '',
      avatar: props.user.avatar || props.user.picture || '',
      picture: props.user.picture || props.user.avatar || '',
      planteles: plantelesFor(props.user).length ? plantelesFor(props.user) : ['PT'],
      accessMode: props.user.accessMode || accessModeForRole(props.user.role),
      ingresosBlocked: isBlocked(props.user)
    }
    directoryQuery.value = props.user.email || displayName(props.user)
  } else {
    form.value = emptyForm()
    directoryQuery.value = ''
  }
  directoryResults.value = []
  directoryError.value = ''
}, { immediate: true })

watch(directoryQuery, () => {
  if (!props.open) return
  clearTimeout(directoryTimer)
  directoryTimer = setTimeout(() => {
    if (directoryQuery.value.trim().length >= 2) searchDirectory()
  }, 350)
})

onUnmounted(() => clearTimeout(directoryTimer))

const searchDirectory = async () => {
  directoryLoading.value = true
  directoryError.value = ''
  try {
    const response = await $fetch('/api/directory/users', { query: { q: directoryQuery.value, limit: 12 } })
    directoryResults.value = Array.isArray(response?.users) ? response.users.filter((person) => isWorkspaceEmail(person.email)) : []
  } catch (error) {
    directoryResults.value = []
    directoryError.value = error?.data?.message || error?.message || 'No se pudo consultar Workspace.'
  } finally {
    directoryLoading.value = false
  }
}
const ensureDirectoryResults = () => {
  if (!directoryResults.value.length && !directoryLoading.value && directoryQuery.value.trim()) searchDirectory()
}
const selectWorkspaceUser = (person) => {
  if (!person || !isWorkspaceEmail(person.email) || person.suspended || person.archived) return
  form.value.displayName = person.name || person.displayName || person.email
  form.value.username = person.email
  form.value.email = person.email
  form.value.avatar = person.avatar || avatarFor(person)
  form.value.picture = person.avatar || avatarFor(person)
}
const togglePlantel = (plantel) => {
  form.value.planteles = form.value.planteles.includes(plantel)
    ? form.value.planteles.filter((item) => item !== plantel)
    : [...form.value.planteles, plantel]
}
const save = () => emit('save', { ...form.value })
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.46);
  display: grid;
  place-items: center;
  padding: 22px;
  z-index: 1000;
}
.user-modal {
  width: min(1040px, 96vw);
  max-height: 92vh;
  overflow: auto;
  background: white;
  border-radius: 28px;
  box-shadow: 0 24px 80px rgba(15,23,42,0.24);
}
.modal-header, .modal-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 22px; border-bottom: 1px solid rgba(15,23,42,0.08); }
.modal-footer { border-bottom: 0; border-top: 1px solid rgba(15,23,42,0.08); }
.modal-header p { margin: 0 0 4px; text-transform: uppercase; letter-spacing: .08em; font-size: 11px; font-weight: 800; color: #64748b; }
.modal-header h3 { margin: 0; color: #0f172a; }
.close-button { width: 34px; height: 34px; border: 0; border-radius: 12px; background: #f8fafc; font-size: 22px; cursor: pointer; }
.modal-grid { display: grid; grid-template-columns: minmax(280px, 0.9fr) minmax(360px, 1.1fr); gap: 18px; padding: 22px; }
.workspace-panel, .form-panel { display: grid; gap: 12px; align-content: start; }
.field-label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; font-weight: 850; color: #64748b; }
.search-box { display: flex; gap: 8px; }
.search-box input, .text-input { width: 100%; border: 1px solid rgba(15,23,42,0.12); border-radius: 14px; padding: 11px 12px; }
.search-box button, .soft-button, .primary-button { border: 0; border-radius: 14px; padding: 11px 14px; font-weight: 850; cursor: pointer; }
.search-box button, .soft-button { background: #f8fafc; color: #334155; }
.primary-button { background: #0f172a; color: white; }
.primary-button:disabled { background: #cbd5e1; cursor: not-allowed; }
.directory-results { display: grid; gap: 8px; max-height: 390px; overflow: auto; }
.directory-person { display: flex; align-items: center; gap: 10px; text-align: left; border: 1px solid rgba(15,23,42,0.08); background: white; border-radius: 16px; padding: 10px; cursor: pointer; }
.directory-person.active { border-color: rgba(37,99,235,0.3); background: #eff6ff; }
.directory-person.disabled { opacity: .55; cursor: not-allowed; }
.directory-person img, .profile-preview img { width: 40px; height: 40px; object-fit: cover; border-radius: 14px; }
.directory-person strong, .directory-person small, .directory-person em { display: block; }
.directory-person small { color: #64748b; }
.directory-person em { color: #b91c1c; font-style: normal; font-size: 12px; }
.directory-empty, .error-line { color: #64748b; font-weight: 700; padding: 10px; }
.error-line { color: #b91c1c; }
.profile-preview { display: flex; align-items: center; gap: 12px; background: #f8fafc; border-radius: 18px; padding: 12px; }
.profile-preview strong, .profile-preview span { display: block; }
.profile-preview span { color: #64748b; }
.access-options { display: grid; gap: 8px; }
.access-options label { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; border: 1px solid rgba(15,23,42,0.1); border-radius: 16px; padding: 10px; }
.access-options label.active { background: #eff6ff; border-color: rgba(37,99,235,0.26); }
.access-options small { grid-column: 2; color: #64748b; }
.plantel-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.plantel-grid label, .block-toggle { display: flex; align-items: center; gap: 7px; background: #f8fafc; border-radius: 12px; padding: 9px; font-weight: 800; color: #334155; }
@media (max-width: 860px) { .modal-grid { grid-template-columns: 1fr; } .plantel-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
