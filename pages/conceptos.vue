<template>
  <div class="concept-governance-page">
    <section class="governance-hero">
      <div>
        <span class="section-kicker">Super admin</span>
        <h2>Conceptos</h2>
        <p>Existencias por plantel para los conceptos que requieren control físico.</p>
      </div>
      <div class="governance-status">
        <span>Fuente</span>
        <strong>{{ sourceLabel }}</strong>
        <button v-if="canManage" type="button" class="mini-action" :disabled="loading || syncing" @click="syncCentralToBridge">
          <LucideRefreshCw :size="15" :class="{ 'animate-spin': syncing }" />
          Actualizar
        </button>
      </div>
    </section>

    <section v-if="!canManage" class="card blocked-card">
      <LucideLock :size="18" />
      <span>Ruta administrativa.</span>
    </section>

    <template v-else>
      <section class="mode-switcher" aria-label="Modo de conceptos">
        <button type="button" :class="{ active: viewMode === 'mappings' }" @click="viewMode = 'mappings'">Categorías</button>
        <button type="button" :class="{ active: viewMode === 'stock' }" @click="viewMode = 'stock'">Existencias</button>
      </section>

      <section class="governance-toolbar">
        <label>
          <span>Ciclo</span>
          <select v-model="selectedCiclo">
            <option v-for="cycle in cycleOptions" :key="cycle.value" :value="cycle.value">{{ cycle.label }}</option>
          </select>
        </label>
        <label v-if="viewMode === 'mappings'">
          <span>Plantel</span>
          <select v-model="selectedPlantel">
            <option v-for="plantel in plantelOptions" :key="plantel" :value="plantel">{{ plantel }}</option>
          </select>
        </label>
        <label v-if="viewMode === 'mappings'">
          <span>Categoría</span>
          <select v-model="selectedCategory">
            <option v-for="category in categories" :key="category.key" :value="category.key">{{ category.label }}</option>
          </select>
        </label>
        <label v-else>
          <span>Estado stock</span>
          <select v-model="stockFilter">
            <option value="all">Todos</option>
            <option value="controlled">Con existencia</option>
            <option value="low">Bajos</option>
            <option value="out">Agotados</option>
          </select>
        </label>
        <div class="search-box governance-search">
          <LucideSearch :size="16" />
          <input v-model="search" type="search" placeholder="Buscar concepto o taller" />
        </div>
        <button type="button" class="btn btn-outline" :disabled="loading" @click="loadAdmin">
          <LucideRefreshCw :size="16" :class="{ 'animate-spin': loading }" />
          Actualizar
        </button>
      </section>

      <section v-if="viewMode === 'stock'" class="stock-kpi-grid">
        <div class="card stock-kpi"><span>Conceptos</span><strong>{{ stockKpis.controlled }}</strong></div>
        <div class="card stock-kpi"><span>Unidades</span><strong>{{ stockKpis.available }}</strong></div>
        <div class="card stock-kpi"><span>Bajos</span><strong>{{ stockKpis.low }}</strong></div>
        <div class="card stock-kpi danger"><span>Agotados</span><strong>{{ stockKpis.out }}</strong></div>
      </section>

      <section v-if="viewMode === 'stock'" class="stock-workspace">
        <div class="card stock-list-card">
          <div class="governance-card-head">
            <div>
              <span class="section-kicker">Existencias</span>
              <h3>{{ selectedCiclo || 'Ciclo' }}</h3>
            </div>
            <button type="button" class="btn btn-outline" :disabled="syncingStock" @click="syncStockCentralToBridge">
              <LucideRefreshCw :size="16" :class="{ 'animate-spin': syncingStock }" />
              Actualizar stock
            </button>
          </div>

          <div v-if="loading" class="empty-panel">Cargando...</div>
          <div v-else-if="!visibleStockRows.length" class="empty-panel">Sin resultados</div>
          <div v-else class="stock-list">
            <button
              v-for="concept in visibleStockRows"
              :key="concept.id"
              type="button"
              :class="['stock-row', stockRowClass(concept), { selected: selectedStockConcept?.id === concept.id }]"
              @click="selectStockConcept(concept)"
            >
              <span class="stock-row-id">{{ concept.id }}</span>
              <span class="stock-row-main">
                <strong>{{ concept.concepto }}</strong>
                <small>${{ formatMoney(concept.costo) }}</small>
              </span>
              <span class="stock-plantel-strip">
                <template v-if="conceptControlledPlantels(concept).length">
                  <span
                    v-for="item in conceptControlledPlantels(concept).slice(0, 5)"
                    :key="`${concept.id}-${item.plantel}`"
                    :class="['stock-mini-chip', stockBadgeClass(item.stock)]"
                  >
                    <b>{{ item.plantel }}</b>
                    {{ stockMiniLabel(item.stock) }}
                  </span>
                </template>
                <span v-else class="stock-add-dot">+</span>
              </span>
            </button>
          </div>
        </div>

        <aside class="card stock-editor">
          <template v-if="selectedStockConcept">
            <div class="governance-card-head compact stock-detail-head">
              <div>
                <span class="section-kicker">{{ selectedStockConcept.id }}</span>
                <h3>{{ selectedStockConcept.concepto }}</h3>
              </div>
              <strong>{{ selectedConceptTotal }}</strong>
            </div>

            <div class="plantel-stock-grid">
              <article
                v-for="item in selectedPlantelStates"
                :key="`${selectedStockConcept.id}-${item.plantel}`"
                :class="['plantel-stock-card', stockBadgeClass(item.stock), { empty: !item.stock.controlled }]"
              >
                <header>
                  <span>{{ item.plantel }}</span>
                  <i v-if="item.stock.controlled && item.stock.status === 'out'">Agotado</i>
                  <i v-else-if="item.stock.controlled && item.stock.status === 'low'">Bajo</i>
                </header>
                <strong>{{ stockDisplayValue(item.stock) }}</strong>
                <footer>
                  <button type="button" class="stock-card-action primary" :disabled="savingStock" @click="openStockSheet('add', item)">
                    + Agregar
                  </button>
                  <button v-if="item.stock.controlled" type="button" class="stock-card-action" :disabled="savingStock" @click="openStockSheet('adjust', item)">
                    Ajustar
                  </button>
                </footer>
              </article>
            </div>

            <div class="stock-movements">
              <div class="insight-head"><span>Movimientos</span><strong>{{ selectedStockMovements.length }}</strong></div>
              <div v-if="!selectedStockMovements.length" class="empty-inline">—</div>
              <div v-for="movement in selectedStockMovements" :key="movement.id" class="movement-row">
                <span>{{ formatMovementType(movement.movement_type) }} · {{ movement.plantel }}</span>
                <strong>{{ signedQuantity(movement.quantity_delta) }}</strong>
                <small>{{ movement.created_at || '—' }}</small>
              </div>
            </div>
          </template>
          <div v-else class="empty-panel">Selecciona un concepto</div>
        </aside>
      </section>

      <section v-else class="governance-grid">
        <div class="governance-main-card card">
          <div class="governance-card-head">
            <div>
              <span class="section-kicker">{{ activeCategoryLabel }}</span>
              <h3>{{ selectedCiclo || 'Ciclo' }} · {{ selectedPlantel }}</h3>
            </div>
            <strong>{{ visibleMappings.length }}</strong>
          </div>

          <div v-if="loading" class="empty-panel">Cargando configuración...</div>
          <div v-else-if="!visibleMappings.length" class="empty-panel">Sin conceptos asignados.</div>

          <div v-else class="mapping-list">
            <article v-for="mapping in visibleMappings" :key="mapping.id" class="mapping-row">
              <div class="mapping-id">{{ mapping.concepto_id || '—' }}</div>
              <div class="mapping-body">
                <strong>{{ mapping.concepto_nombre }}</strong>
                <span>{{ mapping.plantel }} · {{ mapping.cycle_name }}</span>
                <div v-if="mapping.enrollment_type === 'mensual_baja4'" class="tiny-chip-row">
                  <span v-for="month in parseMonths(mapping.months_json)" :key="month" class="tiny-chip">{{ month }}</span>
                </div>
                <div v-if="mapping.enrollment_type === 'talleres_servicios' && mapping.servicio_nombre" class="service-link">
                  <img :src="serviceImage(mapping.servicio_clave || mapping.servicio_nombre)" alt="" loading="lazy" />
                  {{ mapping.servicio_nombre }}
                </div>
              </div>
              <button type="button" class="icon-action danger" title="Quitar" @click="removeMapping(mapping)">
                <LucideTrash2 :size="15" />
              </button>
            </article>
          </div>
        </div>

        <aside class="governance-side card">
          <div class="governance-card-head compact">
            <div>
              <span class="section-kicker">Asignar</span>
              <h3>Concepto</h3>
            </div>
          </div>

          <div class="concept-search-select">
            <div class="search-box">
              <LucideSearch :size="15" />
              <input v-model="conceptSearch" type="search" placeholder="Buscar concepto" />
            </div>
            <div class="concept-options">
              <button
                v-for="concept in conceptOptions"
                :key="concept.id"
                type="button"
                :class="['concept-option', { selected: selectedConcept?.id === concept.id }]"
                @click="selectedConcept = concept"
              >
                <span>{{ concept.id }}</span>
                <strong>{{ concept.concepto }}</strong>
                <small>{{ concept.ciclo_escolar || 'sin ciclo' }}</small>
              </button>
            </div>
          </div>

          <div v-if="selectedCategory === 'talleres_servicios'" class="service-editor service-catalog-picker">
            <label>
              <span>Taller/servicio</span>
              <input v-model="serviceSearch" type="search" placeholder="Buscar taller" />
            </label>
            <div class="service-catalog-options">
              <button
                v-for="service in visibleCatalogServices"
                :key="service.clave"
                type="button"
                :class="['service-catalog-option', { selected: selectedService?.clave === service.clave }]"
                @click="selectService(service)"
              >
                <img :src="service.imagen" alt="" loading="lazy" />
                <span>{{ service.nombre }}</span>
              </button>
            </div>
          </div>

          <div v-if="selectedCategory === 'mensual_baja4'" class="months-grid">
            <button
              v-for="month in months"
              :key="month"
              type="button"
              :class="{ selected: selectedMonths.includes(month) }"
              @click="toggleMonth(month)"
            >{{ month }}</button>
          </div>

          <button type="button" class="btn btn-primary full" :disabled="saving || !canSaveMapping" @click="saveMapping">
            <LucidePlus :size="16" />
            Guardar
          </button>

        </aside>
      </section>

      <section v-if="viewMode === 'mappings'" class="governance-bottom-grid">
        <div class="card insight-card">
          <div class="insight-head">
            <span>Sin categoría</span>
            <strong>{{ uncategorizedConcepts.length }}</strong>
          </div>
          <div class="insight-list">
            <span v-for="concept in uncategorizedConcepts.slice(0, 8)" :key="concept.id">{{ concept.id }} · {{ concept.concepto }}</span>
            <em v-if="!uncategorizedConcepts.length">Todo clasificado en este ciclo.</em>
          </div>
        </div>
        <div class="card insight-card">
          <div class="insight-head">
            <span>Catálogo de talleres</span>
            <strong>{{ serviciosCatalogo.length }}</strong>
          </div>
          <div class="insight-list service-tags">
            <span v-for="service in serviciosCatalogo.slice(0, 12)" :key="service.clave">
              <img :src="service.imagen || serviceImage(service.clave || service.nombre)" alt="" loading="lazy" /> {{ service.nombre }}
            </span>
            <em v-if="!serviciosCatalogo.length">Sin servicios configurados.</em>
          </div>
        </div>
      </section>
    </template>

    <Teleport to="body">
      <div v-if="stockSheet.open" class="stock-sheet-overlay" @click.self="closeStockSheet">
        <div class="stock-sheet" role="dialog" aria-modal="true">
          <header>
            <div>
              <span>{{ stockSheet.plantel }}</span>
              <strong>{{ stockSheet.mode === 'adjust' ? 'Ajustar' : 'Agregar' }}</strong>
            </div>
            <button type="button" class="stock-sheet-close" aria-label="Cerrar" @click="closeStockSheet">×</button>
          </header>
          <p>{{ selectedStockConcept?.concepto }}</p>
          <div class="stock-sheet-qty">
            <button type="button" @click="nudgeStockQuantity(-1)">−</button>
            <input v-model.number="stockSheet.quantity" type="number" min="0" step="1" inputmode="numeric" />
            <button type="button" @click="nudgeStockQuantity(1)">+</button>
          </div>
          <textarea v-model="stockSheet.note" placeholder="Nota"></textarea>
          <footer>
            <button type="button" class="btn btn-outline" @click="closeStockSheet">Cancelar</button>
            <button type="button" class="btn btn-primary" :disabled="savingStock" @click="submitStockSheet">Guardar</button>
          </footer>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useCookie, useState } from '#app'
import { LucideLock, LucidePlus, LucideRefreshCw, LucideSearch, LucideTrash2 } from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { formatCicloLabel, normalizeCicloKey } from '~/shared/utils/ciclo'
import { PLANTELES_LIST } from '~/utils/constants'
import { DEFAULT_TALLER_SERVICIO_IMAGE, normalizeServicioClave } from '~/shared/utils/talleresServicios'

const { show } = useToast()
const state = useState('globalState')
const activePlantelCookie = useCookie('auth_active_plantel')

const loading = ref(false)
const saving = ref(false)
const syncing = ref(false)
const adminPayload = ref(null)
const selectedCiclo = ref('')
const selectedPlantel = ref(String(activePlantelCookie.value || 'PT').toUpperCase() === 'GLOBAL' ? 'PT' : String(activePlantelCookie.value || 'PT').toUpperCase())
const selectedCategory = ref('regular')
const search = ref('')
const conceptSearch = ref('')
const selectedConcept = ref(null)
const serviceName = ref('')
const serviceSearch = ref('')
const selectedMonths = ref([])
const viewMode = ref('mappings')
const stockFilter = ref('all')
const selectedStockConcept = ref(null)
const stockSheet = ref({ open: false, mode: 'add', plantel: '', quantity: 1, note: '' })
const savingStock = ref(false)
const syncingStock = ref(false)

const months = ['Ago', 'Sep', 'Oct', 'Nov', 'Dic', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul']
const fallbackCategories = [
  { key: 'regular', label: 'Inscripción' },
  { key: 'talleres_servicios', label: 'Talleres y Servicios' },
  { key: 'servicio_global', label: 'Servicio global' },
  { key: 'curso_verano', label: 'Curso de Verano' },
  { key: 'mensual_baja4', label: 'Mensual baja 4' },
  { key: 'issste', label: 'ISSSTE' },
  { key: 'otro', label: 'Otro' },
]

const canManage = computed(() => Boolean(adminPayload.value?.canManage))
const sourceLabel = computed(() => adminPayload.value?.source === 'central' ? 'Central' : 'Respaldo')
const categories = computed(() => adminPayload.value?.categorias?.length ? adminPayload.value.categorias.map((item) => ({ key: item.key, label: item.label })) : fallbackCategories)
const mappings = computed(() => Array.isArray(adminPayload.value?.mappings) ? adminPayload.value.mappings : [])
const conceptos = computed(() => Array.isArray(adminPayload.value?.conceptos) ? adminPayload.value.conceptos : [])
const talleres = computed(() => Array.isArray(adminPayload.value?.talleres) ? adminPayload.value.talleres : [])
const serviciosCatalogo = computed(() => Array.isArray(adminPayload.value?.serviciosCatalogo) ? adminPayload.value.serviciosCatalogo : [])
const stockPayload = computed(() => adminPayload.value?.stock || { source: 'bridge', snapshots: [], movements: [] })
const stockSourceLabel = computed(() => stockPayload.value?.source === 'central' ? 'Central' : 'Bridge')
const plantelOptions = computed(() => [...PLANTELES_LIST])
const cycleOptions = computed(() => {
  const fromCycles = Array.isArray(adminPayload.value?.cycles)
    ? adminPayload.value.cycles.map((cycle) => cycle.cycle_name).filter(Boolean)
    : []
  const fromPayload = Object.keys(adminPayload.value?.ciclos || {})
  const fromConcepts = conceptos.value.map((concept) => concept.ciclo_escolar).filter(Boolean)
  const values = Array.from(new Set([adminPayload.value?.cicloActual, normalizeCicloKey(state.value?.ciclo), ...fromCycles, ...fromPayload, ...fromConcepts].filter(Boolean)))
  return values.map((value) => ({ value, label: formatCicloLabel(value) })).sort((a, b) => b.value.localeCompare(a.value))
})
const activeCategoryLabel = computed(() => categories.value.find((entry) => entry.key === selectedCategory.value)?.label || 'Categoría')

const normalizeText = (value) => String(value || '').trim().toLowerCase()
const parseMonths = (value) => {
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(String(value || '[]'))
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}
const serviceKey = (name) => normalizeServicioClave(name)
const serviceImage = (value) => {
  const key = serviceKey(value)
  return serviciosCatalogo.value.find((service) => service.clave === key)?.imagen || (key ? `/talleres-servicios/${key}.svg` : DEFAULT_TALLER_SERVICIO_IMAGE)
}

const visibleMappings = computed(() => {
  const term = normalizeText(search.value)
  return mappings.value.filter((mapping) => {
    if (normalizeCicloKey(mapping.cycle_name) !== selectedCiclo.value) return false
    if (String(mapping.plantel || '').toUpperCase() !== selectedPlantel.value) return false
    if (String(mapping.enrollment_type || 'regular') !== selectedCategory.value) return false
    if (!term) return true
    return [mapping.concepto_id, mapping.concepto_nombre, mapping.servicio_nombre, mapping.servicio_clave]
      .some((value) => normalizeText(value).includes(term))
  })
})

const conceptOptions = computed(() => {
  const term = normalizeText(conceptSearch.value)
  return conceptos.value
    .filter((concept) => {
      if (selectedCiclo.value && concept.ciclo_escolar && normalizeCicloKey(concept.ciclo_escolar) !== selectedCiclo.value) return false
      if (!term) return true
      return [concept.id, concept.concepto, concept.ciclo_escolar].some((value) => normalizeText(value).includes(term))
    })
    .slice(0, 80)
})

const configuredConceptIds = computed(() => new Set(mappings.value
  .filter((mapping) => normalizeCicloKey(mapping.cycle_name) === selectedCiclo.value && Number(mapping.concepto_id || 0) > 0)
  .map((mapping) => String(Number(mapping.concepto_id))))
)
const uncategorizedConcepts = computed(() => conceptos.value
  .filter((concept) => (!selectedCiclo.value || normalizeCicloKey(concept.ciclo_escolar) === selectedCiclo.value) && !configuredConceptIds.value.has(String(Number(concept.id))))
  .slice(0, 80)
)
const selectedService = computed(() => serviciosCatalogo.value.find((service) => service.clave === serviceKey(serviceName.value)) || null)
const visibleCatalogServices = computed(() => {
  const term = normalizeText(serviceSearch.value)
  return serviciosCatalogo.value
    .filter((service) => !term || [service.nombre, service.clave].some((value) => normalizeText(value).includes(term)))
    .slice(0, 48)
})
const defaultStock = (concept, plantel = '') => ({
  concepto_id: Number(concept?.id || 0),
  plantel: String(plantel || '').toUpperCase(),
  controlled: false,
  stock_enabled: false,
  status: 'uncontrolled',
  on_hand: null,
  reserved: 0,
  available: null,
  reorder_point: 0,
  allow_negative: false,
  unit_label: 'unidad'
})

const allStockSnapshots = computed(() => {
  const snapshots = Array.isArray(stockPayload.value?.allSnapshots)
    ? stockPayload.value.allSnapshots
    : Array.isArray(stockPayload.value?.snapshots) ? stockPayload.value.snapshots : []
  return snapshots.filter((snapshot) => Number(snapshot?.concepto_id || 0) > 0 && String(snapshot?.plantel || '').trim())
})

const stockForPlantel = (concept, plantel) => {
  const conceptoId = Number(concept?.id || 0)
  const code = String(plantel || '').toUpperCase()
  return allStockSnapshots.value.find((snapshot) => Number(snapshot.concepto_id || 0) === conceptoId && String(snapshot.plantel || '').toUpperCase() === code) || defaultStock(concept, code)
}

const plantelStatesForConcept = (concept) => plantelOptions.value.map((plantel) => ({ plantel, stock: stockForPlantel(concept, plantel) }))
const conceptControlledPlantels = (concept) => plantelStatesForConcept(concept).filter((item) => item.stock?.controlled)

const stockRows = computed(() => conceptos.value
  .filter((concept) => !selectedCiclo.value || normalizeCicloKey(concept.ciclo_escolar || concept.ciclo) === selectedCiclo.value)
)

const visibleStockRows = computed(() => {
  const term = normalizeText(search.value)
  return stockRows.value.filter((concept) => {
    const states = plantelStatesForConcept(concept)
    const hasControlled = states.some((item) => item.stock?.controlled)
    const hasLow = states.some((item) => item.stock?.status === 'low')
    const hasOut = states.some((item) => item.stock?.status === 'out')
    if (stockFilter.value === 'controlled' && !hasControlled) return false
    if (stockFilter.value === 'low' && !hasLow) return false
    if (stockFilter.value === 'out' && !hasOut) return false
    if (!term) return true
    return [concept.id, concept.concepto, concept.ciclo_escolar, concept.description].some((value) => normalizeText(value).includes(term))
  })
})

const stockKpis = computed(() => {
  const controlledSnapshots = allStockSnapshots.value.filter((stock) => stock?.controlled)
  return {
    controlled: new Set(controlledSnapshots.map((stock) => Number(stock.concepto_id || 0))).size,
    available: controlledSnapshots.reduce((sum, stock) => sum + Math.max(0, Number(stock.available ?? stock.on_hand ?? 0)), 0),
    low: controlledSnapshots.filter((stock) => stock.status === 'low').length,
    out: controlledSnapshots.filter((stock) => stock.status === 'out').length,
  }
})

const selectedPlantelStates = computed(() => selectedStockConcept.value ? plantelStatesForConcept(selectedStockConcept.value) : [])
const selectedConceptTotal = computed(() => selectedPlantelStates.value
  .filter((item) => item.stock?.controlled)
  .reduce((sum, item) => sum + Math.max(0, Number(item.stock.available ?? item.stock.on_hand ?? 0)), 0)
)

const selectedStockMovements = computed(() => {
  const conceptId = Number(selectedStockConcept.value?.id || 0)
  const movements = Array.isArray(stockPayload.value?.movements) ? stockPayload.value.movements : []
  return movements.filter((movement) => Number(movement.concepto_id || 0) === conceptId).slice(0, 12)
})

const stockDisplayValue = (stock) => stock?.controlled ? String(Math.max(0, Number(stock.available ?? stock.on_hand ?? 0))) : '—'
const stockMiniLabel = (stock) => stock?.status === 'out' ? '0' : String(Math.max(0, Number(stock?.available ?? stock?.on_hand ?? 0)))

const stockBadgeClass = (stock) => {
  if (!stock?.controlled) return 'neutral'
  if (stock.status === 'out') return 'danger'
  if (stock.status === 'low') return 'warning'
  return 'success'
}

const stockRowClass = (concept) => {
  const states = plantelStatesForConcept(concept)
  if (states.some((item) => item.stock?.status === 'out')) return 'danger'
  if (states.some((item) => item.stock?.status === 'low')) return 'warning'
  if (states.some((item) => item.stock?.controlled)) return 'has-stock'
  return 'empty'
}

const signedQuantity = (value) => {
  const qty = Number(value || 0)
  return qty > 0 ? `+${qty}` : String(qty)
}

const formatMovementType = (type) => ({
  restock: 'Entrada',
  adjustment: 'Ajuste',
  payment_consume: 'Venta',
  payment_release: 'Liberación',
  payment_cancel_restore: 'Cancelación',
}[String(type || '')] || 'Movimiento')

const formatMoney = (value) => Number(value || 0).toFixed(2)

const selectStockConcept = (concept) => {
  selectedStockConcept.value = concept
  stockSheet.value = { open: false, mode: 'add', plantel: '', quantity: 1, note: '' }
}

const refreshSelectedStockConcept = () => {
  if (!selectedStockConcept.value?.id) return
  const updated = stockRows.value.find((concept) => String(concept.id) === String(selectedStockConcept.value.id))
  if (updated) selectedStockConcept.value = updated
}

const openStockSheet = (mode, item) => {
  const current = Math.max(0, Number(item?.stock?.on_hand ?? item?.stock?.available ?? 0))
  stockSheet.value = {
    open: true,
    mode,
    plantel: item?.plantel || '',
    quantity: mode === 'adjust' ? current : 1,
    note: ''
  }
}

const closeStockSheet = () => {
  stockSheet.value.open = false
}

const nudgeStockQuantity = (delta) => {
  const next = Math.max(0, Number(stockSheet.value.quantity || 0) + delta)
  stockSheet.value.quantity = next
}

const submitStockSheet = async () => {
  if (!selectedStockConcept.value?.id || !stockSheet.value.plantel) return
  const plantel = stockSheet.value.plantel
  const quantity = Math.trunc(Number(stockSheet.value.quantity || 0))
  if (!Number.isFinite(quantity) || quantity < 0) return show('Cantidad inválida', 'danger')
  savingStock.value = true
  try {
    if (stockSheet.value.mode === 'adjust') {
      const current = Math.max(0, Number(stockForPlantel(selectedStockConcept.value, plantel)?.on_hand ?? stockForPlantel(selectedStockConcept.value, plantel)?.available ?? 0))
      const delta = quantity - current
      if (delta !== 0) {
        await $fetch('/api/conceptos-stock/adjust', {
          method: 'POST',
          body: { concepto_id: selectedStockConcept.value.id, plantel, quantity: delta, note: stockSheet.value.note }
        })
      }
    } else {
      if (quantity <= 0) return show('Cantidad inválida', 'danger')
      await $fetch('/api/conceptos-stock/restock', {
        method: 'POST',
        body: { concepto_id: selectedStockConcept.value.id, plantel, quantity, note: stockSheet.value.note }
      })
    }
    show('Existencia actualizada', 'success')
    closeStockSheet()
    await loadAdmin()
    refreshSelectedStockConcept()
  } catch (error) {
    show(error?.data?.message || 'No se pudo actualizar', 'danger')
  } finally {
    savingStock.value = false
  }
}

const syncStockCentralToBridge = async () => {
  syncingStock.value = true
  try {
    await $fetch('/api/conceptos-stock/sync/central-to-bridge', { method: 'POST' })
    show('Existencias actualizadas', 'success')
    await loadAdmin()
    refreshSelectedStockConcept()
  } catch (error) {
    show(error?.data?.message || 'No se pudo actualizar existencias', 'danger')
  } finally {
    syncingStock.value = false
  }
}

const canSaveMapping = computed(() => Boolean(selectedConcept.value?.id && selectedCiclo.value && selectedPlantel.value && selectedCategory.value && (selectedCategory.value !== 'talleres_servicios' || selectedService.value?.clave)))


const loadAdmin = async () => {
  loading.value = true
  try {
    const result = await $fetch('/api/conceptos-config/admin', { params: { plantel: selectedPlantel.value } })
    adminPayload.value = result
    if (!selectedCiclo.value) selectedCiclo.value = result?.cicloActual || cycleOptions.value[0]?.value || normalizeCicloKey(state.value?.ciclo)
  } catch (error) {
    show('Error cargando conceptos', 'danger')
  } finally {
    loading.value = false
  }
}

const resetDraft = () => {
  selectedConcept.value = null
  conceptSearch.value = ''
  serviceName.value = ''
  serviceSearch.value = ''
  selectedMonths.value = []
}

const saveMapping = async () => {
  if (!canSaveMapping.value) return
  saving.value = true
  try {
    await $fetch('/api/conceptos-config/mappings', {
      method: 'POST',
      body: {
        ciclo: selectedCiclo.value,
        plantel: selectedPlantel.value,
        tipo: selectedCategory.value,
        concepto_id: selectedConcept.value.id,
        concepto_nombre: selectedConcept.value.concepto,
        meses: selectedMonths.value,
        servicio_nombre: selectedService.value?.nombre || serviceName.value,
        servicio_clave: selectedService.value?.clave || serviceKey(serviceName.value),
      }
    })
    show('Concepto guardado', 'success')
    resetDraft()
    await loadAdmin()
  } catch (error) {
    show(error?.data?.message || error?.data?.error || 'No se pudo guardar', 'danger')
  } finally {
    saving.value = false
  }
}

const removeMapping = async (mapping) => {
  if (!window.confirm(`Quitar ${mapping.concepto_nombre}?`)) return
  try {
    await $fetch(`/api/conceptos-config/mappings/${mapping.id}`, { method: 'DELETE' })
    show('Concepto quitado', 'success')
    await loadAdmin()
  } catch (error) {
    show('No se pudo quitar', 'danger')
  }
}

const syncCentralToBridge = async () => {
  syncing.value = true
  try {
    await $fetch('/api/conceptos-config/sync/central-to-bridge', { method: 'POST' })
    show('Bridge sincronizado', 'success')
    await loadAdmin()
  } catch (error) {
    show('No se pudo sincronizar', 'danger')
  } finally {
    syncing.value = false
  }
}

const toggleMonth = (month) => {
  selectedMonths.value = selectedMonths.value.includes(month)
    ? selectedMonths.value.filter((entry) => entry !== month)
    : [...selectedMonths.value, month]
}

watch(selectedPlantel, () => {
  selectedStockConcept.value = null
  loadAdmin()
})

watch(selectedCategory, () => {
  if (selectedCategory.value !== 'talleres_servicios') {
    serviceName.value = ''
    serviceSearch.value = ''
  }
  if (selectedCategory.value !== 'mensual_baja4') selectedMonths.value = []
})
const selectService = (service) => {
  serviceName.value = service?.nombre || ''
  serviceSearch.value = service?.nombre || ''
}

watch(selectedCategory, () => {
  if (selectedCategory.value !== 'talleres_servicios') return
  if (!serviceName.value && serviciosCatalogo.value.length) selectService(serviciosCatalogo.value[0])
})

onMounted(loadAdmin)
</script>

<style scoped>
.concept-governance-page {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
}

.governance-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  flex-shrink: 0;
  border: 1px solid rgba(212, 225, 216, 0.9);
  border-radius: 22px;
  background:
    radial-gradient(circle at 96% 0%, rgba(142, 193, 83, 0.15), transparent 14rem),
    linear-gradient(135deg, rgba(255,255,255,.98), rgba(248,252,246,.96));
  padding: 18px 20px;
  box-shadow: 0 14px 34px rgba(22, 38, 65, 0.06);
}

.section-kicker {
  display: block;
  margin-bottom: 3px;
  color: #3d7f36;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.governance-hero h2,
.governance-card-head h3 {
  margin: 0;
  color: #162641;
  font-family: var(--font-display, Fredoka, Montserrat, sans-serif);
  font-weight: 600;
  letter-spacing: -0.018em;
}

.governance-hero h2 { font-size: clamp(1.35rem, 1.15rem + .55vw, 1.9rem); }
.governance-hero p { max-width: 760px; margin: 5px 0 0; color: #65748b; font-size: .86rem; line-height: 1.45; }

.governance-status {
  display: flex;
  min-width: 218px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #dfe8ee;
  border-radius: 16px;
  background: rgba(255,255,255,.9);
  padding: 10px 11px 10px 13px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.7);
}

.governance-status span { display: block; color: #718096; font-size: .64rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
.governance-status strong { display: block; color: #162641; font-size: .92rem; font-weight: 700; }

.mini-action,
.icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d8e2eb;
  background: #fff;
  color: #56677e;
  transition: transform 150ms ease, border-color 150ms ease, background 150ms ease, color 150ms ease, box-shadow 150ms ease;
}

.mini-action {
  gap: 7px;
  min-height: 32px;
  border-radius: 11px;
  padding: 0 10px;
  font-size: .72rem;
  font-weight: 700;
}

.mini-action:hover,
.icon-action:hover {
  transform: translateY(-1px);
  border-color: rgba(78,132,78,.3);
  box-shadow: 0 8px 17px rgba(22,38,65,.055);
}

.blocked-card { display: flex; align-items: center; gap: 10px; padding: 18px; color: #53647a; font-weight: 700; }

.governance-toolbar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  align-items: end;
  flex-shrink: 0;
  border: 1px solid rgba(223,230,239,.86);
  border-radius: 18px;
  background: rgba(255,255,255,.88);
  padding: 12px;
  box-shadow: 0 10px 26px rgba(22,38,65,.045);
}

.governance-toolbar label,
.service-editor label { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.governance-toolbar label span,
.service-editor label span { color: #708096; font-size: .64rem; font-weight: 700; text-transform: uppercase; letter-spacing: .075em; }

.governance-toolbar select,
.service-editor input {
  height: 38px;
  width: 100%;
  min-width: 0;
  border: 1px solid #d8e1ec;
  border-radius: 12px;
  background: #fff;
  color: #162641;
  padding: 0 11px;
  font-size: .84rem;
  font-weight: 600;
  outline: none;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  min-width: 0;
  border: 1px solid #d8e1ec;
  border-radius: 12px;
  background: #fff;
  padding: 0 11px;
  color: #718096;
}

.search-box input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: #162641; font-size: .84rem; font-weight: 600; }

.governance-grid {
  display: grid;
  grid-template-columns: minmax(620px, 1fr) minmax(420px, 0.44fr);
  gap: 14px;
  min-height: 0;
  flex: 1;
}

.card {
  border: 1px solid #dfe6ef;
  border-radius: 20px;
  background: rgba(255,255,255,.96);
  box-shadow: 0 13px 31px rgba(22,38,65,.055);
}

.governance-main-card,
.governance-side {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 14px;
}

.governance-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 12px; flex-shrink: 0; }
.governance-card-head.compact { margin-bottom: 10px; }
.governance-card-head h3 { font-size: 1.05rem; }
.governance-card-head strong { min-width: 36px; height: 30px; display: grid; place-items: center; border-radius: 11px; background: #f0f7ec; color: #3f7e36; font-weight: 700; }

.mapping-list { display: flex; min-height: 0; flex: 1; flex-direction: column; gap: 8px; overflow: auto; padding-right: 4px; }
.mapping-row { display: grid; grid-template-columns: 56px minmax(0,1fr) auto; gap: 11px; align-items: center; border: 1px solid #e4eaf1; border-radius: 15px; padding: 10px 11px; background: #fbfcfe; }
.mapping-id { height: 38px; border-radius: 12px; background: #eff4f8; color: #5c6d82; display: grid; place-items: center; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .73rem; font-weight: 800; }
.mapping-body { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.mapping-body strong { color: #162641; font-size: .9rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mapping-body span { color: #718096; font-size: .74rem; font-weight: 600; }
.tiny-chip-row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 3px; }
.tiny-chip { border: 1px solid #d8e6d2; background: #f5faf2; color: #407337; border-radius: 999px; padding: 2px 6px; font-size: .65rem; font-weight: 700; }
.service-link { display: inline-flex; align-items: center; width: max-content; max-width: 100%; gap: 6px; color: #274560; font-size: .75rem; font-weight: 700; }
.service-link span { --service-accent: #6aa957; width: 22px; height: 22px; border-radius: 9px; display: grid; place-items: center; background: color-mix(in srgb, var(--service-accent) 14%, white); color: var(--service-accent); }

.icon-action { width: 32px; height: 32px; border-radius: 11px; }
.icon-action.danger:hover { color: #c24141; border-color: #f0caca; background: #fff7f7; }
.empty-panel { display: grid; place-items: center; min-height: 210px; color: #718096; font-weight: 700; }

.concept-search-select { display: flex; min-height: 0; flex: 1; flex-direction: column; gap: 9px; }
.concept-options { display: flex; min-height: 170px; flex: 1; flex-direction: column; gap: 7px; overflow: auto; padding-right: 3px; }
.concept-option { display: grid; grid-template-columns: 50px minmax(0,1fr) auto; gap: 9px; align-items: center; text-align: left; border: 1px solid #e3eaf1; border-radius: 13px; background: #fbfcfe; padding: 9px; transition: border-color 140ms ease, background 140ms ease, transform 140ms ease; }
.concept-option:hover { transform: translateY(-1px); border-color: rgba(78,132,78,.28); background: #fff; }
.concept-option.selected { border-color: #7fb069; background: #f4faef; }
.concept-option span { color: #708096; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 800; font-size: .7rem; }
.concept-option strong { color: #162641; font-size: .8rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.concept-option small { color: #8a98aa; font-size: .68rem; font-weight: 700; }

.service-editor { display: flex; flex-direction: column; gap: 9px; margin-top: 12px; flex-shrink: 0; }
.service-inline-fields { display: grid; grid-template-columns: 92px 1fr; gap: 8px; }
.months-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 12px; flex-shrink: 0; }
.months-grid button { border: 1px solid #dfe6ef; border-radius: 10px; background: #fff; color: #65758c; padding: 7px 0; font-size: .72rem; font-weight: 700; }
.months-grid button.selected { border-color: #7fb069; background: #f4faef; color: #3f7e36; }
.btn.full { width: 100%; justify-content: center; margin-top: 12px; flex-shrink: 0; }

.governance-bottom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; flex-shrink: 0; }
.insight-card { padding: 13px; }
.insight-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.insight-head span { color: #65758c; font-size: .73rem; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; }
.insight-head strong { color: #162641; font-size: 1.05rem; font-weight: 700; }
.insight-list { display: flex; flex-wrap: wrap; gap: 6px; max-height: 92px; overflow: auto; }
.insight-list span { border: 1px solid #e3eaf1; background: #fbfcfe; border-radius: 999px; padding: 5px 8px; color: #52647a; font-size: .72rem; font-weight: 600; }
.insight-list em { color: #8a98aa; font-size: .8rem; font-style: normal; }
.service-tags span { --service-accent: #6aa957; background: color-mix(in srgb, var(--service-accent) 12%, white); border-color: color-mix(in srgb, var(--service-accent) 28%, white); color: #274560; }

@media (min-width: 1600px) {
  .governance-grid { grid-template-columns: minmax(720px, 1fr) minmax(480px, .42fr); }
  .governance-toolbar { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
}

@media (max-width: 1320px) {
  .governance-grid { grid-template-columns: minmax(0, 1fr); }
  .governance-side { min-height: 440px; }
}

@media (max-width: 1120px) {
  .governance-hero { align-items: stretch; flex-direction: column; }
  .governance-status { width: 100%; }
  .governance-toolbar { grid-template-columns: 1fr 1fr; }
  .governance-search { grid-column: 1 / -1; }
  .governance-toolbar .btn { grid-column: 1 / -1; }
  .governance-bottom-grid { grid-template-columns: 1fr; }
}

@media (max-width: 700px) {
  .governance-toolbar { grid-template-columns: 1fr; }
  .mapping-row,
  .concept-option { grid-template-columns: 46px minmax(0,1fr); }
  .mapping-row .icon-action,
  .concept-option small { grid-column: 2; justify-self: start; }
}


.service-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.service-link img,
.service-tags img {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  border-radius: 8px;
  object-fit: cover;
}

.service-catalog-picker {
  display: grid;
  gap: 10px;
}

.service-catalog-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 7px;
  max-height: 230px;
  overflow: auto;
}

.service-catalog-option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  border: 1px solid #dde7ef;
  border-radius: 13px;
  background: #fff;
  color: #314158;
  cursor: pointer;
  padding: 7px;
  text-align: left;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.service-catalog-option:hover,
.service-catalog-option.selected {
  border-color: rgba(79, 139, 71, .34);
  box-shadow: 0 10px 18px rgba(21, 35, 60, .055);
  transform: translateY(-1px);
}

.service-catalog-option.selected {
  background: #f7fbf5;
  color: #3f7c38;
}

.service-catalog-option img {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  border-radius: 12px;
  object-fit: cover;
}

.service-catalog-option span {
  min-width: 0;
  overflow: hidden;
  font-size: .72rem;
  font-weight: 840;
  text-overflow: ellipsis;
  white-space: nowrap;
}


.mode-switcher {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  border: 1px solid rgba(223,230,239,.86);
  border-radius: 16px;
  background: rgba(255,255,255,.88);
  padding: 8px;
}

.mode-switcher button {
  min-height: 34px;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  color: #65758c;
  padding: 0 12px;
  font-size: .76rem;
  font-weight: 800;
}

.mode-switcher button.active {
  border-color: #d8e6d2;
  background: #f4faef;
  color: #3f7e36;
}

.mode-switcher span {
  margin-left: auto;
  color: #718096;
  font-size: .72rem;
  font-weight: 700;
}

.stock-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  flex-shrink: 0;
}

.stock-kpi {
  padding: 13px 14px;
}

.stock-kpi span {
  display: block;
  color: #708096;
  font-size: .65rem;
  font-weight: 800;
  letter-spacing: .07em;
  text-transform: uppercase;
}

.stock-kpi strong {
  display: block;
  margin-top: 4px;
  color: #162641;
  font-size: 1.25rem;
  font-weight: 800;
}

.stock-kpi.danger strong { color: #b42318; }

.stock-workspace {
  display: grid;
  grid-template-columns: minmax(620px, 1fr) minmax(380px, .42fr);
  gap: 14px;
  min-height: 0;
  flex: 1;
}

.stock-list-card,
.stock-editor {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 14px;
}

.stock-list {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  padding-right: 4px;
}

.stock-row {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  width: 100%;
  border: 1px solid #e4eaf1;
  border-radius: 15px;
  background: #fbfcfe;
  padding: 10px 11px;
  text-align: left;
  transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
}

.stock-row:hover,
.stock-row.selected {
  transform: translateY(-1px);
  border-color: rgba(78,132,78,.34);
  background: #fff;
}

.stock-row.warning { border-color: #f6d38b; }
.stock-row.danger { border-color: #f0b4b4; }

.stock-row-id {
  display: grid;
  height: 38px;
  place-items: center;
  border-radius: 12px;
  background: #eff4f8;
  color: #5c6d82;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .73rem;
  font-weight: 850;
}

.stock-row-main {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.stock-row-main strong {
  overflow: hidden;
  color: #162641;
  font-size: .88rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stock-row-main small,
.stock-summary small {
  color: #718096;
  font-size: .72rem;
  font-weight: 700;
}

.stock-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  border-radius: 999px;
  padding: 0 10px;
  font-size: .7rem;
  font-weight: 850;
  white-space: nowrap;
}

.stock-badge.neutral { border: 1px solid #dfe6ef; background: #f6f8fb; color: #68778c; }
.stock-badge.success { border: 1px solid #cbe7c5; background: #f1faee; color: #356b2f; }
.stock-badge.warning { border: 1px solid #f2d59a; background: #fff8e8; color: #9a6512; }
.stock-badge.danger { border: 1px solid #f0b4b4; background: #fff1f1; color: #b42318; }

.stock-summary {
  display: grid;
  gap: 7px;
  border: 1px solid #e4eaf1;
  border-radius: 15px;
  background: #fbfcfe;
  padding: 12px;
}

.stock-summary strong {
  color: #162641;
  font-size: .92rem;
}

.stock-form,
.stock-action-grid {
  display: grid;
  gap: 9px;
  margin-top: 12px;
}

.stock-form label,
.stock-action-grid label {
  display: grid;
  gap: 5px;
}

.stock-form label span,
.stock-action-grid label span {
  color: #708096;
  font-size: .64rem;
  font-weight: 800;
  letter-spacing: .07em;
  text-transform: uppercase;
}

.stock-form input[type='text'],
.stock-form input[type='number'],
.stock-action-grid input,
.stock-note {
  width: 100%;
  border: 1px solid #d8e1ec;
  border-radius: 12px;
  background: #fff;
  color: #162641;
  padding: 10px 11px;
  font-size: .84rem;
  font-weight: 650;
  outline: none;
}

.stock-toggle {
  display: flex !important;
  grid-template-columns: none !important;
  align-items: center;
  gap: 8px !important;
  border: 1px solid #e4eaf1;
  border-radius: 13px;
  background: #fff;
  padding: 10px 11px;
}

.stock-toggle span {
  color: #314158 !important;
  font-size: .78rem !important;
  letter-spacing: 0 !important;
  text-transform: none !important;
}

.stock-toggle.subtle { background: #fbfcfe; }
.stock-action-grid { grid-template-columns: minmax(0, 1fr) auto; align-items: end; }
.stock-note { min-height: 68px; margin-top: 10px; resize: vertical; }
.stock-movements { display: grid; gap: 7px; margin-top: 12px; min-height: 0; overflow: auto; }
.movement-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 5px 10px; border: 1px solid #e6edf4; border-radius: 12px; padding: 8px 10px; background: #fbfcfe; }
.movement-row span { color: #314158; font-size: .75rem; font-weight: 800; }
.movement-row strong { color: #162641; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.movement-row small { grid-column: 1 / -1; color: #8290a3; font-size: .68rem; font-weight: 650; }
.empty-inline { color: #8a98aa; font-size: .78rem; font-weight: 700; }

@media (max-width: 1320px) {
  .stock-workspace { grid-template-columns: 1fr; }
  .stock-editor { min-height: 420px; }
}

@media (max-width: 760px) {
  .mode-switcher { align-items: stretch; flex-direction: column; }
  .mode-switcher span { margin-left: 0; }
  .stock-kpi-grid { grid-template-columns: 1fr 1fr; }
  .stock-row { grid-template-columns: 46px minmax(0, 1fr); }
  .stock-row .stock-badge { grid-column: 2; justify-self: start; }
  .stock-action-grid { grid-template-columns: 1fr; }
}

.stock-plantel-strip {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.stock-mini-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  border-radius: 999px;
  padding: 0 10px;
  font-size: .76rem;
  font-weight: 850;
}

.stock-mini-chip b {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .68rem;
  opacity: .75;
}

.stock-mini-chip.success { border: 1px solid #cbe7c5; background: #f1faee; color: #356b2f; }
.stock-mini-chip.warning { border: 1px solid #f2d59a; background: #fff8e8; color: #9a6512; }
.stock-mini-chip.danger { border: 1px solid #f0b4b4; background: #fff1f1; color: #b42318; }
.stock-mini-chip.neutral { border: 1px solid #dfe6ef; background: #f6f8fb; color: #68778c; }

.stock-add-dot {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px dashed #b9cad8;
  border-radius: 999px;
  color: #65758c;
  font-size: 1.25rem;
  font-weight: 700;
}

.stock-row.empty .stock-row-id { background: #f6f8fb; color: #8a98aa; }
.stock-row.has-stock { border-color: #d8e6d2; }

.stock-detail-head strong {
  min-width: 48px;
  height: 42px;
  border-radius: 14px;
  font-size: 1.2rem;
}

.plantel-stock-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
  gap: 10px;
  overflow: auto;
  padding: 2px 2px 4px;
}

.plantel-stock-card {
  display: grid;
  gap: 10px;
  min-height: 154px;
  border: 1px solid #dfe6ef;
  border-radius: 18px;
  background: #fff;
  padding: 13px;
}

.plantel-stock-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.plantel-stock-card header span {
  color: #314158;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .82rem;
  font-weight: 900;
}

.plantel-stock-card header i {
  border-radius: 999px;
  background: rgba(255,255,255,.72);
  padding: 3px 7px;
  font-size: .64rem;
  font-style: normal;
  font-weight: 850;
}

.plantel-stock-card > strong {
  color: #162641;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: clamp(2rem, 1.5rem + 2vw, 3rem);
  font-weight: 900;
  line-height: .95;
}

.plantel-stock-card footer {
  display: grid;
  grid-template-columns: 1fr;
  gap: 7px;
  align-self: end;
}

.stock-card-action {
  min-height: 42px;
  border: 1px solid #d8e2eb;
  border-radius: 13px;
  background: #fff;
  color: #314158;
  font-size: .82rem;
  font-weight: 850;
}

.stock-card-action.primary {
  border-color: #2f6f35;
  background: #2f6f35;
  color: #fff;
}

.plantel-stock-card.neutral { background: #fbfcfe; }
.plantel-stock-card.success { border-color: #cbe7c5; background: #f6fbf3; }
.plantel-stock-card.warning { border-color: #f2d59a; background: #fff9ea; }
.plantel-stock-card.danger { border-color: #efb1b1; background: #fff3f3; }
.plantel-stock-card.empty > strong { color: #a7b2c1; }

.stock-sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: end center;
  background: rgba(9, 20, 36, .42);
  padding: 18px;
}

.stock-sheet {
  width: min(460px, 100%);
  border: 1px solid rgba(255,255,255,.48);
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 24px 68px rgba(7, 18, 34, .22);
  padding: 16px;
}

.stock-sheet header,
.stock-sheet footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.stock-sheet header span {
  display: block;
  color: #3d7f36;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .78rem;
  font-weight: 900;
}

.stock-sheet header strong {
  display: block;
  color: #162641;
  font-size: 1.15rem;
  font-weight: 900;
}

.stock-sheet-close {
  width: 38px;
  height: 38px;
  border: 1px solid #dfe6ef;
  border-radius: 13px;
  background: #fff;
  color: #52647a;
  font-size: 1.4rem;
  line-height: 1;
}

.stock-sheet p {
  margin: 10px 0 14px;
  color: #65758c;
  font-size: .9rem;
  font-weight: 750;
}

.stock-sheet-qty {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) 58px;
  gap: 10px;
  align-items: center;
}

.stock-sheet-qty button {
  height: 58px;
  border: 1px solid #d8e2eb;
  border-radius: 18px;
  background: #f8fafc;
  color: #162641;
  font-size: 2rem;
  font-weight: 800;
}

.stock-sheet-qty input {
  height: 66px;
  width: 100%;
  border: 1px solid #d8e2eb;
  border-radius: 18px;
  color: #162641;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 2rem;
  font-weight: 900;
  text-align: center;
  outline: none;
}

.stock-sheet textarea {
  width: 100%;
  min-height: 74px;
  margin: 12px 0;
  border: 1px solid #d8e2eb;
  border-radius: 16px;
  color: #162641;
  padding: 12px;
  font-size: .9rem;
  font-weight: 650;
  outline: none;
  resize: vertical;
}

.stock-sheet footer .btn {
  min-height: 44px;
  flex: 1;
  justify-content: center;
}

@media (max-width: 760px) {
  .stock-plantel-strip { justify-content: flex-start; grid-column: 1 / -1; }
  .plantel-stock-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .plantel-stock-card { min-height: 150px; padding: 11px; }
  .stock-card-action { min-height: 44px; }
  .stock-sheet-overlay { padding: 10px; }
  .stock-sheet { border-radius: 22px 22px 16px 16px; }
}

</style>
