<template>
  <div class="max-w-6xl mx-auto">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-xl font-bold text-brand-campus">Catálogo de Tarifas</h2>
      <button class="btn btn-primary" @click="showForm = !showForm">
        {{ showForm ? 'Cerrar Formulario' : 'Crear Tarifa' }}
      </button>
    </div>

    <div v-if="showForm" class="card mb-8 p-6 bg-app border-dashed border-brand-teal">
      <form @submit.prevent="createConcept" class="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div class="form-group"><label class="form-label">Concepto</label><input type="text" v-model="form.concepto" class="input-field" required></div>
        <div class="form-group"><label class="form-label">Descripción</label><input type="text" v-model="form.description" class="input-field"></div>
        <div class="form-group"><label class="form-label">Costo Base</label><input type="number" v-model="form.costo" class="input-field" step="0.01" required></div>
        <div class="form-group"><label class="form-label">Meses / Plazos</label><input type="number" v-model="form.plazo" class="input-field" min="1" required></div>
        <div class="form-group flex items-end">
          <label class="flex items-center gap-2 cursor-pointer pb-2.5">
            <input type="checkbox" v-model="form.eventual" class="w-4 h-4 text-brand-leaf border-gray-300 rounded focus:ring-brand-leaf">
            <span class="font-bold text-sm">Es Eventual (Pago único)</span>
          </label>
        </div>
        <div class="form-group flex items-end justify-end">
          <button type="submit" class="btn btn-secondary w-full md:w-auto" :disabled="loading">Guardar Tarifa</button>
        </div>
      </form>
    </div>

    <div class="card table-wrapper">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Concepto</th>
            <th class="text-right">Costo</th>
            <th class="text-center">Plazos</th>
            <th class="text-center">Tipo</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loadingTable"><td colspan="5" class="text-center py-12">Cargando catálogo...</td></tr>
          <tr v-else-if="!conceptos.length"><td colspan="5" class="text-center py-12 text-gray-500">No hay tarifas registradas en este ciclo.</td></tr>
          <tr v-else v-for="c in conceptos" :key="c.id">
            <td class="font-mono text-gray-500">{{ c.id }}</td>
            <td class="font-bold">{{ c.concepto }}</td>
            <td class="text-right font-bold text-brand-campus">${{ Number(c.costo).toFixed(2) }}</td>
            <td class="text-center">{{ c.plazo }} Meses</td>
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
    show('Tarifa administrativa guardada')
    showForm.value = false
    form.value = { concepto: '', description: '', costo: 0, plazo: 10, eventual: false }
    loadConceptos()
  } catch(e) { show('Error en registro tarifario', 'danger') } 
  finally { loading.value = false }
}
</script>