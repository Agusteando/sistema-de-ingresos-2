<template>
  <div class="max-w-6xl mx-auto">
    <div class="card mb-6 p-5 flex flex-col md:flex-row gap-4 items-end">
      <div class="form-group m-0 flex-1 w-full">
        <label class="form-label">Apertura (Fecha Inicial)</label>
        <input type="date" v-model="filtros.inicio" class="input-field">
      </div>
      <div class="form-group m-0 flex-1 w-full">
        <label class="form-label">Cierre (Fecha Final)</label>
        <input type="date" v-model="filtros.fin" class="input-field">
      </div>
      <div class="form-group m-0 flex-1 w-full">
        <label class="form-label">Plantel</label>
        <select v-model="filtros.plantel" class="input-field">
          <option value="">Todos</option>
          <option v-for="p in PLANTELES_LIST" :key="p" :value="p">Plantel {{ p }}</option>
        </select>
      </div>
      <button class="btn btn-secondary w-full md:w-auto" @click="loadData" :disabled="loading">
        <LucideFilter :size="16"/> Ejecutar
      </button>
      <button class="btn btn-outline w-full md:w-auto" @click="printCorte" :disabled="loading">
        <LucidePrinter :size="16"/> Imprimir
      </button>
    </div>

    <div class="card table-wrapper">
      <div class="px-5 py-4 flex justify-between items-center border-b border-gray-200">
        <h3 class="text-lg font-bold text-gray-800 m-0">Bitácora de Ingresos</h3>
        <div class="text-lg font-bold text-brand-campus bg-brand-leaf/10 px-4 py-1.5 rounded-lg border border-brand-leaf/20">
          Cierre: ${{ totalGlobal.toFixed(2) }}
        </div>
      </div>
      <table class="w-full">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Concepto / Tarifa</th>
            <th>Vía de Ingreso</th>
            <th class="text-right">Trx</th>
            <th class="text-right">Flujo (MXN)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="5" class="text-center font-medium text-gray-500 py-12">Procesando...</td></tr>
          <tr v-else-if="!datos.length"><td colspan="5" class="text-center text-gray-400 py-12">No hay resultados en el periodo.</td></tr>
          <tr v-else v-for="(row, idx) in datos" :key="idx" class="cursor-context-menu" @contextmenu.prevent="showContextMenu($event, row)">
            <td class="text-gray-600">{{ new Date(row.fecha).toLocaleDateString() }}</td>
            <td class="font-semibold text-gray-800">{{ row.categoria }}</td>
            <td><span class="badge bg-blue-50 text-blue-700">{{ row.formaDePago }}</span></td>
            <td class="text-right font-semibold text-gray-600">{{ row.transacciones }}</td>
            <td class="text-right font-bold text-brand-campus font-mono">${{ Number(row.total).toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { LucideFilter, LucidePrinter } from 'lucide-vue-next'
import { PLANTELES_LIST } from '~/utils/constants'
import { useState } from '#app'
import { useContextMenu } from '~/composables/useContextMenu'
import { normalizeCicloKey } from '~/shared/utils/ciclo'

const state = useState('globalState')
const { openMenu } = useContextMenu()
const filtros = ref({ inicio: '', fin: '', plantel: '' })
const datos = ref([])
const loading = ref(false)

const totalGlobal = computed(() => datos.value.reduce((sum, row) => sum + Number(row.total), 0))

const loadData = async () => {
  loading.value = true
  try {
    datos.value = await $fetch('/api/reports/corte', { params: { ...filtros.value, ciclo: normalizeCicloKey(state.value.ciclo) } })
  } catch (e) {} 
  finally { loading.value = false }
}

const printCorte = () => {
  const q = new URLSearchParams({ ...filtros.value, ciclo: normalizeCicloKey(state.value.ciclo) }).toString()
  window.open(`/print/corte?${q}`, '_blank', 'width=850,height=800')
}

const showContextMenu = (event, row) => {
  openMenu(event, [
    { label: `Fila: $${Number(row.total).toFixed(2)}`, disabled: true },
    { label: '-' },
    { label: 'Imprimir Corte', icon: LucidePrinter, action: printCorte }
  ])
}

onMounted(loadData)
watch(() => normalizeCicloKey(state.value.ciclo), loadData)
</script>
