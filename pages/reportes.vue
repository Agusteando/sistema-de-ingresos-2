<template>
  <div class="max-w-6xl mx-auto">
    
    <div class="card mb-8 p-8 flex flex-col md:flex-row gap-6 items-end bg-white/80 backdrop-blur-sm shadow-sm border border-gray-100">
      <div class="form-group m-0 flex-1 w-full">
        <label class="form-label text-gray-500">Apertura (Fecha Inicial)</label>
        <input type="date" v-model="filtros.inicio" class="input-field shadow-sm">
      </div>
      <div class="form-group m-0 flex-1 w-full">
        <label class="form-label text-gray-500">Cierre (Fecha Final)</label>
        <input type="date" v-model="filtros.fin" class="input-field shadow-sm">
      </div>
      <div class="form-group m-0 flex-1 w-full">
        <label class="form-label text-gray-500">Entidad Escolar</label>
        <select v-model="filtros.plantel" class="input-field shadow-sm">
          <option value="">Consolidado Global</option>
          <option value="PT">Primaria Toluca</option>
          <option value="PM">Primaria Metepec</option>
          <option value="SM">Secundaria Metepec</option>
        </select>
      </div>
      <button class="btn btn-secondary h-[46px] min-w-[200px] w-full md:w-auto shadow-sm" @click="loadData" :disabled="loading">
        <LucideFilter :size="18"/> Ejecutar Corte
      </button>
    </div>

    <div class="card table-wrapper shadow-sm border border-gray-100">
      <div class="card-header bg-gray-50/50">
        <h3 class="text-xl font-bold text-gray-800">Bitácora de Ingresos</h3>
        <div class="text-2xl font-black text-brand-campus bg-brand-leaf/10 px-5 py-2 rounded-xl border border-brand-leaf/20">
          Cierre: ${{ totalGlobal.toFixed(2) }}
        </div>
      </div>
      <table class="w-full">
        <thead class="bg-gray-50/90">
          <tr>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">Fecha Operativa</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">Concepto / Tarifa</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">Vía de Ingreso</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200 text-right">Volumen (Trx)</th>
            <th class="py-4 px-6 text-xs font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200 text-right">Flujo (MXN)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="5" class="text-center font-medium text-gray-500 py-16">Agrupando datos de ingresos...</td></tr>
          <tr v-else-if="!datos.length"><td colspan="5" class="text-center text-gray-400 py-16">El corte no arrojó resultados en el periodo indicado.</td></tr>
          <tr v-else v-for="(row, idx) in datos" :key="idx" class="hover:bg-gray-50/80 transition-colors border-b border-gray-50 last:border-none">
            <td class="py-4 px-6 text-gray-600 font-medium">{{ new Date(row.fecha).toLocaleDateString() }}</td>
            <td class="py-4 px-6 font-bold text-gray-800">{{ row.categoria }}</td>
            <td class="py-4 px-6"><span class="badge bg-blue-100 text-blue-800">{{ row.formaDePago }}</span></td>
            <td class="py-4 px-6 text-right font-bold text-gray-600">{{ row.transacciones }}</td>
            <td class="py-4 px-6 text-right font-bold text-brand-campus font-mono">${{ Number(row.total).toFixed(2) }}</td>
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