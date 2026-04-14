<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="brand">
        <h2>Sistema de Ingresos</h2>
      </div>
      <nav class="nav-links">
        <NuxtLink to="/" class="nav-item">
          <LucideHome size="20"/> Control de Pagos
        </NuxtLink>
        <NuxtLink to="/reportes" class="nav-item">
          <LucidePieChart size="20"/> Análisis y Reportes
        </NuxtLink>
      </nav>
      <div class="settings">
        <label class="toggle-switch">
          <input type="checkbox" v-model="state.lateFeeActive" @change="toggleLateFee">
          <span class="slider"></span>
          <span class="label-text">Aplicar Recargos</span>
        </label>
        <div class="auth-section">
          <div v-if="!user" id="g_id_onload"
              :data-client_id="config.public.googleClientId"
              data-context="signin"
              data-ux_mode="popup"
              data-callback="handleCredentialResponse"
              data-auto_prompt="false">
          </div>
          <div v-if="!user" class="g_id_signin" data-type="standard"></div>
          <div v-else class="user-profile">
            <LucideUserCircle size="24"/>
            <span>Conectado</span>
          </div>
        </div>
      </div>
    </aside>
    <main class="main-content">
      <slot />
    </main>
  </div>
</template>

<script setup>
import { LucideHome, LucidePieChart, LucideUserCircle } from 'lucide-vue-next'
import { useState } from '#app'

const config = useRuntimeConfig()
const user = useState('user', () => null)
const state = useState('globalState', () => ({ lateFeeActive: true, ciclo: '2024' }))

if (typeof window !== 'undefined') {
  window.handleCredentialResponse = (response) => {
    // Standard basic decoding for UX state (Not secure for API access without backend verify)
    const payload = JSON.parse(atob(response.credential.split('.')[1]))
    user.value = payload
  }
}

const toggleLateFee = () => {
  // Triggers reactivity across the app
}
</script>

<style scoped>
.app-layout { display: flex; min-height: 100vh; }
.sidebar { width: 280px; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; }
.brand { padding: 1.5rem; border-bottom: 1px solid var(--border); }
.brand h2 { margin: 0; font-size: 1.25rem; color: var(--primary); font-weight: 700; }
.nav-links { flex: 1; padding: 1.5rem 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
.nav-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; color: var(--text-muted); text-decoration: none; border-radius: var(--radius-md); font-weight: 500; transition: all 0.2s; }
.nav-item:hover, .router-link-active { background: #eff6ff; color: var(--primary); }
.main-content { flex: 1; padding: 2rem; overflow-y: auto; background: var(--background); }
.settings { padding: 1.5rem; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 1.5rem; }
.toggle-switch { display: flex; align-items: center; gap: 0.75rem; cursor: pointer; }
.toggle-switch input { display: none; }
.slider { width: 44px; height: 24px; background: #cbd5e1; border-radius: 9999px; position: relative; transition: 0.3s; }
.slider::after { content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: white; border-radius: 50%; transition: 0.3s; }
.toggle-switch input:checked + .slider { background: var(--primary); }
.toggle-switch input:checked + .slider::after { transform: translateX(20px); }
.label-text { font-size: 0.875rem; font-weight: 500; }
.user-profile { display: flex; align-items: center; gap: 0.5rem; color: var(--success); font-weight: 500; font-size: 0.875rem; }
</style>