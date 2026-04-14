<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-container large">
      <div class="modal-header">
        <h2 style="font-size: 1.25rem; font-weight: 700; color: var(--brand-campus);">Módulo de Recepción de Pagos</h2>
      </div>
      <div class="modal-content">
        <div class="grid-2 mb-4">
          <div class="form-group">
            <label class="form-label">Instrumento de Pago</label>
            <select v-model="formaDePago" class="input-field">
              <option value="Efectivo">Efectivo</option>
              <option value="Tarjeta de débito">Tarjeta de Débito Bancaria (+1.5%)</option>
              <option value="Tarjeta de crédito">Tarjeta de Crédito Bancaria (+3.0%)</option>
              <option value="Transferencia">Transferencia Electrónica</option>
              <option value="Cheque">Cheque Nominativo</option>
            </select>
          </div>
          <div class="form-group text-right">
            <label class="form-label">Suma Requerida (MXN)</label>
            <div style="font-size: 2rem; font-weight: 700; color: var(--brand-campus); line-height: 1;">
              ${{ totalCobrar.toFixed(2) }}
            </div>
          </div>
        </div>

        <table style="border: 1px solid var(--neutral-mist); border-radius: var(--radius-sm); overflow: hidden;">
          <thead style="background: var(--bg-app);">
            <tr><th>Descripción del Cargo</th><th>Período</th><th style="width: 180px;" class="text-right">Monto a Liquidar</th></tr>
          </thead>
          <tbody>
            <tr v-for="(debt, i) in processedDebts" :key="i">
              <td class="font-bold">{{ debt.conceptoNombre }}</td>
              <td>{{ debt.mesLabel }}</td>
              <td class="text-right">
                <input type="number" class="input-field" style="padding: 0.5rem; font-weight: bold; text-align: right;" v-model.number="debt.montoPagado" :max="debt.saldoFinal" min="0" step="0.01">
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" @click="$emit('close')" :disabled="processing">Abortar</button>
        <button class="btn btn-primary" @click="submit" :disabled="processing || totalCobrar <= 0">
          <LucideCheckCircle size="18"/> {{ processing ? 'Validando...' : 'Asentar Pago y Generar Comprobante' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { LucideCheckCircle } from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { useState } from '#app'

const props = defineProps({ debts: Array, student: Object })
const emit = defineEmits(['close', 'success'])
const { show } = useToast()
const state = useState('globalState')

const formaDePago = ref('Efectivo')
const processing = ref(false)
const processedDebts = ref([])

const getMod = () => {
  if (formaDePago.value === 'Tarjeta de débito') return 1.015
  if (formaDePago.value === 'Tarjeta de crédito') return 1.03
  return 1
}

watch(() => [props.debts, formaDePago.value], () => {
  const mod = getMod()
  processedDebts.value = props.debts.map(d => {
    const final = d.saldo * mod
    return { ...d, saldoFinal: final, montoPagado: final, conceptoNombre: d.conceptoNombre }
  })
}, { immediate: true })

const totalCobrar = computed(() => processedDebts.value.reduce((a, b) => a + (b.montoPagado || 0), 0))

const submit = async () => {
  processing.value = true
  try {
    const { folios } = await $fetch('/api/payments/pay', {
      method: 'POST',
      body: {
        matricula: props.student.matricula,
        formaDePago: formaDePago.value,
        ciclo: state.value.ciclo,
        pagos: processedDebts.value
      }
    })
    show('Abono procesado exitosamente en el libro mayor')
    window.open(`/api/payments/receipt?folios=${folios.join(',')}`, '_blank', 'width=800,height=600')
    emit('success')
  } catch (e) {
    show('Desviación en la ejecución del pago', 'danger')
  } finally {
    processing.value = false
  }
}
</script>