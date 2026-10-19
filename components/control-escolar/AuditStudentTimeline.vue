<template>
  <div class="student-timeline" aria-label="Cambios por alumno">
    <details v-for="group in groups.slice(0,studentLimit)" :key="group.key" class="student-branch" open>
      <summary class="student-heading">
        <LucideChevronDown :size="15" class="branch-chevron"/>
        <span class="student-identity"><strong>{{ named(group)?group.student:'Nombre no disponible' }}</strong><small v-if="named(group)">{{ group.matricula }} · {{ group.plantel }}</small></span>
        <span class="student-count"><b>{{ group.changes.length+group.observations.length }}</b><small>{{ group.observations.length?(group.changes.length+group.observations.length===1?'registro':'registros'):(group.changes.length===1?'cambio':'cambios') }}</small></span>
      </summary>
      <ol class="change-tree">
        <li v-for="(record,index) in entries(group).slice(0,limits[group.key]||3)" :key="record.id" :class="{'latest-node':index===0}" :data-record-id="record.id">
          <div class="event-time"><time :datetime="record.recordedAt.replace(' ','T')+'-06:00'" :aria-label="auditDateLabel(record.recordedAt)" :title="auditDateLabel(record.recordedAt)"><span v-if="!singleDay" class="event-date">{{ shortDate(record.recordedAt) }}</span><strong>{{ clock(record.recordedAt) }}</strong><small>{{ fraction(record.recordedAt) }}</small></time></div>
          <article class="timeline-change">
            <header class="event-actor"><AuditActorAvatar :src="record.avatar" :name="record.actor" :source="record.source" :email="record.actorEmail"/><span><strong>{{ record.source==='Husky Pass'?'Familia':record.actor }}</strong><small>{{ record.source }}</small></span></header>
            <div class="event-field">{{ record.fieldLabel }}</div>
            <div class="event-diff"><span><small>Antes</small><span>{{ record.quality==='verified'?value(record.before):'—' }}</span></span><LucideArrowRight :size="16"/><span><small>Después</small><strong>{{ record.quality==='verified'?value(record.after):'—' }}</strong></span></div>
            <button v-if="showHistory" class="field-history-link" type="button" @click="$emit('history',record)"><LucideHistory :size="13"/>Historial de {{ record.fieldLabel.toLowerCase() }}</button>
          </article>
        </li>
      </ol>
      <button v-if="entries(group).length>(limits[group.key]||3)" class="branch-more" type="button" @click="limits[group.key]=(limits[group.key]||3)+10">{{ entries(group).length-(limits[group.key]||3) }} anteriores <LucideChevronDown :size="14"/></button>

    </details>
    <button v-if="groups.length>studentLimit" class="students-more" type="button" @click="studentLimit+=10">Ver más alumnos · {{ groups.length-studentLimit }}</button>
  </div>
</template>
<script setup lang="ts">
import {computed,ref,reactive} from 'vue'
import {LucideArrowRight,LucideChevronDown,LucideChevronRight,LucideHistory} from 'lucide-vue-next'
import AuditActorAvatar from './AuditActorAvatar.vue'
import {compareAuditNewest,auditDateLabel} from '~/shared/utils/auditTimeline'
import {groupAuditStudents} from '~/shared/utils/auditStudentTimeline'
import {type AuditStudentRecord as Record} from '~/shared/utils/auditStudentTimeline'
const props=withDefaults(defineProps<{records:Record[];singleDay?:boolean;showHistory?:boolean}>(),{showHistory:true})
defineEmits<{history:[record:Record]}>()
const groups=computed(()=>groupAuditStudents(props.records))
const entries=(group:{changes:Record[];observations:Record[]})=>[...group.changes,...group.observations].sort(compareAuditNewest)
const studentLimit=ref(10),limits=reactive<{[key:string]:number}>({})
const named=(group:{student:string;matricula:string})=>Boolean(group.student&&group.student.toUpperCase()!==group.matricula.toUpperCase())
const clock=(time:string)=>time.slice(11,19)
const fraction=(time:string)=>{const part=time.match(/\.(\d+)$/)?.[1];return part&&/[1-9]/.test(part)?'.'+part:''}
const shortDate=(time:string)=>auditDateLabel(time).split(' · ')[0]
const value=(input:string|null)=>input===null?'Sin dato':input===''?'Vacío':input
</script>
<style scoped>
.student-timeline{display:grid;gap:22px;min-width:0;font-family:var(--font-body);color:#294536}.student-branch{min-width:0}.student-heading{display:flex;align-items:center;gap:8px;list-style:none;cursor:pointer;padding:0 0 13px;border-bottom:1px solid #dbe5de}.student-heading::-webkit-details-marker{display:none}.student-identity{display:grid;gap:3px;flex:1;min-width:0}.student-identity>strong{font-size:16px;font-weight:600;line-height:1.35;overflow-wrap:anywhere}.student-identity>small{font-size:11px;color:#7b8b80}.student-count{display:grid;justify-items:center;align-content:center;min-width:47px;border-radius:8px;background:#eaf2ed;padding:5px 7px;color:#326443}.student-count>b{font-size:20px;line-height:1.1;font-weight:600}.student-count>small{font-size:10px}.branch-chevron{flex-shrink:0;transition:transform .15s}.student-branch:not([open]) .branch-chevron{transform:rotate(-90deg)}.change-tree{list-style:none;margin:14px 0 0 5px;padding:0}.change-tree>li{position:relative;margin:0;padding:0 0 18px 20px;border-left:2px solid #d9e4dc;min-width:0}.change-tree>li:last-child{padding-bottom:0}.change-tree>li:before{content:'';position:absolute;left:-6px;top:9px;width:10px;height:10px;border-radius:50%;background:#a9bfae;border:2px solid #f7f9f8}.change-tree>.latest-node:before{background:#00692f;box-shadow:0 0 0 3px #e5f1e9}.event-time{display:flex;align-items:center;justify-content:space-between;gap:5px;padding:0 0 8px;min-width:0}.event-time time{display:flex;align-items:baseline;flex-wrap:wrap;gap:0;font-variant-numeric:tabular-nums;min-width:0;line-height:1.2}.event-time time>strong{font-size:20px;font-weight:600;letter-spacing:-.4px;color:#365744}.event-time time>small{font-size:10px;color:#819487}.event-date{width:100%;margin-bottom:4px;font-size:11px;color:#7a8f80}.latest-badge{font-size:10px;color:#00692f;background:#e7f3eb;padding:3px 6px;border-radius:20px;white-space:nowrap}.timeline-change{padding:12px;border:1px solid #e1e8e3;border-radius:10px;background:#fff;min-width:0}.latest-node .timeline-change{border-color:#8ab69b;box-shadow:inset 3px 0 #00692f}.event-actor{display:flex;gap:7px;align-items:center;min-width:0}.event-actor :deep(.audit-avatar){width:28px;height:28px;flex-basis:28px;font-size:10px}.event-actor>span{display:grid;gap:1px;min-width:0}.event-actor strong{font-size:14px;font-weight:550;line-height:1.3;overflow-wrap:anywhere}.event-actor small{font-size:10px;color:#7a8e80}.event-field{font-size:12px;font-weight:550;color:#4b6855;margin:11px 0 6px}.event-diff{display:flex;gap:7px;align-items:center;min-width:0;padding-top:7px;border-top:1px solid #edf1ee}.event-diff>span{flex:1;min-width:0;display:grid;gap:4px;overflow-wrap:anywhere;font-size:14px}.event-diff small{color:#89978d;font-size:10px}.event-diff>span:first-child>span{color:#7a897e}.event-diff strong{color:#00692f;font-weight:600}.event-diff>svg{color:#a2b4a8;flex-shrink:0}.field-history-link{display:flex;align-items:center;gap:4px;margin-top:8px;border:0;background:transparent;color:#607f6a;font:500 11px var(--font-body);padding:3px 0;min-height:30px;cursor:pointer;text-align:left}.field-history-link:hover{text-decoration:underline;color:#00692f}.branch-more{display:flex;align-items:center;gap:5px;background:transparent;border:0;min-height:38px;margin-left:26px;padding:5px 0;color:#416c51;font:500 12px var(--font-body);cursor:pointer}.supporting-records{margin:10px 0 0 26px;color:#7d8e82;font-size:11px}.supporting-records>summary{cursor:pointer;padding:7px 0}.supporting-event{border-top:1px solid #e3eae5;padding:8px 0;display:grid;gap:3px}.supporting-event>strong{font-size:12px;font-weight:500;overflow-wrap:anywhere}.supporting-event .field-history-link{margin:0}.students-more{border:1px solid #d5e1d8;background:white;border-radius:8px;min-height:42px;color:#00692f;font:500 13px var(--font-body);cursor:pointer}button:focus-visible,summary:focus-visible{outline:3px solid #62a88b;outline-offset:3px}
@media(max-width:360px){.event-time{align-items:start;flex-wrap:wrap}.event-time time>strong{font-size:18px}.student-identity>strong{font-size:15px}.timeline-change{padding:10px}}
</style>
