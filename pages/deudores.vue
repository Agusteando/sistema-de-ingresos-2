<template>
  <div class="debt-page-shell">
    <div ref="debtScaleShell" class="debt-scale-shell" :style="debtScaleShellStyle">
      <div ref="debtDesignCanvas" class="debt-design-canvas" :style="debtDesignCanvasStyle">
        <div class="collections-workspace">
    <section class="command-panel" aria-labelledby="debt-title">
      <div class="command-main">
        <div class="command-topline">
          <span class="kicker">Cobranza guiada</span>
          <div class="command-buttons">
            <button class="quiet-button" @click="loadData" :disabled="loading">
              <LucideRefreshCw :size="16" :class="{ 'animate-spin': loading }" />
              Actualizar
            </button>
            <button class="quiet-button strong" @click="exportData" :disabled="loading || filteredDeudores.length === 0">
              <LucideDownload :size="16" />
              Exportar Excel
            </button>
          </div>
        </div>

        <div class="headline-grid">
          <div>
            <h2 id="debt-title">{{ debtorCount }} alumnos con adeudo</h2>
            <p>{{ currentStageCopy }}</p>
          </div>
          <div class="primary-total">
            <span>Saldo por cobrar</span>
            <strong>{{ formatMoney(totalDebtBalance) }}</strong>
          </div>
        </div>

        <div class="today-action-card">
          <div class="today-action-icon">
            <component :is="selectedActionMeta.icon" :size="21" />
          </div>
          <div class="today-action-copy">
            <span>Accion recomendada</span>
            <strong>{{ selectedActionMeta.massLabel }}</strong>
            <p>{{ selectedActionCopy }}</p>
          </div>
          <button class="primary-action" :disabled="actionableRowsForSelectedAction.length === 0" @click="selectEligibleForAction(selectedMassAction)">
            <LucideListChecks :size="16" />
            Seleccionar {{ actionableRowsForSelectedAction.length }}
          </button>
        </div>
      </div>

      <aside class="metric-stack" aria-label="Resumen de cobranza">
        <div class="metric-card primary">
          <span>Necesitan accion</span>
          <strong>{{ actionableRowsForSelectedAction.length }}</strong>
          <small>{{ selectedActionMeta.shortLabel }} disponible</small>
        </div>
        <div class="metric-card">
          <span>Seleccionados</span>
          <strong>{{ selectedRows.length }}</strong>
          <small>{{ eligibleSelectedRows.length }} listos para ejecutar</small>
        </div>
        <div class="metric-card">
          <span>Atencion</span>
          <strong>{{ attentionCount }}</strong>
          <small>contacto, fecha o conciliacion</small>
        </div>
      </aside>
    </section>

    <section class="stage-strip" aria-label="Calendario de cobranza">
      <div class="stage-summary">
        <span>Dia {{ currentDebtDay }} de {{ currentMonthLastDay }}</span>
        <strong>{{ currentStageTitle }}</strong>
        <div class="stage-progress" aria-hidden="true"><i :style="{ width: `${stageProgress}%` }"></i></div>
      </div>
      <div class="stage-steps">
        <article
          v-for="step in flowSteps"
          :key="step.key"
          class="stage-step"
          :class="{ active: isStepActive(step), today: isStepToday(step) }"
        >
          <span>{{ step.dayLabel }}</span>
          <strong>{{ step.title }}</strong>
        </article>
      </div>
    </section>

    <section class="workflow-shell">
      <aside class="workflow-panel" aria-label="Flujo de cobranza">
        <section class="workflow-card">
          <header>
            <span class="kicker">Elegir accion</span>
            <strong>{{ selectedActionMeta.title }}</strong>
          </header>

          <div class="action-picker" role="group" aria-label="Acciones de cobranza">
            <button
              v-for="action in actionCatalog"
              :key="action.action"
              class="action-choice"
              :class="{ active: selectedMassAction === action.action }"
              @click="selectedMassAction = action.action"
            >
              <component :is="action.icon" :size="16" />
              <span>{{ action.shortLabel }}</span>
              <strong>{{ actionReadyCount(action.action) }}</strong>
            </button>
          </div>

          <button
            v-if="selectedMassAction === 'whatsapp_contacto'"
            class="setup-link"
            @click="openWhatsappSetup"
          >
            <LucideMessageCircle :size="16" />
            Preparar WhatsApp
          </button>
        </section>

        <section class="workflow-card">
          <header>
            <span class="kicker">Ejecutar seguimiento</span>
            <strong>{{ eligibleSelectedRows.length }} listos</strong>
          </header>

          <div class="selection-meter">
            <div>
              <span>Seleccionados</span>
              <strong>{{ selectedRows.length }}</strong>
            </div>
            <div>
              <span>No listos</span>
              <strong>{{ blockedSelectedCount }}</strong>
            </div>
          </div>

          <button
            class="run-button"
            :disabled="eligibleSelectedRows.length === 0 || Boolean(runningAction)"
            @click="executeMassAction"
          >
            <component :is="selectedActionMeta.icon" :size="16" />
            {{ runningAction ? 'Procesando' : selectedActionMeta.massLabel }}
          </button>
        </section>

        <section class="workflow-card">
          <header>
            <span class="kicker">Reporte</span>
            <strong>Excel limpio</strong>
          </header>
          <p>Incluye saldo, contacto, accion sugerida, historial visible y desglose por concepto.</p>
          <button class="report-button" :disabled="loading || filteredDeudores.length === 0" @click="exportData">
            <LucideDownload :size="16" />
            Exportar vista actual
          </button>
        </section>
      </aside>

      <main class="debtor-board">
        <section class="board-toolbar" aria-label="Busqueda y filtros">
          <div class="board-title">
            <span class="kicker">Casos de cobranza</span>
            <strong>{{ filteredDeudores.length }} en pantalla</strong>
          </div>

          <label class="search-field">
            <LucideSearch :size="17" />
            <input v-model="search" type="text" placeholder="Buscar alumno, matricula, tutor, correo o telefono">
          </label>

          <label class="scope-select">
            <span>Alcance</span>
            <select v-model="estatusFiltro">
              <option value="deudores">Con adeudo</option>
              <option value="todos">Todos</option>
              <option value="no_deudores">Sin adeudo exigible</option>
            </select>
          </label>

          <div class="view-tabs" role="group" aria-label="Vista de casos">
            <button
              v-for="option in segmentOptions"
              :key="option.value"
              :class="{ active: segmentFilter === option.value }"
              @click="segmentFilter = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </section>

        <section class="selection-bar" aria-label="Seleccion">
          <label class="select-visible">
            <input
              type="checkbox"
              :checked="allVisibleSelected"
              :disabled="filteredDeudores.length === 0"
              @change="toggleAllVisible($event.target.checked)"
            >
            <span>Seleccionar pantalla</span>
          </label>
          <div>
            <strong>{{ selectedRows.length }} seleccionados</strong>
            <span>{{ eligibleSelectedRows.length }} pueden recibir {{ selectedActionMeta.shortLabel.toLowerCase() }}</span>
          </div>
          <button class="clear-button" :disabled="selectedRows.length === 0" @click="selectedKeys = []">Limpiar</button>
        </section>

        <section class="debtor-list" :class="{ loading }">
          <div class="list-head" aria-hidden="true">
            <span>Alumno</span>
            <span>Saldo</span>
            <span>Contacto</span>
            <span>Siguiente paso</span>
            <span></span>
          </div>

          <div v-if="loading" class="empty-state">
            <span class="liquid-loader"><i></i><i></i><i></i></span>
            <strong>Cargando cartera</strong>
            <p>Preparando saldos, contactos y gestiones registradas.</p>
          </div>

          <div v-else-if="!filteredDeudores.length" class="empty-state">
            <LucideCheckCircle :size="34" />
            <strong>No hay alumnos en esta vista</strong>
            <p>Cambia busqueda, alcance o accion para revisar otros casos.</p>
          </div>

          <template v-else>
            <article
              v-for="d in orderedFilteredDeudores"
              :key="rowKey(d)"
              class="debtor-row"
              :class="{ selected: isSelected(d), ready: canRunAction(d, selectedMassAction) }"
            >
              <div class="row-check">
                <input type="checkbox" :checked="isSelected(d)" :aria-label="`Seleccionar ${d.nombreCompleto}`" @change="toggleOne(d)">
              </div>

              <button class="student-cell" @click="openDetails(d)">
                <span class="student-avatar">{{ initials(d.nombreCompleto) }}</span>
                <span class="student-copy">
                  <strong>{{ d.nombreCompleto }}</strong>
                  <small>{{ d.matricula }} - {{ d.nivel }} - {{ d.grado }} {{ d.grupo || '' }}</small>
                  <em>{{ d.padre || 'Tutor no registrado' }}</em>
                </span>
              </button>

              <div class="amount-cell">
                <strong>{{ formatMoney(saldoValue(d)) }}</strong>
                <span>{{ d.desglose?.length || 0 }} conceptos</span>
              </div>

              <div class="contact-cell">
                <span :class="['contact-pill', d.correo ? 'ok' : 'missing']">
                  <LucideMail :size="13" />
                  {{ d.correo ? 'Correo' : 'Sin correo' }}
                </span>
                <span :class="['contact-pill', d.telefono ? 'ok' : 'missing']">
                  <LucidePhone :size="13" />
                  {{ d.telefono ? 'Telefono' : 'Sin telefono' }}
                </span>
              </div>

              <div class="next-cell">
                <span class="status-pill" :class="readinessClass(d)">{{ readinessLabel(d) }}</span>
                <small>{{ rowNextCopy(d) }}</small>
              </div>

              <div class="row-actions">
                <button
                  v-if="rowRunnableAction(d)"
                  class="row-primary"
                  :disabled="Boolean(runningAction)"
                  @click="runSingleAction(d, rowRunnableAction(d).action)"
                >
                  <component :is="rowRunnableAction(d).icon" :size="15" />
                  {{ rowRunnableAction(d).shortLabel }}
                </button>
                <button v-else class="row-primary muted" disabled>
                  <LucideCheckCircle :size="15" />
                  Sin accion
                </button>
                <button class="row-secondary" @click="openException(d)">
                  <LucideCalendarClock :size="15" />
                  Fecha
                </button>
                <button class="row-secondary" @click="openDetails(d)">
                  <LucideEye :size="15" />
                  Detalle
                </button>
              </div>
            </article>
          </template>
        </section>
      </main>
    </section>

        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showExceptionModal" class="dialog-overlay" @click.self="closeException">
        <div class="dialog">
          <header class="dialog-header">
            <div>
              <span class="kicker">Excepcion</span>
              <h3>Fecha limite especial</h3>
            </div>
            <button class="icon-button" @click="closeException"><LucideX :size="16" /></button>
          </header>
          <div class="dialog-body">
            <div v-if="exceptionTarget" class="exception-summary">
              <strong>{{ exceptionTarget.nombreCompleto }}</strong>
              <span>{{ exceptionTarget.matricula }} - Periodo {{ exceptionTarget.mes }}/{{ normalizeCicloKey(state.ciclo) }}</span>
            </div>
            <label class="form-row">
              <span>Nueva fecha limite</span>
              <input v-model="exceptionForm.fecha" type="date" required>
            </label>
            <label class="form-row">
              <span>Nota</span>
              <textarea
                v-model="exceptionForm.motivo"
                placeholder="Ejemplo: convenio autorizado para pago posterior."
                required
              ></textarea>
            </label>
          </div>
          <footer class="dialog-footer">
            <button class="quiet-button" @click="closeException" :disabled="savingException">Cancelar</button>
            <button class="primary-action" @click="saveException" :disabled="savingException || !exceptionForm.fecha || !exceptionForm.motivo.trim()">
              <LucideCheckCircle :size="16" />
              Guardar
            </button>
          </footer>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showWhatsappSetup" class="dialog-overlay" @click.self="closeWhatsappSetup">
        <div class="dialog wide">
          <header class="dialog-header">
            <div>
              <span class="kicker">WhatsApp</span>
              <h3>Preparar seguimiento</h3>
            </div>
            <button class="icon-button" @click="closeWhatsappSetup"><LucideX :size="16" /></button>
          </header>
          <div class="dialog-body whatsapp-dialog-body">
            <WhatsappOnboarding show-skip auto-start @ready="handleWhatsappReady" @skip="closeWhatsappSetup" />
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="detailsTarget" class="drawer-overlay" @click.self="closeDetails">
        <aside class="detail-drawer">
          <header class="drawer-header">
            <div>
              <span class="kicker">Detalle de cobranza</span>
              <h3>{{ detailsTarget.nombreCompleto }}</h3>
              <p>{{ detailsTarget.matricula }} - {{ detailsTarget.nivel }} - {{ detailsTarget.grado }} {{ detailsTarget.grupo || '' }} - {{ detailsTarget.plantel }}</p>
            </div>
            <button class="icon-button" @click="closeDetails"><LucideX :size="16" /></button>
          </header>

          <section class="drawer-summary">
            <div>
              <span>Saldo pendiente</span>
              <strong>{{ formatMoney(saldoValue(detailsTarget)) }}</strong>
            </div>
            <div>
              <span>Siguiente paso</span>
              <strong>{{ rowRunnableAction(detailsTarget)?.shortLabel || 'Sin accion' }}</strong>
            </div>
            <div>
              <span>Fecha limite</span>
              <strong>{{ formatDate(detailsTarget.fechaLimitePago) }}</strong>
            </div>
          </section>

          <section class="drawer-section">
            <h4>Acciones</h4>
            <div class="drawer-actions-grid">
              <button
                v-for="action in actionCatalog"
                :key="`drawer-${action.action}`"
                :class="{ ready: canRunAction(detailsTarget, action.action), done: isActionCompleted(detailsTarget, action.action) }"
                :disabled="!canRunAction(detailsTarget, action.action) || Boolean(runningAction)"
                @click="runSingleAction(detailsTarget, action.action)"
              >
                <component :is="action.icon" :size="15" />
                {{ action.shortLabel }}
              </button>
              <button class="neutral" @click="openException(detailsTarget)">
                <LucideCalendarClock :size="15" />
                Fecha especial
              </button>
            </div>
          </section>

          <section class="drawer-section">
            <h4>Contacto</h4>
            <div class="drawer-contact">
              <div><span>Tutor</span><strong>{{ detailsTarget.padre || 'No registrado' }}</strong></div>
              <div><span>Correo</span><strong>{{ detailsTarget.correo || 'Sin correo' }}</strong></div>
              <div><span>Telefono</span><strong>{{ detailsTarget.telefono || 'Sin telefono' }}</strong></div>
              <div><span>Ultima gestion</span><strong>{{ detailsTarget.ultimoMovimiento ? formatDate(detailsTarget.ultimoMovimiento) : 'Sin registro' }}</strong></div>
            </div>
          </section>

          <section class="drawer-section">
            <h4>Desglose</h4>
            <div v-if="detailsTarget.desglose?.length" class="drawer-list">
              <div v-for="item in detailsTarget.desglose" :key="`${item.documento}-${item.mesCargo}`">
                <span>{{ item.conceptoNombre }} - {{ item.mesLabel || item.mesCargo }}</span>
                <strong>{{ formatMoney(item.saldo) }}</strong>
              </div>
            </div>
            <p v-else class="drawer-muted">No hay conceptos pendientes en el desglose cargado.</p>
          </section>

          <section class="drawer-section">
            <h4>Historial</h4>
            <div v-if="detailsTarget.accionesRealizadas?.length" class="drawer-list">
              <div v-for="evt in detailsTarget.accionesRealizadas" :key="`${evt.accion}-${evt.fecha}`">
                <span>{{ getActionMeta(evt.accion).massLabel }}</span>
                <strong>{{ formatDate(evt.fecha) }}</strong>
              </div>
            </div>
            <p v-else class="drawer-muted">Aun no hay acciones registradas para este periodo.</p>
          </section>

          <section v-if="detailsTarget.observaciones?.length" class="drawer-section">
            <h4>Observaciones</h4>
            <div class="drawer-list">
              <div v-for="obs in detailsTarget.observaciones.slice(0, 4)" :key="`${obs.fecha}-${obs.texto}`">
                <span>{{ obs.texto }}</span>
                <strong>{{ formatDate(obs.fecha) }}</strong>
              </div>
            </div>
          </section>

          <section v-if="detailsTarget.notaFechaLimiteEspecial" class="drawer-section">
            <h4>Nota de excepcion</h4>
            <p class="drawer-note">{{ detailsTarget.notaFechaLimiteEspecial }}</p>
          </section>
        </aside>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  LucideAlertTriangle,
  LucideCalendarClock,
  LucideCheckCircle,
  LucideClipboardList,
  LucideDownload,
  LucideEye,
  LucideFileText,
  LucideListChecks,
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
import { exportToExcel } from '~/utils/export'
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
const showWhatsappSetup = ref(false)
const exceptionForm = ref({ fecha: '', motivo: '' })

const DEBT_DESIGN_WIDTH = 1540
const DEBT_MIN_DESIGN_HEIGHT = 760
const debtScaleShell = ref(null)
const debtDesignCanvas = ref(null)
const debtWorkspaceScale = ref(1)
const debtCanvasHeight = ref(DEBT_MIN_DESIGN_HEIGHT)
const debtScaleShellStyle = computed(() => ({
  height: `${Math.ceil(debtCanvasHeight.value * debtWorkspaceScale.value)}px`
}))
const debtDesignCanvasStyle = computed(() => ({
  width: `${DEBT_DESIGN_WIDTH}px`,
  height: `${Math.ceil(debtCanvasHeight.value)}px`,
  transform: `scale(${debtWorkspaceScale.value})`
}))

let debtShellObserver = null
let debtContentObserver = null
let debtFrame = null
const updateDebtWorkspaceScale = () => {
  if (typeof window === 'undefined') return
  const shell = debtScaleShell.value
  const availableWidth = Math.max(260, shell?.clientWidth || window.innerWidth || DEBT_DESIGN_WIDTH)
  const nextScale = Math.min(1, Math.max(0.28, availableWidth / DEBT_DESIGN_WIDTH))
  debtWorkspaceScale.value = Number(nextScale.toFixed(4))

  nextTick(() => {
    const measuredHeight = debtDesignCanvas.value?.scrollHeight || DEBT_MIN_DESIGN_HEIGHT
    debtCanvasHeight.value = Math.max(DEBT_MIN_DESIGN_HEIGHT, Math.ceil(measuredHeight))
  })
}
const scheduleDebtWorkspaceScaleUpdate = () => nextTick(() => {
  if (typeof window === 'undefined') return
  if (debtFrame) window.cancelAnimationFrame(debtFrame)
  debtFrame = window.requestAnimationFrame(updateDebtWorkspaceScale)
})

const actionCatalog = [
  {
    action: 'correo_recordatorio',
    day: 13,
    dayLabel: 'Dia 13',
    shortLabel: 'Correo',
    pickLabel: 'Correos listos',
    massLabel: 'Enviar recordatorio por correo',
    title: 'Recordatorio por correo',
    description: 'Primer aviso formal con desglose claro.',
    icon: LucideMail,
    requires: 'correo'
  },
  {
    action: 'reporte_deudores',
    day: 14,
    dayLabel: 'Dia 14',
    shortLabel: 'Corte',
    pickLabel: 'Cortes listos',
    massLabel: 'Registrar corte de deudores',
    title: 'Corte con desglose',
    description: 'Reporte administrativo del saldo vencido.',
    icon: LucideClipboardList
  },
  {
    action: 'whatsapp_contacto',
    day: 20,
    dayLabel: 'Dia 20',
    shortLabel: 'WhatsApp',
    pickLabel: 'WhatsApp listos',
    massLabel: 'Enviar seguimiento por WhatsApp',
    title: 'Seguimiento por WhatsApp',
    description: 'Mensaje breve para familias con telefono.',
    icon: LucideMessageCircle,
    requires: 'telefono'
  },
  {
    action: 'carta_suspension',
    day: 27,
    dayLabel: 'Dia 27',
    shortLabel: 'Carta',
    pickLabel: 'Cartas listas',
    massLabel: 'Generar carta de suspension',
    title: 'Carta de suspension',
    description: 'Documento administrativo para casos avanzados.',
    icon: LucideFileText
  },
  {
    action: 'llamada_telefonica',
    day: null,
    dayLabel: 'Cierre',
    shortLabel: 'Llamada',
    pickLabel: 'Llamadas listas',
    massLabel: 'Registrar llamada de cierre',
    title: 'Llamada de cierre',
    description: 'Gestion final antes de cerrar el periodo.',
    icon: LucidePhone,
    requires: 'telefono'
  }
]

const segmentOptions = [
  { value: 'todos', label: 'Todos' },
  { value: 'listos', label: 'Listos para accion' },
  { value: 'contacto', label: 'Revisar contacto' },
  { value: 'excepciones', label: 'Fecha especial' },
  { value: 'conciliacion', label: 'Pago por conciliar' }
]

const flowSteps = computed(() => [
  { key: 'periodo-pago', day: 1, dayLabel: '1-12', title: 'Pago regular', icon: LucideUsers },
  ...actionCatalog.map(action => ({
    key: action.action,
    day: action.day,
    dayLabel: action.dayLabel,
    title: action.title,
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
const stageProgress = computed(() => Math.min(100, Math.max(0, Math.round((currentDebtDay.value / currentMonthLastDay.value) * 100))))

const currentStageTitle = computed(() => {
  const day = currentDebtDay.value
  if (day <= 12) return 'Periodo de pago'
  if (day === 13) return 'Recordatorio por correo'
  if (day >= 14 && day <= 19) return 'Corte de deudores'
  if (day >= 20 && day <= 26) return 'Seguimiento por WhatsApp'
  if (day === 27) return 'Carta de suspension'
  if (day >= currentMonthLastDay.value) return 'Cierre de mes'
  return 'Preparacion de cierre'
})

const currentStageCopy = computed(() => {
  const day = currentDebtDay.value
  if (day <= 12) return 'El periodo regular sigue abierto. La pantalla muestra saldos vencidos reales y evita acciones prematuras.'
  if (day === 13) return 'Hoy conviene enviar el primer recordatorio a familias con correo registrado.'
  if (day >= 14 && day <= 19) return 'La prioridad es confirmar el corte y tener un reporte claro por alumno y concepto.'
  if (day >= 20 && day <= 26) return 'El seguimiento se mueve a WhatsApp para los alumnos con telefono registrado.'
  if (day === 27) return 'Los casos avanzados ya pueden pasar a carta administrativa.'
  if (day >= currentMonthLastDay.value) return 'El cierre requiere llamadas registradas y un historial limpio de seguimiento.'
  return 'Las acciones vencidas siguen disponibles; atiende primero las que ya estan listas.'
})

const getActionMeta = (action) => actionCatalog.find(item => item.action === action) || {
  action,
  shortLabel: String(action || 'Accion'),
  pickLabel: String(action || 'Accion'),
  massLabel: String(action || 'Accion'),
  title: String(action || 'Accion'),
  icon: LucideShieldCheck
}

const isActionCompleted = (d, action) => (d?.accionesRealizadas || []).some(evt => String(evt.accion) === action)
const isActionExpected = (d, action) => (d?.accionesEsperadas || []).some(item => String(item.action) === action)

const canRunAction = (d, action) => {
  if (!d?.isDeudor) return false
  if (isActionCompleted(d, action)) return false
  if (!isActionExpected(d, action)) return false
  const meta = getActionMeta(action)
  if (meta.requires === 'correo' && !d.correo) return false
  if (meta.requires === 'telefono' && !d.telefono) return false
  return true
}

const nextRunnableAction = (d) => {
  if (d?.proximaAccion && canRunAction(d, d.proximaAccion)) return getActionMeta(d.proximaAccion)
  return actionCatalog.find(action => canRunAction(d, action.action)) || null
}

const rowRunnableAction = (d) => {
  if (canRunAction(d, selectedMassAction.value)) return selectedActionMeta.value
  return nextRunnableAction(d)
}

const missingRequirementForAction = (d, action = selectedMassAction.value) => {
  const meta = getActionMeta(action)
  if (meta.requires === 'correo' && !d?.correo) return 'correo'
  if (meta.requires === 'telefono' && !d?.telefono) return 'telefono'
  return ''
}

const needsContactAttention = (d) => Boolean(missingRequirementForAction(d)) || !d.correo || !d.telefono

const rowMatchesView = (d, query = normalizeText(search.value), segment = segmentFilter.value) => {
  const matchesSearch = !query || [d.nombreCompleto, d.matricula, d.padre, d.correo, d.telefono, d.plantel]
    .some(value => normalizeText(value).includes(query))

  if (!matchesSearch) return false
  if (segment === 'listos') return Boolean(canRunAction(d, selectedMassAction.value))
  if (segment === 'contacto') return needsContactAttention(d)
  if (segment === 'excepciones') return Boolean(d.fechaLimiteEspecialVigente)
  if (segment === 'conciliacion') return Boolean(d.pagoPendienteConciliacion)
  return true
}

const filteredDeudores = computed(() => {
  const q = normalizeText(search.value)
  return deudores.value.filter(d => rowMatchesView(d, q, segmentFilter.value))
})

const orderedFilteredDeudores = computed(() => {
  return [...filteredDeudores.value].sort((a, b) => {
    const readyDelta = Number(canRunAction(b, selectedMassAction.value)) - Number(canRunAction(a, selectedMassAction.value))
    if (readyDelta) return readyDelta
    const contactDelta = Number(needsContactAttention(b)) - Number(needsContactAttention(a))
    if (contactDelta) return contactDelta
    return saldoValue(b) - saldoValue(a) || String(a.nombreCompleto || '').localeCompare(String(b.nombreCompleto || ''), 'es')
  })
})

const selectedRows = computed(() => {
  const keys = new Set(selectedKeys.value)
  return deudores.value.filter(d => keys.has(rowKey(d)))
})

const allVisibleSelected = computed(() => {
  return filteredDeudores.value.length > 0 && filteredDeudores.value.every(d => selectedKeys.value.includes(rowKey(d)))
})

const debtorRows = computed(() => deudores.value.filter(d => d.isDeudor))
const debtorCount = computed(() => debtorRows.value.length)
const totalDebtBalance = computed(() => debtorRows.value.reduce((sum, d) => sum + saldoValue(d), 0))
const pendingConciliationCount = computed(() => deudores.value.filter(d => d.pagoPendienteConciliacion).length)
const exceptionCount = computed(() => deudores.value.filter(d => d.fechaLimiteEspecialVigente).length)
const contactAttentionCount = computed(() => deudores.value.filter(d => needsContactAttention(d)).length)
const attentionCount = computed(() => pendingConciliationCount.value + exceptionCount.value + contactAttentionCount.value)

const selectedActionMeta = computed(() => getActionMeta(selectedMassAction.value))
const actionableRowsForSelectedAction = computed(() => filteredDeudores.value.filter(d => canRunAction(d, selectedMassAction.value)))
const eligibleSelectedRows = computed(() => selectedRows.value.filter(d => canRunAction(d, selectedMassAction.value)))
const blockedSelectedCount = computed(() => Math.max(0, selectedRows.value.length - eligibleSelectedRows.value.length))

const selectedActionCopy = computed(() => {
  if (selectedMassAction.value === 'correo_recordatorio') return 'Selecciona alumnos con correo y saldo vencido para enviar el primer aviso.'
  if (selectedMassAction.value === 'reporte_deudores') return 'Registra el corte y descarga un Excel con el desglose que necesita administracion.'
  if (selectedMassAction.value === 'whatsapp_contacto') return 'Usa WhatsApp solo con telefono registrado; la vinculacion aparece como paso guiado cuando haga falta.'
  if (selectedMassAction.value === 'carta_suspension') return 'Genera cartas para casos avanzados sin perder el historial.'
  return 'Registra llamadas para cerrar el periodo con trazabilidad.'
})

const actionReadyCount = (action) => filteredDeudores.value.filter(d => canRunAction(d, action)).length

const hasBlockingOverlay = computed(() => showExceptionModal.value || showWhatsappSetup.value || Boolean(detailsTarget.value))

watch(hasBlockingOverlay, (val) => {
  if (typeof document !== 'undefined') document.body.style.overflow = val ? 'hidden' : ''
})

watch([
  loading,
  search,
  segmentFilter,
  selectedMassAction,
  () => filteredDeudores.value.length,
  () => selectedRows.value.length
], scheduleDebtWorkspaceScaleUpdate)

watch(() => normalizeCicloKey(state.value.ciclo), () => loadData())
watch(estatusFiltro, () => loadData())

watch(deudores, () => {
  const validKeys = new Set(deudores.value.map(rowKey))
  selectedKeys.value = selectedKeys.value.filter(key => validKeys.has(key))

  const actionToday = deudores.value.find(d => d.accionHoy)?.accionHoy
  const nextAction = deudores.value.find(d => d.proximaAccion)?.proximaAccion
  if (actionToday) selectedMassAction.value = actionToday
  else if (nextAction) selectedMassAction.value = nextAction
})

onMounted(() => {
  if (typeof document !== 'undefined') document.body.classList.add('deudores-page-active')
  scheduleDebtWorkspaceScaleUpdate()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', scheduleDebtWorkspaceScaleUpdate, { passive: true })
    if (typeof ResizeObserver !== 'undefined') {
      if (debtScaleShell.value) {
        debtShellObserver = new ResizeObserver(scheduleDebtWorkspaceScaleUpdate)
        debtShellObserver.observe(debtScaleShell.value)
      }
      if (debtDesignCanvas.value) {
        debtContentObserver = new ResizeObserver(scheduleDebtWorkspaceScaleUpdate)
        debtContentObserver.observe(debtDesignCanvas.value)
      }
    }
  }
  loadData()
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', scheduleDebtWorkspaceScaleUpdate)
    if (debtFrame) window.cancelAnimationFrame(debtFrame)
  }
  debtShellObserver?.disconnect?.()
  debtContentObserver?.disconnect?.()
  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
    document.body.classList.remove('deudores-page-active')
  }
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

const readinessClass = (d) => {
  if (!d.isDeudor) return 'muted'
  if (d.pagoPendienteConciliacion) return 'info'
  if (d.fechaLimiteEspecialVigente) return 'info'
  if (canRunAction(d, selectedMassAction.value)) return 'ready'
  if (isActionCompleted(d, selectedMassAction.value)) return 'done'
  if (missingRequirementForAction(d)) return 'warning'
  if (d.deudorOficial) return 'danger'
  return 'muted'
}

const readinessLabel = (d) => {
  if (!d.isDeudor) return 'Sin adeudo exigible'
  if (d.pagoPendienteConciliacion) return 'Pago por conciliar'
  if (d.fechaLimiteEspecialVigente) return 'Fecha especial'
  if (canRunAction(d, selectedMassAction.value)) return 'Listo'
  if (isActionCompleted(d, selectedMassAction.value)) return 'Registrado'
  const missing = missingRequirementForAction(d)
  if (missing === 'correo') return 'Falta correo'
  if (missing === 'telefono') return 'Falta telefono'
  if (d.deudorOficial) return 'Cierre administrativo'
  return d.estatusFlujoLabel || 'En seguimiento'
}

const rowNextCopy = (d) => {
  const runnable = rowRunnableAction(d)
  if (runnable) return `${runnable.massLabel}`
  if (d.pagoPendienteConciliacion) return 'Verifica conciliacion antes de contactar.'
  if (d.fechaLimiteEspecialVigente) return `Esperar hasta ${formatDate(d.fechaLimitePago)}.`
  const missing = missingRequirementForAction(d)
  if (missing) return `Actualiza ${missing} para continuar.`
  if (!d.isDeudor) return 'No requiere cobranza.'
  return 'Sin accion disponible por regla de dia.'
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
  segmentFilter.value = 'listos'
  selectedKeys.value = filteredDeudores.value
    .filter(d => canRunAction(d, action))
    .map(rowKey)
}

const runSingleAction = async (d, action) => {
  await executeManualAction([d], action, { clearSelection: false })
}

const executeMassAction = async () => {
  await executeManualAction(eligibleSelectedRows.value, selectedMassAction.value, { clearSelection: true })
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
    if (duplicated) parts.push(`${duplicated} ya existian`)
    if (failed) parts.push(`${failed} fallidos`)
    show(parts.join(', ') + '.')

    const whatsappBlocked = action === 'whatsapp_contacto' && failed > 0 && (response?.results || [])
      .some(item => /whatsapp|cliente|vinculad/i.test(String(item?.message || '')))
    if (whatsappBlocked) openWhatsappSetup()

    if (options.clearSelection) selectedKeys.value = []
    await loadData()
  } catch (e) {
    show(e?.statusMessage || 'No se pudo ejecutar la accion.', 'danger')
    if (action === 'whatsapp_contacto' && /whatsapp|cliente|vinculad/i.test(String(e?.statusMessage || e?.message || ''))) {
      openWhatsappSetup()
    }
  } finally {
    runningAction.value = ''
  }
}

const exportColumns = [
  { key: 'Prioridad', label: 'Prioridad', type: 'text' },
  { key: 'Accion_Sugerida', label: 'Accion sugerida', type: 'text' },
  { key: 'Estado_Cobranza', label: 'Estado de cobranza', type: 'text' },
  { key: 'Alumno', label: 'Alumno', type: 'text' },
  { key: 'Matricula', label: 'Matricula', type: 'text' },
  { key: 'Plantel', label: 'Plantel', type: 'text' },
  { key: 'Nivel', label: 'Nivel', type: 'text' },
  { key: 'Grado', label: 'Grado', type: 'text' },
  { key: 'Grupo', label: 'Grupo', type: 'text' },
  { key: 'Tutor', label: 'Tutor', type: 'text' },
  { key: 'Correo', label: 'Correo', type: 'text' },
  { key: 'Telefono', label: 'Telefono', type: 'text' },
  { key: 'Saldo_Total_MXN', label: 'Saldo total MXN', type: 'currency' },
  { key: 'Fecha_Limite', label: 'Fecha limite', type: 'date' },
  { key: 'Fecha_Especial', label: 'Fecha especial vigente', type: 'text' },
  { key: 'Pago_Por_Conciliar', label: 'Pago por conciliar', type: 'text' },
  { key: 'Ultima_Gestion', label: 'Ultima gestion', type: 'date' },
  { key: 'Conceptos_Vencidos', label: 'Conceptos vencidos', type: 'number' },
  { key: 'Concepto', label: 'Concepto', type: 'text' },
  { key: 'Periodo', label: 'Periodo', type: 'text' },
  { key: 'Saldo_Concepto_MXN', label: 'Saldo concepto MXN', type: 'currency' },
  { key: 'Total_Pagado_MXN', label: 'Total pagado MXN', type: 'currency' },
  { key: 'Nota', label: 'Nota', type: 'text' }
]

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
    const rowsForExport = rows.filter(d => rowMatchesView(d, q, segmentFilter.value))

    if (!rowsForExport.length) {
      show('No hay datos para exportar.', 'danger')
      return
    }

    exportToExcel(`Reporte_deudores_${normalizeCicloKey(state.value.ciclo)}.xls`, buildExportRows(rowsForExport), {
      title: 'Reporte de cobranza escolar',
      subtitle: `${rowsForExport.length} alumnos en la vista - ${selectedActionMeta.value.massLabel} - ciclo ${normalizeCicloKey(state.value.ciclo)}`,
      sheetName: 'Cobranza',
      columns: exportColumns
    })
  } catch (e) {
    show('No se pudo exportar el reporte de deudores.', 'danger')
  } finally {
    loading.value = false
  }
}

const buildExportRows = (rows) => rows.flatMap((d) => {
  const nextAction = rowRunnableAction(d) || nextRunnableAction(d)
  const base = {
    Prioridad: readinessLabel(d),
    Accion_Sugerida: nextAction?.massLabel || '',
    Estado_Cobranza: d.estatusFlujoLabel || d.estatusFlujo || '',
    Alumno: d.nombreCompleto || '',
    Matricula: d.matricula || '',
    Plantel: d.plantel || '',
    Nivel: d.nivel || '',
    Grado: d.grado || '',
    Grupo: d.grupo || '',
    Tutor: d.padre || 'No registrado',
    Correo: d.correo || 'Sin correo',
    Telefono: d.telefono || 'Sin telefono',
    Saldo_Total_MXN: saldoValue(d).toFixed(2),
    Fecha_Limite: d.fechaLimitePago || '',
    Fecha_Especial: d.fechaLimiteEspecialVigente ? 'Si' : 'No',
    Pago_Por_Conciliar: d.pagoPendienteConciliacion ? 'Si' : 'No',
    Ultima_Gestion: d.ultimoMovimiento || '',
    Conceptos_Vencidos: d.desglose?.length || 0,
    Total_Pagado_MXN: Number(d.totalPagado || 0).toFixed(2),
    Nota: d.notaFechaLimiteEspecial || ''
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
  exportToExcel(`Corte_deudores_${normalizeCicloKey(state.value.ciclo)}.xls`, buildExportRows(rows), {
    title: 'Corte de deudores',
    subtitle: `${rows.length} alumnos seleccionados - ciclo ${normalizeCicloKey(state.value.ciclo)}`,
    sheetName: 'Corte',
    columns: exportColumns
  })
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
      <span>Carta de suspension - ${formatDate(new Date())}</span>
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
    <footer>Administracion y Cobranza</footer>
  </section>
`

const downloadSuspensionLetters = (rows) => {
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Cartas de suspension</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; color: #162641; background: #f8fafc; }
    .letter { width: min(760px, calc(100% - 48px)); margin: 24px auto; padding: 34px; background: #fff; border: 1px solid #dfe6ef; border-radius: 8px; page-break-after: always; }
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
  detailsTarget.value = null
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
    show('Fecha limite especial guardada.')
    closeException()
    await loadData()
  } catch (e) {
    show(e?.statusMessage || 'No se pudo guardar la excepcion.', 'danger')
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

const openWhatsappSetup = () => {
  showWhatsappSetup.value = true
}

const closeWhatsappSetup = () => {
  showWhatsappSetup.value = false
}

const handleWhatsappReady = () => {
  show('WhatsApp listo para seguimiento.')
  closeWhatsappSetup()
}
</script>

<style scoped>
:global(body.deudores-page-active) {
  --debt-ink: #162235;
  --debt-muted: #627086;
  --debt-faint: #8792a3;
  --debt-line: #dde6e2;
  --debt-soft-line: #eef3ef;
  --debt-paper: #ffffff;
  --debt-canvas: #f7faf8;
  --debt-green: #3f7e36;
  --debt-teal: #168575;
  --debt-blue: #3469a6;
  --debt-amber: #9a6817;
  --debt-coral: #bd493e;
  --debt-shadow: 0 16px 38px rgba(22, 34, 53, 0.07);
}

:global(body.deudores-page-active .income-main) {
  overflow-y: auto;
  overscroll-behavior-y: contain;
  background: linear-gradient(180deg, #ffffff 0%, var(--debt-canvas) 100%);
}

:global(body.deudores-page-active .income-main::before) {
  display: none;
}

:global(body.deudores-page-active .income-content) {
  display: block;
  min-height: auto;
  overflow: visible;
  padding-top: 18px;
  padding-bottom: 40px;
}

:global(body.deudores-page-active .income-sidebar) {
  overflow-y: auto;
  overscroll-behavior: contain;
}

.collections-workspace {
  display: grid;
  width: min(100%, 1540px);
  margin: 0 auto;
  gap: 14px;
}

.command-panel,
.stage-strip,
.workflow-card,
.board-toolbar,
.selection-bar,
.debtor-list,
.debtor-row,
.empty-state,
.dialog,
.detail-drawer {
  border: 1px solid var(--debt-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: var(--debt-shadow);
}

.command-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 330px);
  gap: 14px;
  align-items: stretch;
}

.command-main {
  display: grid;
  gap: 20px;
  min-height: 260px;
  border: 1px solid var(--debt-line);
  border-radius: 8px;
  background:
    linear-gradient(90deg, rgba(63, 126, 54, 0.045) 1px, transparent 1px),
    linear-gradient(180deg, #ffffff 0%, #f9fbfa 100%);
  background-size: 42px 42px, auto;
  padding: 28px;
  box-shadow: var(--debt-shadow);
}

.command-topline,
.headline-grid,
.command-buttons,
.today-action-card,
.stage-strip,
.selection-bar,
.dialog-header,
.dialog-footer,
.drawer-header {
  display: flex;
  align-items: center;
}

.command-topline,
.headline-grid,
.stage-strip,
.selection-bar,
.dialog-header,
.dialog-footer,
.drawer-header {
  justify-content: space-between;
  gap: 16px;
}

.kicker,
.primary-total span,
.metric-card span,
.metric-card small,
.stage-summary span,
.stage-step span,
.board-title span,
.scope-select span,
.selection-bar span,
.today-action-copy span,
.selection-meter span,
.drawer-summary span,
.drawer-contact span {
  color: var(--debt-muted);
  font-size: 0.68rem;
  font-weight: 850;
  letter-spacing: 0;
  text-transform: uppercase;
}

.kicker {
  color: var(--debt-green);
}

.command-buttons {
  flex-wrap: wrap;
  gap: 8px;
}

.quiet-button,
.primary-action,
.run-button,
.report-button,
.setup-link,
.clear-button,
.action-choice,
.row-primary,
.row-secondary,
.icon-button,
.drawer-actions-grid button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 38px;
  border-radius: 7px;
  border: 1px solid var(--debt-line);
  background: #fff;
  color: var(--debt-ink);
  font-size: 0.78rem;
  font-weight: 820;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
}

.quiet-button,
.primary-action,
.run-button,
.report-button,
.setup-link,
.clear-button,
.row-primary,
.row-secondary,
.icon-button,
.drawer-actions-grid button {
  padding: 0 12px;
}

.quiet-button.strong,
.primary-action,
.run-button {
  border-color: #bfd9c4;
  background: #edf7ee;
  color: #285f33;
}

.report-button {
  width: 100%;
}

.quiet-button:hover:not(:disabled),
.primary-action:hover:not(:disabled),
.run-button:hover:not(:disabled),
.report-button:hover:not(:disabled),
.setup-link:hover:not(:disabled),
.row-primary:hover:not(:disabled),
.row-secondary:hover:not(:disabled),
.drawer-actions-grid button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(22, 34, 53, 0.08);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.headline-grid {
  align-items: end;
}

.headline-grid h2 {
  max-width: 760px;
  margin: 0;
  color: var(--debt-ink);
  font-size: clamp(2rem, 4vw, 3.6rem);
  font-weight: 920;
  line-height: 1.02;
  letter-spacing: 0;
}

.headline-grid p,
.workflow-card p,
.empty-state p,
.drawer-header p {
  margin: 8px 0 0;
  color: var(--debt-muted);
  font-size: 0.9rem;
  font-weight: 620;
  line-height: 1.55;
}

.primary-total {
  min-width: 210px;
  border-left: 1px solid var(--debt-soft-line);
  padding-left: 18px;
  text-align: right;
}

.primary-total strong {
  display: block;
  margin-top: 3px;
  color: var(--debt-coral);
  font-size: 1.85rem;
  line-height: 1;
}

.today-action-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  border: 1px solid #dce8df;
  border-radius: 8px;
  background: #fbfdfb;
  padding: 14px;
}

.today-action-icon,
.student-avatar {
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: #eaf6ee;
  color: var(--debt-green);
}

.today-action-icon {
  width: 46px;
  height: 46px;
}

.today-action-copy strong {
  display: block;
  margin-top: 2px;
  color: var(--debt-ink);
  font-size: 1.02rem;
  line-height: 1.2;
}

.today-action-copy p {
  margin: 3px 0 0;
  color: var(--debt-muted);
  font-size: 0.8rem;
  font-weight: 640;
}

.metric-stack {
  display: grid;
  gap: 10px;
}

.metric-card {
  display: grid;
  gap: 4px;
  border: 1px solid var(--debt-line);
  border-radius: 8px;
  background: #fff;
  padding: 16px;
}

.metric-card.primary {
  background: #fbf7ef;
}

.metric-card strong {
  color: var(--debt-ink);
  font-size: 2rem;
  line-height: 1;
}

.metric-card.primary strong {
  color: var(--debt-amber);
}

.metric-card small {
  text-transform: none;
  font-size: 0.72rem;
}

.stage-strip {
  padding: 13px 15px;
  box-shadow: 0 10px 28px rgba(22, 34, 53, 0.045);
}

.stage-summary {
  min-width: 210px;
}

.stage-summary strong {
  display: block;
  margin-top: 2px;
  color: var(--debt-ink);
  font-size: 0.95rem;
}

.stage-progress {
  height: 6px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #eef2ef;
}

.stage-progress i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #5b9850, #249486, #c79a4a);
}

.stage-steps {
  display: grid;
  flex: 1;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
}

.stage-step {
  min-width: 0;
  border: 1px solid var(--debt-soft-line);
  border-radius: 8px;
  background: #fbfcfb;
  padding: 9px 10px;
}

.stage-step.active {
  border-color: #d0e5d4;
  background: #f3faf3;
}

.stage-step.today {
  box-shadow: inset 0 3px 0 var(--debt-green);
}

.stage-step strong {
  display: block;
  overflow: hidden;
  color: var(--debt-ink);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-shell {
  display: grid;
  grid-template-columns: minmax(250px, 292px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.workflow-panel {
  position: sticky;
  top: 82px;
  display: grid;
  max-height: calc(100vh - 106px);
  gap: 12px;
  overflow-y: auto;
  padding-right: 3px;
  overscroll-behavior: contain;
}

.workflow-card {
  display: grid;
  gap: 13px;
  padding: 15px;
  box-shadow: none;
}

.workflow-card header {
  display: grid;
  gap: 3px;
}

.workflow-card header strong {
  color: var(--debt-ink);
  font-size: 1rem;
}

.action-picker {
  display: grid;
  gap: 7px;
}

.action-choice {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  width: 100%;
  justify-content: stretch;
  padding: 9px 10px;
  text-align: left;
}

.action-choice span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-choice.active {
  border-color: #c9dfcd;
  background: #f2f8f3;
  color: #285f33;
}

.setup-link {
  justify-self: start;
  border-color: #c7dfe0;
  background: #f2f9f8;
  color: var(--debt-teal);
}

.selection-meter {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.selection-meter div {
  display: grid;
  gap: 3px;
  border: 1px solid var(--debt-soft-line);
  border-radius: 8px;
  background: #fbfdfb;
  padding: 10px;
}

.selection-meter strong {
  color: var(--debt-ink);
  font-size: 1.3rem;
  line-height: 1;
}

.run-button {
  width: 100%;
}

.debtor-board {
  display: grid;
  min-width: 0;
  gap: 10px;
}

.board-toolbar {
  display: grid;
  grid-template-columns: minmax(150px, 220px) minmax(260px, 1fr) minmax(140px, 176px);
  gap: 10px;
  align-items: end;
  padding: 12px;
  box-shadow: none;
}

.board-title {
  display: grid;
  gap: 2px;
}

.board-title strong {
  color: var(--debt-ink);
  font-size: 1.15rem;
}

.search-field,
.scope-select select {
  min-height: 42px;
  border: 1px solid var(--debt-line);
  border-radius: 8px;
  background: #fbfcfb;
}

.search-field {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 12px;
}

.search-field svg {
  color: var(--debt-muted);
}

.search-field input,
.scope-select select,
.form-row input,
.form-row textarea {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--debt-ink);
  font-size: 0.84rem;
  font-weight: 720;
  outline: none;
}

.scope-select {
  display: grid;
  gap: 4px;
}

.scope-select select {
  padding: 0 10px;
}

.view-tabs {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  min-height: 40px;
  border: 1px solid var(--debt-line);
  border-radius: 8px;
  background: #f3f6f4;
  padding: 3px;
}

.view-tabs button {
  min-width: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--debt-muted);
  font-size: 0.72rem;
  font-weight: 850;
}

.view-tabs button.active {
  background: #fff;
  color: var(--debt-ink);
  box-shadow: 0 5px 14px rgba(22, 34, 53, 0.06);
}

.selection-bar {
  min-height: 58px;
  padding: 10px 12px;
  box-shadow: none;
}

.select-visible {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: var(--debt-ink);
  font-size: 0.82rem;
  font-weight: 780;
}

.selection-bar div {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.selection-bar strong {
  color: var(--debt-ink);
  font-size: 0.9rem;
}

.clear-button {
  min-height: 34px;
}

.debtor-list {
  display: grid;
  overflow: hidden;
  box-shadow: none;
}

.list-head,
.debtor-row {
  display: grid;
  grid-template-columns: 30px minmax(170px, 1.35fr) minmax(92px, 0.5fr) minmax(112px, 0.55fr) minmax(134px, 0.65fr) minmax(128px, 0.55fr);
  align-items: center;
  gap: 8px;
}

.list-head {
  border-bottom: 1px solid var(--debt-soft-line);
  background: #f8faf8;
  padding: 10px 14px;
  color: var(--debt-muted);
  font-size: 0.68rem;
  font-weight: 850;
  text-transform: uppercase;
}

.list-head span:first-child {
  grid-column: 2;
}

.debtor-row {
  border: 0;
  border-bottom: 1px solid var(--debt-soft-line);
  border-radius: 0;
  padding: 12px 14px;
  background: #fff;
  box-shadow: none;
}

.debtor-row:last-child {
  border-bottom: 0;
}

.debtor-row.selected {
  background: #f4faf5;
}

.debtor-row.ready {
  box-shadow: inset 3px 0 0 #6ba85b;
}

.row-check {
  display: grid;
  place-items: center;
}

input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--debt-green);
}

.student-cell {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 11px;
  align-items: center;
  min-width: 0;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
}

.student-avatar {
  width: 42px;
  height: 42px;
  color: #285f33;
  font-size: 0.78rem;
  font-weight: 900;
}

.student-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.student-copy strong {
  min-width: 0;
  overflow: hidden;
  color: var(--debt-ink);
  font-size: 0.92rem;
  font-weight: 850;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.student-copy small,
.student-copy em,
.amount-cell span,
.next-cell small {
  min-width: 0;
  overflow: hidden;
  color: var(--debt-muted);
  font-size: 0.74rem;
  font-style: normal;
  font-weight: 650;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.amount-cell {
  display: grid;
  gap: 3px;
}

.amount-cell strong {
  color: var(--debt-coral);
  font-size: 1rem;
}

.contact-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.contact-pill,
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  border-radius: 999px;
  padding: 0 8px;
  font-size: 0.66rem;
  font-weight: 850;
  white-space: nowrap;
}

.contact-pill.ok {
  background: #eef7ef;
  color: #2e6f35;
}

.contact-pill.missing {
  background: #fff4e2;
  color: var(--debt-amber);
}

.next-cell {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.status-pill.ready {
  background: #eaf7eb;
  color: #2e6f35;
}

.status-pill.done {
  background: #e9f0f8;
  color: var(--debt-blue);
}

.status-pill.info {
  background: #eef8f7;
  color: var(--debt-teal);
}

.status-pill.warning {
  background: #fff4e2;
  color: var(--debt-amber);
}

.status-pill.danger {
  background: #fdecea;
  color: var(--debt-coral);
}

.status-pill.muted {
  background: #f1f3f4;
  color: var(--debt-muted);
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.row-primary,
.row-secondary {
  min-height: 32px;
  padding: 0 8px;
  font-size: 0.68rem;
}

.row-primary {
  border-color: #bfd9c4;
  background: #edf7ee;
  color: #285f33;
}

.row-primary.muted,
.row-secondary {
  border-color: var(--debt-soft-line);
  background: #fff;
  color: var(--debt-muted);
}

.empty-state {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 260px;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  padding: 32px;
  text-align: center;
}

.empty-state strong {
  color: var(--debt-ink);
  font-size: 1rem;
}

.empty-state svg {
  color: var(--debt-green);
}

.dialog-overlay,
.drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  background: rgba(22, 34, 53, 0.34);
  backdrop-filter: blur(6px);
}

.dialog-overlay {
  align-items: center;
  justify-content: center;
  padding: 18px;
}

.dialog {
  width: min(100%, 560px);
  max-height: min(90vh, calc(100dvh - 36px));
  overflow: hidden;
}

.dialog.wide {
  width: min(100%, 780px);
}

.dialog-header {
  border-bottom: 1px solid var(--debt-soft-line);
  padding: 16px 18px;
}

.dialog-header h3,
.drawer-header h3 {
  margin: 2px 0 0;
  color: var(--debt-ink);
  font-size: 1.16rem;
}

.dialog-body {
  display: grid;
  gap: 14px;
  max-height: calc(90vh - 132px);
  overflow-y: auto;
  padding: 18px;
}

.whatsapp-dialog-body {
  background: #f9fbfa;
}

.whatsapp-dialog-body :deep(.whatsapp-onboarding) {
  border-radius: 8px;
  box-shadow: none;
}

.dialog-footer {
  border-top: 1px solid var(--debt-soft-line);
  padding: 14px 18px;
}

.icon-button {
  width: 34px;
  min-height: 34px;
  padding: 0;
}

.exception-summary {
  display: grid;
  gap: 2px;
  border: 1px solid var(--debt-soft-line);
  border-radius: 8px;
  background: #fbfdfb;
  padding: 12px;
}

.exception-summary strong {
  color: var(--debt-ink);
}

.exception-summary span {
  color: var(--debt-muted);
  font-size: 0.78rem;
  font-weight: 650;
}

.form-row {
  display: grid;
  gap: 6px;
}

.form-row span {
  color: var(--debt-muted);
  font-size: 0.72rem;
  font-weight: 850;
  text-transform: uppercase;
}

.form-row input,
.form-row textarea {
  border: 1px solid var(--debt-line);
  border-radius: 8px;
  background: #fff;
  padding: 10px 12px;
}

.form-row textarea {
  min-height: 110px;
  resize: vertical;
}

.drawer-overlay {
  justify-content: flex-end;
}

.detail-drawer {
  display: grid;
  width: min(560px, 100%);
  max-height: 100dvh;
  overflow-y: auto;
  border-radius: 8px 0 0 8px;
  box-shadow: -18px 0 38px rgba(22, 34, 53, 0.12);
}

.drawer-header {
  align-items: flex-start;
  border-bottom: 1px solid var(--debt-soft-line);
  padding: 20px;
}

.drawer-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 14px 20px;
}

.drawer-summary div {
  display: grid;
  gap: 3px;
  border: 1px solid var(--debt-soft-line);
  border-radius: 8px;
  background: #fbfdfb;
  padding: 10px;
}

.drawer-summary strong {
  min-width: 0;
  overflow: hidden;
  color: var(--debt-ink);
  font-size: 0.9rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-section {
  display: grid;
  gap: 10px;
  border-top: 1px solid var(--debt-soft-line);
  padding: 16px 20px;
}

.drawer-section h4 {
  margin: 0;
  color: var(--debt-ink);
  font-size: 0.92rem;
}

.drawer-actions-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.drawer-actions-grid button {
  min-width: 0;
  min-height: 36px;
  padding: 0 8px;
  font-size: 0.72rem;
}

.drawer-actions-grid button.ready {
  border-color: #bfd9c4;
  background: #edf7ee;
  color: #285f33;
}

.drawer-actions-grid button.done {
  border-color: #d8e5f4;
  background: #eef5fc;
  color: var(--debt-blue);
}

.drawer-actions-grid button.neutral {
  color: var(--debt-muted);
}

.drawer-contact {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.drawer-contact div {
  display: grid;
  gap: 3px;
  border: 1px solid var(--debt-soft-line);
  border-radius: 8px;
  background: #fbfdfb;
  padding: 10px;
}

.drawer-contact strong {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--debt-ink);
  font-size: 0.82rem;
}

.drawer-list {
  display: grid;
  gap: 7px;
}

.drawer-list div {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  border: 1px solid var(--debt-soft-line);
  border-radius: 8px;
  background: #fbfdfb;
  padding: 10px;
}

.drawer-list span {
  min-width: 0;
  color: var(--debt-muted);
  font-size: 0.78rem;
  font-weight: 650;
}

.drawer-list strong {
  color: var(--debt-ink);
  font-size: 0.8rem;
  white-space: nowrap;
}

.drawer-muted,
.drawer-note {
  margin: 0;
  color: var(--debt-muted);
  font-size: 0.82rem;
  font-weight: 650;
  line-height: 1.55;
}

@media (max-width: 1180px) {
  .command-panel,
  .workflow-shell {
    grid-template-columns: 1fr;
  }

  .metric-stack {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .workflow-panel {
    position: static;
    max-height: none;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .list-head {
    display: none;
  }

  .debtor-row {
    grid-template-columns: 28px minmax(0, 1fr) auto;
    align-items: start;
  }

  .student-cell {
    grid-column: 2 / 3;
  }

  .amount-cell {
    grid-column: 3 / 4;
    text-align: right;
  }

  .contact-cell,
  .next-cell,
  .row-actions {
    grid-column: 2 / -1;
  }

  .row-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 860px) {
  :global(body.deudores-page-active .income-shell) {
    display: block;
    height: auto;
    min-height: 100vh;
    overflow: visible;
  }

  :global(body.deudores-page-active .income-sidebar) {
    width: auto;
    min-height: auto;
    margin: 10px;
    border-radius: 10px;
  }

  :global(body.deudores-page-active .sidebar-sheen),
  :global(body.deudores-page-active .sidebar-rings),
  :global(body.deudores-page-active .sidebar-arc),
  :global(body.deudores-page-active .sidebar-leaves) {
    display: none;
  }

  :global(body.deudores-page-active .sidebar-brand) {
    padding: 18px 14px 12px;
  }

  :global(body.deudores-page-active .sidebar-logo) {
    max-height: 38px;
    margin-bottom: 8px;
  }

  :global(body.deudores-page-active .sidebar-nav) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    flex: none;
    gap: 7px;
    overflow: visible;
    padding: 0 12px 12px;
  }

  :global(body.deudores-page-active .nav-item) {
    min-height: 38px;
    gap: 8px;
    border-radius: 8px;
    padding: 0 10px;
    font-size: 0.76rem;
  }

  :global(body.deudores-page-active .sidebar-footer) {
    gap: 10px;
    padding: 0 12px 12px;
  }

  :global(body.deudores-page-active .income-main) {
    min-height: auto;
    overflow: visible;
  }

  :global(body.deudores-page-active .app-header) {
    height: auto;
    min-height: 58px;
    padding: 10px 14px;
  }

  :global(body.deudores-page-active .app-header h1) {
    font-size: 1.45rem;
  }

  :global(body.deudores-page-active .header-actions) {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  :global(body.deudores-page-active .income-content) {
    padding-left: 14px;
    padding-right: 14px;
  }

  .command-main {
    padding: 20px;
  }

  .headline-grid,
  .today-action-card,
  .stage-strip,
  .selection-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .today-action-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
  }

  .today-action-card .primary-action {
    grid-column: 1 / -1;
    width: 100%;
  }

  .primary-total {
    border-left: 0;
    border-top: 1px solid var(--debt-soft-line);
    padding-top: 12px;
    padding-left: 0;
    text-align: left;
  }

  .metric-stack,
  .workflow-panel,
  .board-toolbar,
  .drawer-summary,
  .drawer-contact {
    grid-template-columns: 1fr;
  }

  .stage-steps,
  .view-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }

  .board-toolbar {
    align-items: stretch;
  }

  .debtor-row {
    grid-template-columns: 26px minmax(0, 1fr);
  }

  .amount-cell,
  .contact-cell,
  .next-cell,
  .row-actions {
    grid-column: 2 / -1;
    text-align: left;
  }

  .row-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .row-primary,
  .row-secondary {
    width: 100%;
  }

  .drawer-actions-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .collections-workspace {
    gap: 10px;
  }

  .command-buttons,
  .row-actions,
  .drawer-actions-grid {
    display: grid;
    grid-template-columns: 1fr;
  }

  .headline-grid h2 {
    font-size: 2rem;
  }

  .stage-steps,
  .view-tabs {
    grid-template-columns: 1fr;
  }

  .student-copy strong,
  .student-copy small,
  .student-copy em,
  .next-cell small {
    white-space: normal;
  }

  .detail-drawer {
    border-radius: 0;
  }
}
/* fixed-artboard scaling for cobranza/deudores
   Keeps the deudores workspace visually consistent under OS/browser scaling instead of reflowing into cramped breakpoints. */
.debt-page-shell {
  width: 100%;
  min-width: 0;
}

.debt-scale-shell {
  position: relative;
  width: 100%;
  min-height: 360px;
  overflow: hidden;
  contain: layout paint;
}

.debt-design-canvas {
  position: relative;
  transform-origin: top left;
  will-change: transform;
}

.debt-design-canvas > .collections-workspace,
.collections-workspace {
  width: 1540px !important;
  max-width: none !important;
  min-width: 1540px !important;
  margin: 0 auto !important;
  gap: 14px !important;
}

:global(body.deudores-page-active .income-shell) {
  display: flex !important;
  height: 100vh !important;
  min-height: 0 !important;
  overflow: hidden !important;
}

:global(body.deudores-page-active .income-main) {
  min-height: 0 !important;
  overflow-y: auto !important;
}

:global(body.deudores-page-active .income-sidebar) {
  min-height: 0 !important;
  margin: 0 !important;
  border-radius: 0 34px 34px 0 !important;
}

:global(body.deudores-page-active .sidebar-sheen),
:global(body.deudores-page-active .sidebar-rings),
:global(body.deudores-page-active .sidebar-arc),
:global(body.deudores-page-active .sidebar-leaves) {
  display: block !important;
}

:global(body.deudores-page-active .income-content) {
  display: block !important;
  min-height: 0 !important;
  overflow: visible !important;
  padding: 18px 30px 40px !important;
}

:global(body.deudores-page-active .app-header) {
  height: 64px !important;
  min-height: 64px !important;
  padding: 0 30px !important;
}

:global(body.deudores-page-active .app-header h1) {
  font-size: 1.32rem !important;
}

:global(body.deudores-page-active .header-actions) {
  flex-wrap: nowrap !important;
  justify-content: flex-end !important;
}

.debt-design-canvas .command-panel {
  grid-template-columns: minmax(0, 1fr) minmax(240px, 330px) !important;
}

.debt-design-canvas .metric-stack {
  grid-template-columns: none !important;
}

.debt-design-canvas .workflow-shell {
  grid-template-columns: minmax(250px, 292px) minmax(0, 1fr) !important;
}

.debt-design-canvas .workflow-panel {
  position: sticky !important;
  top: 82px !important;
  max-height: calc(100vh - 106px) !important;
  grid-template-columns: none !important;
}

.debt-design-canvas .list-head {
  display: grid !important;
}

.debt-design-canvas .list-head,
.debt-design-canvas .debtor-row {
  grid-template-columns: 30px minmax(170px, 1.35fr) minmax(92px, 0.5fr) minmax(112px, 0.55fr) minmax(134px, 0.65fr) minmax(128px, 0.55fr) !important;
  align-items: center !important;
}

.debt-design-canvas .list-head span:first-child {
  grid-column: 2 !important;
}

.debt-design-canvas .debtor-row {
  border-radius: 0 !important;
  padding: 12px 14px !important;
}

.debt-design-canvas .student-cell,
.debt-design-canvas .amount-cell,
.debt-design-canvas .contact-cell,
.debt-design-canvas .next-cell,
.debt-design-canvas .row-actions {
  grid-column: auto !important;
}

.debt-design-canvas .amount-cell {
  text-align: left !important;
}

.debt-design-canvas .contact-cell {
  display: flex !important;
}

.debt-design-canvas .row-actions {
  display: flex !important;
  justify-content: flex-end !important;
}

.debt-design-canvas .row-primary,
.debt-design-canvas .row-secondary {
  width: auto !important;
}

.debt-design-canvas .headline-grid,
.debt-design-canvas .today-action-card,
.debt-design-canvas .stage-strip,
.debt-design-canvas .selection-bar {
  align-items: center !important;
  flex-direction: row !important;
}

.debt-design-canvas .today-action-card {
  display: grid !important;
  grid-template-columns: auto minmax(0, 1fr) auto !important;
}

.debt-design-canvas .today-action-card .primary-action {
  grid-column: auto !important;
  width: auto !important;
}

.debt-design-canvas .primary-total {
  border-top: 0 !important;
  border-left: 1px solid var(--debt-soft-line) !important;
  padding-top: 0 !important;
  padding-left: 18px !important;
  text-align: right !important;
}

.debt-design-canvas .stage-steps {
  grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
  width: auto !important;
}

.debt-design-canvas .view-tabs {
  grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
  width: auto !important;
}

.debt-design-canvas .board-toolbar {
  grid-template-columns: minmax(150px, 220px) minmax(260px, 1fr) minmax(140px, 176px) !important;
  align-items: end !important;
}

.debt-design-canvas .drawer-summary {
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
}

.debt-design-canvas .drawer-contact {
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
}

.debt-design-canvas .drawer-actions-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
}

.debt-design-canvas .student-copy strong,
.debt-design-canvas .student-copy small,
.debt-design-canvas .student-copy em,
.debt-design-canvas .next-cell small {
  white-space: nowrap !important;
}


</style>
