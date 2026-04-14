<template>
  <div style="display: flex; height: 100vh; overflow: hidden; background: var(--bg-app);">
    <aside style="width: 250px; background: var(--neutral-ink); color: var(--neutral-canvas); display: flex; flex-direction: column; z-index: 10;">
      <div style="padding: 1.5rem; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1);">
        <img src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp" alt="IECS IEDIS" style="max-height: 48px; margin-bottom: 0.5rem; filter: brightness(0) invert(1);" />
        <h2 style="font-weight: 700; font-size: 0.875rem; letter-spacing: 0.05em; margin: 0; color: var(--brand-leaf);">SISTEMA DE INGRESOS 2</h2>
      </div>
      <nav style="flex: 1; padding: 1.5rem 1rem; display: flex; flex-direction: column; gap: 0.25rem;">
        <NuxtLink to="/" class="nav-item"><LucideUsers size="16"/> Alumnos</NuxtLink>
        <NuxtLink to="/reportes" class="nav-item"><LucidePieChart size="16"/> Corte de Caja</NuxtLink>
        <NuxtLink to="/conceptos" class="nav-item"><LucideSettings size="16"/> Conceptos</NuxtLink>
      </nav>
      <div style="padding: 1.5rem; background: rgba(0,0,0,0.25);">
        <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; margin-bottom: 1.25rem;">
          <span style="font-size: 0.8125rem; font-weight: 600;">Aplicar Recargos</span>
          <div class="toggle">
            <input type="checkbox" v-model="state.lateFeeActive" style="display:none">
            <div class="toggle-track" :class="{ 'active': state.lateFeeActive }"></div>
          </div>
        </label>
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <div class="avatar-circle">
            <img v-if="adminPhoto" :src="adminPhoto" alt="Perfil" />
            <LucideUser v-else size="18"/>
          </div>
          <span style="font-size: 0.8125rem; color: var(--neutral-mist); font-weight: 500;">Administrador</span>
        </div>
      </div>
    </aside>

    <main style="flex: 1; overflow-y: auto; display: flex; flex-direction: column;">
      <header style="background: var(--neutral-canvas); padding: 1rem 2rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between;">
        <h1 style="font-size: 1.125rem; font-weight: 700; color: var(--brand-campus);">{{ currentRouteName }}</h1>
        <select v-model="state.ciclo" class="input-field" style="width: 140px; font-weight: 600;">
          <option value="2023">Ciclo 23-24</option>
          <option value="2024">Ciclo 24-25</option>
          <option value="2025">Ciclo 25-26</option>
        </select>
      </header>
      <div style="padding: 2rem; flex: 1;">
        <slot />
      </div>
    </main>

    <div class="toast-container">
      <div v-for="toast in toasts" :key="toast.id" :class="['toast', toast.type]">
        <LucideCheckCircle v-if="toast.type === 'success'" size="16"/>
        <LucideAlertCircle v-else size="16"/>
        {{ toast.message }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { LucideUsers, LucidePieChart, LucideSettings, LucideUser, LucideCheckCircle, LucideAlertCircle } from 'lucide-vue-next'
import { useState } from '#app'
import { useToast } from '~/composables/useToast'

const { toasts } = useToast()
const route = useRoute()
const state = useState('globalState', () => ({ lateFeeActive: true, ciclo: '2024' }))
const adminPhoto = ref(null)

onMounted(async () => {
  try {
    const { photoUrl } = await $fetch('/api/admin/profile')
    if (photoUrl) adminPhoto.value = photoUrl
  } catch(e) {}
})

const currentRouteName = computed(() => {
  if (route.path === '/') return 'Control de Alumnos'
  if (route.path === '/reportes') return 'Corte de Caja'
  if (route.path === '/conceptos') return 'Conceptos de Cobro'
  return 'SISTEMA DE INGRESOS 2'
})
</script>

<style scoped>
.nav-item {
  display: flex; align-items: center; gap: 0.625rem; padding: 0.5rem 0.75rem;
  color: var(--neutral-mist); text-decoration: none; border-radius: var(--radius-sm); font-size: 0.875rem; font-weight: 500; transition: all 0.15s;
}
.nav-item:hover { background: rgba(255,255,255,0.05); color: var(--neutral-canvas); }
.nav-item.router-link-active { background: var(--brand-campus); color: var(--neutral-canvas); }

.toggle-track { width: 32px; height: 18px; background: rgba(255,255,255,0.2); border-radius: 999px; position: relative; transition: 0.2s; }
.toggle-track::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; background: var(--neutral-canvas); border-radius: 50%; transition: 0.2s; }
.toggle-track.active { background: var(--brand-leaf); }
.toggle-track.active::after { transform: translateX(14px); }

.avatar-circle { width: 32px; height: 32px; border-radius: 50%; background: var(--brand-teal); display: flex; align-items: center; justify-content: center; overflow: hidden; color: white; }
.avatar-circle img { width: 100%; height: 100%; object-fit: cover; }
</style>