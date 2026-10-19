<template>
  <article class="audit-change-card" :data-record-id="record.id" :class="{ 'is-latest': latest }">
    <span v-if="latest" class="latest-label">{{ current?'Valor vigente · más reciente':'Más reciente' }}</span>
    <header><div class="actor"><AuditActorAvatar :src="record.avatar" :name="record.actor" :source="record.source" :email="record.actorEmail"/><div><strong>{{ record.source==='Husky Pass'?'Familia':record.actor }}</strong><span :class="{family:record.source==='Husky Pass'}">{{ record.source }}</span></div></div><time :datetime="record.recordedAt.replace(' ','T')+'-06:00'">{{ dateLabel(record.recordedAt) }}</time></header>
    <div class="student"><strong>{{ namedStudent(record)?record.student:'Nombre no disponible' }}</strong><span v-if="namedStudent(record)">{{ record.matricula }} · {{ record.plantel }}</span></div>
    <div class="field">{{ record.fieldLabel }}</div>
    <div v-if="record.quality==='verified'" class="diff"><div><span>Antes</span><strong>{{ value(record.before) }}</strong></div><LucideArrowRight :size="18"/><div><span>Después</span><strong>{{ value(record.after) }}</strong></div></div>
    <div v-else class="historical"><LucideHistory :size="17"/><span>Registro histórico</span></div>

    <button v-if="showHistory!==false" type="button" class="field-history-link" @click="$emit('history')"><LucideHistory :size="14"/>Ver historial del campo</button>
  </article>
</template>
<script setup lang="ts">
import { LucideArrowRight, LucideHistory } from 'lucide-vue-next'
import AuditActorAvatar from './AuditActorAvatar.vue'
import { auditDateLabel as dateLabel } from '~/shared/utils/auditTimeline'
withDefaults(defineProps<{current?:boolean;latest?:boolean;compact?:boolean;showHistory?:boolean;record:{id?:string;actorEmail?:string;actor:string;avatar:string;source:string;fieldLabel:string;recordedAt:string;student:string;matricula:string;plantel:string;quality:string;before:string|null;after:string|null;eventId:number}}>(),{showHistory:true})
defineEmits<{history:[]}>()
const namedStudent=(record:{student:string;matricula:string})=>Boolean(record.student?.trim()&&record.student.trim().toUpperCase()!==record.matricula?.trim().toUpperCase())

const value=(v:string|null)=>v===null?'Sin dato':v===''?'Vacío':v
</script>
<style scoped>
.audit-change-card{display:grid;gap:12px;padding:15px;border:1px solid #dfe7e1;border-radius:12px;background:#fff;color:#223d2e;font-family:var(--font-body);font-size:15px;line-height:1.4;min-width:0}header{display:grid;gap:5px}.student{display:grid;gap:4px;min-width:0}.student strong{font-size:16px;font-weight:500;overflow-wrap:anywhere}.student span{font-size:12px;color:#78897e}time{font-size:11px;color:#7c8d81;max-width:100%;margin-left:43px;text-align:left;line-height:1.5}.field{font-size:13px;color:#4b6656;font-weight:550;overflow-wrap:anywhere}.diff{display:flex;align-items:center;gap:8px;padding:11px 0;border-top:1px solid #edf1ee;border-bottom:1px solid #edf1ee}.diff>div{display:grid;gap:5px;min-width:0;flex:1}.diff span{font-size:11px;color:#7c8c80}.diff strong{font-size:15px;font-weight:550;overflow-wrap:anywhere}.diff>div:first-child strong{color:#77877b;font-weight:450}.diff>div:last-child strong{color:#00692f}.diff>svg{flex-shrink:0;color:#9db3a3}.actor{min-width:0;flex:1;display:flex;align-items:center;gap:8px}.actor :deep(.audit-avatar){width:35px;height:35px;flex-basis:35px;font-size:11px}.actor>div{display:grid;gap:1px;min-width:0}.actor strong{font-size:17px;font-weight:550;overflow-wrap:anywhere}.actor span{font-size:12px;color:#7b8f80}.actor .family{color:#2563b8}.historical{display:flex;align-items:center;gap:7px;padding:9px 0;border-top:1px solid #edf1ee;border-bottom:1px solid #edf1ee;font-size:13px;color:#5b7487}
@media(max-width:760px){.student strong{font-size:18px}.diff strong{font-size:16px}.actor strong{font-size:17px}.actor span{font-size:12px}}
.is-latest{border-color:#71ad89;box-shadow:inset 3px 0 #00692f;background:#fbfefb}.latest-label{justify-self:start;font-size:11px;font-weight:600;color:#00692f;background:#e7f3eb;border-radius:20px;padding:3px 8px}.field-history-link{display:flex;align-items:center;gap:5px;justify-self:start;background:transparent;border:0;padding:3px 0;min-height:32px;color:#547563;font:500 12px var(--font-body);cursor:pointer}.field-history-link:hover{color:#00692f;text-decoration:underline}.field-history-link:focus-visible{outline:3px solid #62a88b;outline-offset:3px}
</style>
