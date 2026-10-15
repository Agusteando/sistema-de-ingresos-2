<template>
  <section class="change-workspace" aria-label="Historial de cambios">
    <header class="change-header">
      <div class="heading-copy">
        <h1>Historial de cambios</h1>
        <p>Control Escolar</p>
      </div>
      <button class="icon-button" type="button" :disabled="busy" aria-label="Actualizar" @click="refreshAll">
        <LucideRefreshCw :size="23" :class="{ spinning: busy }"/>
      </button>
    </header>

    <div class="top-controls">
      <label class="campus-control">
        <span>Plantel</span>
        <SearchableSelect v-model="plantel" :options="campusOptions" :clearable="false"
          accessible-label="Filtrar plantel" search-placeholder="Buscar plantel…" />
      </label>
      <div class="period-area">
        <span class="filter-label">Periodo</span>
        <div class="period-buttons" role="group" aria-label="Periodo">
          <button v-for="daysCount in [7,30,90]" :key="daysCount" type="button"
            :class="{ selected: range === String(daysCount) }" @click="setRange(String(daysCount))">{{ daysCount }} días</button>
          <button type="button" :class="{ selected: range === 'custom' }" @click="setRange('custom')">
            <LucideCalendarDays :size="19" /> Fechas
          </button>
        </div>
      </div>
      <button type="button" class="filter-button" :aria-expanded="showFilters" @click="showFilters=!showFilters">
        <LucideSlidersHorizontal :size="19"/> Filtrar
      </button>
    </div>
    <div v-if="range === 'custom'" class="custom-dates">
      <label>Desde <input v-model="customFrom" type="date" :max="customTo" /></label>
      <label>Hasta <input v-model="customTo" type="date" :min="customFrom" :max="today" /></label>
    </div>
    <div v-if="!validDates" class="minor-notice">Selecciona un periodo de hasta 90 días.</div>
    <div v-if="showFilters" class="secondary-filters">
      <input v-model="search" type="search" aria-label="Buscar" placeholder="Alumno, matrícula o usuario…" />
      <SearchableSelect v-model="source" :options="sourceOptions" :clearable="false"
        accessible-label="Sistema" search-placeholder="Buscar sistema…" />
      <button type="button" @click="resetFilters">Limpiar</button>
    </div>

    <div class="source-summary" aria-label="Registros por sistema" aria-live="polite">
      <div v-for="system in ['Aurora','Husky Pass','Otro']" :key="system" :class="sourceClass(system)">
        <span>{{ system==='Otro'?'Otros':system }}</span>
        <strong>{{ busy ? '…' : systemCount(system) }}</strong>
      </div>
      <div v-if="historyUnavailable" class="history-retry" role="status">
        <span>Historial anterior no disponible</span>
        <button type="button" :disabled="busy" @click="refreshHistory">Reintentar</button>
      </div>
    </div>

    <div v-if="queryError" class="error-message" role="alert">
      No se pudo consultar el historial. <button type="button" @click="refreshAll">Reintentar</button>
    </div>
    <template v-else>
      <div class="totals">
        <div><strong>{{ filteredEvents.length }}</strong><span>Registros</span></div>
        <div><strong>{{ new Set(filteredEvents.map(x=>x.matricula)).size }}</strong><span>Alumnos</span></div>
        <div><strong>{{ new Set(filteredEvents.map(x=>x.field)).size }}</strong><span>Campos</span></div>
      </div>

      <div class="chart-header">
        <h2>Cambios por campo</h2>
        <div class="chart-nav">
          <button type="button" aria-label="Fechas anteriores" @click="moveChart(-1)"><LucideChevronLeft :size="21"/></button>
          <button type="button" aria-label="Fechas siguientes" @click="moveChart(1)"><LucideChevronRight :size="21"/></button>
        </div>
      </div>

      <div ref="matrixScroller" class="matrix-scroll" tabindex="0" aria-label="Cambios por campo y fecha">
        <div class="matrix-grid" :style="{ '--day-count': String(days.length) }">
          <div class="matrix-corner">CAMPO</div>
          <div v-for="day in days" :key="'day-'+day.key" class="day-heading">
            <span>{{ day.weekday }}</span><strong>{{ day.label }}</strong>
          </div>
          <template v-for="category in categories" :key="category.key">
            <button type="button" class="field-heading"
              :class="{ chosen: selected?.category===category.key && !selected?.day }"
              @click="selectField(category.key)">
              <span>{{ category.label }}</span><strong>{{ countCategory(category.key) }}</strong>
            </button>
            <button v-for="day in days" :key="category.key+'-'+day.key" type="button"
              class="matrix-cell" :class="{ active: selected?.category === category.key && selected?.day === day.key }"
              :aria-label="category.label+' '+day.label+', '+cell(category.key,day.key).length+' registros'"
              @click="selectCell(category.key,day.key)">
              <template v-if="cell(category.key,day.key).length">
                <span class="cell-number">{{ cell(category.key,day.key).length }}</span>
                <span v-for="system in cellSources(category.key,day.key)" :key="system.name" class="cell-source" :class="sourceClass(system.name)">
                  {{ system.name==='Otro'?'Otros':system.name }} <b>{{ system.count }}</b>
                </span>
                <span v-for="actor in cellActors(category.key,day.key)" :key="actor.key" class="mini-actor">
                  <AuditActorAvatar :src="actor.avatar" :name="actor.name" :source="actor.source" />
                  <span class="mini-name">{{ actor.name }}</span>
                </span>

              </template>
              <span v-else class="no-change">—</span>
            </button>
          </template>
        </div>
      </div>

      <div class="events-heading">
        <div><h2>Cambios recientes</h2><span>{{ filteredEvents.length }} registros</span></div>
      </div>
      <div class="event-list">
        <AuditChangeCard v-for="record in filteredEvents.slice(0,visibleCount)" :key="record.id" :record="record" />
        <div v-if="busy && !filteredEvents.length" class="empty-area">
          <LucideRefreshCw class="spinning" :size="27"/><strong>Cargando historial…</strong>
        </div>
        <div v-else-if="!filteredEvents.length" class="empty-area">
          <LucideInbox :size="29" /><strong>{{ historyUnavailable ? 'Historial incompleto' : 'Sin registros en estas fechas' }}</strong>
        </div>
        <button v-if="filteredEvents.length>visibleCount" class="load-more" type="button" @click="visibleCount+=30">
          Ver más ({{ filteredEvents.length-visibleCount }})
        </button>
      </div>
      <dialog ref="detailDialog" class="change-dialog" aria-labelledby="audit-detail-title" @close="selected=null" @click="dismissBackdrop">
        <header class="detail-header">
          <div><h2 id="audit-detail-title">{{ selectionTitle }}</h2><span>{{ selectedEvents.length }} registros</span></div>
          <button type="button" class="icon-button" aria-label="Cerrar detalles" autofocus @click="closeDetails"><LucideX :size="24"/></button>
        </header>
        <div class="detail-records">
          <AuditChangeCard v-for="record in selectedEvents.slice(0,detailCount)" :key="record.id" :record="record" />
          <div v-if="!selectedEvents.length" class="empty-area"><LucideInbox :size="29"/><strong>Sin registros en esta selección</strong></div>
          <button v-if="selectedEvents.length>detailCount" class="load-more" type="button" @click="detailCount+=30">Ver más ({{ selectedEvents.length-detailCount }})</button>
        </div>
      </dialog>
      <div v-if="history?.partial" class="minor-notice" role="status">Historial incompleto. <button type="button" @click="refreshHistory">Reintentar</button></div>
      <div v-if="(data?.truncated || history?.truncated)" class="minor-notice">Hay más registros. Acota el periodo para verlos.</div>

    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from 'vue'
import SearchableSelect from '~/components/SearchableSelect.vue'
import AuditActorAvatar from './AuditActorAvatar.vue'
import AuditChangeCard from './AuditChangeCard.vue'
import {
  LucideRefreshCw, LucideSlidersHorizontal,
  LucideCalendarDays, LucideChevronLeft, LucideChevronRight, LucideInbox, LucideX
} from 'lucide-vue-next'

type Change = {
  id:string; eventId:number; date:string; recordedAt:string; matricula:string; student:string
  field:string; fieldLabel:string; category:string; before:string|null; after:string|null
  source:string; actor:string; actorEmail:string; avatar:string; flow:string
  quality:'verified'|'historical'; plantel:string; ciclo:string
}
type MainResponse={categories:{key:string;label:string}[];allowedPlanteles:string[];events:Change[];truncated:boolean}
type HistoryResponse={events:Change[];available:boolean;truncated:boolean;partial?:boolean;requestId?:string}
type AvatarActor={key:string;name:string;source:string;avatar:string}
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
const visibleCount=ref(30)
const detailCount=ref(30)
const detailDialog=ref<HTMLDialogElement|null>(null)
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
const {data,status,error,refresh}=await useFetch<MainResponse>('/api/control-escolar/audit/changes',{
  query:fetchQuery,cache:'no-store',default:()=>({categories:[],allowedPlanteles:[],events:[],truncated:false})
})
const {data:history,status:historyStatus,error:historyError,refresh:refreshHistory}=await useFetch<HistoryResponse>('/api/control-escolar/audit/history',{
  query:fetchQuery,server:false,cache:'no-store',default:()=>({events:[],available:true,truncated:false})
})
const busy=computed(()=>status.value==='pending'||historyStatus.value==='pending')
const queryError=computed(()=>Boolean(error.value))
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
    if(!unique.has(key)||(!unique.get(key)?.avatar&&entry.avatar))unique.set(key,{key,name,source:entry.source,avatar:entry.avatar})
  }
  return [...unique.values()]
}
const countCategory=(category:string)=>filteredEvents.value.filter(e=>e.category===category).length
const selectionTitle=computed(()=>{
  if(!selected.value)return 'Cambios recientes'
  const label=categories.value.find(c=>c.key===selected.value?.category)?.label||'Cambios'
  return label+(selected.value.day?' · '+selected.value.day:'')
})
const selectedEvents=computed(()=>filteredEvents.value.filter(e=>
  !selected.value||(e.category===selected.value.category&&(!selected.value.day||e.date===selected.value.day))
))
const selectCell=(category:string,day:string)=>{selected.value=selected.value?.category===category&&selected.value?.day===day?null:{category,day}}
const selectField=(category:string)=>{selected.value=selected.value?.category===category&&!selected.value.day?null:{category}}
const sourceClass=(value:string)=>value==='Aurora'?'aurora':value==='Husky Pass'?'husky':'other'
const setRange=(value:string)=>{range.value=value;if(value==='custom'){customFrom.value=shift(today,-29);customTo.value=today}}
const resetFilters=()=>{search.value='';source.value='ALL';plantel.value='ALL'}
const refreshAll=()=>{refresh();refreshHistory()}
const moveChart=(direction:number)=>{matrixScroller.value?.scrollBy({left:direction*450,behavior:'smooth'})}
const scrollToLatest=async()=>{await nextTick();if(matrixScroller.value)matrixScroller.value.scrollLeft=matrixScroller.value.scrollWidth}
onMounted(scrollToLatest)
watch([from,to,plantel],()=>{selected.value=null;visibleCount.value=30;scrollToLatest()})
watch(busy,loading=>{if(!loading)scrollToLatest()})
watch([search,source],()=>{visibleCount.value=30})
const closeDetails=()=>detailDialog.value?.close()
const dismissBackdrop=(event:MouseEvent)=>{
  if(event.target!==detailDialog.value)return
  const rect=detailDialog.value.getBoundingClientRect()
  if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeDetails()
}
watch(selected,async value=>{
  detailCount.value=30
  await nextTick()
  if(value){
    if(!detailDialog.value?.open)detailDialog.value?.showModal()
    detailDialog.value?.querySelector('.detail-records')?.scrollTo({top:0})
  }else if(detailDialog.value?.open)closeDetails()
})
</script>

<style scoped>
.change-workspace{--green:#20885b;--blue:#3478b9;--gray:#788697;display:grid;gap:20px;min-width:0;max-width:100%;padding:24px;background:white;border:1px solid #dce8e3;border-radius:20px;font:500 16px/1.4 Montserrat,system-ui,sans-serif;color:#253a40}
.change-workspace *{box-sizing:border-box}
.change-header,.top-controls,.legend,.totals,.chart-header,.chart-nav,.events-heading,.event-head,.event-actor,.student-line,.diff,.event-footer{display:flex;align-items:center}
.change-header,.chart-header,.events-heading,.event-head{justify-content:space-between;gap:16px}
.heading-copy h1{font:650 clamp(26px,3vw,35px)/1.1 Fredoka,Montserrat,sans-serif;margin:0 0 5px}
.heading-copy p{font-size:16px;color:#617174;margin:0}
.icon-button,.filter-button,.chart-nav button,.clear-selection,.load-more,.secondary-filters button{min-height:45px;min-width:45px;background:white;border:1px solid #cedfda;border-radius:12px;color:#31594d;font:700 16px Montserrat,system-ui,sans-serif;cursor:pointer}
.icon-button{display:grid;place-items:center}.filter-button{display:flex;gap:9px;align-items:center;justify-content:center;padding:8px 15px}
button:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #3c9a7c;outline-offset:2px}
.top-controls{gap:14px;flex-wrap:wrap;align-items:end}
.campus-control{display:grid;gap:7px;flex:1;min-width:210px}
.campus-control>span,.filter-label{font-size:16px;font-weight:800;color:#4b5f65}
.campus-control select,.secondary-filters select,.secondary-filters input,.custom-dates input{height:48px;border:1px solid #d0ded9;border-radius:12px;background:#fff;padding:0 14px;color:#223a40;font:650 16px Montserrat,system-ui,sans-serif;width:100%}
.period-area{display:grid;gap:7px;flex:1;min-width:320px}
.period-buttons{display:flex;gap:4px;border:1px solid #d0ded9;background:#f5f8f7;border-radius:12px;padding:4px;min-height:48px;align-items:center}
.period-buttons button{border:0;border-radius:9px;background:transparent;color:#53676b;font:800 16px Montserrat,system-ui,sans-serif;min-height:38px;padding:4px 13px;display:flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;cursor:pointer;flex:1}
.period-buttons button.selected{background:white;color:#196744;box-shadow:0 2px 9px #1b5c421a}
.custom-dates{display:flex;gap:14px;flex-wrap:wrap}.custom-dates label{font-size:16px;font-weight:750;display:grid;gap:6px;flex:1;min-width:190px}
.secondary-filters{display:flex;gap:10px;flex-wrap:wrap;padding:14px;border-radius:14px;background:#f4f8f7}.secondary-filters input{flex:2;min-width:220px}.secondary-filters select{flex:1;min-width:180px}.secondary-filters button{padding:7px 14px}
.legend{gap:22px;flex-wrap:wrap;font-size:16px;font-weight:800}.legend>span{display:flex;gap:7px;align-items:center}
.legend-color{width:13px;height:13px;border-radius:4px;display:inline-block}
.legend-color.aurora{background:var(--green)}.legend-color.husky{background:var(--blue)}.legend-color.other{background:var(--gray)}
.totals{gap:10px}.totals>div{background:#f1f6f4;border:1px solid #e6eeea;border-radius:14px;flex:1;padding:13px 16px;display:grid;gap:3px;min-width:0}
.totals strong{font-size:29px;line-height:1.1}.totals span{font-size:16px;font-weight:700;color:#59706c}
.chart-header h2,.events-heading h2{font:650 24px Fredoka,Montserrat,sans-serif;margin:0}
.chart-nav{gap:7px}.chart-nav button{display:grid;place-items:center}
.matrix-scroll{max-width:100%;width:100%;overflow:auto;overscroll-behavior-x:contain;border:1px solid #dfebe6;border-radius:15px;scrollbar-width:thin;scrollbar-color:#9bbcb0 #f1f6f4}
.matrix-grid{display:grid;grid-template-columns:185px repeat(var(--day-count),minmax(135px,1fr));width:max-content;min-width:100%}
.matrix-corner,.day-heading{min-height:67px;border-bottom:1px solid #ddebe5;background:#f2f8f4;display:grid;align-content:center;padding:9px 12px;font-weight:800;color:#37584e;position:sticky;top:0;z-index:2}
.matrix-corner{left:0;z-index:4}.day-heading{text-align:center;font-size:16px}.day-heading strong{font-size:18px}
.field-heading{border:0;border-bottom:1px solid #e6eeea;border-right:1px solid #dce8e3;background:#fbfdfc;position:sticky;left:0;z-index:3;padding:13px;min-height:125px;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;cursor:pointer;color:#263e38}
.field-heading span{font-size:17px;font-weight:850;line-height:1.35}.field-heading strong{font-size:19px;background:#e8f0ec;border-radius:10px;min-width:35px;text-align:center;padding:5px}
.field-heading.chosen,.matrix-cell.active{background:#e3f2e9;box-shadow:inset 0 0 0 2px #70b99b}
.matrix-cell{border:0;border-right:1px solid #edf1ee;border-bottom:1px solid #e5ede8;background:white;min-height:125px;padding:9px;display:flex;flex-direction:column;gap:5px;align-items:stretch;text-align:left;cursor:pointer;color:#31453f}
.matrix-cell:hover,.field-heading:hover{background:#f0f7f3}
.cell-number{font-size:21px;font-weight:900;text-align:right;line-height:1}
.mini-actor{display:flex;gap:7px;align-items:center;min-width:0}.mini-name{font-size:16px;line-height:1.18;font-weight:800;overflow-wrap:anywhere}
.avatar{width:34px;height:34px;min-width:34px;border-radius:50%;background:#dcece2;border:2px solid var(--green);display:grid;place-items:center;position:relative;overflow:hidden;color:#245e43;font-size:15px;font-weight:850}
.avatar.husky{border-color:var(--blue);background:#e5eff9;color:#225a92}.avatar.other{border-color:var(--gray);background:#e9ecf0;color:#5c6774}
.avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:white}
.avatar.large{width:51px;height:51px;min-width:51px;font-size:18px}
.more-actors{font-size:16px;font-weight:800;color:#526f68}
.no-change{margin:auto;font-size:20px;color:#9fb0aa}
.events-heading{border-top:1px solid #e5ede8;padding-top:16px}.events-heading span{font-size:16px;color:#6b7d78}
.clear-selection{padding:9px 16px}.event-list{display:grid;gap:12px}
.event-card{border:1px solid #dce8e3;border-radius:17px;padding:17px;display:grid;gap:13px}
.event-actor{min-width:0;gap:12px}.actor-lines{display:grid;gap:4px;min-width:0}.actor-lines strong{font-size:18px;line-height:1.25;overflow-wrap:anywhere}.actor-lines span{font-size:16px;color:#61746f}
.field-chip{font-size:16px;font-weight:850;border-radius:10px;padding:8px 12px;background:#e8f4ec;color:#20724c;text-align:center}
.field-chip.husky{background:#e6f0fb;color:#276aa6}.field-chip.other{background:#eff1f4;color:#657280}
.student-line{gap:12px;flex-wrap:wrap}.student-line strong{font-size:18px}.student-line span{font-size:16px;color:#62736c}
.diff{gap:12px}.diff>div{flex:1;min-width:0;border-radius:12px;border:1px solid #e2ebe7;background:#f7faf8;padding:12px;display:grid;gap:3px}.diff>div:last-child{background:#edf7f1;border-color:#d5e8db}
.diff>div span{font-size:16px;color:#526860;font-weight:750}.diff strong{font-size:18px;overflow-wrap:anywhere}
.activity-mark{display:flex;align-items:center;gap:9px;background:#f1f6f9;color:#4f6682;padding:12px;border-radius:11px;font-size:16px;font-weight:800}
.event-footer{justify-content:space-between;color:#73827b;font-size:16px;border-top:1px solid #eef2ef;padding-top:9px}
.empty-area{min-height:175px;display:grid;place-content:center;justify-items:center;gap:10px;color:#687d74}.empty-area strong{font-size:18px}
.load-more{width:100%;font-weight:850}.error-message,.minor-notice{border-radius:10px;background:#fff6eb;color:#815c35;padding:12px;font-size:16px}.error-message button{margin-left:10px;text-decoration:underline;background:none;border:none;cursor:pointer;font-size:16px}
.spinning{animation:spin .9s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:850px){.change-workspace{padding:15px}.top-controls{align-items:stretch}.campus-control,.period-area{min-width:100%}.filter-button{width:100%}.period-buttons{overflow:auto}.matrix-grid{grid-template-columns:155px repeat(var(--day-count),minmax(145px,1fr))}.field-heading{padding:9px}.field-heading span{font-size:16px}.event-head{align-items:flex-start}.field-chip{max-width:45%}}
</style>

<style scoped>
.campus-control :deep(.searchable-select__trigger){height:48px;font-size:16px}
.secondary-filters>.searchable-select{flex:1;min-width:200px}
.source-summary{display:flex;gap:10px;flex-wrap:wrap;align-items:stretch}
.source-summary>div{display:flex;align-items:center;gap:18px;justify-content:space-between;flex:1;min-width:150px;border:1px solid #d9e8e0;border-left:5px solid var(--green);border-radius:12px;padding:10px 14px;background:#f1f8f4;font-weight:700}
.source-summary>div.husky{border-color:#d5e3f2;border-left-color:var(--blue);background:#eff6ff;color:#245a8a}
.source-summary>div.other{border-left-color:var(--gray);background:#f5f7f8;color:#536573}
.source-summary strong{font-size:24px}
.source-summary>div.history-retry{flex-basis:100%;background:#fff6eb;border-color:#eed1a8;color:#815c35}
.history-retry button{font:inherit;border:0;background:transparent;text-decoration:underline;cursor:pointer}
.matrix-scroll{max-height:clamp(260px,48dvh,570px);scrollbar-width:auto;scroll-padding-top:70px;scroll-padding-left:185px}
.matrix-grid{grid-template-columns:185px repeat(var(--day-count),minmax(180px,1fr))}
.matrix-cell{gap:8px;justify-content:flex-start}
.cell-source{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 7px;background:#edf7f0;color:#216744;border-radius:7px;font-size:16px;font-weight:700}
.cell-source.husky{background:#eaf3ff;color:#245a8a}.cell-source.other{background:#f0f3f5;color:#536573}
.change-dialog{position:fixed;inset:0 0 0 auto;margin:0;width:min(640px,100vw);max-width:100vw;height:100dvh;max-height:100dvh;border:0;border-left:1px solid #dce8e3;padding:0;background:#f7faf8;color:#253a40;box-shadow:-15px 0 60px #102d3326;font:500 16px/1.4 Montserrat,system-ui,sans-serif;overflow:hidden}
.change-dialog[open]{display:flex;flex-direction:column}
.change-dialog::backdrop{background:#14292b66}
.detail-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:0 0 auto;padding:20px;background:white;border-bottom:1px solid #dce8e3}
.detail-header h2{font-size:23px;margin:0 0 4px;font-weight:650}.detail-header span{color:#61746f}
.detail-records{padding:18px;display:grid;gap:14px;overflow-y:auto;overscroll-behavior:contain;align-content:start;min-height:0;flex:1}
@media(max-width:600px){.matrix-grid{grid-template-columns:145px repeat(var(--day-count),180px)}.matrix-scroll{scroll-padding-left:145px}.detail-header{padding:16px}.detail-records{padding:12px}.source-summary>div{min-width:100px;padding:8px;gap:6px;font-size:16px}.source-summary strong{font-size:21px}}
</style>
