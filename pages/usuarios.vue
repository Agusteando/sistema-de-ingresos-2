<template>
  <div class="max-w-6xl mx-auto">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-xl font-bold text-brand-campus">Gestión de Accesos de Personal</h2>
      <button class="btn btn-primary" @click="openModal()"><LucideUserPlus :size="18"/> Registrar Usuario</button>
    </div>

    <div class="card table-wrapper shadow-sm border border-gray-100">
      <table class="w-full">
        <thead class="bg-gray-50/90">
          <tr>
            <th class="w-20">ID</th>
            <th>Nombre de Usuario</th>
            <th>Correo Notificaciones</th>
            <th>Plantel Asignado</th>
            <th>Nivel de Privilegios</th>
            <th class="text-center w-32">Configuración</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loadingTable"><td colspan="6" class="text-center py-16 text-gray-500 font-medium">Cargando personal...</td></tr>
          <tr v-else-if="!usuarios.length"><td colspan="6" class="text-center py-16 text-gray-500">No hay usuarios registrados en el sistema.</td></tr>
          <tr v-else v-for="u in usuarios" :key="u.id" class="hover:bg-gray-50/80 transition-colors">
            <td class="font-mono text-gray-400 text-xs">{{ u.id }}</td>
            <td class="font-bold text-gray-800">{{ u.username }}</td>
            <td class="text-gray-600">{{ u.email || '—' }}</td>
            <td><span class="badge badge-neutral">{{ u.plantel }}</span></td>
            <td>
              <span :class="['badge', u.role === 'global' ? 'badge-warning' : 'badge-info']">
                {{ u.role === 'global' ? 'ADMINISTRADOR GLOBAL' : 'SÓLO PLANTEL' }}
              </span>
            </td>
            <td class="text-center">
              <button class="btn btn-ghost px-2 py-1 text-xs text-brand-teal" @click="openModal(u)"><LucideSettings :size="16"/></button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal-container">
        <div class="modal-header">
          <h2 class="text-xl font-bold text-brand-campus">{{ editingId ? 'Actualizar Perfil' : 'Nuevo Acceso' }}</h2>
        </div>
        <form @submit.prevent="saveUser">
          <div class="modal-content grid grid-cols-1 md:grid-cols-2 gap-5">
            <div class="form-group m-0 col-span-2 md:col-span-1"><label class="form-label">Nombre del Usuario (Login)</label><input type="text" v-model="form.username" class="input-field" required></div>
            <div class="form-group m-0 col-span-2 md:col-span-1">
              <label class="form-label">Contraseña de Seguridad</label>
              <input type="password" v-model="form.password" class="input-field" :placeholder="editingId ? 'Mantener actual' : 'Requerida'" :required="!editingId">
            </div>
            <div class="form-group m-0 col-span-2"><label class="form-label">Correo Electrónico (Vínculo Google Auth)</label><input type="email" v-model="form.email" class="input-field"></div>
            
            <div class="form-group m-0 col-span-2 md:col-span-1">
              <label class="form-label">Plantel Base Operativo</label>
              <select v-model="form.plantel" class="input-field" required>
                <option value="PT">Primaria Toluca (PT)</option>
                <option value="PM">Primaria Metepec (PM)</option>
                <option value="SM">Secundaria Metepec (SM)</option>
              </select>
            </div>
            <div class="form-group m-0 col-span-2 md:col-span-1">
              <label class="form-label">Permisos del Perfil</label>
              <select v-model="form.role" class="input-field" required>
                <option value="plantel">Operador (Sólo Plantel Asignado)</option>
                <option value="global">Administrador (Total Organización)</option>
              </select>
            </div>
          </div>
          <div class="modal-footer flex justify-between">
            <button type="button" class="btn btn-ghost text-accent-coral hover:bg-accent-coral/10 hover:text-accent-coral" v-if="editingId" @click="deleteUser"><LucideTrash2 :size="16"/> Revocar Acceso</button>
            <div v-else></div>
            <div class="flex gap-2">
              <button type="button" class="btn btn-ghost" @click="showModal = false">Cancelar</button>
              <button type="submit" class="btn btn-primary" :disabled="saving">Guardar Configuración</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { LucideUserPlus, LucideSettings, LucideTrash2 } from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'

const { show } = useToast()
const usuarios = ref([])
const loadingTable = ref(false)
const showModal = ref(false)
const saving = ref(false)
const editingId = ref(null)

const form = ref({ username: '', password: '', email: '', plantel: 'PT', role: 'plantel' })

const loadUsers = async () => {
  loadingTable.value = true
  try {
    usuarios.value = await $fetch('/api/users')
  } catch (e) { show('Acceso restringido o error consultando base', 'danger') }
  finally { loadingTable.value = false }
}

onMounted(loadUsers)

const openModal = (u = null) => {
  if (u) {
    editingId.value = u.id
    form.value = { username: u.username, password: '', email: u.email, plantel: u.plantel, role: u.role || 'plantel' }
  } else {
    editingId.value = null
    form.value = { username: '', password: '', email: '', plantel: 'PT', role: 'plantel' }
  }
  showModal.value = true
}

const saveUser = async () => {
  saving.value = true
  try {
    const url = editingId.value ? `/api/users/${editingId.value}` : '/api/users'
    const method = editingId.value ? 'PUT' : 'POST'
    await $fetch(url, { method, body: form.value })
    show('Configuración del perfil actualizada permanentemente.')
    showModal.value = false
    loadUsers()
  } catch (e) { show('Error modificando credenciales administrativas', 'danger') }
  finally { saving.value = false }
}

const deleteUser = async () => {
  if (!confirm('¿Confirma la revocación total e irreversible de acceso para este miembro del personal?')) return
  try {
    await $fetch(`/api/users/${editingId.value}`, { method: 'DELETE' })
    show('Acceso destituido del sistema principal.')
    showModal.value = false
    loadUsers()
  } catch (e) { show('Error intentando borrar al usuario', 'danger') }
}
</script>