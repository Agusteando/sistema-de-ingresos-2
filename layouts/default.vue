<template>
  <div style="display: flex; height: 100vh; overflow: hidden; background: var(--bg-app);">
    
    <aside style="width: 280px; background: var(--brand-campus); color: var(--neutral-canvas); display: flex; flex-direction: column; box-shadow: var(--shadow-md); z-index: 10;">
      <div style="padding: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: center;">
        <img src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp" alt="Logo" style="max-height: 50px; margin-bottom: 1rem; filter: brightness(0) invert(1);" />
        <h2 style="font-weight: 700; font-size: 1.125rem; margin: 0; letter-spacing: 0.05em;">SISTEMA DE INGRESOS 2</h2>
      </div>
      
      <nav style="flex: 1; padding: 1.5rem 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
        <NuxtLink to="/" class="nav-item">
          <LucideUsers size="20"/> Padrón de Alumnos
        </NuxtLink>
        <NuxtLink to="/reportes" class="nav-item">
          <LucidePieChart size="20"/> Corte de Caja Operativo
        </NuxtLink>
        <NuxtLink to="/conceptos" class="nav-item">
          <LucideSettings size="20"/> Catálogo de Tarifas
        </NuxtLink>
      </nav>
      
      <div style="padding: 1.5rem; border-top: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.1);">
        <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; margin-bottom: 1rem;">
          <span style="font-size: 0.875rem; font-weight: 600; letter-spacing: 0.02em;">Aplicar Recargos</span>
          <div class="toggle">
            <input type="checkbox" v-model="state.lateFeeActive" style="display:none">
            <div class="toggle-track" :class="{ 'active': state.lateFeeActive }"></div>
          </div>
        </label>
        <div style="display: flex; align-items: center; gap: 0.75rem; font-size: 0.875rem; color: #D6E8C3;">
          <LucideShieldCheck size="20" /> Administrador Activo
        </div>
      </div>
    </aside>

    <main style="flex: 1; overflow-y: auto; display: flex; flex-direction: column;">
      <header style="background: var(--neutral-canvas); padding: 1.5rem 2rem; border-bottom: 1px solid var(--neutral-mist); display: flex; align-items: center; justify-content: space-between; z-index: 5;">
        <h1 style="font-size: 1.25rem; font-weight: 700; color: var(--brand-campus);">{{ currentRouteName }}</h1>
        <div style="display: flex; align-items: center; gap: 1rem;">
          <select v-model="state.ciclo" class="input-field" style="width: 180px; padding: 0.5rem; background: var(--bg-app); border-color: var(--brand-leaf); font-weight: 600; color: var(--brand-campus);">
            <option value="2023">Ciclo Académico 23-24</option>
            <option value="2024">Ciclo Académico 24-25</option>
            <option value="2025">Ciclo Académico 25-26</option>
          </select>
        </div>
      </header>
      <div style="padding: 2rem; flex: 1;">
        <slot />
      </div>
    </main>

    <div class="toast-container">
      <div v-for="toast in toasts" :key="toast.id" :class="['toast', toast.type]">
        <LucideCheckCircle v-if="toast.type === 'success'" size="18"/>
        <LucideAlertCircle v-else size="18"/>
        {{ toast.message }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { LucideUsers, LucidePieChart, LucideSettings, LucideShieldCheck, LucideCheckCircle, LucideAlertCircle } from 'lucide-vue-next'
import { useState } from '#app'
import { useToast } from '~/composables/useToast'

const { toasts } = useToast()
const route = useRoute()
const state = useState('globalState', () => ({ lateFeeActive: true, ciclo: '2024' }))

const currentRouteName = computed(() => {
  if (route.path === '/') return 'Control y Búsqueda de Alumnos'
  if (route.path === '/reportes') return 'Reportes y Corte de Caja Operativo'
  if (route.path === '/conceptos') return 'Gestión y Catálogo de Tarifas'
  return 'SISTEMA DE INGRESOS 2'
})
</script>

<style scoped>
.nav-item {
  display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem;
  color: #B8BCAE; text-decoration: none; border-radius: var(--radius-sm); font-weight: 600; transition: all 0.2s;
}
.nav-item:hover { background: rgba(255,255,255,0.08); color: var(--neutral-canvas); }
.nav-item.router-link-active { background: var(--brand-teal); color: var(--neutral-canvas); box-shadow: inset 2px 0 0 var(--brand-leaf); }

.toggle-track {
  width: 36px; height: 20px; background: rgba(0,0,0,0.3); border-radius: 999px; position: relative; transition: 0.3s;
}
.toggle-track::after {
  content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; background: var(--neutral-canvas); border-radius: 50%; transition: 0.3s;
}
.toggle-track.active { background: var(--brand-leaf); }
.toggle-track.active::after { transform: translateX(16px); }
</style>