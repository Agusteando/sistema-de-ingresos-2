<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-container">
      <div class="modal-header">
        <h2 class="text-xl font-bold text-brand-campus">Anexar Documento</h2>
      </div>
      <div class="modal-content">
        <form @submit.prevent="submit" class="grid grid-cols-2 gap-5">
          <div class="form-group col-span-2">
            <label class="form-label">Documento Base</label>
            <select v-model="selectedDocumentoId" class="input-field" required @change="onDocumentoChange">
              <option disabled value="">Seleccione documento...</option>
              <option v-for="c in conceptos" :key="c.id" :value="c.id">{{ c.concepto }} - ${{ Number(c.costo).toFixed(2) }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Tarifa Neta (MXN)</label>
            <input type="number" v-model="form.costo" class="input-field" step="0.01" required>
          </div>
          <div class="form-group">
            <label class="form-label">Plazos de Amortización</label>
            <input type="number" v-model="form.meses" class="input-field" min="1" max="12" required>
          </div>
          <div class="form-group col-span-2">
            <label class="form-label">Ajuste / Beca Institucional (%)</label>
            <input type="number" v-model="form.beca" class="input-field" min="0" max="100" step="0.01">
            <p class="text-xs text-gray-500 mt-2">Cero (0) implica cobro íntegro.</p>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" @click="$emit('close')" type="button">Cancelar</button>
        <button class="btn btn-primary" @click="submit" :disabled="loading">Vincular Documento</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useState } from '#app'
import { useToast } from '~/composables/useToast'

const props = defineProps({ student: Object })
const emit = defineEmits(['close', 'success'])
const { show } = useToast()
const state = useState('globalState')

const conceptos = ref([])
const selectedDocumentoId = ref('')
const loading = ref(false)
const form = ref({ costo: 0, meses: 1, beca: 0, eventual: false })

onMounted(async () => { conceptos.value = await $fetch('/api/conceptos', { params: { ciclo: state.value.ciclo } }) })

const onDocumentoChange = () => {
  const c = conceptos.value.find(x => x.id === selectedDocumentoId.value)
  if (c) { form.value.costo = c.costo; form.value.meses = c.plazo || 1; form.value.eventual = c.eventual }
}

const submit = async () => {
  if (!selectedDocumentoId.value) return show('Debe vincular una tarifa', 'danger')
  loading.value = true
  try {
    await $fetch('/api/documentos', {
      method: 'POST',
      body: { matricula: props.student.matricula, conceptoId: selectedDocumentoId.value, costo: form.value.costo, meses: form.value.meses, beca: form.value.beca, ciclo: state.value.ciclo, eventual: form.value.eventual }
    })
    show('Documento vinculado con éxito')
    emit('success')
  } catch (e) { show('Error al procesar el documento', 'danger') } 
  finally { loading.value = false }
}
</script>