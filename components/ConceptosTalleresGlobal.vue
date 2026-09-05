<template>
  <section class="ts-admin">
    <header class="ts-hero card">
      <div class="ts-hero-copy">
        <span class="eyebrow">ASOCIACIÓN INSTITUCIONAL</span>
        <h1>Talleres y servicios</h1>
        <p>Asocia una sola vez. La regla <strong>GLOBAL</strong> aplica a todos los planteles; conserva asociaciones por plantel únicamente como excepciones.</p>
      </div>
      <div class="ts-hero-actions">
        <label class="cycle-field">
          <span>Ciclo escolar</span>
          <select v-model="selectedCiclo">
            <option v-for="cycle in cycleOptions" :key="cycle.value" :value="cycle.value">{{ cycle.label }}</option>
          </select>
        </label>
        <button class="refresh-button" type="button" :disabled="loading" @click="load">
          <LucideRefreshCw :size="17" :class="{ spin: loading }" />
          Actualizar
        </button>
      </div>
    </header>

    <section class="migration-card card" :class="{ complete: payload?.preview?.complete }">
      <div class="migration-icon"><LucideWandSparkles :size="24" /></div>
      <div class="migration-copy">
        <div class="migration-title-row">
          <h2>Migración automática</h2>
          <span v-if="payload?.preview?.complete" class="complete-pill"><LucideCheck :size="14" /> Completa</span>
          <span v-else class="pending-pill">{{ payload?.preview?.pendingMappings || 0 }} pendientes</span>
        </div>
        <p>
          Detecta nombres inequívocos del ciclo —incluidos DESAYUNO, COMIDA, CENA, CLUB DE TAREAS y variantes de AJEDREZ—
          y crea una sola asociación GLOBAL por concepto. No altera costos, documentos, pagos ni matrículas.
        </p>
        <div class="migration-preview" v-if="previewCandidates.length">
          <span v-for="candidate in previewCandidates" :key="candidate.concepto_id">
            {{ candidate.concepto_nombre }} <LucideArrowRight :size="12" /> {{ candidate.servicio_nombre }}
          </span>
          <button v-if="(payload?.preview?.conceptosCount || 0) > previewCandidates.length" type="button" class="more-preview" @click="showAllPreview = !showAllPreview">
            {{ showAllPreview ? 'Ver menos' : `+${(payload?.preview?.conceptosCount || 0) - previewCandidates.length} más` }}
          </button>
        </div>
      </div>
      <button
        type="button"
        class="migrate-button"
        :disabled="loading || migrating || !payload?.preview?.ready || payload?.preview?.complete"
        @click="runMigration"
      >
        <LucideLoaderCircle v-if="migrating" :size="18" class="spin" />
        <LucideWandSparkles v-else :size="18" />
        {{ payload?.preview?.complete ? 'Migración completa' : 'Migrar asociaciones seguras' }}
      </button>
    </section>

    <section class="summary-grid" v-if="payload">
      <article class="summary-card card"><span>Asociaciones globales</span><strong>{{ payload.totals?.asociadosGlobalmente || 0 }}</strong><small>Una regla para todos los planteles</small></article>
      <article class="summary-card card"><span>Sugerencias pendientes</span><strong>{{ payload.totals?.pendientesSugeridos || 0 }}</strong><small>Se pueden migrar en un clic</small></article>
      <article class="summary-card card"><span>Excepciones por plantel</span><strong>{{ payload.totals?.excepcionesPlantel || 0 }}</strong><small>Se respetan y tienen prioridad</small></article>
    </section>

    <section class="association-card card">
      <div class="association-toolbar">
        <div class="filter-tabs" aria-label="Estado de asociación">
          <button type="button" :class="{ active: filter === 'pending' }" @click="filter = 'pending'">Pendientes <span>{{ pendingCount }}</span></button>
          <button type="button" :class="{ active: filter === 'mapped' }" @click="filter = 'mapped'">Asociados <span>{{ mappedCount }}</span></button>
          <button type="button" :class="{ active: filter === 'all' }" @click="filter = 'all'">Todos</button>
        </div>
        <label class="search-field">
          <LucideSearch :size="17" />
          <input v-model="search" type="search" placeholder="Buscar concepto, taller o servicio..." />
        </label>
      </div>

      <div v-if="loading && !payload" class="state-panel"><LucideLoaderCircle :size="26" class="spin" /> Cargando asociaciones...</div>
      <div v-else-if="error" class="state-panel error"><LucideCircleAlert :size="22" /> {{ error }}</div>
      <div v-else-if="!visibleRows.length" class="state-panel"><LucideCheckCircle2 :size="24" /> No hay conceptos en esta vista.</div>

      <div v-else class="association-list">
        <article v-for="row in visibleRows" :key="row.concepto_id" class="association-row" :class="{ mapped: row.global }">
          <div class="concept-column">
            <div class="concept-heading">
              <span class="concept-id">#{{ row.concepto_id }}</span>
              <strong>{{ row.concepto_nombre }}</strong>
            </div>
            <div class="concept-meta">
              <span v-if="row.global" class="global-pill"><LucideGlobe2 :size="13" /> GLOBAL</span>
              <span v-else-if="row.suggestion" class="suggestion-pill"><LucideSparkles :size="13" /> Sugerencia segura</span>
              <span v-else class="manual-pill">Sin coincidencia automática</span>
              <span v-if="row.overrides?.length" class="exception-pill"><LucideBuilding2 :size="13" /> {{ row.overrides.length }} excepción{{ row.overrides.length === 1 ? '' : 'es' }}</span>
            </div>
            <div v-if="row.overrides?.length" class="override-list">
              <span v-for="override in row.overrides" :key="override.id">{{ override.plantel }} → {{ override.servicio_nombre }}</span>
            </div>
          </div>

          <div class="mapping-column">
            <label>
              <span>Asociación global</span>
              <select :value="draftFor(row)" :disabled="savingIds.has(row.concepto_id)" @change="saveFromSelect(row, $event)">
                <option value="">Sin asociación global</option>
                <optgroup label="Talleres">
                  <option v-for="item in talleres" :key="item.clave" :value="item.clave">{{ item.nombre }}</option>
                </optgroup>
                <optgroup label="Servicios">
                  <option v-for="item in servicios" :key="item.clave" :value="item.clave">{{ item.nombre }}</option>
                </optgroup>
              </select>
            </label>
            <button
              v-if="row.suggestion && !row.global"
              type="button"
              class="suggest-button"
              :disabled="savingIds.has(row.concepto_id)"
              @click="saveMapping(row, row.suggestion.servicio_clave)"
            >
              <LucideSparkles :size="15" /> Usar {{ row.suggestion.servicio_nombre }}
            </button>
            <button
              v-else-if="row.global"
              type="button"
              class="remove-button"
              :disabled="savingIds.has(row.concepto_id)"
              @click="removeGlobal(row)"
            >
              <LucideX :size="15" /> Quitar global
            </button>
            <span v-if="savingIds.has(row.concepto_id)" class="saving-label"><LucideLoaderCircle :size="14" class="spin" /> Guardando...</span>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>

<script setup>
import {
  LucideArrowRight,
  LucideBuilding2,
  LucideCheck,
  LucideCheckCircle2,
  LucideCircleAlert,
  LucideGlobe2,
  LucideLoaderCircle,
  LucideRefreshCw,
  LucideSearch,
  LucideSparkles,
  LucideWandSparkles,
  LucideX,
} from 'lucide-vue-next'
import { useActiveCiclo } from '~/composables/useActiveCiclo'
import { useToast } from '~/composables/useToast'
import { formatCicloLabel, normalizeCicloKey } from '~/shared/utils/ciclo'

const { show } = useToast()
const { activeCicloKey, setActiveCiclo } = useActiveCiclo()
const selectedCiclo = ref(normalizeCicloKey(activeCicloKey.value))
const payload = ref(null)
const loading = ref(false)
const migrating = ref(false)
const error = ref('')
const search = ref('')
const filter = ref('pending')
const showAllPreview = ref(false)
const savingIds = reactive(new Set())

const cycleOptions = computed(() => {
  const values = new Set([selectedCiclo.value, ...(payload.value?.cycles || []).map((cycle) => normalizeCicloKey(cycle?.cycle_name))])
  return Array.from(values).filter(Boolean).sort((a, b) => b.localeCompare(a)).map((value) => ({ value, label: formatCicloLabel(value) }))
})
const talleres = computed(() => (payload.value?.catalog || []).filter((item) => item.tipo === 'taller'))
const servicios = computed(() => (payload.value?.catalog || []).filter((item) => item.tipo === 'servicio'))
const pendingCount = computed(() => (payload.value?.rows || []).filter((row) => row.suggestion && !row.global).length)
const mappedCount = computed(() => (payload.value?.rows || []).filter((row) => row.global).length)
const previewCandidates = computed(() => {
  const all = payload.value?.preview?.conceptos || []
  return showAllPreview.value ? all : all.slice(0, 6)
})

const visibleRows = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase('es')
  return (payload.value?.rows || []).filter((row) => {
    if (filter.value === 'pending' && !(row.suggestion && !row.global)) return false
    if (filter.value === 'mapped' && !row.global) return false
    if (filter.value === 'all' && !needle && !row.relevant) return false
    if (!needle) return true
    const haystack = [
      row.concepto_nombre,
      row.global?.servicio_nombre,
      row.suggestion?.servicio_nombre,
      ...(row.overrides || []).flatMap((override) => [override.plantel, override.servicio_nombre]),
    ].filter(Boolean).join(' ').toLocaleLowerCase('es')
    return haystack.includes(needle)
  })
})

const draftFor = (row) => row.global?.servicio_clave || ''

const load = async () => {
  loading.value = true
  error.value = ''
  try {
    payload.value = await $fetch('/api/conceptos-config/talleres-servicios', { query: { ciclo: selectedCiclo.value } })
  } catch (e) {
    error.value = e?.data?.message || e?.data?.statusMessage || 'No se pudieron cargar las asociaciones.'
  } finally {
    loading.value = false
  }
}

const runMigration = async () => {
  if (migrating.value) return
  migrating.value = true
  try {
    const result = await $fetch('/api/conceptos-config/talleres-servicios/auto', {
      method: 'POST',
      body: { ciclo: selectedCiclo.value },
    })
    show(`Asociaciones globales listas: ${result.inserted || 0} nuevas, ${result.updated || 0} corregidas.`, 'success')
    await load()
  } catch (e) {
    show(e?.data?.message || 'No se pudo completar la migración.', 'danger')
  } finally {
    migrating.value = false
  }
}

const saveMapping = async (row, key) => {
  if (!key || savingIds.has(row.concepto_id)) return
  savingIds.add(row.concepto_id)
  try {
    await $fetch('/api/conceptos-config/talleres-servicios/mapping', {
      method: 'POST',
      body: {
        ciclo: selectedCiclo.value,
        concepto_id: row.concepto_id,
        servicio_clave: key,
      },
    })
    show(`${row.concepto_nombre} asociado globalmente.`, 'success')
    await load()
  } catch (e) {
    show(e?.data?.message || 'No se pudo guardar la asociación.', 'danger')
  } finally {
    savingIds.delete(row.concepto_id)
  }
}

const saveFromSelect = async (row, event) => {
  const key = event?.target?.value || ''
  if (!key) {
    if (row.global) await removeGlobal(row)
    return
  }
  await saveMapping(row, key)
}

const removeGlobal = async (row) => {
  if (!row.global?.id || savingIds.has(row.concepto_id)) return
  savingIds.add(row.concepto_id)
  try {
    await $fetch(`/api/conceptos-config/mappings/${row.global.id}`, { method: 'DELETE' })
    show(`Se quitó la asociación GLOBAL de ${row.concepto_nombre}.`, 'success')
    await load()
  } catch (e) {
    show(e?.data?.message || 'No se pudo quitar la asociación global.', 'danger')
  } finally {
    savingIds.delete(row.concepto_id)
  }
}

watch(selectedCiclo, async (value, previous) => {
  if (!value || value === previous) return
  setActiveCiclo(value)
  showAllPreview.value = false
  await load()
})

onMounted(load)
</script>

<style scoped>
.ts-admin { display: grid; gap: 16px; width: 100%; }
.card { background: #fff; border: 1px solid #e3e9ef; border-radius: 18px; box-shadow: 0 8px 24px rgba(28, 55, 83, .055); }
.ts-hero { padding: 22px 24px; display: flex; justify-content: space-between; gap: 24px; align-items: center; }
.eyebrow { color: #0b88b1; font-size: .68rem; font-weight: 900; letter-spacing: .12em; }
.ts-hero h1 { margin: 4px 0 6px; font-size: clamp(1.45rem, 2vw, 2rem); color: #17263a; }
.ts-hero p { margin: 0; color: #627186; max-width: 760px; line-height: 1.5; }
.ts-hero-actions { display: flex; align-items: end; gap: 10px; flex: 0 0 auto; }
.cycle-field { display: grid; gap: 5px; }
.cycle-field span, .mapping-column label > span { font-size: .68rem; color: #718096; font-weight: 800; text-transform: uppercase; letter-spacing: .07em; }
.cycle-field select, .mapping-column select { min-width: 175px; height: 42px; border: 1px solid #d5dfe9; border-radius: 12px; background: #fff; padding: 0 12px; color: #27374a; font-weight: 700; }
.refresh-button, .migrate-button, .suggest-button, .remove-button { border: 0; border-radius: 12px; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 7px; }
.refresh-button { height: 42px; padding: 0 15px; background: #f3f7fa; color: #42546a; }
button:disabled { opacity: .55; cursor: not-allowed; }
.migration-card { padding: 18px 20px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 16px; border-color: #cfeaf5; background: linear-gradient(135deg, #f8fdff 0%, #fff 72%); }
.migration-card.complete { border-color: #cfe8d2; background: linear-gradient(135deg, #f8fff8 0%, #fff 72%); }
.migration-icon { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; background: #e4f7fd; color: #0784ad; }
.migration-title-row { display: flex; gap: 9px; align-items: center; flex-wrap: wrap; }
.migration-copy h2 { margin: 0; color: #1f3045; font-size: 1.05rem; }
.migration-copy p { margin: 5px 0 0; color: #65758a; line-height: 1.45; font-size: .9rem; }
.complete-pill, .pending-pill { border-radius: 999px; padding: 4px 8px; font-size: .7rem; font-weight: 900; display: inline-flex; gap: 4px; align-items: center; }
.complete-pill { background: #e9f8e8; color: #2e8a37; }
.pending-pill { background: #fff3d8; color: #9b6c00; }
.migration-preview { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.migration-preview > span, .more-preview { background: #eef7fb; color: #3d6273; border: 0; border-radius: 999px; padding: 5px 8px; font-size: .7rem; font-weight: 750; display: inline-flex; align-items: center; gap: 4px; }
.more-preview { cursor: pointer; color: #087fa6; }
.migrate-button { min-height: 44px; padding: 0 17px; background: #0ea8d8; color: white; white-space: nowrap; }
.summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.summary-card { padding: 16px 18px; display: grid; gap: 2px; }
.summary-card span { color: #748297; font-size: .73rem; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; }
.summary-card strong { font-size: 1.55rem; color: #203249; }
.summary-card small { color: #8894a4; }
.association-card { overflow: hidden; }
.association-toolbar { padding: 14px 16px; border-bottom: 1px solid #e8edf2; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.filter-tabs { display: flex; gap: 5px; background: #f4f7f9; padding: 4px; border-radius: 12px; }
.filter-tabs button { border: 0; background: transparent; color: #637287; border-radius: 9px; padding: 8px 12px; font-weight: 800; cursor: pointer; }
.filter-tabs button span { margin-left: 4px; font-size: .68rem; opacity: .75; }
.filter-tabs button.active { background: white; color: #0b789d; box-shadow: 0 2px 8px rgba(26, 68, 94, .09); }
.search-field { min-width: min(390px, 46vw); height: 40px; border: 1px solid #dce4eb; border-radius: 12px; display: flex; align-items: center; gap: 8px; padding: 0 12px; color: #7a8797; }
.search-field input { border: 0; outline: 0; width: 100%; color: #293a4d; background: transparent; }
.association-list { display: grid; }
.association-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 420px); gap: 24px; align-items: center; padding: 15px 18px; border-bottom: 1px solid #edf1f4; }
.association-row:last-child { border-bottom: 0; }
.association-row:hover { background: #fbfdfe; }
.association-row.mapped { box-shadow: inset 3px 0 #62b966; }
.concept-column { min-width: 0; }
.concept-heading { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.concept-heading strong { color: #26374b; font-size: .93rem; overflow-wrap: anywhere; }
.concept-id { color: #8b98a8; font-size: .7rem; font-weight: 800; flex: none; }
.concept-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 7px; }
.global-pill, .suggestion-pill, .manual-pill, .exception-pill { padding: 4px 7px; border-radius: 999px; font-size: .67rem; font-weight: 850; display: inline-flex; align-items: center; gap: 4px; }
.global-pill { background: #eaf8e8; color: #32853a; }
.suggestion-pill { background: #e9f7fd; color: #087fa7; }
.manual-pill { background: #f2f4f6; color: #788493; }
.exception-pill { background: #fff3df; color: #9a6807; }
.override-list { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 7px; }
.override-list span { font-size: .67rem; color: #6e5a28; background: #fff9ed; border: 1px solid #f2e5c8; border-radius: 7px; padding: 3px 6px; }
.mapping-column { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px 8px; align-items: end; }
.mapping-column label { display: grid; gap: 5px; min-width: 0; }
.mapping-column select { width: 100%; min-width: 0; }
.suggest-button { height: 42px; padding: 0 12px; background: #e7f7fd; color: #087ea5; white-space: nowrap; }
.remove-button { height: 42px; padding: 0 12px; background: #f5f6f7; color: #758191; white-space: nowrap; }
.saving-label { grid-column: 1 / -1; justify-self: end; font-size: .7rem; color: #7c8998; display: inline-flex; align-items: center; gap: 4px; }
.state-panel { min-height: 180px; display: flex; align-items: center; justify-content: center; gap: 8px; color: #738195; }
.state-panel.error { color: #b24c4c; }
.spin { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 900px) {
  .ts-hero { align-items: stretch; flex-direction: column; }
  .ts-hero-actions { align-items: end; }
  .migration-card { grid-template-columns: auto 1fr; }
  .migrate-button { grid-column: 1 / -1; width: 100%; }
  .summary-grid { grid-template-columns: 1fr; }
  .association-toolbar { align-items: stretch; flex-direction: column; }
  .search-field { min-width: 0; width: 100%; }
  .association-row { grid-template-columns: 1fr; gap: 11px; }
}
@media (max-width: 560px) {
  .ts-hero, .migration-card { padding: 16px; }
  .ts-hero-actions { display: grid; grid-template-columns: 1fr auto; align-items: end; }
  .cycle-field select { min-width: 0; width: 100%; }
  .migration-card { grid-template-columns: 1fr; }
  .migration-icon { display: none; }
  .association-row { padding: 14px; }
  .mapping-column { grid-template-columns: 1fr; }
  .suggest-button, .remove-button { width: 100%; }
  .filter-tabs { width: 100%; overflow-x: auto; }
  .filter-tabs button { flex: 1 0 auto; }
}
</style>
