<template>
  <section class="share-manager" aria-label="Enlaces institucionales por concepto">
    <div class="share-heading">
      <div>
        <div class="share-eyebrow"><LucideGlobe2 :size="14" /> Vista institucional</div>
        <h3>Enlaces compartidos</h3>
      </div>
      <button type="button" class="share-secondary" :disabled="loading" @click="refreshLinks" title="Actualizar enlaces"><LucideRefreshCcw :size="17" /></button>
    </div>

    <div class="share-compose">
      <div class="share-main-fields">
        <label class="share-field share-concept">
          <span>Concepto</span>
          <input v-model="search" class="share-input share-search" placeholder="Buscar concepto" aria-label="Buscar concepto">
          <select v-model.number="form.conceptoId" class="share-input" aria-label="Concepto para compartir">
            <option :value="0">Seleccionar concepto</option>
            <option v-for="item in filteredConcepts" :key="item.id" :value="Number(item.id)">{{ item.concepto }}</option>
          </select>
        </label>
        <label class="share-field">
          <span>Reporte</span>
          <select v-model="form.modo" class="share-input">
            <option value="movements">Con concepto</option>
            <option value="missing">Sin concepto</option>
            <option value="debtors">Deudores</option>
          </select>
        </label>
        <label class="share-field">
          <span>Vigencia</span>
          <select v-model.number="form.expiryDays" class="share-input">
            <option :value="7">7 días</option>
            <option :value="30">30 días</option>
            <option :value="90">90 días</option>
            <option :value="365">1 año</option>
          </select>
        </label>
        <button type="button" class="share-create" :disabled="creating || !form.conceptoId || !form.planteles.length" @click="create">
          <LucideLoaderCircle v-if="creating" class="animate-spin" :size="16" />
          <LucideLink2 v-else :size="16" />
          Crear enlace
        </button>
      </div>
      <div class="share-details">
        <label v-if="form.modo !== 'movements'" class="share-field share-compact"><span>Ciclo</span><input v-model="form.ciclo" class="share-input" placeholder="2026"></label>
        <template v-if="form.modo === 'movements'">
          <label class="share-field share-compact"><span>Desde</span><input v-model="form.inicio" type="date" class="share-input"></label>
          <label class="share-field share-compact"><span>Hasta</span><input v-model="form.fin" type="date" class="share-input"></label>
        </template>
        <label v-if="form.modo === 'debtors'" class="share-field share-compact"><span>Umbral</span><input v-model.number="form.threshold" type="number" min="0" step="0.01" class="share-input"></label>
        <div class="share-campus">
          <div class="share-campus-title"><span>Planteles</span><button type="button" @click="toggleAll">{{ form.planteles.length === PLANTELES.length ? 'Quitar todos' : 'Todos' }}</button></div>
          <div class="share-campus-options">
            <label v-for="campus in PLANTELES" :key="campus" class="share-campus-chip">
              <input v-model="form.planteles" type="checkbox" :value="campus">
              {{ campus }}
            </label>
          </div>
        </div>
      </div>
      <p v-if="errorMessage" class="share-error" role="alert">{{ errorMessage }}</p>
      <p class="share-privacy"><LucideShieldCheck :size="14" /> Quien tenga el enlace podrá consultar y exportar nombres, matrículas y datos académicos de los planteles elegidos.</p>
    </div>

    <div class="share-list">
      <div class="share-list-top"><span>Enlaces creados</span><span>{{ links.length }}</span></div>
      <div v-if="loading" class="share-empty">Cargando enlaces…</div>
      <div v-else-if="!links.length" class="share-empty">Todavía no hay enlaces compartidos.</div>
      <div v-for="item in links" :key="item.id" class="share-item">
        <div class="share-item-text">
          <strong>{{ conceptName(item.conceptoId) }}</strong>
          <span>{{ modeName(item.modo) }} · {{ item.planteles.join(', ') }} · {{ item.ciclo }}</span>
          <small>{{ item.revokedAt ? 'Revocado' : expired(item) ? 'Vencido' : 'Válido hasta ' + formatDate(item.expiresAt) }}</small>
        </div>
        <div class="share-item-actions">
          <button type="button" class="share-secondary" :disabled="!!item.revokedAt || expired(item)" @click="copy(item)" title="Copiar enlace"><LucideCopy :size="16" /><span>Copiar</span></button>
          <a :href="urlFor(item)" target="_blank" rel="noopener noreferrer" class="share-secondary" :aria-disabled="!!item.revokedAt || expired(item)" title="Abrir reporte"><LucideExternalLink :size="16" /></a>
          <button v-if="!item.revokedAt && !expired(item)" type="button" class="share-revoke" :disabled="revokingId===item.id" @click="revoke(item)" title="Revocar enlace"><LucideLink2Off :size="16" /></button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Globe2 as LucideGlobe2, RefreshCcw as LucideRefreshCcw, LoaderCircle as LucideLoaderCircle, Link2 as LucideLink2, ShieldCheck as LucideShieldCheck, Copy as LucideCopy, ExternalLink as LucideExternalLink, Link2Off as LucideLink2Off } from 'lucide-vue-next'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { CONCEPTOS_PLANTELES_LIST } from '~/utils/constants'

const props = defineProps<{ concepts: Array<{id: number | string, concepto: string}>, ciclo: string }>()
const PLANTELES = CONCEPTOS_PLANTELES_LIST
const form = reactive({ conceptoId: 0, modo: 'movements', ciclo: props.ciclo, inicio: '', fin: '', threshold: 0, expiryDays: 30, planteles: [...PLANTELES] })
watch(() => props.ciclo, value => { if (value) form.ciclo = value })
const search = ref('')
const loading = ref(false)
const creating = ref(false)
const revokingId = ref('')
const errorMessage = ref('')
const links = ref<any[]>([])
const filteredConcepts = computed(() => {
  const searchKey = search.value.trim().toLocaleLowerCase('es')
  const current = props.concepts.filter(item => Number(item.id)===Number(form.conceptoId))
  const matches = props.concepts.filter(item => !searchKey || String(item.concepto || '').toLocaleLowerCase('es').includes(searchKey))
  return [...new Map([...current,...matches].map(item=>[Number(item.id), item])).values()].slice(0,200)
})
const urlFor = (item:any) => (import.meta.client ? window.location.origin : 'https://aurora.casitaiedis.edu.mx') + '/compartido/concepto/' + encodeURIComponent(item.id)
const modeName = (mode:string) => ({movements:'Con concepto',missing:'Sin concepto',debtors:'Deudores'} as Record<string,string>)[mode] || mode
const conceptName = (id:number) => props.concepts.find(item => Number(item.id)===Number(id))?.concepto || 'Concepto #' + id
const expired = (item:any) => Boolean(item.expiresAt && Date.parse(item.expiresAt) <= Date.now())
const formatDate = (value:string) => value ? new Date(value).toLocaleDateString('es-MX') : '—'
const apiError = (err:any) => String(err?.data?.message || err?.response?._data?.message || err?.message || 'No se pudo completar la operación.')

async function refreshLinks() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result:any = await $fetch('/api/reports/shared-links')
    links.value = result.links || []
  } catch (err) { errorMessage.value = apiError(err) }
  finally { loading.value = false }
}
function toggleAll() { form.planteles = form.planteles.length === PLANTELES.length ? [] : [...PLANTELES] }
async function copy(item:any) {
  try {
    await navigator.clipboard.writeText(urlFor(item))
  } catch { errorMessage.value = 'El navegador no permitió copiar el enlace.' }
}
async function create() {
  if (!form.conceptoId || !form.planteles.length || creating.value) return
  creating.value = true
  errorMessage.value = ''
  try {
    const value:any = await $fetch('/api/reports/shared-links', { method:'POST', body:{ ...form } })
    await refreshLinks()
    if (value.id) await copy({id:value.id})
  } catch(err) { errorMessage.value = apiError(err) }
  finally { creating.value = false }
}
async function revoke(item:any) {
  if (!confirm('¿Revocar el enlace público? Ya no podrá consultarse ni descargar su Excel.')) return
  revokingId.value = item.id
  errorMessage.value = ''
  try { await $fetch('/api/reports/shared-links/' + encodeURIComponent(item.id), { method:'DELETE' }); await refreshLinks() }
  catch(err) { errorMessage.value = apiError(err) }
  finally { revokingId.value = '' }
}
onMounted(refreshLinks)
</script>

<style scoped>
.share-manager{background:#fff;border:1px solid #e1e9e7;border-radius:18px;margin:16px 0;padding:20px;box-shadow:0 5px 24px rgba(27,54,46,.04);font-family:Montserrat,sans-serif}
.share-heading,.share-list-top,.share-campus-title{display:flex;justify-content:space-between;align-items:center;gap:12px}
.share-eyebrow{display:flex;gap:6px;align-items:center;color:#66877c;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}
.share-heading h3{font-family:Fredoka,sans-serif;font-size:23px;margin:3px 0 0;color:#173d32}
.share-compose{margin-top:18px}
.share-main-fields{display:grid;grid-template-columns:minmax(200px,2fr) minmax(130px,1fr) minmax(105px,.7fr) auto;gap:10px;align-items:end}
.share-field{display:flex;flex-direction:column;gap:5px;min-width:0;font-size:11px;font-weight:700;color:#667d75}
.share-input{width:100%;background:#fbfcfb;color:#173e34;border:1px solid #d6e2db;border-radius:10px;font-size:12px;padding:9px 10px;min-height:38px}
.share-search{min-height:31px;padding:5px 10px}
.share-create{display:flex;gap:7px;align-items:center;justify-content:center;background:#205641;color:#fff;padding:10px 16px;border-radius:10px;font-weight:700;font-size:12px;min-height:38px}
.share-create:disabled{opacity:.5;cursor:not-allowed}
.share-details{display:flex;align-items:end;gap:12px;margin-top:12px;flex-wrap:wrap}
.share-compact{width:145px}
.share-campus{flex:1;min-width:250px}
.share-campus-title{font-size:11px;font-weight:700;color:#667d75;margin-bottom:7px}
.share-campus-title button{color:#257359;text-decoration:underline}
.share-campus-options{display:flex;flex-wrap:wrap;gap:5px}
.share-campus-chip{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#385e4d;border:1px solid #d9e5df;padding:5px 8px;border-radius:8px}
.share-campus-chip:has(input:checked){background:#eef8f1;border-color:#96c8a8}
.share-campus-chip input{accent-color:#205641}
.share-privacy{display:flex;align-items:center;gap:7px;margin-top:12px;color:#788b83;font-size:10px}
.share-error{font-size:12px;color:#a52f2f;padding:10px 0}
.share-list{border-top:1px solid #edf1ee;margin-top:17px;padding-top:14px}
.share-list-top{font-size:12px;font-weight:700;color:#46685a}
.share-list-top span:last-child{background:#edf5f0;border-radius:12px;padding:3px 8px}
.share-empty{color:#8b9a91;font-size:12px;padding:16px 0}
.share-item{display:flex;gap:15px;align-items:center;justify-content:space-between;border-bottom:1px solid #f1f4f2;padding:12px 0}
.share-item-text{display:flex;flex-direction:column;gap:3px;min-width:0}
.share-item-text strong{color:#26473a;font-size:13px}
.share-item-text span,.share-item-text small{color:#7e9288;font-size:11px;line-height:1.4;overflow-wrap:anywhere}
.share-item-actions{display:flex;gap:7px;align-items:center;flex-shrink:0}
.share-secondary{display:flex;gap:6px;align-items:center;justify-content:center;padding:8px 10px;border:1px solid #dfeae3;border-radius:9px;color:#346d56;background:#fff;font-size:11px;font-weight:700}
.share-secondary:disabled{opacity:.4}
.share-revoke{color:#a65d55;border:1px solid #f0d8d5;border-radius:9px;padding:8px}
@media(max-width:850px){.share-main-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.share-create{width:100%}}
@media(max-width:520px){.share-manager{padding:14px}.share-main-fields{grid-template-columns:1fr}.share-item{align-items:flex-start;flex-direction:column}.share-item-actions{width:100%}.share-campus{min-width:0}.share-compact{flex:1}}
</style>
