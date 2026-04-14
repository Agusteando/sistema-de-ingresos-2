<template>
  <div class="flex h-screen overflow-hidden bg-app font-sans">
    
    <!-- Sidebar -->
    <aside class="w-[280px] bg-brand-campus text-white flex flex-col shadow-xl z-20 shrink-0">
      <div class="py-8 px-6 text-center border-b border-white/10">
        <img src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp" alt="IECS IEDIS" class="max-h-[54px] mx-auto mb-4 brightness-0 invert" />
        <h2 class="font-bold text-base tracking-wider m-0 text-brand-leaf uppercase">Sistema de Ingresos 2</h2>
      </div>
      
      <nav class="flex-1 py-6 px-4 flex flex-col gap-2">
        <NuxtLink to="/" class="nav-item group">
          <LucideUsers :size="18" class="group-hover:text-white transition-colors" /> Padrón de Alumnos
        </NuxtLink>
        <NuxtLink to="/reportes" class="nav-item group">
          <LucidePieChart :size="18" class="group-hover:text-white transition-colors" /> Corte de Caja
        </NuxtLink>
        <NuxtLink to="/conceptos" class="nav-item group">
          <LucideSettings :size="18" class="group-hover:text-white transition-colors" /> Catálogo de Conceptos
        </NuxtLink>
      </nav>
      
      <div class="p-6 bg-neutral-ink/40">
        <label class="flex items-center justify-between cursor-pointer mb-6 group">
          <span class="text-[0.8125rem] font-bold uppercase tracking-wider text-gray-200 group-hover:text-white transition-colors">Aplicar Recargos</span>
          <div class="relative w-10 h-6 bg-white/20 rounded-full transition-colors duration-300" :class="{ '!bg-brand-leaf': state.lateFeeActive }">
            <input type="checkbox" v-model="state.lateFeeActive" class="hidden">
            <div class="absolute top-[3px] left-[3px] w-[18px] h-[18px] bg-white rounded-full transition-transform duration-300 shadow-sm" :class="{ 'translate-x-[16px]': state.lateFeeActive }"></div>
          </div>
        </label>
        
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-brand-teal flex items-center justify-center overflow-hidden border-2 border-white/80 shadow-md">
              <img v-if="adminPhoto" :src="adminPhoto" alt="Perfil" class="w-full h-full object-cover" />
              <LucideShieldCheck v-else :size="20" class="text-white" />
            </div>
            <div class="flex flex-col overflow-hidden max-w-[140px]">
              <span class="text-[0.8125rem] text-white font-semibold leading-tight truncate">{{ adminName }}</span>
              <span class="text-[0.65rem] text-brand-leaf font-bold uppercase tracking-wider">Autorizado</span>
            </div>
          </div>
          <button @click="logout" title="Cerrar Sesión" class="text-gray-400 hover:text-accent-coral transition-colors shrink-0">
            <LucideLogOut :size="18" />
          </button>
        </div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 overflow-y-auto flex flex-col relative">
      <header class="bg-white px-10 py-5 border-b border-gray-200 flex items-center justify-between sticky top-0 z-10">
        <h1 class="text-2xl font-bold text-brand-teal tracking-tight">{{ currentRouteName }}</h1>
        <select v-model="state.ciclo" class="input-field !w-48 font-bold border-brand-leaf text-brand-campus">
          <option value="2023">Ciclo Escolar 23-24</option>
          <option value="2024">Ciclo Escolar 24-25</option>
          <option value="2025">Ciclo Escolar 25-26</option>
        </select>
      </header>
      
      <div class="p-10 flex-1">
        <slot />
      </div>
    </main>

    <!-- Toast Notifications -->
    <div class="fixed bottom-8 right-8 z-50 flex flex-col gap-3 pointer-events-none">
      <div v-for="toast in toasts" :key="toast.id" 
           :class="['pointer-events-auto px-5 py-4 rounded-md shadow-xl flex items-center gap-3 text-sm font-semibold text-white animate-[slideInRight_0.3s_ease-out] border-l-4', toast.type === 'success' ? 'bg-neutral-ink border-brand-leaf' : 'bg-neutral-ink border-accent-coral']">
        <LucideCheckCircle v-if="toast.type === 'success'" :size="18" class="text-brand-leaf" />
        <LucideAlertCircle v-else :size="18" class="text-accent-coral" />
        {{ toast.message }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useState } from '#app'
import { LucideUsers, LucidePieChart, LucideSettings, LucideShieldCheck, LucideCheckCircle, LucideAlertCircle, LucideLogOut } from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'

const { toasts } = useToast()
const route = useRoute()
const state = useState('globalState', () => ({ lateFeeActive: true, ciclo: '2024' }))

const adminPhoto = ref(null)
const adminName = ref('Administrador')

onMounted(async () => {
  try {
    const res = await $fetch('/api/admin/profile')
    if (res.photoUrl) adminPhoto.value = res.photoUrl
    if (res.name) adminName.value = res.name
  } catch(e) {}
})

const currentRouteName = computed(() => {
  if (route.path === '/') return 'Control Operativo de Alumnos'
  if (route.path === '/reportes') return 'Consolidación de Ingresos'
  if (route.path === '/conceptos') return 'Catálogo Maestro de Conceptos'
  return 'SISTEMA DE INGRESOS 2'
})

const logout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' })
  // Use a hard redirect consistently to completely clear application state and memory
  window.location.href = '/login'
}
</script>

<style scoped>
.nav-item {
  @apply flex items-center gap-3 px-5 py-3 text-gray-300 no-underline rounded-lg text-sm font-semibold transition-all duration-200;
}
.nav-item:hover {
  @apply bg-white/10 text-white;
}
.nav-item.router-link-active {
  @apply bg-brand-teal text-white shadow-[inset_4px_0_0_0_#8EC153];
}
</style>