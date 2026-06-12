<template>
  <section class="sql-console-page">
    <div class="sql-hero">
      <div>
        <p class="eyebrow">Superadmin</p>
        <h2>Consola SQL</h2>
        <p>
          Ejecuta SQL directamente desde texto o archivo <code>.sql</code>. Soporta múltiples sentencias y archivos con
          <code>DELIMITER</code> para rutinas/procedimientos.
        </p>
      </div>
      <div class="target-card">
        <label for="sql-target-plantel">Destino</label>
        <select id="sql-target-plantel" v-model="targetPlantel" :disabled="isRunning">
          <option v-for="plantel in targetPlantelOptions" :key="plantel" :value="plantel">{{ plantel }}</option>
        </select>
        <small>Activo: {{ activePlantelLabel }}</small>
      </div>
    </div>

    <div v-if="!isSuperAdmin" class="access-denied">
      <LucideShieldAlert :size="26" />
      <div>
        <strong>Acceso restringido</strong>
        <p>Esta sección solo está disponible para superadmin.</p>
      </div>
    </div>

    <template v-else>
      <div v-if="executionErrorSummary" class="result-banner result-banner-error result-banner-compact">
        <LucideAlertTriangle :size="18" />
        <div>
          <strong>{{ executionErrorSummary.message }}</strong>
          <small v-if="executionErrorSummary.hint">{{ executionErrorSummary.hint }}</small>
        </div>
      </div>

      <div class="sql-grid">
        <div class="editor-panel">
          <div class="panel-head">
            <div>
              <h3>Consulta</h3>
              <p>Pega SQL o carga un archivo. Se ejecuta en orden.</p>
            </div>
            <div class="panel-actions">
              <button class="ghost-button" type="button" @click="clearEditor" :disabled="isRunning || !sqlText">
                Limpiar
              </button>
              <button class="run-button" type="button" :disabled="isRunning || !sqlText.trim()" @click="executeSql">
                <LucidePlay v-if="!isRunning" :size="18" />
                <LucideLoader2 v-else :size="18" class="spin" />
                {{ isRunning ? 'Ejecutando…' : runButtonLabel }}
              </button>
            </div>
          </div>

          <label
            class="upload-zone"
            :class="{ 'upload-zone-active': isDragging }"
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="handleDrop"
          >
            <input ref="fileInput" type="file" accept=".sql,text/sql,text/plain" @change="handleFileChange" />
            <LucideFileUp :size="24" />
            <span>{{ fileName || 'Arrastra un .sql o haz clic para cargar' }}</span>
            <small v-if="fileMeta">{{ fileMeta }}</small>
          </label>

          <div class="editor-toolbar">
            <div class="statement-chip">
              <LucideListChecks :size="16" />
              {{ estimatedStatementsLabel }}
            </div>
            <label class="continue-toggle">
              <input v-model="continueOnError" type="checkbox" :disabled="isRunning" />
              Continuar si falla
            </label>
          </div>

          <textarea
            v-model="sqlText"
            class="sql-textarea"
            spellcheck="false"
            placeholder="-- Ejemplo\nSELECT COUNT(*) AS total FROM base;\n\nUPDATE base SET ciclo = '2025-2026' WHERE matricula = '...';"
          />
        </div>

        <aside class="safety-panel">
          <div class="safety-icon"><LucideShieldCheck :size="24" /></div>
          <h3>Guardas activas</h3>
          <p>La ruta y el endpoint rechazan cualquier sesión que no sea superadmin.</p>
          <ul>
            <li>Máximo 2 MB por ejecución.</li>
            <li>Máximo 300 sentencias por lote.</li>
            <li>Las filas de resultado se previsualizan hasta 200 por sentencia.</li>
            <li>El SQL se ejecuta literalmente. Revisa el destino activo antes de confirmar.</li>
          </ul>
        </aside>
      </div>

      <div v-if="errorMessage" class="result-banner result-banner-error">
        <LucideAlertTriangle :size="18" />
        <span>{{ errorMessage }}</span>
      </div>

      <div v-if="isRunning" class="result-banner result-banner-running">
        <LucideLoader2 :size="18" class="spin" />
        <span>Ejecutando SQL en {{ targetPlantelLabel }}. El resultado o cualquier error del bridge aparecerá aquí.</span>
      </div>

      <div v-if="execution" class="results-panel">
        <div class="results-summary" :class="execution.success ? 'summary-success' : 'summary-error'">
          <div>
            <span>{{ execution.success ? 'Ejecución completada' : 'Ejecución con errores' }}</span>
            <strong>
              {{ execution.successfulStatements }} correctas · {{ execution.failedStatements }} fallidas · {{ execution.durationMs }} ms
            </strong>
            <small>
              {{ execution.executedStatements }} de {{ execution.totalStatements }} sentencias ejecutadas ·
              {{ execution.transport }} · destino {{ execution.targetPlantel || execution.dataPlantel || execution.activePlantel }}
            </small>
          </div>
          <button class="ghost-button" type="button" @click="copySummary">Copiar resumen</button>
        </div>

        <div class="statement-results">
          <article
            v-for="item in execution.results"
            :key="item.index"
            class="statement-card"
            :class="item.status === 'success' ? 'statement-success' : 'statement-error'"
          >
            <header>
              <div>
                <span>Sentencia {{ item.index }}</span>
                <strong>{{ item.status === 'success' ? 'Correcta' : 'Error' }}</strong>
              </div>
              <small>{{ item.durationMs }} ms</small>
            </header>

            <pre class="statement-sql">{{ item.sql }}</pre>

            <div v-if="item.status === 'error'" class="statement-error-box">
              <strong>{{ item.error?.message }}</strong>
              <span v-if="formatErrorMeta(item.error)">{{ formatErrorMeta(item.error) }}</span>
              <small v-if="item.error?.hint">{{ item.error.hint }}</small>
            </div>

            <template v-else-if="item.result?.kind === 'rows'">
              <div class="table-meta">
                {{ item.result.rowCount }} filas
                <span v-if="item.result.rowCount > item.result.previewRowCount">
                  · mostrando {{ item.result.previewRowCount }}
                </span>
              </div>
              <div v-if="item.result.rows.length" class="rows-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th v-for="column in item.result.columns" :key="column">{{ column }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, rowIndex) in item.result.rows" :key="rowIndex">
                      <td v-for="column in item.result.columns" :key="column">
                        {{ formatCell(row[column]) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="empty-result">La consulta no devolvió filas.</p>
            </template>

            <template v-else>
              <div class="write-result-grid">
                <div>
                  <span>Afectadas</span>
                  <strong>{{ item.result?.affectedRows ?? 0 }}</strong>
                </div>
                <div>
                  <span>Cambiadas</span>
                  <strong>{{ item.result?.changedRows ?? 0 }}</strong>
                </div>
                <div>
                  <span>Insert ID</span>
                  <strong>{{ item.result?.insertId ?? 0 }}</strong>
                </div>
                <div>
                  <span>Warnings</span>
                  <strong>{{ item.result?.warningStatus ?? 0 }}</strong>
                </div>
              </div>
            </template>
          </article>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { useCookie, useRouter } from '#app'
import { PLANTELES_LIST } from '~/utils/constants'
import {
  LucideAlertTriangle,
  LucideFileUp,
  LucideListChecks,
  LucideLoader2,
  LucidePlay,
  LucideShieldAlert,
  LucideShieldCheck
} from 'lucide-vue-next'

const router = useRouter()
const roleCookie = useCookie('auth_role')
const activePlantelCookie = useCookie('auth_active_plantel')
const homePlantelCookie = useCookie('auth_home_plantel')
const bridgeAgentCookie = useCookie('db_bridge_agent_id')

const sqlText = ref('')
const fileName = ref('')
const fileMeta = ref('')
const isDragging = ref(false)
const isRunning = ref(false)
const continueOnError = ref(false)
const targetPlantel = ref('')
const execution = ref(null)
const errorMessage = ref('')
const fileInput = ref(null)

const roleTokens = computed(() => String(roleCookie.value || '')
  .split(',')
  .map(role => role.trim().toLowerCase())
  .filter(Boolean))
const isSuperAdmin = computed(() => roleTokens.value.includes('superadmin'))
const activePlantelLabel = computed(() => activePlantelCookie.value === 'GLOBAL' ? 'CONSOLIDADO' : `PLANTEL ${activePlantelCookie.value || 'ACTIVO'}`)
const targetPlantelOptions = computed(() => PLANTELES_LIST)
const targetPlantelLabel = computed(() => targetPlantel.value ? `PLANTEL ${targetPlantel.value}` : activePlantelLabel.value)
const estimatedStatements = computed(() => {
  const matches = sqlText.value
    .split(/;\s*(?:\n|$)/)
    .map(entry => entry.trim())
    .filter(Boolean)
  return Math.max(matches.length, sqlText.value.trim() ? 1 : 0)
})
const estimatedStatementsLabel = computed(() => estimatedStatements.value === 1 ? '1 sentencia estimada' : `${estimatedStatements.value} sentencias estimadas`)
const runButtonLabel = computed(() => estimatedStatements.value > 1 ? `Ejecutar ${estimatedStatements.value} sentencias` : 'Ejecutar SQL')
const executionErrorSummary = computed(() => {
  if (!execution.value || execution.value.success) return null
  const firstError = execution.value.results?.find(item => item.status === 'error')?.error
  if (!firstError) return null

  return {
    message: firstError.message || 'La ejecución terminó con errores.',
    hint: firstError.hint || ''
  }
})

onMounted(() => {
  const initialTarget = String(activePlantelCookie.value || '').trim().toUpperCase()
  const bridgeTarget = String(bridgeAgentCookie.value || homePlantelCookie.value || '').trim().toUpperCase()
  targetPlantel.value = PLANTELES_LIST.includes(initialTarget)
    ? initialTarget
    : (PLANTELES_LIST.includes(bridgeTarget) ? bridgeTarget : PLANTELES_LIST[0])

  if (!isSuperAdmin.value) {
    router.replace('/')
  }
})

const readFile = async (file) => {
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.sql') && !file.type.startsWith('text/')) {
    errorMessage.value = 'Carga un archivo .sql o de texto plano.'
    return
  }

  const text = await file.text()
  sqlText.value = text
  fileName.value = file.name
  fileMeta.value = `${(file.size / 1024).toFixed(1)} KB`
  execution.value = null
  errorMessage.value = ''
}

const handleFileChange = async (event) => {
  const file = event.target.files?.[0]
  await readFile(file)
}

const handleDrop = async (event) => {
  isDragging.value = false
  const file = event.dataTransfer?.files?.[0]
  await readFile(file)
}

const clearEditor = () => {
  sqlText.value = ''
  fileName.value = ''
  fileMeta.value = ''
  execution.value = null
  errorMessage.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

const executeSql = async () => {
  if (!sqlText.value.trim()) return
  isRunning.value = true
  errorMessage.value = ''
  execution.value = null

  try {
    execution.value = await $fetch('/api/admin/sql-console/execute', {
      method: 'POST',
      body: {
        sql: sqlText.value,
        continueOnError: continueOnError.value,
        targetPlantel: targetPlantel.value
      }
    })
  } catch (error) {
    const statusCode = error?.statusCode || error?.status || error?.response?.status || error?.data?.statusCode
    const message = error?.data?.message || error?.data?.statusMessage || error?.message || 'No se pudo ejecutar el SQL.'
    errorMessage.value = statusCode ? `${message} (HTTP ${statusCode})` : message
  } finally {
    isRunning.value = false
  }
}

const formatErrorMeta = (error) => {
  if (!error) return ''
  const parts = []
  if (error.code) parts.push(error.code)
  if (error.httpStatus) parts.push(`HTTP ${error.httpStatus}`)
  if (error.targetAgent) parts.push(`agente ${error.targetAgent}`)
  if (error.sqlState) parts.push(`SQLSTATE ${error.sqlState}`)
  if (error.errno) parts.push(`errno ${error.errno}`)
  return parts.join(' · ')
}

const formatCell = (value) => {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const copySummary = async () => {
  if (!execution.value || typeof navigator === 'undefined') return
  const summary = [
    `SQL Console: ${execution.value.success ? 'success' : 'error'}`,
    `Executed: ${execution.value.executedStatements}/${execution.value.totalStatements}`,
    `Success: ${execution.value.successfulStatements}`,
    `Failed: ${execution.value.failedStatements}`,
    `Duration: ${execution.value.durationMs}ms`,
    `Target: ${execution.value.targetPlantel || execution.value.dataPlantel || execution.value.activePlantel}`
  ].join('\n')

  await navigator.clipboard?.writeText(summary)
}
</script>

<style scoped>
.sql-console-page {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  gap: 0.5rem;
  overflow: auto;
  padding-right: 2px;
  scrollbar-gutter: stable;
}

.sql-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 0.85rem;
  padding: 0.62rem 0.72rem;
  border: 1px solid rgba(200, 219, 204, 0.86);
  border-radius: 18px;
  background:
    radial-gradient(circle at 10% 0%, rgba(142, 193, 83, 0.16), transparent 18rem),
    linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(246, 253, 245, 0.92));
  box-shadow: 0 18px 45px rgba(31, 56, 43, 0.07);
}

.sql-hero h2 {
  margin: 0.12rem 0 0.22rem;
  color: #15223a;
  font-size: clamp(1.12rem, 1.8vw, 1.48rem);
  font-weight: 900;
  letter-spacing: -0.045em;
}

.sql-hero p {
  max-width: 760px;
  margin: 0;
  color: #667085;
  line-height: 1.25;
  font-size: 0.78rem;
}

.sql-hero code {
  padding: 0.08rem 0.35rem;
  border-radius: 999px;
  background: rgba(25, 118, 88, 0.08);
  color: #126146;
  font-weight: 800;
}

.eyebrow {
  color: #197658 !important;
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.target-card {
  display: flex;
  min-width: 180px;
  flex-direction: column;
  justify-content: center;
  gap: 0.22rem;
  padding: 0.5rem 0.58rem;
  border: 1px solid rgba(25, 118, 88, 0.14);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.76);
}

.target-card span,
.target-card small {
  color: #667085;
  font-size: 0.76rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.target-card strong {
  color: #15223a;
  font-size: 1rem;
  font-weight: 950;
}

.sql-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 238px;
  gap: 0.5rem;
  align-items: start;
}

.editor-panel,
.safety-panel,
.results-panel,
.access-denied {
  border: 1px solid rgba(221, 228, 224, 0.95);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 16px 38px rgba(31, 56, 43, 0.065);
}

.editor-panel {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 0.58rem;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.38rem;
}

.panel-head h3,
.safety-panel h3 {
  margin: 0;
  color: #15223a;
  font-size: 0.96rem;
  font-weight: 950;
}

.panel-head p,
.safety-panel p,
.safety-panel li {
  margin: 0.25rem 0 0;
  color: #667085;
  font-size: 0.78rem;
  line-height: 1.32;
}


.panel-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.target-card label {
  color: #667085;
  font-size: 0.68rem;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.target-card select {
  width: 100%;
  min-height: 34px;
  border: 1px solid rgba(25, 118, 88, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.94);
  color: #15223a;
  font-size: 0.9rem;
  font-weight: 950;
  padding: 0.25rem 0.45rem;
}

.upload-zone {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.42rem 0.55rem;
  border: 1.5px dashed rgba(25, 118, 88, 0.32);
  border-radius: 18px;
  background: rgba(245, 251, 244, 0.82);
  color: #197658;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.upload-zone input {
  display: none;
}

.upload-zone span {
  flex: 1;
  color: #15223a;
  font-size: 0.8rem;
  font-weight: 900;
}

.upload-zone small {
  color: #667085;
  font-size: 0.76rem;
  font-weight: 800;
}

.upload-zone-active {
  border-color: #197658;
  background: rgba(229, 247, 221, 0.92);
  transform: translateY(-1px);
}

.sql-textarea {
  width: 100%;
  height: clamp(176px, calc(100vh - 304px), 315px);
  min-height: 176px;
  margin-top: 0.42rem;
  padding: 0.58rem;
  border: 1px solid rgba(210, 218, 214, 0.92);
  border-radius: 18px;
  outline: none;
  background: #101828;
  color: #e6edf3;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8rem;
  line-height: 1.42;
  resize: none;
}

.sql-textarea:focus {
  border-color: rgba(25, 118, 88, 0.56);
  box-shadow: 0 0 0 4px rgba(25, 118, 88, 0.1);
}

.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.42rem;
  margin-top: 0.42rem;
}

.statement-chip,
.continue-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: #475467;
  font-size: 0.76rem;
  font-weight: 850;
}

.statement-chip {
  margin-right: auto;
  padding: 0.36rem 0.55rem;
  border-radius: 999px;
  background: rgba(245, 247, 250, 0.95);
}

.continue-toggle input {
  width: 1rem;
  height: 1rem;
  accent-color: #197658;
}

.run-button,
.ghost-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  border: 0;
  border-radius: 999px;
  font-size: 0.84rem;
  font-weight: 950;
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease;
}

.run-button {
  padding: 0.58rem 0.82rem;
  background: linear-gradient(135deg, #197658, #8ec153);
  color: #fff;
  box-shadow: 0 14px 26px rgba(25, 118, 88, 0.2);
}

.ghost-button {
  padding: 0.48rem 0.7rem;
  background: rgba(245, 247, 250, 0.95);
  color: #344054;
}

.run-button:hover:not(:disabled),
.ghost-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.run-button:disabled,
.ghost-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.spin {
  animation: spin 0.85s linear infinite;
}

.safety-panel {
  position: sticky;
  top: 0;
  padding: 0.62rem;
}

.safety-icon {
  display: grid;
  width: 30px;
  height: 30px;
  margin-bottom: 0.35rem;
  place-items: center;
  border-radius: 16px;
  background: rgba(25, 118, 88, 0.1);
  color: #197658;
}

.safety-panel ul {
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
  margin: 0.45rem 0 0;
  padding-left: 1.1rem;
}

.result-banner {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.62rem 0.72rem;
  border-radius: 20px;
  font-size: 0.88rem;
  font-weight: 850;
}

.result-banner-error {
  border: 1px solid rgba(220, 68, 68, 0.18);
  background: rgba(254, 242, 242, 0.95);
  color: #b42318;
}

.result-banner-compact {
  padding: 0.52rem 0.72rem;
}

.result-banner-compact div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.12rem;
}

.result-banner-compact strong,
.result-banner-compact small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-banner-compact small {
  color: #7a271a;
  font-size: 0.76rem;
}

.result-banner-running {
  border: 1px solid rgba(25, 118, 88, 0.18);
  background: rgba(240, 253, 244, 0.96);
  color: #126146;
}

.results-panel {
  min-height: 0;
  padding: 0.58rem;
}

.results-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
  padding: 0.58rem;
  border-radius: 18px;
}

.summary-success {
  background: rgba(236, 253, 243, 0.95);
  color: #027a48;
}

.summary-error {
  background: rgba(254, 242, 242, 0.95);
  color: #b42318;
}

.results-summary span,
.statement-card header span {
  display: block;
  font-size: 0.76rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.results-summary strong,
.statement-card header strong {
  display: block;
  margin-top: 0.18rem;
  font-size: 1rem;
  font-weight: 950;
}

.results-summary small,
.statement-card header small {
  display: block;
  margin-top: 0.15rem;
  color: currentColor;
  opacity: 0.72;
  font-size: 0.78rem;
  font-weight: 750;
}

.statement-results {
  display: flex;
  flex-direction: column;
  gap: 0.95rem;
}

.statement-card {
  overflow: hidden;
  border: 1px solid rgba(221, 228, 224, 0.95);
  border-radius: 18px;
  background: #fff;
}

.statement-card header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.62rem 0.72rem;
  border-bottom: 1px solid rgba(234, 239, 236, 0.95);
}

.statement-success header {
  color: #027a48;
}

.statement-error header {
  color: #b42318;
}

.statement-sql {
  max-height: 180px;
  margin: 0;
  padding: 1rem;
  overflow: auto;
  background: #f8fafc;
  color: #344054;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
  line-height: 1.55;
  white-space: pre-wrap;
}

.statement-error-box,
.table-meta,
.empty-result {
  margin: 1rem;
}

.statement-error-box {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.62rem;
  border-radius: 16px;
  background: rgba(254, 242, 242, 0.95);
  color: #b42318;
  font-size: 0.84rem;
}

.statement-error-box small {
  color: #7a271a;
  line-height: 1.35;
}

.table-meta,
.empty-result {
  color: #667085;
  font-size: 0.76rem;
  font-weight: 850;
}

.rows-table-wrap {
  max-height: 420px;
  margin: 0 1rem 1rem;
  overflow: auto;
  border: 1px solid rgba(234, 239, 236, 0.95);
  border-radius: 16px;
}

.rows-table-wrap table {
  min-width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.rows-table-wrap th,
.rows-table-wrap td {
  max-width: 360px;
  padding: 0.65rem 0.75rem;
  border-bottom: 1px solid rgba(234, 239, 236, 0.95);
  text-align: left;
  white-space: nowrap;
}

.rows-table-wrap th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f8fafc;
  color: #344054;
  font-weight: 950;
}

.rows-table-wrap td {
  color: #475467;
  overflow: hidden;
  text-overflow: ellipsis;
}

.write-result-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
  padding: 1rem;
}

.write-result-grid div {
  padding: 0.62rem;
  border-radius: 16px;
  background: #f8fafc;
}

.write-result-grid span {
  display: block;
  color: #667085;
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.write-result-grid strong {
  display: block;
  margin-top: 0.25rem;
  color: #15223a;
  font-size: 1.2rem;
  font-weight: 950;
}

.access-denied {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 1rem;
  color: #b42318;
}

.access-denied strong {
  color: #15223a;
}

.access-denied p {
  margin: 0.15rem 0 0;
  color: #667085;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1100px) {
  .sql-grid {
    grid-template-columns: 1fr;
  }

  .safety-panel {
    position: static;
  }
}

@media (max-width: 760px) {
  .sql-console-page {
    gap: 0.65rem;
  }

  .sql-textarea {
    height: 220px;
  }

  .sql-hero,
  .results-summary {
    flex-direction: column;
  }

  .panel-head {
    align-items: stretch;
  }

  .panel-actions {
    width: 100%;
  }

  .panel-actions .run-button {
    flex: 1;
  }

  .target-card {
    min-width: 0;
  }

  .write-result-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
