<template>
  <div class="conceptos-page">
    <section v-if="!canManage" class="card blocked-card">
      <LucideLock :size="18" />
      <span>Ruta administrativa.</span>
    </section>

    <template v-else>
      <template v-if="viewMode === 'stock'">
        <section class="inventory-hero card">
          <div class="inventory-title-block">
            <div class="inventory-title-line">
              <h2>Inventario</h2>
              <span class="live-chip"><i></i> Stock en tiempo real</span>
            </div>
          </div>
          <div class="hero-actions">
            <div class="conceptos-tabs" aria-label="Modo de conceptos">
              <button type="button" :class="{ active: viewMode === 'stock' }" @click="viewMode = 'stock'">
                <LucidePackage :size="16" />
                Inventario
              </button>
              <button type="button" :class="{ active: viewMode === 'mappings' }" @click="viewMode = 'mappings'">
                <LucideTag :size="16" />
                Categorías
              </button>
            </div>
            <div class="conceptos-source-pill" :class="stockPayload.source === 'central' ? 'online' : 'backup'">
              <span aria-hidden="true"></span>
              {{ stockSourceLabel }}
            </div>
            <div class="inventory-view-actions" aria-label="Vista">
              <button type="button" class="square-action" aria-label="Vista por etiquetas"><LucideTag :size="17" /></button>
              <button type="button" class="square-action active" aria-label="Vista de tarjetas"><LucideGrid3X3 :size="17" /></button>
              <button type="button" class="square-action" aria-label="Resumen"><LucidePieChart :size="17" /></button>
            </div>
          </div>
        </section>

        <section class="inventory-kpis" :class="{ scoped: Boolean(selectedStockConcept) }">
          <article v-for="kpi in inventoryKpiCards" :key="kpi.key" class="inventory-kpi card" :class="kpi.tone">
            <div>
              <span>{{ kpi.label }}</span>
              <strong>{{ kpi.value }}</strong>
              <small>{{ kpi.caption }}</small>
            </div>
            <i class="kpi-icon" aria-hidden="true"><component :is="kpi.icon" :size="26" /></i>
          </article>
        </section>

        <section class="inventory-toolbar card">
          <label class="toolbar-field compact">
            <span>Ciclo</span>
            <select v-model="selectedCiclo">
              <option v-for="cycle in cycleOptions" :key="cycle.value" :value="cycle.value">{{ cycle.label }}</option>
            </select>
          </label>
          <label class="toolbar-field compact">
            <span>Estado</span>
            <select v-model="stockFilter">
              <option value="all">Todos</option>
              <option value="controlled">Activos</option>
              <option value="low">Stock bajo</option>
              <option value="out">Agotados</option>
            </select>
          </label>
          <div class="filter-chips" aria-label="Filtros rápidos">
            <button
              v-for="option in stockFilterOptions"
              :key="option.value"
              type="button"
              :class="{ active: stockFilter === option.value }"
              @click="stockFilter = option.value"
            >{{ option.label }}</button>
          </div>
          <div class="search-box inventory-search">
            <LucideSearch :size="18" />
            <input v-model="search" type="search" placeholder="Buscar concepto o taller..." />
          </div>
          <button type="button" class="btn btn-outline inventory-refresh" :disabled="loading || syncingStock" @click="syncStockCentralToBridge">
            <LucideRefreshCw :size="16" :class="{ 'animate-spin': loading || syncingStock }" />
            Actualizar
          </button>
          <button type="button" class="btn btn-primary inventory-new" @click="openConceptCreateModal">
            <LucidePlus :size="17" />
            Nuevo concepto
          </button>
        </section>

        <section class="inventory-workspace">
          <div class="inventory-list-card card">
            <header class="panel-head">
              <h3>Conceptos <span>({{ visibleStockRows.length }})</span></h3>
            </header>

            <div v-if="loading" class="empty-panel">Cargando...</div>
            <div v-else-if="!visibleStockRows.length" class="empty-panel">Sin resultados</div>
            <div v-else class="inventory-list">
              <button
                v-for="concept in visibleStockRows"
                :key="concept.id"
                type="button"
                :class="['inventory-row', stockRowClass(concept), { selected: selectedStockConcept?.id === concept.id }]"
                @click="selectStockConcept(concept)"
              >
                <span class="concept-id-badge">{{ concept.id }}</span>
                <span class="concept-thumb" :class="{ empty: !conceptImageUrl(concept) }">
                  <img v-if="conceptImageUrl(concept)" :src="conceptImageUrl(concept)" alt="" loading="lazy" />
                  <LucidePackage v-else :size="22" />
                </span>
                <span class="inventory-row-main">
                  <strong>{{ concept.concepto }}</strong>
                  <small>${{ formatMoney(concept.costo) }}</small>
                </span>
                <span class="inventory-row-stock">
                  <small>{{ conceptStockLabel(concept) }}</small>
                  <strong>{{ conceptTotalAvailable(concept) }}</strong>
                  <span class="stock-meter"><i :style="{ width: `${conceptStockPercent(concept)}%` }"></i></span>
                  <em>{{ conceptStockPercent(concept) }}%</em>
                </span>
                <span class="row-menu"><LucideMoreVertical :size="17" /></span>
              </button>
            </div>
          </div>

          <aside class="inventory-detail card">
            <template v-if="selectedStockConcept">
              <header class="detail-head">
                <span class="detail-image" :class="{ empty: !conceptImageUrl(selectedStockConcept) }">
                  <img v-if="conceptImageUrl(selectedStockConcept)" :src="conceptImageUrl(selectedStockConcept)" alt="" loading="lazy" />
                  <LucidePackage v-else :size="26" />
                </span>
                <div>
                  <span class="concept-id-pill">{{ selectedStockConcept.id }}</span>
                  <h3>{{ selectedStockConcept.concepto }}</h3>
                  <small>${{ formatMoney(selectedStockConcept.costo) }}</small>
                </div>
                <button type="button" class="status-pill" @click="openConceptImageModal(selectedStockConcept)">
                  <LucideImage :size="14" />
                  Imagen
                </button>
              </header>

              <section class="detail-stat-row">
                <article>
                  <span>Disponibles</span>
                  <strong>{{ selectedConceptAvailable }}</strong>
                  <small>{{ selectedConceptPercent }}%</small>
                </article>
                <article>
                  <span>Total unidades</span>
                  <strong>{{ selectedConceptOnHand }}</strong>
                </article>
                <article>
                  <span>Stock bajo</span>
                  <strong class="warning">{{ selectedLowCount }}</strong>
                </article>
                <article>
                  <span>Agotados</span>
                  <strong class="danger">{{ selectedOutCount }}</strong>
                </article>
              </section>

              <nav class="detail-tabs" aria-label="Detalle de inventario">
                <button type="button" :class="{ active: detailTab === 'distribution' }" @click="detailTab = 'distribution'">Distribución</button>
                <button type="button" :class="{ active: detailTab === 'movements' }" @click="detailTab = 'movements'">Movimientos</button>
                <button type="button" :class="{ active: detailTab === 'quick' }" @click="detailTab = 'quick'">Ajustes rápidos</button>
              </nav>

              <section v-if="detailTab === 'distribution'" class="detail-panel">
                <h4>Distribución por plantel</h4>
                <div class="plantel-distribution-grid">
                  <button
                    v-for="item in selectedPlantelStates"
                    :key="`${selectedStockConcept.id}-${item.plantel}`"
                    type="button"
                    :class="['plantel-distribution-card', stockBadgeClass(item.stock), { selected: activeStockPlantel === item.plantel, empty: !item.stock.controlled }]"
                    @click="activeStockPlantel = item.plantel"
                  >
                    <span class="plantel-icon"><LucideBuilding2 :size="14" /></span>
                    <span class="plantel-code">{{ item.plantel }}</span>
                    <strong>{{ stockDisplayValue(item.stock) }}</strong>
                    <small>{{ item.stock.controlled ? 'Disponibles' : 'Agregar' }}</small>
                    <em>{{ plantelPercent(item.stock) }}%</em>
                    <span class="plantel-meter"><i :style="{ width: `${plantelPercent(item.stock)}%` }"></i></span>
                  </button>
                </div>
              </section>

              <section v-else-if="detailTab === 'movements'" class="detail-panel movements-panel">
                <h4>Movimientos</h4>
                <div v-if="!selectedStockMovements.length" class="empty-inline">—</div>
                <article v-for="movement in selectedStockMovements" :key="movement.id" class="movement-row">
                  <span>{{ formatMovementType(movement.movement_type) }} · {{ movement.plantel }}</span>
                  <strong>{{ signedQuantity(movement.quantity_delta) }}</strong>
                  <small>{{ movement.created_at || '—' }}</small>
                </article>
              </section>

              <section v-else class="detail-panel quick-panel">
                <h4>{{ activeStockPlantel || activePlantelStockItem?.plantel || 'Plantel' }}</h4>
                <div class="quick-stock-card">
                  <span>{{ activePlantelStockItem?.plantel }}</span>
                  <strong>{{ stockDisplayValue(activePlantelStockItem?.stock) }}</strong>
                  <small>Disponibles</small>
                </div>
                <div class="quick-actions">
                  <button type="button" class="btn btn-primary" :disabled="!activePlantelStockItem || savingStock" @click="openStockSheet('add', activePlantelStockItem)">
                    <LucidePlus :size="16" /> Agregar stock
                  </button>
                  <button type="button" class="btn btn-outline" :disabled="!activePlantelStockItem?.stock?.controlled || savingStock" @click="openStockSheet('adjust', activePlantelStockItem)">
                    Ajustar
                  </button>
                </div>
              </section>

              <footer class="detail-actions">
                <button type="button" class="action-soft primary" :disabled="!activePlantelStockItem || savingStock" @click="openStockSheet('add', activePlantelStockItem)">
                  <LucidePlus :size="17" />
                  Agregar stock
                </button>
                <button type="button" class="action-soft purple" :disabled="!activePlantelStockItem?.stock?.controlled || savingStock" @click="openStockSheet('adjust', activePlantelStockItem)">
                  Ajustar
                </button>
              </footer>
            </template>
            <div v-else class="empty-detail">
              <LucidePackage :size="38" />
              <strong>Selecciona un concepto</strong>
            </div>
          </aside>
        </section>
      </template>

      <template v-else>
        <section class="inventory-hero card categories-hero">
          <div class="inventory-title-block">
            <div class="inventory-title-line">
              <h2>Categorías</h2>
              <span class="live-chip"><i></i> {{ sourceLabel }}</span>
            </div>
          </div>
          <div class="hero-actions">
            <div class="conceptos-tabs" aria-label="Modo de conceptos">
              <button type="button" :class="{ active: viewMode === 'stock' }" @click="viewMode = 'stock'">
                <LucidePackage :size="16" />
                Inventario
              </button>
              <button type="button" :class="{ active: viewMode === 'mappings' }" @click="viewMode = 'mappings'">
                <LucideTag :size="16" />
                Categorías
              </button>
            </div>
          </div>
        </section>

        <section class="inventory-kpis category-kpis">
          <article v-for="kpi in categoryKpiCards" :key="kpi.key" class="inventory-kpi card" :class="kpi.tone">
            <div>
              <span>{{ kpi.label }}</span>
              <strong>{{ kpi.value }}</strong>
              <small>{{ kpi.caption }}</small>
            </div>
            <i class="kpi-icon" aria-hidden="true"><component :is="kpi.icon" :size="26" /></i>
          </article>
        </section>

        <section class="inventory-toolbar card categories-toolbar">
          <label class="toolbar-field compact">
            <span>Ciclo</span>
            <select v-model="selectedCiclo">
              <option v-for="cycle in cycleOptions" :key="cycle.value" :value="cycle.value">{{ cycle.label }}</option>
            </select>
          </label>
          <label class="toolbar-field compact">
            <span>Plantel</span>
            <select v-model="selectedPlantel">
              <option v-for="plantel in plantelOptions" :key="plantel" :value="plantel">{{ plantel }}</option>
            </select>
          </label>
          <div class="filter-chips category-chip-row" aria-label="Categorías">
            <button
              v-for="category in categories"
              :key="category.key"
              type="button"
              :class="{ active: selectedCategory === category.key }"
              @click="selectedCategory = category.key"
            >{{ category.label }}</button>
          </div>
          <div class="search-box inventory-search">
            <LucideSearch :size="18" />
            <input v-model="search" type="search" placeholder="Buscar concepto..." />
          </div>
          <button type="button" class="btn btn-outline inventory-refresh" :disabled="loading" @click="loadAdmin">
            <LucideRefreshCw :size="16" :class="{ 'animate-spin': loading }" />
            Actualizar
          </button>
        </section>

        <section class="categories-workspace">
          <div class="inventory-list-card card">
            <header class="panel-head">
              <h3>{{ activeCategoryLabel }} <span>({{ visibleMappings.length }})</span></h3>
            </header>

            <div v-if="loading" class="empty-panel">Cargando...</div>
            <div v-else-if="!visibleMappings.length" class="empty-panel">Sin conceptos asignados</div>
            <div v-else class="mapping-list redesigned">
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

          <aside class="category-editor card">
            <header class="panel-head compact">
              <h3>Asignar concepto</h3>
            </header>

            <div class="concept-search-select">
              <div class="search-box">
                <LucideSearch :size="15" />
                <input v-model="conceptSearch" type="search" placeholder="Buscar concepto" />
              </div>
              <div class="concept-options redesigned">
                <button
                  v-for="concept in conceptOptions"
                  :key="concept.id"
                  type="button"
                  :class="['concept-option', { selected: selectedConcept?.id === concept.id }]"
                  @click="selectedConcept = concept"
                >
                  <span class="concept-option-id">{{ concept.id }}</span>
                  <span class="concept-option-thumb" :class="{ empty: !conceptImageUrl(concept) }">
                    <img v-if="conceptImageUrl(concept)" :src="conceptImageUrl(concept)" alt="" loading="lazy" />
                    <LucidePackage v-else :size="17" />
                  </span>
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
      </template>
    </template>

    <Teleport to="body">
      <div v-if="stockSheet.open" class="stock-sheet-overlay" @click.self="closeStockSheet">
        <div class="stock-sheet" role="dialog" aria-modal="true">
          <header>
            <div>
              <span>{{ stockSheet.plantel }}</span>
              <strong>{{ stockSheet.mode === 'adjust' ? 'Ajustar stock' : 'Agregar stock' }}</strong>
            </div>
            <button type="button" class="stock-sheet-close" aria-label="Cerrar" @click="closeStockSheet"><LucideX :size="18" /></button>
          </header>
          <p>{{ selectedStockConcept?.concepto }}</p>
          <label class="stock-sheet-label">Cantidad</label>
          <div class="stock-sheet-qty">
            <button type="button" @click="nudgeStockQuantity(-1)">−</button>
            <input v-model.number="stockSheet.quantity" type="number" min="0" step="1" inputmode="numeric" />
            <button type="button" @click="nudgeStockQuantity(1)">+</button>
          </div>
          <textarea v-model="stockSheet.note" placeholder="Nota opcional"></textarea>
          <footer>
            <button type="button" class="btn btn-outline" @click="closeStockSheet">Cancelar</button>
            <button type="button" class="btn btn-primary" :disabled="savingStock" @click="submitStockSheet">
              <LucideCheck :size="16" /> Guardar
            </button>
          </footer>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="conceptModal.open" class="stock-sheet-overlay" @click.self="closeConceptModal">
        <div class="concept-modal" role="dialog" aria-modal="true">
          <header>
            <div>
              <span>{{ conceptModal.mode === 'image' ? 'Imagen' : 'Catálogo' }}</span>
              <strong>{{ conceptModal.mode === 'image' ? 'Imagen del concepto' : 'Nuevo concepto' }}</strong>
            </div>
            <button type="button" class="stock-sheet-close" aria-label="Cerrar" @click="closeConceptModal"><LucideX :size="18" /></button>
          </header>

          <div class="concept-image-preview" :class="{ empty: !conceptModal.image_url }">
            <img v-if="conceptModal.image_url" :src="conceptModal.image_url" alt="" loading="lazy" />
            <LucideImage v-else :size="34" />
          </div>

          <div v-if="conceptModal.mode === 'create'" class="concept-modal-grid">
            <label class="modal-field span-2">
              <span>Nombre</span>
              <input v-model="conceptModal.concepto" type="text" autocomplete="off" />
            </label>
            <label class="modal-field">
              <span>Costo</span>
              <input v-model.number="conceptModal.costo" type="number" min="0" step="1" inputmode="decimal" />
            </label>
            <label class="modal-field">
              <span>Ciclo</span>
              <select v-model="conceptModal.ciclo">
                <option v-for="cycle in cycleOptions" :key="cycle.value" :value="cycle.value">{{ cycle.label }}</option>
              </select>
            </label>
            <label class="modal-field span-2">
              <span>Imagen URL</span>
              <input v-model="conceptModal.image_url" type="url" autocomplete="off" />
            </label>
            <label class="modal-field span-2">
              <span>Descripción</span>
              <textarea v-model="conceptModal.description"></textarea>
            </label>
          </div>

          <div v-else class="concept-modal-grid">
            <label class="modal-field span-2">
              <span>Imagen URL</span>
              <input v-model="conceptModal.image_url" type="url" autocomplete="off" />
            </label>
          </div>

          <footer>
            <button type="button" class="btn btn-outline" @click="closeConceptModal">Cancelar</button>
            <button type="button" class="btn btn-primary" :disabled="savingConcept" @click="submitConceptModal">
              <LucideCheck :size="16" /> Guardar
            </button>
          </footer>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useCookie, useState } from '#app'
import {
  LucideAlertTriangle,
  LucideBox,
  LucideBuilding2,
  LucideCheck,
  LucideCircleMinus,
  LucideDollarSign,
  LucideGrid3X3,
  LucideImage,
  LucideLock,
  LucideMoreVertical,
  LucidePackage,
  LucidePieChart,
  LucidePlus,
  LucideRefreshCw,
  LucideSearch,
  LucideTag,
  LucideTrash2,
  LucideX
} from 'lucide-vue-next'
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
const viewMode = ref('stock')
const stockFilter = ref('all')
const selectedStockConcept = ref(null)
const detailTab = ref('distribution')
const activeStockPlantel = ref('')
const stockSheet = ref({ open: false, mode: 'add', plantel: '', quantity: 1, note: '' })
const savingStock = ref(false)
const syncingStock = ref(false)
const savingConcept = ref(false)
const conceptModal = ref({ open: false, mode: 'create', concepto_id: null, concepto: '', costo: 0, ciclo: '', description: '', image_url: '' })

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
const stockFilterOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'controlled', label: 'Activos' },
  { value: 'low', label: 'Stock bajo' },
  { value: 'out', label: 'Agotados' }
]

const canManage = computed(() => Boolean(adminPayload.value?.canManage))
const sourceLabel = computed(() => adminPayload.value?.source === 'central' ? 'Base externa' : 'Respaldo local')
const categories = computed(() => adminPayload.value?.categorias?.length ? adminPayload.value.categorias.map((item) => ({ key: item.key, label: item.label })) : fallbackCategories)
const mappings = computed(() => Array.isArray(adminPayload.value?.mappings) ? adminPayload.value.mappings : [])
const conceptos = computed(() => Array.isArray(adminPayload.value?.conceptos) ? adminPayload.value.conceptos : [])
const serviciosCatalogo = computed(() => Array.isArray(adminPayload.value?.serviciosCatalogo) ? adminPayload.value.serviciosCatalogo : [])
const stockPayload = computed(() => adminPayload.value?.stock || { source: 'bridge', snapshots: [], movements: [] })
const stockSourceLabel = computed(() => stockPayload.value?.source === 'central' ? 'Base externa' : 'Respaldo local')
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
const stockRowIds = computed(() => new Set(stockRows.value.map((concept) => Number(concept.id || 0)).filter(Boolean)))
const conceptoById = computed(() => {
  const map = new Map()
  conceptos.value.forEach((concept) => map.set(Number(concept.id || 0), concept))
  return map
})

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

const controlledSnapshotsInScope = computed(() => {
  if (selectedStockConcept.value) return selectedPlantelStates.value.map((item) => item.stock).filter((stock) => stock?.controlled)
  return allStockSnapshots.value.filter((stock) => stock?.controlled && stockRowIds.value.has(Number(stock.concepto_id || 0)))
})

const stockKpis = computed(() => {
  const controlledSnapshots = controlledSnapshotsInScope.value
  const available = controlledSnapshots.reduce((sum, stock) => sum + Math.max(0, Number(stock.available ?? stock.on_hand ?? 0)), 0)
  const value = controlledSnapshots.reduce((sum, stock) => {
    const concept = conceptoById.value.get(Number(stock.concepto_id || 0))
    return sum + Math.max(0, Number(stock.available ?? stock.on_hand ?? 0)) * Number(concept?.costo || 0)
  }, 0)
  return {
    totalConcepts: selectedStockConcept.value ? 1 : stockRows.value.length,
    controlled: new Set(controlledSnapshots.map((stock) => Number(stock.concepto_id || 0))).size,
    available,
    value,
    low: controlledSnapshots.filter((stock) => stock.status === 'low').length,
    out: controlledSnapshots.filter((stock) => stock.status === 'out').length,
  }
})

const inventoryKpiCards = computed(() => [
  { key: 'concepts', label: 'Total conceptos', value: formatInteger(stockKpis.value.totalConcepts), caption: selectedStockConcept.value ? 'Concepto seleccionado' : 'En el ciclo', tone: 'green', icon: LucideBox },
  { key: 'value', label: 'Valor total', value: formatCurrency(stockKpis.value.value), caption: 'Valor de inventario', tone: 'blue', icon: LucideDollarSign },
  { key: 'units', label: 'Unidades totales', value: formatInteger(stockKpis.value.available), caption: 'Unidades disponibles', tone: 'purple', icon: LucidePackage },
  { key: 'low', label: 'Stock bajo', value: formatInteger(stockKpis.value.low), caption: 'Requieren atención', tone: 'amber', icon: LucideAlertTriangle },
  { key: 'out', label: 'Agotados', value: formatInteger(stockKpis.value.out), caption: 'Sin existencias', tone: 'red', icon: LucideCircleMinus }
])

const categoryKpiCards = computed(() => [
  { key: 'assigned', label: 'Asignados', value: formatInteger(visibleMappings.value.length), caption: activeCategoryLabel.value, tone: 'green', icon: LucideTag },
  { key: 'concepts', label: 'Conceptos', value: formatInteger(stockRows.value.length), caption: 'En el ciclo', tone: 'blue', icon: LucideBox },
  { key: 'uncat', label: 'Sin categoría', value: formatInteger(uncategorizedConcepts.value.length), caption: 'Pendientes', tone: 'amber', icon: LucideAlertTriangle },
  { key: 'services', label: 'Talleres', value: formatInteger(serviciosCatalogo.value.length), caption: 'Catálogo activo', tone: 'purple', icon: LucideGrid3X3 }
])

const selectedPlantelStates = computed(() => selectedStockConcept.value ? plantelStatesForConcept(selectedStockConcept.value) : [])
const selectedControlledStates = computed(() => selectedPlantelStates.value.filter((item) => item.stock?.controlled))
const selectedConceptAvailable = computed(() => selectedControlledStates.value.reduce((sum, item) => sum + Math.max(0, Number(item.stock.available ?? item.stock.on_hand ?? 0)), 0))
const selectedConceptOnHand = computed(() => selectedControlledStates.value.reduce((sum, item) => sum + Math.max(0, Number(item.stock.on_hand ?? item.stock.available ?? 0)), 0))
const selectedLowCount = computed(() => selectedControlledStates.value.filter((item) => item.stock.status === 'low').length)
const selectedOutCount = computed(() => selectedControlledStates.value.filter((item) => item.stock.status === 'out').length)
const selectedConceptPercent = computed(() => selectedConceptOnHand.value > 0 ? Math.round((selectedConceptAvailable.value / selectedConceptOnHand.value) * 100) : 0)
const activePlantelStockItem = computed(() => {
  if (!selectedPlantelStates.value.length) return null
  const target = activeStockPlantel.value || selectedPlantel.value || selectedPlantelStates.value[0]?.plantel
  return selectedPlantelStates.value.find((item) => item.plantel === target) || selectedPlantelStates.value[0]
})

const selectedStockMovements = computed(() => {
  const conceptId = Number(selectedStockConcept.value?.id || 0)
  const movements = Array.isArray(stockPayload.value?.movements) ? stockPayload.value.movements : []
  return movements.filter((movement) => Number(movement.concepto_id || 0) === conceptId).slice(0, 16)
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
const formatInteger = (value) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(Number(value || 0))
const formatCurrency = (value) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(Number(value || 0))
const conceptImageUrl = (concept) => String(concept?.image_url || concept?.imagen_url || concept?.imagen || '').trim()
const conceptTotalAvailable = (concept) => conceptControlledPlantels(concept).reduce((sum, item) => sum + Math.max(0, Number(item.stock.available ?? item.stock.on_hand ?? 0)), 0)
const conceptTotalOnHand = (concept) => conceptControlledPlantels(concept).reduce((sum, item) => sum + Math.max(0, Number(item.stock.on_hand ?? item.stock.available ?? 0)), 0)
const conceptStockPercent = (concept) => {
  const total = conceptTotalOnHand(concept)
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((conceptTotalAvailable(concept) / total) * 100)))
}
const conceptStockLabel = (concept) => conceptControlledPlantels(concept).length ? 'Disponibles' : 'Stock'
const plantelPercent = (stock) => {
  if (!stock?.controlled) return 0
  const onHand = Math.max(0, Number(stock.on_hand ?? stock.available ?? 0))
  if (onHand <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((Math.max(0, Number(stock.available ?? stock.on_hand ?? 0)) / onHand) * 100)))
}

const selectStockConcept = (concept) => {
  selectedStockConcept.value = concept
  detailTab.value = 'distribution'
  const firstControlled = conceptControlledPlantels(concept)[0]?.plantel
  activeStockPlantel.value = firstControlled || selectedPlantel.value || plantelOptions.value[0]
  stockSheet.value = { open: false, mode: 'add', plantel: '', quantity: 1, note: '' }
}

const refreshSelectedStockConcept = () => {
  if (!selectedStockConcept.value?.id) return
  const updated = stockRows.value.find((concept) => String(concept.id) === String(selectedStockConcept.value.id))
  if (updated) selectedStockConcept.value = updated
}

const openStockSheet = (mode, item) => {
  if (!item) return
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

const openConceptCreateModal = () => {
  conceptModal.value = { open: true, mode: 'create', concepto_id: null, concepto: '', costo: 0, ciclo: selectedCiclo.value || cycleOptions.value[0]?.value || '', description: '', image_url: '' }
}
const openConceptImageModal = (concept) => {
  conceptModal.value = { open: true, mode: 'image', concepto_id: concept?.id || null, concepto: concept?.concepto || '', costo: Number(concept?.costo || 0), ciclo: concept?.ciclo_escolar || selectedCiclo.value, description: concept?.description || '', image_url: conceptImageUrl(concept) }
}
const closeConceptModal = () => {
  conceptModal.value.open = false
}
const submitConceptModal = async () => {
  savingConcept.value = true
  try {
    if (conceptModal.value.mode === 'image') {
      await $fetch(`/api/conceptos/${conceptModal.value.concepto_id}`, {
        method: 'PUT',
        body: { image_url: conceptModal.value.image_url }
      })
      show('Imagen actualizada', 'success')
    } else {
      const result = await $fetch('/api/conceptos', {
        method: 'POST',
        body: {
          concepto: conceptModal.value.concepto,
          costo: conceptModal.value.costo,
          ciclo: conceptModal.value.ciclo,
          description: conceptModal.value.description,
          image_url: conceptModal.value.image_url
        }
      })
      show('Concepto creado', 'success')
      if (result?.concepto) selectedStockConcept.value = result.concepto
    }
    closeConceptModal()
    await loadAdmin()
    refreshSelectedStockConcept()
  } catch (error) {
    show(error?.data?.message || 'No se pudo guardar', 'danger')
  } finally {
    savingConcept.value = false
  }
}

const canSaveMapping = computed(() => Boolean(selectedConcept.value?.id && selectedCiclo.value && selectedPlantel.value && selectedCategory.value && (selectedCategory.value !== 'talleres_servicios' || selectedService.value?.clave)))

const loadAdmin = async () => {
  loading.value = true
  try {
    const result = await $fetch('/api/conceptos-config/admin', { params: { plantel: selectedPlantel.value } })
    adminPayload.value = result
    if (!selectedCiclo.value) selectedCiclo.value = result?.cicloActual || cycleOptions.value[0]?.value || normalizeCicloKey(state.value?.ciclo)
    if (!selectedStockConcept.value && stockRows.value.length) selectStockConcept(stockRows.value[0])
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
  if (viewMode.value === 'mappings') loadAdmin()
})

watch(selectedCiclo, () => {
  const exists = selectedStockConcept.value && stockRows.value.some((concept) => String(concept.id) === String(selectedStockConcept.value.id))
  if (!exists && stockRows.value.length) selectStockConcept(stockRows.value[0])
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
.conceptos-page {
  --ink: #162641;
  --muted: #67758d;
  --line: #dfe6ef;
  --soft: #f6f9fb;
  --green: #3f8c3c;
  --green-soft: #eff9ed;
  --orange: #ec8c16;
  --red: #df2d2d;
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
  color: var(--ink);
}
.card {
  border: 1px solid rgba(220, 228, 238, .92);
  border-radius: 21px;
  background: rgba(255, 255, 255, .96);
  box-shadow: 0 15px 38px rgba(22, 38, 65, .055);
}
.blocked-card { display: flex; align-items: center; gap: 10px; padding: 18px; color: #53647a; font-weight: 800; }
.conceptos-tabs { display: inline-flex; gap: 7px; border: 1px solid rgba(220, 228, 238, .92); border-radius: 16px; background: rgba(255,255,255,.88); padding: 7px; box-shadow: 0 12px 28px rgba(22,38,65,.045); }
.conceptos-tabs button { display: inline-flex; align-items: center; gap: 7px; min-height: 34px; border: 1px solid transparent; border-radius: 11px; background: transparent; color: #66758a; padding: 0 13px; font-size: .78rem; font-weight: 850; }
.conceptos-tabs button.active { border-color: #cfe7c7; background: #f1faee; color: #2f7f34; }
.conceptos-source-pill { display: inline-flex; align-items: center; gap: 7px; min-height: 34px; border: 1px solid #dfe7f0; border-radius: 14px; background: #fff; color: #51627b; padding: 0 12px; font-size: .76rem; font-weight: 850; box-shadow: 0 10px 24px rgba(22,38,65,.045); }
.conceptos-source-pill span { width: 8px; height: 8px; border-radius: 999px; background: #8abb6d; box-shadow: 0 0 0 4px rgba(138,187,109,.16); }
.conceptos-source-pill.backup span { background: #ec8c16; box-shadow: 0 0 0 4px rgba(236,140,22,.14); }
.inventory-hero { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-shrink: 0; padding: 18px 21px; }
.inventory-title-line { display: flex; align-items: center; gap: 14px; }
.inventory-title-line h2 { margin: 0; color: var(--ink); font-family: var(--font-display, Fredoka, Montserrat, sans-serif); font-size: clamp(1.55rem, 1.25rem + .72vw, 2rem); font-weight: 700; letter-spacing: -.025em; }
.live-chip { display: inline-flex; align-items: center; gap: 8px; color: #65758c; font-size: .78rem; font-weight: 750; }
.live-chip i { width: 9px; height: 9px; border-radius: 999px; background: #72bf55; box-shadow: 0 0 0 5px rgba(114,191,85,.12); }
.hero-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.inventory-view-actions { display: flex; gap: 8px; }
.square-action { display: grid; width: 40px; height: 40px; place-items: center; border: 1px solid #dfe7ef; border-radius: 13px; background: #fff; color: #5f6f86; box-shadow: 0 8px 18px rgba(22,38,65,.04); }
.square-action.active { background: #f4faf1; color: #3f7e36; border-color: #d5e8cf; }
.inventory-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; flex-shrink: 0; }
.inventory-kpi { min-height: 104px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 17px 18px; overflow: hidden; }
.inventory-kpi span { display: block; color: #64738a; font-size: .76rem; font-weight: 850; }
.inventory-kpi strong { display: block; margin-top: 4px; color: var(--ink); font-size: clamp(1.25rem, 1rem + .45vw, 1.55rem); font-weight: 900; letter-spacing: -.018em; }
.inventory-kpi small { display: block; margin-top: 2px; color: #6c7b91; font-size: .72rem; font-weight: 750; }
.kpi-icon { display: grid; width: 54px; height: 54px; flex: 0 0 auto; place-items: center; border-radius: 22px; }
.inventory-kpi.green strong { color: #187333; } .inventory-kpi.green .kpi-icon { background: #eaf8e7; color: #3f8c3c; }
.inventory-kpi.blue .kpi-icon { background: #eef3ff; color: #3f70e8; }
.inventory-kpi.purple .kpi-icon { background: #f1eaff; color: #7d46e8; }
.inventory-kpi.amber strong { color: #d37508; } .inventory-kpi.amber .kpi-icon { background: #fff4dd; color: #ec8c16; }
.inventory-kpi.red strong { color: #d71920; } .inventory-kpi.red .kpi-icon { background: #ffe9e9; color: #de3232; }
.inventory-toolbar { display: grid; grid-template-columns: 190px 160px auto minmax(260px, 1fr) auto auto; gap: 12px; align-items: end; flex-shrink: 0; padding: 13px 14px; }
.toolbar-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.toolbar-field span, .modal-field span, .stock-sheet-label, .service-editor label span { color: #66758a; font-size: .64rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
.toolbar-field select, .modal-field input, .modal-field select, .service-editor input { width: 100%; height: 39px; border: 1px solid #d8e1ec; border-radius: 13px; background: #fff; color: var(--ink); padding: 0 12px; font-size: .85rem; font-weight: 800; outline: none; }
.filter-chips { display: flex; min-width: 0; flex-wrap: wrap; gap: 8px; align-items: center; padding-bottom: 1px; }
.filter-chips button { min-height: 32px; border: 1px solid #dfe6ef; border-radius: 999px; background: #fff; color: #64738a; padding: 0 13px; font-size: .76rem; font-weight: 850; box-shadow: 0 7px 15px rgba(22,38,65,.035); }
.filter-chips button.active { border-color: #9bc889; background: #f3faef; color: #31742f; }
.search-box { display: flex; align-items: center; gap: 9px; height: 39px; min-width: 0; border: 1px solid #d8e1ec; border-radius: 13px; background: #fff; padding: 0 12px; color: #8794a8; }
.search-box input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font-size: .85rem; font-weight: 750; }
.inventory-refresh, .inventory-new { height: 39px; padding-inline: 16px; border-radius: 13px; font-weight: 850; }
.inventory-workspace { display: grid; grid-template-columns: minmax(520px, .92fr) minmax(560px, 1fr); gap: 16px; min-height: 0; flex: 1; }
.inventory-list-card, .inventory-detail, .category-editor { display: flex; min-height: 0; flex-direction: column; padding: 16px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-shrink: 0; }
.panel-head h3 { margin: 0; color: var(--ink); font-size: 1.08rem; font-weight: 850; }
.panel-head h3 span { color: #65758c; }
.inventory-list { display: flex; min-height: 0; flex: 1; flex-direction: column; gap: 8px; overflow: auto; padding-right: 4px; }
.inventory-row { display: grid; grid-template-columns: 42px 58px minmax(0, 1fr) 150px 30px; align-items: center; gap: 12px; width: 100%; min-height: 78px; border: 1px solid transparent; border-bottom-color: #e8eef4; border-radius: 15px; background: #fff; padding: 8px 10px; text-align: left; transition: transform 140ms ease, border-color 140ms ease, background 140ms ease, box-shadow 140ms ease; }
.inventory-row:hover, .inventory-row.selected { transform: translateY(-1px); border-color: rgba(68, 151, 65, .46); background: linear-gradient(135deg, #fbfff9, #fff); box-shadow: 0 12px 26px rgba(22,38,65,.055); }
.inventory-row.warning { border-left: 3px solid #f2a22d; } .inventory-row.danger { border-left: 3px solid #ea4a4a; }
.concept-id-badge { display: grid; place-items: center; color: #7e8ba0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .67rem; font-weight: 900; }
.concept-thumb, .detail-image, .concept-option-thumb { display: grid; place-items: center; overflow: hidden; background: #eef4f8; color: #739075; }
.concept-thumb { width: 58px; height: 58px; border-radius: 14px; }
.concept-thumb img, .detail-image img, .concept-option-thumb img, .concept-image-preview img { width: 100%; height: 100%; object-fit: cover; }
.inventory-row-main { display: grid; min-width: 0; gap: 4px; }
.inventory-row-main strong { overflow: hidden; color: var(--ink); font-size: .84rem; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }
.inventory-row-main small { color: #718096; font-size: .73rem; font-weight: 800; }
.inventory-row-stock { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: center; }
.inventory-row-stock small { color: #7d8899; font-size: .65rem; font-weight: 850; }
.inventory-row-stock strong { color: #1d7d32; font-size: .92rem; font-weight: 950; }
.inventory-row-stock em { color: #617087; font-size: .68rem; font-style: normal; font-weight: 850; text-align: right; }
.stock-meter, .plantel-meter { height: 6px; border-radius: 999px; background: #edf1f4; overflow: hidden; }
.stock-meter { grid-column: 1; } .stock-meter i, .plantel-meter i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #248536, #78b85e); }
.inventory-row.warning .stock-meter i, .plantel-distribution-card.warning .plantel-meter i { background: linear-gradient(90deg, #ef9219, #ffbb45); }
.inventory-row.danger .stock-meter i, .plantel-distribution-card.danger .plantel-meter i { background: linear-gradient(90deg, #e55442, #ff8a72); }
.row-menu { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 999px; color: #49617b; background: #fff; }
.detail-head { display: grid; grid-template-columns: 58px minmax(0,1fr) auto; align-items: start; gap: 14px; flex-shrink: 0; padding-bottom: 16px; border-bottom: 1px solid #e8eef4; }
.detail-image { width: 58px; height: 58px; border-radius: 15px; }
.concept-id-pill { display: inline-flex; min-height: 24px; align-items: center; border-radius: 9px; background: #eaf8e7; color: #3f8c3c; padding: 0 10px; font-size: .7rem; font-weight: 950; }
.detail-head h3 { margin: 5px 0 2px; color: var(--ink); font-size: .96rem; line-height: 1.22; font-weight: 950; }
.detail-head small { color: #718096; font-size: .78rem; font-weight: 850; }
.status-pill { display: inline-flex; align-items: center; gap: 6px; min-height: 31px; border: 1px solid #cce6c4; border-radius: 999px; background: #f2faef; color: #31742f; padding: 0 11px; font-size: .76rem; font-weight: 900; }
.detail-stat-row { display: grid; grid-template-columns: repeat(4, 1fr); flex-shrink: 0; border-bottom: 1px solid #e8eef4; padding: 15px 0; }
.detail-stat-row article { display: grid; gap: 3px; min-height: 48px; padding: 0 12px; border-right: 1px solid #e4ebf2; }
.detail-stat-row article:last-child { border-right: 0; }
.detail-stat-row span { color: #63738b; font-size: .71rem; font-weight: 850; }
.detail-stat-row strong { color: #1d7d32; font-size: 1.03rem; font-weight: 950; }
.detail-stat-row strong.warning { color: #d87911; } .detail-stat-row strong.danger { color: #d71920; }
.detail-stat-row small { color: #8d98aa; font-size: .69rem; font-weight: 850; }
.detail-tabs { display: flex; gap: 8px; padding: 12px 0 10px; flex-shrink: 0; }
.detail-tabs button { min-height: 31px; border: 1px solid transparent; border-radius: 999px; background: #f4f7fa; color: #66758a; padding: 0 13px; font-size: .75rem; font-weight: 900; }
.detail-tabs button.active { border-color: #9bc889; background: #f3faef; color: #31742f; }
.detail-panel { display: flex; min-height: 0; flex: 1; flex-direction: column; }
.detail-panel h4 { margin: 0 0 12px; color: #54647a; font-size: .82rem; font-weight: 850; }
.plantel-distribution-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; overflow: auto; padding: 2px; }
.plantel-distribution-card { position: relative; display: grid; min-height: 98px; grid-template-columns: auto 1fr auto; gap: 3px 8px; align-items: start; border: 1px solid #e2e9f1; border-radius: 16px; background: #fff; padding: 12px; text-align: left; box-shadow: 0 8px 18px rgba(22,38,65,.035); }
.plantel-distribution-card.selected { border-color: #8cc276; box-shadow: 0 12px 24px rgba(63,126,54,.11); }
.plantel-icon { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 10px; background: #eef8ec; color: #3f8c3c; }
.plantel-code { align-self: center; color: #53657b; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .76rem; font-weight: 950; }
.plantel-distribution-card strong { grid-column: 2; color: var(--ink); font-size: 1.05rem; font-weight: 950; }
.plantel-distribution-card small { grid-column: 2; color: #768397; font-size: .67rem; font-weight: 820; }
.plantel-distribution-card em { grid-column: 3; grid-row: 3; align-self: end; color: #5c6a80; font-style: normal; font-size: .7rem; font-weight: 850; }
.plantel-meter { grid-column: 1 / -1; align-self: end; }
.plantel-distribution-card.neutral { background: #fbfcfe; } .plantel-distribution-card.empty strong { color: #9ca9b9; }
.movements-panel { gap: 8px; overflow: auto; }
.movement-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 5px 10px; border: 1px solid #e6edf4; border-radius: 13px; background: #fbfcfe; padding: 9px 11px; }
.movement-row span { color: #314158; font-size: .76rem; font-weight: 850; }
.movement-row strong { color: #162641; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.movement-row small { grid-column: 1 / -1; color: #8290a3; font-size: .68rem; font-weight: 700; }
.empty-inline { color: #8a98aa; font-size: .8rem; font-weight: 800; }
.quick-panel { gap: 12px; }
.quick-stock-card { display: grid; place-items: center; min-height: 155px; border: 1px solid #e4ebf2; border-radius: 18px; background: linear-gradient(135deg, #fbfff9, #fff); }
.quick-stock-card span { color: #52647a; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 900; }
.quick-stock-card strong { color: var(--ink); font-size: 3.2rem; font-weight: 950; line-height: 1; }
.quick-stock-card small { color: #758397; font-weight: 850; }
.quick-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.detail-actions { display: flex; gap: 12px; flex-shrink: 0; padding-top: 14px; border-top: 1px solid #e8eef4; }
.action-soft { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 42px; border: 1px solid #dfe7ef; border-radius: 14px; background: #fff; color: #4f6179; padding: 0 17px; font-size: .83rem; font-weight: 900; }
.action-soft.primary { border-color: #d5ead0; background: #f4fbf1; color: #2f7f34; }
.action-soft.purple { border-color: #e0d7fa; background: #f7f2ff; color: #6e45cc; }
.empty-detail, .empty-panel { display: grid; min-height: 220px; place-items: center; color: #7d899a; font-weight: 850; text-align: center; }
.empty-detail { gap: 10px; align-content: center; height: 100%; }
.categories-workspace { display: grid; grid-template-columns: minmax(620px, 1fr) minmax(390px, .42fr); gap: 16px; min-height: 0; flex: 1; }
.category-chip-row { overflow: auto; flex-wrap: nowrap; padding-bottom: 2px; }
.mapping-list, .concept-options { display: flex; min-height: 0; flex: 1; flex-direction: column; gap: 8px; overflow: auto; padding-right: 4px; }
.mapping-row { display: grid; grid-template-columns: 54px minmax(0,1fr) auto; gap: 11px; align-items: center; border: 1px solid #e4eaf1; border-radius: 15px; background: #fff; padding: 10px 11px; }
.mapping-id { display: grid; height: 40px; place-items: center; border-radius: 12px; background: #eff4f8; color: #5c6d82; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .72rem; font-weight: 900; }
.mapping-body { display: grid; min-width: 0; gap: 3px; }
.mapping-body strong { overflow: hidden; color: var(--ink); font-size: .86rem; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }
.mapping-body span { color: #718096; font-size: .73rem; font-weight: 750; }
.tiny-chip-row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 3px; }
.tiny-chip { border: 1px solid #d8e6d2; background: #f5faf2; color: #407337; border-radius: 999px; padding: 2px 6px; font-size: .65rem; font-weight: 850; }
.service-link { display: inline-flex; align-items: center; gap: 6px; color: #274560; font-size: .75rem; font-weight: 850; }
.service-link img { width: 21px; height: 21px; border-radius: 8px; object-fit: cover; }
.icon-action { display: grid; width: 34px; height: 34px; place-items: center; border: 1px solid #d8e2eb; border-radius: 12px; background: #fff; color: #56677e; }
.icon-action.danger:hover { color: #c24141; border-color: #f0caca; background: #fff7f7; }
.concept-search-select { display: flex; min-height: 0; flex: 1; flex-direction: column; gap: 10px; }
.concept-option { display: grid; grid-template-columns: 42px 42px minmax(0,1fr) auto; gap: 8px; align-items: center; min-height: 58px; border: 1px solid #e3eaf1; border-radius: 14px; background: #fff; padding: 8px; text-align: left; }
.concept-option.selected { border-color: #90c37a; background: #f5fbf2; }
.concept-option-id { color: #708096; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 900; font-size: .68rem; }
.concept-option-thumb { width: 42px; height: 42px; border-radius: 12px; }
.concept-option strong { overflow: hidden; color: var(--ink); font-size: .76rem; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }
.concept-option small { color: #8a98aa; font-size: .66rem; font-weight: 800; }
.service-editor { display: grid; gap: 10px; margin-top: 12px; flex-shrink: 0; }
.service-editor label { display: grid; gap: 5px; }
.service-catalog-options { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 7px; max-height: 230px; overflow: auto; }
.service-catalog-option { display: flex; align-items: center; gap: 8px; min-width: 0; border: 1px solid #dde7ef; border-radius: 13px; background: #fff; color: #314158; padding: 7px; text-align: left; }
.service-catalog-option.selected { border-color: rgba(79,139,71,.34); background: #f7fbf5; color: #3f7c38; }
.service-catalog-option img { width: 32px; height: 32px; border-radius: 12px; object-fit: cover; }
.service-catalog-option span { overflow: hidden; font-size: .72rem; font-weight: 850; text-overflow: ellipsis; white-space: nowrap; }
.months-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 12px; flex-shrink: 0; }
.months-grid button { border: 1px solid #dfe6ef; border-radius: 10px; background: #fff; color: #65758c; padding: 7px 0; font-size: .72rem; font-weight: 800; }
.months-grid button.selected { border-color: #7fb069; background: #f4faef; color: #3f7e36; }
.btn.full { width: 100%; justify-content: center; margin-top: 12px; flex-shrink: 0; }
.stock-sheet-overlay { position: fixed; inset: 0; z-index: 80; display: grid; place-items: end center; background: rgba(9,20,36,.42); padding: 18px; }
.stock-sheet, .concept-modal { width: min(460px, 100%); border: 1px solid rgba(255,255,255,.5); border-radius: 24px; background: #fff; box-shadow: 0 24px 68px rgba(7,18,34,.22); padding: 16px; }
.concept-modal { width: min(560px, 100%); }
.stock-sheet header, .stock-sheet footer, .concept-modal header, .concept-modal footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.stock-sheet header span, .concept-modal header span { display: block; color: #3d7f36; font-size: .72rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
.stock-sheet header strong, .concept-modal header strong { color: var(--ink); font-size: 1.15rem; font-weight: 950; }
.stock-sheet-close { display: grid; width: 38px; height: 38px; place-items: center; border: 1px solid #dfe6ef; border-radius: 13px; background: #fff; color: #52647a; }
.stock-sheet p { margin: 10px 0 14px; color: #65758c; font-size: .9rem; font-weight: 800; }
.stock-sheet-qty { display: grid; grid-template-columns: 58px minmax(0,1fr) 58px; gap: 10px; align-items: center; }
.stock-sheet-qty button { height: 58px; border: 1px solid #d8e2eb; border-radius: 18px; background: #f8fafc; color: var(--ink); font-size: 2rem; font-weight: 850; }
.stock-sheet-qty input { height: 66px; width: 100%; border: 1px solid #d8e2eb; border-radius: 18px; color: var(--ink); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 2rem; font-weight: 950; text-align: center; outline: none; }
.stock-sheet textarea, .modal-field textarea { width: 100%; min-height: 74px; border: 1px solid #d8e2eb; border-radius: 16px; color: var(--ink); padding: 12px; font-size: .9rem; font-weight: 700; outline: none; resize: vertical; }
.stock-sheet textarea { margin: 12px 0; }
.stock-sheet footer .btn, .concept-modal footer .btn { min-height: 44px; flex: 1; justify-content: center; }
.concept-image-preview { display: grid; width: 96px; height: 96px; place-items: center; overflow: hidden; border: 1px solid #dfe7ef; border-radius: 22px; background: #f3f7fa; color: #90a0b4; margin: 14px auto; }
.concept-modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.modal-field { display: grid; gap: 6px; }
.modal-field.span-2 { grid-column: 1 / -1; }
@media (max-width: 1440px) {
  .inventory-kpis { grid-template-columns: repeat(5, minmax(150px, 1fr)); overflow-x: auto; padding-bottom: 2px; }
  .inventory-kpi { min-width: 190px; }
  .inventory-workspace { grid-template-columns: minmax(470px, .9fr) minmax(500px, 1fr); }
  .inventory-toolbar { grid-template-columns: 170px 150px auto minmax(220px, 1fr) auto auto; }
}
@media (max-width: 1180px) {
  .inventory-toolbar { grid-template-columns: 1fr 1fr; }
  .filter-chips, .inventory-search { grid-column: 1 / -1; }
  .inventory-workspace, .categories-workspace { grid-template-columns: 1fr; }
  .inventory-detail { min-height: 620px; }
}
@media (max-width: 760px) {
  .conceptos-page { gap: 10px; overflow: auto; }
  .hero-actions { width: 100%; justify-content: stretch; }
  .conceptos-tabs { width: 100%; }
  .conceptos-tabs button { flex: 1; justify-content: center; }
  .inventory-hero { align-items: flex-start; flex-direction: column; padding: 15px; }
  .inventory-title-line { align-items: flex-start; flex-direction: column; gap: 6px; }
  .inventory-view-actions { width: 100%; justify-content: flex-end; }
  .inventory-kpis { display: grid; grid-template-columns: 1fr 1fr; overflow: visible; }
  .inventory-kpi { min-width: 0; min-height: 96px; padding: 14px; }
  .inventory-kpi:nth-child(2) { grid-column: 1 / -1; }
  .inventory-toolbar { grid-template-columns: 1fr; }
  .filter-chips { overflow-x: auto; flex-wrap: nowrap; }
  .inventory-refresh, .inventory-new { width: 100%; justify-content: center; }
  .inventory-list-card, .inventory-detail, .category-editor { padding: 12px; }
  .inventory-row { grid-template-columns: 36px 48px minmax(0,1fr) 28px; min-height: 78px; }
  .inventory-row-stock { grid-column: 2 / -1; grid-template-columns: auto 1fr auto; width: 100%; }
  .inventory-row-stock small { display: none; }
  .stock-meter { grid-column: 2; align-self: center; }
  .concept-thumb { width: 48px; height: 48px; }
  .detail-head { grid-template-columns: 52px minmax(0,1fr); }
  .status-pill { grid-column: 1 / -1; justify-content: center; width: 100%; }
  .detail-stat-row { grid-template-columns: 1fr 1fr; gap: 0; }
  .detail-stat-row article { border-right: 0; border-bottom: 1px solid #e8eef4; padding: 10px; }
  .plantel-distribution-grid { grid-template-columns: 1fr 1fr; }
  .detail-actions, .quick-actions { grid-template-columns: 1fr; flex-direction: column; }
  .stock-sheet-overlay { padding: 10px; }
  .stock-sheet, .concept-modal { border-radius: 22px 22px 16px 16px; }
  .concept-modal-grid { grid-template-columns: 1fr; }
}
</style>
