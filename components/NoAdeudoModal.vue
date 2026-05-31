<template>
  <Teleport to="body">
    <div class="no-adeudo-backdrop" role="dialog" aria-modal="true" aria-labelledby="no-adeudo-title" @click.self="!sending && $emit('close')">
      <section class="no-adeudo-modal">
        <header class="no-adeudo-header">
          <div>
            <small>Carta institucional</small>
            <h2 id="no-adeudo-title">Carta de No Adeudo</h2>
            <p>{{ students.length === 1 ? selectedTitle : `${students.length} alumnos seleccionados` }}</p>
          </div>
          <button type="button" class="no-adeudo-close" :disabled="sending" @click="$emit('close')">×</button>
        </header>

        <div v-if="loading" class="no-adeudo-loading">
          <span class="liquid-loader small" aria-hidden="true"><i></i><i></i><i></i></span>
          Preparando previsualización...
        </div>

        <template v-else>
          <aside v-if="loadError" class="no-adeudo-alert danger">{{ loadError }}</aside>

          <aside v-if="debtWarning" class="no-adeudo-alert warning">
            <strong>{{ debtWarning }}</strong>
            <span>El adeudo se muestra como advertencia administrativa. No aparece dentro de la carta.</span>
          </aside>

          <aside v-if="deudorCartaNotice" class="no-adeudo-alert info">
            <strong>{{ deudorCartaNotice }}</strong>
            <span>Control externo de cartas emitidas con advertencia de adeudo.</span>
          </aside>

          <div class="no-adeudo-body">
            <section class="no-adeudo-preview-card">
              <div class="no-adeudo-preview-toolbar">
                <div>
                  <span>Vista previa PDF</span>
                  <strong>{{ activePreviewName }}</strong>
                </div>
                <select v-if="previewStudents.length > 1" v-model="activeMatricula">
                  <option v-for="item in previewStudents" :key="item.matricula" :value="item.matricula">
                    {{ item.nombreCompleto || item.matricula }}
                  </option>
                </select>
              </div>
              <iframe v-if="activePreview?.pdfPreviewUrl" :src="activePreview.pdfPreviewUrl" title="Vista previa Carta de No Adeudo"></iframe>
              <div v-else class="no-adeudo-empty-preview">Sin vista previa disponible.</div>
            </section>

            <section class="no-adeudo-side-card">
              <label class="no-adeudo-field">
                <span>Modo de envío</span>
                <select v-model="sendMode">
                  <option value="parents_control">Padres + Control Escolar</option>
                  <option value="parents">Sólo padres</option>
                  <option value="control">Sólo Control Escolar</option>
                </select>
              </label>

              <div class="no-adeudo-recipients">
                <span>Destinatarios detectados</span>
                <div class="recipient-group">
                  <small>Padres</small>
                  <template v-if="activePreview?.recipients?.parents?.length">
                    <b v-for="email in activePreview.recipients.parents" :key="`parent-${email}`">{{ email }}</b>
                  </template>
                  <em v-else>Sin correos de padres.</em>
                </div>
                <div class="recipient-group">
                  <small>Control Escolar</small>
                  <template v-if="activePreview?.recipients?.control?.length">
                    <b v-for="email in activePreview.recipients.control" :key="`control-${email}`">{{ email }}</b>
                  </template>
                  <em v-else>Sin correo configurado para Control Escolar.</em>
                </div>
              </div>

              <details class="no-adeudo-email-preview" open>
                <summary>Previsualización del correo</summary>
                <div v-if="activePreview?.email?.html" class="email-frame" v-html="activePreview.email.html"></div>
              </details>

              <div v-if="result" class="no-adeudo-result" :class="result.failed ? 'has-failures' : 'is-ok'">
                <strong>{{ result.sent || 0 }} enviados · {{ result.failed || 0 }} fallidos</strong>
                <p v-for="item in result.results || []" :key="`result-${item.matricula}`">
                  {{ item.matricula }} — {{ item.success ? 'Enviado' : (item.message || 'Falló') }}
                </p>
              </div>
            </section>
          </div>
        </template>

        <footer class="no-adeudo-actions">
          <button type="button" class="no-adeudo-secondary" :disabled="sending" @click="$emit('close')">Cancelar</button>
          <button type="button" class="no-adeudo-primary" :disabled="loading || sending || Boolean(loadError) || !previewStudents.length" @click="sendLetters">
            <span v-if="sending" class="liquid-loader mini" aria-hidden="true"><i></i><i></i><i></i></span>
            {{ primaryButtonLabel }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { normalizeCicloKey } from '~/shared/utils/ciclo'
import { formatMoney, normalizeStudentMatricula } from '~/shared/utils/studentPresentation'

const props = defineProps({
  students: { type: Array, default: () => [] },
  ciclo: { type: [String, Number], default: '2025' }
})
const emit = defineEmits(['close', 'sent'])

const loading = ref(false)
const sending = ref(false)
const loadError = ref('')
const previewStudents = ref([])
const activeMatricula = ref('')
const sendMode = ref('parents_control')
const result = ref(null)

const cicloKey = computed(() => normalizeCicloKey(props.ciclo))
const matriculas = computed(() => props.students.map(student => normalizeStudentMatricula(student?.matricula)).filter(Boolean))
const selectedTitle = computed(() => props.students[0]?.nombreCompleto || props.students[0]?.matricula || 'Alumno')
const activePreview = computed(() => previewStudents.value.find(item => normalizeStudentMatricula(item.matricula) === normalizeStudentMatricula(activeMatricula.value)) || previewStudents.value[0] || null)
const activePreviewName = computed(() => activePreview.value?.nombreCompleto || activePreview.value?.matricula || 'Carta de No Adeudo')
const debtRows = computed(() => previewStudents.value.filter(item => Number(item?.debt?.total || 0) > 0))
const debtWarning = computed(() => {
  if (!debtRows.value.length) return ''
  if (debtRows.value.length === 1) return `El alumno aún tiene un adeudo de $${formatMoney(debtRows.value[0].debt.total)}.`
  const total = debtRows.value.reduce((sum, item) => sum + Number(item.debt?.total || 0), 0)
  return `${debtRows.value.length} alumnos aún tienen adeudo por $${formatMoney(total)} en total.`
})
const deudorCartaNotice = computed(() => {
  const marked = previewStudents.value.filter(item => item?.deudorCarta?.sent)
  if (!marked.length) return ''
  if (marked.length === 1) {
    const mark = marked[0].deudorCarta || {}
    const by = mark.sentByName || mark.sentByEmail || 'usuario no registrado'
    return `Ya existe una marca externa de carta emitida con adeudo${mark.sentAt ? ` el ${mark.sentAt}` : ''} por ${by}${mark.folio ? ` · folio ${mark.folio}` : ''}.`
  }
  return `${marked.length} alumnos ya tienen marca externa de carta emitida con adeudo.`
})
const primaryButtonLabel = computed(() => {
  if (sending.value) return 'Enviando...'
  return debtWarning.value ? 'Generar de todas maneras' : 'Generar y enviar'
})

const loadPreview = async () => {
  if (!matriculas.value.length) return
  loading.value = true
  loadError.value = ''
  result.value = null
  try {
    const response = await $fetch('/api/no-adeudo/preview', {
      method: 'POST',
      body: { matriculas: matriculas.value, ciclo: cicloKey.value }
    })
    previewStudents.value = Array.isArray(response?.students) ? response.students : []
    activeMatricula.value = previewStudents.value[0]?.matricula || ''
  } catch (error) {
    previewStudents.value = []
    loadError.value = error?.data?.message || error?.message || 'No se pudo preparar la carta.'
  } finally {
    loading.value = false
  }
}

const sendLetters = async () => {
  if (sending.value || !previewStudents.value.length) return
  sending.value = true
  result.value = null
  try {
    const response = await $fetch('/api/no-adeudo/send', {
      method: 'POST',
      body: {
        matriculas: previewStudents.value.map(item => item.matricula),
        ciclo: cicloKey.value,
        mode: sendMode.value,
        force: Boolean(debtWarning.value)
      }
    })
    result.value = response
    if (response?.sent) emit('sent', response)
  } catch (error) {
    result.value = {
      sent: 0,
      failed: previewStudents.value.length,
      results: [{ matricula: 'Lote', success: false, message: error?.data?.message || error?.message || 'No se pudo enviar.' }]
    }
  } finally {
    sending.value = false
  }
}

onMounted(loadPreview)
watch(() => `${matriculas.value.join('|')}|${cicloKey.value}`, loadPreview)
</script>

<style scoped>
.no-adeudo-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, .44);
  backdrop-filter: blur(10px);
}

.no-adeudo-modal {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(1180px, calc(100vw - 34px));
  height: min(820px, calc(100vh - 34px));
  overflow: hidden;
  border: 1px solid rgba(218, 226, 237, .96);
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 28px 72px rgba(15, 23, 42, .26);
  color: #15233c;
}

.no-adeudo-header,
.no-adeudo-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
  border-bottom: 1px solid #e5edf2;
  background: linear-gradient(180deg, #fff, #f8fbf8);
}

.no-adeudo-header small {
  color: #2f7d38;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.no-adeudo-header h2 {
  margin: 2px 0;
  font-size: 24px;
  font-weight: 900;
  letter-spacing: -.04em;
}

.no-adeudo-header p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.no-adeudo-close {
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 13px;
  background: #f4f7f6;
  color: #15233c;
  font-size: 24px;
  cursor: pointer;
}

.no-adeudo-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 300px;
  color: #64748b;
  font-weight: 800;
}

.no-adeudo-alert {
  margin: 14px 18px 0;
  border-radius: 16px;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.4;
}

.no-adeudo-alert strong,
.no-adeudo-alert span {
  display: block;
}

.no-adeudo-alert.warning {
  border: 1px solid #f0d29c;
  background: #fff7e8;
  color: #8a5a10;
}

.no-adeudo-alert.danger {
  border: 1px solid #fecaca;
  background: #fff1f2;
  color: #b42318;
}

.no-adeudo-alert.info {
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}

.no-adeudo-body {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(360px, .75fr);
  gap: 16px;
  min-height: 0;
  padding: 18px;
}

.no-adeudo-preview-card,
.no-adeudo-side-card {
  min-height: 0;
  overflow: hidden;
  border: 1px solid #dfe8df;
  border-radius: 18px;
  background: #fbfdfb;
}

.no-adeudo-preview-card {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.no-adeudo-preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid #dfe8df;
  background: #fff;
}

.no-adeudo-preview-toolbar span,
.no-adeudo-field span,
.no-adeudo-recipients > span {
  display: block;
  color: #64748b;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .05em;
  text-transform: uppercase;
}

.no-adeudo-preview-toolbar strong {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  font-weight: 850;
}

.no-adeudo-preview-card iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background: #f8fafc;
}

.no-adeudo-side-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: auto;
  padding: 14px;
  background: #fff;
}

.no-adeudo-field select,
.no-adeudo-preview-toolbar select {
  width: 100%;
  height: 38px;
  margin-top: 7px;
  border: 1px solid #d8e3dd;
  border-radius: 12px;
  background: #fff;
  padding: 0 11px;
  color: #15233c;
  font-size: 13px;
  font-weight: 780;
}

.recipient-group {
  margin-top: 10px;
  border: 1px solid #e5ece5;
  border-radius: 14px;
  padding: 10px;
  background: #f8fbf8;
}

.recipient-group small {
  display: block;
  margin-bottom: 7px;
  color: #2f7d38;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
}

.recipient-group b,
.recipient-group em {
  display: inline-flex;
  margin: 3px 5px 3px 0;
  border-radius: 999px;
  background: #fff;
  padding: 6px 9px;
  color: #334155;
  font-size: 12px;
  font-weight: 750;
}

.recipient-group em {
  color: #94a3b8;
  font-style: normal;
}

.no-adeudo-email-preview {
  border: 1px solid #e5ece5;
  border-radius: 14px;
  padding: 10px;
}

.no-adeudo-email-preview summary {
  cursor: pointer;
  color: #2f7d38;
  font-size: 12px;
  font-weight: 850;
}

.email-frame {
  margin-top: 10px;
  max-height: 260px;
  overflow: auto;
  border-radius: 12px;
  background: #fff;
  padding: 8px;
}

.no-adeudo-result {
  border-radius: 14px;
  padding: 12px;
  font-size: 12px;
}

.no-adeudo-result.is-ok { background: #edf8ee; color: #2f7d38; }
.no-adeudo-result.has-failures { background: #fff1f2; color: #b42318; }
.no-adeudo-result p { margin: 5px 0 0; }

.no-adeudo-actions {
  border-top: 1px solid #e5edf2;
  border-bottom: 0;
}

.no-adeudo-secondary,
.no-adeudo-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  height: 42px;
  border-radius: 13px;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 850;
  cursor: pointer;
}

.no-adeudo-secondary {
  border: 1px solid #dfe8df;
  background: #fff;
  color: #64748b;
}

.no-adeudo-primary {
  border: 0;
  background: linear-gradient(180deg, #58a94b, #328632);
  color: #fff;
  box-shadow: 0 10px 18px rgba(63, 145, 56, .22);
}

.no-adeudo-primary:disabled,
.no-adeudo-secondary:disabled {
  cursor: not-allowed;
  opacity: .55;
}

.no-adeudo-empty-preview {
  display: grid;
  place-items: center;
  min-height: 100%;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 800;
}

@media (max-width: 900px) {
  .no-adeudo-body { grid-template-columns: 1fr; overflow: auto; }
  .no-adeudo-preview-card { min-height: 540px; }
}
</style>
