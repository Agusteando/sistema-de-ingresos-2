<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-container large">
      <div class="modal-header">
        <h2 class="text-xl font-bold text-brand-campus">Pagar Cargos Seleccionados</h2>
      </div>
      <div class="modal-content">
        <div class="grid grid-cols-2 gap-5 mb-6">
          <div class="form-group m-0">
            <label class="form-label">Forma de Pago</label>
            <select v-model="formaDePago" class="input-field">
              <option value="Efectivo">Efectivo</option>
              <option value="Tarjeta de débito">Tarjeta de Débito (+1.5%)</option>
              <option value="Tarjeta de crédito">Tarjeta de Crédito (+3.0%)</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Cheque">Cheque</option>
            </select>
          </div>
          <div class="text-right">
            <label class="form-label">Total a Cobrar (MXN)</label>
            <div class="text-3xl font-bold text-brand-campus leading-none mt-1">
              ${{ totalCobrar.toFixed(2) }}
            </div>
          </div>
        </div>

        <div class="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table class="w-full">
            <thead class="bg-gray-50/80">
              <tr>
                <th class="py-4 px-5 text-xs font-bold uppercase tracking-wider text-gray-500 text-left border-b border-gray-200">Documento</th>
                <th class="py-4 px-5 text-xs font-bold uppercase tracking-wider text-gray-500 text-left border-b border-gray-200">Mes</th>
                <th class="py-4 px-5 text-xs font-bold uppercase tracking-wider text-gray-500 text-right border-b border-gray-200 w-40">Monto</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(debt, i) in processedDebts" :key="i" class="border-t border-gray-100 hover:bg-gray-50/50 transition-colors">
                <td class="font-bold py-4 px-5 text-gray-700">{{ debt.conceptoNombre }}</td>
                <td class="py-4 px-5 text-gray-600">{{ debt.mesLabel }}</td>
                <td class="text-right py-3 px-5">
                  <input type="number" class="input-field text-right font-bold py-2 px-3 focus:ring-brand-leaf focus:border-brand-leaf bg-white" v-model.number="debt.montoPagado" :max="debt.saldoFinal" min="0" step="0.01">
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" @click="$emit('close')" :disabled="processing">Cancelar</button>
        <button class="btn btn-outline" type="button" @click="previewReceipt" :disabled="processing || totalCobrar <= 0">
          <LucideEye :size="18"/> Previsualizar
        </button>
        <button class="btn btn-primary" @click="submit" :disabled="processing || totalCobrar <= 0">
          <LucideCheckCircle :size="18"/> Confirmar Operación
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { LucideCheckCircle, LucideEye } from 'lucide-vue-next'
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
    return { ...d, saldoFinal: final, montoPagado: final, pagosPrevios: d.pagos, saldoAntes: d.subtotal - d.pagos }
  })
}, { immediate: true })

const totalCobrar = computed(() => processedDebts.value.reduce((a, b) => a + (b.montoPagado || 0), 0))

const previewReceipt = () => {
  const previewData = {
    folios: 'PREVIO',
    fecha: new Date().toISOString(),
    nombreCompleto: props.student.nombreCompleto,
    matricula: props.student.matricula,
    nivel: props.student.nivel,
    grado: props.student.grado,
    grupo: props.student.grupo,
    items: processedDebts.value.filter(d => d.montoPagado > 0).map((d, i) => ({
      folio: 'PREV-' + (i+1),
      conceptoNombre: d.conceptoNombre,
      formaDePago: formaDePago.value,
      monto: d.montoPagado
    }))
  }
  sessionStorage.setItem('receipt_preview', JSON.stringify(previewData))
  window.open('/print/recibo?preview=true', '_blank', 'width=850,height=800')
}

const submit = async () => {
  processing.value = true
  try {
    const { folios } = await $fetch('/api/payments/pay', {
      method: 'POST',
      body: { matricula: props.student.matricula, formaDePago: formaDePago.value, ciclo: state.value.ciclo, pagos: processedDebts.value }
    })
    show('Liquidación registrada con éxito')
    window.open(`/print/recibo?folios=${folios.join(',')}`, '_blank', 'width=850,height=800')
    emit('success')
  } catch (e) {
    show('Fallo interno al procesar el ingreso', 'danger')
  } finally { processing.value = false }
}
</script>