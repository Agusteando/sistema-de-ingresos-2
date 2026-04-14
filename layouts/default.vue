<template>
  <div class="flex h-screen overflow-hidden bg-[#F4F6F8] font-sans">
    
    <aside class="w-[280px] bg-[#3F8468] text-white flex flex-col shadow-2xl z-20 shrink-0 relative overflow-hidden">
      <div class="absolute inset-0 bg-black/10 pointer-events-none"></div>
      <div class="py-8 px-6 text-center border-b border-white/10 relative z-10">
        <img src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp" alt="IECS IEDIS" class="max-h-[54px] mx-auto mb-4 brightness-0 invert opacity-90" />
        <h2 class="font-bold text-sm tracking-widest m-0 text-white/90 uppercase">Sistema de Ingresos 2</h2>
      </div>
      
      <nav class="flex-1 py-6 px-4 flex flex-col gap-2 relative z-10">
        <NuxtLink to="/" class="nav-item group">
          <LucideUsers :size="18" class="group-hover:text-white transition-colors" /> Alumnos
        </NuxtLink>
        <NuxtLink to="/deudores" class="nav-item group">
          <LucideAlertTriangle :size="18" class="group-hover:text-white transition-colors" /> Deudores
        </NuxtLink>
        <NuxtLink to="/reportes" class="nav-item group" v-if="userRole === 'global'">
          <LucidePieChart :size="18" class="group-hover:text-white transition-colors" /> Ingresos
        </NuxtLink>
        <NuxtLink to="/conceptos" class="nav-item group">
          <LucideSettings :size="18" class="group-hover:text-white transition-colors" /> Catálogo de conceptos
        </NuxtLink>
        <NuxtLink to="/facturas" class="nav-item group">
          <LucideFileText :size="18" class="group-hover:text-white transition-colors" /> Facturas CFDI
        </NuxtLink>
        <NuxtLink to="/usuarios" class="nav-item group" v-if="userRole === 'global'">
          <LucideShield :size="18" class="group-hover:text-white transition-colors" /> Usuarios
        </NuxtLink>
      </nav>

      <div class="px-6 pb-4 relative z-10" v-if="userPlanteles.length > 1 || userRole === 'global'">
        <label class="block text-[0.65rem] font-bold uppercase tracking-wider text-white/50 mb-1">Plantel activo</label>
        <select v-model="activePlantel" @change="switchPlantel" class="w-full bg-black/20 text-white border-none rounded-lg text-sm font-semibold py-2 px-3 focus:ring-1 focus:ring-white/30 cursor-pointer outline-none transition-colors hover:bg-black/30">
          <option v-if="userRole === 'global'" value="GLOBAL" class="text-neutral-ink font-bold">🌐 CONSOLIDADO GLOBAL</option>
          <option v-for="p in userPlanteles" :key="p" :value="p" class="text-neutral-ink font-bold">PLANTEL {{ p }}</option>
        </select>
      </div>
      
      <div class="p-6 bg-black/20 relative z-10">
        <label class="flex items-center justify-between cursor-pointer mb-6 group">
          <span class="text-[0.8125rem] font-bold uppercase tracking-wider text-gray-200 group-hover:text-white transition-colors">Recargos Automáticos</span>
          <div class="relative w-10 h-6 bg-white/20 rounded-full transition-colors duration-300" :class="{ '!bg-brand-leaf': state.lateFeeActive }">
            <input type="checkbox" v-model="state.lateFeeActive" class="hidden">
            <div class="absolute top-[3px] left-[3px] w-[18px] h-[18px] bg-white rounded-full transition-transform duration-300 shadow-sm" :class="{ 'translate-x-[16px]': state.lateFeeActive }"></div>
          </div>
        </label>
        
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-black/30 flex items-center justify-center overflow-hidden border-2 border-white/40 shadow-md">
              <img v-if="adminPhoto" :src="adminPhoto" alt="Perfil" class="w-full h-full object-cover" />
              <LucideUser v-else :size="20" class="text-white/80" />
            </div>
            <div class="flex flex-col overflow-hidden max-w-[140px]">
              <span class="text-[0.8125rem] text-white font-semibold leading-tight truncate">{{ adminName }}</span>
              <span class="text-[0.65rem] font-bold uppercase tracking-wider" :class="userRole === 'global' ? 'text-accent-gold' : 'text-brand-leaf'">
                {{ userRole === 'global' ? 'SUPER ADMIN' : 'USUARIO' }}
              </span>
            </div>
          </div>
          <button @click="logout" title="Cerrar Sesión" class="text-white/50 hover:text-accent-coral transition-colors shrink-0">
            <LucideLogOut :size="18" />
          </button>
        </div>
      </div>
    </aside>

    <main class="flex-1 overflow-y-auto flex flex-col relative">
      <header class="bg-white/80 backdrop-blur-md px-10 py-5 border-b border-gray-200 flex items-center justify-between sticky top-0 z-10">
        <h1 class="text-xl font-bold text-gray-800 tracking-tight">{{ currentRouteName }}</h1>
        <select v-model="state.ciclo" class="input-field !w-48 font-bold border-gray-300 text-brand-campus shadow-sm hover:border-brand-leaf">
          <option value="2023">Ciclo 23-24</option>
          <option value="2024">Ciclo 24-25</option>
          <option value="2025">Ciclo 25-26</option>
        </select>
      </header>
      
      <div class="p-10 flex-1 relative z-0">
        <slot />
      </div>
    </main>

    <ContextMenu />

    <div class="fixed bottom-8 right-8 z-[9999] flex flex-col gap-3 pointer-events-none">
      <div v-for="toast in toasts" :key="toast.id" 
           :class="['pointer-events-auto px-5 py-4 rounded-xl shadow-2xl flex items-center gap-3 text-sm font-semibold text-white animate-[slideInRight_0.3s_ease-out] border-l-4', toast.type === 'success' ? 'bg-neutral-ink border-brand-leaf' : 'bg-neutral-ink border-accent-coral']">
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
import { useCookie, useState } from '#app'
import { LucideUsers, LucidePieChart, LucideSettings, LucideFileText, LucideShield, LucideUser, LucideCheckCircle, LucideAlertCircle, LucideLogOut, LucideAlertTriangle } from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import ContextMenu from '~/components/ContextMenu.vue'

const { toasts } = useToast()
const route = useRoute()
const state = useState('globalState', () => ({ lateFeeActive: true, ciclo: '2024' }))

const adminPhoto = ref(null)
const adminName = ref(useCookie('auth_name').value || 'Usuario')
const userRole = ref(useCookie('auth_role').value || 'plantel')
const activePlantel = ref(useCookie('auth_active_plantel').value || 'PT')

const userPlanteles = computed(() => {
  const val = useCookie('auth_planteles').value
  return val ? val.split(',') : []
})

onMounted(async () => {
  try {
    const res = await $fetch('/api/admin/profile')
    if (res.photoUrl) adminPhoto.value = res.photoUrl
  } catch(e) {}
})

const currentRouteName = computed(() => {
  if (route.path === '/') return 'Alumnos'
  if (route.path === '/deudores') return 'Deudores'
  if (route.path === '/reportes') return 'Ingresos'
  if (route.path === '/conceptos') return 'Catálogo de conceptos'
  if (route.path === '/facturas') return 'Facturas CFDI'
  if (route.path === '/usuarios') return 'Usuarios'
  return 'SISTEMA DE INGRESOS 2'
})

const switchPlantel = async () => {
  try {
    await $fetch('/api/auth/switch', { method: 'POST', body: { plantel: activePlantel.value } })
    window.location.reload()
  } catch (e) {
    alert('No autorizado para ver este plantel.')
  }
}

const logout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' })
  window.location.href = '/login'
}
</script>

<style scoped>
.nav-item {
  @apply flex items-center gap-3 px-5 py-3 text-white/70 no-underline rounded-xl text-sm font-semibold transition-all duration-200;
}
.nav-item:hover {
  @apply bg-white/10 text-white shadow-sm;
}
.nav-item.router-link-active {
  @apply bg-white text-brand-campus shadow-md;
}
.nav-item.router-link-active svg {
  @apply text-brand-campus;
}
</style>