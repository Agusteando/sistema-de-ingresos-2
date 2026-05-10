<template>
  <div class="income-shell font-sans">
    <aside class="income-sidebar" :style="sidebarRootStyle">
      <div ref="sidebarScaleShell" class="sidebar-scale-shell">
        <div class="sidebar-design-canvas" :style="sidebarDesignCanvasStyle">
      <div class="sidebar-sheen"></div>
      <div class="sidebar-rings sidebar-rings-top"></div>
      <div class="sidebar-rings sidebar-rings-mid"></div>
      <div class="sidebar-rings sidebar-rings-low"></div>
      <div class="sidebar-arc"></div>
      <div class="sidebar-leaves">
        <i></i>
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </div>

      <div class="sidebar-brand">
        <img
          src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp"
          alt="IECS IEDIS"
          class="sidebar-logo"
        />
        <h2>Sistema de Ingresos</h2>
      </div>

      <nav class="sidebar-nav">
        <NuxtLink to="/" class="nav-item group">
          <LucideUsers :size="22" stroke-width="2.2" /> Alumnos
        </NuxtLink>
        <NuxtLink to="/deudores" class="nav-item group">
          <LucideAlertTriangle :size="22" stroke-width="2" /> Deudores
        </NuxtLink>
        <NuxtLink to="/reportes" class="nav-item group">
          <LucidePieChart :size="22" stroke-width="2" /> Reportes
        </NuxtLink>
        <NuxtLink to="/conceptos" class="nav-item group">
          <LucideSettings :size="22" stroke-width="2" /> Conceptos
        </NuxtLink>
        <NuxtLink to="/facturas" class="nav-item group">
          <LucideFileText :size="22" stroke-width="2" /> Facturas CFDI
        </NuxtLink>
        <a href="http://localhost/Sistema%20de%20ingresos/login.php" class="nav-item group" target="_blank" rel="noopener">
          <LucideExternalLink :size="22" stroke-width="2" /> Sistema de Contingencia
        </a>
        <NuxtLink to="/usuarios" class="nav-item group" v-if="userRole === 'global'">
          <LucideShield :size="22" stroke-width="2" /> Usuarios
        </NuxtLink>
      </nav>

      <div class="sidebar-footer">
        <div class="plantel-block" v-if="userPlanteles.length > 1 || userRole === 'global'">
          <label>Plantel activo</label>
          <div class="plantel-select">
            <LucideBuilding2 :size="21" />
            <select
              v-model="activePlantel"
              @change="switchPlantel"
            >
              <option v-if="userRole === 'global'" value="GLOBAL">CONSOLIDADO</option>
              <option v-for="p in userPlanteles" :key="p" :value="p">PLANTEL {{ p }}</option>
            </select>
            <LucideChevronDown :size="16" />
          </div>
        </div>

        <label class="late-fee-toggle group">
          <span>Recargos Automáticos</span>
          <div
            class="toggle-track"
            :class="{ 'toggle-track-on': state.lateFeeActive }"
          >
            <input type="checkbox" v-model="state.lateFeeActive" class="hidden" />
            <div
              class="toggle-thumb"
              :class="{ 'toggle-thumb-on': state.lateFeeActive }"
            ></div>
          </div>
        </label>

        <div class="admin-card">
          <div class="admin-profile">
            <div class="admin-avatar">
              <img v-if="adminPhoto" :src="adminPhoto" alt="Perfil" />
              <LucideUser v-else :size="18" />
            </div>
            <div class="admin-meta">
              <span>{{ adminName }}</span>
              <strong>{{ userRole === 'global' ? 'ADMIN' : 'USUARIO' }}</strong>
            </div>
          </div>
          <button @click="logout" title="Cerrar Sesión" class="logout-button">
            <LucideLogOut :size="18" />
          </button>
        </div>
      </div>
        </div>
      </div>
    </aside>

    <main class="income-main">
      <header class="app-header">
        <h1>{{ currentRouteName }}</h1>

        <div class="header-actions">
          <SyncBadge />
          <div class="ciclo-picker">
            <LucideCalendarDays :size="18" />
            <select
              v-model="state.ciclo"
              aria-label="Ciclo escolar"
            >
              <option v-for="c in CICLOS_LIST" :key="c.value" :value="c.value">{{ c.label }}</option>
            </select>
            <LucideChevronDown :size="16" />
          </div>
          <NuxtLink to="/" class="header-home-button" title="Inicio" aria-label="Inicio">
            <LucideSchool :size="23" />
          </NuxtLink>
        </div>
      </header>

      <div class="income-content">
        <slot />
      </div>
    </main>

    <ContextMenu />

    <div class="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="[
          'pointer-events-auto px-4 py-3 rounded-lg shadow-lg flex items-center gap-2.5 text-sm font-medium text-white animate-[slideInRight_0.2s_ease-out] border-l-4',
          toast.type === 'success' ? 'bg-neutral-ink border-brand-leaf' : 'bg-neutral-ink border-accent-coral'
        ]"
      >
        <LucideCheckCircle v-if="toast.type === 'success'" :size="16" class="text-brand-leaf" />
        <LucideAlertCircle v-else :size="16" class="text-accent-coral" />
        {{ toast.message }}
      </div>
    </div>

    <div
      v-if="syncState !== 'idle' && syncMessage"
      class="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-md px-5 py-2.5 rounded-full shadow-lg border flex items-center gap-2.5 z-[9999] text-xs font-bold uppercase tracking-widest transition-all duration-300"
      :class="{
        'border-gray-200 text-gray-600': syncState === 'pending',
        'border-brand-leaf text-brand-campus': syncState === 'synced',
        'border-accent-coral text-accent-coral': syncState === 'failed'
      }"
    >
      <LucideRefreshCw v-if="syncState === 'pending'" class="animate-spin text-brand-campus" :size="14" />
      <LucideCheckCircle v-else-if="syncState === 'synced'" class="text-brand-leaf" :size="14" />
      <LucideAlertCircle v-else class="text-accent-coral" :size="14" />
      {{ syncMessage }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useCookie, useState } from '#app'
import {
  LucideUsers,
  LucidePieChart,
  LucideSettings,
  LucideFileText,
  LucideShield,
  LucideUser,
  LucideCheckCircle,
  LucideAlertCircle,
  LucideLogOut,
  LucideAlertTriangle,
  LucideRefreshCw,
  LucideCalendarDays,
  LucideSchool,
  LucideBuilding2,
  LucideChevronDown,
  LucideExternalLink
} from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { useOptimisticSync } from '~/composables/useOptimisticSync'
import ContextMenu from '~/components/ContextMenu.vue'
import SyncBadge from '~/components/SyncBadge.vue'
import { CICLOS_LIST, normalizeCicloOption } from '~/utils/constants'

const { toasts } = useToast()
const { syncState, syncMessage } = useOptimisticSync()
const route = useRoute()

const SIDEBAR_DESIGN_WIDTH = 232
const SIDEBAR_DESIGN_HEIGHT = 800
const sidebarScaleShell = ref(null)
const sidebarScale = ref(1)
const sidebarRootStyle = computed(() => ({
  width: `${Math.ceil(SIDEBAR_DESIGN_WIDTH * sidebarScale.value)}px`,
  flexBasis: `${Math.ceil(SIDEBAR_DESIGN_WIDTH * sidebarScale.value)}px`
}))
const sidebarDesignCanvasStyle = computed(() => ({
  width: `${SIDEBAR_DESIGN_WIDTH}px`,
  height: `${SIDEBAR_DESIGN_HEIGHT}px`,
  transform: `scale(${sidebarScale.value})`
}))

let sidebarResizeObserver = null
let sidebarFrame = null
const updateSidebarScale = () => {
  if (typeof window === 'undefined') return
  const availableHeight = Math.max(360, window.innerHeight || SIDEBAR_DESIGN_HEIGHT)
  const availableWidth = Math.max(260, window.innerWidth || SIDEBAR_DESIGN_WIDTH)
  const widthGuard = availableWidth <= 720 ? Math.max(0.58, availableWidth / 1040) : 0
  const nextScale = Math.min(1, Math.max(0.56, availableHeight / SIDEBAR_DESIGN_HEIGHT, widthGuard))
  sidebarScale.value = Number(nextScale.toFixed(4))
}
const scheduleSidebarScaleUpdate = () => nextTick(() => {
  if (typeof window === 'undefined') return
  if (sidebarFrame) window.cancelAnimationFrame(sidebarFrame)
  sidebarFrame = window.requestAnimationFrame(updateSidebarScale)
})

const cicloCookie = useCookie('active_ciclo', { maxAge: 31536000 })

const state = useState('globalState', () => ({
  lateFeeActive: true,
  ciclo: normalizeCicloOption(cicloCookie.value)
}))

watch(() => state.value.ciclo, (newVal) => {
  const cicloKey = normalizeCicloOption(newVal)
  state.value.ciclo = cicloKey
  cicloCookie.value = cicloKey
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
  scheduleSidebarScaleUpdate()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', scheduleSidebarScaleUpdate, { passive: true })
    if (typeof ResizeObserver !== 'undefined' && sidebarScaleShell.value) {
      sidebarResizeObserver = new ResizeObserver(scheduleSidebarScaleUpdate)
      sidebarResizeObserver.observe(sidebarScaleShell.value)
    }
  }

  try {
    const res = await $fetch('/api/admin/profile')
    if (res.photoUrl) adminPhoto.value = res.photoUrl
  } catch (e) {}
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', scheduleSidebarScaleUpdate)
    if (sidebarFrame) window.cancelAnimationFrame(sidebarFrame)
  }
  sidebarResizeObserver?.disconnect?.()
})

const currentRouteName = computed(() => {
  if (route.path === '/') return 'Alumnos'
  if (route.path === '/deudores') return 'Deudores'
  if (route.path === '/reportes') return 'Centro de reportes'
  if (route.path === '/conceptos') return 'Conceptos'
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
.income-shell {
  display: flex;
  height: 100vh;
  min-width: 0;
  overflow: hidden;
  background:
    radial-gradient(circle at 54% 7%, rgba(142, 193, 83, 0.09), transparent 17rem),
    linear-gradient(180deg, #ffffff 0%, #f9fbfa 100%);
}

.income-sidebar {
  position: relative;
  z-index: 20;
  display: flex;
  width: 260px;
  flex-shrink: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(200, 219, 204, 0.86);
  border-radius: 34px;
  background:
    radial-gradient(ellipse at 71% -4%, rgba(249, 255, 246, 0.95) 0 6.6rem, rgba(229, 247, 221, 0.58) 6.7rem, transparent 11rem),
    radial-gradient(ellipse at 8% 41%, rgba(233, 249, 229, 0.72), transparent 13rem),
    linear-gradient(155deg, rgba(255, 255, 255, 0.96) 0%, rgba(246, 253, 245, 0.94) 28%, rgba(228, 248, 222, 0.88) 58%, rgba(248, 253, 249, 0.96) 100%);
  box-shadow:
    14px 0 38px rgba(56, 89, 66, 0.075),
    inset 0 0 0 1px rgba(255, 255, 255, 0.82),
    inset -26px 0 48px rgba(201, 238, 191, 0.28);
  color: #1b2a45;
}

.sidebar-scale-shell {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.sidebar-design-canvas {
  position: relative;
  display: flex;
  height: 900px;
  flex-direction: column;
  overflow: hidden;
  transform-origin: top left;
  will-change: transform;
}

.income-sidebar::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  background:
    linear-gradient(98deg, rgba(255, 255, 255, 0.72), transparent 31%),
    radial-gradient(ellipse at 86% 77%, rgba(180, 235, 201, 0.32), transparent 17rem);
  pointer-events: none;
}

.income-sidebar::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 4;
  border-radius: inherit;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.52);
  pointer-events: none;
}

.sidebar-brand {
  position: relative;
  z-index: 3;
  padding: 38px 24px 31px;
  text-align: center;
}

.sidebar-logo {
  display: block;
  max-height: 48px;
  max-width: 106px;
  margin: 0 auto 14px;
  object-fit: contain;
}

.sidebar-brand h2 {
  margin: 0;
  color: #267447;
  font-size: 0.73rem;
  font-weight: 800;
  letter-spacing: 0.17em;
  text-transform: uppercase;
}

.sidebar-nav {
  position: relative;
  z-index: 3;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding: 2px 18px 14px;
}

.nav-item {
  display: flex;
  min-height: 43px;
  align-items: center;
  gap: 13px;
  border-radius: 12px;
  padding: 0 17px;
  color: #33405b;
  font-size: 0.9rem;
  font-weight: 650;
  text-decoration: none;
  transition: color 160ms ease, background 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.nav-item svg {
  flex-shrink: 0;
  color: #33405b;
  transition: color 160ms ease;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.62);
  color: #286d2b;
  transform: translateX(1px);
}

.nav-item:hover svg,
.nav-item.router-link-active svg {
  color: #2e7c2e;
}

.nav-item.router-link-active {
  background: linear-gradient(90deg, rgba(224, 246, 217, 0.78) 0%, rgba(255, 255, 255, 0.96) 72%);
  box-shadow:
    0 12px 31px rgba(44, 95, 56, 0.09),
    inset 0 1px 0 rgba(255, 255, 255, 0.92);
  color: #1e6b23;
}

.sidebar-footer {
  position: relative;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding: 0 20px 23px;
}

.plantel-block label,
.late-fee-toggle span {
  display: block;
  margin-bottom: 7px;
  color: #2a5d4a;
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.plantel-select,
.admin-card {
  display: flex;
  align-items: center;
  border: 1px solid rgba(210, 225, 213, 0.9);
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow:
    0 12px 24px rgba(58, 112, 71, 0.07),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
}

.plantel-select {
  height: 42px;
  gap: 10px;
  padding: 0 13px;
  color: #286d2b;
}

.plantel-select select {
  min-width: 0;
  flex: 1;
  appearance: none;
  border: 0;
  background: transparent;
  color: #1e2d49;
  font-size: 0.82rem;
  font-weight: 800;
  outline: none;
}

.late-fee-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}

.late-fee-toggle span {
  margin-bottom: 0;
}

.toggle-track {
  position: relative;
  width: 40px;
  height: 22px;
  border-radius: 999px;
  background: #d7e6d1;
  box-shadow: inset 0 1px 3px rgba(22, 38, 65, 0.12);
  transition: background 180ms ease;
}

.toggle-track-on {
  background: linear-gradient(135deg, #9bd04f, #5ca342);
}

.toggle-thumb {
  position: absolute;
  left: 3px;
  top: 3px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 4px 10px rgba(22, 38, 65, 0.18);
  transition: transform 180ms ease;
}

.toggle-thumb-on {
  transform: translateX(18px);
}

.admin-card {
  min-height: 66px;
  justify-content: space-between;
  padding: 10px 11px;
}

.admin-profile {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.admin-avatar {
  display: flex;
  width: 37px;
  height: 37px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 999px;
  background: #edf7ec;
  color: #2d6d38;
}

.admin-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.admin-meta {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.admin-meta span {
  max-width: 135px;
  overflow: hidden;
  color: #1c2a43;
  font-size: 0.73rem;
  font-weight: 800;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-meta strong {
  color: #2a8a2f;
  font-size: 0.62rem;
  font-weight: 800;
}

.logout-button {
  display: flex;
  height: 34px;
  width: 34px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #68748a;
  transition: background 160ms ease, color 160ms ease;
}

.logout-button:hover {
  background: rgba(232, 63, 75, 0.09);
  color: #e83f4b;
}

.sidebar-sheen,
.sidebar-rings,
.sidebar-arc,
.sidebar-leaves {
  pointer-events: none;
  position: absolute;
}

.sidebar-sheen {
  z-index: 1;
  inset: 0;
  background:
    linear-gradient(104deg, rgba(255, 255, 255, 0.54) 0 19%, transparent 31%),
    radial-gradient(circle at 74% 4%, rgba(255, 255, 255, 0.86), transparent 8.8rem);
}

.sidebar-rings {
  border-radius: 999px;
  z-index: 1;
  opacity: 0.5;
}

.sidebar-rings-top {
  right: -6.3rem;
  top: -6.7rem;
  width: 19rem;
  height: 19rem;
  background: repeating-radial-gradient(circle, rgba(104, 163, 70, 0.13) 0 1px, transparent 1px 6px);
}

.sidebar-rings-mid {
  right: -9.7rem;
  top: 20.7rem;
  width: 25rem;
  height: 25rem;
  opacity: 0.42;
  background: repeating-radial-gradient(circle, rgba(88, 164, 65, 0.16) 0 1px, transparent 1px 5px);
}

.sidebar-rings-low {
  left: -8.7rem;
  bottom: -8.9rem;
  width: 19rem;
  height: 19rem;
  opacity: 0.28;
  background: repeating-radial-gradient(circle, rgba(68, 154, 81, 0.2) 0 1px, transparent 1px 7px);
}

.sidebar-arc {
  z-index: 1;
  right: -2.7rem;
  top: 22.2rem;
  width: 13rem;
  height: 18rem;
  border: 1px solid rgba(91, 168, 78, 0.18);
  border-left-color: transparent;
  border-bottom-color: transparent;
  border-radius: 50%;
  transform: rotate(20deg);
}

.sidebar-leaves {
  z-index: 1;
  left: 68px;
  bottom: 100px;
  width: 170px;
  height: 212px;
  opacity: 0.77;
}

.sidebar-leaves span {
  position: absolute;
  display: block;
  border-radius: 100% 0 100% 0;
  background: linear-gradient(145deg, rgba(117, 196, 122, 0.62), rgba(50, 168, 126, 0.22));
  transform-origin: 100% 100%;
}

.sidebar-leaves i {
  position: absolute;
  left: 51px;
  bottom: 23px;
  display: block;
  width: 142px;
  height: 142px;
  border-top: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 50%;
  transform: rotate(-27deg);
}

.sidebar-leaves span:nth-of-type(1) {
  left: 2px;
  bottom: 25px;
  width: 82px;
  height: 132px;
  background: linear-gradient(145deg, rgba(142, 210, 126, 0.72), rgba(74, 188, 139, 0.2));
  transform: rotate(-43deg);
}

.sidebar-leaves span:nth-of-type(2) {
  left: 56px;
  bottom: 72px;
  width: 92px;
  height: 158px;
  background: linear-gradient(145deg, rgba(114, 211, 160, 0.55), rgba(41, 174, 124, 0.18));
  transform: rotate(-27deg);
}

.sidebar-leaves span:nth-of-type(3) {
  left: 45px;
  bottom: 2px;
  width: 120px;
  height: 165px;
  background: linear-gradient(145deg, rgba(82, 181, 93, 0.52), rgba(31, 162, 132, 0.16));
  transform: rotate(-62deg);
}

.sidebar-leaves span:nth-of-type(4) {
  left: 116px;
  bottom: 34px;
  width: 102px;
  height: 136px;
  background: linear-gradient(145deg, rgba(39, 157, 91, 0.35), rgba(33, 171, 138, 0.11));
  transform: rotate(-84deg);
}

.income-main {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  background:
    radial-gradient(circle at 42% -3%, rgba(142, 193, 83, 0.13), transparent 15rem),
    linear-gradient(180deg, #ffffff 0%, #fafbfc 100%);
}

.income-main::before {
  content: "";
  position: absolute;
  z-index: 0;
  top: 68px;
  left: min(28vw, 360px);
  width: 360px;
  height: 120px;
  opacity: 0.38;
  background:
    repeating-radial-gradient(ellipse at 50% 0%, rgba(126, 181, 92, 0.18) 0 1px, transparent 1px 5px);
  clip-path: ellipse(50% 45% at 50% 0%);
  pointer-events: none;
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 18;
  display: flex;
  height: 64px;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #dfe6ef;
  background: rgba(255, 255, 255, 0.9);
  padding: 0 30px;
  backdrop-filter: blur(14px);
}

.app-header h1 {
  margin: 0;
  color: #142641;
  font-size: 1.32rem;
  font-weight: 850;
  letter-spacing: -0.01em;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ciclo-picker,
.header-home-button {
  display: inline-flex;
  height: 38px;
  align-items: center;
  border: 1px solid #dfe6ef;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.88);
  color: #20304d;
  box-shadow: 0 10px 22px rgba(22, 38, 65, 0.04);
}

.ciclo-picker {
  min-width: 160px;
  gap: 9px;
  padding: 0 12px;
}

.ciclo-picker svg:first-child {
  color: #2d7132;
}

.ciclo-picker select {
  min-width: 0;
  flex: 1;
  appearance: none;
  border: 0;
  background: transparent;
  color: #20304d;
  font-size: 0.84rem;
  font-weight: 800;
  outline: none;
}

.header-home-button {
  width: 38px;
  justify-content: center;
  transition: transform 160ms ease, box-shadow 160ms ease;
}

.header-home-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 24px rgba(22, 38, 65, 0.08);
}

.header-home-button {
  border-color: transparent;
  background: linear-gradient(135deg, #78b854 0%, #4a8a42 100%);
  color: #fff;
}

.income-content {
  position: relative;
  z-index: 1;
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  padding: 18px 30px 16px;
}

.income-sidebar {
  flex: 0 0 auto;
}

@media (max-height: 920px) and (min-width: 1081px) {
  .app-header {
    height: 60px;
  }

  .income-content {
    padding-top: 14px;
    padding-bottom: 14px;
  }

  .sidebar-brand {
    padding-top: 32px;
    padding-bottom: 25px;
  }

  .sidebar-nav {
    gap: 7px;
  }

  .nav-item {
    min-height: 41px;
  }

  .sidebar-footer {
    gap: 13px;
    padding-bottom: 20px;
  }
}

@media (max-width: 1180px) {
  .income-sidebar {
    width: 238px;
  }

  .app-header,
  .income-content {
    padding-left: 28px;
    padding-right: 28px;
  }
}

@media (max-width: 860px) {
  .income-shell {
    overflow: auto;
  }

  .income-sidebar {
    width: 220px;
  }

  .app-header {
    gap: 16px;
  }

  .header-actions {
    gap: 10px;
  }

  .ciclo-picker {
    min-width: 150px;
  }
}


/* fixed-artboard sidebar scaling: preserve the same sidebar composition under OS/browser scaling. */
.sidebar-design-canvas .sidebar-brand {
  padding: 38px 24px 31px;
  text-align: center;
}

.sidebar-design-canvas .sidebar-logo {
  max-height: 48px;
  max-width: 106px;
  margin: 0 auto 14px;
}

.sidebar-design-canvas .sidebar-nav {
  display: flex;
  flex: 1 1 auto;
  grid-template-columns: none;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding: 2px 18px 14px;
}

.sidebar-design-canvas .nav-item {
  min-height: 43px;
  gap: 13px;
  border-radius: 12px;
  padding: 0 17px;
  font-size: 0.9rem;
}

.sidebar-design-canvas .sidebar-footer {
  gap: 15px;
  padding: 0 20px 23px;
}

.sidebar-design-canvas .plantel-select {
  height: 42px;
}

.sidebar-design-canvas .admin-card {
  min-height: 66px;
}

.sidebar-design-canvas .sidebar-sheen,
.sidebar-design-canvas .sidebar-rings,
.sidebar-design-canvas .sidebar-arc,
.sidebar-design-canvas .sidebar-leaves {
  display: block;
}

/* Premium desktop shell: lighter navigation for a 1280x800 effective viewport. */
.income-shell,
.income-shell * {
  letter-spacing: 0;
}

.income-shell {
  background: linear-gradient(180deg, #fbfcfe 0%, #f5f8fb 100%);
}

.income-sidebar {
  border-width: 0 1px 0 0;
  border-color: rgba(215, 226, 220, 0.9);
  border-radius: 0 24px 24px 0;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.97), rgba(248,252,248,0.94)),
    radial-gradient(circle at 75% 10%, rgba(142, 193, 83, 0.12), transparent 160px);
  box-shadow: 10px 0 32px rgba(15, 23, 42, 0.045);
}

.income-sidebar::before,
.income-sidebar::after,
.sidebar-sheen,
.sidebar-rings,
.sidebar-arc,
.sidebar-leaves {
  opacity: 0.18;
}

.sidebar-design-canvas .sidebar-brand {
  padding: 24px 18px 20px;
}

.sidebar-design-canvas .sidebar-logo {
  max-height: 42px;
  max-width: 96px;
  margin-bottom: 10px;
}

.sidebar-design-canvas .sidebar-brand h2 {
  color: #2e6f3d;
  font-size: 0.66rem;
  letter-spacing: 0;
}

.sidebar-design-canvas .sidebar-nav {
  gap: 5px;
  padding: 2px 12px 10px;
}

.sidebar-design-canvas .nav-item {
  min-height: 38px;
  gap: 10px;
  border-radius: 11px;
  padding: 0 12px;
  font-size: 0.8rem;
  font-weight: 700;
}

.sidebar-design-canvas .nav-item svg {
  width: 18px;
  height: 18px;
}

.sidebar-design-canvas .sidebar-footer {
  gap: 10px;
  padding: 0 14px 16px;
}

.sidebar-design-canvas .plantel-select {
  height: 36px;
  border-radius: 11px;
}

.sidebar-design-canvas .admin-card {
  min-height: 56px;
  border-radius: 12px;
  padding: 8px 9px;
}

.app-header {
  height: 54px;
  padding: 0 20px;
  border-bottom-color: #e6edf5;
  background: rgba(255, 255, 255, 0.94);
}

.app-header h1 {
  font-size: 1.08rem;
}

.income-main::before {
  opacity: 0.16;
}

.income-content {
  padding: 12px 18px 14px;
}

@media (max-height: 840px) and (min-width: 1081px) {
  .income-content {
    padding-top: 10px;
    padding-bottom: 10px;
  }
}

</style>
