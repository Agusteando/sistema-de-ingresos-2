<template>
  <div class="debt-command">
    <section class="debt-hero" aria-labelledby="debt-title">
      <div class="hero-copy">
        <span class="eyebrow">Cobranza mensual</span>
        <h2 id="debt-title">Deudores</h2>
        <p>
          Seguimiento visual de saldos pendientes, corte del día 14, excepciones autorizadas y gestiones manuales por alumno.
        </p>

        <div class="hero-actions">
          <button class="btn btn-outline" @click="loadData" :disabled="loading">
            <LucideRefreshCw :size="16" :class="{ 'animate-spin': loading }" />
            Actualizar
          </button>
          <button class="btn btn-secondary" @click="exportData" :disabled="loading || filteredDeudores.length === 0">
            <LucideDownload :size="16" />
            Exportar
          </button>
        </div>
      </div>

      <div class="hero-snapshot" aria-label="Resumen de cobranza">
        <div class="snapshot-stage">
          <div>
            <span>Día {{ currentDebtDay }} de {{ currentMonthLastDay }}</span>
            <strong>{{ currentStageTitle }}</strong>
          </div>
          <LucideCalendarClock :size="22" />
        </div>

        <div class="snapshot-amount">
          <span>Cartera pendiente</span>
          <strong>{{ formatMoney(totalCartera) }}</strong>
        </div>

        <div class="snapshot-progress" aria-hidden="true">
          <span :style="{ width: `${stageProgress}%` }"></span>
        </div>

        <div class="snapshot-grid">
          <div v-for="metric in heroMetrics" :key="metric.label" class="snapshot-metric">
            <component :is="metric.icon" :size="16" />
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
          </div>
        </div>
      </div>
    </section>

    <section class="flow-strip" aria-label="Calendario de cobranza">
      <div class="flow-heading">
        <div>
          <span>Calendario operativo</span>
          <strong>{{ currentStageTitle }}</strong>
        </div>
        <p>{{ currentStageCopy }}</p>
      </div>

      <div class="flow-track">
        <article
          v-for="step in flowSteps"
          :key="step.key"
          class="flow-card"
          :class="{ 'flow-card-active': isStepActive(step), 'flow-card-today': isStepToday(step) }"
        >
          <div class="flow-marker">
            <component :is="step.icon" :size="18" />
          </div>
          <div class="flow-body">
            <span>{{ step.dayLabel }}</span>
            <strong>{{ step.title }}</strong>
            <p>{{ step.description }}</p>
          </div>
        </article>
      </div>
    </section>

    <section class="operations-grid">
      <aside class="operations-side" aria-label="Resumen operativo">
        <section class="manual-card">
          <div class="manual-head">
            <div class="manual-icon"><LucideShieldCheck :size="20" /></div>
            <div>
              <span>Modo manual</span>
              <strong>Sin gestiones automáticas</strong>
            </div>
          </div>
          <p>
            El sistema prepara la información, pero correos, WhatsApp, cartas, llamadas y operaciones masivas requieren clic del usuario.
          </p>
          <ul>
            <li v-for="item in manualModeItems" :key="item">
              <LucideCheckCircle :size="14" />
              {{ item }}
            </li>
          </ul>
        </section>

        <WhatsappOnboarding auto-start compact class="wa-card" />

        <section class="side-panel">
          <div class="side-title">
            <span>Señales de cartera</span>
            <strong>{{ filteredDeudores.length }} casos visibles</strong>
          </div>
          <div class="signal-grid">
            <div v-for="metric in riskMetrics" :key="metric.label" class="signal-card" :class="metric.tone">
              <component :is="metric.icon" :size="16" />
              <span>{{ metric.label }}</span>
              <strong>{{ metric.value }}</strong>
            </div>
          </div>
        </section>

        <section class="stage-note">
          <div>
            <LucideAlertTriangle :size="18" />
            <strong>Corte del día 14</strong>
          </div>
          <p>
            A partir del corte se muestra el desglose por concepto adeudado y se conserva la fecha límite especial cuando exista una nota autorizada.
          </p>
        </section>
      </aside>

      <main class="case-panel">
        <header class="panel-heading">
          <div>
            <span>Cartera activa</span>
            <h3>{{ filteredDeudores.length }} alumnos</h3>
          </div>
          <div class="panel-mini">
            <span>{{ selectedRows.length }} seleccionados</span>
            <strong>{{ eligibleSelectedRows.length }} listos</strong>
          </div>
        </header>

        <section class="filters-shell" aria-label="Filtros de cartera">
          <label class="search-box">
            <LucideSearch :size="17" />
            <input v-model="search" type="text" placeholder="Buscar por matrícula, alumno o tutor">
          </label>

          <label class="filter-field">
            <span>Estado</span>
            <select v-model="estatusFiltro">
              <option value="deudores">Solo deudores</option>
              <option value="todos">Todos</option>
              <option value="no_deudores">No deudores</option>
            </select>
          </label>

          <div class="segment-control" aria-label="Vista">
            <button
              v-for="option in segmentOptions"
              :key="option.value"
              class="segment-button"
              :class="{ 'segment-button-active': segmentFilter === option.value }"
              @click="segmentFilter = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </section>

        <section class="bulk-console" aria-label="Acciones masivas manuales">
          <label class="select-all">
            <input
              type="checkbox"
              :checked="allVisibleSelected"
              :disabled="filteredDeudores.length === 0"
              @change="toggleAllVisible($event.target.checked)"
            >
            <span>Seleccionar vista</span>
          </label>

          <div class="bulk-meta">
            <strong>{{ selectedActionMeta.massLabel }}</strong>
            <span>{{ eligibleSelectedRows.length }} de {{ selectedRows.length }} seleccionados pueden ejecutarse ahora.</span>
          </div>

          <div class="mass-action">
            <select v-model="selectedMassAction">
              <option v-for="action in actionCatalog" :key="action.action" :value="action.action">
                {{ action.massLabel }}
              </option>
            </select>
            <button
              class="btn btn-primary"
              :disabled="eligibleSelectedRows.length === 0 || Boolean(runningAction)"
              @click="executeMassAction"
            >
              <component :is="selectedActionMeta.icon" :size="16" />
              {{ runningAction ? 'Procesando' : 'Ejecutar manualmente' }}
            </button>
          </div>
        </section>

        <div class="quick-picks">
          <button
            v-for="action in actionCatalog"
            :key="`pick-${action.action}`"
            class="quick-pick"
            :disabled="loading"
            @click="selectEligibleForAction(action.action)"
          >
            <component :is="action.icon" :size="15" />
            {{ action.pickLabel }}
          </button>
        </div>

        <section class="cases-grid" :class="{ 'is-loading': loading }">
          <div v-if="loading" class="empty-state">
            <span class="liquid-loader"><i></i><i></i><i></i></span>
            <strong>Cargando cartera</strong>
            <p>Preparando saldos, contactos, corte y desglose por concepto.</p>
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
              <label class="debtor-check" :aria-label="`Seleccionar ${d.nombreCompleto}`">
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

            <div class="action-lane" aria-label="Avance de gestiones">
              <div
                v-for="action in actionCatalog"
                :key="`${rowKey(d)}-${action.action}`"
                class="action-step"
                :class="{
                  'action-step-done': isActionCompleted(d, action.action),
                  'action-step-ready': isActionExpected(d, action.action) && !isActionCompleted(d, action.action),
                  'action-step-blocked': !isActionExpected(d, action.action)
                }"
                :title="action.massLabel"
              >
                <component :is="action.icon" :size="14" />
                <span>{{ action.shortLabel }}</span>
              </div>
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

            <section v-if="d.desglose?.length" class="breakdown-preview">
              <div class="breakdown-head">
                <span>Desglose del corte</span>
                <strong>{{ d.desglose.length }} conceptos</strong>
              </div>
              <div
                v-for="item in d.desglose.slice(0, 3)"
                :key="`${rowKey(d)}-${item.documento}-${item.mesCargo}`"
                class="breakdown-line"
              >
                <span>{{ item.conceptoNombre }} · {{ item.mesLabel || item.mesCargo }}</span>
                <strong>{{ formatMoney(item.saldo) }}</strong>
              </div>
              <button v-if="d.desglose.length > 3" @click="openDetails(d)">Ver {{ d.desglose.length - 3 }} más</button>
            </section>

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
                <LucideCalendarClock :size="15" />
                Fecha especial
              </button>
              <button class="manual-action neutral" @click="openDetails(d)">
                <LucideEye :size="15" />
                Detalle
              </button>
            </footer>
          </article>
        </section>
      </main>
    </section>

    <Teleport to="body">
      <div v-if="showExceptionModal" class="modal-overlay" @click.self="closeException">
        <div class="modal-container">
          <div class="modal-header">
            <h2 class="modal-title">
              <LucideCalendarClock :size="20" />
              Fecha límite especial
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
              <LucideCheckCircle :size="16" />
              Guardar excepción
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="detailsTarget" class="drawer-overlay" @click.self="closeDetails">
        <aside class="detail-drawer">
          <header class="drawer-header">
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

          <section class="drawer-contact">
            <div>
              <span>Tutor</span>
              <strong>{{ detailsTarget.padre || 'No registrado' }}</strong>
            </div>
            <div>
              <span>Correo</span>
              <strong>{{ detailsTarget.correo || 'Sin correo' }}</strong>
            </div>
            <div>
              <span>Teléfono</span>
              <strong>{{ detailsTarget.telefono || 'Sin teléfono' }}</strong>
            </div>
            <div>
              <span>Fecha límite</span>
              <strong>{{ formatDate(detailsTarget.fechaLimitePago) }}</strong>
            </div>
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

          <section v-if="detailsTarget.observaciones?.length" class="drawer-section">
            <h4>Observaciones</h4>
            <div class="drawer-list action-history">
              <div v-for="obs in detailsTarget.observaciones.slice(0, 4)" :key="`${obs.fecha}-${obs.texto}`">
                <span>{{ obs.texto }}</span>
                <strong>{{ formatDate(obs.fecha) }}</strong>
              </div>
            </div>
          </section>

          <section v-if="detailsTarget.notaFechaLimiteEspecial" class="drawer-section">
            <h4>Nota de fecha especial</h4>
            <p class="drawer-note">{{ detailsTarget.notaFechaLimiteEspecial }}</p>
          </section>

          <footer class="drawer-actions">
            <button
              v-for="action in actionCatalog"
              :key="`drawer-${action.action}`"
              class="manual-action"
              :class="manualActionClass(detailsTarget, action.action)"
              :disabled="!canRunAction(detailsTarget, action.action) || Boolean(runningAction)"
              @click="runSingleAction(detailsTarget, action.action)"
            >
              <component :is="action.icon" :size="15" />
              {{ action.shortLabel }}
            </button>
            <button class="manual-action neutral" @click="openException(detailsTarget)">
              <LucideCalendarClock :size="15" />
              Fecha especial
            </button>
          </footer>
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
    pickLabel: 'Seleccionar correos',
    massLabel: 'Enviar recordatorio por correo',
    title: 'Correo de recordatorio',
    description: 'Disponible desde el día 13.',
    icon: LucideMail,
    requires: 'correo'
  },
  {
    action: 'reporte_deudores',
    day: 14,
    dayLabel: 'Día 14',
    shortLabel: 'Corte',
    pickLabel: 'Seleccionar corte',
    massLabel: 'Registrar corte de deudores',
    title: 'Corte con desglose',
    description: 'Desglosa el concepto adeudado.',
    icon: LucideClipboardList
  },
  {
    action: 'whatsapp_contacto',
    day: 20,
    dayLabel: 'Día 20',
    shortLabel: 'WhatsApp',
    pickLabel: 'Seleccionar WhatsApp',
    massLabel: 'Enviar seguimiento por WhatsApp',
    title: 'Seguimiento por WhatsApp',
    description: 'Disponible desde la cuenta vinculada.',
    icon: LucideMessageCircle,
    requires: 'telefono'
  },
  {
    action: 'carta_suspension',
    day: 27,
    dayLabel: 'Día 27',
    shortLabel: 'Carta',
    pickLabel: 'Seleccionar cartas',
    massLabel: 'Generar carta de suspensión',
    title: 'Carta de suspensión',
    description: 'Genera documento y registra la acción.',
    icon: LucideFileText
  },
  {
    action: 'llamada_telefonica',
    day: null,
    dayLabel: 'Cierre',
    shortLabel: 'Llamada',
    pickLabel: 'Seleccionar llamadas',
    massLabel: 'Registrar llamada de cierre',
    title: 'Llamadas de cierre',
    description: 'Cierre de mes y deudor oficial.',
    icon: LucidePhone,
    requires: 'telefono'
  }
]

const segmentOptions = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendientes', label: 'Pendientes' },
  { value: 'oficiales', label: 'Oficiales' },
  { value: 'excepciones', label: 'Excepciones' }
]

const manualModeItems = [
  'Correos y WhatsApp se envían solo con clic.',
  'Cartas y cortes se generan solo por selección.',
  'Las fechas especiales exigen nota.'
]

const flowSteps = computed(() => [
  {
    key: 'periodo-pago',
    day: 1,
    dayEnd: 12,
    dayLabel: '1-12',
    title: 'Periodo de pago',
    description: 'Pago regular sin gestión de cobranza.',
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
const stageProgress = computed(() => Math.min(100, Math.max(0, Math.round((currentDebtDay.value / currentMonthLastDay.value) * 100))))

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
  if (day <= 12) return 'Los padres tienen del día 1 al 12 para pagar sin gestión de cobranza.'
  if (day === 13) return 'El recordatorio por correo ya puede ejecutarse de forma manual.'
  if (day >= 14 && day <= 19) return 'El corte muestra alumnos deudores y desglose por concepto adeudado.'
  if (day >= 20 && day <= 26) return 'El seguimiento por WhatsApp queda disponible para ejecución manual.'
  if (day === 27) return 'La carta de suspensión puede generarse para los casos seleccionados.'
  if (day >= currentMonthLastDay.value) return 'Las llamadas cierran el proceso y dejan el caso como deudor oficial.'
  return 'Las acciones previas siguen disponibles si aún no han sido registradas.'
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

const heroMetrics = computed(() => [
  { label: 'Alumnos', value: filteredDeudores.value.length, icon: LucideUsers },
  { label: 'Oficiales', value: officialCount.value, icon: LucideShieldCheck },
  { label: 'Excepciones', value: exceptionCount.value, icon: LucideCalendarClock }
])

const riskMetrics = computed(() => [
  { label: 'Con excepción', value: exceptionCount.value, icon: LucideCalendarClock, tone: 'tone-blue' },
  { label: 'Conciliación', value: pendingConciliationCount.value, icon: LucideAlertTriangle, tone: 'tone-amber' },
  { label: 'Sin correo', value: noEmailCount.value, icon: LucideMail, tone: 'tone-coral' },
  { label: 'Sin teléfono', value: noPhoneCount.value, icon: LucidePhone, tone: 'tone-coral' }
])

const hasBlockingOverlay = computed(() => showExceptionModal.value || Boolean(detailsTarget.value))
const selectedActionMeta = computed(() => getActionMeta(selectedMassAction.value))
const eligibleSelectedRows = computed(() => selectedRows.value.filter(d => canRunAction(d, selectedMassAction.value)))

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

onMounted(() => {
  if (typeof document !== 'undefined') document.body.classList.add('deudores-page-active')
  loadData()
})

onUnmounted(() => {
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

const getActionMeta = (action) => actionCatalog.find(item => item.action === action) || {
  action,
  shortLabel: String(action || 'Acción'),
  pickLabel: String(action || 'Acción'),
  massLabel: String(action || 'Acción'),
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
:global(body.deudores-page-active .income-main) {
  overflow-y: auto;
  overscroll-behavior-y: contain;
}

:global(body.deudores-page-active .income-content) {
  min-height: auto;
  overflow: visible;
}

.debt-command {
  display: grid;
  width: min(100%, 1680px);
  min-width: 0;
  gap: 18px;
  margin: 0 auto;
  padding-bottom: 28px;
  overflow: visible;
}

.debt-hero {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1.25fr) minmax(330px, 0.75fr);
  gap: 18px;
  align-items: stretch;
}

.hero-copy,
.hero-snapshot,
.flow-strip,
.manual-card,
.side-panel,
.stage-note,
.case-panel,
.debtor-card {
  border: 1px solid rgba(223, 230, 239, 0.96);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 16px 42px rgba(22, 38, 65, 0.07);
}

.hero-copy {
  display: grid;
  min-width: 0;
  align-content: center;
  gap: 16px;
  border-radius: 26px;
  padding: 28px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(247, 252, 244, 0.95)),
    repeating-linear-gradient(90deg, rgba(101, 167, 68, 0.06) 0 1px, transparent 1px 22px);
}

.eyebrow,
.flow-heading span,
.side-title span,
.manual-head span,
.panel-heading span,
.filter-field span,
.hero-snapshot span,
.saldo-block span,
.debtor-info-grid span,
.breakdown-head span,
.drawer-contact span,
.drawer-total span {
  color: #66728a;
  font-size: 0.68rem;
  font-weight: 850;
  letter-spacing: 0;
  text-transform: uppercase;
}

.hero-copy h2 {
  margin: 0;
  color: #142641;
  font-size: 2.5rem;
  font-weight: 900;
  line-height: 1.04;
  letter-spacing: 0;
}

.hero-copy p {
  max-width: 760px;
  margin: 0;
  color: #526078;
  font-size: 1rem;
  font-weight: 650;
  line-height: 1.6;
}

.hero-actions,
.panel-actions,
.debtor-status-row,
.card-actions,
.drawer-actions {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 9px;
}

.hero-snapshot {
  display: grid;
  min-width: 0;
  gap: 14px;
  border-radius: 26px;
  padding: 18px;
  background: linear-gradient(145deg, #172943, #203956 58%, #143f47);
  color: #fff;
}

.snapshot-stage {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.snapshot-stage span,
.snapshot-amount span {
  color: rgba(255, 255, 255, 0.68);
}

.snapshot-stage strong,
.snapshot-amount strong {
  display: block;
  margin-top: 4px;
  color: #fff;
  font-weight: 900;
  letter-spacing: 0;
}

.snapshot-stage strong {
  font-size: 1.05rem;
}

.snapshot-stage svg {
  flex: 0 0 auto;
  color: #93d36a;
}

.snapshot-amount {
  min-width: 0;
}

.snapshot-amount strong {
  overflow: hidden;
  font-size: 2rem;
  line-height: 1.05;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.snapshot-progress {
  height: 9px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
}

.snapshot-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #93d36a, #2fb4a1 54%, #fcbf2d);
}

.snapshot-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.snapshot-metric {
  display: grid;
  min-width: 0;
  gap: 5px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
  padding: 12px;
}

.snapshot-metric svg {
  color: #93d36a;
}

.snapshot-metric span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.snapshot-metric strong {
  color: #fff;
  font-size: 1.22rem;
  font-weight: 900;
}

.flow-strip {
  display: grid;
  gap: 14px;
  border-radius: 24px;
  padding: 16px;
}

.flow-heading {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.flow-heading strong {
  display: block;
  margin-top: 2px;
  color: #172943;
  font-size: 1.04rem;
  font-weight: 900;
}

.flow-heading p {
  max-width: 620px;
  margin: 0;
  color: #66728a;
  font-size: 0.86rem;
  font-weight: 650;
  line-height: 1.5;
}

.flow-track {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}

.flow-card {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  border: 1px solid #edf2f7;
  border-radius: 18px;
  background: #fbfcfd;
  padding: 12px;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.flow-card-active {
  border-color: rgba(101, 167, 68, 0.44);
  background: #f4fbf1;
}

.flow-card-today {
  transform: translateY(-2px);
  box-shadow: 0 12px 24px rgba(101, 167, 68, 0.14);
}

.flow-marker {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 14px;
  background: #fff;
  color: #3f8468;
  box-shadow: inset 0 0 0 1px #edf2f7;
}

.flow-card-active .flow-marker {
  background: #eaf8e7;
  color: #2e7235;
}

.flow-body {
  min-width: 0;
}

.flow-body span,
.flow-body strong,
.flow-body p {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.flow-body span {
  color: #397fe8;
  font-size: 0.68rem;
  font-weight: 900;
  white-space: nowrap;
}

.flow-body strong {
  margin-top: 2px;
  color: #172943;
  font-size: 0.82rem;
  font-weight: 900;
  white-space: nowrap;
}

.flow-body p {
  display: -webkit-box;
  margin: 4px 0 0;
  color: #66728a;
  font-size: 0.73rem;
  font-weight: 650;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.operations-grid {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.operations-side {
  position: sticky;
  top: 84px;
  display: grid;
  min-width: 0;
  gap: 14px;
}

.manual-card,
.side-panel,
.stage-note,
.case-panel {
  border-radius: 24px;
}

.manual-card,
.side-panel,
.stage-note {
  display: grid;
  gap: 12px;
  padding: 16px;
}

.manual-head,
.side-title,
.stage-note > div {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.manual-icon {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 15px;
  background: #eaf8e7;
  color: #2e7235;
}

.manual-head strong,
.side-title strong,
.stage-note strong {
  display: block;
  color: #172943;
  font-size: 0.95rem;
  font-weight: 900;
}

.manual-card p,
.stage-note p {
  margin: 0;
  color: #66728a;
  font-size: 0.82rem;
  font-weight: 650;
  line-height: 1.55;
}

.manual-card ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.manual-card li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: #526078;
  font-size: 0.78rem;
  font-weight: 760;
  line-height: 1.35;
}

.manual-card li svg {
  flex: 0 0 auto;
  color: #65a744;
  margin-top: 1px;
}

.wa-card {
  min-width: 0;
}

.signal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.signal-card {
  display: grid;
  min-width: 0;
  gap: 5px;
  border-radius: 16px;
  background: #f8fafc;
  padding: 12px;
}

.signal-card svg {
  color: #3f8468;
}

.signal-card span {
  overflow: hidden;
  color: #66728a;
  font-size: 0.66rem;
  font-weight: 850;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.signal-card strong {
  color: #172943;
  font-size: 1.35rem;
  font-weight: 900;
}

.tone-blue svg,
.tone-blue strong {
  color: #397fe8;
}

.tone-amber svg,
.tone-amber strong {
  color: #a56b00;
}

.tone-coral svg,
.tone-coral strong {
  color: #e83f4b;
}

.stage-note {
  border-color: rgba(252, 191, 45, 0.36);
  background: #fffaf0;
}

.stage-note svg {
  flex: 0 0 auto;
  color: #a56b00;
}

.case-panel {
  display: grid;
  min-width: 0;
  gap: 14px;
  padding: 16px;
}

.panel-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.panel-heading h3 {
  margin: 2px 0 0;
  color: #172943;
  font-size: 1.35rem;
  font-weight: 900;
}

.panel-mini {
  display: grid;
  min-width: 140px;
  justify-items: end;
  gap: 2px;
  color: #66728a;
  font-size: 0.72rem;
  font-weight: 800;
}

.panel-mini strong {
  color: #2e7235;
  font-size: 0.86rem;
}

.filters-shell {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(260px, 1fr) 180px minmax(360px, 0.95fr);
  gap: 10px;
  align-items: end;
}

.search-box,
.filter-field select,
.mass-action select {
  border: 1px solid #dfe6ef;
  border-radius: 15px;
  background: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.86);
}

.search-box {
  display: flex;
  min-width: 0;
  height: 42px;
  align-items: center;
  gap: 9px;
  padding: 0 12px;
}

.search-box svg {
  flex: 0 0 auto;
  color: #66728a;
}

.search-box input,
.filter-field select,
.mass-action select {
  min-width: 0;
  width: 100%;
  border: 0;
  background: transparent;
  color: #172943;
  font-size: 0.84rem;
  font-weight: 760;
  outline: none;
}

.filter-field {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.filter-field select,
.mass-action select {
  height: 42px;
  padding: 0 11px;
}

.segment-control {
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  border: 1px solid #dfe6ef;
  border-radius: 16px;
  background: #f4f7fa;
  padding: 4px;
}

.segment-button {
  min-width: 0;
  min-height: 34px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: #66728a;
  padding: 0 8px;
  font-size: 0.72rem;
  font-weight: 850;
  overflow-wrap: anywhere;
  transition: background 160ms ease, color 160ms ease, box-shadow 160ms ease;
}

.segment-button-active {
  background: #fff;
  color: #2e7235;
  box-shadow: 0 8px 16px rgba(22, 38, 65, 0.06);
}

.bulk-console {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(170px, 1fr) minmax(300px, auto);
  gap: 12px;
  align-items: center;
  border: 1px solid #dfe6ef;
  border-radius: 20px;
  background: linear-gradient(135deg, #fbfcfd, #ffffff);
  padding: 12px;
}

.select-all,
.mass-action {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.select-all span {
  color: #172943;
  font-size: 0.82rem;
  font-weight: 850;
  white-space: nowrap;
}

.bulk-meta {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.bulk-meta strong {
  overflow: hidden;
  color: #172943;
  font-size: 0.88rem;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bulk-meta span {
  color: #66728a;
  font-size: 0.76rem;
  font-weight: 680;
}

.mass-action {
  justify-content: flex-end;
}

.mass-action select {
  width: 250px;
}

.quick-picks {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.quick-pick {
  display: inline-flex;
  min-height: 34px;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
  border: 1px solid #dfe6ef;
  border-radius: 999px;
  background: #fff;
  color: #526078;
  padding: 0 12px;
  font-size: 0.72rem;
  font-weight: 850;
  transition: border-color 160ms ease, color 160ms ease, background 160ms ease, transform 160ms ease;
}

.quick-pick:hover:not(:disabled) {
  border-color: rgba(101, 167, 68, 0.42);
  background: #f7fcf4;
  color: #2e7235;
  transform: translateY(-1px);
}

.cases-grid {
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr));
  gap: 12px;
}

.empty-state {
  display: grid;
  min-height: 320px;
  grid-column: 1 / -1;
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
  font-weight: 900;
}

.empty-state p {
  max-width: 370px;
  margin: 0;
  font-size: 0.84rem;
  font-weight: 650;
}

.empty-state svg {
  color: #65a744;
}

.debtor-card {
  position: relative;
  display: grid;
  min-width: 0;
  align-content: start;
  gap: 13px;
  overflow: hidden;
  border-radius: 22px;
  padding: 15px;
}

.debtor-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 5px;
  background: #dfe6ef;
}

.debtor-card-selected {
  border-color: rgba(101, 167, 68, 0.58);
  background: #fbfff9;
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

.debtor-check input,
.select-all input {
  width: 16px;
  height: 16px;
  accent-color: #65a744;
}

.debtor-avatar {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 16px;
  background: linear-gradient(135deg, #eaf8e7, #eef7ff);
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
  font-size: 0.98rem;
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
  font-size: 0.76rem;
  font-weight: 720;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.saldo-block {
  min-width: 112px;
  text-align: right;
}

.saldo-block strong {
  display: block;
  color: #e83f4b;
  font-size: 1.1rem;
  font-weight: 900;
}

.debtor-status-row {
  align-items: center;
}

.status-pill,
.exception-pill,
.conciliation-pill {
  display: inline-flex;
  min-height: 27px;
  align-items: center;
  border-radius: 999px;
  padding: 0 10px;
  font-size: 0.69rem;
  font-weight: 850;
}

.status-success { background: #eaf8e7; color: #2e7235; }
.status-warning { background: #fff8df; color: #8a6500; }
.status-danger { background: #fff0ed; color: #d83a2a; }
.status-info { background: #edf6ff; color: #2d65ba; }
.exception-pill { background: #edf6ff; color: #2d65ba; }
.conciliation-pill { background: #fff8df; color: #8a6500; }

.action-lane {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}

.action-step {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 5px;
  min-height: 30px;
  border: 1px solid #edf2f7;
  border-radius: 12px;
  background: #fbfcfd;
  color: #9aa6b8;
  padding: 0 8px;
}

.action-step span {
  overflow: hidden;
  font-size: 0.66rem;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-step-ready {
  border-color: rgba(252, 191, 45, 0.44);
  background: #fffaf0;
  color: #9a6400;
}

.action-step-done {
  border-color: rgba(101, 167, 68, 0.32);
  background: #f1faed;
  color: #2e7235;
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
  padding: 10px;
}

.debtor-info-grid strong {
  display: block;
  overflow: hidden;
  margin-top: 3px;
  color: #172943;
  font-size: 0.76rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.breakdown-preview {
  display: grid;
  gap: 7px;
  border: 1px solid #edf2f7;
  border-radius: 16px;
  background: #fbfcfd;
  padding: 10px;
}

.breakdown-head,
.breakdown-line {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.breakdown-head strong {
  color: #397fe8;
  font-size: 0.72rem;
  font-weight: 900;
  white-space: nowrap;
}

.breakdown-line {
  color: #526078;
  font-size: 0.76rem;
  font-weight: 760;
}

.breakdown-line span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.breakdown-line strong {
  color: #e83f4b;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  white-space: nowrap;
}

.breakdown-preview button {
  justify-self: start;
  border: 0;
  background: transparent;
  color: #397fe8;
  padding: 0;
  font-size: 0.74rem;
  font-weight: 850;
}

.manual-action {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 6px;
  border: 1px solid #dfe6ef;
  border-radius: 999px;
  background: #fff;
  color: #66728a;
  padding: 0 11px;
  font-size: 0.72rem;
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
  opacity: 0.48;
  cursor: not-allowed;
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0;
  color: #172943;
  font-size: 1rem;
  font-weight: 900;
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
  width: min(560px, 100%);
  height: 100%;
  grid-template-rows: auto auto auto auto auto auto 1fr;
  gap: 14px;
  overflow-y: auto;
  background: #fff;
  padding: 22px;
  box-shadow: -20px 0 48px rgba(22, 38, 65, 0.16);
}

.drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.drawer-header span {
  color: #3f8468;
  font-size: 0.68rem;
  font-weight: 850;
  text-transform: uppercase;
}

.drawer-header h3 {
  margin: 4px 0;
  color: #172943;
  font-size: 1.4rem;
  font-weight: 900;
}

.drawer-header p {
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

.drawer-total strong {
  color: #e83f4b;
  font-size: 1.48rem;
  font-weight: 900;
}

.drawer-contact {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.drawer-contact div {
  min-width: 0;
  border: 1px solid #edf2f7;
  border-radius: 14px;
  padding: 10px;
}

.drawer-contact strong {
  display: block;
  overflow: hidden;
  margin-top: 3px;
  color: #172943;
  font-size: 0.8rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-section {
  display: grid;
  gap: 10px;
}

.drawer-section h4 {
  margin: 0;
  color: #172943;
  font-size: 0.9rem;
  font-weight: 900;
}

.drawer-list {
  display: grid;
  gap: 6px;
}

.drawer-list div {
  display: flex;
  min-width: 0;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #edf2f7;
  border-radius: 14px;
  padding: 10px;
}

.drawer-list span {
  min-width: 0;
  color: #526078;
  font-size: 0.8rem;
  font-weight: 760;
  overflow-wrap: anywhere;
}

.drawer-list strong {
  color: #172943;
  font-size: 0.8rem;
  font-weight: 850;
  white-space: nowrap;
}

.drawer-muted,
.drawer-note {
  margin: 0;
  border-radius: 14px;
  background: #f8fafc;
  color: #66728a;
  padding: 12px;
  font-size: 0.84rem;
  font-weight: 650;
  line-height: 1.5;
}

.drawer-actions {
  align-self: end;
  border-top: 1px solid #edf2f7;
  padding-top: 14px;
}

@media (max-width: 1360px) {
  .flow-track {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .filters-shell {
    grid-template-columns: minmax(240px, 1fr) 170px;
  }

  .segment-control {
    grid-column: 1 / -1;
  }
}

@media (max-width: 1180px) {
  .operations-grid {
    grid-template-columns: 1fr;
  }

  .operations-side {
    position: static;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .operations-side .wa-card,
  .stage-note {
    grid-column: 1 / -1;
  }
}

@media (max-width: 980px) {
  .debt-command {
    gap: 14px;
  }

  .debt-hero {
    grid-template-columns: 1fr;
  }

  .flow-heading {
    display: grid;
  }

  .bulk-console {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .mass-action {
    justify-content: stretch;
  }

  .mass-action select,
  .mass-action button {
    width: auto;
    flex: 1;
  }
}

@media (max-width: 760px) {
  :global(body.deudores-page-active .income-content) {
    padding-left: 14px;
    padding-right: 14px;
  }

  .hero-copy,
  .hero-snapshot,
  .flow-strip,
  .case-panel,
  .manual-card,
  .side-panel,
  .stage-note,
  .debtor-card {
    border-radius: 18px;
  }

  .hero-copy {
    padding: 22px;
  }

  .hero-copy h2 {
    font-size: 1.95rem;
  }

  .snapshot-grid,
  .flow-track,
  .operations-side,
  .filters-shell,
  .debtor-info-grid,
  .drawer-contact {
    grid-template-columns: 1fr;
  }

  .segment-control {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .panel-heading,
  .debtor-head {
    align-items: stretch;
  }

  .panel-mini {
    justify-items: start;
  }

  .debtor-head {
    grid-template-columns: auto auto minmax(0, 1fr);
  }

  .saldo-block {
    grid-column: 1 / -1;
    min-width: 0;
    text-align: left;
  }

  .action-lane {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .detail-drawer {
    padding: 18px;
  }
}

@media (max-width: 520px) {
  .hero-actions,
  .mass-action,
  .card-actions,
  .drawer-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .hero-actions .btn,
  .mass-action .btn,
  .card-actions .manual-action,
  .drawer-actions .manual-action {
    width: 100%;
  }

  .name-line {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }
}
</style>
