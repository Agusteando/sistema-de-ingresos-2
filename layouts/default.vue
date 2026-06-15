<template>
  <div class="income-shell font-sans" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <aside class="income-sidebar" :style="sidebarRootStyle">
      <button type="button" class="sidebar-collapse-button" :aria-label="sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'" @click="toggleSidebar">
        <component :is="sidebarCollapsed ? LucidePanelLeftOpen : LucidePanelLeftClose" :size="18" />
      </button>
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
        <img
          src="/aurora-logo.png"
          alt="Aurora"
          class="sidebar-system-logo"
        />
      </div>

      <nav class="sidebar-nav">
        <NuxtLink v-if="showFinancialNav" to="/" class="nav-item group">
          <LucideUsers :size="22" stroke-width="2.2" /> <span class="nav-label">Alumnos</span>
        </NuxtLink>
        <NuxtLink v-if="showFinancialNav" to="/deudores" class="nav-item group">
          <LucideAlertTriangle :size="22" stroke-width="2" /> <span class="nav-label">Deudores</span>
        </NuxtLink>
        <NuxtLink v-if="showFinancialNav" to="/reportes" class="nav-item group">
          <LucidePieChart :size="22" stroke-width="2" /> <span class="nav-label">Reportes</span>
        </NuxtLink>
        <NuxtLink v-if="showConceptosNav" to="/conceptos" class="nav-item group">
          <LucideSettings :size="22" stroke-width="2" /> <span class="nav-label">Conceptos</span>
        </NuxtLink>
        <NuxtLink v-if="showFinancialNav" to="/facturas" class="nav-item group">
          <LucideFileText :size="22" stroke-width="2" /> <span class="nav-label">Facturas CFDI</span>
        </NuxtLink>
        <a v-if="showFinancialNav" href="http://localhost/Sistema%20de%20ingresos/login.php" class="nav-item group" target="_blank" rel="noopener">
          <LucideExternalLink :size="22" stroke-width="2" /> <span class="nav-label">Sistema de Contingencia</span>
        </a>
        <NuxtLink v-if="showControlEscolarNav" to="/control-escolar" class="nav-item group">
          <LucideSchool :size="22" stroke-width="2" /> <span class="nav-label">Control Escolar</span>
        </NuxtLink>
        <NuxtLink to="/avance-control-escolar" class="nav-item group">
          <LucideClipboardList :size="22" stroke-width="2" /> <span class="nav-label">Auditoría Control Escolar</span>
        </NuxtLink>
        <NuxtLink to="/usuarios" class="nav-item group" v-if="isSuperAdmin">
          <LucideShield :size="22" stroke-width="2" /> <span class="nav-label">Usuarios</span>
        </NuxtLink>
        <NuxtLink to="/sql-console" class="nav-item group" v-if="isSuperAdmin">
          <LucideDatabase :size="22" stroke-width="2" /> <span class="nav-label">SQL Console</span>
        </NuxtLink>
      </nav>

      <div class="sidebar-footer">
        <div ref="plantelSelectRef" class="plantel-block" v-if="userPlanteles.length > 1 || isSuperAdmin">
          <label id="sidebar-plantel-label">Plantel</label>
          <div class="plantel-picker" :class="{ open: plantelMenuOpen }">
            <button
              type="button"
              class="plantel-select plantel-select-button"
              aria-haspopup="listbox"
              :aria-expanded="plantelMenuOpen ? 'true' : 'false'"
              aria-labelledby="sidebar-plantel-label sidebar-plantel-value"
              @click="togglePlantelMenu"
              @keydown.down.prevent="openPlantelMenu"
              @keydown.enter.prevent="togglePlantelMenu"
              @keydown.space.prevent="togglePlantelMenu"
              @keydown.esc.prevent="closePlantelMenu"
            >
              <LucideBuilding2 :size="21" />
              <span class="plantel-current">
                <strong id="sidebar-plantel-value">{{ activePlantelLabel }}</strong>
                <small v-if="activePlantel !== 'GLOBAL'" :class="`status-${activePlantelStatus.status}`">
                  <span class="plantel-status-dot" aria-hidden="true" />
                  {{ activePlantelStatus.message }}
                </small>
                <small v-else class="status-global">Vista consolidada</small>
              </span>
              <LucideChevronDown :size="16" />
            </button>

            <div
              v-if="plantelMenuOpen"
              class="plantel-options"
              role="listbox"
              aria-labelledby="sidebar-plantel-label"
            >
              <button
                v-if="isSuperAdmin"
                type="button"
                class="plantel-option global"
                :class="{ selected: activePlantel === 'GLOBAL' }"
                role="option"
                :aria-selected="activePlantel === 'GLOBAL' ? 'true' : 'false'"
                @click="selectPlantel('GLOBAL')"
              >
                <span class="plantel-option-main">
                  <span class="plantel-option-code">CONSOLIDADO</span>
                  <span class="plantel-option-message status-global">Vista global de administración</span>
                </span>
                <span class="plantel-option-chip status-global">Global</span>
              </button>

              <button
                v-for="p in userPlanteles"
                :key="p"
                type="button"
                class="plantel-option"
                :class="{
                  selected: p === activePlantel,
                  offline: getPlantelStatus(p).status === 'offline'
                }"
                role="option"
                :aria-selected="p === activePlantel ? 'true' : 'false'"
                @click="selectPlantel(p)"
              >
                <span class="plantel-option-main">
                  <span class="plantel-option-code">PLANTEL {{ p }}</span>
                  <span class="plantel-option-message" :class="`status-${getPlantelStatus(p).status}`">
                    <span class="plantel-status-dot" aria-hidden="true" />
                    {{ getPlantelStatus(p).message }}
                  </span>
                </span>
                <span class="plantel-option-chip" :class="`status-${getPlantelStatus(p).status}`">
                  {{ getPlantelStatus(p).label }}
                </span>
              </button>
            </div>
          </div>

          <p v-if="activePlantel !== 'GLOBAL' && activePlantelStatus.status === 'offline'" class="plantel-status-note">
            {{ activePlantelStatus.action }}
          </p>
        </div>

        <label v-if="showFinancialNav" class="late-fee-toggle group">
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

        <div
          v-if="systemVersionLabel"
          class="system-version-card"
          :class="{
            'version-level-up': versionUpgradeActive,
            'version-level-up-success': versionUpgradePhase === 'success'
          }"
        >
          <div v-if="versionUpgradeActive" class="version-effect-orb" aria-hidden="true">
            <LucideRefreshCw v-if="versionUpgradePhase === 'syncing'" :size="14" />
            <LucideCheckCircle v-else :size="15" />
          </div>
          <span>Versión</span>
          <strong :class="{ 'version-number-bump': versionUpgradeActive }">
            <template v-if="versionUpgradeActive">
              <em>{{ previousSystemVersionLabel }}</em>
              <i aria-hidden="true">→</i>
              <em class="new-version">{{ systemVersionLabel }}</em>
            </template>
            <template v-else>{{ systemVersionLabel }}</template>
          </strong>
          <small v-if="versionUpgradeActive && versionUpgradeSummary" class="version-update-summary">{{ versionUpgradeSummary }}</small>
          <small v-else-if="systemVersionUpdatedLabel">{{ systemVersionUpdatedLabel }}</small>
        </div>

        <div class="admin-card">
          <div class="admin-profile">
            <div class="admin-avatar">
              <img v-if="adminPhoto" :src="adminPhoto" alt="Perfil" />
              <LucideUser v-else :size="18" />
            </div>
            <div class="admin-meta">
              <span>{{ adminName }}</span>
              <strong>{{ isSuperAdmin ? 'ADMIN' : 'USUARIO' }}</strong>
            </div>
          </div>
          <button @click="logout" title="Cerrar Sesión" class="logout-button">
            <LucideLogOut :size="18" />
          </button>
        </div>

        <StudentsCacheSyncIndicator v-if="showFinancialNav" />
        <ControlEscolarSyncIndicator v-if="showControlEscolarNav" />
      </div>
        </div>
      </div>
    </aside>

    <main class="income-main">
      <header class="app-header">
        <h1>{{ currentRouteName }}</h1>

        <div class="header-actions">
          <SyncBadge v-if="showFinancialNav" />
          <div v-if="showCicloPicker" ref="cicloPickerRef" class="ciclo-picker" :class="{ open: cicloMenuOpen }">
            <button
              type="button"
              class="ciclo-picker-button"
              aria-haspopup="listbox"
              :aria-expanded="cicloMenuOpen ? 'true' : 'false'"
              aria-labelledby="header-ciclo-label header-ciclo-value"
              @click="toggleCicloMenu"
              @keydown.down.prevent="openCicloMenu"
              @keydown.enter.prevent="toggleCicloMenu"
              @keydown.space.prevent="toggleCicloMenu"
              @keydown.esc.prevent="closeCicloMenu"
            >
              <span class="ciclo-picker-icon" aria-hidden="true">
                <LucideCalendarDays :size="17" />
              </span>
              <span class="ciclo-picker-current">
                <small id="header-ciclo-label">Ciclo</small>
                <strong id="header-ciclo-value">{{ activeCicloOption.label }}</strong>
              </span>
              <LucideChevronDown class="ciclo-picker-chevron" :size="16" />
            </button>

            <div
              v-if="cicloMenuOpen"
              class="ciclo-options"
              role="listbox"
              aria-labelledby="header-ciclo-label"
            >
              <button
                v-for="c in CICLOS_LIST"
                :key="c.value"
                type="button"
                class="ciclo-option"
                :class="{ selected: c.value === activeCicloOption.value }"
                role="option"
                :aria-selected="c.value === activeCicloOption.value ? 'true' : 'false'"
                @click="selectCiclo(c.value)"
              >
                <span class="ciclo-option-main">
                  <strong>{{ c.label }}</strong>
                  <small>Clave {{ c.value }}</small>
                </span>
                <span v-if="c.value === activeCicloOption.value" class="ciclo-option-chip">Actual</span>
              </button>
            </div>
          </div>
          <NuxtLink v-if="showFinancialNav" to="/" class="header-home-button" title="Inicio" aria-label="Inicio">
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
        <span class="toast-status-icon">
          <LucideCheckCircle v-if="toast.type === 'success'" :size="16" class="text-brand-leaf" />
          <LucideAlertCircle v-else :size="16" class="text-accent-coral" />
        </span>
        <span class="toast-copy">
          <strong v-if="toast.title">{{ toast.title }}</strong>
          <span>{{ toast.message }}</span>
          <small v-for="detail in toast.details" :key="detail">{{ detail }}</small>
        </span>
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
  LucideExternalLink,
  LucideDatabase,
  LucideClipboardList,
  LucidePanelLeftClose,
  LucidePanelLeftOpen
} from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { useOptimisticSync } from '~/composables/useOptimisticSync'
import ContextMenu from '~/components/ContextMenu.vue'
import SyncBadge from '~/components/SyncBadge.vue'
import StudentsCacheSyncIndicator from '~/components/students/StudentsCacheSyncIndicator.vue'
import ControlEscolarSyncIndicator from '~/components/students/ControlEscolarSyncIndicator.vue'
import { usePlantelAgentStatuses } from '~/composables/usePlantelAgentStatuses'
import { CICLOS_LIST, PLANTELES_LIST, normalizeCicloOption } from '~/utils/constants'

const { toasts, show } = useToast()
const { syncState, syncMessage } = useOptimisticSync()
const route = useRoute()

const SIDEBAR_DESIGN_WIDTH = 232
const SIDEBAR_DESIGN_HEIGHT = 800
const sidebarScaleShell = ref(null)
const sidebarScale = ref(1)
const sidebarCollapsed = ref(false)
const sidebarRootStyle = computed(() => {
  if (sidebarCollapsed.value) return { width: '72px', flexBasis: '72px' }
  return {
    width: `${Math.ceil(SIDEBAR_DESIGN_WIDTH * sidebarScale.value)}px`,
    flexBasis: `${Math.ceil(SIDEBAR_DESIGN_WIDTH * sidebarScale.value)}px`
  }
})
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
  if (state.value.ciclo !== cicloKey) state.value.ciclo = cicloKey
  cicloCookie.value = cicloKey
})

const activeCicloOption = computed(() => {
  const cicloKey = normalizeCicloOption(state.value.ciclo)
  return CICLOS_LIST.find(ciclo => ciclo.value === cicloKey) || CICLOS_LIST[0]
})

const dispatchCicloChanged = (cicloKey) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ingresos:ciclo-changed', { detail: { ciclo: cicloKey } }))
  }
}

const openCicloMenu = () => {
  cicloMenuOpen.value = true
}

const closeCicloMenu = () => {
  cicloMenuOpen.value = false
}

const toggleCicloMenu = () => {
  if (cicloMenuOpen.value) {
    closeCicloMenu()
    return
  }

  openCicloMenu()
}

const selectCiclo = (value) => {
  const cicloKey = normalizeCicloOption(value)
  closeCicloMenu()

  if (state.value.ciclo === cicloKey) {
    cicloCookie.value = cicloKey
    return
  }

  state.value.ciclo = cicloKey
  cicloCookie.value = cicloKey
  dispatchCicloChanged(cicloKey)
}

const adminPhoto = ref(null)
const adminName = ref(useCookie('auth_name').value || 'Usuario')
const userRole = ref(useCookie('auth_role').value || 'plantel')
const hasFinancialAccessCookie = useCookie('auth_has_financial_access')
const activePlantel = ref(useCookie('auth_active_plantel').value || 'PT')
const plantelSelectRef = ref(null)
const plantelMenuOpen = ref(false)
const cicloPickerRef = ref(null)
const cicloMenuOpen = ref(false)
const { getPlantelStatus, loadPlantelStatuses } = usePlantelAgentStatuses()
const roleTokens = computed(() => String(userRole.value || '').split(',').map(role => role.trim().toLowerCase()).filter(Boolean))
const hasSuperAdminRole = computed(() => roleTokens.value.some(role => ['superadmin'].includes(role)))
const isSuperAdmin = computed(() => hasSuperAdminRole.value)
const hasFinancialAccess = computed(() => isSuperAdmin.value || hasFinancialAccessCookie.value === 'true')
const isControlEscolarOnly = computed(() => !isSuperAdmin.value && !hasFinancialAccess.value)
const showControlEscolarNav = computed(() => true)
const userPlanteles = computed(() => {
  if (isSuperAdmin.value) return [...PLANTELES_LIST]

  const planteles = String(useCookie('auth_planteles').value || '')
    .split(',')
    .map(p => p.trim().toUpperCase())
    .filter(p => PLANTELES_LIST.includes(p))

  return planteles
})
const showFinancialNav = computed(() => hasFinancialAccess.value)
const hasConceptosAdminRole = computed(() => isSuperAdmin.value || roleTokens.value.some(role => ['admin', 'role_admin', 'conceptos_admin', 'role_conceptos'].includes(role)))
const showConceptosNav = computed(() => showFinancialNav.value && hasConceptosAdminRole.value)
const showCicloPicker = computed(() => true)
const activePlantelLabel = computed(() => activePlantel.value === 'GLOBAL' ? 'CONSOLIDADO' : `PLANTEL ${activePlantel.value || 'PT'}`)
const activePlantelStatus = computed(() => activePlantel.value === 'GLOBAL'
  ? { status: 'unknown', online: true, label: 'Global', message: 'Vista consolidada', action: '' }
  : getPlantelStatus(activePlantel.value))

const systemVersionLabel = ref('')
const systemVersionUpdatedLabel = ref('')
const previousSystemVersionLabel = ref('')
const versionUpgradeActive = ref(false)
const versionUpgradePhase = ref('idle')
const versionUpgradeSummary = ref('')
let versionUpgradeSuccessTimer = null
let versionUpgradeDoneTimer = null

const lastSeenVersionCookie = useCookie('aurora_last_seen_version', { maxAge: 60 * 60 * 24 * 365 })
const lastSeenVersionCountCookie = useCookie('aurora_last_seen_version_count', { maxAge: 60 * 60 * 24 * 365 })

const normalizeVersionLabel = (value) => String(value || '').trim()

const countFromVersionLabel = (value) => {
  const match = normalizeVersionLabel(value).match(/(\d+)$/)
  return match ? Number(match[1]) : 0
}

const compactCommitTitle = (value) => {
  const clean = String(value || '').replace(/\s+/g, ' ').trim()
  return clean.length > 76 ? `${clean.slice(0, 73)}…` : clean
}

const clearVersionUpgradeTimers = () => {
  if (versionUpgradeSuccessTimer) window.clearTimeout(versionUpgradeSuccessTimer)
  if (versionUpgradeDoneTimer) window.clearTimeout(versionUpgradeDoneTimer)
  versionUpgradeSuccessTimer = null
  versionUpgradeDoneTimer = null
}

const startVersionUpgradeEffect = ({ previousLabel, nextLabel, count, updates }) => {
  if (typeof window === 'undefined') return
  clearVersionUpgradeTimers()
  previousSystemVersionLabel.value = previousLabel
  versionUpgradeActive.value = true
  versionUpgradePhase.value = 'syncing'
  versionUpgradeSummary.value = `${count} actualización${count === 1 ? '' : 'es'} aplicada${count === 1 ? '' : 's'}`

  const commitMessages = (Array.isArray(updates) ? updates : [])
    .slice(0, Math.min(3, Math.max(1, count)))
    .map(update => compactCommitTitle(update?.title || update?.message || update?.description))
    .filter(Boolean)

  show(`(${count}) Actualizaciones aplicadas:`, 'success', {
    title: `${previousLabel} → ${nextLabel}`,
    details: commitMessages,
    duration: 6400
  })

  versionUpgradeSuccessTimer = window.setTimeout(() => {
    versionUpgradePhase.value = 'success'
  }, 850)

  versionUpgradeDoneTimer = window.setTimeout(() => {
    versionUpgradeActive.value = false
    versionUpgradePhase.value = 'idle'
    previousSystemVersionLabel.value = ''
    versionUpgradeSummary.value = ''
  }, 3600)
}

const loadSystemVersion = async () => {
  try {
    const result = await $fetch('/api/login/updates')
    const nextVersionLabel = normalizeVersionLabel(result?.versionLabel || '')
    const nextVersionCount = Number(result?.totalCount || countFromVersionLabel(nextVersionLabel) || 0)
    const previousVersionLabel = normalizeVersionLabel(lastSeenVersionCookie.value || '')
    const previousVersionCount = Number(lastSeenVersionCountCookie.value || countFromVersionLabel(previousVersionLabel) || 0)

    systemVersionLabel.value = nextVersionLabel
    systemVersionUpdatedLabel.value = result?.lastUpdatedLabel ? `Actualizado ${result.lastUpdatedLabel}` : ''

    if (!result?.ok || !nextVersionLabel || !nextVersionCount) return

    if (!previousVersionLabel) {
      lastSeenVersionCookie.value = nextVersionLabel
      lastSeenVersionCountCookie.value = String(nextVersionCount || countFromVersionLabel(nextVersionLabel) || 0)
      return
    }

    if (previousVersionLabel !== nextVersionLabel) {
      const appliedCount = Math.max(1, nextVersionCount && previousVersionCount ? nextVersionCount - previousVersionCount : 1)
      startVersionUpgradeEffect({
        previousLabel: previousVersionLabel,
        nextLabel: nextVersionLabel,
        count: appliedCount,
        updates: result?.updates || []
      })
      lastSeenVersionCookie.value = nextVersionLabel
      lastSeenVersionCountCookie.value = String(nextVersionCount || countFromVersionLabel(nextVersionLabel) || 0)
    }
  } catch {}
}

const openPlantelMenu = () => {
  plantelMenuOpen.value = true
  loadPlantelStatuses({ force: true })
}

const closePlantelMenu = () => {
  plantelMenuOpen.value = false
}

const togglePlantelMenu = () => {
  if (plantelMenuOpen.value) {
    closePlantelMenu()
    return
  }

  openPlantelMenu()
}

const handlePlantelDocumentPointerDown = (event) => {
  if (!plantelMenuOpen.value || !plantelSelectRef.value) return
  if (plantelSelectRef.value.contains(event.target)) return

  closePlantelMenu()
}

const handleCicloDocumentPointerDown = (event) => {
  if (!cicloMenuOpen.value || !cicloPickerRef.value) return
  if (cicloPickerRef.value.contains(event.target)) return

  closeCicloMenu()
}

const selectPlantel = async (plantel) => {
  const normalizedPlantel = String(plantel || '').trim().toUpperCase()
  if (normalizedPlantel !== 'GLOBAL' && !PLANTELES_LIST.includes(normalizedPlantel)) return

  if (normalizedPlantel === activePlantel.value) {
    closePlantelMenu()
    if (normalizedPlantel !== 'GLOBAL') loadPlantelStatuses({ force: true, plantel: normalizedPlantel })
    return
  }

  activePlantel.value = normalizedPlantel
  closePlantelMenu()
  await switchPlantel(normalizedPlantel)
}

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value
  if (typeof window !== 'undefined') {
    localStorage.setItem('income-sidebar-collapsed', sidebarCollapsed.value ? '1' : '0')
  }
  scheduleSidebarScaleUpdate()
}

onMounted(async () => {
  if (typeof window !== 'undefined') {
    sidebarCollapsed.value = localStorage.getItem('income-sidebar-collapsed') === '1'
  }
  scheduleSidebarScaleUpdate()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', scheduleSidebarScaleUpdate, { passive: true })
    document.addEventListener('pointerdown', handlePlantelDocumentPointerDown)
    document.addEventListener('pointerdown', handleCicloDocumentPointerDown)
    if (typeof ResizeObserver !== 'undefined' && sidebarScaleShell.value) {
      sidebarResizeObserver = new ResizeObserver(scheduleSidebarScaleUpdate)
      sidebarResizeObserver.observe(sidebarScaleShell.value)
    }
  }

  if (activePlantel.value !== 'GLOBAL') {
    loadPlantelStatuses({ force: true, plantel: activePlantel.value })
  }

  loadSystemVersion()

  try {
    const res = await $fetch('/api/admin/profile')
    if (res.photoUrl) adminPhoto.value = res.photoUrl
  } catch (e) {}
})

onBeforeUnmount(() => {
  clearVersionUpgradeTimers()
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', scheduleSidebarScaleUpdate)
    document.removeEventListener('pointerdown', handlePlantelDocumentPointerDown)
    document.removeEventListener('pointerdown', handleCicloDocumentPointerDown)
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
  if (route.path === '/sql-console') return 'SQL Console'
  if (route.path === '/control-escolar') return 'Control Escolar'
  if (route.path === '/avance-control-escolar') return 'Avance Control Escolar'
  return 'SISTEMA DE INGRESOS'
})

const switchPlantel = async (plantel = activePlantel.value) => {
  const previousPlantel = useCookie('auth_active_plantel').value || 'PT'

  try {
    const response = await $fetch('/api/auth/switch', { method: 'POST', body: { plantel } })
    if (response?.redirectTo && response.redirectTo !== route.path && route.path !== '/control-escolar' && route.path !== '/avance-control-escolar') {
      window.location.href = response.redirectTo
      return
    }
    window.location.reload()
  } catch (e) {
    activePlantel.value = previousPlantel
    show('No tienes acceso a este plantel.', 'danger')
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
  overflow: visible;
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

.sidebar-collapse-button {
  position: absolute;
  top: 16px;
  right: -13px;
  z-index: 60;
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(210, 225, 213, 0.95);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.98);
  color: #2d7132;
  box-shadow: 0 10px 22px rgba(22, 38, 65, 0.12);
  cursor: pointer;
}

.sidebar-collapse-button:hover {
  background: #f3fbf1;
}

.income-shell.sidebar-collapsed .income-sidebar {
  border-radius: 0 18px 18px 0;
}

.income-shell.sidebar-collapsed .sidebar-design-canvas .sidebar-brand {
  padding: 22px 8px 16px;
}

.income-shell.sidebar-collapsed .sidebar-design-canvas .sidebar-logo {
  max-width: 42px;
  max-height: 34px;
  margin-bottom: 0;
}

.income-shell.sidebar-collapsed .sidebar-design-canvas .sidebar-system-logo,
.income-shell.sidebar-collapsed .sidebar-design-canvas .sidebar-brand h2,
.income-shell.sidebar-collapsed .nav-label,
.income-shell.sidebar-collapsed .sidebar-footer,
.income-shell.sidebar-collapsed .sidebar-rings,
.income-shell.sidebar-collapsed .sidebar-arc,
.income-shell.sidebar-collapsed .sidebar-leaves {
  display: none;
}

.income-shell.sidebar-collapsed .sidebar-design-canvas .sidebar-nav {
  align-items: center;
  padding: 4px 10px 10px;
}

.income-shell.sidebar-collapsed .sidebar-design-canvas .nav-item {
  width: 48px;
  min-height: 42px;
  justify-content: center;
  gap: 0;
  padding: 0;
}

.income-shell.sidebar-collapsed .sidebar-design-canvas .nav-item svg {
  width: 20px;
  height: 20px;
}

.income-shell.sidebar-collapsed .sidebar-design-canvas .nav-item:hover {
  transform: none;
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
  margin: 0 auto 12px;
  object-fit: contain;
}

.sidebar-system-logo {
  display: block;
  width: min(100%, 182px);
  height: auto;
  margin: 0 auto 10px;
  object-fit: contain;
}

.sidebar-brand h2 {
  margin: 0;
  color: #267447;
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.12em;
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
.system-version-card,
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

.plantel-block {
  position: relative;
}

.plantel-picker {
  position: relative;
}

.plantel-select-button {
  width: 100%;
  min-height: 42px;
  height: auto;
  border: 1px solid rgba(210, 225, 213, 0.9);
  cursor: pointer;
  text-align: left;
}

.plantel-select-button svg:last-child {
  flex: 0 0 auto;
  transition: transform 160ms ease;
}

.plantel-picker.open .plantel-select-button svg:last-child {
  transform: rotate(180deg);
}

.plantel-current,
.plantel-option-main {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 3px;
}

.plantel-current strong,
.plantel-option-code {
  overflow: hidden;
  color: #1e2d49;
  font-size: 0.78rem;
  font-weight: 900;
  line-height: 1.05;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plantel-current small,
.plantel-option-message {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  color: #667185;
  font-size: 0.58rem;
  font-weight: 850;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plantel-status-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #94a3b8;
  box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.12);
}

.status-online {
  color: #207b37 !important;
}

.status-online .plantel-status-dot,
.plantel-option-message.status-online .plantel-status-dot {
  background: #22a947;
  box-shadow: 0 0 0 3px rgba(34, 169, 71, 0.13);
}

.status-offline {
  color: #b42318 !important;
}

.status-offline .plantel-status-dot,
.plantel-option-message.status-offline .plantel-status-dot {
  background: #e5483e;
  box-shadow: 0 0 0 3px rgba(229, 72, 62, 0.13);
}

.status-global {
  color: #286d2b !important;
}

.plantel-options {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 50;
  display: grid;
  gap: 5px;
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid rgba(205, 222, 211, 0.96);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.98);
  padding: 7px;
  box-shadow: 0 22px 46px rgba(25, 45, 72, 0.16);
}

.plantel-option {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  padding: 9px 8px;
  cursor: pointer;
  text-align: left;
}

.plantel-option:hover,
.plantel-option.selected {
  background: #f0faee;
}

.plantel-option.offline:hover,
.plantel-option.offline.selected {
  background: #fff3f0;
}

.plantel-option-chip {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 4px 6px;
  color: #607086;
  background: #f2f5f8;
  font-size: 0.52rem;
  font-weight: 950;
  line-height: 1;
  text-transform: uppercase;
}

.plantel-option-chip.status-online {
  color: #207b37;
  background: #eaf8ec;
}

.plantel-option-chip.status-offline {
  color: #b42318;
  background: #fff0ed;
}

.plantel-option-chip.status-global {
  color: #286d2b;
  background: #e9f7e7;
}

.plantel-status-note {
  margin: 7px 2px 0;
  color: #9f2f27;
  font-size: 0.61rem;
  font-weight: 800;
  line-height: 1.35;
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

.system-version-card {
  position: relative;
  display: grid;
  gap: 3px;
  padding: 10px 12px;
  color: #244736;
  overflow: hidden;
  transition: border-color 260ms ease, box-shadow 260ms ease, transform 260ms ease;
}

.system-version-card::after {
  position: absolute;
  inset: -40% auto -40% -65%;
  width: 58%;
  content: '';
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.82), transparent);
  opacity: 0;
  transform: rotate(16deg) translateX(-20%);
}

.system-version-card.version-level-up {
  border-color: rgba(52, 211, 153, 0.68);
  box-shadow: 0 12px 26px rgba(25, 118, 80, 0.16), inset 0 0 0 1px rgba(255, 255, 255, 0.52);
  transform: translateY(-1px);
}

.system-version-card.version-level-up::after {
  animation: versionSheen 1150ms cubic-bezier(.22, 1, .36, 1) forwards;
}

.system-version-card.version-level-up-success {
  border-color: rgba(34, 197, 94, 0.8);
}

.system-version-card span {
  color: #2a5d4a;
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
}

.system-version-card strong {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #17351f;
  font-size: 0.93rem;
  font-weight: 950;
  line-height: 1.1;
}

.system-version-card strong em,
.system-version-card strong i {
  font-style: normal;
}

.system-version-card strong em:first-child {
  color: #6d8376;
  transform: translateY(1px) scale(0.92);
}

.system-version-card strong i {
  color: #1a8a51;
  font-size: 0.82rem;
  animation: versionArrowPop 950ms cubic-bezier(.2, 1.25, .3, 1) both;
}

.system-version-card strong .new-version {
  color: #0f6f3b;
  animation: versionNumberBump 1250ms cubic-bezier(.2, 1.25, .3, 1) both;
}

.version-effect-orb {
  position: absolute;
  top: 8px;
  right: 9px;
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 999px;
  background: radial-gradient(circle at 35% 30%, #ffffff, #dcfce7 52%, #86efac);
  color: #168747;
  box-shadow: 0 8px 18px rgba(22, 135, 71, 0.28);
}

.version-level-up .version-effect-orb svg {
  animation: versionOrbSpin 850ms linear infinite;
}

.version-level-up-success .version-effect-orb svg {
  animation: versionCheckPop 420ms cubic-bezier(.2, 1.35, .32, 1) both;
}

.system-version-card small {
  overflow: hidden;
  color: #658070;
  font-size: 0.68rem;
  font-weight: 760;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.system-version-card .version-update-summary {
  color: #16723e;
}

.toast-status-icon {
  display: inline-flex;
  align-self: flex-start;
  margin-top: 1px;
}

.toast-copy {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.toast-copy strong {
  color: #f8fafc;
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0.01em;
}

.toast-copy span {
  line-height: 1.25;
}

.toast-copy small {
  max-width: 300px;
  overflow: hidden;
  color: rgba(226, 232, 240, 0.78);
  font-size: 0.68rem;
  font-weight: 650;
  line-height: 1.24;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes versionSheen {
  0% { opacity: 0; transform: rotate(16deg) translateX(-10%); }
  24% { opacity: 1; }
  100% { opacity: 0; transform: rotate(16deg) translateX(320%); }
}

@keyframes versionNumberBump {
  0% { opacity: 0; transform: translateY(8px) scale(0.82); filter: blur(2px); }
  56% { opacity: 1; transform: translateY(-2px) scale(1.14); filter: blur(0); }
  100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}

@keyframes versionArrowPop {
  0% { opacity: 0; transform: translateX(-5px) scale(0.7); }
  60% { opacity: 1; transform: translateX(1px) scale(1.16); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}

@keyframes versionOrbSpin {
  to { transform: rotate(360deg); }
}

@keyframes versionCheckPop {
  0% { opacity: 0; transform: rotate(-25deg) scale(0.55); }
  72% { opacity: 1; transform: rotate(0deg) scale(1.18); }
  100% { opacity: 1; transform: rotate(0deg) scale(1); }
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
  position: relative;
  min-width: 176px;
}

.ciclo-picker-button {
  display: inline-flex;
  width: 100%;
  height: 42px;
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(210, 225, 213, 0.92);
  border-radius: 15px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 252, 249, 0.9));
  color: #20304d;
  padding: 0 12px;
  cursor: pointer;
  text-align: left;
  box-shadow:
    0 12px 26px rgba(22, 38, 65, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.98);
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    background 160ms ease;
}

.ciclo-picker-button:hover,
.ciclo-picker.open .ciclo-picker-button {
  border-color: rgba(111, 174, 79, 0.48);
  box-shadow:
    0 16px 30px rgba(31, 76, 40, 0.09),
    inset 0 1px 0 rgba(255, 255, 255, 0.98);
  transform: translateY(-1px);
}

.ciclo-picker-button:focus-visible {
  outline: 3px solid rgba(101, 167, 68, 0.18);
  outline-offset: 2px;
}

.ciclo-picker-icon {
  display: inline-grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
  color: #2d7132;
  background: rgba(232, 246, 229, 0.92);
}

.ciclo-picker-current,
.ciclo-option-main {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}

.ciclo-picker-current small,
.ciclo-option-main small {
  overflow: hidden;
  color: #667185;
  font-size: 0.58rem;
  font-weight: 850;
  line-height: 1.05;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.ciclo-picker-current strong,
.ciclo-option-main strong {
  overflow: hidden;
  color: #1e2d49;
  font-size: 0.82rem;
  font-weight: 900;
  line-height: 1.05;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ciclo-picker-chevron {
  flex: 0 0 auto;
  color: #5d6d82;
  transition: transform 160ms ease;
}

.ciclo-picker.open .ciclo-picker-chevron {
  transform: rotate(180deg);
}

.ciclo-options {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 60;
  display: grid;
  width: min(250px, calc(100vw - 36px));
  gap: 6px;
  border: 1px solid rgba(205, 222, 211, 0.96);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.98);
  padding: 8px;
  box-shadow: 0 24px 48px rgba(25, 45, 72, 0.16);
}

.ciclo-option {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  border: 0;
  border-radius: 13px;
  background: transparent;
  padding: 10px 9px;
  cursor: pointer;
  text-align: left;
  transition: background 140ms ease, transform 140ms ease;
}

.ciclo-option:hover,
.ciclo-option.selected {
  background: #f0faee;
}

.ciclo-option:hover {
  transform: translateY(-1px);
}

.ciclo-option-chip {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 5px 7px;
  color: #286d2b;
  background: #e9f7e7;
  font-size: 0.52rem;
  font-weight: 950;
  line-height: 1;
  text-transform: uppercase;
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
    min-width: 158px;
  }

  .ciclo-picker-button {
    height: 40px;
    padding-inline: 10px;
  }

  .ciclo-picker-icon {
    width: 26px;
    height: 26px;
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
  height: auto;
  min-height: 42px;
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

.sidebar-design-canvas .sidebar-system-logo {
  width: min(100%, 172px);
  margin-bottom: 8px;
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
  height: auto;
  min-height: 40px;
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
