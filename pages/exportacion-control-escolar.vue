<template>
  <main class="institutional-export">
    <header class="institutional-export__header">
      <div class="institutional-export__icon"><LucideFileSpreadsheet :size="26" /></div>
      <div class="institutional-export__heading">
        <p>Control Escolar · Superadministración</p>
        <h1>Exportación institucional</h1>
        <span>Un solo Excel con todos los planteles.</span>
      </div>
      <span class="institutional-export__count"><LucideBuilding2 :size="15" /> {{ PLANTELES_LIST.length }} planteles</span>
    </header>

    <div class="institutional-export__content">
      <section class="institutional-export__card">
        <header><span class="institutional-export__number">01</span><div><h2>Alcance</h2><p>Datos calculados con los criterios de Control Escolar.</p></div></header>
        <div class="institutional-export__filters">
          <label>Ciclo escolar
            <select :value="activeCicloKey" :disabled="downloading" @change="onCicloChange">
              <option v-for="option in cycleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label>Estado
            <select v-model="status" :disabled="downloading">
              <option value="inscritos">Inscritos</option>
              <option value="all">Toda la población</option>
              <option value="internos">Internos</option>
              <option value="externos">Externos</option>
              <option value="no_inscritos">No inscritos</option>
              <option value="bajas">Bajas</option>
            </select>
          </label>
        </div>
        <div class="institutional-export__planteles">
          <span v-for="plantel in PLANTELES_LIST" :key="plantel">{{ plantel }}</span>
        </div>
      </section>

      <section class="institutional-export__card">
        <header><span class="institutional-export__number">02</span><div><h2>Columnas</h2><p>{{ selectedFields.length }} campos seleccionados; Plantel siempre incluido.</p></div></header>
        <div class="institutional-export__field-list">
          <span v-for="field in displayedFields" :key="field.key">{{ field.label }}</span>
        </div>
        <button type="button" class="institutional-export__customize" :disabled="downloading" @click="showReportModal = true">
          <LucideSlidersHorizontal :size="16" /> Personalizar columnas <LucideChevronRight :size="15" />
        </button>
      </section>

      <section class="institutional-export__download">
        <div>
          <strong><LucideFileSpreadsheet :size="20" /> Reporte consolidado · .xlsx</strong>
          <p>Resumen institucional, hoja general y una pestaña por plantel.</p>
          <p v-if="containsSensitive" class="institutional-export__private"><LucideLockKeyhole :size="14" /> Contiene credenciales Husky Pass. Archivo confidencial.</p>
        </div>
        <button type="button" :disabled="downloading" @click="downloadReport()">
          <LucideLoaderCircle v-if="downloading" :size="17" class="institutional-export__spin" />
          <LucideDownload v-else :size="17" />
          {{ downloading ? 'Preparando Excel…' : 'Descargar Excel' }}
        </button>
      </section>
      <p v-if="downloadNotice" class="institutional-export__notice" role="status"><LucideAlertCircle :size="17" /> {{ downloadNotice }}</p>
      <p v-if="downloadError" class="institutional-export__error" role="alert"><LucideAlertCircle :size="17" /> {{ downloadError }}</p>
    </div>

    <ControlEscolarReportModal
      :show="showReportModal"
      plantel="Todos los planteles"
      :ciclo-label="formatCicloLabel(activeCicloKey)"
      :required-fields="['plantel']"
      @close="showReportModal = false"
      @confirm="confirmFields"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { LucideAlertCircle, LucideBuilding2, LucideChevronRight, LucideDownload, LucideFileSpreadsheet, LucideLoaderCircle, LucideLockKeyhole, LucideSlidersHorizontal } from 'lucide-vue-next'
import ControlEscolarReportModal from '~/components/students/ControlEscolarReportModal.vue'
import { CONTROL_ESCOLAR_REPORT_DEFAULT_FIELDS, CONTROL_ESCOLAR_REPORT_FIELDS } from '~/shared/constants/controlEscolarReport'
import { formatCicloLabel } from '~/shared/utils/ciclo'
import { PLANTELES_LIST } from '~/utils/constants'
import { useActiveCiclo } from '~/composables/useActiveCiclo'

definePageMeta({ layout: 'default' })
useHead({ title: 'Exportación institucional · Aurora' })

const { activeCicloKey, cycleOptions, setActiveCiclo } = useActiveCiclo()
const status = ref('inscritos')
const selectedFields = ref(Array.from(new Set([...CONTROL_ESCOLAR_REPORT_DEFAULT_FIELDS, 'plantel'])))
const showReportModal = ref(false)
const downloading = ref(false)
const downloadError = ref('')
const downloadNotice = ref('')
const displayedFields = computed(() => CONTROL_ESCOLAR_REPORT_FIELDS.filter((field) => selectedFields.value.includes(field.key)))
const containsSensitive = computed(() => displayedFields.value.some((field) => field.sensitive))
const onCicloChange = (event: Event) => setActiveCiclo((event.target as HTMLSelectElement).value)
let currentDownload: AbortController | null = null

const confirmFields = (fields: string[]) => {
  selectedFields.value = Array.from(new Set([...fields, 'plantel']))
  showReportModal.value = false
  void downloadReport()
}

const downloadReport = async () => {
  if (downloading.value || !selectedFields.value.length) return
  downloading.value = true
  downloadError.value = ''
  downloadNotice.value = ''
  const controller = new AbortController()
  currentDownload = controller
  try {
    const params = new URLSearchParams({ ciclo: activeCicloKey.value, status: status.value, fields: selectedFields.value.join(',') })
    const response = await fetch('/api/control-escolar/export-institucional?' + params.toString(), {
      credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
    })
    if (!response.ok) {
      const error = await response.json().catch(() => null)
      throw new Error(String(error?.data?.message || error?.message || error?.statusMessage || 'No se pudo generar el archivo.'))
    }
    const missing = (response.headers.get('X-Institutional-Export-Unavailable') || '')
      .split(',').map((name) => name.trim()).filter(Boolean)
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'control-escolar-institucional.xlsx'
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    if (missing.length) {
      downloadNotice.value = 'Descarga parcial: ' + missing.join(', ') +
        ' sin datos disponibles. El Excel los identifica en Resumen; sus cifras no se suman.'
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (error: any) {
    if (error?.name !== 'AbortError') downloadError.value = String(error?.message || 'No se pudo completar la exportación.')
  } finally {
    if (currentDownload === controller) currentDownload = null
    downloading.value = false
  }
}
onBeforeUnmount(() => currentDownload?.abort())
</script>

<style scoped>
.institutional-export{width:min(1080px,100%);margin:auto;padding:clamp(20px,4vw,50px);color:#203047}
.institutional-export__header{display:flex;align-items:center;flex-wrap:wrap;gap:15px;margin-bottom:28px}
.institutional-export__icon{width:52px;height:52px;display:grid;place-items:center;border-radius:16px;background:#eaf4ec;color:#276a34}
.institutional-export__heading{flex:1;min-width:200px}
.institutional-export__heading p{margin:0 0 4px;color:#448052;font-size:11px;letter-spacing:.07em;text-transform:uppercase;font-weight:800}
.institutional-export h1{margin:0;color:#173d24;font-size:clamp(23px,3vw,32px);line-height:1.2;letter-spacing:-.03em}
.institutional-export__heading span{display:block;margin-top:6px;color:#7a8980;font-size:13px}
.institutional-export__count{display:flex;align-items:center;gap:7px;padding:9px 12px;border:1px solid #e2ebe4;border-radius:24px;font-size:12px;font-weight:760;color:#486451}
.institutional-export__content{display:grid;gap:16px}
.institutional-export__card{border:1px solid #e0e9e2;border-radius:19px;background:#fff;padding:clamp(18px,3vw,27px);box-shadow:0 4px 24px rgba(23,61,36,.035)}
.institutional-export__card header{display:flex;align-items:flex-start;gap:12px;margin-bottom:19px}
.institutional-export__number{display:grid;place-items:center;flex-shrink:0;width:29px;height:29px;background:#eef6f0;border-radius:9px;font-size:11px;color:#397345;font-weight:850}
.institutional-export h2{margin:0;color:#28432e;font-size:17px}
.institutional-export__card p,.institutional-export__download p{margin:5px 0 0;color:#77877c;font-size:12px}
.institutional-export__filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.institutional-export__filters label{display:grid;gap:8px;color:#556c5b;font-size:12px;font-weight:760}
.institutional-export__filters select{width:100%;min-width:0;border:1px solid #dbe7de;border-radius:11px;background:#fafcfb;color:#2b4531;padding:11px 13px;font:inherit;font-size:14px;outline-color:#00692f}
.institutional-export__planteles,.institutional-export__field-list{display:flex;flex-wrap:wrap;gap:7px}
.institutional-export__planteles{margin-top:19px}
.institutional-export__planteles span{padding:5px 8px;background:#f5f8f5;border-radius:7px;font-size:10px;font-weight:750;color:#7c8d80}
.institutional-export__field-list{margin-bottom:18px}
.institutional-export__field-list span{padding:7px 10px;background:#fafcfb;border:1px solid #e2ebe5;border-radius:8px;font-size:11px;font-weight:670;color:#627568}
.institutional-export button{cursor:pointer;font-family:inherit}
.institutional-export button:disabled{opacity:.62;cursor:progress}
.institutional-export__customize{display:flex;align-items:center;gap:9px;border:1px solid #c6ddcc;border-radius:10px;background:white;color:#2b7039;padding:10px 13px;font-size:12px;font-weight:790}
.institutional-export__customize:hover:not(:disabled){background:#f0f7f1}
.institutional-export__download{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:17px;padding:23px 25px;background:linear-gradient(125deg,#f6faf6,#eaf3eb);border:1px solid #c9ddcd;border-radius:19px}
.institutional-export__download strong{display:flex;align-items:center;gap:8px;color:#285a33;font-size:15px}
.institutional-export__private{display:flex;align-items:center;gap:6px;color:#996b32!important}
.institutional-export__download button{display:flex;align-items:center;justify-content:center;gap:10px;min-height:44px;padding:0 20px;border:1px solid #00692f;border-radius:11px;background:#00692f;color:white;font-size:13px;font-weight:800}
.institutional-export__download button:hover:not(:disabled){background:#075b2b}
.institutional-export__error{display:flex;gap:9px;margin:0;padding:13px 16px;border-radius:11px;background:#fff4f1;color:#9c3529;font-size:13px}
.institutional-export__notice{display:flex;align-items:flex-start;gap:9px;margin:0;padding:13px 16px;border-radius:11px;background:#fff8e9;color:#855b14;font-size:13px}
.institutional-export__spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:650px){.institutional-export{padding:20px 14px}.institutional-export__filters{grid-template-columns:1fr}.institutional-export__download button{width:100%}}
</style>
