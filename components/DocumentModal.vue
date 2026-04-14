<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-container">
      <div class="modal-header">
        <h2 style="font-size: 1.25rem; font-weight: 700; color: var(--brand-campus);">Asignación de Obligación Financiera</h2>
      </div>
      <div class="modal-content">
        <form @submit.prevent="submit" class="grid-2">
          <div class="form-group" style="grid-column: span 2;">
            <label class="form-label">Tarifa / Concepto Contractual</label>
            <select v-model="selectedConceptoId" class="input-field" required @change="onConceptoChange">
              <option disabled value="">Seleccione del catálogo establecido...</option>
              <option v-for="c in conceptos" :key="c.id" :value="c.id">{{ c.concepto }} - ${{ Number(c.costo).toFixed(2) }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Costo Aplicado (MXN)</label>
            <input type="number" v-model="form.costo" class="input-field" step="0.01" required>
          </div>
          <div class="form-group">
            <label class="form-label">Plazos de Amortización (Meses)</label>
            <input type="number" v-model="form.meses" class="input-field" min="1" max="12" required>
          </div>
          <div class="form-group" style="grid-column: span 2;">
            <label class="form-label">Beca Institucional Aplicada (%)</label>
            <input type="number" v-model="form.beca" class="input-field" min="0" max="100" step="0.01">
            <p style="font-size: 0.75rem; color: #5B665E; margin-top: 4px;">Valor "0" indica tarifa completa.</p>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" @click="$emit('close')" type="button">Cancelar Transacción</button>
        <button class="btn btn-primary" @click="submit" :disabled="loading">Anexar Cargo al Expediente</button>
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
const selectedConceptoId = ref('')
const loading = ref(false)
const form = ref({ costo: 0, meses: 1, beca: 0 })

onMounted(async () => {
  conceptos.value = await $fetch('/api/conceptos', { params: { ciclo: state.value.ciclo } })
})

const onConceptoChange = () => {
  const c = conceptos.value.find(x => x.id === selectedConceptoId.value)
  if (c) {
    form.value.costo = c.costo
    form.value.meses = c.plazo || 1
  }
}

const submit = async () => {
  if (!selectedConceptoId.value) return show('Debe asignar un concepto central', 'danger')
  loading.value = true
  try {
    await $fetch('/api/documentos', {
      method: 'POST',
      body: {
        matricula: props.student.matricula,
        conceptoId: selectedConceptoId.value,
        costo: form.value.costo,
        meses: form.value.meses,
        beca: form.value.beca,
        ciclo: state.value.ciclo
      }
    })
    show('Obligación financiera anexada correctamente')
    emit('success')
  } catch (e) {
    show('Falla técnica en inserción de obligaciones', 'danger')
  } finally {
    loading.value = false
  }
}
</script>