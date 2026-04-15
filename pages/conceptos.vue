<template>
  <div class="max-w-6xl mx-auto">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-xl font-bold text-gray-800 tracking-tight">Catálogo de conceptos</h2>
      <button class="btn btn-primary" @click="showForm = !showForm">
        {{ showForm ? 'Cerrar formulario' : 'Crear concepto' }}
      </button>
    </div>

    <div v-if="showForm" class="card mb-6 p-5 bg-gray-50/50">
      <form @submit.prevent="createConcept" class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="form-group mb-0"><label class="form-label">Concepto</label><input type="text" v-model="form.concepto" class="input-field" required></div>
        <div class="form-group mb-0"><label class="form-label">Descripción</label><input type="text" v-model="form.description" class="input-field"></div>
        <div class="form-group mb-0"><label class="form-label">Costo Base</label><input type="number" v-model="form.costo" class="input-field font-mono font-bold" step="0.01" required></div>
        <div class="form-group mb-0"><label class="form-label">Meses</label><input type="number" v-model="form.plazo" class="input-field font-mono font-bold" min="1" required></div>
        <div class="form-group mb-0 flex items-center h-full pt-6">
          <label class="flex items-center gap-2 cursor-pointer group">
            <input type="checkbox" v-model="form.eventual" class="w-4 h-4 text-brand-leaf border-gray-300 rounded focus:ring-brand-leaf transition-colors">
            <span class="font-semibold text-sm text-gray-700 group-hover:text-gray-900 transition-colors">Es eventual (Pago único)</span>
          </label>
        </div>
        <div class="form-group mb-0 flex items-end justify-end">
          <button type="submit" class="btn btn-secondary w-full md:w-auto" :disabled="loading">Guardar concepto</button>
        </div>
      </form>
    </div>

    <div class="card table-wrapper">
      <table>
        <thead>
          <tr>
            <th class="w-20">ID</th>
            <th>Concepto</th>
            <th class="text-right">Costo</th>
            <th class="text-center">Meses</th>
            <th class="text-center">Tipo</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loadingTable"><td colspan="5" class="text-center py-12 text-gray-500 font-medium">Cargando...</td></tr>
          <tr v-else-if="!conceptos.length"><td colspan="5" class="text-center py-12 text-gray-500">No hay conceptos registrados.</td></tr>
          <tr v-else v-for="c in conceptos" :key="c.id" 
              class="cursor-context-menu"
              @contextmenu.prevent="showContextMenu($event, c)">
            <td class="font-mono text-gray-400 text-xs">{{ c.id }}</td>
            <td class="font-semibold text-gray-700">{{ c.concepto }}</td>
            <td class="text-right font-bold text-gray-800 font-mono">${{ Number(c.costo).toFixed(2) }}</td>
            <td class="text-center text-gray-600">{{ c.plazo }}</td>
            <td class="text-center"><span :class="['badge', c.eventual ? 'badge-info' : 'badge-neutral']">{{ c.eventual ? 'Único' : 'Recurrente' }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useState } from '#app'
import { LucideSettings, LucideTrash2 } from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'

const state = useState('globalState')
const { show } = useToast()
const { openMenu } = useContextMenu()

const conceptos = ref([])
const loadingTable = ref(false)
const showForm = ref(false)
const loading = ref(false)

const form = ref({ concepto: '', description: '', costo: 0, plazo: 10, eventual: false })

const loadConceptos = async () => {
  loadingTable.value = true
  try {
    conceptos.value = await $fetch('/api/conceptos', { params: { ciclo: state.value.ciclo } })
  } catch(e) { show('Error cargando conceptos', 'danger') }
  finally { loadingTable.value = false }
}

onMounted(loadConceptos)
watch(() => state.value.ciclo, loadConceptos)

const showContextMenu = (event, c) => {
  openMenu(event, [
    { label: 'Opciones', disabled: true },
    { label: '-' },
    { label: 'Duplicar', icon: LucideSettings, action: () => {
      form.value = { ...c, id: undefined }
      showForm.value = true
    }},
    { label: 'Eliminar', icon: LucideTrash2, class: 'text-accent-coral', action: () => {
      alert('Operación no disponible en esta versión.')
    }}
  ])
}

const createConcept = async () => {
  loading.value = true
  try {
    await $fetch('/api/conceptos', { method: 'POST', body: { ...form.value, ciclo: state.value.ciclo } })
    show('Concepto guardado')
    showForm.value = false
    form.value = { concepto: '', description: '', costo: 0, plazo: 10, eventual: false }
    loadConceptos()
  } catch(e) { show('Error al guardar', 'danger') } 
  finally { loading.value = false }
}
</script>