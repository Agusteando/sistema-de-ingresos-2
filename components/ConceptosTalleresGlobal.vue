<template>
  <section class="ts-admin">
    <header class="card hero">
      <div>
        <span class="eyebrow">ADMINISTRACIÓN DE TALLERES</span>
        <h1>Talleres y servicios</h1>
        <p>Agrega talleres y define manualmente qué taller o servicio corresponde a cada concepto financiero.</p>
      </div>
      <div class="hero-actions">
        <label class="field cycle-field">
          <span>Ciclo escolar</span>
          <select v-model="selectedCiclo">
            <option v-for="cycle in cycleOptions" :key="cycle.value" :value="cycle.value">{{ cycle.label }}</option>
          </select>
        </label>
        <button class="btn subtle" type="button" :disabled="loading" @click="load">
          <LucideRefreshCw :size="17" :class="{ spin: loading }" /> Actualizar
        </button>
        <button class="btn primary" type="button" @click="openWorkshopModal">
          <LucidePlus :size="18" /> Nuevo taller
        </button>
      </div>
    </header>

    <section class="card manual-card">
      <div class="manual-title">
        <div>
          <span class="eyebrow">ACCIÓN MANUAL</span>
          <h2>Asociar concepto financiero</h2>
          <p>Elige un concepto y lo que debe activar. Una asociación existente se puede cambiar o quitar aquí.</p>
        </div>
        <span v-if="selectedManualRow?.global" class="pill mapped-pill">
          <LucideGlobe2 :size="13" /> GLOBAL · {{ selectedManualRow.global.servicio_nombre }}
        </span>
      </div>
      <div class="manual-fields">
        <label class="field">
          <span>Concepto financiero</span>
          <select v-model="manualConceptId" :disabled="loading">
            <option value="">Selecciona un concepto...</option>
            <option v-for="row in rows" :key="row.concepto_id" :value="String(row.concepto_id)">#{{ row.concepto_id }} · {{ row.concepto_nombre }}</option>
          </select>
        </label>
        <label class="field">
          <span>Taller o servicio</span>
          <div class="service-search">
            <LucideSearch :size="16" />
            <input v-model="manualServiceSearch" :disabled="loading" list="talleres-catalog-options" placeholder="Buscar taller o servicio..." autocomplete="off" @input="syncManualServiceFromSearch" />
          </div>
          <datalist id="talleres-catalog-options">
            <option v-for="item in catalog" :key="item.clave" :value="item.nombre" />
          </datalist>
        </label>
        <button class="btn primary" type="button" :disabled="!canSaveManual || savingIds.has(Number(manualConceptId))" @click="saveManualAssociation">
          <LucideLoaderCircle v-if="savingIds.has(Number(manualConceptId))" :size="17" class="spin" />
          <LucideLink2 v-else :size="17" />
          {{ selectedManualRow?.global ? 'Cambiar asociación' : 'Guardar asociación' }}
        </button>
        <button v-if="selectedManualRow?.global" class="btn subtle" type="button" :disabled="savingIds.has(Number(manualConceptId))" @click="removeGlobal(selectedManualRow)">
          <LucideX :size="16" /> Quitar asociación
        </button>
        <button v-if="selectedManualService" class="btn remove" type="button" :disabled="Boolean(removingWorkshopKey)" @click="removeWorkshop(selectedManualService)">
          <LucideLoaderCircle v-if="removingWorkshopKey === selectedManualService.clave" :size="17" class="spin" />
          <LucideTrash2 v-else :size="16" /> Retirar taller
        </button>
      </div>
    </section>

    <section class="card suggestions">
      <LucideSparkles :size="22" />
      <div>
        <div class="suggestion-heading">
          <strong>Sugerencias automáticas</strong>
          <span class="pill">{{ payload?.totals?.pendientesSugeridos || 0 }} pendientes</span>
        </div>
        <p>Aurora sólo las propone. Se aplican una por una desde la lista; no hay escritura automática sobre tus asociaciones.</p>
        <div v-if="previewCandidates.length" class="preview">
          <span v-for="candidate in previewCandidates" :key="candidate.concepto_id">{{ candidate.concepto_nombre }} → {{ candidate.servicio_nombre }}</span>
          <button v-if="(payload?.preview?.conceptosCount || 0) > previewCandidates.length" type="button" @click="showAllPreview = !showAllPreview">
            {{ showAllPreview ? 'Ver menos' : `+${(payload?.preview?.conceptosCount || 0) - previewCandidates.length} más` }}
          </button>
        </div>
      </div>
    </section>

    <section class="card association-card">
      <div class="toolbar">
        <div class="tabs">
          <button type="button" :class="{ active: filter === 'all' }" @click="filter = 'all'">Todos <span>{{ rows.length }}</span></button>
          <button type="button" :class="{ active: filter === 'pending' }" @click="filter = 'pending'">Sugeridos <span>{{ pendingCount }}</span></button>
          <button type="button" :class="{ active: filter === 'mapped' }" @click="filter = 'mapped'">Asociados <span>{{ mappedCount }}</span></button>
        </div>
        <label class="search">
          <LucideSearch :size="17" />
          <input v-model="search" type="search" placeholder="Buscar concepto, taller o servicio..." />
        </label>
      </div>

      <div v-if="loading && !payload" class="state"><LucideLoaderCircle :size="24" class="spin" /> Cargando...</div>
      <div v-else-if="error" class="state error"><LucideCircleAlert :size="21" /> {{ error }}</div>
      <div v-else-if="!visibleRows.length" class="state">No hay conceptos en esta vista.</div>

      <div v-else class="rows">
        <article v-for="row in visibleRows" :key="row.concepto_id" class="row" :class="{ mapped: row.global }">
          <div class="concept">
            <div class="concept-title"><span>#{{ row.concepto_id }}</span><strong>{{ row.concepto_nombre }}</strong></div>
            <div class="meta">
              <span v-if="row.global" class="pill mapped-pill"><LucideGlobe2 :size="12" /> Asociación GLOBAL</span>
              <span v-else-if="row.suggestion" class="pill suggestion-pill"><LucideSparkles :size="12" /> Sugerencia disponible</span>
              <span v-else class="pill">Sin asociación</span>
              <span v-if="row.overrides?.length" class="pill override-pill"><LucideBuilding2 :size="12" /> {{ row.overrides.length }} excepción{{ row.overrides.length === 1 ? '' : 'es' }}</span>
            </div>
            <div v-if="row.overrides?.length" class="overrides">
              <span v-for="override in row.overrides" :key="override.id">{{ override.plantel }} → {{ override.servicio_nombre }}</span>
            </div>
          </div>
          <div class="mapping">
            <label class="field">
              <span>Asociación global</span>
              <select :value="row.global?.servicio_clave || ''" :disabled="savingIds.has(row.concepto_id)" @change="saveFromSelect(row, $event)">
                <option value="">Sin asociación global</option>
                <option v-for="item in catalog" :key="item.clave" :value="item.clave">{{ item.nombre }}</option>
              </select>
            </label>
            <button v-if="row.suggestion && !row.global" class="btn suggest" type="button" :disabled="savingIds.has(row.concepto_id)" @click="saveMapping(row, row.suggestion.servicio_clave)">
              <LucideSparkles :size="15" /> Usar {{ row.suggestion.servicio_nombre }}
            </button>
            <button v-else-if="row.global" class="btn subtle" type="button" :disabled="savingIds.has(row.concepto_id)" @click="removeGlobal(row)">
              <LucideX :size="15" /> Quitar
            </button>
          </div>
        </article>
      </div>
    </section>

    <div v-if="showWorkshopModal" class="backdrop" @click.self="closeWorkshopModal">
      <form class="modal" role="dialog" aria-modal="true" aria-labelledby="new-workshop-title" @submit.prevent="createWorkshop">
        <div class="modal-title">
          <div><span class="eyebrow">CATÁLOGO INSTITUCIONAL</span><h2 id="new-workshop-title">Nuevo taller</h2></div>
          <button class="icon-btn" type="button" aria-label="Cerrar" :disabled="creatingWorkshop" @click="closeWorkshopModal"><LucideX :size="19" /></button>
        </div>
        <label class="field">
          <span>Nombre del taller</span>
          <input v-model="newWorkshopName" autofocus maxlength="160" placeholder="Ej. TEATRO" autocomplete="off" />
        </label>
        <p>Se guarda en el catálogo institucional y queda disponible de inmediato para asociarlo a un concepto financiero.</p>
        <div class="modal-actions">
          <button class="btn subtle" type="button" :disabled="creatingWorkshop" @click="closeWorkshopModal">Cancelar</button>
          <button class="btn primary" type="submit" :disabled="creatingWorkshop || !newWorkshopName.trim()">
            <LucideLoaderCircle v-if="creatingWorkshop" :size="17" class="spin" /><LucidePlus v-else :size="17" /> Agregar taller
          </button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup>
import { LucideBuilding2, LucideCircleAlert, LucideGlobe2, LucideLink2, LucideLoaderCircle, LucidePlus, LucideRefreshCw, LucideSearch, LucideSparkles, LucideTrash2, LucideX } from 'lucide-vue-next'
import { useActiveCiclo } from '~/composables/useActiveCiclo'
import { useToast } from '~/composables/useToast'
import { formatCicloLabel, normalizeCicloKey } from '~/shared/utils/ciclo'
import { normalizeServicioClave } from '~/shared/utils/talleresServicios'

const { show } = useToast()
const { activeCicloKey, setActiveCiclo } = useActiveCiclo()
const selectedCiclo = ref(normalizeCicloKey(activeCicloKey.value))
const payload = ref(null)
const loading = ref(false)
const error = ref('')
const search = ref('')
const filter = ref('all')
const savingIds = reactive(new Set())
const manualConceptId = ref('')
const manualServiceKey = ref('')
const manualServiceSearch = ref('')
const removingWorkshopKey = ref('')
const showAllPreview = ref(false)
const showWorkshopModal = ref(false)
const newWorkshopName = ref('')
const creatingWorkshop = ref(false)

const rows = computed(() => payload.value?.rows || [])
const catalog = computed(() => [...(payload.value?.catalog || [])].sort((a, b) => Number(a?.orden || 9999) - Number(b?.orden || 9999) || String(a?.nombre || '').localeCompare(String(b?.nombre || ''), 'es')))
const cycleOptions = computed(() => Array.from(new Set([selectedCiclo.value, ...(payload.value?.cycles || []).map(c => normalizeCicloKey(c?.cycle_name))])).filter(Boolean).sort((a, b) => b.localeCompare(a)).map(value => ({ value, label: formatCicloLabel(value) })))
const selectedManualRow = computed(() => rows.value.find(row => String(row.concepto_id) === String(manualConceptId.value)) || null)
const selectedManualService = computed(() => catalog.value.find(item => item.clave === manualServiceKey.value) || null)
const canSaveManual = computed(() => Boolean(selectedManualRow.value && manualServiceKey.value))
const pendingCount = computed(() => rows.value.filter(row => row.suggestion && !row.global).length)
const mappedCount = computed(() => rows.value.filter(row => row.global).length)
const previewCandidates = computed(() => {
  const items = payload.value?.preview?.conceptos || []
  return showAllPreview.value ? items : items.slice(0, 6)
})
const visibleRows = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase('es')
  return rows.value.filter(row => {
    if (filter.value === 'pending' && !(row.suggestion && !row.global)) return false
    if (filter.value === 'mapped' && !row.global) return false
    if (!needle) return true
    return [row.concepto_nombre, row.global?.servicio_nombre, row.suggestion?.servicio_nombre, ...(row.overrides || []).flatMap(o => [o.plantel, o.servicio_nombre])].filter(Boolean).join(' ').toLocaleLowerCase('es').includes(needle)
  })
})

const syncManualServiceFromSearch = () => {
  const needle = String(manualServiceSearch.value || '').trim().toLocaleLowerCase('es')
  const match = catalog.value.find(item => String(item?.nombre || '').trim().toLocaleLowerCase('es') === needle || String(item?.clave || '').trim().toLocaleLowerCase('es') === needle)
  manualServiceKey.value = match?.clave || ''
}

const load = async () => {
  loading.value = true
  error.value = ''
  try {
    payload.value = await $fetch('/api/conceptos-config/talleres-servicios', { query: { ciclo: selectedCiclo.value } })
    if (manualServiceKey.value && !catalog.value.some(item => item.clave === manualServiceKey.value)) {
      manualServiceKey.value = ''
      manualServiceSearch.value = ''
    }
  } catch (e) {
    error.value = e?.data?.message || e?.data?.statusMessage || 'No se pudieron cargar las asociaciones.'
  } finally {
    loading.value = false
  }
}

const saveMapping = async (row, key) => {
  if (!row || !key || savingIds.has(row.concepto_id)) return
  savingIds.add(row.concepto_id)
  try {
    await $fetch('/api/conceptos-config/talleres-servicios/mapping', { method: 'POST', body: { ciclo: selectedCiclo.value, concepto_id: row.concepto_id, servicio_clave: key } })
    show(`${row.concepto_nombre} asociado globalmente.`, 'success')
    await load()
  } catch (e) {
    show(e?.data?.message || 'No se pudo guardar la asociación.', 'danger')
  } finally {
    savingIds.delete(row.concepto_id)
  }
}
const saveManualAssociation = async () => {
  if (selectedManualRow.value && manualServiceKey.value) await saveMapping(selectedManualRow.value, manualServiceKey.value)
}
const saveFromSelect = async (row, event) => {
  const key = event?.target?.value || ''
  if (key) await saveMapping(row, key)
  else if (row.global) await removeGlobal(row)
}
const removeGlobal = async (row) => {
  if (!row?.global?.id || savingIds.has(row.concepto_id)) return
  savingIds.add(row.concepto_id)
  try {
    await $fetch(`/api/conceptos-config/mappings/${row.global.id}`, { method: 'DELETE' })
    show(`Se quitó la asociación GLOBAL de ${row.concepto_nombre}.`, 'success')
    await load()
    if (String(row.concepto_id) === String(manualConceptId.value)) manualServiceKey.value = ''
  } catch (e) {
    show(e?.data?.message || 'No se pudo quitar la asociación global.', 'danger')
  } finally {
    savingIds.delete(row.concepto_id)
  }
}

const removeWorkshop = async (item) => {
  if (!item?.clave || removingWorkshopKey.value) return
  if (!window.confirm(`Retirar ${item.nombre} del catálogo de talleres? Sus asociaciones activas también se deshabilitarán; el historial se conserva.`)) return
  removingWorkshopKey.value = item.clave
  try {
    await $fetch(`/api/conceptos-config/services/${encodeURIComponent(item.clave)}`, { method: 'DELETE' })
    if (manualServiceKey.value === item.clave) {
      manualServiceKey.value = ''
      manualServiceSearch.value = ''
    }
    show(`${item.nombre} retirado del catálogo.`, 'success')
    await load()
  } catch (e) {
    show(e?.data?.message || 'No se pudo retirar el taller.', 'danger')
  } finally {
    removingWorkshopKey.value = ''
  }
}

const openWorkshopModal = () => { newWorkshopName.value = ''; showWorkshopModal.value = true }
const closeWorkshopModal = () => { if (!creatingWorkshop.value) { showWorkshopModal.value = false; newWorkshopName.value = '' } }
const createWorkshop = async () => {
  const nombre = String(newWorkshopName.value || '').trim().replace(/\s+/g, ' ').toUpperCase()
  const clave = normalizeServicioClave(nombre)
  if (!clave || creatingWorkshop.value) return
  const existing = catalog.value.find(item => normalizeServicioClave(item?.clave || item?.nombre) === clave)
  if (existing) {
    manualServiceKey.value = existing.clave
    manualServiceSearch.value = existing.nombre
    show('Ese taller ya existe; quedó seleccionado para asociarlo.', 'success')
    closeWorkshopModal()
    return
  }
  creatingWorkshop.value = true
  try {
    await $fetch('/api/conceptos-config/services', { method: 'POST', body: { servicio_clave: clave, servicio_nombre: nombre, imagen_url: '/talleres-servicios/default.svg', orden: 9999 } })
    await load()
    manualServiceKey.value = clave
    manualServiceSearch.value = nombre
    show(`${nombre} agregado al catálogo.`, 'success')
    showWorkshopModal.value = false
    newWorkshopName.value = ''
  } catch (e) {
    show(e?.data?.message || 'No se pudo agregar el taller.', 'danger')
  } finally {
    creatingWorkshop.value = false
  }
}

watch(manualConceptId, () => {
  manualServiceKey.value = selectedManualRow.value?.global?.servicio_clave || ''
  manualServiceSearch.value = selectedManualRow.value?.global?.servicio_nombre || ''
})
watch(manualServiceKey, (value) => {
  if (!value) return
  const item = catalog.value.find(candidate => candidate.clave === value)
  if (item) manualServiceSearch.value = item.nombre
})
watch(selectedCiclo, async (value, previous) => {
  if (!value || value === previous) return
  setActiveCiclo(value)
  manualConceptId.value = ''
  manualServiceKey.value = ''
  manualServiceSearch.value = ''
  showAllPreview.value = false
  await load()
})
onMounted(load)
</script>

<style scoped>
.ts-admin{display:grid;gap:16px;width:100%}.card{background:#fff;border:1px solid #e3e9ef;border-radius:18px;box-shadow:0 8px 24px rgba(28,55,83,.055)}.hero{padding:22px 24px;display:flex;justify-content:space-between;gap:24px;align-items:center}.hero h1,.manual-title h2,.modal h2{margin:4px 0 6px;color:#17263a}.hero h1{font-size:clamp(1.45rem,2vw,2rem)}.hero p,.manual-title p,.suggestions p,.modal p{margin:0;color:#65758a;line-height:1.45}.eyebrow{color:#0b88b1;font-size:.68rem;font-weight:900;letter-spacing:.12em}.hero-actions{display:flex;align-items:end;gap:10px;flex-wrap:wrap;justify-content:flex-end}.field{display:grid;gap:5px}.field>span{font-size:.68rem;color:#718096;font-weight:800;text-transform:uppercase;letter-spacing:.07em}.field select,.field input{height:42px;border:1px solid #d5dfe9;border-radius:12px;background:#fff;padding:0 12px;color:#27374a;font-weight:700;outline:0;min-width:0}.field select:focus,.field input:focus{border-color:#77b9cb;box-shadow:0 0 0 3px rgba(11,136,177,.1)}.cycle-field select{min-width:175px}.service-search{height:42px;border:1px solid #d5dfe9;border-radius:12px;background:#fff;display:flex;align-items:center;gap:7px;padding:0 10px;color:#718096}.service-search:focus-within{border-color:#77b9cb;box-shadow:0 0 0 3px rgba(11,136,177,.1)}.service-search input{height:38px!important;border:0!important;box-shadow:none!important;padding:0!important;width:100%}.btn,.icon-btn{border:0;border-radius:12px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:42px;padding:0 15px}.btn:disabled,.icon-btn:disabled,select:disabled,input:disabled{opacity:.55;cursor:not-allowed}.primary{background:#55aa3e;color:#fff}.subtle{background:#f2f5f7;color:#697687}.btn.remove{background:#fff0ee;color:#a64038}.manual-card{padding:18px 20px;border-color:#cfe4d0;background:linear-gradient(135deg,#fbfffa,#fff 75%)}.manual-title{display:flex;justify-content:space-between;gap:16px;align-items:start;margin-bottom:15px}.manual-title h2{font-size:1.05rem}.manual-fields{display:grid;grid-template-columns:minmax(240px,1.5fr) minmax(210px,1fr) auto auto auto;gap:10px;align-items:end}.manual-fields select,.manual-fields .service-search{width:100%;box-sizing:border-box}.pill{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:4px 8px;background:#f2f4f6;color:#74808e;font-size:.68rem;font-weight:850;white-space:nowrap}.mapped-pill{background:#eaf8e8;color:#32853a}.suggestion-pill{background:#e9f7fd;color:#087fa7}.override-pill{background:#fff3df;color:#946507}.suggestions{padding:16px 20px;display:grid;grid-template-columns:auto 1fr;gap:12px;color:#0784ad;background:#fbfeff}.suggestion-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#1f3045}.suggestions p{font-size:.86rem;margin-top:3px}.preview{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.preview span,.preview button{border:0;border-radius:999px;padding:5px 8px;background:#eef7fb;color:#3d6273;font-size:.68rem;font-weight:750}.preview button{cursor:pointer;color:#087fa6}.association-card{overflow:hidden}.toolbar{padding:14px 16px;border-bottom:1px solid #e8edf2;display:flex;justify-content:space-between;gap:14px}.tabs{display:flex;gap:5px;background:#f4f7f9;padding:4px;border-radius:12px}.tabs button{border:0;background:transparent;color:#637287;border-radius:9px;padding:8px 12px;font-weight:800;cursor:pointer}.tabs button.active{background:#fff;color:#0b789d;box-shadow:0 2px 8px rgba(26,68,94,.09)}.tabs span{font-size:.68rem;opacity:.7}.search{min-width:min(390px,46vw);height:40px;border:1px solid #dce4eb;border-radius:12px;display:flex;align-items:center;gap:8px;padding:0 12px;color:#7a8797}.search input{border:0;outline:0;width:100%;background:transparent}.rows{display:grid}.row{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,440px);gap:24px;align-items:center;padding:15px 18px;border-bottom:1px solid #edf1f4}.row:last-child{border-bottom:0}.row.mapped{box-shadow:inset 3px 0 #62b966}.concept-title{display:flex;gap:8px;align-items:baseline}.concept-title span{color:#8b98a8;font-size:.7rem;font-weight:800}.concept-title strong{color:#26374b;font-size:.93rem}.meta,.overrides{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.overrides span{font-size:.67rem;color:#6e5a28;background:#fff9ed;border:1px solid #f2e5c8;border-radius:7px;padding:3px 6px}.mapping{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}.mapping select{width:100%}.suggest{background:#e7f7fd;color:#087ea5;white-space:nowrap}.state{min-height:170px;display:flex;align-items:center;justify-content:center;gap:8px;color:#738195}.state.error{color:#b24c4c}.backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:18px;background:rgba(19,35,50,.38);backdrop-filter:blur(4px)}.modal{width:min(520px,100%);box-sizing:border-box;background:#fff;border:1px solid #dfe7ec;border-radius:20px;box-shadow:0 24px 70px rgba(24,42,58,.22);padding:20px;display:grid;gap:17px}.modal-title{display:flex;justify-content:space-between;gap:14px}.modal-title h2{font-size:1.25rem}.icon-btn{width:38px;height:38px;min-height:38px;padding:0;background:#f3f5f7;color:#697687}.modal p{font-size:.82rem}.modal-actions{display:flex;justify-content:flex-end;gap:9px}.spin{animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:1180px){.manual-fields{grid-template-columns:1fr 1fr auto}.manual-fields .btn{width:100%}}@media(max-width:900px){.hero{align-items:stretch;flex-direction:column}.hero-actions{justify-content:flex-start}.toolbar{flex-direction:column}.search{min-width:0;width:100%;box-sizing:border-box}.row{grid-template-columns:1fr;gap:11px}}@media(max-width:620px){.hero,.manual-card,.suggestions{padding:16px}.hero-actions{display:grid;grid-template-columns:1fr 1fr}.cycle-field{grid-column:1/-1}.cycle-field select,.hero-actions .btn{width:100%}.manual-title{flex-direction:column}.manual-fields{grid-template-columns:1fr}.mapping{grid-template-columns:1fr}.mapping .btn{width:100%}.tabs{width:100%;overflow:auto;box-sizing:border-box}.tabs button{flex:1 0 auto}.modal-actions{display:grid;grid-template-columns:1fr 1fr}}
</style>