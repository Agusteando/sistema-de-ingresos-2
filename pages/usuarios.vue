<template>
  <div class="max-w-6xl mx-auto">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-xl font-bold text-brand-campus">Usuarios</h2>
      <button class="btn btn-primary" @click="openModal()"><LucideUserPlus :size="18"/> Crear usuario</button>
    </div>

    <div class="card table-wrapper shadow-sm border border-gray-100">
      <table class="w-full">
        <thead class="bg-gray-50/90">
          <tr>
            <th class="w-20">ID</th>
            <th>Nombre</th>
            <th>Correo</th>
            <th>Planteles</th>
            <th>Rol</th>
            <th class="text-center w-32">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loadingTable"><td colspan="6" class="text-center py-16 text-gray-500 font-medium">Cargando usuarios...</td></tr>
          <tr v-else-if="!usuarios.length"><td colspan="6" class="text-center py-16 text-gray-500">No hay usuarios registrados.</td></tr>
          <tr v-else v-for="u in usuarios" :key="u.id" 
              class="hover:bg-gray-50/80 transition-colors cursor-context-menu"
              @contextmenu.prevent="showContextMenu($event, u)">
            <td class="font-mono text-gray-400 text-xs">{{ u.id }}</td>
            <td class="font-bold text-gray-800">{{ u.username }}</td>
            <td class="text-gray-600">{{ u.email || '—' }}</td>
            <td>
              <div class="flex flex-wrap gap-1 max-w-[200px]">
                <span v-for="p in (u.planteles ? u.planteles.split(',') : [])" :key="p" class="badge badge-neutral text-[9px]">{{ p }}</span>
              </div>
            </td>
            <td>
              <span :class="['badge', u.role === 'global' ? 'badge-warning' : 'badge-info']">
                {{ u.role === 'global' ? 'SUPER ADMIN' : 'USUARIO' }}
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
      <div class="modal-container large">
        <div class="modal-header">
          <h2 class="text-xl font-bold text-brand-campus">{{ editingId ? 'Editar usuario' : 'Nuevo usuario' }}</h2>
        </div>
        <form @submit.prevent="saveUser">
          <div class="modal-content grid grid-cols-1 md:grid-cols-2 gap-5">
            <div class="form-group m-0"><label class="form-label">Nombre</label><input type="text" v-model="form.username" class="input-field" required></div>
            <div class="form-group m-0">
              <label class="form-label">Contraseña</label>
              <input type="password" v-model="form.password" class="input-field" :placeholder="editingId ? 'Dejar en blanco para no cambiar' : ''" :required="!editingId">
            </div>
            <div class="form-group m-0 col-span-2 md:col-span-1"><label class="form-label">Correo electrónico (Para Google Auth)</label><input type="email" v-model="form.email" class="input-field"></div>
            <div class="form-group m-0 col-span-2 md:col-span-1">
              <label class="form-label">Rol</label>
              <select v-model="form.role" class="input-field" required>
                <option value="plantel">Usuario (Acceso a planteles seleccionados)</option>
                <option value="global">Super Admin (Acceso a todo)</option>
              </select>
            </div>
            
            <div class="form-group m-0 col-span-2 mt-2 p-5 bg-gray-50 border border-gray-200 rounded-xl">
              <label class="form-label mb-3">Planteles permitidos</label>
              <div class="grid grid-cols-3 md:grid-cols-5 gap-3">
                <label v-for="p in PLANTELES_LIST" :key="p" class="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-700 bg-white px-3 py-2.5 rounded-lg border border-gray-200 hover:border-brand-leaf transition-colors shadow-sm" :class="{'bg-brand-leaf/5 border-brand-leaf': form.planteles.includes(p)}">
                  <input type="checkbox" :value="p" v-model="form.planteles" class="w-4 h-4 text-brand-leaf rounded border-gray-300 focus:ring-brand-leaf">
                  {{ p }}
                </label>
              </div>
            </div>
          </div>
          <div class="modal-footer flex justify-between">
            <button type="button" class="btn btn-ghost text-accent-coral hover:bg-accent-coral/10 hover:text-accent-coral" v-if="editingId" @click="deleteUser"><LucideTrash2 :size="16"/> Eliminar</button>
            <div v-else></div>
            <div class="flex gap-2">
              <button type="button" class="btn btn-ghost" @click="showModal = false">Cancelar</button>
              <button type="submit" class="btn btn-primary" :disabled="saving || form.planteles.length === 0">Guardar</button>
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
import { PLANTELES_LIST } from '~/utils/constants'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'

const { show } = useToast()
const { openMenu } = useContextMenu()

const usuarios = ref([])
const loadingTable = ref(false)
const showModal = ref(false)
const saving = ref(false)
const editingId = ref(null)

const form = ref({ username: '', password: '', email: '', planteles: [], role: 'plantel' })

const loadUsers = async () => {
  loadingTable.value = true
  try {
    usuarios.value = await $fetch('/api/users')
  } catch (e) { show('Error cargando usuarios', 'danger') }
  finally { loadingTable.value = false }
}

onMounted(loadUsers)

const showContextMenu = (event, u) => {
  openMenu(event, [
    { label: 'Opciones', disabled: true },
    { label: '-' },
    { label: 'Editar usuario', icon: LucideSettings, action: () => openModal(u) }
  ])
}

const openModal = (u = null) => {
  if (u) {
    editingId.value = u.id
    form.value = { 
      username: u.username, 
      password: '', 
      email: u.email, 
      planteles: u.planteles ? u.planteles.split(',') : [], 
      role: u.role || 'plantel' 
    }
  } else {
    editingId.value = null
    form.value = { username: '', password: '', email: '', planteles: ['PT'], role: 'plantel' }
  }
  showModal.value = true
}

const saveUser = async () => {
  saving.value = true
  try {
    const url = editingId.value ? `/api/users/${editingId.value}` : '/api/users'
    const method = editingId.value ? 'PUT' : 'POST'
    await $fetch(url, { method, body: { ...form.value } })
    show('Usuario guardado exitosamente.')
    showModal.value = false
    loadUsers()
  } catch (e) { show('Error al guardar el usuario', 'danger') }
  finally { saving.value = false }
}

const deleteUser = async () => {
  if (!confirm('¿Confirma la eliminación de este usuario?')) return
  try {
    await $fetch(`/api/users/${editingId.value}`, { method: 'DELETE' })
    show('Usuario eliminado.')
    showModal.value = false
    loadUsers()
  } catch (e) { show('Error al eliminar', 'danger') }
}
</script>