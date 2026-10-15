<template>
  <section class="change-workspace" aria-label="Historial de cambios" @keydown.esc="clearSelection">
    <div class="audit-overview">
      <header class="change-header">
        <div class="heading-copy"><h1>Historial de cambios</h1><span>Control Escolar</span></div>
        <span class="inline-summary" aria-live="polite">{{ filteredEvents.length }} registros · {{ studentCount }} alumnos</span>
      </header>
      <div class="audit-toolbar">
        <label class="campus-control"><span>Plantel</span>
          <SearchableSelect v-model="plantel" :options="campusOptions" :clearable="false" accessible-label="Filtrar plantel" search-placeholder="Buscar plantel…" />
        </label>
        <div class="period-area"><span>Periodo</span>
          <div class="period-controls">
            <button type="button" class="date-range" :aria-expanded="range==='custom'" @click="setRange('custom')"><LucideCalendarDays :size="18"/>{{ dateRangeLabel }}<LucideChevronDown :size="16"/></button>
            <div class="period-buttons" role="group" aria-label="Periodo">
              <button v-for="daysCount in [7,30,90]" :key="daysCount" type="button" :class="{selected:range===String(daysCount)}" @click="setRange(String(daysCount))">{{ daysCount }} días</button>
            </div>
          </div>
        </div>
        <label class="audit-search"><LucideSearch :size="18"/><input v-model="search" type="search" aria-label="Buscar alumno o usuario" placeholder="Buscar alumno o usuario" /></label>
        <button class="icon-button" type="button" :disabled="busy" aria-label="Actualizar" @click="refreshAll"><LucideRefreshCw :size="21" :class="{spinning:busy}"/></button>
        <button type="button" class="icon-button" aria-label="Más filtros" :aria-expanded="showFilters" @click="showFilters=!showFilters"><LucideSlidersHorizontal :size="20"/></button>
      </div>
      <div v-if="range==='custom'" class="custom-dates">
        <label>Desde<input v-model="customFrom" type="date" :max="customTo"/></label>
        <label>Hasta<input v-model="customTo" type="date" :min="customFrom" :max="today"/></label>
      </div>
      <div v-if="!validDates" class="status-notice" role="alert">Selecciona un periodo de hasta 90 días.</div>
      <div v-if="showFilters" class="secondary-filters">
        <SearchableSelect v-model="source" :options="sourceOptions" :clearable="false" accessible-label="Sistema" search-placeholder="Buscar sistema…"/>
        <button type="button" class="text-button" @click="resetFilters">Limpiar filtros</button>
      </div>
      <div class="chart-toolbar">
        <div class="source-legend" aria-label="Registros por sistema" aria-live="polite">
          <span v-for="system in ['Aurora','Husky Pass','Otro']" :key="system" :class="sourceClass(system)"><i></i>{{ system==='Husky Pass'?'Husky Pass · Familias':system==='Otro'?'Otros':system }}<b>{{ busy?'…':systemCount(system) }}</b></span>
        </div>
        <div class="chart-nav"><button class="icon-button" type="button" aria-label="Fechas anteriores" @click="moveChart(-1)"><LucideChevronLeft :size="19"/></button><button class="icon-button" type="button" aria-label="Fechas siguientes" @click="moveChart(1)"><LucideChevronRight :size="19"/></button></div>
      </div>
      <div v-if="queryError || historyUnavailable" class="status-notice" role="alert" :data-request-id="historyRequestId">
        <span>{{ queryError?'No se pudo cargar el historial.':'No se pudo completar la consulta.' }}</span><button type="button" class="text-button" :disabled="busy" @click="refreshAll">Reintentar</button><span v-if="historyRequestId" class="error-reference">Ref. {{ historyRequestId }}</span>
      </div>
      <div v-if="history?.partial || data?.truncated || history?.truncated" class="status-notice" role="status">Consulta incompleta.<button type="button" class="text-button" @click="refreshAll">Reintentar</button></div>
      <div ref="matrixScroller" class="matrix-scroll" tabindex="0" aria-label="Cambios por campo y fecha" :aria-busy="busy">
        <div class="matrix-grid" :style="{'--day-count':String(days.length)}">
          <div class="matrix-corner">CAMPO</div><div class="total-heading">Total</div>
          <div v-for="day in days" :key="'day-'+day.key" class="day-heading"><span>{{ day.weekday }}</span><strong>{{ day.label }}</strong></div>
          <template v-for="category in categories" :key="category.key">
            <button type="button" class="field-heading" :class="{chosen:selected?.category===category.key&&!selected?.day}" :aria-pressed="selected?.category===category.key&&!selected?.day" @mousedown.prevent="focusMatrixButton" @click="selectField(category.key)">{{ category.label }}</button>
            <div class="field-total"><span>{{ countCategory(category.key) }}</span></div>
            <button v-for="day in days" :key="category.key+'-'+day.key" type="button" class="matrix-cell" :class="{active:selected?.category===category.key&&selected?.day===day.key}" :aria-pressed="selected?.category===category.key&&selected?.day===day.key" :aria-controls="inspectorId" :aria-label="category.label+' '+day.label+', '+cell(category.key,day.key).length+' registros'" @mousedown.prevent="focusMatrixButton" @click="selectCell(category.key,day.key)">
              <template v-if="cell(category.key,day.key).length">
                <span class="cell-number">{{ cell(category.key,day.key).length }}</span>
                <span v-for="actor in cellActors(category.key,day.key)" :key="actor.key" class="mini-actor">
                  <AuditActorAvatar :src="actor.avatar" :name="actor.name" :source="actor.source" :email="actor.email"/>
                  <span class="identity-copy"><span class="mini-name">{{ actor.source==='Husky Pass'?'Familias':actor.name }}</span><span class="cell-source" :class="sourceClass(actor.source)">{{ actor.source==='Otro'?'Otros':actor.source }}</span></span>
                </span>
              </template><span v-else class="no-change">—</span>
            </button>
          </template>
        </div>
      </div>
      <div v-if="busy && !filteredEvents.length" class="loading-line" role="status"><LucideRefreshCw class="spinning" :size="20"/>Cargando historial…</div>
    </div>
    <aside :id="inspectorId" class="audit-inspector" aria-label="Detalle de cambios">
      <header class="detail-header"><div><h2>{{ selectionTitle }}</h2><span>{{ selectedEvents.length }} registros</span></div><button v-if="selected" class="icon-button" type="button" aria-label="Ver todos los cambios" @click="clearSelection"><LucideX :size="20"/></button></header>
      <div ref="detailRecords" class="detail-records" :aria-busy="busy">
        <AuditChangeCard v-for="(record,index) in selectedEvents.slice(0,detailCount)" :key="record.id" :record="record" :compact="index>0"/>
        <div v-if="!selectedEvents.length" class="empty-area"><LucideInbox :size="28"/><strong>{{ busy?'Cargando historial…':historyUnavailable?'Consulta pendiente':'Sin registros en esta selección' }}</strong></div>
        <button v-if="selectedEvents.length>detailCount" type="button" class="load-more" @click="detailCount+=30">Ver más ({{ selectedEvents.length-detailCount }})</button>
      </div>
    </aside>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, useId } from 'vue'
import SearchableSelect from '~/components/SearchableSelect.vue'
import AuditActorAvatar from './AuditActorAvatar.vue'
import AuditChangeCard from './AuditChangeCard.vue'
import {
  LucideRefreshCw, LucideSlidersHorizontal,
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
const customFrom=ref(shift(today,-6))
const customTo=ref(today)
const plantel=ref('ALL')
const source=ref('ALL')
const search=ref('')
const selected=ref<{category:string;day?:string}|null>(null)
const showFilters=ref(false)
const detailCount=ref(30)
const detailRecords=ref<HTMLElement|null>(null)
const inspectorId='audit-inspector-'+useId()
const matrixScroller=ref<HTMLElement|null>(null)
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
  const count=filteredEvents.value.filter(e=>e.source===system).length
  return !count&&historyUnavailable.value&&system!=='Otro'?'—':count
}
const sourceOptions=[{value:'ALL',label:'Todos los sistemas'},{value:'Aurora',label:'Aurora'},{value:'Husky Pass',label:'Husky Pass'},{value:'Otro',label:'Otros'}]
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
const filteredEvents=computed(()=>allEvents.value.filter(e=>{
  if(e.date<from.value||e.date>to.value)return false
  if(plantel.value!=='ALL'&&e.plantel!==plantel.value)return false
  if(source.value!=='ALL'&&e.source!==source.value)return false
  const q=search.value.trim().toLowerCase()
  return !q||[e.student,e.matricula,e.actor,e.actorEmail,e.fieldLabel].join(' ').toLowerCase().includes(q)
}))
const days=computed(()=>{
  if(!validDates.value)return []
  const duration=Math.round((new Date(to.value+'T12:00:00Z').getTime()-new Date(from.value+'T12:00:00Z').getTime())/86400000)+1
  return Array.from({length:duration},(_,i)=>{
    const key=shift(from.value,i)
    const date=new Date(key+'T12:00:00Z')
    return {key,label:new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',timeZone:'UTC'}).format(date),
      weekday:new Intl.DateTimeFormat('es-MX',{weekday:'short',timeZone:'UTC'}).format(date)}
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
const cellSources=(category:string,day:string)=>{
  const counts=new Map<string,number>()
  for(const entry of cell(category,day))counts.set(entry.source,(counts.get(entry.source)||0)+1)
  return [...counts].map(([name,count])=>({name,count}))
}
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
const setRange=(value:string)=>{if(value==='custom'&&range.value!=='custom'){customFrom.value=from.value;customTo.value=to.value}range.value=value}
const resetFilters=()=>{search.value='';source.value='ALL';plantel.value='ALL'}
const refreshAll=()=>{refresh();refreshHistory()}
const moveChart=(direction:number)=>{matrixScroller.value?.scrollBy({left:direction*450,behavior:'smooth'})}
const scrollToLatest=async()=>{await nextTick();if(matrixScroller.value)matrixScroller.value.scrollLeft=matrixScroller.value.scrollWidth}
onMounted(scrollToLatest)
watch([from,to,plantel],()=>{selected.value=null;detailCount.value=30;scrollToLatest()})
watch(busy,loading=>{if(!loading)scrollToLatest()})
watch([search,source],()=>{detailCount.value=30})
const clearSelection=()=>{selected.value=null}
watch(selected,async()=>{detailCount.value=30;await nextTick();detailRecords.value?.scrollTo({top:0})})
</script>

<style scoped>
.change-workspace{--green:#00692f;--blue:#2563b8;--gray:#647586;display:grid;grid-template-columns:minmax(0,1fr) clamp(330px,27%,440px);min-width:0;width:100%;height:100%;min-height:0;color:var(--ink,#162641);background:white;border:1px solid #dce5e1;border-radius:12px;overflow:hidden;font-family:var(--font-body);font-size:16px;line-height:1.4}
.change-workspace *{box-sizing:border-box}.audit-overview{display:flex;flex-direction:column;gap:14px;padding:20px;min-width:0;min-height:0;overflow:auto}
.change-header,.heading-copy,.audit-toolbar,.period-controls,.period-buttons,.chart-toolbar,.chart-nav,.source-legend,.source-legend>span,.detail-header,.audit-search,.date-range,.mini-actor,.status-notice{display:flex;align-items:center}
.change-header,.chart-toolbar,.detail-header{justify-content:space-between;gap:12px}.heading-copy{gap:12px;flex-wrap:wrap}.heading-copy h1{font-family:var(--font-display);font-size:clamp(24px,2vw,30px);font-weight:600;line-height:1.1;margin:0}.heading-copy>span,.inline-summary{color:#5b6e7b;font-size:16px}.inline-summary{white-space:nowrap}
button,input{font-family:inherit;font-size:16px}button{cursor:pointer}button:focus-visible,input:focus-visible,.matrix-scroll:focus-visible{outline:3px solid #61a289;outline-offset:2px}button:disabled{opacity:.55;cursor:wait}
.audit-toolbar{gap:10px;flex-wrap:wrap;align-items:end}.campus-control{display:grid;gap:5px;flex:1 1 210px;min-width:180px}.campus-control>span,.period-area>span{font-size:16px;font-weight:600}.campus-control :deep(.searchable-select__trigger){height:44px;font-size:16px;font-weight:550;border-radius:8px}
.period-area{display:grid;gap:5px;flex:2 1 410px}.period-controls{gap:8px;flex-wrap:wrap}.date-range{gap:9px;border:1px solid #dce5e1;border-radius:8px;background:#fff;color:inherit;padding:10px 12px;min-height:44px;white-space:nowrap;flex:1;justify-content:center}.date-range svg{flex:0 0 auto}.period-buttons{gap:4px}.period-buttons button{border:1px solid #e3e9e6;border-radius:7px;background:#f8faf9;color:#496176;font-size:16px;padding:10px;min-height:44px;white-space:nowrap}.period-buttons button.selected{border-color:var(--green);background:#f0f7f2;color:var(--green)}
.audit-search{height:44px;flex:1 1 230px;min-width:180px;gap:9px;border:1px solid #dce5e1;border-radius:8px;padding:0 11px;color:#657886}.audit-search input{border:0;background:transparent;outline:0;width:100%;min-width:0;color:inherit;height:100%;font-weight:450}.icon-button{display:grid;place-items:center;border:1px solid #dce5e1;border-radius:8px;background:#fff;color:#3d6159;width:42px;height:44px;flex:0 0 42px}.text-button{background:transparent;color:var(--green);border:0;padding:5px;font-weight:600;text-decoration:underline;min-height:36px}
.custom-dates,.secondary-filters{display:flex;gap:12px;flex-wrap:wrap}.custom-dates label{display:grid;gap:4px;flex:1;min-width:150px}.custom-dates input{border:1px solid #dce5e1;border-radius:8px;padding:9px;min-height:44px;width:100%}.secondary-filters>.searchable-select{flex:1;max-width:380px}.chart-nav{gap:5px}.chart-nav .icon-button{width:34px;min-width:34px;flex-basis:34px;height:34px}.source-legend{gap:14px;flex-wrap:wrap;font-size:16px}.source-legend>span{gap:6px;font-weight:600;color:var(--green)}.source-legend i{width:10px;height:10px;border-radius:50%;background:currentColor}.source-legend .husky{color:var(--blue)}.source-legend .other{color:var(--gray)}.source-legend b{font-weight:600;padding-left:3px}
.matrix-scroll{min-width:0;min-height:180px;flex:1;overflow:auto;border:1px solid #dee7e2;border-radius:8px;scrollbar-gutter:stable;scroll-padding:58px 0 0 148px;overscroll-behavior:contain}.matrix-grid{display:grid;grid-template-columns:148px 55px repeat(var(--day-count),minmax(148px,1fr));width:max-content;min-width:100%;min-height:100%;grid-template-rows:54px repeat(7,minmax(60px,auto));align-content:start}
.matrix-corner,.total-heading,.day-heading{position:sticky;top:0;z-index:3;border-bottom:1px solid #dce7e0;background:#f0f6f2;padding:8px;display:grid;align-content:center;text-align:center;font-size:16px;font-weight:550}.matrix-corner{left:0;text-align:left;padding-left:12px;z-index:6}.total-heading{left:148px;z-index:5}.day-heading strong{font-weight:600}.day-heading span{color:#567071}.field-heading{position:sticky;left:0;z-index:4;display:flex;align-items:center;background:#fff;border:0;border-bottom:1px solid #e4ece6;border-right:1px solid #e4ece6;padding:12px;text-align:left;font-size:16px;font-weight:650;line-height:1.35;color:inherit}.field-total{position:sticky;left:148px;z-index:4;display:grid;place-items:center;background:#fff;border-bottom:1px solid #e4ece6;border-right:1px solid #e4ece6}.field-total span{padding:3px 7px;background:#edf3ef;border-radius:6px;font-size:16px;font-weight:650}.field-heading.chosen{color:var(--green);background:#f0f7f2}
.matrix-cell{position:relative;border:0;border-bottom:1px solid #e4ece6;border-right:1px solid #e4ece6;padding:8px;display:flex;flex-direction:column;justify-content:center;align-items:stretch;gap:7px;background:white;text-align:left;color:inherit;min-height:60px}.matrix-cell:hover{background:#f5faf7}.matrix-cell.active{background:#f0f8f2;box-shadow:inset 0 0 0 2px var(--green);border-radius:5px}.cell-number{font-size:17px;line-height:1;font-weight:700;color:var(--green)}.mini-actor{gap:7px;min-width:0}.mini-actor :deep(.audit-avatar){width:34px;height:34px;flex-basis:34px;font-size:14px}.identity-copy{display:grid;gap:4px;min-width:0}.mini-name{font-size:16px;line-height:1.2;font-weight:550;overflow-wrap:anywhere}.cell-source{justify-self:start;background:#e2f2e8;color:var(--green);padding:2px 6px;border-radius:6px;font-size:15px;line-height:1.2;font-weight:550}.cell-source.husky{color:var(--blue);background:#e9f0ff}.cell-source.other{color:var(--gray);background:#eef1f4}.no-change{margin:auto;color:#aebbb7;font-size:20px}
.audit-inspector{display:flex;flex-direction:column;min-width:0;min-height:0;border-left:1px solid #dee7e2;background:#fbfdfc}.detail-header{padding:20px 16px;flex:0 0 auto;border-bottom:1px solid #e2e9e5;align-items:start}.detail-header h2{font-family:var(--font-display);font-size:23px;line-height:1.2;font-weight:600;margin:0 0 5px}.detail-header span{color:#607481}.detail-records{display:flex;flex-direction:column;gap:12px;overflow:auto;padding:14px;min-height:0;flex:1;overscroll-behavior:contain}.detail-records :deep(.audit-change-card){flex-shrink:0}.load-more{background:white;border:1px solid #dce5e1;border-radius:8px;min-height:44px;color:var(--green);font-weight:600;padding:8px;flex-shrink:0}.empty-area{display:grid;place-content:center;justify-items:center;gap:12px;min-height:160px;color:#617784}.empty-area strong{font-size:16px}.status-notice{padding:8px 12px;border-radius:8px;border:1px solid #efdbbd;background:#fff9ed;color:#805b2f;gap:8px;flex-wrap:wrap}.error-reference{font-size:15px;overflow-wrap:anywhere}.loading-line{display:flex;align-items:center;gap:8px;color:#627875}.spinning{animation:spin .9s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(min-width:1700px){.audit-toolbar{flex-wrap:nowrap}.campus-control{flex-basis:230px}.period-area{flex-basis:440px}.audit-search{flex-basis:220px}}
@media(max-width:1150px){.change-workspace{grid-template-columns:minmax(0,1fr) 320px}.audit-overview{padding:14px;gap:10px}.change-header{align-items:start;flex-wrap:wrap}.period-area{flex-basis:100%}.source-legend{gap:8px}.matrix-grid{grid-template-columns:130px 48px repeat(var(--day-count),148px)}.matrix-corner,.field-heading{width:130px}.total-heading,.field-total{left:130px}.matrix-scroll{scroll-padding-left:178px}.detail-header{padding:16px 12px}}
@media(max-width:760px){.change-workspace{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(340px,55%) minmax(250px,1fr);border-radius:9px}.audit-overview{padding:12px;gap:9px}.heading-copy h1{font-size:25px}.heading-copy>span{display:none}.inline-summary{font-size:16px}.campus-control{flex-basis:100%}.audit-toolbar{gap:7px}.period-area{flex-basis:100%}.period-controls{gap:5px}.date-range{padding:8px;font-size:16px}.period-buttons button{padding:8px;font-size:15px}.audit-search{flex-basis:150px;min-width:140px}.source-legend{gap:7px;font-size:15px}.source-legend>span{gap:4px}.chart-toolbar{align-items:end}.chart-nav{gap:2px}.chart-nav .icon-button{width:30px;flex-basis:30px;min-width:30px}.matrix-grid{grid-template-columns:115px 43px repeat(var(--day-count),148px)}.field-heading,.matrix-corner{width:115px;font-size:16px}.field-heading{padding:8px}.total-heading,.field-total{left:115px}.audit-inspector{border-left:0;border-top:1px solid #dee7e2}.detail-header{padding:12px}.detail-header h2{font-size:22px}.detail-records{padding:12px}.matrix-scroll{scroll-padding-left:158px}}
@media(max-height:560px) and (min-width:761px){.audit-overview{gap:7px;padding:10px}.heading-copy h1{font-size:24px}.period-area{flex-basis:360px}.change-header{gap:5px}.audit-toolbar{gap:6px}.campus-control{flex-basis:180px}.source-legend{font-size:15px}}
</style>
