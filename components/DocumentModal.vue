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
              <label class="form-label mb-1 text-brand-campus">Monto final</label>
              <p class="text-xs text-gray-500 mb-3">Este debe ser el monto final de tu proyección, sin decimales.</p>
              <div class="relative">
                <div class="absolute inset-y-0 left-3 flex items-center text-brand-campus text-sm font-bold">$</div>
                <input
                  type="number"
                  v-model.number="montoFinalInput"
                  class="input-field font-mono font-bold text-gray-800 pl-8"
                  min="0"
                  step="1"
                  required
                >
              </div>

              <div class="mt-4 pt-4 border-t border-gray-200">
                <div class="flex justify-between items-center text-xs mb-3">
                  <span class="text-gray-500 font-medium">Costo del concepto:</span>
                  <span class="font-mono text-gray-500">${{ Number(form.costo).toFixed(2) }}</span>
                </div>
                <div class="flex justify-between items-center mt-2 bg-white p-3 rounded-md border border-gray-100 shadow-sm">
                  <span class="text-xs font-bold text-gray-700 uppercase">Se cobrará:</span>
                  <span class="font-mono text-lg font-bold text-brand-campus">${{ Number(montoFinalInput || 0).toFixed(2) }}</span>
                </div>
                <label class="mt-3 flex items-start gap-2 text-xs font-semibold text-gray-600">
                  <input type="checkbox" v-model="montoFinalConfirmed" class="mt-0.5">
                  <span>Confirmo que este monto final es correcto.</span>
                </label>
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
import { ref, onMounted } from 'vue'
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

const montoFinalInput = ref(0)
const montoFinalConfirmed = ref(false)

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
    montoFinalInput.value = Math.round(Number(c.costo || 0))
    montoFinalConfirmed.value = false
  }
}

const submit = async () => {
  if (!selectedDocumentoId.value) return show('Seleccione un concepto', 'danger')
  const montoFinal = Number(montoFinalInput.value)
  if (!Number.isFinite(montoFinal) || montoFinal < 0 || Math.floor(montoFinal) !== montoFinal) {
    return show('Ingresa un monto final sin decimales', 'danger')
  }
  if (!montoFinalConfirmed.value) return show('Confirma el monto final', 'danger')

  loading.value = true

  try {
    await $fetch('/api/documentos', {
      method: 'POST',
      body: { 
        matricula: props.student.matricula, 
        conceptoId: selectedDocumentoId.value, 
        costo: form.value.costo, 
        montoFinal,
        meses: form.value.meses, 
        beca: 0, 
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
