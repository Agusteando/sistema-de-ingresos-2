<template>
  <section class="change-workspace" :class="{'detail-open':Boolean(selected||fieldTarget)}" aria-label="Historial de cambios" @keydown.esc="clearSelection">
    <div class="audit-overview">
      <header class="change-header">
        <div class="heading-copy"><span>Control Escolar</span><h1>Historial de cambios</h1></div>
        <div class="inline-summary" aria-live="polite"><template v-if="busy">Cargando…</template><template v-else><strong>{{ filteredEvents.length }}</strong> {{ filteredEvents.length===1?'cambio':'cambios' }}<span>·</span>{{ studentCount }} {{ studentCount===1?'alumno':'alumnos' }}</template></div>
      </header>
      <div class="audit-toolbar">
        <label class="campus-control"><span>Plantel</span><SearchableSelect v-model="plantel" :options="campusOptions" :clearable="false" accessible-label="Filtrar plantel" search-placeholder="Buscar plantel…" /></label>
        <label class="audit-search-control"><span>Buscar</span><span class="audit-search"><LucideSearch :size="18"/><input v-model="search" type="search" aria-label="Buscar persona o alumno" placeholder="Persona o alumno" /></span></label>
        <button class="refresh-button" type="button" :disabled="busy" @click="refreshAll"><LucideRefreshCw :size="18" :class="{spinning:busy}"/><span>Actualizar</span></button>
      </div>
      <div class="filter-band">      <div class="source-legend" aria-label="Filtrar cambios por origen">
        <button type="button" :aria-pressed="source==='ALL'" :class="{selected:source==='ALL'}" @click="chooseSource('ALL')">Todos</button>
        <button v-for="system in visibleSources" :key="system" type="button" :class="[sourceClass(system),{selected:source===system}]" :aria-pressed="source===system" @click="chooseSource(system)"><i></i><span class="desktop-label">{{ system==='Husky Pass'?'Husky Pass · Familias':system==='Aurora'?'Aurora · Escuela':'Otros' }}</span><span class="mobile-label">{{ system==='Husky Pass'?'Familias':system==='Aurora'?'Escuela':'Otros' }}</span><b>{{ busy?'…':systemCount(system) }}</b></button>
      </div>
      <div class="period-area">
        <div class="period-buttons" role="group" aria-label="Periodo"><button v-for="daysCount in [7,30,90]" :key="daysCount" type="button" :aria-pressed="range===String(daysCount)" :class="{selected:range===String(daysCount)}" @click="setRange(String(daysCount))">{{ daysCount }} días</button></div>
        <button type="button" class="date-range" :aria-expanded="showDatePicker" @click="toggleDates"><LucideCalendarDays :size="17"/><span class="desktop-label">{{ dateRangeLabel }}</span><span class="mobile-label">Fechas</span><LucideChevronDown :size="15"/></button>
        <button v-if="hasFilters" type="button" class="text-button reset-button" @click="resetFilters">Limpiar filtros</button>
      </div>
</div>
      <div v-if="showDatePicker" class="custom-dates"><label>Desde<input v-model="customFrom" type="date" :max="customTo"/></label><label>Hasta<input v-model="customTo" type="date" :min="customFrom" :max="today"/></label></div>
      <div v-if="!validDates" class="status-notice" role="alert">Selecciona un periodo de hasta 90 días.</div>
      <div v-if="queryError || historyUnavailable" class="status-notice" role="alert" :data-request-id="historyRequestId"><span>{{ queryError?'No se pudo cargar el historial.':'No se pudo cargar parte del historial.' }}</span><button type="button" class="text-button" :disabled="busy" @click="refreshAll">Reintentar</button><small v-if="historyRequestId">Ref. {{ historyRequestId }}</small></div>
      <div v-if="history?.partial || data?.truncated || history?.truncated" class="status-notice" role="status">Faltan cambios por mostrar.<button type="button" class="text-button" @click="refreshAll">Reintentar</button></div>
      <div class="chart-toolbar"><span>Más recientes primero</span><nav class="chart-nav" aria-label="Recorrer fechas"><button type="button" :disabled="!canSeeNewer" @click="moveChart(-1)"><LucideChevronLeft :size="16"/><span>Más recientes</span></button><button type="button" :disabled="!canSeeOlder" @click="moveChart(1)"><span>Más antiguas</span><LucideChevronRight :size="16"/></button></nav></div>
      <div v-if="!busy && !queryError && !historyUnavailable && !filteredEvents.length" class="empty-result" role="status"><LucideInbox :size="22"/><strong>{{ hasFilters?'Sin cambios con estos filtros':'Sin cambios en este periodo' }}</strong><button v-if="hasFilters" type="button" class="text-button" @click="resetFilters">Limpiar filtros</button></div>
      <div ref="matrixScroller" class="matrix-scroll" @scroll="updateScrollBounds" tabindex="0" aria-label="Cambios por campo y fecha" :aria-busy="busy">
        <div class="matrix-grid" :style="{'--day-count':String(days.length)}">
          <div class="matrix-corner">Campo</div><div class="total-heading" aria-label="Total de cambios">Total</div>
          <div v-for="day in days" :key="'day-'+day.key" class="day-heading" :class="{'is-today':day.isToday}" :data-date="day.key"><span>{{ day.isToday?'Hoy':day.weekday }}</span><strong>{{ day.label }}</strong></div>
          <template v-for="category in categories" :key="category.key">
            <button type="button" class="field-heading" :class="{chosen:selected?.category===category.key&&!selected?.day}" :aria-pressed="selected?.category===category.key&&!selected?.day" @mousedown.prevent="focusMatrixButton" @click="selectField(category.key)"><span>{{ category.label }}</span><LucideChevronRight :size="14"/></button>
            <div class="field-total"><span>{{ countCategory(category.key) }}</span></div>
            <button v-for="day in days" :key="category.key+'-'+day.key" type="button" class="matrix-cell" :class="{active:selected?.category===category.key&&selected?.day===day.key,filled:cell(category.key,day.key).length>0}" :aria-pressed="selected?.category===category.key&&selected?.day===day.key" :aria-controls="inspectorId" :aria-label="category.label+' '+day.label+', '+cell(category.key,day.key).length+' cambios'" @mousedown.prevent="focusMatrixButton" @click="selectCell(category.key,day.key)">
              <template v-if="cell(category.key,day.key).length"><span class="cell-number"><strong>{{ cell(category.key,day.key).length }}</strong> {{ cell(category.key,day.key).length===1?'cambio':'cambios' }}<LucideChevronRight :size="15"/></span>
                <span v-for="actor in cellActors(category.key,day.key)" :key="actor.key" class="mini-actor"><AuditActorAvatar :src="actor.avatar" :name="actor.name" :source="actor.source" :email="actor.email"/><span class="identity-copy"><span class="mini-name">{{ actor.source==='Husky Pass'?'Familias':actor.name }}</span><span class="cell-source" :class="sourceClass(actor.source)">{{ actor.source==='Otro'?'Otros':actor.source }}</span></span></span>
              </template><span v-else class="no-change">—</span>
            </button>
          </template>
        </div>
      </div>
      <div v-if="busy && !filteredEvents.length" class="loading-line" role="status"><LucideRefreshCw class="spinning" :size="18"/>Cargando cambios…</div>
    </div>
    <aside :id="inspectorId" class="audit-inspector" aria-label="Detalle de cambios">
      <AuditFieldHistory v-if="fieldTarget" :record="fieldTarget" @close="closeFieldHistory"/><template v-else><header class="detail-header"><button v-if="selected" type="button" class="mobile-back" @click="clearSelection"><LucideChevronLeft :size="18"/>Volver al historial</button><div class="detail-title"><div><span class="detail-eyebrow">{{ selected?'Selección':'Última actividad' }}</span><h2>{{ selectionTitle }}</h2><span class="detail-count">{{ selectedEvents.length }} {{ selectedEvents.length===1?'cambio':'cambios' }}</span></div><button v-if="selected" class="clear-selection" type="button" aria-label="Ver todos los cambios" @click="clearSelection"><LucideX :size="16"/>Ver todos</button></div></header>
      <div ref="detailRecords" class="detail-records" :aria-busy="busy"><AuditChangeCard v-for="record in selectedEvents.slice(0,detailCount)" :key="record.id" :record="record" @history="openFieldHistory(record)"/><div v-if="!selectedEvents.length" class="empty-area"><LucideInbox :size="28"/><strong>{{ busy?'Cargando cambios…':historyUnavailable?'Historial pendiente de cargar':'Sin cambios en esta selección' }}</strong></div><button v-if="selectedEvents.length>detailCount" type="button" class="load-more" @click="detailCount+=30">Ver más cambios ({{ selectedEvents.length-detailCount }})</button></div>
    </template></aside>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount, useId } from 'vue'
import SearchableSelect from '~/components/SearchableSelect.vue'
import AuditActorAvatar from './AuditActorAvatar.vue'
import AuditChangeCard from './AuditChangeCard.vue'
import AuditFieldHistory from './AuditFieldHistory.vue'
import {
  LucideRefreshCw,
  LucideCalendarDays, LucideChevronLeft, LucideChevronRight, LucideChevronDown, LucideSearch, LucideInbox, LucideX
} from 'lucide-vue-next'

type Change = {
  id:string; eventId:number; date:string; recordedAt:string; matricula:string; student:string
  field:string; fieldLabel:string; category:string; before:string|null; after:string|null
  source:string; actor:string; actorEmail:string; avatar:string; flow:string
  quality:'verified'|'historical'; plantel:string; ciclo:string
}
type MainResponse={categories:{key:string;label:string}[];allowedPlanteles:string[];events:Change[];truncated:boolean}
type HistoryResponse={events:Change[];available:boolean;truncated:boolean;partial?:boolean;requestId?:string}
type AvatarActor={key:string;name:string;source:string;avatar:string;email:string}
const todayParts = new Intl.DateTimeFormat('en-US',{
  timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'
}).formatToParts(new Date())
const todayPart = (type:string) => todayParts.find(p=>p.type===type)?.value||''
const today = todayPart('year')+'-'+todayPart('month')+'-'+todayPart('day')
const shift = (date:string,amount:number) => {
  const value=new Date(date+'T12:00:00Z')
  if (!Number.isFinite(value.getTime())) return date
  value.setUTCDate(value.getUTCDate()+amount)
  return value.toISOString().slice(0,10)
}
const range=ref('7')
const showDatePicker=ref(false)
const customFrom=ref(shift(today,-6))
const customTo=ref(today)
const plantel=ref('ALL')
const source=ref('ALL')
const search=ref('')
const fieldTarget=ref<Change|null>(null)
let previousDetailScroll=0
const openFieldHistory=(record:Change)=>{previousDetailScroll=detailRecords.value?.scrollTop||0;fieldTarget.value=record}
const closeFieldHistory=async()=>{const id=fieldTarget.value?.id;fieldTarget.value=null;await nextTick();if(detailRecords.value){const card=[...detailRecords.value.querySelectorAll<HTMLElement>('[data-record-id]')].find(el=>el.dataset.recordId===id);card?.querySelector<HTMLElement>('.field-history-link')?.focus({preventScroll:true});detailRecords.value.scrollTop=previousDetailScroll}}
const selected=ref<{category:string;day?:string}|null>(null)
const detailCount=ref(30)
const detailRecords=ref<HTMLElement|null>(null)
const inspectorId='audit-inspector-'+useId()
const matrixScroller=ref<HTMLElement|null>(null)
const canSeeNewer=ref(false)
const canSeeOlder=ref(false)
let scrollerObserver:ResizeObserver|null=null
const updateScrollBounds=()=>{const el=matrixScroller.value;if(!el)return;canSeeNewer.value=el.scrollLeft>1;canSeeOlder.value=el.scrollLeft+el.clientWidth<el.scrollWidth-1}
const from=computed(()=>range.value==='custom'?customFrom.value:shift(today,1-Number(range.value)))
const to=computed(()=>range.value==='custom'?customTo.value:today)
const validDates=computed(()=>{
  const delta=new Date(to.value+'T00:00:00Z').getTime()-new Date(from.value+'T00:00:00Z').getTime()
  return /^\d{4}-\d{2}-\d{2}$/.test(from.value)&&/^\d{4}-\d{2}-\d{2}$/.test(to.value)&&delta>=0&&delta<=92*86400000
})
const fetchQuery=computed(()=>({
  from:validDates.value?from.value:shift(today,-6),
  to:validDates.value?to.value:today,
  plantel:plantel.value
}))
const {data,status,error,refresh}=useFetch<MainResponse>('/api/control-escolar/audit/changes',{
  query:fetchQuery,server:false,cache:'no-store',default:()=>({categories:[],allowedPlanteles:[],events:[],truncated:false})
})
const {data:history,status:historyStatus,error:historyError,refresh:refreshHistory}=useFetch<HistoryResponse>('/api/control-escolar/audit/history',{
  query:fetchQuery,server:false,cache:'no-store',default:()=>({events:[],available:true,truncated:false})
})
const busy=computed(()=>status.value==='pending'||historyStatus.value==='pending')
const queryError=computed(()=>Boolean(error.value))
const historyRequestId=computed(()=>history.value?.requestId||(historyError.value?.data as any)?.data?.requestId||'')
const historyUnavailable=computed(()=>Boolean(historyError.value)||history.value?.available===false)
const systemCount=(system:string)=>{
  const count=baseEvents.value.filter(e=>e.source===system).length
  return !count&&historyUnavailable.value&&system!=='Otro'?'—':count
}

const visibleSources=computed(()=>['Aurora','Husky Pass',...(baseEvents.value.some(e=>e.source==='Otro')||source.value==='Otro'?['Otro']:[])])
const campusOptions=computed(()=>[{value:'ALL',label:'Todos mis planteles'},...campuses.value.map(code=>({value:code,label:campusLabel(code),search:code}))])
const campuses=computed(()=>data.value?.allowedPlanteles||[])
const campusLabel=(code:string)=>({
  PM:'Primaria Metepec',PT:'Primaria Toluca',SM:'Secundaria Metepec',ST:'Secundaria Toluca',
  CM:'Casita Metepec',CT:'Casita Toluca',DM:'Desarrollo Metepec',GM:'Guardería Metepec',
  PREEM:'Preescolar Metepec',PREET:'Preescolar Toluca'
} as Record<string,string>)[code]||code
const categories=computed(()=>data.value?.categories?.length?data.value.categories:[
  {key:'grupo',label:'Grupo'},{key:'nombre',label:'Nombre'},{key:'grado',label:'Grado'},
  {key:'estatus',label:'Estatus'},{key:'contacto',label:'Contacto'},
  {key:'trabajo',label:'Lugares de trabajo'},{key:'otros',label:'Otros campos'}
])
const allEvents=computed(()=>{
  const stored=data.value?.events||[]
  const external=history.value?.events||[]
  const result=[...stored]
  for (const entry of external){
    const overlap=stored.some(s=>s.matricula===entry.matricula&&s.source===entry.source
      &&s.category===entry.category&&Math.abs(new Date(s.recordedAt.replace(' ','T')+'-06:00').getTime()-new Date(entry.recordedAt.replace(' ','T')+'-06:00').getTime())<120000)
    if(!overlap) result.push(entry)
  }
  return result.sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt))
})
const baseEvents=computed(()=>allEvents.value.filter(e=>{
  if(e.date<from.value||e.date>to.value)return false
  if(plantel.value!=='ALL'&&e.plantel!==plantel.value)return false
  const q=search.value.trim().toLowerCase()
  return !q||[e.student,e.matricula,e.actor,e.actorEmail,e.fieldLabel].join(' ').toLowerCase().includes(q)
}))
const filteredEvents=computed(()=>baseEvents.value.filter(e=>source.value==='ALL'||e.source===source.value))
const days=computed(()=>{
  if(!validDates.value)return []
  const duration=Math.round((new Date(to.value+'T12:00:00Z').getTime()-new Date(from.value+'T12:00:00Z').getTime())/86400000)+1
  return Array.from({length:duration},(_,i)=>{
    const key=shift(to.value,-i)
    const date=new Date(key+'T12:00:00Z')
    return {key,label:new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',timeZone:'UTC'}).format(date),
      isToday:key===today,weekday:new Intl.DateTimeFormat('es-MX',{weekday:'short',timeZone:'UTC'}).format(date)}
  })
})
const indexed=computed(()=>{
  const groups=new Map<string,Change[]>()
  for(const item of filteredEvents.value){
    const key=item.category+'|'+item.date
    if(!groups.has(key))groups.set(key,[])
    groups.get(key)!.push(item)
  }
  return groups
})
const cell=(category:string,day:string)=>indexed.value.get(category+'|'+day)||[]
const cellActors=(category:string,day:string):AvatarActor[]=>{
  const unique=new Map<string,AvatarActor>()
  for(const entry of cell(category,day)){
    const name=entry.source==='Husky Pass'?'Husky Pass · Familia':entry.actor
    const key=entry.source+'|'+(entry.actorEmail||name)
    if(!unique.has(key)||(!unique.get(key)?.avatar&&entry.avatar))unique.set(key,{key,name,source:entry.source,avatar:entry.avatar,email:entry.actorEmail})
  }
  return [...unique.values()]
}
const countCategory=(category:string)=>filteredEvents.value.filter(e=>e.category===category).length
const studentCount=computed(()=>new Set(filteredEvents.value.map(e=>e.matricula)).size)
const dayLabel=(value:string)=>new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'))
const dateRangeLabel=computed(()=>validDates.value?dayLabel(from.value)+' – '+dayLabel(to.value):'Fechas')
const selectionTitle=computed(()=>{
  if(!selected.value)return 'Cambios recientes'
  const label=categories.value.find(c=>c.key===selected.value?.category)?.label||'Cambios'
  return label+(selected.value.day?' · '+dayLabel(selected.value.day):'')
})
const selectedEvents=computed(()=>filteredEvents.value.filter(e=>
  !selected.value||(e.category===selected.value.category&&(!selected.value.day||e.date===selected.value.day))
))
const focusMatrixButton=(event:MouseEvent)=>(event.currentTarget as HTMLElement)?.focus({preventScroll:true})
const selectCell=(category:string,day:string)=>{selected.value=selected.value?.category===category&&selected.value?.day===day?null:{category,day}}
const selectField=(category:string)=>{selected.value=selected.value?.category===category&&!selected.value.day?null:{category}}
const sourceClass=(value:string)=>value==='Aurora'?'aurora':value==='Husky Pass'?'husky':'other'
const setRange=(value:string)=>{if(value==='custom'&&range.value!=='custom'){customFrom.value=from.value;customTo.value=to.value}range.value=value;if(value!=='custom')showDatePicker.value=false}
const toggleDates=()=>{if(showDatePicker.value){showDatePicker.value=false;return}setRange('custom');showDatePicker.value=true}
const resetFilters=()=>{search.value='';source.value='ALL';plantel.value='ALL'}
const refreshAll=()=>{refresh();refreshHistory()}
const chooseSource=(value:string)=>{source.value=value}
const hasFilters=computed(()=>source.value!=='ALL'||plantel.value!=='ALL'||Boolean(search.value.trim()))
const moveChart=(direction:number)=>{matrixScroller.value?.scrollBy({left:direction*450,behavior:'smooth'})}
const scrollToLatest=async()=>{await nextTick();if(matrixScroller.value)matrixScroller.value.scrollLeft=0;updateScrollBounds()}
onMounted(()=>{scrollToLatest();if(matrixScroller.value){scrollerObserver=new ResizeObserver(updateScrollBounds);scrollerObserver.observe(matrixScroller.value)}})
onBeforeUnmount(()=>scrollerObserver?.disconnect())
watch([from,to,plantel],()=>{selected.value=null;detailCount.value=30;scrollToLatest()})

watch([search,source],()=>{detailCount.value=30;selected.value=null})
const clearSelection=()=>{if(fieldTarget.value){void closeFieldHistory();return}selected.value=null}
watch(selected,async()=>{detailCount.value=30;await nextTick();detailRecords.value?.scrollTo({top:0})})
</script>

<style scoped>
.change-workspace{--green:#00692f;--blue:#2563b8;display:grid;grid-template-columns:minmax(0,1fr) clamp(330px,28%,420px);min-width:0;width:100%;height:100%;min-height:0;color:var(--ink,#162641);background:#fff;border:1px solid #dce5e1;border-radius:16px;overflow:hidden;font-family:var(--font-body);font-size:16px;line-height:1.4}
.change-workspace *{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:disabled{opacity:.5;cursor:wait}button:focus-visible,input:focus-visible,.matrix-scroll:focus-visible{outline:3px solid #62a88b;outline-offset:2px}.audit-overview{display:flex;flex-direction:column;gap:12px;padding:20px;min-width:0;min-height:0;overflow:auto}.change-header{display:flex;justify-content:space-between;align-items:center;gap:16px}.heading-copy>span,.detail-eyebrow{font-size:13px;color:#64776f;font-weight:550}.heading-copy h1{font-family:var(--font-display);font-size:28px;font-weight:600;line-height:1.15;margin:3px 0 0}.inline-summary{display:flex;align-items:baseline;gap:5px;white-space:nowrap;color:#5e716b;font-size:14px}.inline-summary strong{font-size:22px;color:#183c2b;font-weight:650}.inline-summary>span{padding:0 3px}.audit-toolbar{display:flex;gap:12px;align-items:end}.campus-control{flex:1;min-width:180px}.audit-search-control{flex:1.4;min-width:180px}.campus-control,.audit-search-control{display:grid;gap:5px}.campus-control>span,.audit-search-control>span:first-child{font-size:14px;font-weight:550;color:#4a6056}.campus-control :deep(.searchable-select__trigger){height:44px;border-radius:9px;font-size:15px;font-weight:550}.audit-search{display:flex;align-items:center;gap:8px;height:44px;padding:0 12px;border:1px solid #dce5e1;border-radius:9px;color:#75877e;background:#fff}.audit-search input{width:100%;min-width:0;height:100%;border:0;background:transparent;outline:0;color:#203b2d;font-size:15px}.refresh-button{display:flex;align-items:center;justify-content:center;gap:7px;height:44px;padding:0 12px;white-space:nowrap;border:1px solid #dce5e1;border-radius:9px;background:#fff;color:#285f42;font-size:14px;font-weight:550}
.filter-band{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.period-area{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.period-buttons{display:flex;border:1px solid #dce5e1;border-radius:9px;background:#f6f8f7;padding:3px;gap:2px}.period-buttons button{border:0;border-radius:6px;background:transparent;color:#586e62;font-size:14px;padding:7px 11px;min-height:34px}.period-buttons .selected{background:#fff;color:var(--green);box-shadow:0 1px 4px #183b2c18;font-weight:650}.date-range{display:flex;align-items:center;gap:7px;background:#fff;border:1px solid #dce5e1;border-radius:9px;padding:9px 11px;min-height:42px;color:#355443;font-size:14px}.text-button{background:transparent;border:0;color:var(--green);font-size:14px;font-weight:550;padding:6px;min-height:36px;text-decoration:underline}.reset-button{margin-left:auto}.custom-dates{display:flex;gap:12px;flex-wrap:wrap}.custom-dates label{display:grid;gap:4px;flex:1;font-size:14px}.custom-dates input{width:100%;min-width:140px;border:1px solid #dce5e1;border-radius:9px;padding:9px;min-height:44px}.source-legend{display:flex;gap:6px;flex-wrap:wrap;padding-bottom:0}.source-legend button{display:flex;align-items:center;gap:6px;border:1px solid transparent;border-radius:8px;background:#f5f7f6;color:#53685d;min-height:36px;padding:6px 10px;font-size:13px;font-weight:500}.source-legend button.selected{border-color:#8cb99d;background:#eaf5ed;color:#00692f;box-shadow:inset 0 0 0 1px #8cb99d}.source-legend .husky.selected{border-color:#91b0db;background:#edf3ff;color:var(--blue);box-shadow:inset 0 0 0 1px #91b0db}.source-legend i{height:7px;width:7px;border-radius:50%;background:#347b51}.source-legend .husky i{background:var(--blue)}.source-legend .other i{background:#8b9690}.source-legend b{font-size:13px;font-weight:650;min-width:18px;padding:0 4px;background:#fff;border-radius:4px;text-align:center}.chart-toolbar{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;color:#74847b}.chart-nav{display:flex;gap:6px}.chart-nav button{display:flex;align-items:center;gap:3px;border:0;background:transparent;border-radius:6px;color:#446653;font-size:12px;min-height:30px;padding:3px 5px}.chart-nav button:hover{background:#f0f5f2}
.matrix-scroll{min-width:0;min-height:180px;flex:1;overflow:auto;border:1px solid #e0e7e3;border-radius:10px;scroll-padding:52px 0 0 190px;overscroll-behavior:contain}.matrix-grid{display:grid;grid-template-columns:140px 50px repeat(var(--day-count),minmax(158px,1fr));width:max-content;min-width:100%;min-height:100%;grid-template-rows:52px repeat(7,minmax(56px,auto));align-content:start}.matrix-corner,.total-heading,.day-heading{position:sticky;top:0;z-index:3;display:grid;align-content:center;text-align:center;background:#f6f9f7;border-bottom:1px solid #dce5df;padding:7px;font-size:13px;color:#63786b}.matrix-corner{left:0;text-align:left;padding-left:14px;z-index:6;font-weight:550}.total-heading{left:140px;z-index:5}.day-heading strong{font-size:15px;color:#294536;font-weight:600}.day-heading.is-today{background:#edf6ef;color:#00692f}.field-heading{position:sticky;left:0;z-index:4;display:flex;align-items:center;justify-content:space-between;gap:6px;background:#fff;border:0;border-bottom:1px solid #e7ede9;border-right:1px solid #e7ede9;padding:10px 12px;text-align:left;color:#294536;font-size:14px;font-weight:600;line-height:1.35}.field-heading svg{flex-shrink:0;color:#9aac9f}.field-heading:hover,.field-heading.chosen{background:#edf6ef;color:#00692f}.field-total{position:sticky;left:140px;z-index:4;display:grid;place-items:center;background:#fff;border-right:1px solid #e7ede9;border-bottom:1px solid #e7ede9;font-size:14px;font-weight:600;color:#486151}.field-total span{padding:3px 6px;border-radius:5px;background:#f3f6f4}.matrix-cell{border:0;border-right:1px solid #e7ede9;border-bottom:1px solid #e7ede9;padding:8px;display:flex;flex-direction:column;justify-content:center;align-items:stretch;gap:7px;min-height:56px;background:#fcfdfc;text-align:left;color:inherit}.matrix-cell.filled{background:#fff}.matrix-cell:hover{background:#f1f8f3}.matrix-cell.active{background:#edf7f0;box-shadow:inset 0 0 0 2px #00692f}.cell-number{display:flex;align-items:center;gap:4px;color:#3f7452;font-size:12px;line-height:1}.cell-number strong{font-size:19px;font-weight:650;color:#00692f}.cell-number svg{margin-left:auto;color:#7b9d85}.mini-actor{display:flex;align-items:center;gap:7px;min-width:0}.mini-actor :deep(.audit-avatar){width:30px;height:30px;flex-basis:30px;font-size:12px}.identity-copy{display:grid;gap:1px;min-width:0}.mini-name{font-size:14px;line-height:1.25;font-weight:550;overflow-wrap:anywhere}.cell-source{font-size:11px;color:#728778;font-weight:500}.cell-source.husky{color:#2563b8}.no-change{margin:auto;color:#cbd5ce;font-size:16px}
.audit-inspector{display:flex;flex-direction:column;min-width:0;min-height:0;border-left:1px solid #dce5df;background:#f7f9f8}.detail-header{padding:18px 16px 14px;flex:0 0 auto;border-bottom:1px solid #e1e8e3;background:#fff}.detail-title{display:flex;justify-content:space-between;align-items:start;gap:8px}.detail-header h2{font-family:var(--font-display);font-size:23px;font-weight:600;margin:3px 0 4px;line-height:1.15}.detail-count{font-size:14px;color:#526d5d}.clear-selection{display:flex;align-items:center;gap:3px;border:0;background:#f1f5f2;border-radius:7px;min-height:34px;padding:5px 7px;font-size:12px;color:#476451;white-space:nowrap}.detail-records{display:flex;flex-direction:column;gap:12px;overflow:auto;padding:14px;min-height:0;flex:1;overscroll-behavior:contain}.detail-records :deep(.audit-change-card){flex-shrink:0}.load-more{background:#fff;border:1px solid #d5e1d8;border-radius:9px;min-height:44px;color:#00692f;font-size:14px;font-weight:550;padding:8px;flex-shrink:0}.empty-area{display:grid;place-content:center;justify-items:center;gap:12px;min-height:200px;color:#7b8c81;text-align:center}.empty-area strong{font-size:15px;font-weight:500}.status-notice{display:flex;align-items:center;gap:8px;flex-wrap:wrap;border:1px solid #e9d5b2;background:#fff9ed;color:#7a592d;border-radius:9px;padding:8px 11px;font-size:14px}.status-notice small{font-size:11px;overflow-wrap:anywhere;width:100%;color:#897251}.empty-result{display:flex;align-items:center;gap:9px;padding:10px;border-radius:9px;background:#f5f8f6;color:#62786a;font-size:14px}.empty-result strong{font-weight:500}.loading-line{display:flex;align-items:center;gap:8px;color:#62786a;font-size:14px}.mobile-back,.mobile-label{display:none}.spinning{animation:spin .9s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(min-width:1700px){.matrix-grid{width:calc(190px + var(--day-count) * 140px);grid-template-columns:140px 50px repeat(var(--day-count),minmax(140px,1fr))}}
@media(max-width:1200px){.audit-overview{padding:14px;gap:10px}.change-header{align-items:start;flex-wrap:wrap;gap:8px}.heading-copy h1{font-size:25px}.audit-toolbar{flex-wrap:wrap;gap:8px}.campus-control{flex-basis:200px}.audit-search-control{flex-basis:240px}.refresh-button{margin-left:auto}.source-legend button{font-size:12px}.chart-toolbar>span{display:none}}
@media(max-width:760px){.change-workspace{grid-template-columns:minmax(0,1fr);border-radius:12px}.audit-overview{padding:14px;gap:12px}.change-header{gap:8px}.inline-summary{font-size:13px}.inline-summary strong{font-size:19px}.heading-copy h1{font-size:25px}.campus-control{flex-basis:100%;min-width:0;grid-template-columns:52px minmax(0,1fr);align-items:center}.audit-search-control>span:first-child{display:none}.heading-copy>span{display:none}.desktop-label{display:none}.mobile-label{display:inline}.filter-band{gap:8px}.audit-search-control{flex-basis:170px;min-width:140px}.refresh-button{padding:0 9px}.refresh-button span{font-size:12px}.period-area{gap:7px}.period-buttons button{font-size:13px;padding:7px 9px}.date-range{font-size:13px;padding:8px}.source-legend{gap:5px}.source-legend button{padding:7px 8px;font-size:12px;min-height:36px}.matrix-grid{grid-template-columns:112px 40px repeat(var(--day-count),158px)}.total-heading,.field-total{left:112px}.field-heading{font-size:13px;padding:9px}.matrix-scroll{scroll-padding-left:152px}.audit-inspector{display:none;border:0}.detail-open .audit-overview{display:none}.detail-open .audit-inspector{display:flex}.mobile-back{display:flex;align-items:center;gap:5px;border:0;background:transparent;color:#00692f;padding:0;min-height:40px;margin-bottom:8px;font-size:14px}.detail-open .clear-selection{display:none}.detail-header{padding:12px 16px}.detail-records{padding:14px}.empty-result{flex-wrap:wrap}}
@media(max-height:560px) and (min-width:761px){.audit-overview{padding:10px;gap:6px}.heading-copy>span{display:none}.heading-copy h1{font-size:23px}.campus-control>span,.audit-search-control>span:first-child{display:none}.period-buttons button{min-height:28px;padding:5px 8px}.date-range{min-height:36px;padding:6px}.source-legend button{min-height:30px;padding:4px 7px}.detail-header{padding:10px 14px}}
</style>
