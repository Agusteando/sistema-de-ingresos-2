<template>
  <Teleport to="body">
    <Transition name="talleres-backdrop">
      <div
        v-if="isOpen"
        class="talleres-dialog-backdrop"
        :class="{ 'is-closing': isClosing }"
        role="presentation"
        @mousedown.self="close('dismiss')"
      >
        <section
          ref="panelRef"
          class="talleres-dialog"
          :class="{ 'is-closing': isClosing }"
          :style="collapseStyle"
          role="dialog"
          aria-modal="true"
          aria-labelledby="talleres-dialog-title"
          @keydown.esc.prevent="close('dismiss')"
        >
          <div class="talleres-dialog-accent" aria-hidden="true"></div>

          <header class="talleres-dialog-header">
            <div class="talleres-dialog-heading">
              <span class="talleres-dialog-mark" aria-hidden="true">
                <i></i><i></i><i></i><i></i>
              </span>
              <div>
                <h2 id="talleres-dialog-title">Talleres</h2>
                <p>{{ plantelLabel }}<span aria-hidden="true"> · </span>{{ cicloLabelText }}</p>
              </div>
            </div>

            <button
              ref="closeButtonRef"
              type="button"
              class="talleres-dialog-close"
              aria-label="Cerrar Talleres"
              title="Cerrar"
              @click="close('dismiss')"
            >
              <LucideX :size="19" />
            </button>
          </header>

          <div class="talleres-dialog-body">
            <div v-if="loading" class="talleres-loading" aria-label="Cargando Talleres">
              <div class="talleres-summary-skeleton">
                <span></span><span></span>
              </div>
              <div v-for="index in 5" :key="index" class="talleres-row-skeleton">
                <i></i><span></span><strong></strong>
              </div>
            </div>

            <template v-else-if="summary">
              <div class="talleres-summary" aria-label="Resumen de Talleres">
                <div>
                  <strong>{{ summary.totals?.talleres || 0 }}</strong>
                  <span>{{ Number(summary.totals?.talleres || 0) === 1 ? 'taller' : 'talleres' }}</span>
                </div>
                <div>
                  <strong>{{ summary.totals?.alumnos || 0 }}</strong>
                  <span>{{ Number(summary.totals?.alumnos || 0) === 1 ? 'alumno' : 'alumnos' }}</span>
                </div>
              </div>

              <div v-if="summary.talleres?.length" class="talleres-table-wrap">
                <table class="talleres-table">
                  <thead>
                    <tr>
                      <th scope="col">Taller</th>
                      <th scope="col">Alumnos</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="taller in summary.talleres" :key="taller.clave">
                      <td>
                        <span class="talleres-row-main">
                          <span class="talleres-row-image">
                            <img
                              :src="taller.imagen || fallbackImage"
                              :alt="''"
                              loading="lazy"
                              @error="onImageError"
                            />
                          </span>
                          <strong>{{ taller.nombre }}</strong>
                        </span>
                      </td>
                      <td>
                        <span class="talleres-count">{{ taller.alumnos }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div v-else class="talleres-empty">
                <span class="talleres-empty-mark" aria-hidden="true">
                  <i></i><i></i><i></i>
                </span>
                <strong>Sin talleres asignados</strong>
              </div>
            </template>

            <div v-else-if="errorMessage" class="talleres-error" role="status">
              <strong>No se pudo cargar Talleres</strong>
              <button type="button" @click="loadSummary(true)">
                <LucideRefreshCw :size="15" />
                Reintentar
              </button>
            </div>
          </div>

          <footer v-if="loading || summary" class="talleres-dialog-footer">
            <button
              type="button"
              class="talleres-confirm-button"
              :disabled="loading || isClosing"
              @click="close('acknowledge')"
            >
              <LucideCheck :size="18" />
              Mis talleres están al día
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { LucideCheck, LucideRefreshCw, LucideX } from 'lucide-vue-next'

const props = defineProps<{
  eligible: boolean
  autoOpen: boolean
  plantel: string
  ciclo: string
  cicloLabel?: string
  userKey?: string
  targetElement?: HTMLElement | null
}>()

const emit = defineEmits<{
  returned: []
}>()

const DAY_MS = 24 * 60 * 60 * 1000
const ACKNOWLEDGE_MS = 7 * DAY_MS
const AUTO_DELAY_MS = 720
const COLLAPSE_MS = 480
const fallbackImage = '/talleres-servicios/default.svg'

const panelRef = ref<HTMLElement | null>(null)
const closeButtonRef = ref<HTMLButtonElement | null>(null)
const isOpen = ref(false)
const isClosing = ref(false)
const loading = ref(false)
const summary = ref<any>(null)
const errorMessage = ref('')
const collapseStyle = ref<Record<string, string>>({})
const loadedScope = ref('')
let autoTimer: ReturnType<typeof setTimeout> | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null
let requestSequence = 0

const normalizedPlantel = computed(() => String(props.plantel || '').trim().toUpperCase())
const normalizedCiclo = computed(() => String(props.ciclo || '').trim())
const scopeKey = computed(() => `${normalizedPlantel.value}:${normalizedCiclo.value}`)
const plantelLabel = computed(() => `Plantel ${normalizedPlantel.value || '—'}`)
const cicloLabelText = computed(() => props.cicloLabel ? `Ciclo ${props.cicloLabel}` : `Ciclo ${normalizedCiclo.value || '—'}`)

const storageBaseKey = computed(() => {
  const user = encodeURIComponent(String(props.userKey || 'usuario').trim().toLowerCase())
  return `aurora:talleres:${user}:${scopeKey.value}`
})

const readPreference = () => {
  if (typeof window === 'undefined') return { dismissedAt: 0, acknowledgedAt: 0 }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageBaseKey.value) || '{}')
    return {
      dismissedAt: Number(parsed?.dismissedAt || 0),
      acknowledgedAt: Number(parsed?.acknowledgedAt || 0),
    }
  } catch {
    return { dismissedAt: 0, acknowledgedAt: 0 }
  }
}

const writePreference = (mode: 'dismiss' | 'acknowledge') => {
  if (typeof window === 'undefined') return
  const previous = readPreference()
  const now = Date.now()
  const next = mode === 'acknowledge'
    ? { dismissedAt: now, acknowledgedAt: now }
    : { ...previous, dismissedAt: now }
  try { window.localStorage.setItem(storageBaseKey.value, JSON.stringify(next)) } catch {}
}

const autoSessionKey = computed(() => `${storageBaseKey.value}:auto-shown`)
const shouldAutoOpen = () => {
  if (!props.eligible || !props.autoOpen || !normalizedPlantel.value || normalizedPlantel.value === 'GLOBAL') return false
  if (typeof window === 'undefined') return false
  try {
    if (window.sessionStorage.getItem(autoSessionKey.value) === '1') return false
  } catch {}

  const { dismissedAt, acknowledgedAt } = readPreference()
  const now = Date.now()
  if (acknowledgedAt && now - acknowledgedAt < ACKNOWLEDGE_MS) return false
  if (dismissedAt && now - dismissedAt < DAY_MS) return false
  return true
}

const markAutoShown = () => {
  if (typeof window === 'undefined') return
  try { window.sessionStorage.setItem(autoSessionKey.value, '1') } catch {}
}

const loadSummary = async (force = false) => {
  if (!props.eligible || !normalizedPlantel.value || normalizedPlantel.value === 'GLOBAL') return
  const hasCurrentSummary = Boolean(summary.value && loadedScope.value === scopeKey.value)
  if (!force && hasCurrentSummary) return

  const sequence = ++requestSequence
  loading.value = !hasCurrentSummary
  errorMessage.value = ''
  try {
    const response = await $fetch('/api/talleres-servicios/resumen', {
      query: { plantel: normalizedPlantel.value, ciclo: normalizedCiclo.value || undefined },
    })
    if (sequence !== requestSequence) return
    summary.value = response
    loadedScope.value = scopeKey.value
  } catch (error: any) {
    if (sequence !== requestSequence) return
    summary.value = null
    errorMessage.value = String(error?.data?.message || error?.message || 'No disponible')
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

const open = async (options: { automatic?: boolean, refresh?: boolean } = {}) => {
  if (!props.eligible || isOpen.value || isClosing.value) return
  if (options.automatic) markAutoShown()
  collapseStyle.value = {}
  isClosing.value = false
  isOpen.value = true
  void loadSummary(Boolean(options.refresh))
  await nextTick()
  closeButtonRef.value?.focus({ preventScroll: true })
}

const targetRect = () => {
  const target = props.targetElement
  return target && typeof target.getBoundingClientRect === 'function'
    ? target.getBoundingClientRect()
    : null
}

const prepareCollapse = () => {
  const panel = panelRef.value?.getBoundingClientRect()
  const target = targetRect()
  if (!panel || !target) {
    collapseStyle.value = {
      '--talleres-collapse-x': '0px',
      '--talleres-collapse-y': '-36px',
      '--talleres-collapse-scale-x': '0.18',
      '--talleres-collapse-scale-y': '0.08',
    }
    return
  }

  const panelCenterX = panel.left + panel.width / 2
  const panelCenterY = panel.top + panel.height / 2
  const targetCenterX = target.left + target.width / 2
  const targetCenterY = target.top + target.height / 2
  const scaleX = Math.max(0.045, Math.min(0.18, target.width / Math.max(panel.width, 1)))
  const scaleY = Math.max(0.045, Math.min(0.18, target.height / Math.max(panel.height, 1)))

  collapseStyle.value = {
    '--talleres-collapse-x': `${Math.round(targetCenterX - panelCenterX)}px`,
    '--talleres-collapse-y': `${Math.round(targetCenterY - panelCenterY)}px`,
    '--talleres-collapse-scale-x': String(scaleX),
    '--talleres-collapse-scale-y': String(scaleY),
  }
}

const close = (mode: 'dismiss' | 'acknowledge' = 'dismiss') => {
  if (!isOpen.value || isClosing.value) return
  writePreference(mode)
  prepareCollapse()
  isClosing.value = true

  if (closeTimer) clearTimeout(closeTimer)
  closeTimer = setTimeout(() => {
    isOpen.value = false
    isClosing.value = false
    collapseStyle.value = {}
    props.targetElement?.focus?.({ preventScroll: true })
    emit('returned')
  }, COLLAPSE_MS)
}

const scheduleAutoOpen = () => {
  if (autoTimer) clearTimeout(autoTimer)
  if (!shouldAutoOpen()) return
  void loadSummary(false)
  autoTimer = setTimeout(() => {
    if (shouldAutoOpen()) void open({ automatic: true })
  }, AUTO_DELAY_MS)
}

const onImageError = (event: Event) => {
  const image = event.currentTarget as HTMLImageElement | null
  if (!image || image.dataset.fallbackApplied === '1') return
  image.dataset.fallbackApplied = '1'
  image.src = fallbackImage
}

watch(
  () => [props.autoOpen, props.eligible, props.plantel, props.ciclo],
  () => {
    if (loadedScope.value && loadedScope.value !== scopeKey.value) {
      summary.value = null
      errorMessage.value = ''
      loadedScope.value = ''
      requestSequence += 1
      loading.value = false
    }
    scheduleAutoOpen()
  },
)

onMounted(scheduleAutoOpen)

onBeforeUnmount(() => {
  if (autoTimer) clearTimeout(autoTimer)
  if (closeTimer) clearTimeout(closeTimer)
  requestSequence += 1
})

defineExpose({ open, prefetch: loadSummary })
</script>

<style scoped>
.talleres-dialog-backdrop {
  position: fixed;
  z-index: 10050;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 22px;
  background: rgba(17, 31, 49, 0.34);
  backdrop-filter: blur(12px) saturate(0.9);
}

.talleres-dialog-backdrop.is-closing {
  animation: talleresBackdropOut 480ms ease forwards;
  pointer-events: none;
}

.talleres-dialog {
  --talleres-collapse-x: 0px;
  --talleres-collapse-y: -36px;
  --talleres-collapse-scale-x: 0.18;
  --talleres-collapse-scale-y: 0.08;
  position: relative;
  width: min(680px, calc(100vw - 28px));
  max-height: min(760px, calc(100dvh - 44px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(210, 225, 213, 0.92);
  border-radius: 28px;
  background:
    radial-gradient(circle at 12% -8%, rgba(136, 194, 91, 0.15), transparent 220px),
    #ffffff;
  box-shadow:
    0 36px 90px rgba(17, 31, 49, 0.24),
    0 8px 24px rgba(17, 31, 49, 0.08);
  transform-origin: center;
  animation: talleresDialogIn 360ms cubic-bezier(.2, .9, .22, 1.08) both;
}

.talleres-dialog.is-closing {
  animation: talleresReturnToTopbar 480ms cubic-bezier(.72, -.08, .88, .44) forwards;
  will-change: transform, opacity, filter, border-radius, clip-path;
}

.talleres-dialog-accent {
  position: absolute;
  z-index: 0;
  top: 0;
  right: 0;
  left: 0;
  height: 4px;
  background: linear-gradient(90deg, #69a943 0%, #3ba66d 48%, #278ca4 100%);
}

.talleres-dialog-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 24px 24px 18px;
}

.talleres-dialog-heading {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 13px;
}

.talleres-dialog-heading h2 {
  margin: 0;
  color: var(--ink, #162641);
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 1;
}

.talleres-dialog-heading p {
  margin: 6px 0 0;
  color: #758198;
  font-size: 0.76rem;
  font-weight: 700;
  line-height: 1.2;
}

.talleres-dialog-mark {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
  padding: 9px;
  border: 1px solid rgba(94, 158, 73, 0.2);
  border-radius: 15px;
  background: linear-gradient(145deg, #f0faeb, #ffffff);
  box-shadow: 0 8px 18px rgba(56, 113, 53, 0.08);
}

.talleres-dialog-mark i {
  display: block;
  border-radius: 4px;
}
.talleres-dialog-mark i:nth-child(1) { background: #72b64f; border-radius: 7px 4px 4px; }
.talleres-dialog-mark i:nth-child(2) { background: #33a57d; border-radius: 4px 7px 4px 4px; }
.talleres-dialog-mark i:nth-child(3) { background: #2a8fa4; border-radius: 4px 4px 4px 7px; }
.talleres-dialog-mark i:nth-child(4) { background: #e6a635; border-radius: 4px 4px 7px; }

.talleres-dialog-close {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e0e7ee;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
  color: #647287;
  cursor: pointer;
  transition: transform 150ms ease, color 150ms ease, border-color 150ms ease, background 150ms ease;
}

.talleres-dialog-close:hover {
  border-color: #cad7c8;
  background: #f8fbf7;
  color: #2f7037;
  transform: translateY(-1px);
}

.talleres-dialog-body {
  min-height: 250px;
  flex: 1 1 auto;
  overflow: auto;
  padding: 0 24px 18px;
  overscroll-behavior: contain;
}

.talleres-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.talleres-summary > div {
  min-height: 68px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid #e4ebee;
  border-radius: 17px;
  background: rgba(249, 252, 249, 0.84);
}

.talleres-summary strong {
  color: #285f35;
  font-size: 1.45rem;
  font-weight: 850;
  line-height: 1;
}

.talleres-summary span {
  color: #6f7d8d;
  font-size: 0.72rem;
  font-weight: 800;
}

.talleres-table-wrap {
  overflow: hidden;
  border: 1px solid #e1e8ed;
  border-radius: 19px;
  background: #fff;
}

.talleres-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.talleres-table th {
  height: 38px;
  padding: 0 16px;
  border-bottom: 1px solid #e7edf1;
  color: #8390a0;
  background: #f8faf9;
  font-size: 0.63rem;
  font-weight: 900;
  letter-spacing: 0.05em;
  text-align: left;
  text-transform: uppercase;
}

.talleres-table th:last-child,
.talleres-table td:last-child {
  width: 112px;
  text-align: right;
}

.talleres-table td {
  height: 62px;
  padding: 8px 16px;
  border-bottom: 1px solid #eef2f4;
  color: #25364d;
}

.talleres-table tbody tr:last-child td {
  border-bottom: 0;
}

.talleres-table tbody tr {
  transition: background 140ms ease;
}

.talleres-table tbody tr:hover {
  background: #fbfdfb;
}

.talleres-row-main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 11px;
}

.talleres-row-main strong {
  overflow: hidden;
  font-size: 0.82rem;
  font-weight: 800;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.talleres-row-image {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  overflow: hidden;
  border: 1px solid #e0e9dd;
  border-radius: 13px;
  background: #f1f7ef;
}

.talleres-row-image img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.talleres-count {
  min-width: 42px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  background: #edf8e9;
  color: #33733a;
  font-size: 0.82rem;
  font-weight: 900;
}

.talleres-dialog-footer {
  display: flex;
  justify-content: flex-end;
  padding: 15px 24px 22px;
  border-top: 1px solid rgba(228, 235, 239, 0.94);
  background: rgba(252, 253, 252, 0.94);
}

.talleres-confirm-button {
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 0 18px;
  border: 0;
  border-radius: 15px;
  background: linear-gradient(135deg, #75b64f 0%, #438c42 100%);
  color: white;
  box-shadow: 0 12px 24px rgba(57, 124, 60, 0.18);
  font-size: 0.82rem;
  font-weight: 850;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease, filter 150ms ease;
}

.talleres-confirm-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 16px 28px rgba(57, 124, 60, 0.24);
  filter: saturate(1.04);
}

.talleres-confirm-button:active:not(:disabled) {
  transform: translateY(0) scale(0.985);
}

.talleres-confirm-button:disabled {
  opacity: 0.54;
  cursor: wait;
}

.talleres-empty,
.talleres-error {
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #607085;
  text-align: center;
}

.talleres-empty strong,
.talleres-error strong {
  color: #33465c;
  font-size: 0.9rem;
  font-weight: 800;
}

.talleres-empty-mark {
  display: flex;
  align-items: end;
  gap: 4px;
  height: 34px;
}

.talleres-empty-mark i {
  width: 9px;
  display: block;
  border-radius: 9px;
  background: #d8e8d4;
}
.talleres-empty-mark i:nth-child(1) { height: 19px; }
.talleres-empty-mark i:nth-child(2) { height: 31px; background: #a9d39b; }
.talleres-empty-mark i:nth-child(3) { height: 24px; background: #7ebe70; }

.talleres-error button {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 14px;
  border: 1px solid #d7e2d5;
  border-radius: 12px;
  background: #fff;
  color: #34743b;
  font-size: 0.76rem;
  font-weight: 850;
  cursor: pointer;
}

.talleres-loading {
  padding-top: 2px;
}

.talleres-summary-skeleton {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.talleres-summary-skeleton span,
.talleres-row-skeleton {
  background: linear-gradient(90deg, #f3f6f3 22%, #e9efea 44%, #f3f6f3 68%);
  background-size: 220% 100%;
  animation: talleresShimmer 1.2s linear infinite;
}

.talleres-summary-skeleton span {
  height: 68px;
  border-radius: 17px;
}

.talleres-row-skeleton {
  height: 62px;
  display: grid;
  grid-template-columns: 40px 1fr 46px;
  align-items: center;
  gap: 11px;
  margin-bottom: 1px;
  padding: 0 16px;
  border-radius: 12px;
}

.talleres-row-skeleton i,
.talleres-row-skeleton span,
.talleres-row-skeleton strong {
  display: block;
  background: rgba(255,255,255,.7);
}
.talleres-row-skeleton i { width: 40px; height: 40px; border-radius: 13px; }
.talleres-row-skeleton span { width: 55%; height: 10px; border-radius: 999px; }
.talleres-row-skeleton strong { width: 38px; height: 28px; justify-self: end; border-radius: 10px; }

.talleres-backdrop-enter-active,
.talleres-backdrop-leave-active {
  transition: opacity 180ms ease;
}
.talleres-backdrop-enter-from,
.talleres-backdrop-leave-to {
  opacity: 0;
}

@keyframes talleresDialogIn {
  0% { opacity: 0; transform: translateY(16px) scale(.965); filter: blur(3px); }
  68% { opacity: 1; transform: translateY(-2px) scale(1.006); filter: blur(0); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes talleresReturnToTopbar {
  0% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1, 1) skew(0deg, 0deg) rotate(0deg);
    border-radius: 28px;
    filter: blur(0) saturate(1);
    clip-path: inset(0 round 28px);
  }
  42% {
    opacity: .95;
    transform: translate3d(calc(var(--talleres-collapse-x) * .34), calc(var(--talleres-collapse-y) * .34), 0) scale(.74, .58) skew(-3deg, 1deg) rotate(-1deg);
    border-radius: 36px 20px 40px 24px;
    filter: blur(.2px) saturate(1.08);
    clip-path: inset(5% 2% 8% 4% round 38px 22px 42px 24px);
  }
  72% {
    opacity: .64;
    transform: translate3d(calc(var(--talleres-collapse-x) * .76), calc(var(--talleres-collapse-y) * .76), 0) scale(.31, .18) skew(6deg, -2deg) rotate(2deg);
    border-radius: 46px;
    filter: blur(1.2px) saturate(1.15);
    clip-path: inset(14% 8% 12% 9% round 50%);
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--talleres-collapse-x), var(--talleres-collapse-y), 0) scale(var(--talleres-collapse-scale-x), var(--talleres-collapse-scale-y)) skew(0deg, 0deg) rotate(0deg);
    border-radius: 999px;
    filter: blur(3px) saturate(.85);
    clip-path: inset(0 round 999px);
  }
}

@keyframes talleresBackdropOut {
  to { background: rgba(17, 31, 49, 0); backdrop-filter: blur(0); }
}

@keyframes talleresShimmer {
  to { background-position: -220% 0; }
}

@media (max-width: 640px) {
  .talleres-dialog-backdrop {
    align-items: end;
    padding: 8px 8px max(8px, env(safe-area-inset-bottom));
  }

  .talleres-dialog {
    width: 100%;
    max-height: min(82dvh, 720px);
    border-radius: 26px;
  }

  .talleres-dialog-header {
    padding: 20px 18px 15px;
  }

  .talleres-dialog-heading {
    gap: 11px;
  }

  .talleres-dialog-mark {
    width: 40px;
    height: 40px;
    flex-basis: 40px;
    padding: 8px;
    border-radius: 14px;
  }

  .talleres-dialog-heading h2 {
    font-size: 1.28rem;
  }

  .talleres-dialog-heading p {
    font-size: 0.68rem;
  }

  .talleres-dialog-close {
    width: 42px;
    height: 42px;
    flex-basis: 42px;
  }

  .talleres-dialog-body {
    min-height: 210px;
    padding: 0 14px 14px;
  }

  .talleres-summary {
    gap: 8px;
    margin-bottom: 12px;
  }

  .talleres-summary > div {
    min-height: 60px;
    padding: 12px 13px;
    border-radius: 15px;
  }

  .talleres-summary strong {
    font-size: 1.25rem;
  }

  .talleres-table-wrap {
    border-radius: 17px;
  }

  .talleres-table th {
    height: 34px;
    padding-inline: 12px;
  }

  .talleres-table th:last-child,
  .talleres-table td:last-child {
    width: 84px;
  }

  .talleres-table td {
    height: 64px;
    padding: 9px 12px;
  }

  .talleres-row-image {
    width: 42px;
    height: 42px;
    flex-basis: 42px;
  }

  .talleres-row-main strong {
    font-size: 0.78rem;
  }

  .talleres-dialog-footer {
    padding: 12px 14px calc(14px + env(safe-area-inset-bottom));
  }

  .talleres-confirm-button {
    width: 100%;
    min-height: 50px;
    border-radius: 16px;
    font-size: 0.8rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .talleres-dialog,
  .talleres-dialog.is-closing,
  .talleres-dialog-backdrop.is-closing,
  .talleres-summary-skeleton span,
  .talleres-row-skeleton {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
  }
}
</style>
