<template>
  <div class="flex h-screen overflow-hidden bg-[#F4F6F8] font-sans">
    
    <aside class="w-[240px] bg-[#3F8468] text-white flex flex-col shadow-xl z-20 shrink-0 relative overflow-hidden">
      <div class="absolute inset-0 bg-black/5 pointer-events-none"></div>
      <div class="py-6 px-5 text-center border-b border-white/10 relative z-10">
        <img src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp" alt="IECS IEDIS" class="max-h-[48px] mx-auto mb-3 brightness-0 invert opacity-90" />
        <h2 class="font-bold text-xs tracking-widest m-0 text-white/90 uppercase">Sistema de Ingresos</h2>
      </div>
      
      <nav class="flex-1 py-5 px-3 flex flex-col gap-1.5 relative z-10">
        <NuxtLink to="/" class="nav-item group">
          <LucideUsers :size="16" class="group-hover:text-white transition-colors" /> Alumnos
        </NuxtLink>
        <NuxtLink to="/deudores" class="nav-item group">
          <LucideAlertTriangle :size="16" class="group-hover:text-white transition-colors" /> Deudores
        </NuxtLink>
        <NuxtLink to="/reportes" class="nav-item group" v-if="userRole === 'global'">
          <LucidePieChart :size="16" class="group-hover:text-white transition-colors" /> Ingresos
        </NuxtLink>
        <NuxtLink to="/conceptos" class="nav-item group">
          <LucideSettings :size="16" class="group-hover:text-white transition-colors" /> Conceptos
        </NuxtLink>
        <NuxtLink to="/facturas" class="nav-item group">
          <LucideFileText :size="16" class="group-hover:text-white transition-colors" /> Facturas CFDI
        </NuxtLink>
        <NuxtLink to="/usuarios" class="nav-item group" v-if="userRole === 'global'">
          <LucideShield :size="16" class="group-hover:text-white transition-colors" /> Usuarios
        </NuxtLink>
      </nav>

      <div class="px-5 pb-4 relative z-10" v-if="userPlanteles.length > 1 || userRole === 'global'">
        <label class="block text-[0.65rem] font-semibold uppercase tracking-wider text-white/60 mb-1">Plantel activo</label>
        <select v-model="activePlantel" @change="switchPlantel" class="w-full bg-black/15 text-white border-none rounded-lg text-xs font-semibold py-2 px-3 focus:ring-1 focus:ring-white/30 cursor-pointer outline-none transition-colors hover:bg-black/20">
          <option v-if="userRole === 'global'" value="GLOBAL" class="text-gray-800 font-semibold">🌐 CONSOLIDADO</option>
          <option v-for="p in userPlanteles" :key="p" :value="p" class="text-gray-800 font-semibold">PLANTEL {{ p }}</option>
        </select>
      </div>
      
      <div class="p-5 bg-black/15 relative z-10">
        <label class="flex items-center justify-between cursor-pointer mb-5 group">
          <span class="text-[0.75rem] font-semibold uppercase text-gray-200 group-hover:text-white transition-colors">Recargos Automáticos</span>
          <div class="relative w-9 h-5 bg-white/20 rounded-full transition-colors duration-200" :class="{ '!bg-brand-leaf': state.lateFeeActive }">
            <input type="checkbox" v-model="state.lateFeeActive" class="hidden">
            <div class="absolute top-[2px] left-[2px] w-[16px] h-[16px] bg-white rounded-full transition-transform duration-200 shadow-sm" :class="{ 'translate-x-[16px]': state.lateFeeActive }"></div>
          </div>
        </label>
        
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-black/20 flex items-center justify-center overflow-hidden border border-white/30 shadow-sm">
              <img v-if="adminPhoto" :src="adminPhoto" alt="Perfil" class="w-full h-full object-cover" />
              <LucideUser v-else :size="16" class="text-white/80" />
            </div>
            <div class="flex flex-col overflow-hidden max-w-[120px]">
              <span class="text-[0.8rem] text-white font-semibold leading-tight truncate">{{ adminName }}</span>
              <span class="text-[0.6rem] font-semibold uppercase" :class="userRole === 'global' ? 'text-accent-gold' : 'text-brand-leaf'">
                {{ userRole === 'global' ? 'ADMIN' : 'USUARIO' }}
              </span>
            </div>
          </div>
          <button @click="logout" title="Cerrar Sesión" class="text-white/60 hover:text-white transition-colors shrink-0">
            <LucideLogOut :size="16" />
          </button>
        </div>
      </div>
    </aside>

    <main class="flex-1 overflow-y-auto flex flex-col relative">
      <header class="bg-white/90 backdrop-blur-sm px-8 py-3.5 h-[60px] border-b border-gray-200 flex items-center justify-between sticky top-0 z-10">
        <h1 class="text-lg font-bold text-gray-800 tracking-tight">{{ currentRouteName }}</h1>
        <select v-model="state.ciclo" class="input-field !w-40 font-bold border-gray-200 text-brand-campus shadow-none hover:border-brand-leaf bg-gray-50 h-[34px] !py-1">
          <option v-for="c in CICLOS_LIST" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
      </header>
      
      <div class="p-8 flex-1 relative z-0">
        <slot />
      </div>
    </main>

    <ContextMenu />
    <SyncBadge />

    <div class="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      <div v-for="toast in toasts" :key="toast.id" 
           :class="['pointer-events-auto px-4 py-3 rounded-lg shadow-lg flex items-center gap-2.5 text-sm font-medium text-white animate-[slideInRight_0.2s_ease-out] border-l-4', toast.type === 'success' ? 'bg-neutral-ink border-brand-leaf' : 'bg-neutral-ink border-accent-coral']">
        <LucideCheckCircle v-if="toast.type === 'success'" :size="16" class="text-brand-leaf" />
        <LucideAlertCircle v-else :size="16" class="text-accent-coral" />
        {{ toast.message }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useCookie, useState } from '#app'
import { LucideUsers, LucidePieChart, LucideSettings, LucideFileText, LucideShield, LucideUser, LucideCheckCircle, LucideAlertCircle, LucideLogOut, LucideAlertTriangle } from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import ContextMenu from '~/components/ContextMenu.vue'
import SyncBadge from '~/components/SyncBadge.vue'
import { CICLOS_LIST } from '~/utils/constants'

const { toasts } = useToast()
const route = useRoute()

const cicloCookie = useCookie('active_ciclo', { maxAge: 31536000 })
const getValidCiclo = (val) => CICLOS_LIST.find(c => c.value === val) ? val : '2025'

const state = useState('globalState', () => ({ 
  lateFeeActive: true, 
  ciclo: getValidCiclo(cicloCookie.value) 
}))

watch(() => state.value.ciclo, (newVal) => {
  cicloCookie.value = getValidCiclo(newVal)
})

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
  return 'SISTEMA DE INGRESOS'
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
  @apply flex items-center gap-2.5 px-4 py-2.5 text-white/70 no-underline rounded-lg text-[0.85rem] font-medium transition-all duration-150;
}
.nav-item:hover {
  @apply bg-white/10 text-white;
}
.nav-item.router-link-active {
  @apply bg-white text-brand-campus shadow-sm font-semibold;
}
.nav-item.router-link-active svg {
  @apply text-brand-campus;
}
</style>