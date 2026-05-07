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

</style>
