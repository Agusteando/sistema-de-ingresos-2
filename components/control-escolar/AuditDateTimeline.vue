<template>
  <div ref="root" class="date-timeline" aria-label="Historial por fecha">
    <section v-for="day in days" :key="day.date" :data-audit-date="day.date" class="date-section" :class="{'is-focused':day.date===focused,'is-today':day.date===today}">
      <button type="button" class="date-divider" :aria-pressed="day.date===focused" @click="choose(day.date)"><span><strong>{{ dateLabel(day.date) }}</strong><small v-if="day.date===today">Hoy</small></span><span class="date-count">{{ day.events.length }} {{ auditRecordNoun(day.events) }}</span></button>
      <AuditStudentTimeline v-if="day.events.length" :records="day.events" single-day :show-history="showHistory" @history="$emit('history',$event)"/>
      <p v-else class="date-empty">Sin registros</p>
    </section>
  </div>
</template>
<script setup lang="ts">
import {computed,ref,watch,nextTick,onMounted} from 'vue'
import AuditStudentTimeline from './AuditStudentTimeline.vue'
import {groupAuditDates,auditRecordNoun,type AuditStudentRecord} from '~/shared/utils/auditStudentTimeline'
const props=withDefaults(defineProps<{records:AuditStudentRecord[];focusDate?:string;showHistory?:boolean}>(),{showHistory:true})
const emit=defineEmits<{history:[record:AuditStudentRecord];focus:[date:string]}>()
const root=ref<HTMLElement|null>(null),localFocus=ref('')
const days=computed(()=>groupAuditDates(props.records,props.focusDate))
const focused=computed(()=>props.focusDate||localFocus.value||days.value[0]?.date||'')
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const dateLabel=(date:string)=>new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'))
let positioned=''
const position=async()=>{
  await nextTick()
  if(positioned===focused.value)return
  const target=[...root.value?.querySelectorAll<HTMLElement>('[data-audit-date]')||[]].find(element=>element.dataset.auditDate===focused.value)
  const scroller=root.value?.closest<HTMLElement>('.detail-records,.field-history-records')
  if(!target||!scroller)return
  root.value?.style.setProperty('--timeline-height',scroller.clientHeight+'px')
  positioned=focused.value
  scroller.scrollTo({top:scroller.scrollTop+target.getBoundingClientRect().top-scroller.getBoundingClientRect().top-10,behavior:'auto'})
}
const choose=(date:string)=>{localFocus.value=date;emit('focus',date);positioned='';void position()}
watch(()=>props.focusDate,()=>{positioned='';void position()})
watch(()=>days.value.map(day=>day.date).join('|'),()=>void position())
onMounted(()=>void position())
</script>
<style scoped>
.date-timeline{display:grid;gap:28px;min-width:0}.date-section:last-child{min-height:var(--timeline-height,0px)}.date-section{min-width:0;opacity:.55;transition:opacity .18s ease}.date-section:hover,.date-section:focus-within,.date-section.is-focused{opacity:1}.date-divider{position:sticky;top:-14px;z-index:2;width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;border:0;border-bottom:1px solid #d6e1d9;background:#f7f9f8;padding:12px 0;margin-bottom:16px;font:inherit;cursor:pointer;color:#647a6b}.date-divider>span:first-child{display:flex;align-items:center;flex-wrap:wrap;gap:7px}.date-divider strong{font-size:17px;font-weight:600;font-family:var(--font-display)}.date-divider small{font-size:10px;padding:3px 7px;border-radius:20px;background:#e4f1e8;color:#00692f}.date-count{font-size:11px;white-space:nowrap}.is-focused>.date-divider{color:#00692f;border-bottom:2px solid #00692f}.date-empty{padding:12px;color:#7d8e82;font-size:13px}.date-divider:focus-visible{outline:3px solid #62a88b;outline-offset:3px}@media(prefers-reduced-motion:reduce){.date-section{transition:none}}@media(prefers-contrast:more){.date-section{opacity:.85}}
</style>
