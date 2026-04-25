<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-container large">
        <div class="modal-header">
          <h2 class="text-lg font-bold text-gray-800">Recibir Pago</h2>
        </div>
        <div class="modal-content">
          <div class="grid grid-cols-2 gap-4 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
            <div class="form-group mb-0">
              <label class="form-label">Forma de Pago</label>
              <select v-model="formaDePago" class="input-field bg-white">
                <option value="Efectivo">Efectivo</option>
                <option value="Tarjeta de débito">Tarjeta de Débito (+1.5%)</option>
                <option value="Tarjeta de crédito">Tarjeta de Crédito (+3.0%)</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
            <div class="text-right flex flex-col justify-center">
              <span class="text-[0.7rem] font-bold text-gray-500 uppercase tracking-wide">Total a Cobrar</span>
              <span class="text-2xl font-bold text-brand-campus leading-none mt-1 font-mono">${{ totalCobrar.toFixed(2) }}</span>
            </div>
          </div>

          <div class="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <table class="w-full">
              <thead class="bg-gray-50/80">
                <tr>
                  <th class="text-left w-1/2">Concepto</th>
                  <th class="text-left w-1/4">Ref/Mes</th>
                  <th class="text-right w-1/4">Monto ($)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(debt, i) in processedDebts" :key="i" class="border-t border-gray-100 hover:bg-transparent">
                  <td class="font-semibold text-sm py-2 px-4 text-gray-800">{{ debt.conceptoNombre }}</td>
                  <td class="text-xs text-gray-500 py-2 px-4">{{ debt.mesLabel }}</td>
                  <td class="py-2 px-4 text-right">
                    <input type="number" class="input-field text-right font-mono font-semibold py-1 px-2 h-auto text-brand-campus" v-model.number="debt.montoPagado" :max="debt.saldoFinal" min="0" step="0.01">
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="$emit('close')" :disabled="processing">Cancelar</button>
          <button class="btn btn-outline" type="button" @click="previewReceipt" :disabled="processing || totalCobrar <= 0">
            <LucideEye :size="16"/> Previa
          </button>
          <button class="btn btn-primary" @click="submit" :disabled="processing || totalCobrar <= 0">
            <LucideCheckCircle :size="16"/> Registrar Pago
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { LucideCheckCircle, LucideEye } from 'lucide-vue-next'
import { useState } from '#app'
import { useScrollLock } from '~/composables/useScrollLock'
import { useOptimisticSync } from '~/composables/useOptimisticSync'
import { normalizeCicloKey } from '~/shared/utils/ciclo'

const props = defineProps({ debts: Array, student: Object })
const emit = defineEmits(['close', 'success'])
const state = useState('globalState')
const { executeOptimistic } = useOptimisticSync()

useScrollLock()

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
    ciclo: normalizeCicloKey(state.value.ciclo),
    instituto: props.student.plantel === 'PT' || props.student.plantel === 'PM' || props.student.plantel === 'SM' ? 1 : 0,
    items: processedDebts.value.filter(d => d.montoPagado > 0).map((d, i) => ({
      folio: 'PREV-' + (i+1),
      folio_plantel: 'PREV-' + (i+1),
      documento: d.documento,
      formaDePago: formaDePago.value,
      monto: d.montoPagado,
      saldoAntes: d.saldoAntes,
      pagos: d.pagosPrevios,
      pagosDespues: d.pagosPrevios + d.montoPagado,
      saldoDespues: Math.max(0, d.saldoAntes - d.montoPagado),
      importeTotal: d.subtotal,
      mes: d.mes,
      mesReal: d.mesLabel,
      conceptoNombre: d.conceptoNombre,
      fecha: new Date().toISOString()
    }))
  }
  sessionStorage.setItem('receipt_preview', JSON.stringify(previewData))
  window.open('/print/recibo?preview=true', '_blank', 'width=850,height=800')
}

const submit = async () => {
  const payload = { matricula: props.student.matricula, formaDePago: formaDePago.value, ciclo: normalizeCicloKey(state.value.ciclo), pagos: processedDebts.value }
  processing.value = true
  
  await executeOptimistic(
    () => $fetch('/api/payments/pay', { method: 'POST', body: payload }),
    () => emit('success'),
    () => emit('success'),
    { pending: 'Registrando pago...', success: 'Pago exitoso', error: 'Error al registrar' }
  ).then((res) => {
    if (res && res.folios) {
      window.open(`/print/recibo?folios=${res.folios.join(',')}`, '_blank', 'width=850,height=800')
    }
  }).catch(() => {}).finally(() => {
    processing.value = false
  })
}
</script>
