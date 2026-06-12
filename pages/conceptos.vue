<template>
  <div class="concept-governance-page">
    <section class="governance-hero">
      <div>
        <span class="section-kicker">Super admin</span>
        <h2>Conceptos</h2>
        <p>Configuración central por ciclo, plantel y categoría. Los datos existentes de inscripción se leen desde la tabla legacy extendida.</p>
      </div>
      <div class="governance-status">
        <span>Fuente</span>
        <strong>{{ sourceLabel }}</strong>
        <button v-if="canManage" type="button" class="mini-action" :disabled="loading || syncing" @click="syncCentralToBridge">
          <LucideRefreshCw :size="15" :class="{ 'animate-spin': syncing }" />
          Sync
        </button>
      </div>
    </section>

    <section v-if="!canManage" class="card blocked-card">
      <LucideLock :size="18" />
      <span>Ruta administrativa.</span>
    </section>

    <template v-else>
      <section class="governance-toolbar">
        <label>
          <span>Ciclo</span>
          <select v-model="selectedCiclo">
            <option v-for="cycle in cycleOptions" :key="cycle.value" :value="cycle.value">{{ cycle.label }}</option>
          </select>
        </label>
        <label>
          <span>Plantel</span>
          <select v-model="selectedPlantel">
            <option v-for="plantel in plantelOptions" :key="plantel" :value="plantel">{{ plantel }}</option>
          </select>
        </label>
        <label>
          <span>Categoría</span>
          <select v-model="selectedCategory">
            <option v-for="category in categories" :key="category.key" :value="category.key">{{ category.label }}</option>
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

      <section class="governance-grid">
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
                  <span :style="serviceAccent(mapping)">{{ mapping.servicio_icono || '✦' }}</span>
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

          <div v-if="selectedCategory === 'talleres_servicios'" class="service-editor">
            <label>
              <span>Taller/servicio</span>
              <input v-model="serviceName" type="text" placeholder="Ballet, Fútbol, Comedor" />
            </label>
            <div class="service-inline-fields">
              <label>
                <span>Icono</span>
                <input v-model="serviceIcon" type="text" maxlength="8" placeholder="⚽" />
              </label>
              <label>
                <span>Color</span>
                <input v-model="serviceColor" type="text" placeholder="#6aa957" />
              </label>
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

          <button v-if="selectedCategory === 'talleres_servicios'" type="button" class="btn btn-outline full" :disabled="saving || !serviceName.trim()" @click="saveServiceOnly">
            <LucideSparkles :size="16" />
            Taller sin concepto
          </button>
        </aside>
      </section>

      <section class="governance-bottom-grid">
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
            <span>Talleres sin concepto</span>
            <strong>{{ unassociatedServices.length }}</strong>
          </div>
          <div class="insight-list service-tags">
            <span v-for="service in unassociatedServices.slice(0, 12)" :key="service.clave" :style="serviceTagStyle(service)">
              {{ service.icono || '✦' }} {{ service.nombre }}
            </span>
            <em v-if="!unassociatedServices.length">Sin pendientes.</em>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useCookie, useState } from '#app'
import { LucideLock, LucidePlus, LucideRefreshCw, LucideSearch, LucideSparkles, LucideTrash2 } from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { formatCicloLabel, normalizeCicloKey } from '~/shared/utils/ciclo'
import { PLANTELES_LIST } from '~/utils/constants'

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
const serviceIcon = ref('')
const serviceColor = ref('')
const selectedMonths = ref([])

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
const sourceLabel = computed(() => adminPayload.value?.source === 'central' ? 'Central' : 'Nuxt')
const categories = computed(() => adminPayload.value?.categorias?.length ? adminPayload.value.categorias.map((item) => ({ key: item.key, label: item.label })) : fallbackCategories)
const mappings = computed(() => Array.isArray(adminPayload.value?.mappings) ? adminPayload.value.mappings : [])
const conceptos = computed(() => Array.isArray(adminPayload.value?.conceptos) ? adminPayload.value.conceptos : [])
const talleres = computed(() => Array.isArray(adminPayload.value?.talleres) ? adminPayload.value.talleres : [])
const unassociatedServices = computed(() => Array.isArray(adminPayload.value?.talleresSinConcepto) ? adminPayload.value.talleresSinConcepto : [])
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
const serviceKey = (name) => String(name || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')

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
const canSaveMapping = computed(() => Boolean(selectedConcept.value?.id && selectedCiclo.value && selectedPlantel.value && selectedCategory.value && (selectedCategory.value !== 'talleres_servicios' || serviceName.value.trim())))

const serviceAccent = (mapping) => ({ '--service-accent': mapping.servicio_color || '#6aa957' })
const serviceTagStyle = (service) => ({ '--service-accent': service.color || '#6aa957' })

const loadAdmin = async () => {
  loading.value = true
  try {
    const result = await $fetch('/api/conceptos-config/admin')
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
  serviceIcon.value = ''
  serviceColor.value = ''
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
        servicio_nombre: serviceName.value,
        servicio_clave: serviceKey(serviceName.value),
        servicio_icono: serviceIcon.value,
        servicio_color: serviceColor.value,
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

const saveServiceOnly = async () => {
  if (!serviceName.value.trim()) return
  saving.value = true
  try {
    await $fetch('/api/conceptos-config/services', {
      method: 'POST',
      body: {
        ciclo: selectedCiclo.value,
        plantel: selectedPlantel.value,
        servicio_nombre: serviceName.value,
        servicio_clave: serviceKey(serviceName.value),
        servicio_icono: serviceIcon.value,
        servicio_color: serviceColor.value,
      }
    })
    show('Taller guardado', 'success')
    resetDraft()
    await loadAdmin()
  } catch (error) {
    show(error?.data?.message || 'No se pudo guardar', 'danger')
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

watch(selectedCategory, () => {
  if (selectedCategory.value !== 'talleres_servicios') {
    serviceName.value = ''
    serviceIcon.value = ''
    serviceColor.value = ''
  }
  if (selectedCategory.value !== 'mensual_baja4') selectedMonths.value = []
})
watch(selectedConcept, (concept) => {
  if (concept && selectedCategory.value === 'talleres_servicios' && !serviceName.value.trim()) {
    serviceName.value = concept.concepto
  }
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
  grid-template-columns: minmax(150px, .65fr) minmax(126px, .45fr) minmax(190px, .72fr) minmax(280px, 1fr) auto;
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
  .governance-toolbar { grid-template-columns: minmax(180px, .65fr) minmax(140px, .42fr) minmax(220px, .75fr) minmax(360px, 1fr) auto; }
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
</style>
