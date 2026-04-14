<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-content">
      <h2 style="margin-top: 0;">Confirmar Pagos - {{ student.nombreCompleto }}</h2>
      
      <div style="margin-bottom: 1.5rem;">
        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Forma de Pago</label>
        <select v-model="formaDePago" class="input-field">
          <option value="Efectivo">Efectivo</option>
          <option value="Tarjeta de débito">Tarjeta de débito (1.5% extra)</option>
          <option value="Tarjeta de crédito">Tarjeta de crédito (3.0% extra)</option>
          <option value="Transferencia">Transferencia</option>
        </select>
      </div>

      <div class="table-container" style="margin-bottom: 1.5rem;">
        <table>
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Mes</th>
              <th>A Pagar</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="debt in processedDebts" :key="debt.documento + debt.mes">
              <td>{{ debt.conceptoNombre }}</td>
              <td>{{ debt.mesLabel }}</td>
              <td>
                <input type="number" class="input-field" v-model.number="debt.montoPagado" :max="debt.saldoFinal" min="0" step="0.01">
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style="text-align: right; font-size: 1.25rem; font-weight: bold; margin-bottom: 1.5rem;">
        Total a Cobrar: ${{ totalCobro.toFixed(2) }}
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 1rem;">
        <button class="btn btn-outline" @click="$emit('close')" :disabled="processing">Cancelar</button>
        <button class="btn btn-success" @click="submitPayment" :disabled="processing || totalCobro <= 0">
          <LucideCheck size="16"/> {{ processing ? 'Procesando...' : 'Confirmar Pago' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { LucideCheck } from 'lucide-vue-next'

const props = defineProps({
  debts: Array,
  student: Object
})
const emit = defineEmits(['close', 'success'])

const formaDePago = ref('Efectivo')
const processing = ref(false)

const getModifier = () => {
  if (formaDePago.value === 'Tarjeta de débito') return 1.015
  if (formaDePago.value === 'Tarjeta de crédito') return 1.03
  return 1
}

const processedDebts = ref([])

// Initialize dynamic fields
watch(() => [props.debts, formaDePago.value], () => {
  const mod = getModifier()
  processedDebts.value = props.debts.map(d => {
    const newSaldo = d.saldo * mod
    return {
      ...d,
      saldoFinal: newSaldo,
      montoPagado: newSaldo // Auto-fill with the remaining balance
    }
  })
}, { immediate: true })

const totalCobro = computed(() => {
  return processedDebts.value.reduce((acc, d) => acc + (d.montoPagado || 0), 0)
})

const submitPayment = async () => {
  processing.value = true
  try {
    const payload = {
      matricula: props.student.matricula,
      formaDePago: formaDePago.value,
      pagos: processedDebts.value.map(d => ({
        documento: d.documento,
        mes: d.mes,
        subtotal: d.subtotal,
        hasRecargo: d.hasRecargo,
        montoPagado: d.montoPagado
      }))
    }

    const { folios } = await $fetch('/api/payments/pay', {
      method: 'POST',
      body: payload
    })

    // Auto open super fast generated HTML receipt for printing
    window.open(`/api/payments/receipt?folios=${folios.join(',')}`, '_blank')
    emit('success')
  } catch (error) {
    alert('Error al procesar el pago')
    console.error(error)
  } finally {
    processing.value = false
  }
}
</script>