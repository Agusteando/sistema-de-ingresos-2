<template>
  <div class="debt-command">
    <section class="debt-hero">
      <div class="hero-copy">
        <span class="eyebrow">Cobranza mensual</span>
        <h2>Deudores</h2>
        <p>
          El tablero concentra saldos vencidos, corte del día 14, excepciones por alumno y acciones manuales de cobranza.
        </p>
      </div>

      <div class="hero-metrics" aria-label="Indicadores de cobranza">
        <div class="hero-metric hero-metric-primary">
          <span>Cartera pendiente</span>
          <strong>{{ formatMoney(totalCartera) }}</strong>
        </div>
        <div class="hero-metric">
          <span>Alumnos</span>
          <strong>{{ filteredDeudores.length }}</strong>
        </div>
        <div class="hero-metric">
          <span>Oficiales</span>
          <strong>{{ officialCount }}</strong>
        </div>
      </div>
    </section>

    <section class="flow-ribbon" aria-label="Calendario de cobranza">
      <article
        v-for="step in flowSteps"
        :key="step.key"
        class="flow-card"
        :class="{ 'flow-card-active': isStepActive(step), 'flow-card-today': isStepToday(step) }"
      >
        <div class="flow-day">{{ step.dayLabel }}</div>
        <div class="flow-icon"><component :is="step.icon" :size="17" /></div>
        <div class="flow-body">
          <strong>{{ step.title }}</strong>
          <span>{{ step.description }}</span>
        </div>
      </article>
    </section>

    <section class="workspace">
      <aside class="side-stack">
        <WhatsappOnboarding auto-start compact class="wa-card" />

        <div class="insight-card">
          <div class="insight-head">
            <LucideCalendarClock :size="18" />
            <div>
              <strong>{{ currentStageTitle }}</strong>
              <span>Día {{ currentDebtDay }} de {{ currentMonthLastDay }}</span>
            </div>
          </div>
          <p>{{ currentStageCopy }}</p>
        </div>

        <div class="insight-grid">
          <div class="mini-metric">
            <span>Con excepción</span>
            <strong>{{ exceptionCount }}</strong>
          </div>
          <div class="mini-metric">
            <span>Conciliación</span>
            <strong>{{ pendingConciliationCount }}</strong>
          </div>
          <div class="mini-metric">
            <span>Sin correo</span>
            <strong>{{ noEmailCount }}</strong>
          </div>
          <div class="mini-metric">
            <span>Sin teléfono</span>
            <strong>{{ noPhoneCount }}</strong>
          </div>
        </div>
      </aside>

      <main class="debt-board">
        <div class="board-toolbar">
          <div class="search-box">
            <LucideSearch :size="17" />
            <input v-model="search" type="text" placeholder="Buscar por matrícula, alumno o tutor">
          </div>

          <div class="toolbar-control">
            <label>Estado</label>
            <select v-model="estatusFiltro">
              <option value="deudores">Solo deudores</option>
              <option value="todos">Todos</option>
              <option value="no_deudores">No deudores</option>
            </select>
          </div>

          <div class="toolbar-control">
            <label>Vista</label>
            <select v-model="segmentFilter">
              <option value="todos">Todos</option>
              <option value="pendientes">Con acción pendiente</option>
              <option value="oficiales">Deudor oficial</option>
              <option value="excepciones">Con fecha especial</option>
            </select>
          </div>

          <button class="btn btn-outline" @click="loadData" :disabled="loading">
            <LucideRefreshCw :size="16" :class="{ 'animate-spin': loading }" /> Actualizar
          </button>
          <button class="btn btn-secondary" @click="exportData" :disabled="loading || filteredDeudores.length === 0">
            <LucideDownload :size="16" /> Exportar
          </button>
        </div>

        <div class="mass-console">
          <label class="select-all">
            <input
              type="checkbox"
              :checked="allVisibleSelected"
              :disabled="filteredDeudores.length === 0"
              @change="toggleAllVisible($event.target.checked)"
            >
            <span>{{ selectedRows.length }} seleccionados</span>
          </label>

          <div class="mass-action">
            <select v-model="selectedMassAction">
              <option v-for="action in actionCatalog" :key="action.action" :value="action.action">
                {{ action.massLabel }}
              </option>
            </select>
            <button
              class="btn btn-primary"
              :disabled="selectedRows.length === 0 || Boolean(runningAction)"
              @click="executeMassAction"
            >
              <component :is="getActionMeta(selectedMassAction).icon" :size="16" />
              {{ runningAction ? 'Procesando' : 'Ejecutar ahora' }}
            </button>
          </div>
        </div>

        <div class="quick-picks">
          <button
            v-for="action in actionCatalog"
            :key="`pick-${action.action}`"
            class="quick-pick"
            :disabled="loading"
            @click="selectEligibleForAction(action.action)"
          >
            <component :is="action.icon" :size="15" />
            Seleccionar {{ action.shortLabel.toLowerCase() }}
          </button>
        </div>

        <div class="debtor-scroll" :class="{ 'is-loading': loading }">
          <div v-if="loading" class="empty-state">
            <span class="liquid-loader"><i></i><i></i><i></i></span>
            <strong>Cargando cartera</strong>
            <p>Se está preparando el corte con desglose por concepto.</p>
          </div>

          <div v-else-if="!filteredDeudores.length" class="empty-state">
            <LucideCheckCircle :size="34" />
            <strong>No hay alumnos en esta vista</strong>
            <p>Cambia los filtros o actualiza la cartera.</p>
          </div>

          <article
            v-else
            v-for="d in filteredDeudores"
            :key="rowKey(d)"
            class="debtor-card"
            :class="{
              'debtor-card-selected': isSelected(d),
              'debtor-card-official': d.deudorOficial,
              'debtor-card-exception': d.fechaLimiteEspecialVigente
            }"
          >
            <header class="debtor-head">
              <label class="debtor-check">
                <input type="checkbox" :checked="isSelected(d)" @change="toggleOne(d)">
              </label>
              <div class="debtor-avatar">{{ initials(d.nombreCompleto) }}</div>
              <div class="debtor-title">
                <div class="name-line">
                  <strong>{{ d.nombreCompleto }}</strong>
                  <span class="matricula">{{ d.matricula }}</span>
                </div>
                <span>{{ d.nivel }} · {{ d.grado }} {{ d.grupo || '' }} · {{ d.plantel }}</span>
              </div>
              <div class="saldo-block">
                <span>Saldo</span>
                <strong>{{ formatMoney(saldoValue(d)) }}</strong>
              </div>
            </header>

            <div class="debtor-status-row">
              <span class="status-pill" :class="statusClass(d)">{{ statusLabel(d) }}</span>
              <span v-if="d.fechaLimiteEspecialVigente" class="exception-pill">
                Fecha especial: {{ formatDate(d.fechaLimitePago) }}
              </span>
              <span v-if="d.pagoPendienteConciliacion" class="conciliation-pill">Pago por conciliar</span>
            </div>

            <div class="micro-timeline" aria-label="Avance de gestiones">
              <span
                v-for="action in actionCatalog"
                :key="`${rowKey(d)}-${action.action}`"
                class="micro-step"
                :class="{
                  'micro-step-done': isActionCompleted(d, action.action),
                  'micro-step-ready': isActionExpected(d, action.action) && !isActionCompleted(d, action.action)
                }"
                :title="action.massLabel"
              ></span>
            </div>

            <div class="debtor-info-grid">
              <div>
                <span>Tutor</span>
                <strong>{{ d.padre || 'No registrado' }}</strong>
              </div>
              <div>
                <span>Correo</span>
                <strong>{{ d.correo || 'Sin correo' }}</strong>
              </div>
              <div>
                <span>Teléfono</span>
                <strong>{{ d.telefono || 'Sin teléfono' }}</strong>
              </div>
              <div>
                <span>Último movimiento</span>
                <strong>{{ d.ultimoMovimiento ? formatDate(d.ultimoMovimiento) : 'Sin registro' }}</strong>
              </div>
            </div>

            <div v-if="d.desglose?.length" class="breakdown-preview">
              <div v-for="item in d.desglose.slice(0, 3)" :key="`${rowKey(d)}-${item.documento}-${item.mesCargo}`">
                <span>{{ item.conceptoNombre }} · {{ item.mesLabel || item.mesCargo }}</span>
                <strong>{{ formatMoney(item.saldo) }}</strong>
              </div>
              <button v-if="d.desglose.length > 3" @click="openDetails(d)">Ver {{ d.desglose.length - 3 }} más</button>
            </div>

            <footer class="card-actions">
              <button
                v-for="action in actionCatalog"
                :key="`${rowKey(d)}-action-${action.action}`"
                class="manual-action"
                :class="manualActionClass(d, action.action)"
                :disabled="!canRunAction(d, action.action) || Boolean(runningAction)"
                @click="runSingleAction(d, action.action)"
              >
                <component :is="action.icon" :size="15" />
                {{ action.shortLabel }}
              </button>
              <button class="manual-action neutral" @click="openException(d)">
                <LucideCalendarClock :size="15" /> Fecha especial
              </button>
              <button class="manual-action neutral" @click="openDetails(d)">
                <LucideEye :size="15" /> Detalle
              </button>
            </footer>
          </article>
        </div>
      </main>
    </section>

    <Teleport to="body">
      <div v-if="showExceptionModal" class="modal-overlay" @click.self="closeException">
        <div class="modal-container">
          <div class="modal-header">
            <h2 class="text-lg font-bold text-gray-800 flex items-center gap-2">
              <LucideCalendarClock :size="20" /> Fecha límite especial
            </h2>
            <button class="btn btn-ghost btn-sm" @click="closeException"><LucideX :size="16" /></button>
          </div>
          <div class="modal-content">
            <div class="exception-summary" v-if="exceptionTarget">
              <strong>{{ exceptionTarget.nombreCompleto }}</strong>
              <span>{{ exceptionTarget.matricula }} · Periodo {{ exceptionTarget.mes }}/{{ normalizeCicloKey(state.ciclo) }}</span>
            </div>
            <div class="form-group">
              <label class="form-label">Nueva fecha límite</label>
              <input v-model="exceptionForm.fecha" type="date" class="input-field" required>
            </div>
            <div class="form-group mb-0">
              <label class="form-label">Nota de excepción</label>
              <textarea
                v-model="exceptionForm.motivo"
                class="input-field exception-note"
                placeholder="Ejemplo: convenio autorizado por Dirección para pago posterior."
                required
              ></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" @click="closeException" :disabled="savingException">Cancelar</button>
            <button class="btn btn-primary" @click="saveException" :disabled="savingException || !exceptionForm.fecha || !exceptionForm.motivo.trim()">
              <LucideCheckCircle :size="16" /> Guardar excepción
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="detailsTarget" class="drawer-overlay" @click.self="closeDetails">
        <aside class="detail-drawer">
          <header>
            <div>
              <span>Detalle de adeudo</span>
              <h3>{{ detailsTarget.nombreCompleto }}</h3>
              <p>{{ detailsTarget.matricula }} · {{ detailsTarget.nivel }} · {{ detailsTarget.grado }} {{ detailsTarget.grupo || '' }}</p>
            </div>
            <button class="btn btn-ghost btn-sm" @click="closeDetails"><LucideX :size="16" /></button>
          </header>

          <section class="drawer-total">
            <span>Saldo pendiente</span>
            <strong>{{ formatMoney(saldoValue(detailsTarget)) }}</strong>
          </section>

          <section class="drawer-section">
            <h4>Desglose del corte</h4>
            <div v-if="detailsTarget.desglose?.length" class="drawer-list">
              <div v-for="item in detailsTarget.desglose" :key="`${item.documento}-${item.mesCargo}`">
                <span>{{ item.conceptoNombre }} · {{ item.mesLabel || item.mesCargo }}</span>
                <strong>{{ formatMoney(item.saldo) }}</strong>
              </div>
            </div>
            <p v-else class="drawer-muted">No hay conceptos pendientes en el desglose cargado.</p>
          </section>

          <section class="drawer-section">
            <h4>Acciones registradas</h4>
            <div v-if="detailsTarget.accionesRealizadas?.length" class="drawer-list action-history">
              <div v-for="evt in detailsTarget.accionesRealizadas" :key="`${evt.accion}-${evt.fecha}`">
                <span>{{ getActionMeta(evt.accion).massLabel }}</span>
                <strong>{{ formatDate(evt.fecha) }}</strong>
              </div>
            </div>
            <p v-else class="drawer-muted">Aún no hay acciones registradas para este periodo.</p>
          </section>

          <section v-if="detailsTarget.notaFechaLimiteEspecial" class="drawer-section">
            <h4>Nota de fecha especial</h4>
            <p class="drawer-note">{{ detailsTarget.notaFechaLimiteEspecial }}</p>
          </section>
        </aside>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  LucideAlertTriangle,
  LucideCalendarClock,
  LucideCheckCircle,
  LucideClipboardList,
  LucideDownload,
  LucideEye,
  LucideFileText,
  LucideMail,
  LucideMessageCircle,
  LucidePhone,
  LucideRefreshCw,
  LucideSearch,
  LucideShieldCheck,
  LucideUsers,
  LucideX
} from 'lucide-vue-next'
import { useState } from '#app'
import { useToast } from '~/composables/useToast'
import { exportToCSV } from '~/utils/export'
import { normalizeCicloKey } from '~/shared/utils/ciclo'
import WhatsappOnboarding from '~/components/WhatsappOnboarding.vue'

const state = useState('globalState')
const { show } = useToast()

const deudores = ref([])
const estatusFiltro = ref('deudores')
const segmentFilter = ref('todos')
const loading = ref(false)
const search = ref('')
const selectedKeys = ref([])
const selectedMassAction = ref('correo_recordatorio')
const runningAction = ref('')
const detailsTarget = ref(null)
const exceptionTarget = ref(null)
const showExceptionModal = ref(false)
const savingException = ref(false)
const exceptionForm = ref({ fecha: '', motivo: '' })

const actionCatalog = [
  {
    action: 'correo_recordatorio',
    day: 13,
    dayLabel: 'Día 13',
    shortLabel: 'Correo',
    massLabel: 'Enviar recordatorio por correo',
    title: 'Correo de recordatorio',
    description: 'Se envía únicamente cuando el usuario lo ejecuta.',
    icon: LucideMail,
    requires: 'correo'
  },
  {
    action: 'reporte_deudores',
    day: 14,
    dayLabel: 'Día 14',
    shortLabel: 'Corte',
    massLabel: 'Registrar corte de deudores',
    title: 'Corte con desglose',
    description: 'Genera el corte con conceptos adeudados.',
    icon: LucideClipboardList
  },
  {
    action: 'whatsapp_contacto',
    day: 20,
    dayLabel: 'Día 20',
    shortLabel: 'WhatsApp',
    massLabel: 'Enviar seguimiento por WhatsApp',
    title: 'Seguimiento por WhatsApp',
    description: 'Se envía desde la cuenta vinculada por el usuario.',
    icon: LucideMessageCircle,
    requires: 'telefono'
  },
  {
    action: 'carta_suspension',
    day: 27,
    dayLabel: 'Día 27',
    shortLabel: 'Carta',
    massLabel: 'Generar carta de suspensión',
    title: 'Carta de suspensión',
    description: 'Registra la acción y descarga la carta.',
    icon: LucideFileText
  },
  {
    action: 'llamada_telefonica',
    day: null,
    dayLabel: 'Cierre',
    shortLabel: 'Llamada',
    massLabel: 'Registrar llamada de cierre',
    title: 'Llamadas de cierre',
    description: 'Deja al alumno como deudor oficial al cierre.',
    icon: LucidePhone,
    requires: 'telefono'
  }
]

const flowSteps = computed(() => [
  {
    key: 'periodo-pago',
    day: 1,
    dayEnd: 12,
    dayLabel: '1–12',
    title: 'Periodo de pago',
    description: 'Las familias pueden regularizar sin gestión de cobranza.',
    icon: LucideUsers
  },
  ...actionCatalog.map(action => ({
    key: action.action,
    day: action.day,
    dayLabel: action.dayLabel,
    title: action.title,
    description: action.description,
    icon: action.icon
  }))
])

const saldoValue = (d) => Number(d?.saldoPendiente ?? d?.saldoColegiatura ?? 0)
const rowKey = (d) => `${d.matricula}-${d.mes}`

const normalizeText = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')

const formatMoney = (value) => Number(value || 0).toLocaleString('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2
})

const formatDate = (value) => {
  if (!value) return 'Sin fecha'
  const raw = String(value)
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return `${match[3]}/${match[2]}/${match[1]}`
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return raw
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const todayFallback = new Date()
const currentDebtDay = computed(() => Number(deudores.value[0]?.diaCobranza || todayFallback.getDate()))
const currentMonthLastDay = computed(() => Number(deudores.value[0]?.ultimoDiaMes || new Date(todayFallback.getFullYear(), todayFallback.getMonth() + 1, 0).getDate()))

const currentStageTitle = computed(() => {
  const day = currentDebtDay.value
  if (day <= 12) return 'Periodo de pago'
  if (day === 13) return 'Correo de recordatorio'
  if (day >= 14 && day <= 19) return 'Corte de deudores'
  if (day >= 20 && day <= 26) return 'Seguimiento por WhatsApp'
  if (day === 27) return 'Carta de suspensión'
  if (day >= currentMonthLastDay.value) return 'Cierre de mes'
  return 'Preparación de cierre'
})

const currentStageCopy = computed(() => {
  const day = currentDebtDay.value
  if (day <= 12) return 'No se marca deudor exigible antes del día 13.'
  if (day === 13) return 'El correo se puede ejecutar manualmente para los alumnos con saldo pendiente.'
  if (day >= 14 && day <= 19) return 'El corte muestra el desglose por concepto adeudado.'
  if (day >= 20 && day <= 26) return 'El seguimiento por WhatsApp queda disponible para ejecución manual.'
  if (day === 27) return 'La carta de suspensión puede generarse para los casos seleccionados.'
  if (day >= currentMonthLastDay.value) return 'Las llamadas cierran el proceso y dejan el caso como deudor oficial.'
  return 'Las acciones previas siguen disponibles si no han sido registradas.'
})

const filteredDeudores = computed(() => {
  const q = normalizeText(search.value)
  return deudores.value.filter((d) => {
    const matchesSearch = !q || [d.nombreCompleto, d.matricula, d.padre, d.correo, d.telefono]
      .some(value => normalizeText(value).includes(q))

    if (!matchesSearch) return false
    if (segmentFilter.value === 'pendientes') return Boolean(d.accionesPendientes?.length)
    if (segmentFilter.value === 'oficiales') return Boolean(d.deudorOficial)
    if (segmentFilter.value === 'excepciones') return Boolean(d.fechaLimiteEspecialVigente)
    return true
  })
})

const selectedRows = computed(() => {
  const keys = new Set(selectedKeys.value)
  return deudores.value.filter(d => keys.has(rowKey(d)))
})

const allVisibleSelected = computed(() => {
  return filteredDeudores.value.length > 0 && filteredDeudores.value.every(d => selectedKeys.value.includes(rowKey(d)))
})

const totalCartera = computed(() => filteredDeudores.value.reduce((sum, d) => sum + saldoValue(d), 0))
const officialCount = computed(() => filteredDeudores.value.filter(d => d.deudorOficial).length)
const exceptionCount = computed(() => filteredDeudores.value.filter(d => d.fechaLimiteEspecialVigente).length)
const pendingConciliationCount = computed(() => filteredDeudores.value.filter(d => d.pagoPendienteConciliacion).length)
const noEmailCount = computed(() => filteredDeudores.value.filter(d => !d.correo).length)
const noPhoneCount = computed(() => filteredDeudores.value.filter(d => !d.telefono).length)

const hasBlockingOverlay = computed(() => showExceptionModal.value || Boolean(detailsTarget.value))

watch(hasBlockingOverlay, (val) => {
  if (typeof document !== 'undefined') document.body.style.overflow = val ? 'hidden' : ''
})

watch(() => normalizeCicloKey(state.value.ciclo), () => loadData())
watch(estatusFiltro, () => loadData())

watch(deudores, () => {
  const validKeys = new Set(deudores.value.map(rowKey))
  selectedKeys.value = selectedKeys.value.filter(key => validKeys.has(key))

  const nextAction = deudores.value.find(d => d.proximaAccion)?.proximaAccion
  if (nextAction) selectedMassAction.value = nextAction
})

onUnmounted(() => {
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})

const loadData = async () => {
  loading.value = true
  try {
    deudores.value = await $fetch('/api/deudores', {
      params: {
        ciclo: normalizeCicloKey(state.value.ciclo),
        estatus: estatusFiltro.value,
        detalles: '1'
      }
    })
  } catch (e) {
    show('No se pudo cargar la cartera de deudores.', 'danger')
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

const isStepActive = (step) => {
  if (step.key === 'periodo-pago') return currentDebtDay.value <= 12
  if (step.key === 'llamada_telefonica') return currentDebtDay.value >= currentMonthLastDay.value
  return step.day ? currentDebtDay.value >= step.day : false
}

const isStepToday = (step) => {
  if (step.key === 'periodo-pago') return currentDebtDay.value <= 12
  if (step.key === 'llamada_telefonica') return currentDebtDay.value >= currentMonthLastDay.value
  return step.day === currentDebtDay.value
}

const initials = (name) => String(name || 'NA')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part[0]?.toUpperCase())
  .join('') || 'NA'

const getActionMeta = (action) => actionCatalog.find(item => item.action === action) || {
  action,
  shortLabel: String(action || 'Acción'),
  massLabel: String(action || 'Acción'),
  icon: LucideShieldCheck
}

const isActionCompleted = (d, action) => (d.accionesRealizadas || []).some(evt => String(evt.accion) === action)
const isActionExpected = (d, action) => (d.accionesEsperadas || []).some(item => String(item.action) === action)

const canRunAction = (d, action) => {
  if (!d?.isDeudor) return false
  if (isActionCompleted(d, action)) return false
  if (!isActionExpected(d, action)) return false
  const meta = getActionMeta(action)
  if (meta.requires === 'correo' && !d.correo) return false
  if (meta.requires === 'telefono' && !d.telefono) return false
  return true
}

const manualActionClass = (d, action) => {
  if (isActionCompleted(d, action)) return 'done'
  if (canRunAction(d, action)) return 'ready'
  return 'idle'
}

const statusClass = (d) => {
  if (d.deudorOficial) return 'status-danger'
  if (d.fechaLimiteEspecialVigente) return 'status-info'
  if (d.isDeudor) return 'status-warning'
  return 'status-success'
}

const statusLabel = (d) => {
  if (d.deudorOficial) return 'Deudor oficial'
  if (d.fechaLimiteEspecialVigente) return 'Fecha especial'
  return d.estatusFlujoLabel || (d.isDeudor ? 'Deudor' : 'Sin adeudo')
}

const isSelected = (d) => selectedKeys.value.includes(rowKey(d))

const toggleOne = (d) => {
  const key = rowKey(d)
  selectedKeys.value = selectedKeys.value.includes(key)
    ? selectedKeys.value.filter(item => item !== key)
    : [...selectedKeys.value, key]
}

const toggleAllVisible = (checked) => {
  const visibleKeys = filteredDeudores.value.map(rowKey)
  if (checked) {
    selectedKeys.value = [...new Set([...selectedKeys.value, ...visibleKeys])]
    return
  }
  selectedKeys.value = selectedKeys.value.filter(key => !visibleKeys.includes(key))
}

const selectEligibleForAction = (action) => {
  selectedMassAction.value = action
  selectedKeys.value = filteredDeudores.value
    .filter(d => canRunAction(d, action))
    .map(rowKey)
}

const runSingleAction = async (d, action) => {
  await executeManualAction([d], action, { clearSelection: false })
}

const executeMassAction = async () => {
  await executeManualAction(selectedRows.value, selectedMassAction.value, { clearSelection: true })
}

const executeManualAction = async (targets, action, options = {}) => {
  if (!targets.length || !action) return

  runningAction.value = action
  try {
    const response = await $fetch('/api/deudores/actions', {
      method: 'POST',
      body: {
        ciclo: normalizeCicloKey(state.value.ciclo),
        accion: action,
        items: targets.map(d => ({ matricula: d.matricula, mes: d.mes }))
      }
    })

    if (action === 'carta_suspension') downloadSuspensionLetters(targets)
    if (action === 'reporte_deudores') exportCorteDeudores(targets)

    const completed = Number(response?.completed || 0)
    const duplicated = Number(response?.duplicated || 0)
    const failed = Number(response?.failed || 0)
    const parts = [`${completed} registrados`]
    if (duplicated) parts.push(`${duplicated} ya existían`)
    if (failed) parts.push(`${failed} fallidos`)
    show(parts.join(', ') + '.')

    if (options.clearSelection) selectedKeys.value = []
    await loadData()
  } catch (e) {
    show(e?.statusMessage || 'No se pudo ejecutar la acción manual.', 'danger')
  } finally {
    runningAction.value = ''
  }
}

const exportData = async () => {
  loading.value = true
  try {
    const rows = await $fetch('/api/deudores', {
      params: {
        ciclo: normalizeCicloKey(state.value.ciclo),
        estatus: estatusFiltro.value,
        detalles: '1'
      }
    })
    const q = normalizeText(search.value)
    const rowsForExport = q
      ? rows.filter(d => [d.nombreCompleto, d.matricula, d.padre].some(value => normalizeText(value).includes(q)))
      : rows

    exportToCSV(`Deudores_${normalizeCicloKey(state.value.ciclo)}.csv`, buildExportRows(rowsForExport))
  } catch (e) {
    show('No se pudo exportar el reporte de deudores.', 'danger')
  } finally {
    loading.value = false
  }
}

const buildExportRows = (rows) => rows.flatMap((d) => {
  const base = {
    Matricula: d.matricula,
    Nombre: d.nombreCompleto,
    Grado: `${d.nivel} - ${d.grado} ${d.grupo || ''}`.trim(),
    Tutor: d.padre || 'No registrado',
    Correo: d.correo || 'Sin correo',
    Telefono: d.telefono || '',
    Saldo_Pendiente_MXN: saldoValue(d).toFixed(2),
    Estatus_Flujo: d.estatusFlujoLabel || d.estatusFlujo,
    Fecha_Limite: d.fechaLimitePago || '',
    Nota_Excepcion: d.notaFechaLimiteEspecial || '',
    Deudor_Oficial: d.deudorOficial ? 'Sí' : 'No'
  }

  if (!d.desglose?.length) return [{ ...base, Concepto: '', Periodo: '', Saldo_Concepto_MXN: '' }]

  return d.desglose.map(item => ({
    ...base,
    Concepto: item.conceptoNombre || '',
    Periodo: item.mesLabel || item.mesCargo || '',
    Saldo_Concepto_MXN: Number(item.saldo || 0).toFixed(2)
  }))
})

const exportCorteDeudores = (rows) => {
  exportToCSV(`Corte_deudores_${normalizeCicloKey(state.value.ciclo)}.csv`, buildExportRows(rows))
}

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const downloadBlob = (filename, content, type) => {
  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const suspensionLetter = (d) => `
  <section class="letter">
    <header>
      <strong>Instituto IECS-IEDIS</strong>
      <span>Carta de suspensión · ${formatDate(new Date())}</span>
    </header>
    <p>Padre, madre o tutor de <strong>${escapeHtml(d.nombreCompleto)}</strong>:</p>
    <p>Por este medio se informa que el alumno presenta saldo pendiente al cierre del proceso de cobranza del periodo ${escapeHtml(String(d.mes))}/${escapeHtml(normalizeCicloKey(state.value.ciclo))}.</p>
    <table>
      <thead><tr><th>Concepto</th><th>Periodo</th><th>Saldo</th></tr></thead>
      <tbody>
        ${(d.desglose || []).filter(item => Number(item.saldo || 0) > 0).map(item => `
          <tr>
            <td>${escapeHtml(item.conceptoNombre)}</td>
            <td>${escapeHtml(item.mesLabel || item.mesCargo)}</td>
            <td>${formatMoney(item.saldo)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <p>Saldo total pendiente: <strong>${formatMoney(saldoValue(d))}</strong>.</p>
    <p>Se solicita regularizar el estado de cuenta para evitar medidas administrativas adicionales.</p>
    <footer>Administración y Cobranza</footer>
  </section>
`

const downloadSuspensionLetters = (rows) => {
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Cartas de suspensión</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; color: #162641; background: #f8fafc; }
    .letter { width: min(760px, calc(100% - 48px)); margin: 24px auto; padding: 34px; background: #fff; border: 1px solid #dfe6ef; border-radius: 18px; page-break-after: always; }
    header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid #dfe6ef; padding-bottom: 16px; margin-bottom: 24px; }
    header strong { color: #2f7d3f; font-size: 18px; }
    header span { color: #66728a; font-size: 13px; }
    p { font-size: 14px; line-height: 1.65; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border-bottom: 1px solid #edf2f7; padding: 10px; text-align: left; font-size: 13px; }
    th { background: #f8fafc; color: #66728a; text-transform: uppercase; font-size: 11px; }
    footer { margin-top: 30px; color: #2f7d3f; font-weight: 700; }
    @media print { body { background: #fff; } .letter { border: 0; width: auto; margin: 0; border-radius: 0; } }
  </style>
</head>
<body>${rows.map(suspensionLetter).join('')}</body>
</html>`
  downloadBlob(`Cartas_suspension_${normalizeCicloKey(state.value.ciclo)}.html`, html, 'text/html;charset=utf-8;')
}

const openException = (d) => {
  exceptionTarget.value = d
  exceptionForm.value = {
    fecha: d.fechaLimiteEspecial || d.fechaLimitePago || '',
    motivo: d.notaFechaLimiteEspecial || ''
  }
  showExceptionModal.value = true
}

const closeException = () => {
  showExceptionModal.value = false
  exceptionTarget.value = null
  exceptionForm.value = { fecha: '', motivo: '' }
}

const saveException = async () => {
  if (!exceptionTarget.value) return
  savingException.value = true
  try {
    await $fetch('/api/deudores/excepciones', {
      method: 'POST',
      body: {
        matricula: exceptionTarget.value.matricula,
        ciclo: normalizeCicloKey(state.value.ciclo),
        mes: exceptionTarget.value.mes,
        fechaLimiteEspecial: exceptionForm.value.fecha,
        motivo: exceptionForm.value.motivo.trim()
      }
    })
    show('Fecha límite especial guardada.')
    closeException()
    await loadData()
  } catch (e) {
    show(e?.statusMessage || 'No se pudo guardar la excepción.', 'danger')
  } finally {
    savingException.value = false
  }
}

const openDetails = (d) => {
  detailsTarget.value = d
}

const closeDetails = () => {
  detailsTarget.value = null
}
</script>

<style scoped>
.debt-command {
  display: grid;
  height: 100%;
  min-height: 0;
  min-width: 0;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 14px;
  overflow: hidden;
}

.debt-hero {
  position: relative;
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.7fr);
  gap: 18px;
  overflow: hidden;
  border: 1px solid rgba(211, 226, 216, 0.9);
  border-radius: 28px;
  padding: 22px;
  background:
    radial-gradient(circle at 10% 10%, rgba(142, 193, 83, 0.18), transparent 18rem),
    linear-gradient(135deg, rgba(255, 255, 255, 0.97), rgba(247, 253, 247, 0.94));
  box-shadow: 0 18px 48px rgba(22, 38, 65, 0.08);
}

.debt-hero::after {
  content: "";
  position: absolute;
  right: -58px;
  top: -78px;
  width: 240px;
  height: 240px;
  border-radius: 999px;
  background: repeating-radial-gradient(circle, rgba(65, 132, 88, 0.12) 0 1px, transparent 1px 8px);
  pointer-events: none;
}

.hero-copy,
.hero-metrics {
  position: relative;
  z-index: 1;
}

.eyebrow {
  display: inline-flex;
  margin-bottom: 6px;
  color: #2b7d45;
  font-size: 0.67rem;
  font-weight: 850;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.hero-copy h2 {
  margin: 0;
  color: #152642;
  font-size: clamp(1.55rem, 3vw, 2.55rem);
  font-weight: 900;
  letter-spacing: -0.04em;
}

.hero-copy p {
  max-width: 780px;
  margin: 8px 0 0;
  color: #66728a;
  font-size: 0.94rem;
  font-weight: 620;
  line-height: 1.55;
}

.hero-metrics {
  display: grid;
  grid-template-columns: 1fr 0.72fr 0.72fr;
  gap: 10px;
  align-items: stretch;
}

.hero-metric {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  border: 1px solid rgba(223, 230, 239, 0.88);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.82);
  padding: 14px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.hero-metric-primary {
  background: linear-gradient(135deg, #fff8f6, #ffffff);
}

.hero-metric span,
.mini-metric span,
.saldo-block span {
  color: #66728a;
  font-size: 0.66rem;
  font-weight: 850;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-metric strong {
  overflow: hidden;
  color: #172943;
  font-size: clamp(1.05rem, 1.6vw, 1.45rem);
  font-weight: 900;
  letter-spacing: -0.04em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero-metric-primary strong {
  color: #e83f4b;
}

.flow-ribbon {
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}

.flow-card {
  display: grid;
  min-width: 0;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  border: 1px solid #dfe6ef;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
  padding: 10px;
  color: #66728a;
}

.flow-card-active {
  border-color: rgba(101, 167, 68, 0.48);
  background: linear-gradient(135deg, rgba(234, 248, 231, 0.92), rgba(255, 255, 255, 0.95));
  color: #274a38;
}

.flow-card-today {
  box-shadow: 0 10px 26px rgba(101, 167, 68, 0.14);
}

.flow-day {
  display: grid;
  min-width: 48px;
  height: 34px;
  place-items: center;
  border-radius: 12px;
  background: #f4f7fa;
  color: #526078;
  font-size: 0.66rem;
  font-weight: 900;
}

.flow-card-active .flow-day {
  background: #e4f6df;
  color: #2e7235;
}

.flow-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 12px;
  background: #ffffff;
  color: #3f8468;
}

.flow-body {
  min-width: 0;
}

.flow-body strong,
.flow-body span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flow-body strong {
  color: #172943;
  font-size: 0.78rem;
  font-weight: 850;
}

.flow-body span {
  color: #66728a;
  font-size: 0.68rem;
  font-weight: 650;
}

.workspace {
  display: grid;
  min-height: 0;
  min-width: 0;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 14px;
  overflow: hidden;
}

.side-stack,
.debt-board {
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.side-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wa-card {
  flex: 0 0 auto;
}

.insight-card,
.insight-grid,
.debt-board,
.mass-console,
.debtor-card {
  border: 1px solid #dfe6ef;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 10px 28px rgba(22, 38, 65, 0.06);
}

.insight-card {
  border-radius: 22px;
  padding: 16px;
}

.insight-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.insight-head svg {
  color: #3f8468;
}

.insight-head strong,
.insight-head span {
  display: block;
}

.insight-head strong {
  color: #172943;
  font-size: 0.92rem;
  font-weight: 850;
}

.insight-head span {
  color: #66728a;
  font-size: 0.74rem;
  font-weight: 750;
}

.insight-card p {
  margin: 12px 0 0;
  color: #66728a;
  font-size: 0.8rem;
  font-weight: 650;
  line-height: 1.55;
}

.insight-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border-radius: 22px;
  background: #dfe6ef;
}

.mini-metric {
  min-width: 0;
  background: rgba(255, 255, 255, 0.95);
  padding: 14px;
}

.mini-metric strong {
  display: block;
  margin-top: 4px;
  color: #172943;
  font-size: 1.35rem;
  font-weight: 900;
  letter-spacing: -0.05em;
}

.debt-board {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  gap: 10px;
  overflow: hidden;
  border-radius: 24px;
  padding: 12px;
}

.board-toolbar {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(260px, 1fr) 150px 160px auto auto;
  gap: 10px;
  align-items: end;
}

.search-box {
  display: flex;
  min-width: 0;
  height: 38px;
  align-items: center;
  gap: 9px;
  border: 1px solid #dfe6ef;
  border-radius: 14px;
  background: #fff;
  padding: 0 12px;
}

.search-box svg {
  flex-shrink: 0;
  color: #66728a;
}

.search-box input,
.toolbar-control select,
.mass-action select {
  min-width: 0;
  width: 100%;
  border: 0;
  background: transparent;
  color: #172943;
  font-size: 0.82rem;
  font-weight: 750;
  outline: none;
}

.toolbar-control {
  min-width: 0;
}

.toolbar-control label {
  display: block;
  margin-bottom: 4px;
  color: #66728a;
  font-size: 0.62rem;
  font-weight: 850;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.toolbar-control select,
.mass-action select {
  height: 38px;
  border: 1px solid #dfe6ef;
  border-radius: 14px;
  background: #fff;
  padding: 0 10px;
}

.mass-console {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: 18px;
  padding: 10px;
}

.select-all,
.mass-action {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.select-all span {
  color: #172943;
  font-size: 0.82rem;
  font-weight: 850;
}

.mass-action {
  flex: 1;
  justify-content: flex-end;
}

.mass-action select {
  max-width: 270px;
}

.quick-picks {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 1px;
}

.quick-pick {
  display: inline-flex;
  height: 32px;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  border: 1px solid #dfe6ef;
  border-radius: 999px;
  background: #fff;
  color: #526078;
  padding: 0 12px;
  font-size: 0.7rem;
  font-weight: 850;
  transition: border-color 160ms ease, color 160ms ease, background 160ms ease;
}

.quick-pick:hover:not(:disabled) {
  border-color: rgba(101, 167, 68, 0.42);
  background: #f7fcf4;
  color: #2e7235;
}

.debtor-scroll {
  display: grid;
  min-height: 0;
  align-content: start;
  gap: 10px;
  overflow-y: auto;
  padding-right: 4px;
  overscroll-behavior: contain;
}

.empty-state {
  display: grid;
  min-height: 260px;
  place-items: center;
  align-content: center;
  gap: 8px;
  border: 1px dashed #d8e2eb;
  border-radius: 22px;
  color: #66728a;
  text-align: center;
}

.empty-state strong {
  color: #172943;
  font-weight: 850;
}

.empty-state p {
  margin: 0;
  max-width: 360px;
  font-size: 0.82rem;
}

.empty-state svg {
  color: #65a744;
}

.debtor-card {
  position: relative;
  display: grid;
  gap: 12px;
  overflow: hidden;
  border-radius: 22px;
  padding: 14px;
}

.debtor-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 5px;
  background: #dfe6ef;
}

.debtor-card-selected {
  border-color: rgba(101, 167, 68, 0.55);
  background: linear-gradient(135deg, rgba(247, 252, 244, 0.96), rgba(255, 255, 255, 0.96));
}

.debtor-card-selected::before {
  background: #65a744;
}

.debtor-card-official::before {
  background: #e83f4b;
}

.debtor-card-exception::before {
  background: #397fe8;
}

.debtor-head {
  display: grid;
  min-width: 0;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
}

.debtor-check {
  display: grid;
  place-items: center;
}

.debtor-avatar {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 15px;
  background: linear-gradient(135deg, #eaf8e7, #f7fcf4);
  color: #2e7235;
  font-size: 0.78rem;
  font-weight: 900;
}

.debtor-title {
  min-width: 0;
}

.name-line {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.name-line strong {
  overflow: hidden;
  color: #172943;
  font-size: 0.95rem;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.matricula {
  flex: 0 0 auto;
  border-radius: 999px;
  background: #f2f7fb;
  color: #397fe8;
  padding: 2px 7px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.65rem;
  font-weight: 850;
}

.debtor-title > span {
  display: block;
  overflow: hidden;
  color: #66728a;
  font-size: 0.74rem;
  font-weight: 720;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.saldo-block {
  text-align: right;
}

.saldo-block strong {
  display: block;
  color: #e83f4b;
  font-size: 1.05rem;
  font-weight: 900;
  letter-spacing: -0.04em;
}

.debtor-status-row,
.card-actions {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 8px;
}

.status-pill,
.exception-pill,
.conciliation-pill {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  border-radius: 999px;
  padding: 0 10px;
  font-size: 0.68rem;
  font-weight: 850;
}

.status-success { background: #eaf8e7; color: #2e7235; }
.status-warning { background: #fff8df; color: #8a6500; }
.status-danger { background: #fff0ed; color: #d83a2a; }
.status-info { background: #edf6ff; color: #2d65ba; }
.exception-pill { background: #edf6ff; color: #2d65ba; }
.conciliation-pill { background: #fff8df; color: #8a6500; }

.micro-timeline {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 5px;
}

.micro-step {
  height: 5px;
  border-radius: 999px;
  background: #edf2f7;
}

.micro-step-ready {
  background: #fcbf2d;
}

.micro-step-done {
  background: #65a744;
}

.debtor-info-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.debtor-info-grid div {
  min-width: 0;
  border-radius: 14px;
  background: #f8fafc;
  padding: 9px;
}

.debtor-info-grid span {
  display: block;
  color: #66728a;
  font-size: 0.62rem;
  font-weight: 850;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.debtor-info-grid strong {
  display: block;
  overflow: hidden;
  color: #172943;
  font-size: 0.74rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.breakdown-preview {
  display: grid;
  gap: 5px;
  border-radius: 16px;
  background: #fbfcfd;
  padding: 8px;
}

.breakdown-preview div {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #526078;
  font-size: 0.74rem;
  font-weight: 760;
}

.breakdown-preview span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.breakdown-preview strong {
  color: #e83f4b;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.breakdown-preview button {
  justify-self: start;
  border: 0;
  background: transparent;
  color: #397fe8;
  padding: 0;
  font-size: 0.72rem;
  font-weight: 850;
}

.manual-action {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 6px;
  border: 1px solid #dfe6ef;
  border-radius: 999px;
  background: #fff;
  color: #66728a;
  padding: 0 11px;
  font-size: 0.7rem;
  font-weight: 850;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, color 160ms ease;
}

.manual-action.ready {
  border-color: rgba(101, 167, 68, 0.46);
  background: #f7fcf4;
  color: #2e7235;
}

.manual-action.done {
  border-color: rgba(101, 167, 68, 0.25);
  background: #eaf8e7;
  color: #2e7235;
}

.manual-action.neutral {
  color: #526078;
}

.manual-action:hover:not(:disabled) {
  transform: translateY(-1px);
}

.manual-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.exception-summary {
  display: grid;
  gap: 3px;
  margin-bottom: 18px;
  border-radius: 16px;
  background: #f8fafc;
  padding: 12px;
}

.exception-summary strong {
  color: #172943;
  font-weight: 900;
}

.exception-summary span {
  color: #66728a;
  font-size: 0.8rem;
  font-weight: 700;
}

.exception-note {
  min-height: 116px;
  resize: vertical;
}

.drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: flex-end;
  background: rgba(22, 38, 65, 0.28);
  backdrop-filter: blur(8px);
}

.detail-drawer {
  display: grid;
  width: min(520px, 100%);
  height: 100%;
  grid-template-rows: auto auto minmax(0, auto) minmax(0, auto) 1fr;
  gap: 14px;
  overflow-y: auto;
  background: #fff;
  padding: 22px;
  box-shadow: -20px 0 48px rgba(22, 38, 65, 0.16);
}

.detail-drawer header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.detail-drawer header span {
  color: #3f8468;
  font-size: 0.68rem;
  font-weight: 850;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.detail-drawer h3 {
  margin: 4px 0;
  color: #172943;
  font-size: 1.35rem;
  font-weight: 900;
  letter-spacing: -0.04em;
}

.detail-drawer p {
  margin: 0;
  color: #66728a;
  font-size: 0.84rem;
  font-weight: 680;
}

.drawer-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: 20px;
  background: #fff5f3;
  padding: 16px;
}

.drawer-total span {
  color: #66728a;
  font-size: 0.75rem;
  font-weight: 850;
  text-transform: uppercase;
}

.drawer-total strong {
  color: #e83f4b;
  font-size: 1.45rem;
  font-weight: 900;
}

.drawer-section {
  display: grid;
  gap: 10px;
}

.drawer-section h4 {
  margin: 0;
  color: #172943;
  font-size: 0.88rem;
  font-weight: 900;
}

.drawer-list {
  display: grid;
  gap: 6px;
}

.drawer-list div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #edf2f7;
  border-radius: 14px;
  padding: 10px;
}

.drawer-list span {
  color: #526078;
  font-size: 0.8rem;
  font-weight: 760;
}

.drawer-list strong {
  color: #172943;
  font-size: 0.8rem;
  font-weight: 850;
  white-space: nowrap;
}

.drawer-muted,
.drawer-note {
  border-radius: 14px;
  background: #f8fafc;
  padding: 12px;
}

@media (max-width: 1280px) {
  .flow-ribbon {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .workspace {
    grid-template-columns: 280px minmax(0, 1fr);
  }

  .board-toolbar {
    grid-template-columns: minmax(240px, 1fr) 140px 150px;
  }

  .board-toolbar > .btn {
    width: 100%;
  }
}

@media (max-width: 980px) {
  .debt-command {
    height: auto;
    min-height: 100%;
    overflow: visible;
  }

  .debt-hero,
  .workspace {
    grid-template-columns: 1fr;
  }

  .flow-ribbon {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .debt-board,
  .side-stack,
  .debtor-scroll {
    overflow: visible;
  }

  .board-toolbar,
  .debtor-info-grid {
    grid-template-columns: 1fr;
  }

  .mass-console {
    align-items: stretch;
    flex-direction: column;
  }

  .mass-action {
    justify-content: stretch;
  }

  .mass-action select,
  .mass-action button {
    max-width: none;
    flex: 1;
  }
}

@media (max-width: 680px) {
  .debt-hero,
  .debt-board,
  .debtor-card {
    border-radius: 18px;
  }

  .hero-metrics,
  .flow-ribbon,
  .insight-grid {
    grid-template-columns: 1fr;
  }

  .debtor-head {
    grid-template-columns: auto auto minmax(0, 1fr);
  }

  .saldo-block {
    grid-column: 1 / -1;
    text-align: left;
  }
}
</style>