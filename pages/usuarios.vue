<template>
  <div class="max-w-6xl mx-auto">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-xl font-bold text-gray-800 tracking-tight">Usuarios</h2>
      <button class="btn btn-primary" @click="openModal()"><LucideUserPlus :size="16"/> Crear usuario</button>
    </div>

    <div class="card table-wrapper">
      <table class="w-full">
        <thead>
          <tr>
            <th class="w-16">ID</th>
            <th>Nombre</th>
            <th>Correo</th>
            <th>Planteles</th>
            <th>Rol</th>
            <th class="text-center w-24">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loadingTable"><td colspan="6" class="text-center py-12 text-gray-500 font-medium">Cargando...</td></tr>
          <tr v-else-if="!usuarios.length"><td colspan="6" class="text-center py-12 text-gray-500">No hay usuarios registrados.</td></tr>
          <tr v-else v-for="u in usuarios" :key="u.id" 
              class="cursor-context-menu"
              @contextmenu.prevent="showContextMenu($event, u)">
            <td class="font-mono text-gray-400 text-xs">{{ u.id }}</td>
            <td class="font-semibold text-gray-800">{{ u.username }}</td>
            <td class="text-gray-600 text-sm">{{ u.email || '—' }}</td>
            <td>
              <div class="flex flex-wrap gap-1 max-w-[200px]">
                <span v-for="p in (u.planteles ? u.planteles.split(',') : [])" :key="p" class="badge badge-neutral text-[10px]">{{ p }}</span>
              </div>
            </td>
            <td>
              <span :class="['badge', u.role === 'global' ? 'badge-warning' : 'badge-info']">
                {{ u.role === 'global' ? 'ADMIN' : 'USUARIO' }}
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
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-container large">
          <div class="modal-header">
            <h2 class="text-lg font-bold text-gray-800">{{ editingId ? 'Editar usuario' : 'Nuevo usuario' }}</h2>
          </div>
          <form @submit.prevent="saveUser">
            <div class="modal-content grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="form-group mb-0"><label class="form-label">Nombre</label><input type="text" v-model="form.username" class="input-field" required></div>
              <div class="form-group mb-0">
                <label class="form-label">Contraseña</label>
                <input type="password" v-model="form.password" class="input-field" :placeholder="editingId ? 'En blanco = sin cambio' : ''" :required="!editingId">
              </div>
              <div class="form-group mb-0 col-span-2 md:col-span-1"><label class="form-label">Correo (Google Auth)</label><input type="email" v-model="form.email" class="input-field"></div>
              <div class="form-group mb-0 col-span-2 md:col-span-1">
                <label class="form-label">Rol</label>
                <select v-model="form.role" class="input-field" required>
                  <option value="plantel">Usuario (Planteles selectos)</option>
                  <option value="global">Super Admin (Acceso total)</option>
                </select>
              </div>
              
              <div class="form-group mb-0 col-span-2 mt-2 p-4 bg-white border border-gray-200 rounded-lg">
                <label class="form-label mb-2">Planteles permitidos</label>
                <div class="grid grid-cols-4 md:grid-cols-6 gap-2">
                  <label v-for="p in PLANTELES_LIST" :key="p" class="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-700 bg-gray-50 px-2 py-1.5 rounded-md border border-gray-200 hover:border-brand-leaf transition-colors" :class="{'bg-brand-leaf/5 border-brand-leaf': form.planteles.includes(p)}">
                    <input type="checkbox" :value="p" v-model="form.planteles" class="w-3.5 h-3.5 text-brand-leaf rounded border-gray-300">
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
    </Teleport>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
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

watch(showModal, (val) => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = val ? 'hidden' : ''
  }
})

onUnmounted(() => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
  }
})

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
    show('Usuario guardado.')
    showModal.value = false
    loadUsers()
  } catch (e) { show('Error al guardar', 'danger') }
  finally { saving.value = false }
}

const deleteUser = async () => {
  if (!confirm('¿Confirma la eliminación?')) return
  try {
    await $fetch(`/api/users/${editingId.value}`, { method: 'DELETE' })
    show('Usuario eliminado.')
    showModal.value = false
    loadUsers()
  } catch (e) { show('Error al eliminar', 'danger') }
}
</script>