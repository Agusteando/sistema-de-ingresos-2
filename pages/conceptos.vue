<template>
  <div style="max-width: 1200px; margin: 0 auto;">
    <div class="flex justify-between items-center mb-4">
      <h2 style="color: var(--brand-campus); font-weight: 700; font-size: 1.25rem;">Catálogo Oficial de Tarifas</h2>
      <button class="btn btn-primary" @click="showForm = !showForm">
        {{ showForm ? 'Ocultar Formulario' : 'Crear Nueva Tarifa' }}
      </button>
    </div>

    <div v-if="showForm" class="card mb-4" style="padding: 1.5rem; background: var(--bg-app); border: 1px dashed var(--brand-teal);">
      <form @submit.prevent="createConcept" class="grid-3">
        <div class="form-group"><label class="form-label">Nombre del Concepto</label><input type="text" v-model="form.concepto" class="input-field" required></div>
        <div class="form-group"><label class="form-label">Descripción Técnica</label><input type="text" v-model="form.description" class="input-field"></div>
        <div class="form-group"><label class="form-label">Costo Fijo Base (MXN)</label><input type="number" v-model="form.costo" class="input-field" step="0.01" required></div>
        <div class="form-group"><label class="form-label">Meses / Plazos Predefinidos</label><input type="number" v-model="form.plazo" class="input-field" min="1" required></div>
        <div class="form-group" style="display:flex; align-items:flex-end;">
          <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
            <input type="checkbox" v-model="form.eventual">
            <span class="font-bold">Es Cargo Eventual (Un solo cobro al año)</span>
          </label>
        </div>
        <div class="form-group" style="display:flex; align-items:flex-end; justify-content:flex-end;">
          <button type="submit" class="btn btn-secondary" :disabled="loading">Establecer en Catálogo</button>
        </div>
      </form>
    </div>

    <div class="card table-wrapper">
      <table>
        <thead>
          <tr>
            <th>ID Base</th>
            <th>Concepto de Cobro</th>
            <th class="text-right">Costo Vigente</th>
            <th class="text-center">Plazos</th>
            <th class="text-center">Naturaleza</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loadingTable"><td colspan="5" class="text-center" style="padding: 3rem;">Recuperando tarifas de la base de datos...</td></tr>
          <tr v-else-if="!conceptos.length"><td colspan="5" class="text-center" style="padding: 3rem;">No existen tarifas configuradas para este ciclo.</td></tr>
          <tr v-else v-for="c in conceptos" :key="c.id">
            <td style="font-family: monospace;">{{ c.id }}</td>
            <td class="font-bold">{{ c.concepto }}</td>
            <td class="text-right font-bold text-success">${{ Number(c.costo).toFixed(2) }}</td>
            <td class="text-center">{{ c.plazo }} Meses</td>
            <td class="text-center"><span :class="['badge', c.eventual ? 'badge-info' : 'badge-neutral']">{{ c.eventual ? 'Anual/Eventual' : 'Recurrente' }}</span></td>
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
  } catch(e) { show('Error al cargar tarifas', 'danger') }
  finally { loadingTable.value = false }
}

onMounted(loadConceptos)
watch(() => state.value.ciclo, loadConceptos)

const createConcept = async () => {
  loading.value = true
  try {
    await $fetch('/api/conceptos', {
      method: 'POST',
      body: { ...form.value, ciclo: state.value.ciclo }
    })
    show('Tarifa ingresada exitosamente al catálogo oficial')
    showForm.value = false
    form.value = { concepto: '', description: '', costo: 0, plazo: 10, eventual: false }
    loadConceptos()
  } catch(e) {
    show('Falla en la creación de tarifa', 'danger')
  } finally {
    loading.value = false
  }
}
</script>