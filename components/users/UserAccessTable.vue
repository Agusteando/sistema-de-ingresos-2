<template>
  <section class="table-card">
    <div class="table-scroll">
      <table class="access-table">
        <thead>
          <tr>
            <th class="check-col"><input type="checkbox" :checked="allSelected" :disabled="!rows.length" @change="$emit('toggle-page')"></th>
            <th>Usuario</th>
            <th>Planteles</th>
            <th>Acceso rápido</th>
            <th>Estado</th>
            <th>Último ingreso</th>
            <th class="actions-col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="7" class="empty-cell">Cargando usuarios…</td>
          </tr>
          <tr v-else-if="!rows.length">
            <td colspan="7" class="empty-cell">No hay usuarios para los filtros actuales.</td>
          </tr>
          <template v-else>
            <tr
              v-for="user in rows"
              :key="user.email || user.id"
              class="user-row"
              :class="{ active: activeKey === userKey(user), blocked: isBlocked(user) }"
              @click="$emit('select', user)"
            >
              <td class="check-col" @click.stop>
                <input type="checkbox" :checked="selectedEmails.includes(normalizeEmail(user.email))" :disabled="user.protected" @change="$emit('toggle-user', user)">
              </td>
              <td>
                <div class="user-cell">
                  <UserAvatar :user="user" />
                  <div>
                    <strong>{{ displayName(user) }}</strong>
                    <span>{{ user.email }}</span>
                  </div>
                </div>
              </td>
              <td>
                <div class="plantel-chips">
                  <span v-for="plantel in plantelesFor(user).slice(0, 4)" :key="plantel">{{ plantel }}</span>
                  <small v-if="plantelesFor(user).length > 4">+{{ plantelesFor(user).length - 4 }}</small>
                  <em v-if="!plantelesFor(user).length">Sin plantel</em>
                </div>
              </td>
              <td @click.stop>
                <UserRoleChips :mode="user.accessMode || accessMode(user)" interactive compact :disabled="user.protected || savingKey === userKey(user)" @change="$emit('set-access', user, $event)" />
              </td>
              <td>
                <span class="status-pill" :class="statusMode(user)">{{ statusLabel(user) }}</span>
              </td>
              <td>{{ formatLastLogin(user.last_login_at || user.lastLoginAt) }}</td>
              <td class="actions-col" @click.stop>
                <button type="button" class="icon-action" @click="$emit('edit', user)">Editar</button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup>
defineProps({
  rows: { type: Array, default: () => [] },
  selectedEmails: { type: Array, default: () => [] },
  activeKey: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  allSelected: { type: Boolean, default: false },
  savingKey: { type: String, default: '' }
})
defineEmits(['select', 'toggle-user', 'toggle-page', 'set-access', 'edit'])

const CONTROL_ROLE = 'role_ctrl'
const normalizeEmail = (value) => String(value || '').trim().toLowerCase()
const userKey = (u) => normalizeEmail(u?.email) || String(u?.id || '')
const roleTokens = (role) => String(role || '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean)
const hasControl = (role) => roleTokens(role).includes(CONTROL_ROLE)
const accessMode = (u) => {
  const tokens = roleTokens(u?.role)
  const base = tokens.filter((token) => token !== CONTROL_ROLE)
  if (tokens.includes(CONTROL_ROLE) && base.length) return 'admin_control'
  if (hasControl(u?.role)) return 'control'
  return 'admin'
}
const isBlocked = (u) => u?.ingresosBlocked === true || u?.ingresos_blocked === 1 || u?.ingresos_blocked === '1'
const displayName = (u) => u?.workspaceName || u?.displayName || u?.username || u?.email || 'Usuario'
const plantelesFor = (u) => Array.isArray(u?.plantelesList) ? u.plantelesList : String(u?.planteles || u?.plantel || '').split(',').map((p) => p.trim()).filter(Boolean)
const statusMode = (u) => u?.protected ? 'protected' : isBlocked(u) ? 'blocked' : 'active'
const statusLabel = (u) => u?.protected ? 'Protegido' : isBlocked(u) ? 'Bloqueado' : 'Activo'
const formatLastLogin = (value) => {
  if (!value) return 'Nunca'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Nunca'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
</script>

<style scoped>
.table-card {
  background: rgba(255,255,255,0.92);
  border: 1px solid rgba(15,23,42,0.08);
  border-radius: 26px;
  overflow: hidden;
  box-shadow: 0 18px 48px rgba(15,23,42,0.08);
}
.table-scroll { overflow-x: auto; }
.access-table { width: 100%; border-collapse: collapse; min-width: 960px; }
th { text-align: left; color: #64748b; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; padding: 14px 16px; background: #f8fafc; }
td { padding: 14px 16px; border-top: 1px solid rgba(15,23,42,0.06); vertical-align: middle; color: #334155; }
.user-row { cursor: pointer; transition: background 120ms ease; }
.user-row:hover, .user-row.active { background: #f8fafc; }
.user-row.blocked { opacity: .72; }
.check-col { width: 42px; }
.actions-col { width: 96px; text-align: right; }
.user-cell { display: flex; align-items: center; gap: 12px; min-width: 260px; }
.user-cell strong { display: block; color: #0f172a; }
.user-cell span { display: block; color: #64748b; font-size: 13px; }
.plantel-chips { display: flex; flex-wrap: wrap; gap: 6px; max-width: 260px; }
.plantel-chips span, .plantel-chips small { background: #eef2ff; color: #3730a3; border-radius: 999px; padding: 4px 8px; font-size: 11px; font-weight: 800; }
.plantel-chips em { color: #94a3b8; font-style: normal; font-size: 12px; }
.status-pill { display: inline-flex; border-radius: 999px; padding: 6px 10px; font-weight: 800; font-size: 12px; }
.status-pill.active { background: #ecfdf5; color: #166534; }
.status-pill.blocked { background: #fef2f2; color: #b91c1c; }
.status-pill.protected { background: #f5f3ff; color: #6d28d9; }
.icon-action { border: 1px solid rgba(15,23,42,0.1); background: white; border-radius: 999px; padding: 7px 10px; font-weight: 800; color: #334155; cursor: pointer; }
.empty-cell { text-align: center; padding: 42px 16px; color: #64748b; font-weight: 700; }
</style>
