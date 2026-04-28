<template>
  <div class="debt-workspace">
    <section class="debt-hero" aria-labelledby="debt-title">
      <div class="hero-copy">
        <span class="eyebrow">Cobranza escolar</span>
        <h2 id="debt-title">Lo importante de hoy, sin ruido</h2>
        <p>
          Revisa alumnos con saldo vencido, confirma contactos, exporta reportes y ejecuta seguimientos desde un flujo claro.
        </p>
        <div class="hero-actions">
          <button class="btn btn-outline" @click="loadData" :disabled="loading">
            <LucideRefreshCw :size="16" :class="{ 'animate-spin': loading }" />
            Actualizar
          </button>
          <button class="btn btn-secondary" @click="exportData" :disabled="loading || filteredDeudores.length === 0">
            <LucideDownload :size="16" />
            Exportar vista
          </button>
        </div>
      </div>

      <aside class="hero-summary" aria-label="Resumen de cartera">
        <div class="summary-stage">
          <div>
            <span>Día {{ currentDebtDay }} de {{ currentMonthLastDay }}</span>
            <strong>{{ currentStageTitle }}</strong>
          </div>
          <LucideCalendarClock :size="22" />
        </div>
        <div class="summary-amount">
          <span>Cartera vencida</span>
          <strong>{{ formatMoney(totalCartera) }}</strong>
        </div>
        <div class="summary-progress" aria-hidden="true">
          <span :style="{ width: `${stageProgress}%` }"></span>
        </div>
        <div class="summary-grid">
          <div v-for="metric in heroMetrics" :key="metric.label">
            <component :is="metric.icon" :size="16" />
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
          </div>
        </div>
      </aside>
    </section>

    <section class="journey-band" aria-label="Flujo de cobranza">
      <header class="journey-heading">
        <div>
          <span>Proceso del mes</span>
          <strong>{{ currentStageTitle }}</strong>
        </div>
        <p>{{ currentStageCopy }}</p>
      </header>
      <div class="journey-steps">
        <article
          v-for="step in flowSteps"
          :key="step.key"
          class="journey-step"
          :class="{ active: isStepActive(step), today: isStepToday(step) }"
        >
          <div class="step-icon">
            <component :is="step.icon" :size="17" />
          </div>
          <div>
            <span>{{ step.dayLabel }}</span>
            <strong>{{ step.title }}</strong>
            <p>{{ step.description }}</p>
          </div>
        </article>
      </div>
    </section>

    <section class="collections-layout">
      <aside class="guidance-column" aria-label="Acciones de cobranza">
        <section class="guide-panel next-action-panel">
          <span class="panel-kicker">Siguiente acción</span>
          <h3>{{ selectedActionMeta.massLabel }}</h3>
          <p>{{ selectedActionCopy }}</p>

          <div class="next-stats">
            <div>
              <span>Listos</span>
              <strong>{{ eligibleSelectedRows.length }}</strong>
            </div>
            <div>
              <span>Seleccionados</span>
              <strong>{{ selectedRows.length }}</strong>
            </div>
          </div>

          <button class="primary-wide" :disabled="!actionableRowsForSelectedAction.length" @click="selectEligibleForAction(selectedMassAction)">
            <LucideListChecks :size="16" />
            Seleccionar listos
          </button>
        </section>

        <WhatsappOnboarding compact class="whatsapp-guide" />

        <section class="guide-panel signal-panel">
          <div class="panel-title-row">
            <div>
              <span class="panel-kicker">Señales</span>
              <h3>{{ filteredDeudores.length }} casos visibles</h3>
            </div>
          </div>
          <div class="signal-list">
            <div v-for="metric in riskMetrics" :key="metric.label" :class="['signal-item', metric.tone]">
              <component :is="metric.icon" :size="16" />
              <span>{{ metric.label }}</span>
              <strong>{{ metric.value }}</strong>
            </div>
          </div>
        </section>

        <section class="guide-panel export-panel">
          <span class="panel-kicker">Reporte</span>
          <h3>Exportación lista para administración</h3>
          <p>El archivo respeta búsqueda, filtros y fechas límite vigentes.</p>
          <button class="secondary-wide" :disabled="loading || filteredDeudores.length === 0" @click="exportData">
            <LucideDownload :size="16" />
            Descargar CSV
          </button>
        </section>
      </aside>

      <main class="cases-column">
        <section class="cases-header">
          <div>
            <span class="panel-kicker">Quiénes requieren atención</span>
            <h3>{{ filteredDeudores.length }} alumnos</h3>
          </div>
          <div class="visible-total">
            <span>Saldo visible</span>
            <strong>{{ formatMoney(filteredTotalCartera) }}</strong>
          </div>
        </section>

        <section class="filters-panel" aria-label="Filtros de cartera">
          <label class="search-box">
            <LucideSearch :size="17" />
            <input v-model="search" type="text" placeholder="Buscar alumno, matrícula, tutor, correo o teléfono">
          </label>

          <label class="filter-field">
            <span>Estado</span>
            <select v-model="estatusFiltro">
              <option value="deudores">Solo vencidos</option>
              <option value="todos">Todos</option>
              <option value="no_deudores">Sin adeudo exigible</option>
            </select>
          </label>

          <div class="segment-control" aria-label="Prioridad">
            <button
              v-for="option in segmentOptions"
              :key="option.value"
              class="segment-button"
              :class="{ active: segmentFilter === option.value }"
              @click="segmentFilter = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </section>

        <section class="action-console" aria-label="Acciones masivas">
          <label class="select-all">
            <input
              type="checkbox"
              :checked="allVisibleSelected"
              :disabled="filteredDeudores.length === 0"
              @change="toggleAllVisible($event.target.checked)"
            >
            <span>Seleccionar vista</span>
          </label>

          <div class="action-copy">
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
              {{ runningAction ? 'Procesando' : 'Ejecutar' }}
            </button>
          </div>
        </section>

        <section class="quick-actions" aria-label="Atajos de selección">
          <button
            v-for="action in actionCatalog"
            :key="`pick-${action.action}`"
            :disabled="loading"
            @click="selectEligibleForAction(action.action)"
          >
            <component :is="action.icon" :size="15" />
            {{ action.pickLabel }}
          </button>
        </section>

        <section class="cases-list" :class="{ loading }">
          <div v-if="loading" class="empty-state">
            <span class="liquid-loader"><i></i><i></i><i></i></span>
            <strong>Cargando cartera</strong>
            <p>Preparando saldos, contactos y desglose por concepto.</p>
          </div>

          <div v-else-if="!filteredDeudores.length" class="empty-state">
            <LucideCheckCircle :size="34" />
            <strong>No hay alumnos en esta vista</strong>
            <p>Ajusta búsqueda o filtros para revisar otros casos.</p>
          </div>

          <template v-else>
          <article
            v-for="d in filteredDeudores"
            :key="rowKey(d)"
            class="student-row"
            :class="{
              selected: isSelected(d),
              official: d.deudorOficial,
              exception: d.fechaLimiteEspecialVigente
            }"
          >
            <div class="row-select">
              <label :aria-label="`Seleccionar ${d.nombreCompleto}`">
                <input type="checkbox" :checked="isSelected(d)" @change="toggleOne(d)">
              </label>
            </div>

            <div class="student-main">
              <header class="student-header">
                <div class="student-avatar">{{ initials(d.nombreCompleto) }}</div>
                <div class="student-identity">
                  <div class="name-line">
                    <strong>{{ d.nombreCompleto }}</strong>
                    <span>{{ d.matricula }}</span>
                  </div>
                  <p>{{ d.nivel }} · {{ d.grado }} {{ d.grupo || '' }} · {{ d.plantel }}</p>
                </div>
                <div class="balance-box">
                  <span>Saldo</span>
                  <strong>{{ formatMoney(saldoValue(d)) }}</strong>
                </div>
              </header>

              <div class="status-line">
                <span class="status-pill" :class="statusClass(d)">{{ statusLabel(d) }}</span>
                <span v-if="d.fechaLimiteEspecialVigente" class="info-pill">Fecha especial: {{ formatDate(d.fechaLimitePago) }}</span>
                <span v-if="d.pagoPendienteConciliacion" class="warning-pill">Pago por conciliar</span>
              </div>

              <div class="contact-strip">
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

              <section v-if="d.desglose?.length" class="breakdown-strip">
                <div class="breakdown-title">
                  <span>Desglose vencido</span>
                  <strong>{{ d.desglose.length }} conceptos</strong>
                </div>
                <div class="breakdown-lines">
                  <div
                    v-for="item in d.desglose.slice(0, 2)"
                    :key="`${rowKey(d)}-${item.documento}-${item.mesCargo}`"
                  >
                    <span>{{ item.conceptoNombre }} · {{ item.mesLabel || item.mesCargo }}</span>
                    <strong>{{ formatMoney(item.saldo) }}</strong>
                  </div>
                  <button v-if="d.desglose.length > 2" @click="openDetails(d)">
                    Ver {{ d.desglose.length - 2 }} más
                  </button>
                </div>
              </section>
            </div>

            <aside class="row-actions">
              <div class="action-progress" aria-label="Avance de gestiones">
                <span
                  v-for="action in actionCatalog"
                  :key="`${rowKey(d)}-${action.action}`"
                  :class="{
                    done: isActionCompleted(d, action.action),
                    ready: isActionExpected(d, action.action) && !isActionCompleted(d, action.action)
                  }"
                  :title="action.massLabel"
                ></span>
              </div>

              <button
                v-if="nextRunnableAction(d)"
                class="primary-row-action"
                :disabled="Boolean(runningAction)"
                @click="runSingleAction(d, nextRunnableAction(d).action)"
              >
                <component :is="nextRunnableAction(d).icon" :size="15" />
                {{ nextRunnableAction(d).shortLabel }}
              </button>
              <button v-else class="primary-row-action disabled" disabled>
                <LucideCheckCircle :size="15" />
                Sin acción lista
              </button>

              <div class="secondary-row-actions">
                <button @click="openException(d)">
                  <LucideCalendarClock :size="15" />
                  Fecha
                </button>
                <button @click="openDetails(d)">
                  <LucideEye :size="15" />
                  Detalle
                </button>
              </div>
            </aside>
          </article>
          </template>
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
            <h4>Desglose vencido</h4>
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
              class="drawer-action"
              :class="{ ready: canRunAction(detailsTarget, action.action), done: isActionCompleted(detailsTarget, action.action) }"
              :disabled="!canRunAction(detailsTarget, action.action) || Boolean(runningAction)"
              @click="runSingleAction(detailsTarget, action.action)"
            >
              <component :is="action.icon" :size="15" />
              {{ action.shortLabel }}
            </button>
            <button class="drawer-action neutral" @click="openException(detailsTarget)">
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
    pickLabel: 'Correos listos',
    massLabel: 'Enviar recordatorio por correo',
    title: 'Correo de recordatorio',
    description: 'Primer aviso formal con desglose claro.',
    icon: LucideMail,
    requires: 'correo'
  },
  {
    action: 'reporte_deudores',
    day: 14,
    dayLabel: 'Día 14',
    shortLabel: 'Corte',
    pickLabel: 'Cortes listos',
    massLabel: 'Registrar corte de deudores',
    title: 'Corte con desglose',
    description: 'Confirma el saldo vencido por concepto.',
    icon: LucideClipboardList
  },
  {
    action: 'whatsapp_contacto',
    day: 20,
    dayLabel: 'Día 20',
    shortLabel: 'WhatsApp',
    pickLabel: 'WhatsApp listos',
    massLabel: 'Enviar seguimiento por WhatsApp',
    title: 'Seguimiento por WhatsApp',
    description: 'Mensaje breve para familias con teléfono.',
    icon: LucideMessageCircle,
    requires: 'telefono'
  },
  {
    action: 'carta_suspension',
    day: 27,
    dayLabel: 'Día 27',
    shortLabel: 'Carta',
    pickLabel: 'Cartas listas',
    massLabel: 'Generar carta de suspensión',
    title: 'Carta de suspensión',
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
    title: 'Llamadas de cierre',
    description: 'Cierre de mes y seguimiento final.',
    icon: LucidePhone,
    requires: 'telefono'
  }
]

const segmentOptions = [
  { value: 'todos', label: 'Todos' },
  { value: 'accion', label: 'Listos' },
  { value: 'oficiales', label: 'Oficiales' },
  { value: 'excepciones', label: 'Fecha especial' },
  { value: 'sin_contacto', label: 'Sin contacto' }
]

const flowSteps = computed(() => [
  {
    key: 'periodo-pago',
    day: 1,
    dayEnd: 12,
    dayLabel: '1-12',
    title: 'Periodo de pago',
    description: 'Pagos regulares antes del vencimiento.',
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
  if (day <= 12) return 'El mes actual aún está dentro del periodo regular; solo aparecen saldos que ya vencieron.'
  if (day === 13) return 'Los recordatorios por correo ya pueden ejecutarse para alumnos con saldo vencido.'
  if (day >= 14 && day <= 19) return 'El corte muestra alumnos deudores y desglose por concepto adeudado.'
  if (day >= 20 && day <= 26) return 'El seguimiento por WhatsApp queda disponible para casos con teléfono registrado.'
  if (day === 27) return 'La carta de suspensión puede generarse para los casos seleccionados.'
  if (day >= currentMonthLastDay.value) return 'Las llamadas cierran el proceso y dejan trazabilidad del seguimiento.'
  return 'Las acciones previas siguen disponibles cuando aún no han sido registradas.'
})

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

const nextRunnableAction = (d) => {
  if (d?.proximaAccion && canRunAction(d, d.proximaAccion)) return getActionMeta(d.proximaAccion)
  return actionCatalog.find(action => canRunAction(d, action.action)) || null
}

const rowMatchesView = (d, query = normalizeText(search.value), segment = segmentFilter.value) => {
  const matchesSearch = !query || [d.nombreCompleto, d.matricula, d.padre, d.correo, d.telefono]
    .some(value => normalizeText(value).includes(query))

  if (!matchesSearch) return false
  if (segment === 'accion') return Boolean(canRunAction(d, selectedMassAction.value))
  if (segment === 'oficiales') return Boolean(d.deudorOficial)
  if (segment === 'excepciones') return Boolean(d.fechaLimiteEspecialVigente)
  if (segment === 'sin_contacto') return !d.correo || !d.telefono
  return true
}

const filteredDeudores = computed(() => {
  const q = normalizeText(search.value)
  return deudores.value.filter(d => rowMatchesView(d, q, segmentFilter.value))
})

const selectedRows = computed(() => {
  const keys = new Set(selectedKeys.value)
  return deudores.value.filter(d => keys.has(rowKey(d)))
})

const allVisibleSelected = computed(() => {
  return filteredDeudores.value.length > 0 && filteredDeudores.value.every(d => selectedKeys.value.includes(rowKey(d)))
})

const totalCartera = computed(() => deudores.value.reduce((sum, d) => sum + saldoValue(d), 0))
const filteredTotalCartera = computed(() => filteredDeudores.value.reduce((sum, d) => sum + saldoValue(d), 0))
const officialCount = computed(() => filteredDeudores.value.filter(d => d.deudorOficial).length)
const exceptionCount = computed(() => filteredDeudores.value.filter(d => d.fechaLimiteEspecialVigente).length)
const pendingConciliationCount = computed(() => filteredDeudores.value.filter(d => d.pagoPendienteConciliacion).length)
const noEmailCount = computed(() => filteredDeudores.value.filter(d => !d.correo).length)
const noPhoneCount = computed(() => filteredDeudores.value.filter(d => !d.telefono).length)
const noContactCount = computed(() => filteredDeudores.value.filter(d => !d.correo || !d.telefono).length)

const heroMetrics = computed(() => [
  { label: 'Alumnos', value: deudores.value.length, icon: LucideUsers },
  { label: 'Visibles', value: filteredDeudores.value.length, icon: LucideEye },
  { label: 'Oficiales', value: officialCount.value, icon: LucideShieldCheck }
])

const riskMetrics = computed(() => [
  { label: 'Con fecha especial', value: exceptionCount.value, icon: LucideCalendarClock, tone: 'tone-blue' },
  { label: 'Pago por conciliar', value: pendingConciliationCount.value, icon: LucideAlertTriangle, tone: 'tone-amber' },
  { label: 'Sin correo', value: noEmailCount.value, icon: LucideMail, tone: 'tone-coral' },
  { label: 'Sin teléfono', value: noPhoneCount.value, icon: LucidePhone, tone: 'tone-coral' }
])

const selectedActionMeta = computed(() => getActionMeta(selectedMassAction.value))
const actionableRowsForSelectedAction = computed(() => filteredDeudores.value.filter(d => canRunAction(d, selectedMassAction.value)))
const eligibleSelectedRows = computed(() => selectedRows.value.filter(d => canRunAction(d, selectedMassAction.value)))
const selectedActionCopy = computed(() => {
  if (selectedMassAction.value === 'correo_recordatorio') return 'Elige alumnos con correo y saldo vencido para enviar el primer aviso.'
  if (selectedMassAction.value === 'reporte_deudores') return 'Registra el corte y descarga el desglose que necesita administración.'
  if (selectedMassAction.value === 'whatsapp_contacto') return 'Usa WhatsApp solo con casos que ya tienen teléfono y sesión vinculada.'
  if (selectedMassAction.value === 'carta_suspension') return 'Genera cartas para casos avanzados sin perder el historial del seguimiento.'
  return 'Registra llamadas para dejar trazabilidad al cierre del periodo.'
})

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
    show(e?.statusMessage || 'No se pudo ejecutar la acción.', 'danger')
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
    const rowsForExport = rows.filter(d => rowMatchesView(d, q, segmentFilter.value))

    exportToCSV(`Deudores_${normalizeCicloKey(state.value.ciclo)}.csv`, buildExportRows(rowsForExport))
  } catch (e) {
    show('No se pudo exportar el reporte de deudores.', 'danger')
  } finally {
    loading.value = false
  }
}

const buildExportRows = (rows) => rows.flatMap((d) => {
  const nextAction = nextRunnableAction(d)
  const base = {
    Matricula: d.matricula,
    Nombre: d.nombreCompleto,
    Grado: `${d.nivel} - ${d.grado} ${d.grupo || ''}`.trim(),
    Tutor: d.padre || 'No registrado',
    Correo: d.correo || 'Sin correo',
    Telefono: d.telefono || '',
    Saldo_Pendiente_MXN: saldoValue(d).toFixed(2),
    Estatus_Flujo: d.estatusFlujoLabel || d.estatusFlujo,
    Accion_Sugerida: nextAction?.massLabel || '',
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
:global(body.deudores-page-active) {
  --debt-ink: #172338;
  --debt-soft-ink: #2c3b52;
  --debt-muted: #667386;
  --debt-faint: #8a96a8;
  --debt-line: #dde6e2;
  --debt-soft-line: #edf2ef;
  --debt-paper: #ffffff;
  --debt-canvas: #f7f9f7;
  --debt-green: #4f8549;
  --debt-teal: #247c73;
  --debt-blue: #2f6fb3;
  --debt-amber: #a96f16;
  --debt-coral: #c94a3f;
  --debt-shadow: 0 16px 38px rgba(31, 46, 41, 0.07);
}

:global(body.deudores-page-active .income-main) {
  overflow-y: auto;
  overscroll-behavior-y: contain;
  background: linear-gradient(180deg, #fbfcfb 0%, var(--debt-canvas) 100%);
}

:global(body.deudores-page-active .income-main::before) {
  display: none;
}

:global(body.deudores-page-active .income-content) {
  display: block;
  min-height: auto;
  overflow: visible;
  padding-top: 20px;
  padding-bottom: 40px;
}

:global(body.deudores-page-active .income-sidebar) {
  overflow-y: auto;
  overscroll-behavior: contain;
}

.debt-workspace {
  display: grid;
  width: min(100%, 1540px);
  margin: 0 auto;
  gap: 18px;
}

.debt-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(330px, 0.55fr);
  gap: 14px;
}

.hero-copy,
.hero-summary,
.journey-band,
.guide-panel,
.cases-header,
.filters-panel,
.action-console,
.student-row,
.empty-state {
  border: 1px solid var(--debt-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: var(--debt-shadow);
}

.hero-copy {
  position: relative;
  display: grid;
  min-height: 250px;
  align-content: center;
  gap: 16px;
  overflow: hidden;
  padding: 34px;
  background:
    linear-gradient(90deg, rgba(79, 133, 73, 0.045) 1px, transparent 1px),
    linear-gradient(180deg, #ffffff 0%, #f8fbf8 100%);
  background-size: 42px 42px, auto;
}

.hero-copy::after {
  content: "";
  position: absolute;
  inset: auto 0 0 0;
  height: 3px;
  background: linear-gradient(90deg, #91bd80, #78b8b0, #9cb8d6, #d7b86a);
}

.eyebrow,
.panel-kicker,
.summary-stage span,
.summary-amount span,
.summary-grid span,
.journey-heading span,
.journey-step span,
.visible-total span,
.filter-field span,
.balance-box span,
.contact-strip span,
.breakdown-title span,
.next-stats span,
.drawer-header span,
.drawer-total span,
.drawer-contact span {
  color: var(--debt-muted);
  font-size: 0.68rem;
  font-weight: 850;
  letter-spacing: 0;
  text-transform: uppercase;
}

.eyebrow {
  color: var(--debt-green);
}

.hero-copy h2,
.hero-copy p,
.guide-panel h3,
.cases-header h3,
.journey-heading strong {
  margin: 0;
}

.hero-copy h2 {
  max-width: 780px;
  color: var(--debt-ink);
  font-size: 2.5rem;
  font-weight: 900;
  line-height: 1.04;
  letter-spacing: 0;
}

.hero-copy p {
  max-width: 780px;
  color: var(--debt-muted);
  font-size: 0.98rem;
  font-weight: 620;
  line-height: 1.62;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn,
.primary-wide,
.secondary-wide,
.primary-row-action,
.secondary-row-actions button,
.drawer-action,
.quick-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 7px;
  font-weight: 820;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
}

.hero-copy .btn {
  min-height: 39px;
  padding: 0 14px;
}

.btn-outline,
.btn-secondary {
  border: 1px solid #d9e4dc;
  background: #fff;
  color: #304536;
}

.btn-secondary {
  background: #f2f8f2;
}

.btn-primary,
.primary-wide,
.primary-row-action {
  border: 1px solid #bfd7c2;
  background: #edf6ee;
  color: #315b39;
}

.btn:disabled,
.primary-wide:disabled,
.secondary-wide:disabled,
.primary-row-action:disabled,
.drawer-action:disabled,
.quick-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.hero-summary {
  display: grid;
  gap: 15px;
  padding: 18px;
}

.summary-stage {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border-bottom: 1px solid var(--debt-soft-line);
  padding-bottom: 14px;
}

.summary-stage strong {
  display: block;
  margin-top: 3px;
  color: var(--debt-ink);
  font-size: 1rem;
}

.summary-stage svg,
.summary-grid svg {
  color: var(--debt-teal);
}

.summary-amount strong {
  display: block;
  margin-top: 3px;
  color: var(--debt-coral);
  font-size: 2.08rem;
  line-height: 1.05;
  letter-spacing: 0;
}

.summary-progress {
  height: 7px;
  overflow: hidden;
  border: 1px solid #dfe8e2;
  border-radius: 999px;
  background: #f1f4f2;
}

.summary-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #6f9d65, #6ea9a2, #c3a45b);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid var(--debt-soft-line);
}

.summary-grid div {
  display: grid;
  gap: 5px;
  border-right: 1px solid var(--debt-soft-line);
  padding: 12px 10px 0 0;
}

.summary-grid div:last-child {
  border-right: 0;
  padding-left: 10px;
}

.summary-grid strong {
  color: var(--debt-ink);
  font-size: 1.22rem;
}

.journey-band {
  display: grid;
  gap: 15px;
  padding: 16px;
  box-shadow: 0 10px 28px rgba(31, 46, 41, 0.045);
}

.journey-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 22px;
  border-bottom: 1px solid var(--debt-soft-line);
  padding-bottom: 13px;
}

.journey-heading strong {
  display: block;
  margin-top: 3px;
  color: var(--debt-ink);
}

.journey-heading p {
  max-width: 680px;
  margin: 0;
  color: var(--debt-muted);
  font-size: 0.84rem;
  font-weight: 620;
  line-height: 1.5;
}

.journey-steps {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.journey-step {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  min-width: 0;
  border-left: 1px solid var(--debt-soft-line);
  padding: 4px 13px 2px;
}

.journey-step:first-child {
  border-left: 0;
  padding-left: 0;
}

.journey-step.today {
  box-shadow: inset 0 2px 0 #86b477;
}

.journey-step.active .step-icon {
  background: #edf6ee;
  color: var(--debt-green);
}

.step-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--debt-soft-line);
  border-radius: 8px;
  background: #f8faf8;
  color: var(--debt-teal);
}

.journey-step strong {
  display: block;
  overflow-wrap: anywhere;
  color: var(--debt-ink);
  font-size: 0.81rem;
  line-height: 1.25;
}

.journey-step p {
  margin: 4px 0 0;
  color: var(--debt-muted);
  font-size: 0.72rem;
  font-weight: 620;
  line-height: 1.35;
}

.collections-layout {
  display: grid;
  grid-template-columns: minmax(300px, 350px) minmax(0, 1fr);
  align-items: start;
  gap: 16px;
}

.guidance-column {
  position: sticky;
  top: 82px;
  display: grid;
  max-height: calc(100vh - 104px);
  gap: 12px;
  overflow-y: auto;
  padding-right: 3px;
  overscroll-behavior: contain;
}

.guide-panel {
  display: grid;
  gap: 13px;
  padding: 15px;
  box-shadow: none;
}

.guide-panel h3 {
  color: var(--debt-ink);
  font-size: 0.98rem;
  line-height: 1.25;
}

.guide-panel p {
  margin: 0;
  color: var(--debt-muted);
  font-size: 0.78rem;
  font-weight: 620;
  line-height: 1.55;
}

.next-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.next-stats div {
  display: grid;
  gap: 3px;
  border: 1px solid var(--debt-soft-line);
  border-radius: 8px;
  background: #fbfdfb;
  padding: 10px;
}

.next-stats strong {
  color: var(--debt-ink);
  font-size: 1.25rem;
  line-height: 1;
}

.primary-wide,
.secondary-wide {
  min-height: 38px;
  width: 100%;
  border-style: solid;
  padding: 0 12px;
  font-size: 0.78rem;
}

.secondary-wide {
  border: 1px solid var(--debt-line);
  background: #fff;
  color: var(--debt-soft-ink);
}

.whatsapp-guide {
  border: 1px solid var(--debt-line);
  border-radius: 8px;
  background: #fff;
  box-shadow: none;
}

.whatsapp-guide :deep(.wa-icon),
.whatsapp-guide :deep(.wa-guide),
.whatsapp-guide :deep(.wa-qr),
.whatsapp-guide :deep(.wa-message),
.whatsapp-guide :deep(.btn) {
  border-radius: 8px;
}

.whatsapp-guide :deep(.wa-title h3) {
  color: var(--debt-ink);
  font-size: 0.92rem;
}

.whatsapp-guide :deep(.wa-guide) {
  border-color: #d7eadc;
  background: #f5fbf6;
}

.whatsapp-guide :deep(.btn-primary) {
  border-color: #bfd7c2;
  background: #edf6ee;
  color: #315b39;
  box-shadow: none;
}

.panel-title-row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
}

.signal-list {
  display: grid;
  gap: 7px;
}

.signal-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  border: 1px solid var(--debt-soft-line);
  border-radius: 8px;
  background: #fbfdfb;
  padding: 9px 10px;
}

.signal-item span {
  min-width: 0;
  color: var(--debt-muted);
  font-size: 0.72rem;
  font-weight: 760;
}

.signal-item strong {
  color: var(--debt-ink);
  font-size: 1rem;
}

.tone-blue svg,
.tone-blue strong {
  color: var(--debt-blue);
}

.tone-amber svg,
.tone-amber strong {
  color: var(--debt-amber);
}

.tone-coral svg,
.tone-coral strong {
  color: var(--debt-coral);
}

.cases-column {
  display: grid;
  min-width: 0;
  gap: 12px;
}

.cases-header {
  display: flex;
  min-height: 62px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
}

.cases-header h3 {
  color: var(--debt-ink);
  font-size: 1.28rem;
  letter-spacing: 0;
}

.visible-total {
  text-align: right;
}

.visible-total strong {
  display: block;
  color: var(--debt-coral);
  font-size: 1.05rem;
}

.filters-panel {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(150px, 180px);
  gap: 10px;
  padding: 12px;
}

.search-box,
.filter-field select,
.mass-action select {
  min-height: 40px;
  border: 1px solid var(--debt-line);
  border-radius: 7px;
  background: #fbfcfb;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 11px;
}

.search-box svg {
  color: var(--debt-muted);
}

.search-box input,
.filter-field select,
.mass-action select {
  min-width: 0;
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--debt-ink);
  font-size: 0.82rem;
  font-weight: 740;
  outline: none;
}

.filter-field {
  display: grid;
  gap: 4px;
}

.filter-field select {
  padding: 0 10px;
}

.segment-control {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  min-height: 40px;
  border: 1px solid var(--debt-line);
  border-radius: 7px;
  background: #f3f6f4;
  padding: 3px;
}

.segment-button {
  min-width: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--debt-muted);
  font-size: 0.72rem;
  font-weight: 830;
}

.segment-button.active {
  background: #fff;
  color: var(--debt-ink);
  box-shadow: 0 4px 12px rgba(18, 32, 51, 0.06);
}

.action-console {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(330px, auto);
  align-items: center;
  gap: 13px;
  padding: 12px;
}

.select-all {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--debt-soft-ink);
  font-size: 0.78rem;
  font-weight: 850;
}

.select-all input,
.row-select input {
  accent-color: var(--debt-green);
}

.action-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.action-copy strong {
  overflow: hidden;
  color: var(--debt-ink);
  font-size: 0.84rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-copy span {
  color: var(--debt-muted);
  font-size: 0.74rem;
  font-weight: 650;
}

.mass-action {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.mass-action select {
  width: 250px;
  padding: 0 10px;
}

.mass-action .btn {
  min-height: 40px;
  padding: 0 13px;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.quick-actions button {
  min-height: 32px;
  border: 1px solid var(--debt-line);
  background: #fff;
  color: var(--debt-soft-ink);
  padding: 0 10px;
  font-size: 0.7rem;
}

.quick-actions button:hover:not(:disabled) {
  border-color: rgba(79, 133, 73, 0.36);
  background: #f3faf3;
  color: var(--debt-green);
  transform: translateY(-1px);
}

.cases-list {
  display: grid;
  gap: 9px;
}

.empty-state {
  display: grid;
  min-height: 340px;
  place-items: center;
  align-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
}

.empty-state strong {
  color: var(--debt-ink);
  font-size: 1rem;
}

.empty-state p {
  max-width: 390px;
  margin: 0;
  color: var(--debt-muted);
  font-size: 0.84rem;
  line-height: 1.5;
}

.empty-state svg {
  color: var(--debt-green);
}

.liquid-loader {
  display: inline-flex;
  gap: 5px;
}

.liquid-loader i {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--debt-green);
  animation: pulse-dot 860ms ease-in-out infinite;
}

.liquid-loader i:nth-child(2) {
  animation-delay: 120ms;
}

.liquid-loader i:nth-child(3) {
  animation-delay: 240ms;
}

.student-row {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(170px, 190px);
  gap: 14px;
  overflow: hidden;
  padding: 14px;
  box-shadow: none;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.student-row::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--debt-line);
}

.student-row:hover {
  border-color: rgba(47, 111, 179, 0.32);
  box-shadow: var(--debt-shadow);
  transform: translateY(-1px);
}

.student-row.selected {
  border-color: rgba(79, 133, 73, 0.48);
  background: #fbfefb;
}

.student-row.selected::before {
  background: var(--debt-green);
}

.student-row.official::before {
  background: var(--debt-coral);
}

.student-row.exception::before {
  background: var(--debt-blue);
}

.row-select {
  padding-top: 11px;
}

.row-select label {
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
}

.student-main {
  display: grid;
  min-width: 0;
  gap: 10px;
}

.student-header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.student-avatar {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid #dbe7dc;
  border-radius: 8px;
  background: #eef7ee;
  color: var(--debt-green);
  font-size: 0.74rem;
  font-weight: 900;
}

.student-identity {
  min-width: 0;
}

.name-line {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}

.name-line strong {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--debt-ink);
  font-size: 0.98rem;
  line-height: 1.25;
}

.name-line span {
  flex: 0 0 auto;
  border: 1px solid #dbe7f3;
  border-radius: 5px;
  background: #f7fbff;
  color: var(--debt-blue);
  padding: 2px 6px;
  font-size: 0.62rem;
  font-weight: 850;
}

.student-identity p {
  margin: 3px 0 0;
  color: var(--debt-muted);
  font-size: 0.74rem;
  font-weight: 680;
}

.balance-box {
  min-width: 120px;
  text-align: right;
}

.balance-box strong {
  display: block;
  color: var(--debt-coral);
  font-size: 1.06rem;
  line-height: 1.1;
}

.status-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.status-pill,
.info-pill,
.warning-pill {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  border-radius: 5px;
  padding: 0 8px;
  font-size: 0.66rem;
  font-weight: 850;
}

.status-success {
  background: #ebf7ed;
  color: var(--debt-green);
}

.status-warning {
  background: #fff6df;
  color: var(--debt-amber);
}

.status-danger {
  background: #fff0ed;
  color: var(--debt-coral);
}

.status-info,
.info-pill {
  background: #edf6ff;
  color: var(--debt-blue);
}

.warning-pill {
  background: #fff6df;
  color: var(--debt-amber);
}

.contact-strip {
  display: grid;
  grid-template-columns: 1.1fr 1.2fr 0.9fr 0.9fr;
  gap: 0;
  border-top: 1px solid var(--debt-soft-line);
  border-bottom: 1px solid var(--debt-soft-line);
}

.contact-strip div {
  min-width: 0;
  border-right: 1px solid var(--debt-soft-line);
  padding: 9px 12px 8px 0;
}

.contact-strip div + div {
  padding-left: 12px;
}

.contact-strip div:last-child {
  border-right: 0;
}

.contact-strip strong {
  display: block;
  overflow: hidden;
  color: var(--debt-soft-ink);
  font-size: 0.75rem;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.breakdown-strip {
  display: grid;
  gap: 7px;
  border: 1px solid var(--debt-soft-line);
  border-radius: 8px;
  background: #fbfdfb;
  padding: 10px;
}

.breakdown-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.breakdown-title strong {
  color: var(--debt-blue);
  font-size: 0.74rem;
}

.breakdown-lines {
  display: grid;
  gap: 5px;
}

.breakdown-lines div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--debt-soft-ink);
  font-size: 0.74rem;
  font-weight: 680;
}

.breakdown-lines span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.breakdown-lines strong {
  flex: 0 0 auto;
  color: var(--debt-coral);
}

.breakdown-lines button {
  width: max-content;
  border: 0;
  background: transparent;
  color: var(--debt-blue);
  font-size: 0.72rem;
  font-weight: 850;
  padding: 0;
}

.row-actions {
  display: grid;
  align-content: start;
  gap: 9px;
}

.action-progress {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
}

.action-progress span {
  height: 6px;
  border-radius: 999px;
  background: #e8eee9;
}

.action-progress span.ready {
  background: #d7e8d1;
}

.action-progress span.done {
  background: var(--debt-green);
}

.primary-row-action {
  min-height: 36px;
  width: 100%;
  padding: 0 10px;
  font-size: 0.74rem;
}

.primary-row-action.disabled {
  border-color: var(--debt-line);
  background: #f7f9f8;
  color: var(--debt-muted);
}

.secondary-row-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.secondary-row-actions button {
  min-height: 32px;
  border: 1px solid var(--debt-line);
  background: #fff;
  color: var(--debt-soft-ink);
  font-size: 0.69rem;
}

.modal-overlay,
.drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  background: rgba(18, 32, 51, 0.38);
}

.modal-overlay {
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-container {
  width: min(520px, 100%);
  overflow: hidden;
  border: 1px solid var(--debt-line);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 24px 64px rgba(18, 32, 51, 0.2);
}

.modal-header,
.modal-content,
.modal-footer {
  padding: 16px;
}

.modal-header,
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.modal-header {
  border-bottom: 1px solid var(--debt-soft-line);
}

.modal-footer {
  border-top: 1px solid var(--debt-soft-line);
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--debt-ink);
  font-size: 1rem;
}

.modal-content {
  display: grid;
  gap: 14px;
}

.exception-summary,
.drawer-muted,
.drawer-note {
  display: grid;
  gap: 3px;
  border-radius: 8px;
  background: #f7f9f8;
  padding: 12px;
}

.exception-summary strong {
  color: var(--debt-ink);
}

.exception-summary span,
.drawer-muted,
.drawer-note {
  color: var(--debt-muted);
  font-size: 0.82rem;
}

.form-group {
  display: grid;
  gap: 6px;
}

.form-label {
  color: var(--debt-soft-ink);
  font-size: 0.76rem;
  font-weight: 850;
}

.input-field {
  width: 100%;
  border: 1px solid var(--debt-line);
  border-radius: 8px;
  background: #fbfcfb;
  color: var(--debt-ink);
  padding: 10px 11px;
  font: inherit;
  outline: none;
}

.exception-note {
  min-height: 110px;
  resize: vertical;
}

.detail-drawer {
  display: grid;
  width: min(590px, 100%);
  height: 100%;
  margin-left: auto;
  overflow-y: auto;
  align-content: start;
  gap: 13px;
  border-left: 1px solid var(--debt-line);
  background: #fff;
  padding: 18px;
  box-shadow: -18px 0 44px rgba(18, 32, 51, 0.18);
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--debt-soft-line);
  padding-bottom: 14px;
}

.drawer-header h3 {
  margin: 3px 0;
  color: var(--debt-ink);
  font-size: 1.25rem;
  line-height: 1.2;
}

.drawer-header p {
  margin: 0;
  color: var(--debt-muted);
  font-size: 0.82rem;
}

.drawer-total {
  display: grid;
  gap: 3px;
  border: 1px solid #f1d7d2;
  border-radius: 8px;
  background: #fff6f4;
  padding: 14px;
}

.drawer-total strong {
  color: var(--debt-coral);
  font-size: 1.7rem;
}

.drawer-contact {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.drawer-contact div,
.drawer-list div {
  min-width: 0;
  border: 1px solid var(--debt-soft-line);
  border-radius: 8px;
  background: #fbfdfb;
  padding: 10px;
}

.drawer-contact strong {
  display: block;
  overflow-wrap: anywhere;
  color: var(--debt-soft-ink);
  font-size: 0.82rem;
}

.drawer-section {
  display: grid;
  gap: 8px;
}

.drawer-section h4 {
  margin: 0;
  color: var(--debt-ink);
  font-size: 0.88rem;
}

.drawer-list {
  display: grid;
  gap: 6px;
}

.drawer-list div {
  display: flex;
  justify-content: space-between;
  gap: 14px;
}

.drawer-list span {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--debt-soft-ink);
  font-size: 0.8rem;
  font-weight: 700;
}

.drawer-list strong {
  flex: 0 0 auto;
  color: var(--debt-coral);
  font-size: 0.8rem;
}

.drawer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  border-top: 1px solid var(--debt-soft-line);
  padding-top: 13px;
}

.drawer-action {
  min-height: 32px;
  border: 1px solid var(--debt-line);
  background: #fff;
  color: var(--debt-muted);
  padding: 0 10px;
  font-size: 0.7rem;
}

.drawer-action.ready {
  border-color: rgba(79, 133, 73, 0.34);
  background: #f4faf3;
  color: var(--debt-green);
}

.drawer-action.done {
  border-color: rgba(79, 133, 73, 0.22);
  background: #eaf5e9;
  color: var(--debt-green);
}

.drawer-action.neutral {
  color: var(--debt-soft-ink);
}

.btn-sm {
  min-height: 32px;
  padding: 0 10px;
}

.btn-ghost {
  border: 1px solid transparent;
  background: transparent;
  color: var(--debt-muted);
}

@keyframes pulse-dot {
  0%, 100% {
    transform: translateY(0);
    opacity: 0.45;
  }
  50% {
    transform: translateY(-4px);
    opacity: 1;
  }
}

@media (max-width: 1320px) {
  .journey-steps {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    row-gap: 12px;
  }

  .journey-step:nth-child(4) {
    border-left: 0;
    padding-left: 0;
  }

  .action-console {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .mass-action {
    grid-column: 1 / -1;
  }
}

@media (max-width: 1180px) {
  .collections-layout {
    grid-template-columns: 1fr;
  }

  .guidance-column {
    position: static;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    max-height: none;
    overflow: visible;
    padding-right: 0;
  }

  .whatsapp-guide,
  .signal-panel {
    grid-column: 1 / -1;
  }
}

@media (max-width: 980px) {
  .debt-hero {
    grid-template-columns: 1fr;
  }

  .student-row {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .row-actions {
    grid-column: 2 / -1;
  }

  .contact-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .contact-strip div:nth-child(2) {
    border-right: 0;
  }

  .contact-strip div:nth-child(n + 3) {
    border-top: 1px solid var(--debt-soft-line);
  }
}

@media (max-width: 760px) {
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

  :global(body.deudores-page-active .income-content) {
    padding-left: 14px;
    padding-right: 14px;
  }

  .hero-copy {
    min-height: auto;
    padding: 24px;
  }

  .hero-copy h2 {
    font-size: 2rem;
  }

  .summary-grid,
  .journey-steps,
  .guidance-column,
  .filters-panel,
  .segment-control,
  .contact-strip,
  .drawer-contact {
    grid-template-columns: 1fr;
  }

  .summary-grid div,
  .summary-grid div:last-child {
    border-right: 0;
    border-bottom: 1px solid var(--debt-soft-line);
    padding: 11px 0;
  }

  .summary-grid div:last-child {
    border-bottom: 0;
  }

  .journey-heading,
  .cases-header,
  .action-console {
    align-items: stretch;
    flex-direction: column;
  }

  .journey-step,
  .journey-step:nth-child(4) {
    border-left: 0;
    border-top: 1px solid var(--debt-soft-line);
    padding: 12px 0 0;
  }

  .journey-step:first-child {
    border-top: 0;
  }

  .action-console {
    grid-template-columns: 1fr;
  }

  .mass-action {
    justify-content: stretch;
  }

  .mass-action select,
  .mass-action .btn {
    width: 100%;
  }

  .student-header {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .balance-box {
    grid-column: 1 / -1;
    min-width: 0;
    text-align: left;
  }

  .contact-strip div,
  .contact-strip div + div {
    border-right: 0;
    border-top: 1px solid var(--debt-soft-line);
    padding: 9px 0;
  }

  .contact-strip div:first-child {
    border-top: 0;
  }

  .row-actions {
    grid-column: 1 / -1;
  }
}

@media (max-width: 520px) {
  .hero-actions,
  .mass-action,
  .drawer-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .hero-actions .btn,
  .mass-action .btn,
  .drawer-action {
    width: 100%;
  }

  .student-row {
    grid-template-columns: 1fr;
  }

  .row-select {
    padding-top: 0;
  }

  .row-select label {
    width: auto;
    justify-content: flex-start;
  }
}
</style>
