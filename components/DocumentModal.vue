<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-container">
        <div class="modal-header">
          <h2 class="text-lg font-bold text-gray-800">Agregar documento</h2>
        </div>
        <div class="modal-content">
          <form @submit.prevent="submit" class="grid grid-cols-2 gap-4">
            <div class="form-group col-span-2 mb-0">
              <label class="form-label">Concepto</label>
              <select v-model="selectedDocumentoId" class="input-field" required @change="onDocumentoChange" :disabled="loadingConcepts">
                <option disabled value="">{{ loadingConcepts ? 'Cargando conceptos...' : 'Seleccione un concepto...' }}</option>
                <option v-for="c in conceptos" :key="c.id" :value="c.id">{{ c.concepto }} - ${{ Number(c.costo).toFixed(2) }}</option>
              </select>
            </div>
            <div class="form-group mb-0">
              <label class="form-label">Costo (MXN)</label>
              <input type="number" v-model="form.costo" class="input-field font-semibold text-gray-500 bg-gray-50" step="0.01" disabled>
            </div>
            <div class="form-group mb-0">
              <label class="form-label">Meses</label>
              <input type="number" v-model="form.meses" class="input-field" min="1" max="12" required>
            </div>
            
            <div class="form-group col-span-2 mt-2 p-5 bg-gray-50 rounded-lg border border-gray-200">
              <div class="flex items-center justify-between mb-4">
                <label class="form-label !mb-0 text-brand-campus">Descuento</label>
                <div class="flex bg-gray-200/60 rounded p-1">
                  <button type="button" :class="['px-3 py-1 rounded text-xs font-semibold transition-colors', becaType === 'percentage' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500']" @click="becaType = 'percentage'">%</button>
                  <button type="button" :class="['px-3 py-1 rounded text-xs font-semibold transition-colors', becaType === 'amount' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500']" @click="becaType = 'amount'">$</button>
                </div>
              </div>
              
              <div class="relative">
                <div v-if="becaType === 'percentage'" class="absolute inset-y-0 right-3 flex items-center text-gray-400 text-sm font-bold">%</div>
                <div v-if="becaType === 'amount'" class="absolute inset-y-0 left-3 flex items-center text-brand-campus text-sm font-bold">$</div>
                <input type="number" v-model.number="becaInput" :class="['input-field font-mono font-bold text-gray-800', becaType === 'percentage' ? 'pr-8' : 'pl-8']" min="0" step="0.01">
              </div>

              <div class="mt-4 pt-4 border-t border-gray-200">
                <div class="flex justify-between items-center text-xs mb-2">
                  <span class="text-gray-500 font-medium">Costo Base:</span>
                  <span class="font-mono text-gray-400 line-through">${{ Number(form.costo).toFixed(2) }}</span>
                </div>
                <div class="flex justify-between items-center text-xs mb-3">
                  <span class="text-brand-leaf font-semibold">Descuento:</span>
                  <span class="font-mono text-brand-leaf font-semibold">-${{ discountAmount.toFixed(2) }}</span>
                </div>
                <div class="flex justify-between items-center mt-2 bg-white p-3 rounded-md border border-gray-100 shadow-sm">
                  <span class="text-xs font-bold text-gray-700 uppercase">Total:</span>
                  <span class="font-mono text-lg font-bold text-brand-campus">${{ netAmount.toFixed(2) }}</span>
                </div>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="$emit('close')" type="button">Cancelar</button>
          <button class="btn btn-primary" @click="submit" :disabled="loading || loadingConcepts || !selectedDocumentoId">
            <LucideLoader2 v-if="loading" class="animate-spin" :size="16" />
            {{ loading ? 'Agregando...' : 'Agregar' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { LucideLoader2 } from 'lucide-vue-next'
import { useState } from '#app'
import { useToast } from '~/composables/useToast'
import { useScrollLock } from '~/composables/useScrollLock'
import { normalizeCicloKey } from '~/shared/utils/ciclo'

const props = defineProps({ student: Object })
const emit = defineEmits(['close', 'success'])
const { show } = useToast()
const state = useState('globalState')

useScrollLock()

const conceptos = ref([])
const selectedDocumentoId = ref('')
const loading = ref(false)
const loadingConcepts = ref(false)
const form = ref({ costo: 0, meses: 1, eventual: false })

const becaType = ref('percentage')
const becaInput = ref(0)

onMounted(async () => {
  loadingConcepts.value = true
  try {
    conceptos.value = await $fetch('/api/conceptos', { params: { ciclo: normalizeCicloKey(state.value.ciclo) } })
  } catch (e) {
    show('Error al cargar conceptos', 'danger')
  } finally {
    loadingConcepts.value = false
  }
})

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
        ciclo: normalizeCicloKey(state.value.ciclo), 
        eventual: form.value.eventual 
      }
    })
    show('Documento agregado.')
    emit('success')
  } catch (e) { show('Error al agregar', 'danger') } 
  finally { loading.value = false }
}
</script>
