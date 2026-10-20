<template>
  <section class="field-history" aria-label="Historial del campo">
    <header class="field-history-header"><button type="button" class="history-back" @click="$emit('close')"><LucideChevronLeft :size="17"/>Volver a cambios</button><span>Historial del campo</span><h2>{{ record.fieldLabel }}</h2><strong>{{ namedStudent?record.student:'Nombre no disponible' }}</strong><small v-if="namedStudent">{{ record.matricula }} · {{ record.plantel }}</small><div v-if="currentValueAvailable" class="current-value"><span>Actual</span><strong>{{ currentValue===null?'Sin dato':currentValue===''?(record.field==='grupo'?'Sin grupo':'Vacío'):currentValue }}</strong></div></header>
    <div class="field-history-records" :aria-busy="busy">
      <div v-if="failure" class="history-notice" role="alert"><span>No se pudo cargar.</span><button type="button" :disabled="busy" @click="load(true)">Reintentar</button><button v-if="requestId" type="button" @click="copyReference" aria-label="Copiar referencia del error">{{ copied?'Copiado':'Copiar referencia' }}</button></div>
      <span class="history-count" v-if="visibleRecords.length">{{ visibleRecords.length }} {{ auditRecordNoun(visibleRecords) }}<span v-if="nextCursor"> · hay más</span></span>
      <AuditDateTimeline :records="visibleRecords" @history="()=>{}" :show-history="false"/>
      <div v-if="historyBusy" class="history-loading" role="status">Cargando anteriores…</div>
      <div v-else-if="partial" class="history-notice" role="status"><span>Historial anterior pendiente</span><button type="button" @click="retryHistory">Reintentar</button><button v-if="requestId" type="button" @click="copyReference" aria-label="Copiar referencia del error">{{ copied?'Copiado':'Copiar referencia' }}</button></div>
      <div v-if="busy" class="history-loading" role="status"><LucideRefreshCw :size="18" class="spinning"/>Cargando historial…</div>
      <div v-else-if="!events.length&&!failure&&!partial&&!nextCursor&&!historyBusy" class="history-empty">Sin cambios registrados para este campo.</div>
      <button v-if="nextCursor" type="button" class="history-more" :disabled="busy" @click="load(false)">Cargar cambios anteriores</button>
    </div>
  </section>
</template>
<script setup lang="ts">
import {computed,ref,watch,onBeforeUnmount} from 'vue'
import {LucideChevronLeft,LucideRefreshCw} from 'lucide-vue-next'
import AuditDateTimeline from './AuditDateTimeline.vue'
import {auditRecordNoun} from '~/shared/utils/auditStudentTimeline'
import {compactAuditTransitions} from '~/shared/utils/auditTransitions'
import { compareAuditNewest } from '~/shared/utils/auditTimeline'
const props=defineProps<{record:{matricula:string;plantel:string;field:string;fieldLabel:string;student:string}}>()
defineEmits<{close:[]}>()
const namedStudent=computed(()=>props.record.student&&props.record.student.toUpperCase()!==props.record.matricula.toUpperCase())
const currentValueAvailable=ref(false),currentValue=ref<string|null>(null)
const events=ref<any[]>([]),nextCursor=ref<string|null>(null),busy=ref(false),failure=ref(false),partial=ref(false),requestId=ref('')
const changes=computed(()=>events.value.filter(item=>item.quality==='verified'))
const observations=computed(()=>events.value.filter(item=>item.quality!=='verified'))
const visibleRecords=computed(()=>compactAuditTransitions([...changes.value,...observations.value].sort(compareAuditNewest)))
const historyBusy=ref(false),copied=ref(false)
const copyReference=async()=>{try{await navigator.clipboard.writeText(requestId.value);copied.value=true}catch{copied.value=false}}
let controller:AbortController|null=null
let generation=0
const scopeField=(value:unknown)=>{const field=String(value||'').replace(/[_\s-]/g,'').toLowerCase();return ({nombre:'nombres',status:'estatus'} as Record<string,string>)[field]||field}
const matchesScope=(item:any)=>item.matricula===props.record.matricula&&item.plantel===props.record.plantel&&scopeField(item.field)===scopeField(props.record.field)
const mergeEvents=(incoming:any[])=>{
  const combined=new Map<string,any>(events.value.map(item=>[item.id,item]))
  for(const item of incoming||[])if(matchesScope(item))combined.set(item.id,item)
  events.value=[...combined.values()].sort(compareAuditNewest)
}
const loadHistorical=async(current:number,signal:AbortSignal)=>{
  historyBusy.value=true
  try{
    const result=await $fetch<any>('/api/control-escolar/audit/field-history',{query:{matricula:props.record.matricula,plantel:props.record.plantel,field:props.record.field,phase:'historical'},signal,retry:1,retryDelay:500})
    if(current!==generation)return
    mergeEvents(result.events);partial.value=Boolean(result.partial);requestId.value=result.requestId||''
  }catch(error:any){if(current!==generation||error?.name==='AbortError')return;partial.value=true;requestId.value=error?.data?.data?.requestId||''}
  finally{if(current===generation)historyBusy.value=false}
}
const retryHistory=()=>{if(controller)void loadHistorical(generation,controller.signal)}
const load=async(reset:boolean)=>{
  if(busy.value&&!reset)return
  controller?.abort();controller=new AbortController();const current=++generation
  const hadEvents=events.value.length>0,previousCursor=nextCursor.value
  busy.value=true;failure.value=false;historyBusy.value=false
  try{
    const result=await $fetch<any>('/api/control-escolar/audit/field-history',{query:{matricula:props.record.matricula,plantel:props.record.plantel,field:props.record.field,phase:'stored',...(!reset&&nextCursor.value?{cursor:nextCursor.value}:{})},signal:controller.signal})
    if(current!==generation)return
    if(reset){currentValueAvailable.value=Boolean(result.currentValueAvailable);currentValue.value=result.currentValue??null}
    mergeEvents(result.events)
    nextCursor.value=reset&&hadEvents?previousCursor:result.nextCursor||null
    requestId.value=result.requestId||requestId.value
    if(reset)void loadHistorical(current,controller.signal)
  }catch(error:any){if(current!==generation||error?.name==='AbortError')return;failure.value=true;requestId.value=error?.data?.data?.requestId||''}
  finally{if(current===generation)busy.value=false}
}

// Merge background results by event id: preserve the selected day, scroll and
// loaded pages while the collector fills historical values.
let backgroundBusy=false
const refreshStored=async()=>{
  if(backgroundBusy||busy.value||!controller||controller.signal.aborted)return
  backgroundBusy=true
  const current=generation
  try{
    const result=await $fetch<any>('/api/control-escolar/audit/field-history',{query:{matricula:props.record.matricula,plantel:props.record.plantel,field:props.record.field,phase:'stored'},signal:controller.signal})
    if(current!==generation)return
    mergeEvents(result.events)
    currentValueAvailable.value=Boolean(result.currentValueAvailable);currentValue.value=result.currentValue??null
  }catch{/* Foreground errors keep their own retry/reference; a poll never clears data. */}
  finally{backgroundBusy=false}
}
const poll=typeof window==='undefined'?null:setInterval(()=>{if(document.visibilityState==='visible')void refreshStored()},20000)

watch(()=>[props.record.matricula,props.record.plantel,props.record.field],()=>{events.value=[];currentValueAvailable.value=false;nextCursor.value=null;partial.value=false;void load(true)},{immediate:true})
onBeforeUnmount(()=>{generation++;controller?.abort();if(poll)clearInterval(poll)})
</script>
<style scoped>
.history-timeline{list-style:none;margin:0;padding:0 0 0 16px}.history-timeline>li{position:relative;padding:0 0 16px 16px;border-left:2px solid #dae5dd}.history-timeline>li:last-child{padding-bottom:0;border-color:transparent}.history-timeline>li:before{content:"";position:absolute;left:-6px;top:20px;width:10px;height:10px;border-radius:50%;background:#bdcdc1;border:2px solid #f5f8f6}.history-timeline>li.is-latest:before{background:#00692f}.current-value{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:7px;padding:10px 12px;border-radius:8px;background:#e7f3eb;color:#00692f}.current-value>span{font-size:12px}.current-value>strong{font-size:17px;font-weight:600;overflow-wrap:anywhere}.history-observations{font-size:12px;color:#748579}.history-observations>summary{cursor:pointer;padding:10px 0}.history-observations .audit-change-card{margin-top:10px}.field-history{display:flex;flex-direction:column;min-height:0;height:100%;font-family:var(--font-body)}.field-history-header{display:grid;gap:5px;padding:14px 16px;border-bottom:1px solid #dfe7e1;background:#fff}.history-back{display:flex;align-items:center;gap:4px;justify-self:start;min-height:36px;padding:0;margin-bottom:7px;border:0;background:transparent;color:#00692f;font:500 13px var(--font-body);cursor:pointer}.field-history-header>span,.field-history-header small{font-size:12px;color:#748579}.field-history-header h2{font:600 23px var(--font-display);margin:0;color:#223d2e}.field-history-header>strong{font-size:14px;font-weight:500;overflow-wrap:anywhere}.field-history-records{display:flex;flex-direction:column;gap:12px;overflow:auto;padding:14px;min-height:0;flex:1;overscroll-behavior:contain}.field-history-records>*{flex-shrink:0}.history-count{font-size:12px;color:#748579}.history-notice{padding:10px;border:1px solid #e9d5b2;border-radius:8px;background:#fff9ed;color:#7a592d;font-size:13px;display:flex;flex-wrap:wrap;align-items:center;gap:6px}.history-notice small{font-size:11px;width:100%;overflow-wrap:anywhere}.history-notice button{border:0;background:transparent;color:#00692f;text-decoration:underline;min-height:36px;cursor:pointer;font:inherit}.history-more{background:#fff;border:1px solid #d5e1d8;border-radius:8px;min-height:44px;color:#00692f;font:500 14px var(--font-body);cursor:pointer}.history-loading,.history-empty{display:flex;align-items:center;gap:8px;color:#748579;padding:18px 0;font-size:14px}.spinning{animation:spin .9s linear infinite}button:focus-visible{outline:3px solid #62a88b;outline-offset:2px}button:disabled{opacity:.5;cursor:wait}@keyframes spin{to{transform:rotate(360deg)}}
</style>
