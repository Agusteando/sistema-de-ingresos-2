<template>
  <div class="h-full flex flex-col bg-white overflow-hidden">
    
    <div class="px-6 py-5 border-b border-gray-200 shrink-0 bg-white relative z-10" :class="student.estatus !== 'Activo' ? 'bg-red-50/30' : ''">
      <div class="flex justify-between items-start">
        <div class="pr-6">
          <h2 class="text-xl font-bold tracking-tight flex items-center gap-2" :class="student.estatus !== 'Activo' ? 'text-red-900' : 'text-gray-900'">
            <span v-if="student.estatus !== 'Activo'" class="badge bg-accent-coral text-white border border-red-600 shadow-sm text-[10px] tracking-widest px-2 py-1">BAJA</span>
            <span :class="student.estatus !== 'Activo' ? 'line-through decoration-red-400/50' : ''">{{ student.nombreCompleto }}</span>
          </h2>
          <p class="text-sm font-medium mt-1.5" :class="student.estatus !== 'Activo' ? 'text-red-800/80' : 'text-gray-500'">
            <span class="font-mono px-1.5 py-0.5 rounded" :class="student.estatus !== 'Activo' ? 'bg-red-100 text-red-900' : 'bg-blue-50 text-accent-sky'">{{ student.matricula }}</span>
            <span class="mx-2" :class="student.estatus !== 'Activo' ? 'text-red-300' : 'text-gray-300'">|</span>
            {{ student.nivel }} • {{ student.grado }} "{{ student.grupo }}"
            <span class="mx-2" :class="student.estatus !== 'Activo' ? 'text-red-300' : 'text-gray-300'">|</span>
            {{ String(student.interno) === '1' ? 'Interno' : 'Externo' }}
            <span v-if="student.estatus !== 'Activo'" class="ml-2 italic text-red-600 text-xs">(Motivo: {{ student.estatus }})</span>
          </p>
        </div>
        <button class="btn btn-ghost !p-1.5 rounded-full" :class="student.estatus !== 'Activo' ? 'text-red-400 hover:text-red-900 hover:bg-red-100' : 'text-gray-400 hover:text-gray-800'" @click="$emit('close')">
          <LucideX :size="20"/>
        </button>
      </div>

      <div class="flex gap-2 mt-5 overflow-x-auto hide-scrollbar mask-edges pr-4">
        <button class="btn btn-primary shrink-0" :disabled="!selectedDebts.length" @click="showPaymentModal = true">
          <LucideCreditCard :size="14"/> Pagar ({{ selectedDebts.length }})
        </button>
        <button class="btn btn-secondary shrink-0" :disabled="!selectedDebts.length" @click="showInvoiceModal = true">
          <LucideFileText :size="14"/> Facturar
        </button>
        <button class="btn btn-outline shrink-0" @click="showDocModal = true">
          <LucideFilePlus :size="14"/> Cargo extra
        </button>
        <div class="w-px h-6 bg-gray-200 mx-1 my-auto shrink-0"></div>
        <button class="btn btn-ghost shrink-0" @click="$emit('edit', student)">
          <LucideSettings :size="14"/> Editar
        </button>
        <button class="btn btn-ghost shrink-0" @click="printBeca">
          <LucideAward :size="14"/> Carta beca
        </button>
        <button class="btn btn-ghost shrink-0" :disabled="!validDebts.length || !student.correo" @click="sendReminder">
          <LucideBell :size="14"/> Enviar aviso
        </button>
        <button v-if="student.estatus === 'Activo'" class="btn btn-danger !px-3 shrink-0 ml-1 shadow-sm" @click="$emit('baja', student)">
          <LucideUserX :size="14"/> Dar de Baja
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-6 bg-gray-50/50">
      
      <div v-if="siblings.length" class="mb-6 p-4 bg-blue-50/60 border border-blue-100 rounded-xl">
        <h4 class="text-[10px] font-bold uppercase tracking-wider text-blue-800 mb-2">Familia / Hermanos</h4>
        <div class="flex gap-2 flex-wrap">
          <button v-for="sib in siblings" :key="sib.matricula" class="badge bg-white text-blue-700 hover:bg-blue-600 hover:text-white transition-colors border border-blue-200 shadow-sm px-2.5 py-1" @click="$emit('switch-student', sib.matricula)">
            <LucideUsers :size="12" class="inline mr-1 opacity-70" /> {{ sib.nombreCompleto }} ({{ sib.grado }})
          </button>
        </div>
      </div>

      <div class="card shadow-sm border-gray-200">
        <div class="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
          <h3 class="font-bold text-gray-800">Estado de Cuenta</h3>
          <div class="text-xs font-bold text-accent-coral bg-red-50 px-3 py-1 rounded-lg border border-red-100">
            Deuda total: ${{ format(validDebts.reduce((acc,d) => acc + d.saldo, 0)) }}
          </div>
        </div>
        
        <div class="w-full overflow-x-auto">
          <table class="w-full min-w-[700px]">
            <thead>
              <tr>
                <th class="w-10 text-center"><input type="checkbox" @change="toggleAll" :checked="selectedDebts.length === validDebts.length && validDebts.length > 0" class="w-4 h-4 text-brand-leaf focus:ring-brand-leaf border-gray-300 rounded cursor-pointer"></th>
                <th class="w-24">Progreso</th>
                <th>Concepto / Mes</th>
                <th class="text-right">Monto</th>
                <th class="text-right">Pagos</th>
                <th class="text-right">Saldo</th>
                <th class="text-center w-16"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading"><td colspan="7" class="text-center text-gray-500 font-medium py-10">Cargando estado de cuenta...</td></tr>
              <tr v-else-if="!debts.length"><td colspan="7" class="text-center text-gray-400 py-10">Sin adeudos o documentos registrados en este ciclo escolar.</td></tr>
              <template v-else v-for="debt in debts" :key="`${debt.documento}-${debt.mes}`">
                <tr :class="{ 'selected': selectedDebts.includes(debt) }"
                    class="cursor-context-menu group hover:bg-gray-50/80 transition-colors"
                    @contextmenu.prevent="showDebtContextMenu($event, debt)">
                  <td class="text-center"><input type="checkbox" :value="debt" v-model="selectedDebts" :disabled="debt.saldo <= 0" class="w-4 h-4 text-brand-leaf focus:ring-brand-leaf border-gray-300 rounded cursor-pointer"></td>
                  <td class="pr-4">
                    <div class="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden border border-gray-200/50"><div class="h-full transition-all duration-300 rounded-full" :style="{ width: debt.porcentajePagado + '%', backgroundColor: debt.porcentajePagado == 100 ? '#8EC153' : '#FCBF2D' }"></div></div>
                  </td>
                  <td>
                    <div class="text-gray-800 text-sm font-semibold">{{ debt.conceptoNombre }}</div>
                    <div class="font-bold text-gray-500 text-[10px] uppercase tracking-wide mt-0.5">
                      {{ debt.mesLabel }} 
                      <span v-if="debt.hasRecargo" class="badge badge-warning !text-[9px] ml-1">Recargo</span>
                    </div>
                  </td>
                  <td class="text-right text-gray-600 font-mono text-sm">${{ format(debt.subtotal) }}</td>
                  <td class="text-right font-semibold text-brand-campus font-mono text-sm">${{ format(debt.pagos) }}</td>
                  <td :class="['text-right font-semibold font-mono text-sm', debt.saldo > 0 ? 'text-accent-coral' : 'text-gray-600']">${{ format(debt.saldo) }}</td>
                  <td class="text-center">
                    <button v-if="debt.historialPagos?.length" class="p-1.5 text-gray-400 hover:text-brand-teal hover:bg-brand-leaf/10 rounded transition-colors" @click="toggleHistory(debt)" title="Historial"><LucideHistory :size="16"/></button>
                  </td>
                </tr>
                <tr v-if="expandedHistory === `${debt.documento}-${debt.mes}`" class="bg-gray-50/50">
                  <td colspan="7" class="p-4 border-b border-gray-100">
                    <table class="bg-white rounded-lg border border-gray-200 shadow-sm w-full">
                      <thead><tr><th class="py-2 px-4 text-[10px]">Folio</th><th class="py-2 px-4 text-[10px]">Fecha</th><th class="py-2 px-4 text-[10px]">Forma de Pago</th><th class="text-right py-2 px-4 text-[10px]">Monto</th><th class="text-center py-2 px-4 text-[10px]">Opciones</th></tr></thead>
                      <tbody>
                        <tr v-for="h in debt.historialPagos" :key="h.folio" class="hover:bg-gray-50 transition-colors">
                          <td class="font-mono text-xs font-bold text-accent-sky py-2 px-4 border-b border-gray-100">#{{ h.folio }}</td>
                          <td class="py-2 px-4 text-xs font-semibold text-gray-600 border-b border-gray-100">{{ new Date(h.fecha).toLocaleString('es-MX') }}</td>
                          <td class="py-2 px-4 text-xs text-gray-600 border-b border-gray-100"><span class="bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-[10px]">{{ h.formaDePago }}</span></td>
                          <td class="text-right font-bold text-brand-campus font-mono text-xs py-2 px-4 border-b border-gray-100">${{ format(h.monto) }}</td>
                          <td class="text-center py-2 px-4 border-b border-gray-100 flex justify-center gap-1">
                            <button class="btn btn-outline !px-2 !py-0.5 text-[10px]" @click="reprintPayment(h)"><LucidePrinter :size="12" class="mr-1 inline-block"/> PDF</button>
                            <button class="btn btn-ghost text-accent-coral !px-2 !py-0.5 text-[10px] hover:bg-accent-coral/10" @click="cancelPayment(h)"><LucideUndo :size="12" class="mr-1 inline-block"/> Anular</button>
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
      </div>
    </div>

    <PaymentModal v-if="showPaymentModal" :debts="selectedDebts" :student="student" @close="showPaymentModal = false" @success="handleSuccess" />
    <DocumentModal v-if="showDocModal" :student="student" @close="showDocModal = false" @success="handleSuccess" />
    <InvoiceModal v-if="showInvoiceModal" :debts="selectedDebts" :student="student" @close="showInvoiceModal = false" @success="handleSuccess" />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { LucideCreditCard, LucideFileText, LucideFilePlus, LucideHistory, LucideSettings, LucideBell, LucidePrinter, LucideUndo, LucideAward, LucideUsers, LucideX, LucideUserMinus, LucideUserX } from 'lucide-vue-next'
import { useState, useCookie } from '#app'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'
import { useOptimisticSync } from '~/composables/useOptimisticSync'
import PaymentModal from './PaymentModal.vue'
import DocumentModal from './DocumentModal.vue'
import InvoiceModal from './InvoiceModal.vue'

const props = defineProps({ student: Object })
const emit = defineEmits(['refresh', 'edit', 'close', 'switch-student', 'baja'])
const { show } = useToast()
const { openMenu } = useContextMenu()
const { executeOptimistic } = useOptimisticSync()
const state = useState('globalState')

const debts = ref([])
const siblings = ref([])
const loading = ref(false)
const selectedDebts = ref([])
const expandedHistory = ref(null)

const showPaymentModal = ref(false)
const showDocModal = ref(false)
const showInvoiceModal = ref(false)

const format = (val) => Number(val || 0).toFixed(2)
const validDebts = computed(() => debts.value.filter(d => d.saldo > 0))

const loadDebts = async () => {
  loading.value = true; selectedDebts.value = []
  try {
    console.info(`[DEBUG_EDC_TRACE_4] Requesting debts for ${props.student.matricula} in ciclo ${state.value.ciclo}`);
    const res = await $fetch(`/api/students/${props.student.matricula}/debts`, {
      params: { ciclo: state.value.ciclo, lateFeeActive: state.value.lateFeeActive }
    })
    console.info(`[DEBUG_EDC_TRACE_5] UI Received debts:`, res);
    debts.value = res || []
  } catch (e) {
    console.error(`[DEBUG_EDC_TRACE_ERROR]`, e);
  } finally { loading.value = false }
}

const loadSiblings = async () => {
  try {
    siblings.value = await $fetch(`/api/students/${props.student.matricula}/siblings`)
  } catch(e) {}
}

watch(() => [props.student, state.value.lateFeeActive], () => {
  if (props.student) {
    loadDebts()
    loadSiblings()
  }
}, { immediate: true })

const toggleAll = (e) => { selectedDebts.value = e.target.checked ? [...validDebts.value] : [] }
const toggleHistory = (debt) => { const id = `${debt.documento}-${debt.mes}`; expandedHistory.value = expandedHistory.value === id ? null : id }

const reprintPayment = (pago) => {
  window.open(`/print/recibo?folios=${pago.folio}`, '_blank', 'width=850,height=800')
}

const printBeca = () => {
  window.open(`/print/beca?matricula=${props.student.matricula}`, '_blank', 'width=850,height=800')
}

const cancelPayment = async (pago) => {
  if (pago.estatus === 'Cancelada' || pago.estatus === 'cancelado') {
    return show('Este folio ya estaba cancelado.', 'danger')
  }

  if (!confirm("Contacta a soporte y solicítales el código que les va a llegar por Telegram para confirmar la anulación.")) {
    return
  }

  const motivo = prompt("Motivo de cancelación:")
  if (!motivo) return

  const secret = Math.floor(Math.random() * 9000) + 1000
  const userName = useCookie('auth_name').value || 'Operador'
  const stringMsg = `*${userName}* solicita una cancelación del concepto _${pago.conceptoNombre}_ por el monto de _$${pago.monto}_ con motivo de _${motivo}_\nCódigo para cancelar: *${secret}*`

  try {
    await fetch("https://tgbot.casitaapps.com/sendMessages", {
      method: "POST",
      body: JSON.stringify({ chatId: ["-4885991203"], message: stringMsg }),
      headers: { "Content-Type": "application/json" },
    })

    const input = prompt("Ingresa el código de cancelación de 4 dígitos proporcionado:")
    
    if (input === secret.toString()) {
      await executeOptimistic(
        () => $fetch('/api/payments/cancel', { method: 'POST', body: { folio: pago.folio, motivo, force_direct: true } }),
        () => {},
        () => {
          loadDebts()
          emit('refresh')
        },
        { pending: 'Procesando anulación...', success: 'Anulación exitosa', error: 'Error al anular' }
      ).then(async () => {
        await fetch("https://tgbot.casitaapps.com/sendMessages", {
          method: "POST",
          body: JSON.stringify({
            chatId: ["-4885991203"],
            message: `La solicitud de cancelación de *${userName}* con código *${secret}* ha sido procesada exitosamente.`,
          }),
          headers: { "Content-Type": "application/json" },
        })
        loadDebts()
        emit('refresh')
      })
    } else {
      alert("Código incorrecto. Operación abortada.")
    }
  } catch (e) {
    show('Error al procesar la cancelación, contacte a soporte.', 'danger')
  }
}

const sendReminder = async () => {
  if (!props.student.correo) return show('El alumno no cuenta con correo registrado', 'danger')
  const total = validDebts.value.reduce((s, d) => s + d.saldo, 0)
  
  await executeOptimistic(
    () => $fetch('/api/reminders/send', { method: 'POST', body: { correo: props.student.correo, asunto: 'Recordatorio de pago - Estado de Cuenta', mensaje: `Le recordamos amablemente que el alumno presenta un saldo pendiente de $${total.toFixed(2)} MXN.` } }),
    () => {},
    () => {},
    { pending: 'Enviando aviso...', success: 'Aviso enviado', error: 'Error al enviar' }
  )
}

const showDebtContextMenu = (event, debt) => {
  const canPay = debt.saldo > 0
  openMenu(event, [
    { label: canPay ? 'Pagar este concepto' : 'Completado', icon: LucideCreditCard, disabled: !canPay, action: () => { selectedDebts.value = [debt]; showPaymentModal.value = true } },
    { label: 'Facturar', icon: LucideFileText, action: () => { selectedDebts.value = [debt]; showInvoiceModal.value = true } },
    { label: 'Historial', icon: LucideHistory, action: () => toggleHistory(debt) }
  ])
}

const handleSuccess = () => {
  showPaymentModal.value = false; showDocModal.value = false; showInvoiceModal.value = false
  selectedDebts.value = []; loadDebts(); emit('refresh')
}
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.mask-edges {
  mask-image: linear-gradient(to right, black 95%, transparent 100%);
}
</style>