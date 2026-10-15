<template>
  <span class="audit-avatar" :class="{family:source==='Husky Pass'}" :aria-label="name">
    <span aria-hidden="true">{{ initials }}</span>
    <img v-if="currentSrc" :key="currentSrc" :src="currentSrc" alt="" referrerpolicy="same-origin" @error="imageIndex++"/>
  </span>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
const props=defineProps<{src?:string;name:string;source:string;email?:string}>()
const imageIndex=ref(0)
const candidates=computed(()=>{
  const urls=props.src?[props.src]:[]
  if(props.source==='Aurora'&&/^[^\s@]+@casitaiedis\.edu\.mx$/i.test(props.email||'')){
    const url='/api/directory/photo?'+new URLSearchParams({email:props.email!,name:props.name})
    if(!urls.includes(url))urls.push(url)
  }
  return urls
})
const currentSrc=computed(()=>candidates.value[imageIndex.value]||'')
watch(()=>[props.src,props.email],()=>{imageIndex.value=0})
const initials=computed(()=>props.source==='Husky Pass'?'HP':props.name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'?')
</script>
<style scoped>
.audit-avatar{width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;position:relative;overflow:hidden;border:1px solid #99bea8;border-radius:50%;background:#e2efe7;color:#245e43;font-family:var(--font-body);font-size:16px;font-weight:600;line-height:1}
.audit-avatar.family{background:#e9f1ff;border-color:#9dbbe7;color:#225a92}.audit-avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:white}
</style>
