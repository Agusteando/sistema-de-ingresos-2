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
              <template v-if="student.matriculaAnterior">
                <i></i>
                Ant. {{ student.matriculaAnterior }}
              </template>
              <template v-if="student.matriculaSiguiente">
                <i></i>
                Sig. {{ student.matriculaSiguiente }}
              </template>
              <em v-if="student.estatus !== 'Activo'">(Motivo: {{ student.estatus }})</em>
            </p>
            <div v-if="student.customSections?.length" class="detail-section-badges">
              <b v-for="section in student.customSections" :key="`detail-section-${student.matricula}-${section.id}`">{{ section.name }}</b>
            </div>
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
        <button v-if="student.estatus === 'Activo' && !isEnrolled" class="btn btn-secondary btn-sm" :disabled="enrolling" @click="quickEnroll">
          <LucideLoader2 v-if="enrolling" class="animate-spin" :size="15"/>
          <LucideFilePlus v-else :size="15"/> Inscribir
        </button>
        <span class="action-divider"></span>
        <button class="btn btn-ghost btn-sm" @click="$emit('edit', student)">
          <LucideSettings :size="15"/> Editar
        </button>
        <button class="btn btn-ghost btn-sm" @click="$emit('manage-sections', student)">
          <LucideTags :size="15"/> Secciones
        </button>
        <button class="btn btn-ghost btn-sm" @click="printBeca">
          <LucideAward :size="15"/> Carta beca
        </button>
        <button class="btn btn-ghost btn-sm" :disabled="reminding || !validDebts.length || !student.correo" @click="sendReminder">
          <LucideLoader2 v-if="reminding" class="animate-spin" :size="15"/>
          <LucideBell v-else :size="15"/> Enviar aviso
        </button>
      </div>
    </section>

    <section v-if="siblings.length" class="siblings-card">
      <div class="siblings-header">
        <h4>Familia / Hermanos</h4>
        <button class="siblings-clear" title="Limpiar vinculos" @click="clearSiblingLinks">
          <LucideUndo :size="12" /> Limpiar
        </button>
      </div>
      <div class="siblings-list">
        <button v-for="sib in siblings" :key="sib.matricula" @click="$emit('switch-student', sib.matricula)">
          <LucideUsers :size="13" /> {{ sib.nombreCompleto }} ({{ sib.grado }})
        </button>
      </div>
    </section>

    <section class="account-card">
      <div class="account-header">
        <h3>Estado de Cuenta</h3>
        <div class="account-totals">
          <span>Deuda: ${{ format(validDebts.reduce((acc,d) => acc + d.saldo, 0)) }}</span>
        </div>
      </div>

      <Transition name="account-flow" mode="out-in">
      <div class="account-table-wrap" :key="student.matricula">
        <table>
          <colgroup>
            <col class="col-check" />
            <col class="col-progress" />
            <col class="col-concept" />
            <col class="col-money" />
            <col class="col-money" />
            <col class="col-money" />
            <col class="col-actions" />
          </colgroup>
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
            <tr v-if="loading">
              <td colspan="7" class="account-empty">
                <span class="liquid-loader small" aria-hidden="true"><i></i><i></i><i></i></span>
                Cargando estado de cuenta...
              </td>
            </tr>
            <tr v-else-if="!debts.length"><td colspan="7" class="account-empty muted">Sin adeudos o documentos registrados en este ciclo escolar.</td></tr>
            <template v-else v-for="debt in debts" :key="`${debt.documento}-${debt.mes}`">
              <tr
                :class="{ selected: selectedDebts.includes(debt), cleared: Number(debt.pagosDepurados) > 0 && debt.saldo <= 0 }"
                class="debt-row"
                @contextmenu.prevent="showDebtContextMenu($event, debt)"
              >
                <td class="check-cell"><input type="checkbox" :value="debt" v-model="selectedDebts" :disabled="debt.saldo <= 0" class="debt-check"></td>
                <td class="progress-cell">
                  <div class="progress-track">
                    <span class="paid-progress" :style="{ width: progressPaidWidth(debt), backgroundColor: progressColor(debt) }"></span>
                    <span v-if="Number(debt.pagosDepurados) > 0" class="cleanup-progress" :style="{ width: progressCleanupWidth(debt) }"></span>
                  </div>
                  <em :class="{ complete: debt.saldo <= 0 }">{{ progressStatusLabel(debt) }}</em>
                </td>
                <td class="concept-cell">
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
                  <button @click="openConceptChange(debt)" title="Ajustar concepto">
                    <LucideSettings :size="16"/>
                  </button>
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
                        <td><span :class="['method-pill', h.depurado ? 'cleanup' : '']">{{ h.formaDePago }}</span></td>
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
      </Transition>

      <div class="account-footer">
        <span>{{ accountFooterLabel }}</span>
      </div>
    </section>

    <PaymentModal v-if="showPaymentModal" :debts="selectedDebts" :student="student" @close="showPaymentModal = false" @success="handleSuccess" />
    <DocumentModal v-if="showDocModal" :student="student" @close="showDocModal = false" @success="handleSuccess" />
    <InvoiceModal v-if="showInvoiceModal" :debts="selectedDebts" :student="student" @close="showInvoiceModal = false" @success="handleSuccess" />
    <ConceptChangeModal v-if="showConceptModal" :debt="selectedConceptDebt" @close="closeConceptModal" @success="handleSuccess" />
  </div>
</template>

<script>
// Photo requests stay detail-only: opening Estado de Cuenta resolves the photo,
// then the matrícula-keyed session cache lets the list reuse it later.
const studentPhotoRequests = new Map()
</script>

<script setup>
import { ref, computed, watch } from 'vue'
import { LucideCreditCard, LucideFileText, LucideFilePlus, LucideHistory, LucideSettings, LucideBell, LucidePrinter, LucideUndo, LucideAward, LucideUsers, LucideX, LucideUserX, LucideLoader2, LucideShieldCheck, LucideTags } from 'lucide-vue-next'
import { useState, useCookie } from '#app'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'
import { useOptimisticSync } from '~/composables/useOptimisticSync'
import { normalizeCicloKey } from '~/shared/utils/ciclo'
import PaymentModal from './PaymentModal.vue'
import DocumentModal from './DocumentModal.vue'
import InvoiceModal from './InvoiceModal.vue'
import ConceptChangeModal from './ConceptChangeModal.vue'

const props = defineProps({ student: Object, isEnrolled: { type: Boolean, default: true } })
const emit = defineEmits(['refresh', 'edit', 'close', 'switch-student', 'baja', 'photo-loaded', 'manage-sections'])
const { show } = useToast()
const { openMenu } = useContextMenu()
const { executeOptimistic } = useOptimisticSync()
const state = useState('globalState')

const debts = ref([])
const siblings = ref([])
const siblingSource = ref('none')
const loading = ref(false)
const enrolling = ref(false)
const reminding = ref(false)
const selectedDebts = ref([])
const expandedHistory = ref(null)
const depurandoDebt = ref(null)

const photoUrl = ref(null)
const photoLoading = ref(false)

const showPaymentModal = ref(false)
const showDocModal = ref(false)
const showInvoiceModal = ref(false)
const showConceptModal = ref(false)
const selectedConceptDebt = ref(null)

const format = (val) => Number(val || 0).toFixed(2)
const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'AL'
const normalizePhotoMatricula = (value) => String(value || '').trim().toUpperCase()
const photoStorageKey = (matricula) => `foto_${normalizePhotoMatricula(matricula)}`
const validDebts = computed(() => debts.value.filter(d => d.saldo > 0))
const accountFooterLabel = computed(() => {
  if (!debts.value.length) return 'Sin conceptos en este ciclo'
  if (debts.value.length > 5) return `${debts.value.length} conceptos; desplaza la tabla para ver mas`
  return `${debts.value.length} conceptos visibles`
})

const progressPaidWidth = (debt) => `${Math.min(100, Number(debt.porcentajePagoReal ?? debt.porcentajePagado) || 0)}%`
const progressCleanupWidth = (debt) => `${Math.min(100, Number(debt.porcentajeDepurado) || 0)}%`
const progressColor = (debt) => Number(debt.porcentajePagado) >= 100 && Number(debt.pagosDepurados) <= 0 ? '#70b34f' : '#d8b449'
const progressStatusLabel = (debt) => {
  if (Number(debt.pagosDepurados) > 0 && debt.saldo <= 0) return '100% resuelto'
  if (Number(debt.porcentajePagado) >= 100) return '100% pagado'
  return `${debt.porcentajePagado}%`
}

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
    const res = await $fetch(`/api/students/${props.student.matricula}/siblings`, {
      params: { ciclo: normalizeCicloKey(state.value.ciclo) }
    })
    siblings.value = Array.isArray(res) ? res : (res?.siblings || [])
    siblingSource.value = Array.isArray(res) ? 'legacy' : (res?.source || 'none')
  } catch(e) {}
}

const clearSiblingLinks = async () => {
  if (!siblings.value.length || siblingSource.value !== 'local') return
  if (!confirm('Limpiar los vinculos familiares locales de este grupo?')) return

  try {
    await $fetch(`/api/students/${props.student.matricula}/siblings`, { method: 'DELETE' })
    siblings.value = []
    siblingSource.value = 'none'
    show('Vinculos familiares limpiados', 'success')
    emit('refresh')
  } catch (e) {
    show('Error al limpiar vinculos familiares', 'danger')
  }
}

const quickEnroll = async () => {
  enrolling.value = true
  try {
    const cicloKey = normalizeCicloKey(state.value.ciclo)
    const res = await $fetch(`/api/students/${props.student.matricula}/enroll`, {
      method: 'POST',
      body: { ciclo: cicloKey }
    })
    if (res?.inserted > 0) {
      show(`Inscripcion agregada (${res.inserted})`, 'success')
    } else {
      show('El alumno ya tenia conceptos de inscripcion', 'success')
    }
    loadDebts()
    emit('refresh')
  } catch (e) {
    show(e?.data?.message || 'No se pudo inscribir al alumno', 'danger')
  } finally {
    enrolling.value = false
  }
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
  reminding.value = true

  try {
    await executeOptimistic(
      () => $fetch('/api/reminders/send', { method: 'POST', body: { correo: props.student.correo, asunto: 'Recordatorio de pago - Estado de Cuenta', mensaje: `Le recordamos amablemente que el alumno presenta un saldo pendiente de $${total.toFixed(2)} MXN.` } }),
      () => {},
      () => {},
      { pending: 'Enviando aviso...', success: 'Aviso enviado', error: 'Error al enviar' }
    )
  } finally {
    reminding.value = false
  }
}

const debtKey = (debt) => `${debt.documento}-${debt.mes}`
const canDepurarDebt = (debt) => (
  debt &&
  Number(debt.saldo || 0) > 0 &&
  Number(debt.pagos ?? 0) > 0
)

const requestDepuracion = async (debt) => {
  if (!canDepurarDebt(debt)) {
    return show('La depuración solo completa conceptos con avance previo y saldo pendiente.', 'danger')
  }

  if (depurandoDebt.value) return

  const saldo = Number(debt.saldo || 0)
  const message = `La depuración completará el saldo restante de ${debt.conceptoNombre} (${debt.mesLabel}) por $${saldo.toFixed(2)}. No se registrará como pago ordinario y requiere código de autorización por Telegram.`

  if (!confirm(message)) return

  const motivo = prompt('Motivo de depuración:')
  if (!motivo) return

  depurandoDebt.value = debtKey(debt)

  try {
    const request = await $fetch('/api/payments/audit', {
      method: 'POST',
      body: {
        action: 'request',
        matricula: props.student.matricula,
        documento: debt.documento,
        mes: debt.mes,
        ciclo: normalizeCicloKey(state.value.ciclo),
        conceptoNombre: debt.conceptoNombre,
        mesLabel: debt.mesLabel,
        subtotal: debt.subtotal,
        saldo: debt.saldo,
        pagos: debt.resuelto ?? debt.pagos,
        pagosRegistrados: debt.pagos,
        hasRecargo: debt.hasRecargo,
        motivo
      }
    })

    const input = prompt('Ingresa el código de depuración de 5 dígitos enviado por Telegram:')
    if (!input) return show('Depuración cancelada', 'danger')

    await $fetch('/api/payments/audit', {
      method: 'POST',
      body: {
        action: 'confirm',
        requestId: request.requestId,
        code: String(input).trim()
      }
    })

    show('Saldo depurado y progreso completado', 'success')
    await loadDebts()
    emit('refresh')
  } catch (e) {
    show(e?.data?.message || 'No se pudo aplicar la depuración', 'danger')
  } finally {
    depurandoDebt.value = null
  }
}

const openConceptChange = (debt) => {
  selectedConceptDebt.value = debt
  showConceptModal.value = true
}

const closeConceptModal = () => {
  showConceptModal.value = false
  selectedConceptDebt.value = null
}

const showDebtContextMenu = (event, debt) => {
  const canPay = debt.saldo > 0
  const menuItems = [
    { label: canPay ? 'Pagar este concepto' : 'Completado', icon: LucideCreditCard, disabled: !canPay, action: () => { selectedDebts.value = [debt]; showPaymentModal.value = true } },
    { label: 'Facturar', icon: LucideFileText, action: () => { selectedDebts.value = [debt]; showInvoiceModal.value = true } },
    { label: 'Historial', icon: LucideHistory, action: () => toggleHistory(debt) },
    { label: '-' }
  ]

  if (canDepurarDebt(debt)) {
    menuItems.push({
      label: depurandoDebt.value === debtKey(debt) ? 'Depurando saldo...' : 'Depurar saldo restante',
      icon: LucideShieldCheck,
      disabled: Boolean(depurandoDebt.value),
      action: () => requestDepuracion(debt)
    })
    menuItems.push({ label: '-' })
  }

  menuItems.push({ label: 'Ajustar concepto', icon: LucideSettings, action: () => openConceptChange(debt) })
  openMenu(event, menuItems)
}

const handleSuccess = () => {
  showPaymentModal.value = false; showDocModal.value = false; showInvoiceModal.value = false; closeConceptModal()
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
  gap: 6px;
  overflow: hidden;
}

.student-profile-card,
.siblings-card,
.account-card {
  border: 1px solid #e3eaf2;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 5px 18px rgba(22, 38, 65, 0.032);
}

.student-profile-card {
  flex-shrink: 0;
  overflow: hidden;
  border-color: #d9e6d2;
  padding: 8px 12px;
  box-shadow: 0 8px 24px rgba(45, 78, 48, 0.045);
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
  gap: 10px;
}

.profile-identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.profile-avatar {
  display: flex;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 999px;
  border: 1px solid rgba(151, 205, 132, 0.34);
  background: #edf5e9;
  color: #517947;
  font-size: 1.12rem;
  font-weight: 700;
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
  color: #23324a;
  font-size: 0.94rem;
  font-weight: 740;
  letter-spacing: 0;
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
  margin: 3px 0 0;
  color: #788397;
  font-size: 0.66rem;
  font-weight: 500;
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
  color: #416fa8;
  padding: 2px 7px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 700;
}

.state-badge {
  flex-shrink: 0;
  border-radius: 6px;
  padding: 3px 6px;
  color: #fff;
  font-size: 0.52rem;
  font-weight: 720;
  letter-spacing: 0.04em;
}

.state-badge.red {
  background: #c95b4d;
}

.state-badge.orange {
  background: #c8892e;
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
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9px;
  background: #fff;
  color: #7a8698;
  transition: background 150ms ease, color 150ms ease;
}

.danger-icon-button {
  background: #fff3f1;
  color: #bd5a4f;
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
  gap: 6px;
  flex-wrap: wrap;
  overflow: visible;
  padding-top: 6px;
  scrollbar-width: none;
}

.profile-actions::-webkit-scrollbar {
  display: none;
}

.profile-actions .btn {
  min-width: 96px;
  border-radius: 8px;
}

.profile-actions .btn-ghost {
  min-width: auto;
  color: #566176;
}

.action-pay {
  min-width: 108px;
}

.action-divider {
  width: 1px;
  height: 20px;
  flex-shrink: 0;
  background: #dfe6ef;
}

.siblings-card {
  flex-shrink: 0;
  border-color: #edf2f6;
  background: rgba(255, 255, 255, 0.7);
  box-shadow: none;
  padding: 8px 12px;
}

.siblings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.siblings-card h4 {
  margin: 0 0 6px;
  color: #64748b;
  font-size: 0.62rem;
  font-weight: 680;
  letter-spacing: 0.045em;
  text-transform: uppercase;
}

.siblings-header h4 {
  margin-bottom: 0;
}

.siblings-clear {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  background: #fff;
  color: #7a8698;
  padding: 3px 7px;
  font-size: 0.6rem;
  font-weight: 650;
}

.siblings-clear:hover {
  background: #f8fafc;
  color: #b84f56;
}

.siblings-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.siblings-card button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid #dbe5f0;
  border-radius: 999px;
  background: #fff;
  color: #516174;
  padding: 4px 8px;
  font-size: 0.66rem;
  font-weight: 550;
  transition: background 150ms ease, color 150ms ease;
}

.siblings-card button:hover {
  background: #eef5fb;
  color: #315f8b;
}

.account-card {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  border-color: #dbe6d4;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 10px 28px rgba(22, 38, 65, 0.05);
}

.account-header {
  display: flex;
  height: 42px;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px;
}

.account-header h3 {
  margin: 0;
  color: #263752;
  font-size: 0.74rem;
  font-weight: 740;
  letter-spacing: 0.025em;
  text-transform: uppercase;
}

.account-totals {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 7px;
}

.account-totals > span {
  border-radius: 7px;
  background: #fff4f4;
  color: #b84f56;
  padding: 4px 10px;
  font-size: 0.74rem;
  font-weight: 720;
}

.account-table-wrap {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 0 10px 6px;
  scrollbar-color: #cbd5e1 transparent;
  scrollbar-width: thin;
}

.account-table-wrap table {
  width: 100%;
  min-width: 760px;
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
  color: #687386;
  font-size: 0.56rem;
  font-weight: 680;
  letter-spacing: 0.045em;
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
  color: #334159;
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
  width: 112px;
}

.progress-track {
  display: flex;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: #e7eaee;
}

.progress-track span {
  display: block;
  height: 100%;
  transition: width 200ms ease;
}

.progress-track span:first-child {
  border-radius: 999px 0 0 999px;
}

.progress-track span:last-child {
  border-radius: 0 999px 999px 0;
}

.progress-track span:only-child {
  border-radius: 999px;
}

.progress-track .cleanup-progress {
  background: repeating-linear-gradient(135deg, #35b6a4 0, #35b6a4 4px, #60a5fa 4px, #60a5fa 8px);
}

.progress-cell em {
  display: block;
  margin-top: 3px;
  color: #7f8999;
  font-size: 0.58rem;
  font-style: normal;
  font-weight: 500;
  text-align: right;
}

.progress-cell em.complete {
  color: #287b74;
  font-weight: 680;
}

.debt-row.cleared {
  background: linear-gradient(90deg, rgba(226, 245, 241, 0.68), rgba(255, 255, 255, 0.96));
}

.account-table-wrap td strong {
  display: block;
  max-width: 320px;
  overflow: hidden;
  color: #2f3d55;
  font-size: 0.7rem;
  font-weight: 680;
  line-height: 1.18;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-table-wrap td small {
  display: block;
  margin-top: 2px;
  color: #7b8798;
  font-size: 0.62rem;
  font-weight: 520;
  letter-spacing: 0.025em;
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
  color: #627086;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.65rem;
  font-weight: 680;
  text-align: right;
  white-space: nowrap;
}

.money-cell.paid {
  color: #477a49;
}

.money-cell.danger {
  color: #b84f56;
}

.menu-cell {
  width: 64px;
  text-align: center;
}

.account-table-wrap td.menu-cell {
  display: flex;
  justify-content: center;
  gap: 4px;
}

.menu-cell button {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #7f8a9b;
  opacity: 0.58;
  transition: background 150ms ease, color 150ms ease, opacity 150ms ease;
}

.menu-cell button:hover {
  background: #eef8f6;
  color: #437c8a;
  opacity: 1;
}

.account-empty {
  height: 72px;
  text-align: center;
  color: #66728a;
  font-weight: 500;
}

.account-empty.muted {
  color: #9aa5b7;
}

.history-row > td {
  background: #f8fafc;
  padding: 6px;
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
  font-weight: 680;
}

.method-pill {
  border-radius: 6px;
  background: #f2f5f8;
  padding: 3px 7px;
}

.method-pill.cleanup {
  background: #e5f7f3;
  color: #267a66;
}

.history-actions {
  display: flex;
  justify-content: center;
  gap: 6px;
}

.history-actions .btn {
  height: 24px;
}

.account-flow-enter-active,
.account-flow-leave-active {
  transition: opacity 220ms ease, transform 220ms ease;
}

.account-flow-enter-from,
.account-flow-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.account-footer {
  display: flex;
  height: 28px;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  color: #7d8798;
  font-size: 0.68rem;
  font-weight: 450;
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
    gap: 5px;
  }

  .student-profile-card {
    padding: 7px 12px;
  }

  .profile-avatar {
    width: 38px;
    height: 38px;
    font-size: 0.94rem;
  }

  .profile-copy h2 {
    font-size: 0.9rem;
  }

  .profile-copy p {
    margin-top: 2px;
    font-size: 0.63rem;
  }

  .profile-actions {
    padding-top: 5px;
  }

  .profile-actions .btn {
    height: 28px;
  }

  .account-header {
    height: 36px;
  }

  .account-table-wrap td,
  .account-table-wrap th {
    padding-top: 5px;
    padding-bottom: 5px;
  }

  .account-footer {
    height: 24px;
  }
}

.detail-section-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;
}

.detail-section-badges b {
  display: inline-flex;
  max-width: 150px;
  align-items: center;
  overflow: hidden;
  border: 1px solid #d8d5f0;
  border-radius: 999px;
  background: #f4f2ff;
  color: #5d4b9a;
  padding: 3px 7px;
  font-size: 0.6rem;
  font-weight: 720;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}



/* v12 detail scaling: account view remains complete without squeezing */
.student-details-shell {
  container-type: inline-size;
  width: 100% !important;
  min-width: 0 !important;
  overflow: hidden !important;
  gap: clamp(8px, 1vw, 12px) !important;
  padding: clamp(8px, 1vw, 12px) !important;
}

.student-profile-card,
.siblings-card,
.account-card {
  border-radius: 18px !important;
  border-color: #e2ebf5 !important;
  background: rgba(255,255,255,0.98) !important;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.045) !important;
}

.student-profile-card {
  padding: clamp(10px, 1.1vw, 16px) clamp(12px, 1.3vw, 18px) !important;
}

.profile-main {
  gap: 14px !important;
}

.profile-identity {
  gap: 12px !important;
}

.profile-avatar {
  width: clamp(42px, 4vw, 58px) !important;
  height: clamp(42px, 4vw, 58px) !important;
}

.profile-copy h2 {
  font-size: clamp(0.95rem, 1.18vw, 1.18rem) !important;
  color: #172b55 !important;
}

.profile-copy p {
  gap: 8px !important;
  font-size: clamp(0.64rem, 0.75vw, 0.74rem) !important;
}

.profile-actions {
  gap: 8px !important;
  flex-wrap: nowrap !important;
  overflow-x: auto !important;
  padding-top: 10px !important;
  padding-bottom: 2px !important;
}

.profile-actions .btn {
  height: 32px !important;
  flex: 0 0 auto !important;
  border-radius: 999px !important;
}

.siblings-card {
  padding: 10px 14px !important;
}

.account-card {
  min-height: 0 !important;
  border-color: #dce8f4 !important;
  overflow: hidden !important;
}

.account-header {
  height: auto !important;
  min-height: 52px !important;
  padding: 10px 16px !important;
  border-bottom: 1px solid #e7eef6 !important;
  background: linear-gradient(180deg, #ffffff, #f8fbff) !important;
}

.account-header h3 {
  color: #172b55 !important;
  font-size: clamp(0.84rem, 1vw, 1rem) !important;
  letter-spacing: 0.01em !important;
  text-transform: none !important;
}

.account-totals > span {
  border: 1px solid #f2d6d8 !important;
  border-radius: 999px !important;
  background: #fff5f5 !important;
  padding: 6px 12px !important;
  font-size: clamp(0.72rem, 0.82vw, 0.82rem) !important;
}

.account-table-wrap {
  min-width: 0 !important;
  overflow: auto !important;
  padding: 10px 12px 12px !important;
}

.account-table-wrap table {
  width: 100% !important;
  min-width: min(760px, 100%) !important;
  border-collapse: separate !important;
  border-spacing: 0 6px !important;
}

.account-table-wrap thead th {
  top: 0 !important;
  height: 34px !important;
  border-bottom: 0 !important;
  background: #f5f8fc !important;
  color: #66758b !important;
  font-size: 0.58rem !important;
}

.account-table-wrap td,
.account-table-wrap th {
  padding: 8px 9px !important;
}

.account-table-wrap tbody tr.debt-row {
  background: #ffffff !important;
  box-shadow: 0 1px 0 #e9eef5 !important;
}

.account-table-wrap tbody tr.debt-row:hover,
.account-table-wrap tbody tr.debt-row.selected {
  background: #f7fbff !important;
}

.account-table-wrap td {
  border-bottom: 1px solid #eef3f8 !important;
  font-size: clamp(0.68rem, 0.76vw, 0.76rem) !important;
}

.account-table-wrap td strong {
  max-width: clamp(180px, 26vw, 360px) !important;
  color: #1f314f !important;
  font-size: clamp(0.72rem, 0.8vw, 0.82rem) !important;
}

.money-cell {
  font-size: clamp(0.64rem, 0.72vw, 0.74rem) !important;
}

.progress-cell {
  width: clamp(88px, 10vw, 120px) !important;
}

.menu-cell {
  width: 70px !important;
}

.account-footer {
  height: 34px !important;
  padding: 0 16px !important;
  border-top: 1px solid #edf2f7 !important;
  background: #fbfdff !important;
}

@container (max-width: 700px) {
  .profile-main {
    align-items: flex-start !important;
  }

  .profile-actions {
    flex-wrap: nowrap !important;
  }

  .account-table-wrap table {
    min-width: 680px !important;
  }
}

@media (max-width: 820px) {
  .student-details-shell {
    padding: 8px !important;
  }

  .student-profile-card,
  .account-card,
  .siblings-card {
    border-radius: 16px !important;
  }

  .profile-actions {
    overflow-x: auto !important;
  }

  .account-table-wrap table {
    min-width: 680px !important;
  }
}



/* Premium SaaS polish: calmer, more trustworthy Estado de Cuenta table. */
.account-card {
  border: 1px solid rgba(220, 232, 244, 0.96) !important;
  border-radius: 18px !important;
  background: linear-gradient(180deg, rgba(255,255,255,0.99), rgba(250,252,255,0.98)) !important;
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255,255,255,0.78) !important;
}

.account-header {
  min-height: 58px !important;
  padding: 13px 18px 12px !important;
  border-bottom: 1px solid rgba(226, 235, 245, 0.92) !important;
  background: linear-gradient(180deg, #ffffff, #f9fbfe) !important;
}

.account-header h3 {
  color: #132747 !important;
  font-size: clamp(0.86rem, 0.98vw, 1rem) !important;
  font-weight: 820 !important;
  letter-spacing: 0.002em !important;
  text-transform: none !important;
}

.account-totals {
  align-items: center !important;
}

.account-totals > span {
  border: 1px solid rgba(241, 194, 198, 0.92) !important;
  border-radius: 999px !important;
  background: linear-gradient(180deg, #fff8f8, #fff1f2) !important;
  color: #bd3e48 !important;
  padding: 7px 13px !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.86) !important;
  font-size: clamp(0.72rem, 0.8vw, 0.82rem) !important;
  font-weight: 820 !important;
  line-height: 1 !important;
}

.account-table-wrap {
  padding: 12px 14px 10px !important;
  background: linear-gradient(180deg, rgba(255,255,255,0.64), rgba(248,251,255,0.7)) !important;
}

.account-table-wrap table {
  width: 100% !important;
  min-width: min(790px, 100%) !important;
  border-collapse: separate !important;
  border-spacing: 0 !important;
  table-layout: fixed !important;
}

.account-table-wrap col.col-check { width: 36px !important; }
.account-table-wrap col.col-progress { width: 124px !important; }
.account-table-wrap col.col-concept { width: auto !important; }
.account-table-wrap col.col-money { width: 112px !important; }
.account-table-wrap col.col-actions { width: 72px !important; }

.account-table-wrap thead th {
  height: 38px !important;
  border-top: 1px solid #edf2f8 !important;
  border-bottom: 1px solid #e2eaf3 !important;
  background: linear-gradient(180deg, #f8fbff, #f3f7fc) !important;
  color: #65748a !important;
  padding: 0 12px !important;
  font-size: 0.58rem !important;
  font-weight: 820 !important;
  letter-spacing: 0.052em !important;
  text-align: left !important;
  text-transform: uppercase !important;
}

.account-table-wrap thead th:first-child {
  border-left: 1px solid #edf2f8 !important;
  border-top-left-radius: 12px !important;
}

.account-table-wrap thead th:last-child {
  border-right: 1px solid #edf2f8 !important;
  border-top-right-radius: 12px !important;
}

.account-table-wrap thead th.money-cell {
  text-align: right !important;
}

.account-table-wrap tbody tr.debt-row {
  background: rgba(255, 255, 255, 0.98) !important;
  box-shadow: none !important;
}

.account-table-wrap tbody tr.debt-row:hover,
.account-table-wrap tbody tr.debt-row.selected {
  background: linear-gradient(90deg, rgba(249,252,255,0.99), rgba(246,251,246,0.96)) !important;
}

.account-table-wrap td,
.account-table-wrap th {
  padding: 10px 12px !important;
}

.account-table-wrap td {
  border-bottom: 1px solid rgba(230, 237, 246, 0.98) !important;
  color: #30405b !important;
  font-size: clamp(0.7rem, 0.76vw, 0.78rem) !important;
  vertical-align: middle !important;
}

.account-table-wrap tbody tr.debt-row:first-of-type td {
  border-top: 0 !important;
}

.check-cell {
  width: 36px !important;
  padding-left: 10px !important;
  padding-right: 6px !important;
  text-align: center !important;
}

.debt-check {
  width: 14px !important;
  height: 14px !important;
  border-radius: 5px !important;
  accent-color: #5da043 !important;
}

.progress-cell {
  width: 124px !important;
}

.progress-track {
  height: 6px !important;
  border-radius: 999px !important;
  background: #e8edf3 !important;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.06) !important;
}

.progress-cell em {
  margin-top: 5px !important;
  color: #708096 !important;
  font-size: 0.58rem !important;
  font-weight: 700 !important;
  letter-spacing: 0 !important;
  line-height: 1 !important;
  text-align: right !important;
}

.progress-cell em.complete {
  color: #257a68 !important;
}

.concept-cell {
  min-width: 0 !important;
  padding-left: 14px !important;
}

.account-table-wrap td.concept-cell strong {
  display: block !important;
  max-width: 100% !important;
  overflow: hidden !important;
  color: #172a49 !important;
  font-size: clamp(0.72rem, 0.82vw, 0.86rem) !important;
  font-weight: 820 !important;
  letter-spacing: 0.002em !important;
  line-height: 1.18 !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

.account-table-wrap td.concept-cell small {
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  margin-top: 5px !important;
  color: #7c8798 !important;
  font-size: 0.62rem !important;
  font-weight: 680 !important;
  letter-spacing: 0.035em !important;
  line-height: 1 !important;
  text-transform: uppercase !important;
}

.money-cell {
  color: #283953 !important;
  font-variant-numeric: tabular-nums !important;
  font-size: clamp(0.68rem, 0.74vw, 0.78rem) !important;
  font-weight: 820 !important;
  letter-spacing: -0.01em !important;
  text-align: right !important;
}

.money-cell.paid {
  color: #2f7742 !important;
}

.money-cell.danger {
  color: #c83f47 !important;
}

.menu-cell {
  width: 72px !important;
  padding-left: 8px !important;
  padding-right: 10px !important;
  text-align: right !important;
}

.account-table-wrap td.menu-cell {
  display: flex !important;
  align-items: center !important;
  justify-content: flex-end !important;
  gap: 6px !important;
}

.menu-cell button {
  width: 26px !important;
  height: 26px !important;
  border: 1px solid transparent !important;
  border-radius: 999px !important;
  background: transparent !important;
  color: #7e8b9e !important;
  opacity: 0.68 !important;
}

.menu-cell button:hover {
  border-color: #dfe9f5 !important;
  background: #ffffff !important;
  color: #2f7254 !important;
  opacity: 1 !important;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.06) !important;
}

.account-footer {
  height: 30px !important;
  border-top: 1px solid rgba(231, 238, 247, 0.96) !important;
  background: rgba(251,253,255,0.9) !important;
  color: #768295 !important;
  padding: 0 18px !important;
}

@container (max-width: 700px) {
  .account-table-wrap table {
    min-width: 720px !important;
  }
}

@media (max-height: 900px) and (min-width: 1081px) {
  .account-header {
    min-height: 48px !important;
    padding-top: 9px !important;
    padding-bottom: 9px !important;
  }

  .account-table-wrap {
    padding-top: 8px !important;
  }

  .account-table-wrap td,
  .account-table-wrap th {
    padding-top: 8px !important;
    padding-bottom: 8px !important;
  }

  .account-footer {
    height: 26px !important;
  }
}

/* Master-detail account panel: compact hierarchy and a no-overflow financial table. */
.student-details-shell,
.student-details-shell * {
  letter-spacing: 0 !important;
}

.student-details-shell {
  gap: 8px !important;
  padding: 8px !important;
}

.student-profile-card {
  border-radius: 14px !important;
  padding: 10px 12px !important;
  box-shadow: none !important;
}

.profile-main {
  align-items: flex-start !important;
  gap: 10px !important;
}

.profile-identity {
  min-width: 0 !important;
  gap: 10px !important;
}

.profile-avatar {
  width: 42px !important;
  height: 42px !important;
  font-size: 0.92rem !important;
}

.profile-copy {
  min-width: 0 !important;
}

.profile-copy h2 {
  max-width: 100% !important;
  color: #14243d !important;
  font-size: 0.98rem !important;
  font-weight: 840 !important;
  line-height: 1.18 !important;
}

.profile-copy p {
  gap: 6px !important;
  margin-top: 3px !important;
  font-size: 0.62rem !important;
  line-height: 1.25 !important;
}

.profile-top-actions {
  gap: 5px !important;
}

.plain-icon-button,
.danger-icon-button {
  width: 30px !important;
  height: 30px !important;
  border-radius: 9px !important;
}

.detail-section-badges {
  display: none !important;
}

.profile-actions {
  gap: 6px !important;
  flex-wrap: nowrap !important;
  overflow-x: auto !important;
  padding-top: 8px !important;
  padding-bottom: 0 !important;
}

.profile-actions .btn {
  height: 29px !important;
  min-width: auto !important;
  flex: 0 0 auto !important;
  border-radius: 999px !important;
  padding-inline: 10px !important;
  font-size: 0.64rem !important;
}

.profile-actions .btn svg {
  width: 13px !important;
  height: 13px !important;
}

.action-pay {
  min-width: 92px !important;
}

.action-divider {
  height: 18px !important;
}

.siblings-card {
  border-radius: 12px !important;
  padding: 7px 10px !important;
  box-shadow: none !important;
}

.account-card {
  border-radius: 14px !important;
  box-shadow: none !important;
}

.account-header {
  min-height: 42px !important;
  padding: 8px 12px !important;
}

.account-header h3 {
  font-size: 0.84rem !important;
}

.account-totals > span {
  padding: 6px 10px !important;
  font-size: 0.68rem !important;
}

.account-table-wrap {
  overflow-x: hidden !important;
  overflow-y: auto !important;
  padding: 8px 10px 8px !important;
  background: #fff !important;
}

.account-table-wrap table {
  min-width: 0 !important;
  width: 100% !important;
  table-layout: fixed !important;
}

.account-table-wrap col.col-check { width: 28px !important; }
.account-table-wrap col.col-progress { width: 86px !important; }
.account-table-wrap col.col-concept { width: auto !important; }
.account-table-wrap col.col-money { width: 74px !important; }
.account-table-wrap col.col-actions { width: 54px !important; }

.account-table-wrap thead th {
  height: 30px !important;
  padding: 0 7px !important;
  font-size: 0.5rem !important;
  letter-spacing: 0 !important;
}

.account-table-wrap td,
.account-table-wrap th {
  padding: 7px 7px !important;
}

.account-table-wrap td {
  font-size: 0.66rem !important;
}

.check-cell {
  width: 28px !important;
  padding-left: 6px !important;
  padding-right: 4px !important;
}

.debt-check {
  width: 13px !important;
  height: 13px !important;
}

.progress-cell {
  width: 86px !important;
}

.progress-track {
  height: 5px !important;
}

.progress-cell em {
  margin-top: 4px !important;
  font-size: 0.52rem !important;
}

.concept-cell {
  padding-left: 8px !important;
}

.account-table-wrap td.concept-cell strong {
  max-width: 100% !important;
  font-size: 0.7rem !important;
  line-height: 1.15 !important;
}

.account-table-wrap td.concept-cell small {
  margin-top: 4px !important;
  gap: 4px !important;
  font-size: 0.54rem !important;
}

.recargo-badge {
  max-width: 54px !important;
  overflow: hidden !important;
  padding: 1px 4px !important;
  text-overflow: ellipsis !important;
}

.money-cell {
  font-size: 0.62rem !important;
  letter-spacing: 0 !important;
}

.menu-cell {
  width: 54px !important;
  padding-left: 4px !important;
  padding-right: 6px !important;
}

.account-table-wrap td.menu-cell {
  gap: 3px !important;
}

.menu-cell button {
  width: 22px !important;
  height: 22px !important;
}

.menu-cell button svg {
  width: 13px !important;
  height: 13px !important;
}

.history-row > td {
  padding: 5px !important;
}

.history-table th,
.history-table td {
  font-size: 0.58rem !important;
}

.account-footer {
  height: 24px !important;
  padding: 0 12px !important;
  font-size: 0.62rem !important;
}

@container (max-width: 640px) {
  .account-table-wrap col.col-progress { width: 72px !important; }
  .account-table-wrap col.col-money { width: 66px !important; }
  .account-table-wrap col.col-actions { width: 48px !important; }

  .account-table-wrap thead th,
  .account-table-wrap td,
  .account-table-wrap th {
    padding-left: 5px !important;
    padding-right: 5px !important;
  }

  .progress-cell em {
    text-align: left !important;
  }
}

.student-details-shell :is(.account-table-wrap, .profile-actions, .siblings-list) {
  scrollbar-color: color-mix(in srgb, #65a744 74%, #397fe8 26%) rgba(231, 239, 233, 0.96) !important;
  scrollbar-width: auto !important;
}

.student-details-shell :is(.account-table-wrap, .profile-actions, .siblings-list)::-webkit-scrollbar {
  width: 14px !important;
  height: 12px !important;
}

.student-details-shell :is(.account-table-wrap, .profile-actions, .siblings-list)::-webkit-scrollbar-track {
  border-radius: 999px !important;
  background: linear-gradient(180deg, #eef6ec, #edf2f8) !important;
}

.student-details-shell :is(.account-table-wrap, .profile-actions, .siblings-list)::-webkit-scrollbar-thumb {
  border: 3px solid transparent !important;
  border-radius: 999px !important;
  background: linear-gradient(180deg, #86c85b, #3e9b8c) padding-box !important;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.42) !important;
}

.student-details-shell :is(.account-table-wrap, .profile-actions, .siblings-list)::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #6ead4f, #2d8277) padding-box !important;
}


/* v18: Estado de Cuenta width is controlled by the workspace split.
   Keep this card stretched inside the detail panel so the student list gains
   space from the parent grid instead of from an internal centered shrink. */
.account-card {
  width: 100% !important;
  max-width: 100% !important;
  align-self: stretch !important;
}

</style>
