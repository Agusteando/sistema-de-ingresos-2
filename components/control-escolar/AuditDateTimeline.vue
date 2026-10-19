<template>
  <div ref="root" class="date-timeline" aria-label="Historial por alumno">
    <details v-for="student in students.slice(0,studentLimit)" :key="student.key" class="student-root" :data-audit-student="student.key" open>
      <summary class="student-root-heading"><span><strong>{{ named(student)?student.student:'Nombre no disponible' }}</strong><small v-if="named(student)">{{ student.matricula }} · {{ student.plantel }}</small></span><span class="date-count">{{ student.changes.length+student.observations.length }} {{ auditRecordNoun([...student.changes,...student.observations]) }}</span></summary>
      <div class="student-dates">
        <section v-for="day in studentDays(student)" :key="day.date" :data-audit-date="day.date" class="date-section" :class="{'is-focused':day.date===focused,'is-today':day.date===today}">
          <button type="button" class="date-divider" :aria-pressed="day.date===focused" @click="choose(day.date)"><span><strong>{{ dateLabel(day.date) }}</strong><small v-if="day.date===today">Hoy</small></span><span class="date-count">{{ day.events.length }} {{ auditRecordNoun(day.events) }}</span></button>
          <AuditStudentTimeline :records="day.events" single-day hide-identity :latest-record-id="student.latest.id" :show-history="showHistory" @history="$emit('history',$event)"/>
        </section>
      </div>
    </details>
    <button v-if="students.length>studentLimit" type="button" class="students-more" @click="studentLimit+=10">Ver más alumnos · {{ students.length-studentLimit }}</button>
  </div>
</template>
<script setup lang="ts">
import {computed,ref,watch,nextTick,onMounted} from 'vue'
import AuditStudentTimeline from './AuditStudentTimeline.vue'
import {groupAuditDates,groupAuditStudents,auditRecordNoun,type AuditStudentRecord} from '~/shared/utils/auditStudentTimeline'
const props=withDefaults(defineProps<{records:AuditStudentRecord[];focusDate?:string;showHistory?:boolean}>(),{showHistory:true})
const emit=defineEmits<{history:[record:AuditStudentRecord];focus:[date:string]}>()
const root=ref<HTMLElement|null>(null),localFocus=ref('')
const students=computed(()=>groupAuditStudents(props.records))
const studentLimit=ref(10)
const studentDays=(student:typeof students.value[number])=>groupAuditDates([...student.changes,...student.observations])
const named=(student:typeof students.value[number])=>Boolean(student.student&&student.student.toUpperCase()!==student.matricula.toUpperCase())
const days=computed(()=>groupAuditDates(props.records))
const focused=computed(()=>props.focusDate||localFocus.value||days.value[0]?.date||'')
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const dateLabel=(date:string)=>new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'))
let positioned=''
const position=async()=>{
  const index=students.value.findIndex(student=>studentDays(student).some(day=>day.date===focused.value))
  if(index>=studentLimit.value)studentLimit.value=index+1
  await nextTick()
  if(positioned===focused.value)return
  const target=[...root.value?.querySelectorAll<HTMLElement>('[data-audit-date]')||[]].find(element=>element.dataset.auditDate===focused.value)
  const scroller=root.value?.closest<HTMLElement>('.detail-records,.field-history-records')
  if(!target||!scroller)return
  const branch=target.closest<HTMLDetailsElement>('.student-root')
  if(branch)branch.open=true
  positioned=focused.value
  scroller.scrollTo({top:scroller.scrollTop+target.getBoundingClientRect().top-scroller.getBoundingClientRect().top-(branch?.querySelector('.student-root-heading')?.getBoundingClientRect().height||0)-8,behavior:'auto'})
}
const choose=(date:string)=>{localFocus.value=date;emit('focus',date);positioned='';void position()}
watch(()=>props.focusDate,()=>{positioned='';void position()})
watch(()=>days.value.map(day=>day.date).join('|'),()=>void position())
onMounted(()=>void position())
</script>
<style scoped>
.date-timeline{display:grid;gap:28px;min-width:0}.student-root{min-width:0}.student-root-heading{position:sticky;top:-14px;z-index:3;background:#f7f9f8;display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;padding:10px 0 12px;border-bottom:1px solid #dbe5de;color:#294536}.student-root-heading>span:first-child{display:grid;gap:4px;min-width:0}.student-root-heading strong{font-size:16px;font-weight:600;overflow-wrap:anywhere}.student-root-heading small{font-size:11px;color:#7b8b80}.student-dates{display:grid;gap:22px;margin:8px 0 0 5px;padding-left:16px;border-left:2px solid #d9e4dc}.students-more{border:1px solid #d5e1d8;background:#fff;border-radius:8px;min-height:42px;color:#00692f;font:500 13px var(--font-body);cursor:pointer}.student-root-heading:focus-visible{outline:3px solid #62a88b;outline-offset:3px}.date-section{min-width:0;opacity:.55;transition:opacity .18s ease}.date-section:hover,.date-section:focus-within,.date-section.is-focused{opacity:1}.date-divider{position:relative;width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;border:0;border-bottom:1px solid #d6e1d9;background:#f7f9f8;padding:12px 0;margin-bottom:16px;font:inherit;cursor:pointer;color:#647a6b}.date-divider>span:first-child{display:flex;align-items:center;flex-wrap:wrap;gap:7px}.date-divider strong{font-size:17px;font-weight:600;font-family:var(--font-display)}.date-divider small{font-size:10px;padding:3px 7px;border-radius:20px;background:#e4f1e8;color:#00692f}.date-count{font-size:11px;white-space:nowrap}.is-focused>.date-divider{color:#00692f;border-bottom:2px solid #00692f}.date-empty{padding:12px;color:#7d8e82;font-size:13px}.date-divider:focus-visible{outline:3px solid #62a88b;outline-offset:3px}@media(prefers-reduced-motion:reduce){.date-section{transition:none}}@media(prefers-contrast:more){.date-section{opacity:.85}}
</style>
