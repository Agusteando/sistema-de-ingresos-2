<template>
  <div style="max-width: 1200px; margin: 0 auto;">
    <div class="card mb-4" style="padding: 1.5rem; display: flex; gap: 1.25rem; align-items: flex-end; background: var(--neutral-canvas);">
      <div class="form-group" style="margin: 0; flex: 1;">
        <label class="form-label">Apertura de Rango</label>
        <input type="date" v-model="filtros.inicio" class="input-field">
      </div>
      <div class="form-group" style="margin: 0; flex: 1;">
        <label class="form-label">Cierre de Rango</label>
        <input type="date" v-model="filtros.fin" class="input-field">
      </div>
      <div class="form-group" style="margin: 0; flex: 1;">
        <label class="form-label">Clasificación de Plantel</label>
        <select v-model="filtros.plantel" class="input-field">
          <option value="">Filtro Global</option>
          <option value="PT">Primaria Toluca</option>
          <option value="PM">Primaria Metepec</option>
          <option value="SM">Secundaria Metepec</option>
        </select>
      </div>
      <button class="btn btn-secondary" @click="loadData" :disabled="loading" style="height: 44px; min-width: 200px;">
        <LucideFilter size="18"/> Consolidar Corte
      </button>
    </div>

    <div class="card table-wrapper">
      <div class="card-header">
        <h3 style="font-size: 1.125rem; font-weight: 700; color: var(--brand-campus);">Bitácora de Corte Operativo</h3>
        <div style="font-size: 1.5rem; font-weight: 700; color: var(--brand-leaf); background: var(--neutral-ink); padding: 0.25rem 1rem; border-radius: var(--radius-sm);">
          Cierre (MXN): ${{ totalGlobal.toFixed(2) }}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Fecha Operativa</th>
            <th>Naturaleza del Cobro</th>
            <th>Mecanismo Financiero</th>
            <th class="text-right">Volumen (Ops)</th>
            <th class="text-right">Flujo Económico</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="5" class="text-center" style="padding: 3rem;">Agrupando movimientos contables...</td></tr>
          <tr v-else-if="!datos.length"><td colspan="5" class="text-center" style="padding: 3rem;">Sin actividades económicas detectadas.</td></tr>
          <tr v-else v-for="(row, idx) in datos" :key="idx">
            <td>{{ new Date(row.fecha).toLocaleDateString() }}</td>
            <td class="font-bold">{{ row.categoria }}</td>
            <td><span class="badge badge-info">{{ row.formaDePago }}</span></td>
            <td class="text-right font-bold">{{ row.transacciones }}</td>
            <td class="text-right font-bold text-success">${{ Number(row.total).toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { LucideFilter } from 'lucide-vue-next'
import { useState } from '#app'

const state = useState('globalState')
const filtros = ref({ inicio: '', fin: '', plantel: '' })
const datos = ref([])
const loading = ref(false)

const totalGlobal = computed(() => datos.value.reduce((sum, row) => sum + Number(row.total), 0))

const loadData = async () => {
  loading.value = true
  try {
    datos.value = await $fetch('/api/reports/corte', {
      params: { ...filtros.value, ciclo: state.value.ciclo }
    })
  } catch (e) {
    alert('Dificultad extrayendo datos para consolidación')
  } finally {
    loading.value = false
  }
}
onMounted(loadData)
</script>