<template>
  <article class="audit-change-card">
    <header>
      <div class="actor">
        <AuditActorAvatar :src="record.avatar" :name="record.actor" :source="record.source" />
        <div><strong>{{ record.source==='Husky Pass'?'Husky Pass · Familia':record.actor }}</strong><span>{{ record.source }} · {{ record.recordedAt.slice(0,16).replace(' ',' · ') }}</span></div>
      </div>
      <span class="field" :class="{family:record.source==='Husky Pass'}">{{ record.fieldLabel }}</span>
    </header>
    <div class="student"><strong>{{ record.student }}</strong><span>{{ record.matricula }} · {{ record.plantel }}</span></div>
    <div v-if="record.quality==='verified'" class="diff">
      <div><span>Antes</span><strong>{{ value(record.before) }}</strong></div><LucideArrowRight :size="22"/>
      <div><span>Después</span><strong>{{ value(record.after) }}</strong></div>
    </div>
    <div v-else class="historical"><LucideHistory :size="20"/>{{ record.source==='Husky Pass'?'Envío registrado':'Actualización registrada' }}</div>
    <footer><span>{{ record.quality==='verified'?'Cambio guardado':'Registro histórico' }}</span><span v-if="record.eventId">#{{ record.eventId }}</span></footer>
  </article>
</template>
<script setup lang="ts">
import { LucideArrowRight, LucideHistory } from 'lucide-vue-next'
import AuditActorAvatar from './AuditActorAvatar.vue'
defineProps<{record:{actor:string;avatar:string;source:string;fieldLabel:string;recordedAt:string;student:string;matricula:string;plantel:string;quality:string;before:string|null;after:string|null;eventId:number}}>()
const value=(v:string|null)=>v===null?'Sin dato':v===''?'Vacío':v
</script>
<style scoped>
.audit-change-card{display:grid;gap:14px;padding:18px;border:1px solid #dce8e3;border-radius:16px;background:white;color:#253a40;font:500 16px/1.4 Montserrat,system-ui,sans-serif;min-width:0}
header,.actor,.student,.diff,footer{display:flex;align-items:center;gap:12px}header{justify-content:space-between;flex-wrap:wrap}.actor{min-width:0;flex:1}.actor>div{display:grid;gap:4px;min-width:0}.actor strong{font-size:18px;font-weight:700;overflow-wrap:anywhere}.actor span,.student>span{color:#61746f}.student{flex-wrap:wrap}.student strong{font-size:18px}.field{background:#e8f4ec;color:#20724c;padding:7px 10px;border-radius:9px;font-weight:700;overflow-wrap:anywhere}.field.family{background:#e6f0fb;color:#276aa6}
.diff>div{display:grid;gap:5px;flex:1;min-width:0;background:#f7faf8;border:1px solid #e2ebe7;border-radius:12px;padding:12px}.diff>div:last-child{background:#edf7f1;border-color:#d5e8db}.diff span{color:#526860}.diff strong{font-size:18px;overflow-wrap:anywhere}.diff>svg{flex:0 0 22px}
.historical{display:flex;align-items:center;gap:9px;padding:12px;border-radius:10px;background:#f1f6f9;color:#4f6682;font-weight:650}footer{justify-content:space-between;border-top:1px solid #eef2ef;padding-top:10px;color:#61746f}
@media(max-width:430px){.audit-change-card{padding:14px}.diff{gap:7px}.diff>div{padding:9px}}
</style>
