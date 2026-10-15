<template>
  <span class="audit-avatar" :class="{family:source==='Husky Pass'}" :aria-label="name">
    <span aria-hidden="true">{{ initials }}</span>
    <img v-if="src && !failed" :key="src" :src="src" alt="" referrerpolicy="same-origin" @error="failed=true" />
  </span>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
const props=defineProps<{src?:string;name:string;source:string}>()
const failed=ref(false)
watch(()=>props.src,()=>{failed.value=false})
const initials=computed(()=>props.source==='Husky Pass'?'HP':props.name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'?')
</script>
<style scoped>
.audit-avatar{width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;position:relative;overflow:hidden;border:2px solid #20885b;border-radius:50%;background:#e2efe7;color:#245e43;font:750 16px/1 Montserrat,system-ui,sans-serif}
.audit-avatar.family{background:#e5eff9;border-color:#3478b9;color:#225a92}
.audit-avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:white}
</style>
