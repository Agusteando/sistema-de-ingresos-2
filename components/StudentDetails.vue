<template>
  <div class="card mt-8">
    <div class="card-header border-b-2">
      <div>
        <h3 class="text-lg font-bold text-gray-800 tracking-tight m-0">{{ student.nombreCompleto }}</h3>
        <p class="text-[0.8rem] text-gray-500 mt-0.5 font-medium m-0">
          Matrícula: <strong class="text-accent-sky font-mono">{{ student.matricula }}</strong> &nbsp;|&nbsp; 
          Grupo: {{ student.grado }} {{ student.grupo }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2 md:justify-end">
        <button class="btn btn-ghost !px-3" @click="printBeca"><LucideAward :size="14"/> Carta beca</button>
        <button class="btn btn-ghost !px-3" @click="$emit('edit', student)"><LucideSettings :size="14"/> Editar</button>
        <button class="btn btn-ghost !px-3" :disabled="!selectedDebts.length" @click="sendReminder"><LucideBell :size="14"/> Recordatorio</button>
        <button class="btn btn-outline !px-3" @click="showDocModal = true"><LucideFilePlus :size="14"/> Cargo</button>
        <button class="btn btn-secondary !px-3" :disabled="!selectedDebts.length" @click="showInvoiceModal = true"><LucideFileText :size="14"/> Facturar</button>
        <button class="btn btn-primary !px-4" :disabled="!selectedDebts.length" @click="showPaymentModal = true"><LucideCreditCard :size="14"/> Pagar</button>
      </div>
    </div>
    
    <div class="table-wrapper border-none rounded-none shadow-none">
      <table>
        <thead>
          <tr>
            <th class="w-10 text-center"><input type="checkbox" @change="toggleAll" :checked="selectedDebts.length === validDebts.length && validDebts.length > 0" class="w-4 h-4 text-brand-leaf focus:ring-brand-leaf border-gray-300 rounded cursor-pointer"></th>
            <th class="w-32">Progreso</th>
            <th>Mes</th>
            <th>Concepto</th>
            <th class="text-right">Monto</th>
            <th class="text-right">Pagos</th>
            <th class="text-right">Saldo</th>
            <th class="text-center w-24">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="8" class="text-center text-gray-500 font-medium py-10">Cargando datos...</td></tr>
          <tr v-else-if="!debts.length"><td colspan="8" class="text-center text-gray-400 py-10">Sin adeudos o documentos registrados.</td></tr>
          <template v-else v-for="debt in debts" :key="`${debt.documento}-${debt.mes}`">
            <tr :class="{ 'selected': selectedDebts.includes(debt) }"
                class="cursor-context-menu"
                @contextmenu.prevent="showDebtContextMenu($event, debt)">
              <td class="text-center"><input type="checkbox" :value="debt" v-model="selectedDebts" :disabled="debt.saldo <= 0" class="w-4 h-4 text-brand-leaf focus:ring-brand-leaf border-gray-300 rounded cursor-pointer"></td>
              <td>
                <div class="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden border border-gray-200/50"><div class="h-full transition-all duration-300 rounded-full" :style="{ width: debt.porcentajePagado + '%', backgroundColor: debt.porcentajePagado == 100 ? '#8EC153' : '#FCBF2D' }"></div></div>
              </td>
              <td class="font-semibold text-gray-700 text-xs">{{ debt.mesLabel }}</td>
              <td class="text-gray-800 text-sm">{{ debt.conceptoNombre }} <span v-if="debt.hasRecargo" class="badge badge-warning ml-1 !text-[9px]">Recargo</span></td>
              <td class="text-right text-gray-600 font-mono text-sm">${{ format(debt.subtotal) }}</td>
              <td class="text-right font-semibold text-brand-campus font-mono text-sm">${{ format(debt.pagos) }}</td>
              <td :class="['text-right font-semibold font-mono text-sm', debt.saldo > 0 ? 'text-accent-coral' : 'text-gray-600']">${{ format(debt.saldo) }}</td>
              <td class="text-center">
                <button v-if="debt.historialPagos?.length" class="btn btn-ghost !px-2 !py-1 text-xs" @click="toggleHistory(debt)"><LucideHistory :size="14"/></button>
              </td>
            </tr>
            <tr v-if="expandedHistory === `${debt.documento}-${debt.mes}`" class="bg-gray-50/50">
              <td colspan="8" class="p-4">
                <table class="bg-white rounded-lg border border-gray-200 shadow-sm w-full">
                  <thead><tr><th class="py-2 px-4 text-[10px]">Folio</th><th class="py-2 px-4 text-[10px]">Fecha</th><th class="py-2 px-4 text-[10px]">Forma de Pago</th><th class="text-right py-2 px-4 text-[10px]">Monto</th><th class="text-center py-2 px-4 text-[10px]">Opciones</th></tr></thead>
                  <tbody>
                    <tr v-for="h in debt.historialPagos" :key="h.folio" class="hover:bg-gray-50">
                      <td class="font-mono text-xs font-semibold text-accent-sky py-2 px-4 border-b border-gray-100">#{{ h.folio }}</td>
                      <td class="py-2 px-4 text-xs text-gray-600 border-b border-gray-100">{{ new Date(h.fecha).toLocaleDateString() }}</td>
                      <td class="py-2 px-4 text-xs text-gray-600 border-b border-gray-100">{{ h.formaDePago }}</td>
                      <td class="text-right font-semibold text-brand-campus text-xs py-2 px-4 border-b border-gray-100">${{ format(h.monto) }}</td>
                      <td class="text-center py-2 px-4 border-b border-gray-100 flex justify-center gap-1">
                        <button class="btn btn-outline !px-2 !py-0.5 text-[10px]" @click="reprintPayment(h)"><LucidePrinter :size="12" class="mr-1 inline-block"/> PDF</button>
                        <button class="btn btn-ghost text-accent-coral !px-2 !py-0.5 text-[10px]" @click="cancelPayment(h)"><LucideUndo :size="12" class="mr-1 inline-block"/> Anular</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <PaymentModal v-if="showPaymentModal" :debts="selectedDebts" :student="student" @close="showPaymentModal = false" @success="handleSuccess" />
    <DocumentModal v-if="showDocModal" :student="student" @close="showDocModal = false" @success="handleSuccess" />
    <InvoiceModal v-if="showInvoiceModal" :debts="selectedDebts" :student="student" @close="showInvoiceModal = false" @success="handleSuccess" />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { LucideCreditCard, LucideFileText, LucideFilePlus, LucideHistory, LucideSettings, LucideBell, LucidePrinter, LucideUndo, LucideAward } from 'lucide-vue-next'
import { useState } from '#app'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'
import PaymentModal from './PaymentModal.vue'
import DocumentModal from './DocumentModal.vue'
import InvoiceModal from './InvoiceModal.vue'

const props = defineProps({ student: Object })
const emit = defineEmits(['refresh', 'edit'])
const { show } = useToast()
const { openMenu } = useContextMenu()
const state = useState('globalState')

const debts = ref([])
const loading = ref(false)
const selectedDebts = ref([])
const expandedHistory = ref(null)

const showPaymentModal = ref(false)
const showDocModal = ref(false)
const showInvoiceModal = ref(false)

const format = (val) => Number(val || 0).toFixed(2)
const validDebts = computed(() => debts.value.filter(d => d.saldo > 0))

const loadDebts = async () => {
  loading.value = true; selectedDebts.value =[]
  try {
    debts.value = await $fetch(`/api/students/${props.student.matricula}/debts`, {
      params: { ciclo: state.value.ciclo, lateFeeActive: state.value.lateFeeActive }
    })
  } catch (e) {} 
  finally { loading.value = false }
}

watch(() =>[props.student, state.value.lateFeeActive], loadDebts, { immediate: true })

const toggleAll = (e) => { selectedDebts.value = e.target.checked ? [...validDebts.value] :[] }
const toggleHistory = (debt) => { const id = `${debt.documento}-${debt.mes}`; expandedHistory.value = expandedHistory.value === id ? null : id }

const reprintPayment = (pago) => {
  window.open(`/print/recibo?folios=${pago.folio}`, '_blank', 'width=850,height=800')
}

const printBeca = () => {
  window.open(`/print/beca?matricula=${props.student.matricula}`, '_blank', 'width=850,height=800')
}

const cancelPayment = async (pago) => {
  const motivo = prompt('Motivo de la cancelación:')
  if (!motivo) return
  try {
    await $fetch('/api/payments/cancel', { method: 'POST', body: { folio: pago.folio, motivo } })
    show('Pago cancelado')
    loadDebts(); emit('refresh')
  } catch (e) { show('Error al cancelar', 'danger') }
}

const sendReminder = async () => {
  if (!props.student.correo) return show('Sin correo registrado', 'danger')
  try {
    const total = selectedDebts.value.reduce((s, d) => s + d.saldo, 0)
    await $fetch('/api/reminders/send', { method: 'POST', body: { correo: props.student.correo, asunto: 'Recordatorio de pago', mensaje: `Le recordamos que el alumno presenta un saldo pendiente de $${total.toFixed(2)} MXN.` } })
    show('Recordatorio enviado.')
  } catch(e) { show('Error al enviar', 'danger') }
}

const showDebtContextMenu = (event, debt) => {
  const canPay = debt.saldo > 0
  openMenu(event, [
    { label: canPay ? 'Pagar' : 'Completado', icon: LucideCreditCard, disabled: !canPay, action: () => { selectedDebts.value = [debt]; showPaymentModal.value = true } },
    { label: 'Facturar', icon: LucideFileText, action: () => { selectedDebts.value = [debt]; showInvoiceModal.value = true } },
    { label: 'Historial', icon: LucideHistory, action: () => toggleHistory(debt) }
  ])
}

const handleSuccess = () => {
  showPaymentModal.value = false; showDocModal.value = false; showInvoiceModal.value = false
  selectedDebts.value =[]; loadDebts(); emit('refresh')
}
</script>