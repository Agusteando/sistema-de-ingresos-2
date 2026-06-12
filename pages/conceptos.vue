<template>
  <div class="concept-config-page">
    <section class="concept-hero">
      <div class="hero-copy">
        <span class="section-kicker">Super admin</span>
        <h2>Conceptos</h2>
        <p>Configura categorías por ciclo y plantel. El espejo local del Bridge se actualiza al guardar.</p>
      </div>
      <div class="hero-metrics">
        <div>
          <span>Conceptos</span>
          <strong>{{ conceptos.length }}</strong>
        </div>
        <div>
          <span>Mapeados</span>
          <strong>{{ activeMappings.length }}</strong>
        </div>
        <div>
          <span>Talleres libres</span>
          <strong>{{ talleresSinConcepto.length }}</strong>
        </div>
      </div>
    </section>

    <section class="concept-toolbar">
      <div class="field-chip">
        <LucideCalendarDays :size="16" />
        <select v-model="selectedCiclo" aria-label="Ciclo">
          <option v-for="ciclo in cycleOptions" :key="ciclo" :value="ciclo">{{ ciclo }}</option>
        </select>
      </div>
      <div class="field-chip">
        <LucideBuilding2 :size="16" />
        <select v-model="selectedPlantel" aria-label="Plantel">
          <option v-for="plantel in planteles" :key="plantel" :value="plantel">{{ plantel }}</option>
        </select>
      </div>
      <div class="field-chip">
        <LucideTags :size="16" />
        <select v-model="selectedCategoria" aria-label="Categoría">
          <option value="">Todas</option>
          <option v-for="cat in categorias" :key="cat.clave" :value="cat.clave">{{ cat.nombre }}</option>
        </select>
      </div>
      <div class="search-box">
        <LucideSearch :size="16" />
        <input v-model="search" type="search" placeholder="Buscar concepto o taller" />
      </div>
      <button v-if="canManageConceptos" class="toolbar-action primary" type="button" title="Importar conceptos del Bridge local a central" @click="importCatalog" :disabled="busy">
        <LucideDownload :class="{ 'animate-spin': busyAction === 'import' }" :size="16" />
        <span>Importar</span>
      </button>
      <button v-if="canManageConceptos" class="toolbar-action" type="button" title="Sincronizar central al Bridge local" @click="syncBridge" :disabled="busy">
        <LucideRefreshCw :class="{ 'animate-spin': busyAction === 'sync' }" :size="16" />
        <span>Sync</span>
      </button>
      <button class="icon-button" type="button" title="Actualizar" @click="loadAdmin" :disabled="loading">
        <LucideRefreshCw :class="{ 'animate-spin': loading }" :size="17" />
      </button>
    </section>

    <section v-if="!canManageConceptos" class="readonly-card">
      <LucideLock :size="17" />
      <span>Solo super admin puede modificar esta configuración.</span>
    </section>

    <section class="config-grid">
      <div class="config-main card-panel">
        <div class="panel-head">
          <div>
            <h3>Configuración</h3>
            <small>{{ filteredMappings.length }} asignaciones</small>
          </div>
          <button v-if="canManageConceptos" class="btn-compact" type="button" @click="resetDraft">
            <LucidePlus :size="15" />
            Agregar
          </button>
        </div>

        <div v-if="draftVisible" class="assignment-composer">
          <div class="concept-picker">
            <label>Concepto</label>
            <div class="search-box compact">
              <LucideSearch :size="15" />
              <input v-model="conceptSearch" type="search" placeholder="ID o nombre" />
            </div>
            <div class="picker-list">
              <button
                v-for="concepto in conceptPickerItems"
                :key="concepto.concepto_id"
                type="button"
                :class="{ selected: Number(draft.concepto_id) === Number(concepto.concepto_id) }"
                @click="selectConcept(concepto)"
              >
                <strong>{{ concepto.concepto_nombre }}</strong>
                <span>#{{ concepto.concepto_id }}</span>
              </button>
            </div>
          </div>

          <div class="assignment-fields">
            <label>Categoría</label>
            <select v-model="draft.categoria_clave">
              <option v-for="cat in categorias" :key="cat.clave" :value="cat.clave">{{ cat.nombre }}</option>
            </select>

            <template v-if="draft.categoria_clave === 'talleres_servicios'">
              <label>Taller / servicio</label>
              <select v-model="draft.servicio_id">
                <option value="">Sin mapear</option>
                <option v-for="servicio in servicios" :key="servicio.id" :value="servicio.id">{{ servicio.nombre }}</option>
              </select>
            </template>

            <template v-if="draft.categoria_clave === 'mensual_baja4'">
              <label>Meses</label>
              <input v-model="draft.monthsText" type="text" placeholder="Ago, Sep, Oct" />
            </template>

            <button class="save-button" type="button" :disabled="!canSaveDraft || busy" @click="saveDraft">
              <LucideCheck :size="16" />
              Guardar
            </button>
          </div>
        </div>

        <div class="category-lanes">
          <article v-for="group in groupedMappings" :key="group.key" class="category-lane">
            <header>
              <span :class="['category-dot', `dot-${group.key}`]"></span>
              <strong>{{ group.label }}</strong>
              <small>{{ group.items.length }}</small>
            </header>
            <div v-if="!group.items.length" class="empty-row">Sin asignaciones</div>
            <div v-else class="mapping-list">
              <div v-for="item in group.items" :key="item.id" class="mapping-row" :class="{ inactive: !item.activo }">
                <div class="mapping-main">
                  <span class="concept-id">#{{ item.concepto_id }}</span>
                  <strong>{{ item.concepto_nombre }}</strong>
                  <small>{{ item.plantel }} · {{ item.ciclo }}</small>
                </div>
                <div class="mapping-side">
                  <span v-if="item.servicio" class="service-chip" :style="chipStyle(item.servicio)">
                    <component :is="serviceIcon(item.servicio)" :size="14" />
                    {{ item.servicio.nombre }}
                  </span>
                  <span v-else-if="item.categoria_clave === 'talleres_servicios'" class="soft-warning">Sin taller</span>
                  <span v-if="item.months?.length" class="months-chip">{{ item.months.join(' · ') }}</span>
                  <button v-if="canManageConceptos" class="row-action danger" type="button" title="Quitar" @click="removeMapping(item)">
                    <LucideX :size="15" />
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>

      <aside class="config-side">
        <section class="card-panel side-card">
          <div class="panel-head tight">
            <div>
              <h3>Talleres</h3>
              <small>{{ servicios.length }} activos</small>
            </div>
            <button v-if="canManageConceptos" class="icon-button" type="button" title="Nuevo taller" @click="newServiceVisible = !newServiceVisible">
              <LucidePlus :size="16" />
            </button>
          </div>

          <div v-if="newServiceVisible" class="service-form">
            <input v-model="newService.nombre" type="text" placeholder="Nombre" />
            <select v-model="newService.tipo">
              <option value="taller">Taller</option>
              <option value="servicio">Servicio</option>
            </select>
            <div class="icon-grid">
              <button v-for="icon in iconOptions" :key="icon" type="button" :class="{ selected: newService.icono === icon }" @click="newService.icono = icon">
                <component :is="iconComponent(icon)" :size="16" />
              </button>
            </div>
            <button class="save-button small" type="button" :disabled="!newService.nombre || busy" @click="createService">
              Guardar taller
            </button>
          </div>

          <div class="service-list">
            <div v-for="servicio in filteredServicios" :key="servicio.id" class="service-row">
              <span class="service-icon" :style="chipStyle(servicio)">
                <component :is="serviceIcon(servicio)" :size="15" />
              </span>
              <strong>{{ servicio.nombre }}</strong>
              <small>{{ servicio.tipo }}</small>
            </div>
          </div>
        </section>

        <section class="card-panel side-card">
          <div class="panel-head tight">
            <div>
              <h3>Pendientes</h3>
              <small>{{ conceptosSinCategoria.length + talleresSinConcepto.length }}</small>
            </div>
          </div>
          <div class="gap-stack">
            <div>
              <span>Conceptos sin categoría</span>
              <strong>{{ conceptosSinCategoria.length }}</strong>
            </div>
            <div>
              <span>Talleres sin concepto</span>
              <strong>{{ talleresSinConcepto.length }}</strong>
            </div>
          </div>
          <div class="mini-list">
            <span v-for="item in talleresSinConcepto.slice(0, 6)" :key="item.id">{{ item.nombre }}</span>
          </div>
        </section>
      </aside>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
  LucideActivity,
  LucideBuilding2,
  LucideCalendarDays,
  LucideCheck,
  LucideDumbbell,
  LucideDownload,
  LucideGraduationCap,
  LucideLock,
  LucideMusic,
  LucidePalette,
  LucidePlus,
  LucideRefreshCw,
  LucideSearch,
  LucideSparkles,
  LucideUtensils,
  LucideX,
  LucideTags
} from 'lucide-vue-next'
import { useState } from '#app'
import { PLANTELES_LIST } from '~/utils/constants'
import { formatCicloLabel, normalizeCicloKey } from '~/shared/utils/ciclo'
import { useToast } from '~/composables/useToast'

const state = useState('globalState')
const { show } = useToast()

const superAdminCookie = useCookie('auth_is_super_admin')
const roleCookie = useCookie('auth_role')
const activePlantelCookie = useCookie('auth_active_plantel')
const roleTokens = computed(() => String(roleCookie.value || '')
  .split(',')
  .map((role) => role.trim().toLowerCase())
  .filter(Boolean))
const canManageConceptos = computed(() => superAdminCookie.value === 'true' || roleTokens.value.some((role) => ['global', 'superadmin', 'role_super_admin', 'role_superadmin'].includes(role)))
const isSuperAdmin = canManageConceptos

const loading = ref(false)
const busy = ref(false)
const busyAction = ref('')
const adminData = ref({ conceptos: [], servicios: [], mappings: [], categorias: [], conceptosSinCategoria: [], talleresSinConcepto: [], config: null })
const search = ref('')
const conceptSearch = ref('')
const selectedCiclo = ref(formatCicloLabel(state.value?.ciclo || '2025'))
const selectedPlantel = ref(String(activePlantelCookie.value || 'PT') === 'GLOBAL' ? 'PT' : String(activePlantelCookie.value || 'PT'))
const selectedCategoria = ref('')
const draftVisible = ref(false)
const newServiceVisible = ref(false)
const draft = ref({ concepto_id: '', concepto_nombre: '', categoria_clave: 'inscripcion', servicio_id: '', monthsText: '' })
const newService = ref({ nombre: '', tipo: 'taller', icono: 'sparkles', color: '' })

const planteles = PLANTELES_LIST
const iconOptions = ['sparkles', 'dumbbell', 'music', 'palette', 'utensils', 'activity', 'graduation']

const iconComponent = (icon) => ({
  sparkles: LucideSparkles,
  dumbbell: LucideDumbbell,
  music: LucideMusic,
  palette: LucidePalette,
  utensils: LucideUtensils,
  activity: LucideActivity,
  graduation: LucideGraduationCap
}[icon] || LucideSparkles)

const serviceIcon = (service) => iconComponent(service?.icono)
const chipStyle = (service) => {
  const color = service?.color || '#eef7ee'
  return { '--chip-bg': color.startsWith('#') ? `${color}22` : '#eef7ee', '--chip-fg': color.startsWith('#') ? color : '#2f6d35' }
}

const conceptos = computed(() => adminData.value.conceptos || [])
const servicios = computed(() => (adminData.value.servicios || []).filter((item) => Number(item.activo ?? 1) === 1))
const mappings = computed(() => adminData.value.mappings || [])
const categorias = computed(() => adminData.value.categorias?.length ? adminData.value.categorias : [
  { clave: 'inscripcion', nombre: 'Inscripción' },
  { clave: 'talleres_servicios', nombre: 'Talleres y Servicios' },
  { clave: 'curso_verano', nombre: 'Curso de Verano' },
  { clave: 'mensual_baja4', nombre: 'Mensual baja 4' },
  { clave: 'issste', nombre: 'ISSSTE' },
  { clave: 'otro', nombre: 'Otro' }
])
const conceptosSinCategoria = computed(() => adminData.value.conceptosSinCategoria || [])
const talleresSinConcepto = computed(() => adminData.value.talleresSinConcepto || [])
const activeMappings = computed(() => mappings.value.filter((item) => Number(item.activo ?? 1) === 1))

const cycleOptions = computed(() => {
  const cycles = Object.keys(adminData.value.config?.ciclos || {})
  const fallback = formatCicloLabel(state.value?.ciclo || selectedCiclo.value)
  return [...new Set([selectedCiclo.value, fallback, ...cycles].filter(Boolean))]
})

const filteredMappings = computed(() => {
  const term = search.value.trim().toLowerCase()
  return activeMappings.value.filter((item) => {
    if (selectedCiclo.value && item.ciclo !== selectedCiclo.value) return false
    if (selectedPlantel.value && item.plantel !== selectedPlantel.value) return false
    if (selectedCategoria.value && item.categoria_clave !== selectedCategoria.value) return false
    if (!term) return true
    return [item.concepto_id, item.concepto_nombre, item.servicio?.nombre, item.categoria_clave].some((value) => String(value || '').toLowerCase().includes(term))
  })
})

const groupedMappings = computed(() => categorias.value
  .filter((cat) => !selectedCategoria.value || cat.clave === selectedCategoria.value)
  .map((cat) => ({
    key: cat.clave,
    label: cat.nombre,
    items: filteredMappings.value.filter((item) => item.categoria_clave === cat.clave)
  })))

const filteredServicios = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return servicios.value
  return servicios.value.filter((item) => [item.nombre, item.clave, item.tipo].some((value) => String(value || '').toLowerCase().includes(term)))
})

const conceptPickerItems = computed(() => {
  const term = conceptSearch.value.trim().toLowerCase()
  const base = conceptos.value.filter((concepto) => {
    if (!term) return true
    return [concepto.concepto_id, concepto.concepto_nombre].some((value) => String(value || '').toLowerCase().includes(term))
  })
  return base.slice(0, 80)
})

const canSaveDraft = computed(() => draft.value.concepto_id && draft.value.concepto_nombre && draft.value.categoria_clave)

const loadAdmin = async () => {
  loading.value = true
  try {
    adminData.value = await $fetch('/api/conceptos-config/admin', {
      params: {
        ciclo: selectedCiclo.value,
        plantel: selectedPlantel.value,
        categoria: selectedCategoria.value
      }
    })
  } catch (error) {
    show(error?.data?.message || 'No se pudo cargar configuración', 'danger')
  } finally {
    loading.value = false
  }
}

const resetDraft = () => {
  draft.value = { concepto_id: '', concepto_nombre: '', categoria_clave: selectedCategoria.value || 'inscripcion', servicio_id: '', monthsText: '' }
  conceptSearch.value = ''
  draftVisible.value = true
}

const selectConcept = (concepto) => {
  draft.value.concepto_id = concepto.concepto_id
  draft.value.concepto_nombre = concepto.concepto_nombre
}

const saveDraft = async () => {
  if (!canSaveDraft.value) return
  busy.value = true
  busyAction.value = 'save'
  try {
    await $fetch('/api/conceptos-config/mappings', {
      method: 'POST',
      body: {
        concepto_id: draft.value.concepto_id,
        concepto_nombre: draft.value.concepto_nombre,
        ciclo: selectedCiclo.value,
        plantel: selectedPlantel.value,
        categoria_clave: draft.value.categoria_clave,
        servicio_id: draft.value.servicio_id || null,
        meses: draft.value.monthsText
      }
    })
    show('Concepto guardado', 'success')
    draftVisible.value = false
    await loadAdmin()
  } catch (error) {
    show(error?.data?.message || 'No se pudo guardar', 'danger')
  } finally {
    busy.value = false
    busyAction.value = ''
  }
}

const removeMapping = async (item) => {
  busy.value = true
  try {
    await $fetch(`/api/conceptos-config/mappings/${item.id}`, { method: 'DELETE' })
    show('Concepto desasignado', 'success')
    await loadAdmin()
  } catch (error) {
    show(error?.data?.message || 'No se pudo desasignar', 'danger')
  } finally {
    busy.value = false
  }
}

const createService = async () => {
  busy.value = true
  try {
    await $fetch('/api/conceptos-config/services', { method: 'POST', body: newService.value })
    newService.value = { nombre: '', tipo: 'taller', icono: 'sparkles', color: '' }
    newServiceVisible.value = false
    show('Taller guardado', 'success')
    await loadAdmin()
  } catch (error) {
    show(error?.data?.message || 'No se pudo guardar taller', 'danger')
  } finally {
    busy.value = false
  }
}

const importCatalog = async () => {
  busy.value = true
  busyAction.value = 'import'
  try {
    const result = await $fetch('/api/conceptos-config/sync-catalog', {
      method: 'POST',
      body: { ciclo: selectedCiclo.value, plantel: selectedPlantel.value }
    })
    show(`Catálogo sincronizado (${result.imported || 0})`, 'success')
    await loadAdmin()
  } catch (error) {
    show(error?.data?.message || 'No se pudo sincronizar catálogo', 'danger')
  } finally {
    busy.value = false
    busyAction.value = ''
  }
}

const syncBridge = async () => {
  busy.value = true
  busyAction.value = 'sync'
  try {
    const result = await $fetch('/api/conceptos-config/sync-bridge', {
      method: 'POST',
      body: { ciclo: selectedCiclo.value, plantel: selectedPlantel.value }
    })
    const synced = result?.synced?.configs ?? 0
    show(`Bridge sincronizado (${synced})`, 'success')
    await loadAdmin()
  } catch (error) {
    show(error?.data?.message || 'No se pudo sincronizar Bridge', 'danger')
  } finally {
    busy.value = false
    busyAction.value = ''
  }
}

onMounted(() => {
  if (canManageConceptos.value) loadAdmin()
})

watch([selectedCiclo, selectedPlantel, selectedCategoria], () => {
  if (canManageConceptos.value) loadAdmin()
})
</script>

<style scoped>
.concept-config-page {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 14px;
}

.concept-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid #dfe6ef;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(255,255,255,.98), rgba(247,252,246,.96));
  padding: 18px 20px;
  box-shadow: 0 12px 30px rgba(22, 38, 65, 0.06);
}

.section-kicker {
  display: block;
  margin-bottom: 4px;
  color: #3f7e36;
  font-size: .66rem;
  font-weight: 850;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.hero-copy h2,
.panel-head h3 {
  margin: 0;
  color: #162641;
  font-weight: 850;
}

.hero-copy h2 { font-size: 1.24rem; }
.hero-copy p {
  margin: 4px 0 0;
  color: #66728a;
  font-size: .82rem;
  font-weight: 520;
}

.hero-metrics {
  display: grid;
  min-width: 340px;
  grid-template-columns: repeat(3, minmax(0,1fr));
  overflow: hidden;
  border: 1px solid #dfe6ef;
  border-radius: 14px;
  background: rgba(255,255,255,.86);
}

.hero-metrics div {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  border-right: 1px solid #edf2f7;
  padding: 12px 14px;
}
.hero-metrics div:last-child { border-right: 0; }
.hero-metrics span,
.panel-head small,
.mapping-main small,
.service-row small,
.gap-stack span {
  color: #66728a;
  font-size: .67rem;
  font-weight: 800;
  text-transform: uppercase;
}
.hero-metrics strong { color: #162641; font-size: 1.12rem; line-height: 1; }

.concept-toolbar {
  display: grid;
  grid-template-columns: auto auto auto minmax(260px, 1fr) auto auto auto;
  gap: 10px;
  align-items: center;
}

.field-chip,
.search-box {
  display: flex;
  height: 38px;
  align-items: center;
  gap: 8px;
  border: 1px solid #dfe6ef;
  border-radius: 12px;
  background: #fff;
  padding: 0 11px;
  color: #66728a;
  box-shadow: 0 8px 20px rgba(22,38,65,.04);
}

.field-chip select,
.search-box input,
.assignment-fields select,
.assignment-fields input,
.service-form input,
.service-form select {
  min-width: 0;
  border: 0;
  background: transparent;
  color: #162641;
  font-size: .82rem;
  font-weight: 700;
  outline: none;
}

.search-box input { flex: 1; }
.search-box.compact { height: 34px; box-shadow: none; }

.icon-button,
.toolbar-action,
.btn-compact,
.save-button,
.row-action,
.icon-grid button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #dfe6ef;
  background: #fff;
  color: #397fe8;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}
.icon-button { width: 38px; height: 38px; border-radius: 12px; }
.icon-button.primary { color: #2f7a37; background: #f5fbf3; }
.toolbar-action { height: 38px; gap: 7px; border-radius: 12px; padding: 0 12px; color: #4a596f; font-size: .76rem; font-weight: 850; }
.toolbar-action.primary { color: #2f7a37; background: #f5fbf3; }
.icon-button:hover,
.toolbar-action:hover,
.btn-compact:hover,
.row-action:hover { transform: translateY(-1px); border-color: rgba(57,127,232,.32); background: rgba(57,127,232,.06); }

.readonly-card,
.card-panel {
  border: 1px solid #dfe6ef;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(22,38,65,.05);
}
.readonly-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  color: #66728a;
  font-weight: 750;
  font-size: .82rem;
}

.config-grid {
  display: grid;
  min-height: 0;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 14px;
}

.card-panel { min-width: 0; overflow: hidden; }
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #edf2f7;
  padding: 14px 16px;
}
.panel-head.tight { padding: 13px 14px; }
.panel-head h3 { font-size: .96rem; }

.btn-compact {
  height: 32px;
  gap: 6px;
  border-radius: 10px;
  padding: 0 10px;
  font-size: .74rem;
  font-weight: 850;
}

.assignment-composer {
  display: grid;
  grid-template-columns: minmax(0,1fr) 280px;
  gap: 14px;
  border-bottom: 1px solid #edf2f7;
  padding: 14px 16px;
  background: #fbfdff;
}
.concept-picker label,
.assignment-fields label {
  display: block;
  margin-bottom: 7px;
  color: #66728a;
  font-size: .68rem;
  font-weight: 850;
  text-transform: uppercase;
}
.picker-list {
  display: grid;
  max-height: 220px;
  overflow: auto;
  gap: 6px;
  margin-top: 8px;
}
.picker-list button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid #edf2f7;
  border-radius: 11px;
  background: #fff;
  padding: 9px 10px;
  color: #162641;
  text-align: left;
}
.picker-list button.selected { border-color: rgba(63,126,54,.42); background: #f1faef; }
.picker-list strong { font-size: .78rem; }
.picker-list span { color: #8a96aa; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .72rem; }
.assignment-fields { display: grid; align-content: start; gap: 9px; }
.assignment-fields select,
.assignment-fields input,
.service-form input,
.service-form select {
  height: 36px;
  border: 1px solid #dfe6ef;
  border-radius: 11px;
  background: #fff;
  padding: 0 10px;
}
.save-button {
  height: 36px;
  gap: 7px;
  border-radius: 11px;
  background: #1f6f3c;
  color: #fff;
  font-size: .78rem;
  font-weight: 850;
}
.save-button:disabled { opacity: .48; cursor: not-allowed; }
.save-button.small { width: 100%; height: 34px; }

.category-lanes { display: grid; gap: 12px; padding: 14px 16px 16px; }
.category-lane {
  border: 1px solid #edf2f7;
  border-radius: 14px;
  background: #fff;
  overflow: hidden;
}
.category-lane header {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid #edf2f7;
  padding: 10px 12px;
  color: #162641;
}
.category-lane header small { margin-left: auto; color: #8a96aa; font-weight: 850; }
.category-dot { width: 8px; height: 8px; border-radius: 999px; background: #8aa3bd; }
.dot-inscripcion { background: #3f7e36; }
.dot-talleres_servicios { background: #397fe8; }
.dot-curso_verano { background: #f59e0b; }
.dot-mensual_baja4 { background: #8b5cf6; }
.dot-issste { background: #0f766e; }

.empty-row { padding: 18px 12px; color: #9aa5b5; font-size: .8rem; font-weight: 700; }
.mapping-list { display: grid; }
.mapping-row {
  display: grid;
  grid-template-columns: minmax(0,1fr) auto;
  gap: 12px;
  align-items: center;
  border-bottom: 1px solid #f1f5f9;
  padding: 10px 12px;
}
.mapping-row:last-child { border-bottom: 0; }
.mapping-row.inactive { opacity: .55; }
.mapping-main { display: grid; gap: 2px; min-width: 0; }
.mapping-main strong { overflow: hidden; color: #162641; font-size: .82rem; text-overflow: ellipsis; white-space: nowrap; }
.concept-id { color: #8a96aa; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .68rem; font-weight: 850; }
.mapping-side { display: flex; align-items: center; gap: 8px; }
.service-chip,
.months-chip,
.soft-warning {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  padding: 5px 8px;
  font-size: .68rem;
  font-weight: 850;
}
.service-chip { background: var(--chip-bg); color: var(--chip-fg); }
.months-chip { background: #f8fafc; color: #66728a; border: 1px solid #edf2f7; }
.soft-warning { background: #fff7ed; color: #c05621; }
.row-action { width: 28px; height: 28px; border-radius: 9px; }
.row-action.danger { color: #e05252; }

.config-side { display: grid; gap: 14px; align-content: start; }
.side-card { overflow: hidden; }
.service-form { display: grid; gap: 8px; border-bottom: 1px solid #edf2f7; padding: 12px 14px; background: #fbfdff; }
.icon-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
.icon-grid button { height: 30px; border-radius: 9px; color: #66728a; }
.icon-grid button.selected { background: #eef7ee; color: #2f6d35; border-color: rgba(47,109,53,.3); }
.service-list { display: grid; max-height: 360px; overflow: auto; }
.service-row {
  display: grid;
  grid-template-columns: 30px minmax(0,1fr) auto;
  gap: 8px;
  align-items: center;
  border-bottom: 1px solid #f1f5f9;
  padding: 9px 14px;
}
.service-row:last-child { border-bottom: 0; }
.service-row strong { overflow: hidden; color: #162641; font-size: .8rem; text-overflow: ellipsis; white-space: nowrap; }
.service-icon { display: inline-flex; width: 28px; height: 28px; align-items: center; justify-content: center; border-radius: 9px; background: var(--chip-bg); color: var(--chip-fg); }
.gap-stack { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px 14px; }
.gap-stack div { border: 1px solid #edf2f7; border-radius: 12px; padding: 10px; background: #fbfdff; }
.gap-stack strong { display: block; margin-top: 3px; color: #162641; font-size: 1rem; }
.mini-list { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 14px; }
.mini-list span { border-radius: 999px; background: #f8fafc; color: #66728a; padding: 5px 8px; font-size: .68rem; font-weight: 800; }

@media (max-width: 1180px) {
  .concept-hero,
  .config-grid,
  .assignment-composer { grid-template-columns: 1fr; }
  .concept-hero { flex-direction: column; }
  .hero-metrics { min-width: 0; }
  .concept-toolbar { grid-template-columns: 1fr 1fr; }
}
</style>
