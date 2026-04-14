<template>
  <div class="max-w-6xl mx-auto">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-xl font-bold text-brand-campus">Catálogo de Documentos</h2>
      <button class="btn btn-primary" @click="showForm = !showForm">
        {{ showForm ? 'Cerrar Formulario' : 'Crear Documento' }}
      </button>
    </div>

    <div v-if="showForm" class="card mb-8 p-8 bg-gray-50/50 border border-gray-200 shadow-sm transition-all duration-300 ease-in-out">
      <form @submit.prevent="createConcept" class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="form-group"><label class="form-label">Documento</label><input type="text" v-model="form.concepto" class="input-field" required></div>
        <div class="form-group"><label class="form-label">Descripción</label><input type="text" v-model="form.description" class="input-field"></div>
        <div class="form-group"><label class="form-label">Costo Base</label><input type="number" v-model="form.costo" class="input-field font-mono font-bold" step="0.01" required></div>
        <div class="form-group"><label class="form-label">Meses / Plazos</label><input type="number" v-model="form.plazo" class="input-field font-mono font-bold" min="1" required></div>
        <div class="form-group flex items-end">
          <label class="flex items-center gap-3 cursor-pointer pb-2.5 group">
            <input type="checkbox" v-model="form.eventual" class="w-5 h-5 text-brand-leaf border-gray-300 rounded focus:ring-brand-leaf transition-colors">
            <span class="font-bold text-sm text-gray-700 group-hover:text-brand-campus transition-colors">Es Eventual (Pago único)</span>
          </label>
        </div>
        <div class="form-group flex items-end justify-end">
          <button type="submit" class="btn btn-secondary w-full md:w-auto" :disabled="loading">Guardar Documento</button>
        </div>
      </form>
    </div>

    <div class="card table-wrapper shadow-sm">
      <table>
        <thead>
          <tr>
            <th class="w-20">ID</th>
            <th>Documento</th>
            <th class="text-right">Costo</th>
            <th class="text-center">Plazos</th>
            <th class="text-center">Tipo</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loadingTable"><td colspan="5" class="text-center py-16 text-gray-500 font-medium">Cargando catálogo...</td></tr>
          <tr v-else-if="!conceptos.length"><td colspan="5" class="text-center py-16 text-gray-500">No hay documentos registrados en este ciclo.</td></tr>
          <tr v-else v-for="c in conceptos" :key="c.id" class="hover:bg-gray-50/80 transition-colors">
            <td class="font-mono text-gray-400 text-xs">{{ c.id }}</td>
            <td class="font-bold text-gray-700">{{ c.concepto }}</td>
            <td class="text-right font-bold text-brand-campus font-mono">${{ Number(c.costo).toFixed(2) }}</td>
            <td class="text-center text-gray-600 font-medium">{{ c.plazo }} Meses</td>
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
import { useToast } from '~/composables/useToast'

const state = useState('globalState')
const { show } = useToast()

const conceptos = ref([])
const loadingTable = ref(false)
const showForm = ref(false)
const loading = ref(false)

const form = ref({ concepto: '', description: '', costo: 0, plazo: 10, eventual: false })

const loadConceptos = async () => {
  loadingTable.value = true
  try {
    conceptos.value = await $fetch('/api/conceptos', { params: { ciclo: state.value.ciclo } })
  } catch(e) { show('Fallo de conexión al catálogo', 'danger') }
  finally { loadingTable.value = false }
}

onMounted(loadConceptos)
watch(() => state.value.ciclo, loadConceptos)

const createConcept = async () => {
  loading.value = true
  try {
    await $fetch('/api/conceptos', { method: 'POST', body: { ...form.value, ciclo: state.value.ciclo } })
    show('Documento administrativo guardado')
    showForm.value = false
    form.value = { concepto: '', description: '', costo: 0, plazo: 10, eventual: false }
    loadConceptos()
  } catch(e) { show('Error en registro de documento', 'danger') } 
  finally { loading.value = false }
}
</script>