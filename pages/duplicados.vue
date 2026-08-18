<template>
  <div class="dedupe-page">
    <header class="dedupe-header">
      <div class="dedupe-header__lead">
        <button type="button" class="icon-button" aria-label="Volver a alumnos" title="Volver" @click="navigateTo('/')">
          <LucideArrowLeft :size="18" />
        </button>
        <div>
          <span>Alumnos</span>
          <h1>Resolver duplicados</h1>
        </div>
      </div>

      <div class="dedupe-tabs" role="tablist" aria-label="Vista">
        <button type="button" :class="{ active: activeTab === 'candidates' }" @click="activeTab = 'candidates'">
          Posibles <span v-if="candidateTotal">{{ candidateTotal }}</span>
        </button>
        <button type="button" :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">
          Resueltos
        </button>
      </div>
    </header>

    <template v-if="activeTab === 'candidates'">
      <section class="manual-pair" aria-label="Comparar matrículas">
        <div class="manual-pair__inputs">
          <label>
            <span>Matrícula 1</span>
            <input v-model.trim="manualA" autocomplete="off" spellcheck="false" @input="queueManualPreview" />
          </label>
          <div class="manual-pair__link" aria-hidden="true"><LucideArrowLeftRight :size="16" /></div>
          <label>
            <span>Matrícula 2</span>
            <input v-model.trim="manualB" autocomplete="off" spellcheck="false" @input="queueManualPreview" />
          </label>
        </div>
        <button
          type="button"
          class="quiet-button"
          :disabled="!canPreviewManual || previewLoading"
          @click="previewPair(manualA, manualB, 'manual')"
        >
          <LucideSearch :size="16" /> Comparar
        </button>
      </section>

      <main class="dedupe-workspace" :class="{ 'has-preview': Boolean(preview) }">
        <aside class="candidate-panel">
          <div class="panel-heading">
            <div>
              <span>Coincidencias</span>
              <strong>{{ candidateTotal }}</strong>
            </div>
            <button type="button" class="icon-button compact" aria-label="Actualizar coincidencias" title="Actualizar" :disabled="candidatesLoading" @click="loadCandidates">
              <LucideRefreshCw :size="16" :class="{ spinning: candidatesLoading }" />
            </button>
          </div>

          <div v-if="candidatesLoading && !candidates.length" class="panel-empty">
            <LucideLoader2 class="spinning" :size="20" />
          </div>

          <div v-else-if="!candidates.length" class="panel-empty calm">
            <LucideCheck :size="20" />
            <span>Sin coincidencias pendientes</span>
          </div>

          <div v-else class="candidate-list">
            <article
              v-for="candidate in candidates"
              :key="candidate.key"
              class="candidate-card"
              :class="{ active: preview?.pairKey === candidate.key }"
            >
              <button type="button" class="candidate-card__main" @click="previewPair(candidate.left.matricula, candidate.right.matricula, 'candidate')">
                <div class="candidate-card__score">{{ percent(candidate.score) }}</div>
                <div class="candidate-card__people">
                  <strong>{{ candidate.left.nombre }}</strong>
                  <span>{{ candidate.left.matricula }}</span>
                  <i></i>
                  <strong>{{ candidate.right.nombre }}</strong>
                  <span>{{ candidate.right.matricula }}</span>
                </div>
                <LucideChevronRight :size="16" />
              </button>
              <button
                type="button"
                class="candidate-card__ignore"
                :disabled="ignoreLoadingKey === candidate.key"
                title="No son duplicados"
                @click="ignoreCandidate(candidate)"
              >
                <LucideUnlink :size="14" /> No son duplicados
              </button>
            </article>
          </div>
        </aside>

        <section class="compare-panel">
          <div v-if="previewLoading" class="compare-loading">
            <LucideLoader2 class="spinning" :size="24" />
          </div>

          <template v-else-if="preview">
            <div class="match-strip" aria-label="Coincidencia entre alumnos">
              <div>
                <span>Nombre</span>
                <strong>{{ percent(preview.similarity?.name) }}</strong>
              </div>
              <i></i>
              <div :class="{ positive: preview.similarity?.sameCurp }">
                <span>CURP</span>
                <strong>{{ preview.similarity?.sameCurp ? 'Coincide' : 'Distinto' }}</strong>
              </div>
              <i></i>
              <div :class="{ positive: preview.similarity?.samePlantel }">
                <span>Plantel</span>
                <strong>{{ preview.similarity?.samePlantel ? 'Coincide' : 'Distinto' }}</strong>
              </div>
              <template v-if="preview.knownMatriculaChain">
                <i></i>
                <div class="continuity">
                  <span>Relación</span>
                  <strong>Continuidad</strong>
                </div>
              </template>
            </div>

            <div class="student-compare-grid">
              <DuplicateStudentSide
                :student="preview.left"
                :selected="selectedWinner === preview.left.summary.matricula"
                side="left"
                @keep="chooseWinner(preview.left.summary.matricula)"
              />
              <DuplicateStudentSide
                :student="preview.right"
                :selected="selectedWinner === preview.right.summary.matricula"
                side="right"
                @keep="chooseWinner(preview.right.summary.matricula)"
              />
            </div>

            <div v-if="selectedWinner" class="merge-confirmation">
              <div class="merge-confirmation__route" aria-hidden="true">
                <span class="loser">{{ loserMatricula }}</span>
                <LucideArrowRight :size="17" />
                <span class="winner">{{ selectedWinner }}</span>
              </div>
              <div class="merge-confirmation__summary">
                <span>{{ loserCounts.documents }} conceptos</span>
                <i></i>
                <span>{{ loserCounts.payments }} pagos</span>
              </div>
              <button
                type="button"
                class="merge-button"
                :disabled="mergeLoading || !preview.centralAvailable || preview.knownMatriculaChain || preview.continuityConflict"
                @click="requestMerge"
              >
                <LucideGitMerge v-if="!mergeLoading" :size="17" />
                <LucideLoader2 v-else class="spinning" :size="17" />
                Confirmar unificación
              </button>
              <span v-if="preview.knownMatriculaChain" class="central-unavailable">Continuidad escolar</span>
              <span v-else-if="preview.continuityConflict" class="central-unavailable">Continuidad distinta</span>
              <span v-else-if="!preview.centralAvailable" class="central-unavailable">Ficha escolar no disponible</span>
            </div>
          </template>

          <div v-else class="compare-empty">
            <div class="compare-empty__mark"><LucideScanSearch :size="28" /></div>
            <span>Selecciona una coincidencia</span>
          </div>
        </section>
      </main>
    </template>

    <section v-else class="history-panel">
      <div class="panel-heading history-heading">
        <div>
          <span>Historial</span>
          <strong>{{ history.length }}</strong>
        </div>
        <button type="button" class="icon-button compact" aria-label="Actualizar historial" title="Actualizar" :disabled="historyLoading" @click="loadHistory">
          <LucideRefreshCw :size="16" :class="{ spinning: historyLoading }" />
        </button>
      </div>

      <div v-if="historyLoading && !history.length" class="panel-empty"><LucideLoader2 class="spinning" :size="20" /></div>
      <div v-else-if="!history.length" class="panel-empty calm"><span>Sin resoluciones</span></div>
      <div v-else class="history-list">
        <article v-for="item in history" :key="item.resolution_key" class="history-row">
          <div class="history-row__state" :class="{ reverted: item.status === 'reverted' }">
            <LucideGitMerge v-if="item.status !== 'reverted'" :size="16" />
            <LucideUndo2 v-else :size="16" />
          </div>
          <div class="history-row__people">
            <strong>{{ item.winner_name || item.winner_matricula }}</strong>
            <span>{{ item.winner_matricula }}</span>
          </div>
          <div class="history-row__merge">
            <span>{{ item.loser_matricula }}</span>
            <LucideArrowRight :size="15" />
          </div>
          <time>{{ formatDate(item.created_at) }}</time>
          <button
            v-if="historyActionAvailable(item)"
            type="button"
            class="quiet-button compact-text"
            :disabled="reverseLoadingKey === item.resolution_key"
            @click="requestReverse(item)"
          >
            <LucideUndo2 :size="15" /> {{ item.status === 'completed' ? 'Revertir' : 'Recuperar' }}
          </button>
          <span v-else class="history-row__status">{{ historyStatus(item.status) }}</span>
        </article>
      </div>
    </section>

    <div v-if="confirmation" class="confirm-layer" role="presentation" @mousedown.self="confirmation = null">
      <section class="confirm-card" role="dialog" aria-modal="true" :aria-labelledby="confirmation.type === 'merge' ? 'confirm-merge-title' : 'confirm-reverse-title'">
        <div class="confirm-card__icon">
          <LucideGitMerge v-if="confirmation.type === 'merge'" :size="21" />
          <LucideUndo2 v-else :size="21" />
        </div>
        <h2 :id="confirmation.type === 'merge' ? 'confirm-merge-title' : 'confirm-reverse-title'">
          {{ confirmation.type === 'merge' ? 'Unificar matrículas' : 'Revertir unificación' }}
        </h2>
        <div class="confirm-card__pair">
          <span>{{ confirmation.from }}</span>
          <LucideArrowRight v-if="confirmation.type === 'merge'" :size="16" />
          <LucideArrowLeftRight v-else :size="16" />
          <strong>{{ confirmation.to }}</strong>
        </div>
        <div class="confirm-card__actions">
          <button type="button" class="quiet-button" @click="confirmation = null">Cancelar</button>
          <button type="button" class="merge-button" @click="confirmAction">
            {{ confirmation.type === 'merge' ? 'Unificar' : 'Revertir' }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import {
  LucideArrowLeft,
  LucideArrowLeftRight,
  LucideArrowRight,
  LucideCheck,
  LucideChevronRight,
  LucideGitMerge,
  LucideLoader2,
  LucideRefreshCw,
  LucideScanSearch,
  LucideSearch,
  LucideUndo2,
  LucideUnlink,
} from 'lucide-vue-next'
import DuplicateStudentSide from '~/components/students/DuplicateStudentSide.vue'

useHead({ title: 'Resolver duplicados · Aurora' })

const { show } = useToast()
const activeTab = ref('candidates')
const candidates = ref([])
const candidateTotal = ref(0)
const history = ref([])
const preview = ref(null)
const candidatesLoading = ref(false)
const historyLoading = ref(false)
const previewLoading = ref(false)
const mergeLoading = ref(false)
const reverseLoadingKey = ref('')
const ignoreLoadingKey = ref('')
const manualA = ref('')
const manualB = ref('')
const selectedWinner = ref('')
const confirmation = ref(null)
let manualTimer = null
let previewRequestId = 0

const normalizeMatricula = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, '')
const canPreviewManual = computed(() => {
  const a = normalizeMatricula(manualA.value)
  const b = normalizeMatricula(manualB.value)
  return Boolean(a && b && a !== b)
})

const loserMatricula = computed(() => {
  if (!preview.value || !selectedWinner.value) return ''
  const left = preview.value.left?.summary?.matricula
  const right = preview.value.right?.summary?.matricula
  return selectedWinner.value === left ? right : left
})

const loserStudent = computed(() => {
  if (!preview.value || !loserMatricula.value) return null
  return preview.value.left?.summary?.matricula === loserMatricula.value ? preview.value.left : preview.value.right
})

const loserCounts = computed(() => ({
  documents: Number(loserStudent.value?.counts?.documents || 0),
  payments: Number(loserStudent.value?.counts?.payments || 0),
}))

const errorMessage = (error, fallback) => String(
  error?.data?.message || error?.data?.statusMessage || error?.message || fallback
)

const percent = (value) => `${Math.round(Number(value || 0) * 100)}%`

const loadCandidates = async () => {
  candidatesLoading.value = true
  try {
    const response = await $fetch('/api/student-duplicates/candidates', { query: { limit: 150 } })
    candidates.value = Array.isArray(response?.candidates) ? response.candidates : []
    candidateTotal.value = Number(response?.count || candidates.value.length)
  } catch (error) {
    show(errorMessage(error, 'No se pudieron cargar las coincidencias.'), 'danger')
  } finally {
    candidatesLoading.value = false
  }
}

const loadHistory = async () => {
  historyLoading.value = true
  try {
    const response = await $fetch('/api/student-duplicates/history', { query: { limit: 100 } })
    history.value = Array.isArray(response?.resolutions) ? response.resolutions : []
  } catch (error) {
    show(errorMessage(error, 'No se pudo cargar el historial.'), 'danger')
  } finally {
    historyLoading.value = false
  }
}

const previewPair = async (matriculaA, matriculaB, source = 'candidate') => {
  const a = normalizeMatricula(matriculaA)
  const b = normalizeMatricula(matriculaB)
  if (!a || !b || a === b) return
  const requestId = ++previewRequestId
  previewLoading.value = true
  selectedWinner.value = ''
  try {
    const response = await $fetch('/api/student-duplicates/preview', {
      method: 'POST',
      body: { matriculaA: a, matriculaB: b },
    })
    if (requestId !== previewRequestId) return
    preview.value = response
    if (source === 'candidate') {
      manualA.value = a
      manualB.value = b
    }
  } catch (error) {
    if (requestId === previewRequestId) {
      preview.value = null
      show(errorMessage(error, 'No se pudieron comparar las matrículas.'), 'danger')
    }
  } finally {
    if (requestId === previewRequestId) previewLoading.value = false
  }
}

const queueManualPreview = () => {
  if (manualTimer) window.clearTimeout(manualTimer)
  if (!canPreviewManual.value) return
  manualTimer = window.setTimeout(() => previewPair(manualA.value, manualB.value, 'manual'), 320)
}

const ignoreCandidate = async (candidate) => {
  ignoreLoadingKey.value = candidate.key
  try {
    await $fetch('/api/student-duplicates/ignore', {
      method: 'POST',
      body: { matriculaA: candidate.left.matricula, matriculaB: candidate.right.matricula },
    })
    candidates.value = candidates.value.filter((item) => item.key !== candidate.key)
    candidateTotal.value = Math.max(0, candidateTotal.value - 1)
    if (preview.value?.pairKey === candidate.key) {
      preview.value = null
      selectedWinner.value = ''
    }
  } catch (error) {
    show(errorMessage(error, 'No se pudo descartar la coincidencia.'), 'danger')
  } finally {
    ignoreLoadingKey.value = ''
  }
}

const chooseWinner = (matricula) => {
  selectedWinner.value = normalizeMatricula(matricula)
}

const requestMerge = () => {
  if (!selectedWinner.value || !loserMatricula.value || preview.value?.knownMatriculaChain || preview.value?.continuityConflict) return
  confirmation.value = {
    type: 'merge',
    from: loserMatricula.value,
    to: selectedWinner.value,
  }
}

const requestReverse = (item) => {
  confirmation.value = {
    type: 'reverse',
    resolutionKey: item.resolution_key,
    from: item.loser_matricula,
    to: item.winner_matricula,
  }
}

const confirmAction = async () => {
  const action = confirmation.value
  confirmation.value = null
  if (!action) return
  if (action.type === 'merge') await mergeStudents(action.to, action.from)
  else await reverseResolution(action)
}

const mergeStudents = async (winner, loser) => {
  mergeLoading.value = true
  try {
    await $fetch('/api/student-duplicates/merge', {
      method: 'POST',
      body: { winner, loser },
    })
    show('Matrículas unificadas.', 'success')
    preview.value = null
    selectedWinner.value = ''
    manualA.value = ''
    manualB.value = ''
    await Promise.all([loadCandidates(), loadHistory()])
  } catch (error) {
    show(errorMessage(error, 'No se pudo completar la unificación.'), 'danger')
  } finally {
    mergeLoading.value = false
  }
}

const reverseResolution = async (action) => {
  reverseLoadingKey.value = action.resolutionKey
  try {
    await $fetch('/api/student-duplicates/reverse', {
      method: 'POST',
      body: { resolutionKey: action.resolutionKey },
    })
    show('Unificación revertida.', 'success')
    await Promise.all([loadCandidates(), loadHistory()])
  } catch (error) {
    show(errorMessage(error, 'No se pudo revertir la unificación.'), 'danger')
  } finally {
    reverseLoadingKey.value = ''
  }
}

const formatDate = (value) => {
  if (!value) return '—'
  const raw = String(value).trim()
  const date = new Date(raw.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

const historyActionAvailable = (item) => {
  const status = String(item?.status || '')
  if (status === 'completed') return true
  if (!['bridge_applied', 'central_pending', 'central_applied'].includes(status)) return false
  const stamp = new Date(String(item?.updated_at || item?.created_at || '').replace(' ', 'T')).getTime()
  return Number.isFinite(stamp) && Date.now() - stamp >= 90_000
}

const historyStatus = (status) => ({
  reverted: 'Revertido',
  failed_reverted: 'Revertido',
  recovery_required: 'Revisión requerida',
  bridge_applied: 'En proceso',
  central_pending: 'En proceso',
  central_applied: 'En proceso',
}[String(status || '')] || String(status || ''))

watch(activeTab, (tab) => {
  if (tab === 'history' && !history.value.length) loadHistory()
})

onMounted(() => {
  loadCandidates()
  loadHistory()
})

onBeforeUnmount(() => {
  if (manualTimer) window.clearTimeout(manualTimer)
})
</script>

<style scoped>
.dedupe-page {
  min-height: calc(100vh - 80px);
  padding: clamp(18px, 2vw, 30px);
  color: #27342d;
}

.dedupe-header {
  max-width: 1540px;
  margin: 0 auto 16px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
}

.dedupe-header__lead { display: flex; align-items: center; gap: 12px; }
.dedupe-header__lead span { display: block; margin-bottom: 2px; color: #89938d; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.dedupe-header h1 { margin: 0; color: #26332b; font-size: clamp(24px, 2vw, 32px); line-height: 1.05; letter-spacing: -.035em; }

.icon-button {
  width: 39px; height: 39px; display: grid; place-items: center; flex: 0 0 39px;
  border: 1px solid #dfe6e1; border-radius: 12px; background: #fff; color: #66736b; cursor: pointer;
}
.icon-button:hover:not(:disabled) { border-color: #cad7ce; color: #3e694c; }
.icon-button.compact { width: 32px; height: 32px; flex-basis: 32px; border-radius: 9px; }
.icon-button:disabled { opacity: .45; cursor: default; }

.dedupe-tabs { display: inline-flex; padding: 4px; gap: 3px; border: 1px solid #e0e6e2; border-radius: 12px; background: #f7f9f7; }
.dedupe-tabs button { min-height: 32px; border: 0; border-radius: 8px; padding: 0 12px; background: transparent; color: #738078; font: inherit; font-size: 12px; font-weight: 750; cursor: pointer; }
.dedupe-tabs button.active { background: #fff; color: #335b40; box-shadow: 0 1px 5px rgba(49, 67, 55, .08); }
.dedupe-tabs button span { display: inline-grid; min-width: 18px; height: 18px; place-items: center; margin-left: 4px; border-radius: 9px; background: #eef4ef; font-size: 10px; }

.manual-pair {
  max-width: 1540px; margin: 0 auto 14px; padding: 11px 12px; display: flex; align-items: flex-end; gap: 10px;
  border: 1px solid #e0e7e2; border-radius: 14px; background: rgba(255,255,255,.88); box-shadow: 0 5px 20px rgba(47, 65, 53, .035);
}
.manual-pair__inputs { display: flex; align-items: flex-end; gap: 7px; flex: 1; min-width: 0; }
.manual-pair label { min-width: 150px; max-width: 250px; flex: 1; }
.manual-pair label span { display: block; margin: 0 0 5px 2px; color: #8a958e; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .055em; }
.manual-pair input { width: 100%; height: 36px; box-sizing: border-box; padding: 0 11px; border: 1px solid #dbe4dd; border-radius: 9px; outline: none; background: #fff; color: #29372e; font: inherit; font-size: 13px; font-weight: 750; text-transform: uppercase; }
.manual-pair input:focus { border-color: #8eb59a; box-shadow: 0 0 0 3px rgba(70, 133, 88, .09); }
.manual-pair__link { width: 29px; height: 36px; display: grid; place-items: center; color: #a0aaa3; }

.quiet-button, .merge-button {
  min-height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border-radius: 9px; padding: 0 13px;
  font: inherit; font-size: 12px; font-weight: 800; cursor: pointer;
}
.quiet-button { border: 1px solid #dbe4dd; background: #fff; color: #56645b; }
.quiet-button:hover:not(:disabled) { border-color: #c5d3c9; color: #385d45; }
.merge-button { border: 1px solid #4c965f; background: #4b9b60; color: #fff; box-shadow: 0 4px 12px rgba(56, 132, 77, .15); }
.merge-button:hover:not(:disabled) { background: #438d56; }
.quiet-button:disabled, .merge-button:disabled { opacity: .46; cursor: default; }
.quiet-button.compact-text { min-height: 31px; padding: 0 10px; }

.dedupe-workspace {
  max-width: 1540px; min-height: 650px; margin: 0 auto; display: grid; grid-template-columns: minmax(290px, 340px) minmax(0, 1fr); gap: 14px;
}
.candidate-panel, .compare-panel, .history-panel { border: 1px solid #e0e6e2; background: #fff; box-shadow: 0 8px 28px rgba(42, 60, 48, .045); }
.candidate-panel { min-height: 650px; border-radius: 16px; overflow: hidden; }
.compare-panel { min-width: 0; border-radius: 16px; overflow: hidden; }
.panel-heading { min-height: 54px; padding: 0 14px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #edf0ee; }
.panel-heading > div { display: flex; align-items: baseline; gap: 7px; }
.panel-heading span { color: #7d8881; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
.panel-heading strong { color: #3c694a; font-size: 12px; }
.panel-empty { min-height: 280px; display: flex; align-items: center; justify-content: center; gap: 9px; color: #849087; font-size: 12px; font-weight: 700; }
.panel-empty.calm { flex-direction: column; color: #8b968f; }

.candidate-list { max-height: 720px; overflow: auto; padding: 8px; }
.candidate-card { margin-bottom: 7px; border: 1px solid #e7ebe8; border-radius: 12px; background: #fff; overflow: hidden; transition: border-color 130ms ease, background 130ms ease; }
.candidate-card:hover, .candidate-card.active { border-color: #c9d8ce; background: #fbfdfb; }
.candidate-card__main { width: 100%; display: grid; grid-template-columns: 46px minmax(0, 1fr) 18px; gap: 9px; align-items: center; padding: 10px; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.candidate-card__score { width: 43px; height: 43px; display: grid; place-items: center; border-radius: 12px; background: #eef5f0; color: #4d815d; font-size: 11px; font-weight: 850; }
.candidate-card__people { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1px 7px; }
.candidate-card__people strong { overflow: hidden; color: #334039; font-size: 11px; font-weight: 760; text-overflow: ellipsis; white-space: nowrap; }
.candidate-card__people span { color: #89948d; font-size: 10px; font-weight: 700; }
.candidate-card__people i { grid-column: 1 / -1; height: 1px; margin: 4px 0; background: #eef1ef; }
.candidate-card__main > svg { color: #a4aea7; }
.candidate-card__ignore { width: 100%; height: 29px; display: flex; align-items: center; justify-content: flex-end; gap: 6px; padding: 0 10px; border: 0; border-top: 1px solid #f0f2f0; background: transparent; color: #909a93; font: inherit; font-size: 10px; font-weight: 700; cursor: pointer; }
.candidate-card__ignore:hover:not(:disabled) { color: #58665d; background: #fafbfa; }

.compare-loading, .compare-empty { min-height: 648px; display: flex; align-items: center; justify-content: center; color: #91a097; }
.compare-empty { flex-direction: column; gap: 12px; font-size: 12px; font-weight: 750; }
.compare-empty__mark { width: 62px; height: 62px; display: grid; place-items: center; border-radius: 20px; background: #f4f7f5; color: #82a08a; }
.match-strip { min-height: 54px; padding: 0 18px; display: flex; align-items: center; justify-content: center; gap: 18px; border-bottom: 1px solid #edf0ee; background: #fbfcfb; }
.match-strip > div { display: flex; align-items: baseline; gap: 6px; color: #7e8982; }
.match-strip span { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; }
.match-strip strong { color: #5f6d64; font-size: 12px; }
.match-strip .positive strong { color: #4a8159; }
.match-strip .continuity strong { color: #987041; }
.match-strip > i { width: 1px; height: 16px; background: #e2e7e3; }
.student-compare-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); min-height: 520px; }
.student-compare-grid > :first-child { border-right: 1px solid #e9eeea; }
.merge-confirmation { min-height: 66px; padding: 10px 13px; display: flex; align-items: center; justify-content: flex-end; gap: 12px; border-top: 1px solid #e4e9e5; background: #fbfdfb; }
.merge-confirmation__route { margin-right: auto; display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 800; }
.merge-confirmation__route .loser { color: #8a958e; text-decoration: line-through; text-decoration-color: #c2cbc5; }
.merge-confirmation__route .winner { color: #3e774d; }
.merge-confirmation__summary { display: flex; align-items: center; gap: 7px; color: #7b877f; font-size: 10px; font-weight: 700; }
.merge-confirmation__summary i { width: 3px; height: 3px; border-radius: 50%; background: #c4ccc7; }
.central-unavailable { color: #9b7048; font-size: 10px; font-weight: 750; }

.history-panel { max-width: 1540px; min-height: 470px; margin: 0 auto; border-radius: 16px; overflow: hidden; }
.history-heading { padding-inline: 18px; }
.history-list { padding: 7px 12px 14px; }
.history-row { min-height: 59px; display: grid; grid-template-columns: 34px minmax(210px, 1fr) minmax(130px, .7fr) 130px auto; gap: 12px; align-items: center; padding: 6px 8px; border-bottom: 1px solid #edf0ee; }
.history-row:last-child { border-bottom: 0; }
.history-row__state { width: 31px; height: 31px; display: grid; place-items: center; border-radius: 9px; background: #eff6f1; color: #4f845e; }
.history-row__state.reverted { background: #f3f4f3; color: #8b958f; }
.history-row__people { min-width: 0; }
.history-row__people strong { display: block; overflow: hidden; color: #344139; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.history-row__people span, .history-row__merge, .history-row time, .history-row__status { color: #89938d; font-size: 10px; font-weight: 700; }
.history-row__merge { display: flex; align-items: center; gap: 7px; }
.history-row time { white-space: nowrap; }
.history-row__status { justify-self: end; }

.confirm-layer { position: fixed; inset: 0; z-index: 1500; display: grid; place-items: center; padding: 20px; background: rgba(31, 40, 34, .30); backdrop-filter: blur(5px); }
.confirm-card { width: min(390px, 100%); padding: 22px; border: 1px solid #e0e6e2; border-radius: 18px; background: #fff; box-shadow: 0 28px 80px rgba(29, 42, 34, .18); text-align: center; }
.confirm-card__icon { width: 44px; height: 44px; margin: 0 auto 11px; display: grid; place-items: center; border-radius: 14px; background: #eff6f1; color: #4f845e; }
.confirm-card h2 { margin: 0; color: #2f3e35; font-size: 18px; letter-spacing: -.02em; }
.confirm-card__pair { margin: 17px 0 19px; display: flex; align-items: center; justify-content: center; gap: 8px; color: #8a948e; font-size: 12px; font-weight: 800; }
.confirm-card__pair strong { color: #467854; }
.confirm-card__actions { display: flex; justify-content: center; gap: 8px; }

.spinning { animation: dedupe-spin .8s linear infinite; }
@keyframes dedupe-spin { to { transform: rotate(360deg); } }

@media (max-width: 980px) {
  .dedupe-workspace { grid-template-columns: 1fr; }
  .candidate-panel { min-height: 0; }
  .candidate-list { max-height: 330px; }
  .student-compare-grid { grid-template-columns: 1fr; }
  .student-compare-grid > :first-child { border-right: 0; border-bottom: 1px solid #e9eeea; }
  .history-row { grid-template-columns: 34px minmax(150px, 1fr) minmax(100px, .6fr) auto; }
  .history-row time { display: none; }
}

@media (max-width: 680px) {
  .dedupe-page { padding: 13px; }
  .dedupe-header { align-items: center; }
  .dedupe-header__lead span { display: none; }
  .dedupe-header h1 { font-size: 21px; }
  .manual-pair { align-items: stretch; flex-direction: column; }
  .manual-pair__inputs { width: 100%; }
  .manual-pair label { min-width: 0; }
  .merge-confirmation { align-items: stretch; flex-direction: column; }
  .merge-confirmation__route { margin: 0; justify-content: center; }
  .merge-confirmation__summary { justify-content: center; }
  .history-row { grid-template-columns: 34px 1fr auto; }
  .history-row__merge { display: none; }
}
</style>
