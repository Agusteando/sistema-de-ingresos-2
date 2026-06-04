<template>
  <aside class="access-drawer" :class="{ empty: !user }">
    <template v-if="user">
      <header class="drawer-header">
        <UserAvatar :user="user" />
        <div>
          <strong>{{ displayName(user) }}</strong>
          <span>{{ user.email }}</span>
        </div>
      </header>

      <section class="drawer-section">
        <p class="section-title">Acceso</p>
        <UserRoleChips :mode="user.accessMode || accessMode(user)" interactive :disabled="user.protected || saving" @change="$emit('set-access', user, $event)" />
        <small>Rol original: {{ user.role || '—' }}</small>
      </section>

      <section class="drawer-section">
        <p class="section-title">Planteles</p>
        <div class="plantel-grid">
          <label v-for="plantel in planteles" :key="plantel">
            <input type="checkbox" :checked="draftPlanteles.includes(plantel)" @change="togglePlantel(plantel)">
            <span>{{ plantel }}</span>
          </label>
        </div>
        <button type="button" class="save-button" :disabled="saving || !dirtyPlanteles" @click="savePlanteles">Guardar planteles</button>
      </section>

      <section class="drawer-section">
        <p class="section-title">Permisos visibles</p>
        <div class="permission-list">
          <span>{{ accessLabel(user.accessMode || accessMode(user)) }}</span>
          <span v-if="user.noAdeudoControlPlanteles">No Adeudo: {{ user.noAdeudoControlPlanteles }}</span>
          <span v-if="user.protected">Cuenta protegida</span>
          <span v-if="isBlocked(user)">Bloqueado</span>
        </div>
      </section>

      <section class="drawer-section">
        <p class="section-title">Seguridad</p>
        <button type="button" class="danger-button" :disabled="user.protected || saving" @click="$emit('block', user, !isBlocked(user))">
          {{ isBlocked(user) ? 'Reactivar acceso' : 'Bloquear acceso' }}
        </button>
        <button type="button" class="secondary-button" @click="$emit('edit', user)">Editar avanzado</button>
      </section>
    </template>
    <template v-else>
      <div class="empty-drawer">
        <strong>Selecciona un usuario</strong>
        <span>El panel lateral mostrará acceso, planteles, permisos y seguridad.</span>
      </div>
    </template>
  </aside>
</template>

<script setup>
const props = defineProps({
  user: { type: Object, default: null },
  planteles: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false }
})
const emit = defineEmits(['set-access', 'save-planteles', 'block', 'edit'])
const CONTROL_ROLE = 'role_ctrl'
const draftPlanteles = ref([])
const normalizeEmail = (value) => String(value || '').trim().toLowerCase()
const roleTokens = (role) => String(role || '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean)
const accessMode = (u) => {
  const tokens = roleTokens(u?.role)
  const base = tokens.filter((token) => token !== CONTROL_ROLE)
  if (tokens.includes(CONTROL_ROLE) && base.length) return 'admin_control'
  if (tokens.includes(CONTROL_ROLE)) return 'control'
  return 'admin'
}
const displayName = (u) => u?.workspaceName || u?.displayName || u?.username || u?.email || 'Usuario'
const plantelesFor = (u) => Array.isArray(u?.plantelesList) ? u.plantelesList : String(u?.planteles || u?.plantel || '').split(',').map((p) => p.trim()).filter(Boolean)
const isBlocked = (u) => u?.ingresosBlocked === true || u?.ingresos_blocked === 1 || u?.ingresos_blocked === '1'
const accessLabel = (mode) => mode === 'admin_control' ? 'Financiero + Control Escolar' : mode === 'control' ? 'Solo Control Escolar' : 'Financiero'
const dirtyPlanteles = computed(() => draftPlanteles.value.join(',') !== plantelesFor(props.user).join(','))
watch(() => props.user && normalizeEmail(props.user.email), () => {
  draftPlanteles.value = plantelesFor(props.user)
}, { immediate: true })
const togglePlantel = (plantel) => {
  draftPlanteles.value = draftPlanteles.value.includes(plantel)
    ? draftPlanteles.value.filter((item) => item !== plantel)
    : [...draftPlanteles.value, plantel]
}
const savePlanteles = () => emit('save-planteles', props.user, [...draftPlanteles.value])
</script>

<style scoped>
.access-drawer {
  position: sticky;
  top: 18px;
  display: grid;
  gap: 14px;
  align-content: start;
  background: rgba(255,255,255,0.92);
  border: 1px solid rgba(15,23,42,0.08);
  border-radius: 26px;
  padding: 16px;
  box-shadow: 0 18px 48px rgba(15,23,42,0.08);
}
.drawer-header { display: flex; align-items: center; gap: 12px; }
.drawer-header strong { display: block; color: #0f172a; }
.drawer-header span { color: #64748b; font-size: 13px; word-break: break-all; }
.drawer-section { display: grid; gap: 10px; padding-top: 14px; border-top: 1px solid rgba(15,23,42,0.08); }
.section-title { margin: 0; color: #64748b; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.drawer-section small { color: #94a3b8; }
.plantel-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.plantel-grid label { display: flex; align-items: center; gap: 6px; background: #f8fafc; border-radius: 12px; padding: 8px; color: #334155; font-weight: 800; font-size: 12px; }
.permission-list { display: flex; flex-wrap: wrap; gap: 6px; }
.permission-list span { background: #eef2ff; color: #3730a3; border-radius: 999px; padding: 6px 9px; font-size: 12px; font-weight: 800; }
.save-button, .danger-button, .secondary-button { border: 0; border-radius: 14px; padding: 10px 12px; font-weight: 850; cursor: pointer; }
.save-button { background: #0f172a; color: white; }
.save-button:disabled { background: #cbd5e1; cursor: not-allowed; }
.danger-button { background: #fef2f2; color: #b91c1c; }
.secondary-button { background: #f8fafc; color: #334155; }
.empty-drawer { display: grid; gap: 6px; padding: 24px 4px; color: #64748b; }
.empty-drawer strong { color: #0f172a; }
@media (max-width: 1180px) { .access-drawer { position: static; } }
</style>
