<template>
  <div class="student-details-shell">
    <section class="student-profile-card" :style="studentPresentationStyle(student)" :class="{ inactive: student.estatus !== 'Activo', unenrolled: !isEnrolled }">
      <div class="profile-main">
        <div class="profile-identity">
          <StudentAccountPhotoCard
            :student="student"
            :photo-url="photoUrl || ''"
            :photo-loading="photoLoading"
          />

          <div class="profile-copy">
            <h2 :title="student.nombreCompleto">
              <span v-if="student.estatus !== 'Activo'" class="state-badge red">BAJA</span>
              <span v-else-if="!isEnrolled" class="state-badge orange">NO INSCRITO</span>
              <span :class="student.estatus !== 'Activo' ? 'line-through decoration-red-400/50' : ''">{{ student.nombreCompleto }}</span>
            </h2>
            <p>
              <span class="student-code">{{ student.matricula }}</span>
              <i></i>
              {{ resolvedNivelLabel }} · {{ gradeVisualTitle(student) }}<template v-if="studentGroupLabel(student)"> · {{ studentGroupLabel(student) }}</template>
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
            <div class="tipo-ingreso-row">
              <span
                :class="['tipo-ingreso-badge', resolvedTipoIngreso.value]"
                :title="`${resolvedTipoIngresoLabel} en ${selectedCicloLabel}. ${resolvedTipoIngreso.reason}`"
              >
                <LucideBuilding2 v-if="resolvedTipoIngreso.value === 'interno'" :size="12" :stroke-width="2.4" />
                <LucideGlobe2 v-else :size="12" :stroke-width="2.4" />
                {{ resolvedTipoIngresoLabel }}
              </span>
            </div>
            <div v-if="student.customSections?.length" class="detail-section-badges">
              <b v-for="section in student.customSections" :key="`detail-section-${student.matricula}-${section.id}`">{{ section.name }}</b>
            </div>
          </div>
        </div>

        <div class="profile-top-actions">
          <button class="ingreso-icon-button" type="button" aria-label="Corregir ciclo de ingreso" title="Ciclo de ingreso" @click="showIngresoCycleModal = true">
            <LucideCalendarClock :size="18"/>
          </button>
          <button v-if="student.estatus === 'Activo'" class="danger-icon-button" title="Dar de baja" @click="$emit('baja', student)">
            <LucideUserX :size="19"/>
          </button>
          <button class="plain-icon-button" @click="$emit('close')" title="Cerrar detalles">
            <LucideX :size="20"/>
          </button>
        </div>
      </div>

      <div class="profile-actions profile-toolbar" role="toolbar" aria-label="Acciones del alumno">
        <button class="btn btn-primary btn-sm action-pay" :disabled="!selectedDebts.length" @click="showPaymentModal = true">
          <LucideCreditCard :size="15"/> Pagar ({{ selectedDebts.length }})
        </button>
        <button class="btn btn-secondary btn-sm action-invoice" :disabled="!selectedDebts.length" @click="showInvoiceModal = true">
          <LucideFileText :size="15"/> Facturar
        </button>
        <button class="btn btn-outline btn-sm action-extra" @click="showDocModal = true">
          <LucideFilePlus :size="15"/> Cargo extra
        </button>
        <button v-if="student.estatus === 'Activo' && !isEnrolled" class="btn btn-secondary btn-sm" :disabled="enrolling" @click="quickEnroll">
          <LucideLoader2 v-if="enrolling" class="animate-spin" :size="15"/>
          <LucideFilePlus v-else :size="15"/> Inscribir
        </button>
        <button class="btn btn-ghost btn-sm action-edit" @click="$emit('edit', student)">
          <LucideSettings :size="15"/> Editar
        </button>
        <button class="btn btn-ghost btn-sm action-sections" @click="$emit('manage-sections', student)">
          <LucideTags :size="15"/> Secciones
        </button>
        <button class="btn btn-ghost btn-sm action-letter" @click="printBeca">
          <LucideAward :size="15"/> Carta beca
        </button>
        <button class="btn btn-ghost btn-sm action-reminder" :disabled="reminding || !validDebts.length || !student.correo" @click="sendReminder">
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

    <section :class="['account-card', { 'is-account-refreshing': isAccountRefreshing, 'is-account-stale': accountStateSyncState.status === 'failed' && accountStateSyncState.hasCache }]">
      <div class="account-header">
        <div class="account-title-area">
          <h3>Estado de Cuenta</h3>
          <span
            :class="['account-sync-indicator', accountStateSyncState.status, { 'is-hidden': !accountSyncVisible }]"
            :title="accountStateSyncState.message"
            :aria-hidden="!accountSyncVisible"
            aria-live="polite"
          >
            <i aria-hidden="true"></i>
            {{ accountSyncLabel }}
          </span>
        </div>
        <div class="account-totals">
          <span>Deuda: ${{ format(validDebts.reduce((acc,d) => acc + d.saldo, 0)) }}</span>
        </div>
      </div>

      <Transition name="account-flow" mode="out-in">
      <div ref="accountTableWrap" class="account-table-wrap" :key="student.matricula">
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
              <th class="money-cell">Importe</th>
              <th class="money-cell">Pagos</th>
              <th class="money-cell">Saldo</th>
              <th class="menu-cell"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="showBlockingAccountLoader">
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
                <td class="money-cell">
                  ${{ format(debt.subtotal) }}
                  <button v-if="debt.montoFinalPendiente" class="final-amount-link" type="button" @click="setMontoFinal(debt)">Fijar</button>
                </td>
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
                        <th class="money-cell">Importe</th>
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
                          <button class="history-action history-action-pdf" @click="reprintPayment(h)"><LucidePrinter :size="11" /> PDF</button>
                          <button class="history-action history-action-danger" @click="cancelPayment(h)"><LucideUndo :size="11" /> Anular</button>
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
        <strong>Saldo actual <b>${{ format(validDebts.reduce((acc, d) => acc + d.saldo, 0)) }}</b></strong>
      </div>
    </section>

    <PaymentModal v-if="showPaymentModal" :debts="selectedDebts" :student="student" @close="showPaymentModal = false" @success="handleSuccess" />
    <DocumentModal v-if="showDocModal" :student="student" @close="showDocModal = false" @success="handleSuccess" />
    <InvoiceModal v-if="showInvoiceModal" :debts="selectedDebts" :student="student" @close="showInvoiceModal = false" @success="handleSuccess" />
    <ConceptChangeModal v-if="showConceptModal" :debt="selectedConceptDebt" @close="closeConceptModal" @success="handleSuccess" />
    <IngresoCycleModal
      v-if="showIngresoCycleModal"
      :student="student"
      :target-ciclo="selectedCicloKey"
      :current-tipo-ingreso="resolvedTipoIngreso"
      :photo-url="photoUrl || ''"
      :saving="savingIngresoCycle"
      :enrollment-concepts="externalConcepts"
      @close="showIngresoCycleModal = false"
      @confirm="saveIngresoCycle"
    />
  </div>
</template>

<script>
// Photo requests stay detail-only: opening Estado de Cuenta resolves the photo,
// then the matrícula-keyed session cache lets the list reuse it later.
const studentPhotoRequests = new Map()
</script>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { LucideCreditCard, LucideFileText, LucideFilePlus, LucideHistory, LucideSettings, LucideBell, LucidePrinter, LucideUndo, LucideAward, LucideUsers, LucideX, LucideUserX, LucideLoader2, LucideShieldCheck, LucideTags, LucideCalendarClock, LucideBuilding2, LucideGlobe2 } from 'lucide-vue-next'
import { useState, useCookie } from '#app'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'
import { useOptimisticSync } from '~/composables/useOptimisticSync'
import { useAccountStateCacheSync } from '~/composables/useAccountStateCacheSync'
import { formatCicloLabel, normalizeCicloKey } from '~/shared/utils/ciclo'
import { formatTipoIngresoValue, resolveTipoIngreso } from '~/shared/utils/tipoIngreso'
import { gradeVisualTitle, studentGroupLabel, studentNivelLabel, studentPresentationStyle } from '~/shared/utils/studentPresentation'
import PaymentModal from './PaymentModal.vue'
import DocumentModal from './DocumentModal.vue'
import InvoiceModal from './InvoiceModal.vue'
import ConceptChangeModal from './ConceptChangeModal.vue'
import IngresoCycleModal from './IngresoCycleModal.vue'
import StudentAccountPhotoCard from '~/components/students/StudentAccountPhotoCard.vue'

const props = defineProps({
  student: Object,
  isEnrolled: { type: Boolean, default: true },
  externalConcepts: { type: Array, default: () => [] }
})
const emit = defineEmits(['refresh', 'edit', 'close', 'switch-student', 'baja', 'photo-loaded', 'manage-sections', 'ingreso-cycle-updated'])
const { show } = useToast()
const { openMenu } = useContextMenu()
const { executeOptimistic } = useOptimisticSync()
const {
  accountStateSyncState,
  getAccountStateCacheKey,
  readCachedAccountState,
  writeCachedAccountState,
  setAccountStateSyncState
} = useAccountStateCacheSync()
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
const showIngresoCycleModal = ref(false)
const savingIngresoCycle = ref(false)
const selectedConceptDebt = ref(null)
const accountTableWrap = ref(null)
const hasRenderedAccountState = ref(false)
const visibleAccountContextKey = ref('')
const isAccountRefreshing = ref(false)
const ACCOUNT_REFRESH_MIN_VISIBLE_MS = 1200
let accountRefreshStartedAt = 0
let accountRefreshTimer = null
let debtsRequestId = 0

const format = (val) => Number(val || 0).toFixed(2)
const normalizePhotoMatricula = (value) => String(value || '').trim().toUpperCase()
const photoStorageKey = (matricula) => `foto_${normalizePhotoMatricula(matricula)}`
const validDebts = computed(() => debts.value.filter(d => d.saldo > 0))
const accountFooterLabel = computed(() => {
  if (!debts.value.length) return 'Sin conceptos en este ciclo'
  return `Mostrando ${debts.value.length} de ${debts.value.length} conceptos`
})
const selectedCicloKey = computed(() => normalizeCicloKey(state.value.ciclo))
const selectedCicloLabel = computed(() => formatCicloLabel(selectedCicloKey.value))
const resolvedNivelLabel = computed(() => studentNivelLabel(props.student))
const accountCacheOptions = computed(() => ({
  matricula: props.student?.matricula || '',
  ciclo: selectedCicloKey.value,
  lateFeeActive: state.value.lateFeeActive
}))
const currentAccountContextKey = computed(() => getAccountStateCacheKey(accountCacheOptions.value))
const showBlockingAccountLoader = computed(() => loading.value && !hasRenderedAccountState.value && debts.value.length === 0)
const accountSyncVisible = computed(() => accountStateSyncState.value.status !== 'idle' && Boolean(accountStateSyncState.value.message))
const accountSyncLabel = computed(() => ({
  cached: 'Datos locales',
  syncing: 'Actualizando',
  updated: 'Actualizado',
  failed: 'Sin actualizar',
  idle: ''
})[accountStateSyncState.value.status] || '')
const resolvedTipoIngreso = computed(() => resolveTipoIngreso(props.student, selectedCicloKey.value, { enrollmentConcepts: props.externalConcepts }))
const resolvedTipoIngresoLabel = computed(() => formatTipoIngresoValue(resolvedTipoIngreso.value))
const progressPaidWidth = (debt) => `${Math.min(100, Number(debt.porcentajePagoReal ?? debt.porcentajePagado) || 0)}%`
const progressCleanupWidth = (debt) => `${Math.min(100, Number(debt.porcentajeDepurado) || 0)}%`
const progressColor = (debt) => Number(debt.porcentajePagado) >= 100 && Number(debt.pagosDepurados) <= 0 ? '#70b34f' : '#d8b449'
const progressStatusLabel = (debt) => {
  const paid = Math.round(Number(debt.porcentajePagado) || 0)
  if (Number(debt.pagosDepurados) > 0 && debt.saldo <= 0) return '100%'
  if (paid >= 100 || debt.saldo <= 0) return '100%'
  return `${Math.max(0, Math.min(100, paid))}%`
}

const debtKey = (debt) => `${debt?.documento || ''}-${debt?.mes || ''}`

const clearAccountRefreshTimer = () => {
  if (!accountRefreshTimer) return
  clearTimeout(accountRefreshTimer)
  accountRefreshTimer = null
}

const startAccountRefresh = () => {
  clearAccountRefreshTimer()
  accountRefreshStartedAt = Date.now()
  if (!isAccountRefreshing.value) isAccountRefreshing.value = true
}

const stopAccountRefresh = () => {
  if (!isAccountRefreshing.value) return

  clearAccountRefreshTimer()
  const elapsed = Date.now() - accountRefreshStartedAt
  const remaining = Math.max(ACCOUNT_REFRESH_MIN_VISIBLE_MS - elapsed, 0)

  accountRefreshTimer = setTimeout(() => {
    isAccountRefreshing.value = false
    accountRefreshTimer = null
  }, remaining)
}

const resetAccountInteraction = () => {
  selectedDebts.value = []
  expandedHistory.value = null
  selectedConceptDebt.value = null
  showPaymentModal.value = false
  showDocModal.value = false
  showInvoiceModal.value = false
  showConceptModal.value = false
}

const applyAccountDebts = async (nextDebts, { preserveInteraction = true } = {}) => {
  const scrollEl = accountTableWrap.value
  const scrollTop = scrollEl?.scrollTop || 0
  const selectedKeys = preserveInteraction
    ? new Set(selectedDebts.value.map(debtKey))
    : new Set()
  const expandedKey = preserveInteraction ? expandedHistory.value : null
  const selectedConceptKey = preserveInteraction && selectedConceptDebt.value ? debtKey(selectedConceptDebt.value) : null
  const freshDebts = Array.isArray(nextDebts) ? nextDebts : []

  debts.value = freshDebts
  hasRenderedAccountState.value = true

  if (preserveInteraction) {
    selectedDebts.value = freshDebts.filter(debt => selectedKeys.has(debtKey(debt)) && Number(debt.saldo || 0) > 0)
    expandedHistory.value = expandedKey && freshDebts.some(debt => debtKey(debt) === expandedKey) ? expandedKey : null
    if (selectedConceptKey) {
      selectedConceptDebt.value = freshDebts.find(debt => debtKey(debt) === selectedConceptKey) || selectedConceptDebt.value
    }
  } else {
    resetAccountInteraction()
  }

  await nextTick()
  if (scrollEl && accountTableWrap.value === scrollEl) {
    accountTableWrap.value.scrollTop = scrollTop
  }
}

const loadDebts = async (options = {}) => {
  if (!props.student?.matricula) return

  const { useCache = true, preserveInteraction = true } = options || {}
  const requestId = ++debtsRequestId
  const cicloKey = selectedCicloKey.value
  const cacheOptions = accountCacheOptions.value
  const contextKey = currentAccountContextKey.value
  const contextChanged = visibleAccountContextKey.value !== contextKey

  if (contextChanged) {
    visibleAccountContextKey.value = contextKey
    hasRenderedAccountState.value = false
    resetAccountInteraction()
  }

  const shouldPreserveInteraction = preserveInteraction && !contextChanged
  const cached = useCache ? readCachedAccountState(cacheOptions) : null
  const hasCachedAccountState = Boolean(cached)
  if (contextChanged && !hasCachedAccountState) {
    debts.value = []
  }
  const hadVisibleAccountState = hasRenderedAccountState.value || debts.value.length > 0

  if (hasCachedAccountState) {
    await applyAccountDebts(cached.debts, { preserveInteraction: shouldPreserveInteraction })
    loading.value = false
    setAccountStateSyncState({
      status: 'cached',
      message: 'Mostrando estado de cuenta desde caché local.',
      lastUpdatedAt: cached.savedAt,
      recordCount: cached.count,
      hasCache: true,
      error: null
    })
  } else if (!hadVisibleAccountState) {
    loading.value = true
  } else {
    loading.value = false
  }

  setAccountStateSyncState({
    status: 'syncing',
    message: hasCachedAccountState
      ? 'Estado de cuenta visible desde caché local mientras se actualiza.'
      : 'Actualizando estado de cuenta en segundo plano.',
    recordCount: hasCachedAccountState ? cached.count : debts.value.length,
    hasCache: hasCachedAccountState || hadVisibleAccountState,
    error: null
  })

  try {
    const res = await $fetch(`/api/students/${props.student.matricula}/debts`, {
      params: { ciclo: cicloKey, lateFeeActive: state.value.lateFeeActive }
    })
    if (requestId !== debtsRequestId || currentAccountContextKey.value !== contextKey) return

    const freshDebts = Array.isArray(res) ? res : []
    await applyAccountDebts(freshDebts, { preserveInteraction: shouldPreserveInteraction })
    const cacheWritten = writeCachedAccountState(cacheOptions, freshDebts)
    const updatedAt = new Date().toISOString()

    setAccountStateSyncState({
      status: 'updated',
      message: cacheWritten
        ? 'Estado de cuenta actualizado y guardado en caché local.'
        : 'Estado de cuenta actualizado. No se pudo guardar la caché local.',
      lastUpdatedAt: updatedAt,
      recordCount: freshDebts.length,
      hasCache: cacheWritten || hasCachedAccountState,
      error: cacheWritten ? null : 'account-cache-write-failed'
    })
  } catch (e) {
    if (requestId !== debtsRequestId || currentAccountContextKey.value !== contextKey) return

    const canKeepWorking = hasCachedAccountState || hasRenderedAccountState.value || debts.value.length > 0
    setAccountStateSyncState({
      status: 'failed',
      message: canKeepWorking
        ? 'No se pudo actualizar. Se conserva el estado de cuenta disponible.'
        : 'No se pudo cargar el estado de cuenta.',
      recordCount: debts.value.length,
      hasCache: canKeepWorking,
      error: e?.data?.message || e?.message || 'account-state-sync-failed'
    })

    if (!canKeepWorking) console.error('[EstadoCuentaDebug] Estado de Cuenta error', e)
  } finally {
    if (requestId === debtsRequestId && currentAccountContextKey.value === contextKey) loading.value = false
  }
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
    loadDebts({ useCache: false })
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
    loadDebts({ useCache: true })
    loadSiblings()
  }
}, { immediate: true })

watch(
  () => ({
    status: accountStateSyncState.value.status,
    hasCache: accountStateSyncState.value.hasCache,
    rendered: hasRenderedAccountState.value,
    count: debts.value.length
  }),
  ({ status, hasCache, rendered, count }) => {
    if (status === 'syncing' && (hasCache || rendered || count > 0)) {
      startAccountRefresh()
    } else {
      stopAccountRefresh()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  clearAccountRefreshTimer()
})

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
          loadDebts({ useCache: false })
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
        loadDebts({ useCache: false })
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
    await loadDebts({ useCache: false })
    emit('refresh')
  } catch (e) {
    show(e?.data?.message || 'No se pudo aplicar la depuración', 'danger')
  } finally {
    depurandoDebt.value = null
  }
}


const setMontoFinal = async (debt) => {
  const suggested = Math.round(Number(debt.subtotal || debt.costoOriginal || debt.saldo || 0))
  const value = prompt('Este debe ser el monto final de tu proyección, sin decimales.', String(suggested))
  if (value === null) return
  const montoFinal = Number(value)
  if (!Number.isFinite(montoFinal) || montoFinal < 0 || Math.floor(montoFinal) !== montoFinal) {
    return show('Ingresa un monto final sin decimales', 'danger')
  }
  if (!confirm(`Confirmar monto final de $${montoFinal.toFixed(2)} para ${debt.conceptoNombre}?`)) return
  try {
    await $fetch('/api/documentos/monto-final', {
      method: 'POST',
      body: {
        documento: debt.documento,
        mes: debt.mes,
        montoFinal,
        ciclo: normalizeCicloKey(state.value.ciclo)
      }
    })
    show('Monto final definido', 'success')
    await loadDebts({ useCache: false })
    emit('refresh')
  } catch (e) {
    show(e?.data?.message || 'No se pudo fijar el monto final', 'danger')
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

  if (debt.montoFinalPendiente) {
    menuItems.push({ label: 'Fijar monto final', icon: LucideSettings, action: () => setMontoFinal(debt) })
    menuItems.push({ label: '-' })
  }

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


const saveIngresoCycle = async (ingresoCiclo) => {
  if (!props.student?.matricula || savingIngresoCycle.value) return
  savingIngresoCycle.value = true

  try {
    const res = await $fetch(`/api/students/${props.student.matricula}/ingreso-cycle`, {
      method: 'PUT',
      body: {
        ciclo: ingresoCiclo,
        targetCiclo: selectedCicloKey.value
      }
    })

    showIngresoCycleModal.value = false
    show('Ciclo de ingreso actualizado', 'success')
    emit('ingreso-cycle-updated', res?.student || {
      matricula: props.student.matricula,
      ciclo: ingresoCiclo,
      cicloBase: ingresoCiclo,
    })
    emit('refresh')
  } catch (e) {
    show(e?.data?.message || 'No se pudo actualizar el ciclo de ingreso', 'danger')
  } finally {
    savingIngresoCycle.value = false
  }
}

const handleSuccess = () => {
  showPaymentModal.value = false; showDocModal.value = false; showInvoiceModal.value = false; closeConceptModal()
  selectedDebts.value = []; loadDebts({ useCache: false, preserveInteraction: false }); emit('refresh')
}
</script>

