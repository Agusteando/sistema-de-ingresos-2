<template>
  <article class="audit-change-card">
    <header><div class="actor"><AuditActorAvatar :src="record.avatar" :name="record.actor" :source="record.source" :email="record.actorEmail"/><div><strong>{{ record.source==='Husky Pass'?'Familia':record.actor }}</strong><span :class="{family:record.source==='Husky Pass'}">{{ record.source }}</span></div></div><time>{{ dateLabel(record.recordedAt) }}</time></header>
    <div class="student"><strong>{{ namedStudent(record)?record.student:'Nombre no disponible' }}</strong><span v-if="namedStudent(record)">{{ record.matricula }} · {{ record.plantel }}</span></div>
    <div class="field">{{ record.fieldLabel }}</div>
    <div v-if="record.quality==='verified'" class="diff"><div><span>Antes</span><strong>{{ value(record.before) }}</strong></div><LucideArrowRight :size="18"/><div><span>Después</span><strong>{{ value(record.after) }}</strong></div></div>
    <div v-else class="historical"><LucideHistory :size="17"/>{{ record.source==='Husky Pass'?'Envío registrado':'Actualización registrada' }}</div>

  </article>
</template>
<script setup lang="ts">
import { LucideArrowRight, LucideHistory } from 'lucide-vue-next'
import AuditActorAvatar from './AuditActorAvatar.vue'
defineProps<{compact?:boolean;record:{actorEmail?:string;actor:string;avatar:string;source:string;fieldLabel:string;recordedAt:string;student:string;matricula:string;plantel:string;quality:string;before:string|null;after:string|null;eventId:number}}>()
const namedStudent=(record:{student:string;matricula:string})=>Boolean(record.student?.trim()&&record.student.trim().toUpperCase()!==record.matricula?.trim().toUpperCase())
const dateLabel=(value:string)=>{const date=new Date(value.replace(' ','T')+'-06:00');return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/Mexico_City'}).format(date):''}
const value=(v:string|null)=>v===null?'Sin dato':v===''?'Vacío':v
</script>
<style scoped>
.audit-change-card{display:grid;gap:12px;padding:15px;border:1px solid #dfe7e1;border-radius:12px;background:#fff;color:#223d2e;font-family:var(--font-body);font-size:15px;line-height:1.4;min-width:0}header{display:flex;justify-content:space-between;align-items:start;gap:10px}.student{display:grid;gap:4px;min-width:0}.student strong{font-size:16px;font-weight:500;overflow-wrap:anywhere}.student span{font-size:12px;color:#78897e}time{font-size:11px;color:#7c8d81;max-width:95px;flex:0 0 auto;text-align:right;line-height:1.5}.field{font-size:13px;color:#4b6656;font-weight:550;overflow-wrap:anywhere}.diff{display:flex;align-items:center;gap:8px;padding:11px 0;border-top:1px solid #edf1ee;border-bottom:1px solid #edf1ee}.diff>div{display:grid;gap:5px;min-width:0;flex:1}.diff span{font-size:11px;color:#7c8c80}.diff strong{font-size:15px;font-weight:550;overflow-wrap:anywhere}.diff>div:first-child strong{color:#77877b;font-weight:450}.diff>div:last-child strong{color:#00692f}.diff>svg{flex-shrink:0;color:#9db3a3}.actor{min-width:0;flex:1;display:flex;align-items:center;gap:8px}.actor :deep(.audit-avatar){width:35px;height:35px;flex-basis:35px;font-size:11px}.actor>div{display:grid;gap:1px;min-width:0}.actor strong{font-size:17px;font-weight:550;overflow-wrap:anywhere}.actor span{font-size:12px;color:#7b8f80}.actor .family{color:#2563b8}.historical{display:flex;align-items:center;gap:7px;padding:9px 0;border-top:1px solid #edf1ee;border-bottom:1px solid #edf1ee;font-size:13px;color:#5b7487}
@media(max-width:760px){.student strong{font-size:18px}.diff strong{font-size:16px}.actor strong{font-size:17px}.actor span{font-size:12px}}
</style>
