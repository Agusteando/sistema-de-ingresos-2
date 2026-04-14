<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-container">
      <div class="modal-header">
        <h2 class="text-xl font-bold text-brand-campus">Agregar documento</h2>
      </div>
      <div class="modal-content">
        <form @submit.prevent="submit" class="grid grid-cols-2 gap-5">
          <div class="form-group col-span-2 m-0">
            <label class="form-label">Concepto</label>
            <select v-model="selectedDocumentoId" class="input-field" required @change="onDocumentoChange">
              <option disabled value="">Seleccione un concepto...</option>
              <option v-for="c in conceptos" :key="c.id" :value="c.id">{{ c.concepto }} - ${{ Number(c.costo).toFixed(2) }}</option>
            </select>
          </div>
          <div class="form-group m-0">
            <label class="form-label">Costo (MXN)</label>
            <input type="number" v-model="form.costo" class="input-field font-bold text-gray-500 bg-gray-100" step="0.01" disabled>
          </div>
          <div class="form-group m-0">
            <label class="form-label">Meses</label>
            <input type="number" v-model="form.meses" class="input-field" min="1" max="12" required>
          </div>
          
          <div class="form-group col-span-2 mt-2 p-6 bg-gray-50 rounded-xl border border-gray-200">
            <div class="flex items-center justify-between mb-5">
              <label class="form-label !mb-0 text-brand-campus">Beca / Descuento</label>
              <div class="flex bg-gray-200 rounded-lg p-1 shadow-inner">
                <button type="button" :class="['px-4 py-1.5 rounded-md text-xs font-bold transition-all', becaType === 'percentage' ? 'bg-white shadow-sm text-brand-campus' : 'text-gray-500 hover:text-gray-700']" @click="becaType = 'percentage'">Porcentaje (%)</button>
                <button type="button" :class="['px-4 py-1.5 rounded-md text-xs font-bold transition-all', becaType === 'amount' ? 'bg-white shadow-sm text-brand-campus' : 'text-gray-500 hover:text-gray-700']" @click="becaType = 'amount'">Monto Fijo ($)</button>
              </div>
            </div>
            
            <div class="relative">
              <div v-if="becaType === 'percentage'" class="absolute inset-y-0 right-4 flex items-center text-gray-400 font-bold">%</div>
              <div v-if="becaType === 'amount'" class="absolute inset-y-0 left-4 flex items-center text-brand-campus font-bold">$</div>
              <input type="number" v-model.number="becaInput" :class="['input-field font-mono text-xl font-black focus:ring-brand-campus/30 focus:border-brand-campus text-gray-800', becaType === 'percentage' ? 'pr-10' : 'pl-10']" min="0" step="0.01">
            </div>

            <div class="mt-5 pt-5 border-t border-gray-200">
              <div class="flex justify-between items-center text-sm mb-1.5">
                <span class="text-gray-500 font-medium tracking-wide">Costo Base:</span>
                <span class="font-mono text-gray-400 line-through">${{ Number(form.costo).toFixed(2) }}</span>
              </div>
              <div class="flex justify-between items-center text-sm mb-3">
                <span class="text-brand-leaf font-bold tracking-wide">Descuento:</span>
                <span class="font-mono text-brand-leaf font-bold">-${{ discountAmount.toFixed(2) }}</span>
              </div>
              <div class="flex justify-between items-center mt-3 bg-white p-4 rounded-xl border border-gray-100 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)]">
                <span class="text-[0.8rem] font-black text-gray-800 uppercase tracking-widest">Total a cobrar:</span>
                <span class="font-mono text-2xl font-black text-brand-campus">${{ netAmount.toFixed(2) }}</span>
              </div>
            </div>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" @click="$emit('close')" type="button">Cancelar</button>
        <button class="btn btn-primary" @click="submit" :disabled="loading || !selectedDocumentoId">Agregar documento</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useState } from '#app'
import { useToast } from '~/composables/useToast'

const props = defineProps({ student: Object })
const emit = defineEmits(['close', 'success'])
const { show } = useToast()
const state = useState('globalState')

const conceptos = ref([])
const selectedDocumentoId = ref('')
const loading = ref(false)
const form = ref({ costo: 0, meses: 1, eventual: false })

const becaType = ref('percentage')
const becaInput = ref(0)

onMounted(async () => { conceptos.value = await $fetch('/api/conceptos', { params: { ciclo: state.value.ciclo } }) })

const onDocumentoChange = () => {
  const c = conceptos.value.find(x => x.id === selectedDocumentoId.value)
  if (c) { 
    form.value.costo = Number(c.costo)
    form.value.meses = c.plazo || 1
    form.value.eventual = c.eventual 
    becaInput.value = 0
  }
}

const discountAmount = computed(() => {
  const cost = form.value.costo || 0
  if (becaType.value === 'percentage') return cost * (becaInput.value || 0) / 100
  return becaInput.value || 0
})

const netAmount = computed(() => {
  return Math.max(0, (form.value.costo || 0) - discountAmount.value)
})

const submit = async () => {
  if (!selectedDocumentoId.value) return show('Seleccione un concepto', 'danger')
  loading.value = true
  
  const cost = form.value.costo || 1
  const finalBecaPercentage = becaType.value === 'percentage' ? becaInput.value : ((becaInput.value || 0) * 100 / cost)

  try {
    await $fetch('/api/documentos', {
      method: 'POST',
      body: { 
        matricula: props.student.matricula, 
        conceptoId: selectedDocumentoId.value, 
        costo: form.value.costo, 
        meses: form.value.meses, 
        beca: finalBecaPercentage, 
        ciclo: state.value.ciclo, 
        eventual: form.value.eventual 
      }
    })
    show('Documento agregado correctamente.')
    emit('success')
  } catch (e) { show('Error al agregar el documento', 'danger') } 
  finally { loading.value = false }
}
</script>