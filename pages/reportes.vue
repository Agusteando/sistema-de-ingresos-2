<template>
  <div class="max-w-6xl mx-auto">
    
    <div class="card mb-6 p-6 flex flex-col md:flex-row gap-5 items-end bg-white">
      <div class="form-group m-0 flex-1 w-full">
        <label class="form-label">Apertura (Fecha Inicial)</label>
        <input type="date" v-model="filtros.inicio" class="input-field">
      </div>
      <div class="form-group m-0 flex-1 w-full">
        <label class="form-label">Cierre (Fecha Final)</label>
        <input type="date" v-model="filtros.fin" class="input-field">
      </div>
      <div class="form-group m-0 flex-1 w-full">
        <label class="form-label">Entidad Escolar</label>
        <select v-model="filtros.plantel" class="input-field">
          <option value="">Consolidado Global</option>
          <option value="PT">Primaria Toluca</option>
          <option value="PM">Primaria Metepec</option>
          <option value="SM">Secundaria Metepec</option>
        </select>
      </div>
      <button class="btn btn-secondary h-11 min-w-[180px] w-full md:w-auto" @click="loadData" :disabled="loading">
        <LucideFilter :size="18"/> Ejecutar Corte
      </button>
    </div>

    <div class="card table-wrapper">
      <div class="card-header">
        <h3 class="text-lg font-bold text-brand-campus">Bitácora de Ingresos</h3>
        <div class="text-2xl font-bold text-brand-leaf bg-neutral-ink px-4 py-1.5 rounded-md">
          Cierre: ${{ totalGlobal.toFixed(2) }}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Fecha Operativa</th>
            <th>Concepto / Tarifa</th>
            <th>Instrumento Financiero</th>
            <th class="text-right">Volumen (Trx)</th>
            <th class="text-right">Flujo (MXN)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="5" class="text-center font-bold text-brand-teal py-12">Agrupando datos de ingresos...</td></tr>
          <tr v-else-if="!datos.length"><td colspan="5" class="text-center text-gray-500 py-12">El corte no arrojó resultados en el periodo indicado.</td></tr>
          <tr v-else v-for="(row, idx) in datos" :key="idx">
            <td>{{ new Date(row.fecha).toLocaleDateString() }}</td>
            <td class="font-bold">{{ row.categoria }}</td>
            <td><span class="badge badge-info">{{ row.formaDePago }}</span></td>
            <td class="text-right font-bold">{{ row.transacciones }}</td>
            <td class="text-right font-bold text-brand-campus">${{ Number(row.total).toFixed(2) }}</td>
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
    datos.value = await $fetch('/api/reports/corte', { params: { ...filtros.value, ciclo: state.value.ciclo } })
  } catch (e) { alert('Anomalía calculando corte de caja') } 
  finally { loading.value = false }
}
onMounted(loadData)
</script>