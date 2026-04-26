<template>
  <div class="student-details-shell">
    <section class="student-profile-card" :class="{ inactive: student.estatus !== 'Activo', unenrolled: !isEnrolled }">
      <div class="profile-main">
        <div class="profile-identity">
          <div v-if="photoLoading" class="profile-avatar loading">
            <LucideLoader2 class="animate-spin" :size="20" />
          </div>
          <div
            v-else-if="photoUrl && photoUrl !== 'none'"
            class="profile-avatar photo"
            :class="{ inactive: student.estatus !== 'Activo', unenrolled: !isEnrolled }"
          >
            <img :src="photoUrl" />
          </div>
          <div
            v-else
            class="profile-avatar initials"
            :class="{ inactive: student.estatus !== 'Activo', unenrolled: !isEnrolled }"
          >
            {{ initials(student.nombreCompleto) }}
          </div>

          <div class="profile-copy">
            <h2 :title="student.nombreCompleto">
              <span v-if="student.estatus !== 'Activo'" class="state-badge red">BAJA</span>
              <span v-else-if="!isEnrolled" class="state-badge orange">NO INSCRITO</span>
              <span :class="student.estatus !== 'Activo' ? 'line-through decoration-red-400/50' : ''">{{ student.nombreCompleto }}</span>
            </h2>
            <p>
              <span class="student-code">{{ student.matricula }}</span>
              <i></i>
              {{ student.nivel }} · {{ student.grado }} "{{ student.grupo }}"
              <i></i>
              {{ String(student.interno) === '1' ? 'Interno' : 'Externo' }}
              <em v-if="student.estatus !== 'Activo'">(Motivo: {{ student.estatus }})</em>
            </p>
          </div>
        </div>

        <div class="profile-top-actions">
          <button v-if="student.estatus === 'Activo'" class="danger-icon-button" title="Dar de baja" @click="$emit('baja', student)">
            <LucideUserX :size="19"/>
          </button>
          <button class="plain-icon-button" @click="$emit('close')" title="Cerrar detalles">
            <LucideX :size="20"/>
          </button>
        </div>
      </div>

      <div class="profile-actions">
        <button class="btn btn-primary btn-sm action-pay" :disabled="!selectedDebts.length" @click="showPaymentModal = true">
          <LucideCreditCard :size="15"/> Pagar ({{ selectedDebts.length }})
        </button>
        <button class="btn btn-secondary btn-sm" :disabled="!selectedDebts.length" @click="showInvoiceModal = true">
          <LucideFileText :size="15"/> Facturar
        </button>
        <button class="btn btn-outline btn-sm" @click="showDocModal = true">
          <LucideFilePlus :size="15"/> Cargo extra
        </button>
        <span class="action-divider"></span>
        <button class="btn btn-ghost btn-sm" @click="$emit('edit', student)">
          <LucideSettings :size="15"/> Editar
        </button>
        <button class="btn btn-ghost btn-sm" @click="printBeca">
          <LucideAward :size="15"/> Carta beca
        </button>
        <button class="btn btn-ghost btn-sm" :disabled="!validDebts.length || !student.correo" @click="sendReminder">
          <LucideBell :size="15"/> Enviar aviso
        </button>
      </div>
    </section>

    <section v-if="siblings.length" class="siblings-card">
      <h4>Familia / Hermanos</h4>
      <div>
        <button v-for="sib in siblings" :key="sib.matricula" @click="$emit('switch-student', sib.matricula)">
          <LucideUsers :size="13" /> {{ sib.nombreCompleto }} ({{ sib.grado }})
        </button>
      </div>
    </section>

    <section class="account-card">
      <div class="account-header">
        <h3>Estado de Cuenta</h3>
        <div>Deuda: ${{ format(validDebts.reduce((acc,d) => acc + d.saldo, 0)) }}</div>
      </div>

      <div class="account-table-wrap">
        <table>
          <thead>
            <tr>
              <th class="check-cell"><input type="checkbox" @change="toggleAll" :checked="selectedDebts.length === validDebts.length && validDebts.length > 0" class="debt-check"></th>
              <th class="progress-cell">Progreso</th>
              <th>Concepto / Mes</th>
              <th class="money-cell">Monto</th>
              <th class="money-cell">Pagos</th>
              <th class="money-cell">Saldo</th>
              <th class="menu-cell"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading"><td colspan="7" class="account-empty">Cargando estado de cuenta...</td></tr>
            <tr v-else-if="!debts.length"><td colspan="7" class="account-empty muted">Sin adeudos o documentos registrados en este ciclo escolar.</td></tr>
            <template v-else v-for="debt in debts" :key="`${debt.documento}-${debt.mes}`">
              <tr
                :class="{ selected: selectedDebts.includes(debt) }"
                class="debt-row"
                @contextmenu.prevent="showDebtContextMenu($event, debt)"
              >
                <td class="check-cell"><input type="checkbox" :value="debt" v-model="selectedDebts" :disabled="debt.saldo <= 0" class="debt-check"></td>
                <td class="progress-cell">
                  <div class="progress-track">
                    <span :style="{ width: debt.porcentajePagado + '%', backgroundColor: debt.porcentajePagado == 100 ? '#70b34f' : '#FCBF2D' }"></span>
                  </div>
                  <em>{{ debt.porcentajePagado }}%</em>
                </td>
                <td>
                  <strong>{{ debt.conceptoNombre }}</strong>
                  <small>
                    {{ debt.mesLabel }}
                    <span v-if="debt.hasRecargo" class="recargo-badge">Recargo</span>
                  </small>
                </td>
                <td class="money-cell">${{ format(debt.subtotal) }}</td>
                <td class="money-cell paid">${{ format(debt.pagos) }}</td>
                <td class="money-cell" :class="{ danger: debt.saldo > 0 }">${{ format(debt.saldo) }}</td>
                <td class="menu-cell">
                  <button v-if="debt.historialPagos?.length" @click="toggleHistory(debt)" title="Historial">
                    <LucideHistory :size="16"/>
                  </button>
                </td>
              </tr>
              <tr v-if="expandedHistory === `${debt.documento}-${debt.mes}`" class="history-row">
                <td colspan="7">
                  <table class="history-table">
                    <thead>
                      <tr>
                        <th>Folio</th>
                        <th>Fecha</th>
                        <th>Forma de Pago</th>
                        <th class="money-cell">Monto</th>
                        <th class="menu-cell">Opciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="h in debt.historialPagos" :key="h.folio">
                        <td class="folio">#{{ h.folio }}</td>
                        <td>{{ new Date(h.fecha).toLocaleString('es-MX') }}</td>
                        <td><span class="method-pill">{{ h.formaDePago }}</span></td>
                        <td class="money-cell paid">${{ format(h.monto) }}</td>
                        <td class="history-actions">
                          <button class="btn btn-outline !px-2 !py-1 text-[10px]" @click="reprintPayment(h)"><LucidePrinter :size="11" /> PDF</button>
                          <button class="btn btn-ghost !px-2 !py-1 text-[10px] !text-accent-coral hover:!bg-accent-coral/10" @click="cancelPayment(h)"><LucideUndo :size="11" /> Anular</button>
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

      <div class="account-footer">
        <span>Mostrando {{ Math.min(debts.length, 5) }} de {{ debts.length }} conceptos</span>
      </div>
    </section>

    <PaymentModal v-if="showPaymentModal" :debts="selectedDebts" :student="student" @close="showPaymentModal = false" @success="handleSuccess" />
    <DocumentModal v-if="showDocModal" :student="student" @close="showDocModal = false" @success="handleSuccess" />
    <InvoiceModal v-if="showInvoiceModal" :debts="selectedDebts" :student="student" @close="showInvoiceModal = false" @success="handleSuccess" />
  </div>
</template>

<script>
const studentPhotoRequests = new Map()
</script>

<script setup>
import { ref, computed, watch } from 'vue'
import { LucideCreditCard, LucideFileText, LucideFilePlus, LucideHistory, LucideSettings, LucideBell, LucidePrinter, LucideUndo, LucideAward, LucideUsers, LucideX, LucideUserX, LucideLoader2 } from 'lucide-vue-next'
import { useState, useCookie } from '#app'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'
import { useOptimisticSync } from '~/composables/useOptimisticSync'
import { normalizeCicloKey } from '~/shared/utils/ciclo'
import PaymentModal from './PaymentModal.vue'
import DocumentModal from './DocumentModal.vue'
import InvoiceModal from './InvoiceModal.vue'

const props = defineProps({ student: Object, isEnrolled: { type: Boolean, default: true } })
const emit = defineEmits(['refresh', 'edit', 'close', 'switch-student', 'baja', 'photo-loaded'])
const { show } = useToast()
const { openMenu } = useContextMenu()
const { executeOptimistic } = useOptimisticSync()
const state = useState('globalState')

const debts = ref([])
const siblings = ref([])
const loading = ref(false)
const selectedDebts = ref([])
const expandedHistory = ref(null)

const photoUrl = ref(null)
const photoLoading = ref(false)

const showPaymentModal = ref(false)
const showDocModal = ref(false)
const showInvoiceModal = ref(false)

const format = (val) => Number(val || 0).toFixed(2)
const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'AL'
const normalizePhotoMatricula = (value) => String(value || '').trim().toUpperCase()
const photoStorageKey = (matricula) => `foto_${normalizePhotoMatricula(matricula)}`
const validDebts = computed(() => debts.value.filter(d => d.saldo > 0))

const loadDebts = async () => {
  loading.value = true; selectedDebts.value = []
  try {
    const cicloKey = normalizeCicloKey(state.value.ciclo)
    const res = await $fetch(`/api/students/${props.student.matricula}/debts`, {
      params: { ciclo: cicloKey, lateFeeActive: state.value.lateFeeActive }
    })
    debts.value = res || []
  } catch (e) {
    console.error('[EstadoCuentaDebug] Estado de Cuenta error', e)
  } finally { loading.value = false }
}

const loadSiblings = async () => {
  try {
    siblings.value = await $fetch(`/api/students/${props.student.matricula}/siblings`)
  } catch(e) {}
}

const loadPhoto = async () => {
  const matricula = normalizePhotoMatricula(props.student?.matricula)
  if (!matricula) return
  if (!process.client) return
  const key = photoStorageKey(matricula)

  const cached = sessionStorage.getItem(key)
  if (cached) {
    photoUrl.value = cached === 'none' ? null : cached
    if (cached !== 'none') emit('photo-loaded', { matricula, photoUrl: cached })
    return
  }

  photoLoading.value = true
  photoUrl.value = null

  try {
    let request = studentPhotoRequests.get(matricula)
    if (!request) {
      request = $fetch(`/api/students/${encodeURIComponent(matricula)}/photo`, {
        params: { format: 'json' }
      }).finally(() => {
        studentPhotoRequests.delete(matricula)
      })
      studentPhotoRequests.set(matricula, request)
    }

    const res = await request
    if (normalizePhotoMatricula(props.student?.matricula) !== matricula) return

    if (res && res.photoUrl) {
      photoUrl.value = res.photoUrl
      sessionStorage.setItem(key, res.photoUrl)
      emit('photo-loaded', { matricula, photoUrl: res.photoUrl })
    } else {
      photoUrl.value = null
      sessionStorage.setItem(key, 'none')
    }
  } catch (e) {
    if (normalizePhotoMatricula(props.student?.matricula) === matricula) {
      photoUrl.value = null
      if (e?.statusCode === 404 || e?.response?.status === 404) {
        sessionStorage.setItem(key, 'none')
      }
    }
  } finally {
    if (normalizePhotoMatricula(props.student?.matricula) === matricula) {
      photoLoading.value = false
    }
  }
}

watch(() => [props.student?.matricula, state.value.lateFeeActive, normalizeCicloKey(state.value.ciclo)], () => {
  if (props.student) {
    loadDebts()
    loadSiblings()
  }
}, { immediate: true })

watch(() => props.student?.matricula, () => {
  photoUrl.value = null
  photoLoading.value = false
  if (props.student) loadPhoto()
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
.student-details-shell {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

.student-profile-card,
.siblings-card,
.account-card {
  border: 1px solid #dfe6ef;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 8px 24px rgba(22, 38, 65, 0.045);
}

.student-profile-card {
  flex-shrink: 0;
  overflow: hidden;
  padding: 11px 14px 10px;
}

.student-profile-card.inactive {
  background: linear-gradient(135deg, rgba(255, 245, 244, 0.96), rgba(255, 255, 255, 0.94));
}

.student-profile-card.unenrolled {
  background: linear-gradient(135deg, rgba(255, 248, 234, 0.96), rgba(255, 255, 255, 0.94));
}

.profile-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.profile-identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.profile-avatar {
  display: flex;
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 999px;
  border: 1px solid rgba(151, 205, 132, 0.42);
  background: #e2f2dc;
  color: #3e873b;
  font-size: 1.12rem;
  font-weight: 850;
}

.profile-avatar.photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-avatar.loading {
  background: #f8fafc;
  color: #9aa5b7;
}

.profile-avatar.inactive {
  border-color: rgba(255, 77, 56, 0.25);
  background: #ffe9e5;
  color: #d73333;
}

.profile-avatar.unenrolled {
  border-color: rgba(252, 191, 45, 0.35);
  background: #fff3d7;
  color: #ac6811;
}

.profile-copy {
  min-width: 0;
}

.profile-copy h2 {
  display: flex;
  max-width: 100%;
  align-items: center;
  gap: 7px;
  margin: 0;
  color: #172841;
  font-size: 0.96rem;
  font-weight: 850;
  letter-spacing: -0.015em;
  line-height: 1.2;
}

.profile-copy h2 > span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-copy p {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  margin: 5px 0 0;
  color: #6d7890;
  font-size: 0.7rem;
  font-weight: 700;
}

.profile-copy i {
  width: 1px;
  height: 10px;
  background: #cdd6e2;
}

.profile-copy em {
  color: #d73333;
  font-size: 0.64rem;
  font-style: italic;
}

.student-code {
  border-radius: 6px;
  background: #e6f0ff;
  color: #3d87e7;
  padding: 2px 7px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 850;
}

.state-badge {
  flex-shrink: 0;
  border-radius: 6px;
  padding: 3px 6px;
  color: #fff;
  font-size: 0.52rem;
  font-weight: 850;
  letter-spacing: 0.06em;
}

.state-badge.red {
  background: #ff4d38;
}

.state-badge.orange {
  background: #f59e0b;
}

.profile-top-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
}

.danger-icon-button,
.plain-icon-button {
  display: flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9px;
  background: #fff;
  color: #66728a;
  transition: background 150ms ease, color 150ms ease;
}

.danger-icon-button {
  background: #fff1f0;
  color: #ff4d38;
}

.danger-icon-button:hover {
  background: #ffe2de;
}

.plain-icon-button:hover {
  background: #f2f5f8;
  color: #172841;
}

.profile-actions {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  overflow: visible;
  padding-top: 8px;
  scrollbar-width: none;
}

.profile-actions::-webkit-scrollbar,
.account-table-wrap::-webkit-scrollbar {
  display: none;
}

.profile-actions .btn {
  min-width: 102px;
  border-radius: 8px;
}

.profile-actions .btn-ghost {
  min-width: auto;
  color: #35435d;
}

.action-pay {
  min-width: 116px;
}

.action-divider {
  width: 1px;
  height: 22px;
  flex-shrink: 0;
  background: #dfe6ef;
}

.siblings-card {
  flex-shrink: 0;
  padding: 8px 12px;
}

.siblings-card h4 {
  margin: 0 0 6px;
  color: #2d65a5;
  font-size: 0.62rem;
  font-weight: 850;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.siblings-card div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.siblings-card button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid #cfe0f8;
  border-radius: 999px;
  background: #fff;
  color: #2d65a5;
  padding: 4px 8px;
  font-size: 0.66rem;
  font-weight: 750;
  transition: background 150ms ease, color 150ms ease;
}

.siblings-card button:hover {
  background: #2d65a5;
  color: #fff;
}

.account-card {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.account-header {
  display: flex;
  height: 40px;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
}

.account-header h3 {
  margin: 0;
  color: #263752;
  font-size: 0.74rem;
  font-weight: 850;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.account-header div {
  border-radius: 7px;
  background: #fff0f1;
  color: #ff2f38;
  padding: 5px 12px;
  font-size: 0.74rem;
  font-weight: 850;
}

.account-table-wrap {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 0 10px;
  scrollbar-width: none;
}

.account-table-wrap table {
  min-width: 640px;
  border-collapse: separate;
  border-spacing: 0;
}

.account-table-wrap thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  border: 0;
  border-bottom: 1px solid #e3e9f0;
  background: #f6f8fb;
  color: #5d6980;
  font-size: 0.58rem;
  font-weight: 850;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.account-table-wrap thead th:first-child {
  border-top-left-radius: 8px;
}

.account-table-wrap thead th:last-child {
  border-top-right-radius: 8px;
}

.account-table-wrap td,
.account-table-wrap th {
  padding: 6px 8px;
}

.account-table-wrap td {
  border-bottom: 1px solid #e8eef5;
  color: #253550;
  font-size: 0.7rem;
}

.debt-row {
  transition: background 150ms ease;
}

.debt-row:hover,
.debt-row.selected {
  background: #f8fbf9;
}

.check-cell {
  width: 34px;
  text-align: center;
}

.debt-check {
  width: 13px;
  height: 13px;
  border-radius: 4px;
  border-color: #c9d3df;
  color: #65a744;
  cursor: pointer;
}

.progress-cell {
  width: 100px;
}

.progress-track {
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: #e7eaee;
}

.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width 200ms ease;
}

.progress-cell em {
  display: block;
  margin-top: 3px;
  color: #6a7488;
  font-size: 0.58rem;
  font-style: normal;
  font-weight: 750;
  text-align: right;
}

.account-table-wrap td strong {
  display: block;
  max-width: 240px;
  overflow: hidden;
  color: #263752;
  font-size: 0.7rem;
  font-weight: 850;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-table-wrap td small {
  display: block;
  margin-top: 2px;
  color: #68748a;
  font-size: 0.58rem;
  font-weight: 850;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.recargo-badge {
  margin-left: 6px;
  border-radius: 999px;
  background: #fff2d8;
  color: #b26a0f;
  padding: 1px 5px;
  font-size: 0.52rem;
}

.money-cell {
  color: #5f6d84;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.68rem;
  font-weight: 850;
  text-align: right;
  white-space: nowrap;
}

.money-cell.paid {
  color: #2e7b34;
}

.money-cell.danger {
  color: #ff2f38;
}

.menu-cell {
  width: 34px;
  text-align: center;
}

.menu-cell button {
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: #eef8f6;
  color: #437c8a;
}

.account-empty {
  height: 96px;
  text-align: center;
  color: #66728a;
  font-weight: 750;
}

.account-empty.muted {
  color: #9aa5b7;
}

.history-row > td {
  background: #f8fafc;
  padding: 8px;
}

.history-table {
  overflow: hidden;
  border: 1px solid #dfe6ef;
  border-radius: 10px;
  background: #fff;
}

.history-table th,
.history-table td {
  font-size: 0.62rem;
}

.folio {
  color: #397fe8;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 850;
}

.method-pill {
  border-radius: 6px;
  background: #f2f5f8;
  padding: 3px 7px;
}

.history-actions {
  display: flex;
  justify-content: center;
  gap: 6px;
}

.history-actions .btn {
  height: 24px;
}

.account-footer {
  display: flex;
  height: 32px;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  color: #66728a;
  font-size: 0.68rem;
  font-weight: 650;
}

@media (max-width: 1220px) {
  .profile-main {
    align-items: stretch;
  }

  .profile-actions {
    gap: 9px;
  }

  .profile-actions .btn {
    min-width: auto;
  }
}

@media (max-height: 900px) and (min-width: 1081px) {
  .student-details-shell {
    gap: 8px;
  }

  .student-profile-card {
    padding: 10px 14px 9px;
  }

  .profile-avatar {
    width: 44px;
    height: 44px;
    font-size: 1rem;
  }

  .profile-copy h2 {
    font-size: 0.94rem;
  }

  .profile-copy p {
    margin-top: 4px;
    font-size: 0.66rem;
  }

  .profile-actions {
    padding-top: 7px;
  }

  .profile-actions .btn {
    height: 30px;
  }

  .account-header {
    height: 38px;
  }

  .account-table-wrap td,
  .account-table-wrap th {
    padding-top: 5px;
    padding-bottom: 5px;
  }

  .account-footer {
    height: 30px;
  }
}
</style>
