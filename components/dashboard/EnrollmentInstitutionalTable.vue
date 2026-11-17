<template>
  <section class="enrollment-dashboard" aria-labelledby="enrollment-title">
    <header class="enrollment-heading">
      <div>
        <span class="enrollment-eyebrow">Control Escolar · Institucional</span>
        <h1 id="enrollment-title">Inscritos por plantel</h1>
        <p>Todos los planteles, un mismo ciclo escolar.</p>
      </div>
      <div class="enrollment-actions">
        <label class="cycle-field">
          <span>Ciclo escolar</span>
          <select :value="activeCicloKey" aria-label="Ciclo escolar del resumen institucional" @change="onCycleChange">
            <option v-for="option in cycleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
        <button type="button" class="reload-button" :disabled="loading" @click="load()">
          <LucideRefreshCw :size="17" :class="{ spinning: loading }" />
          Actualizar
        </button>
      </div>
    </header>

    <div class="enrollment-table-card">
      <div class="enrollment-table-intro">
        <div>
          <strong>{{ visibleReport?.cicloLabel || formatCicloLabel(activeCicloKey) }}</strong>
          <span v-if="visibleReport">{{ visibleReport.coverage.available }} de {{ visibleReport.coverage.total }} planteles con datos</span>
          <span v-else>Resumen de inscripción</span>
        </div>
        <div class="enrollment-table-meta">
          <span v-if="visibleReport?.coverage.backups.length" class="origin-note">{{ visibleReport.coverage.backups.length }} con respaldo</span>
          <time v-if="visibleReport" :datetime="visibleReport.generatedAt">Actualizado {{ formattedDate(visibleReport.generatedAt) }}</time>
        </div>
      </div>

      <p v-if="visibleReport && !visibleReport.coverage.complete" class="coverage-warning" role="status">
        <LucideAlertCircle :size="17" />
        <span><strong>Total parcial:</strong> {{ visibleReport.coverage.unavailable.join(', ') }} sin datos disponibles. Estos planteles no están incluidos en la suma.</span>
      </p>
      <p v-if="errorMessage" class="enrollment-error" role="alert"><LucideAlertCircle :size="17" /> {{ errorMessage }}</p>

      <div class="enrollment-table-scroll" tabindex="0" aria-label="Tabla de inscripción por plantel, deslizable horizontalmente">
        <table class="enrollment-table">
          <caption>Inscritos, internos, externos, no inscritos, bajas y registros por plantel y ciclo escolar. Desglose opcional por grado.</caption>
          <thead>
            <tr>
              <th scope="col">Plantel</th>
              <th scope="col" class="numeric primary-col">Inscritos</th>
              <th scope="col" class="numeric">Internos</th>
              <th scope="col" class="numeric">Externos</th>
              <th scope="col" class="numeric">No inscritos</th>
              <th scope="col" class="numeric">Bajas</th>
              <th scope="col" class="numeric">Registros</th>
              <th scope="col">Origen</th>
            </tr>
          </thead>
          <tbody v-if="visibleReport">
            <template v-for="row in visibleReport.rows" :key="row.plantel">
              <tr :class="{ 'expanded-row': expanded.has(row.plantel), 'unavailable-row': row.source === 'unavailable' }">
                <th scope="row">
                  <button v-if="row.grados.length" type="button" class="campus-toggle" :aria-expanded="expanded.has(row.plantel)" :aria-label="(expanded.has(row.plantel) ? 'Ocultar' : 'Ver') + ' grados de ' + row.plantel" @click="toggleGrade(row.plantel)">
                    <LucideChevronRight :size="15" :class="{ rotated: expanded.has(row.plantel) }" />
                    <strong>{{ row.plantel }}</strong>
                  </button>
                  <span v-else class="campus-without-grades"><span class="chevron-placeholder"></span><strong>{{ row.plantel }}</strong></span>
                </th>
                <td class="numeric primary-value">{{ count(row.inscritos) }}</td>
                <td class="numeric">{{ count(row.internos) }}</td>
                <td class="numeric">{{ count(row.externos) }}</td>
                <td class="numeric muted-count">{{ count(row.noInscritos) }}</td>
                <td class="numeric muted-count">{{ count(row.bajas) }}</td>
                <td class="numeric muted-count">{{ count(row.registros) }}</td>
                <td>
                  <span class="source-pill" :class="'source-' + row.source"><i></i>{{ sourceLabel(row.source) }}</span>
                  <small v-if="row.snapshotAt" class="backup-time">{{ formattedDate(row.snapshotAt) }}</small>
                </td>
              </tr>
              <tr v-for="grade in expanded.has(row.plantel) ? row.grados : []" :key="row.plantel + ':' + grade.key" class="grade-row">
                <th scope="row"><span>{{ grade.nivel ? grade.nivel + ' · ' : '' }}{{ grade.grado }}</span></th>
                <td class="numeric primary-value">{{ count(grade.inscritos) }}</td>
                <td class="numeric">{{ count(grade.internos) }}</td>
                <td class="numeric">{{ count(grade.externos) }}</td>
                <td class="numeric">{{ count(grade.noInscritos) }}</td>
                <td class="numeric">{{ count(grade.bajas) }}</td>
                <td class="numeric">{{ count(grade.registros) }}</td>
                <td class="grade-source">Desglose por grado</td>
              </tr>
            </template>
          </tbody>
          <tbody v-else-if="loading">
            <tr v-for="index in 6" :key="index" class="skeleton-row"><td colspan="8"><span></span></td></tr>
          </tbody>
          <tbody v-else>
            <tr><td colspan="8" class="empty-cell">No se pudieron consultar los datos institucionales.</td></tr>
          </tbody>
          <tfoot v-if="visibleReport">
            <tr>
              <th scope="row">{{ visibleReport.total.partial ? 'Subtotal disponible' : 'Total general' }}</th>
              <td class="numeric primary-value">{{ count(visibleReport.total.inscritos) }}</td>
              <td class="numeric">{{ count(visibleReport.total.internos) }}</td>
              <td class="numeric">{{ count(visibleReport.total.externos) }}</td>
              <td class="numeric">{{ count(visibleReport.total.noInscritos) }}</td>
              <td class="numeric">{{ count(visibleReport.total.bajas) }}</td>
              <td class="numeric">{{ count(visibleReport.total.registros) }}</td>
              <td class="total-coverage">{{ visibleReport.coverage.available }}/{{ visibleReport.coverage.total }} planteles</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <footer class="table-footnote">Selecciona un plantel para consultar sus grados. Los registros no disponibles se muestran como «—», nunca como cero.</footer>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { LucideAlertCircle, LucideChevronRight, LucideRefreshCw } from 'lucide-vue-next'
import { useActiveCiclo } from '~/composables/useActiveCiclo'
import { formatCicloLabel } from '~/shared/utils/ciclo'

type Counts = { inscritos: number | null; internos: number | null; externos: number | null; noInscritos: number | null; bajas: number | null; registros: number | null }
type GradeRow = Counts & { key: string; grado: string; nivel: string }
type CampusRow = Counts & { plantel: string; source: 'live' | 'backup' | 'backup-stale' | 'unavailable'; snapshotAt: string | null; grados: GradeRow[] }
type Summary = { ciclo: string; cicloLabel: string; generatedAt: string; rows: CampusRow[]; total: Counts & { partial: boolean }; coverage: { available: number; total: number; unavailable: string[]; backups: string[]; complete: boolean } }

const { activeCicloKey, cycleOptions, setActiveCiclo } = useActiveCiclo()
const summary = ref<Summary | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const expanded = ref(new Set<string>())
const visibleReport = computed(() => summary.value?.ciclo === activeCicloKey.value ? summary.value : null)
const countFormat = new Intl.NumberFormat('es-MX')
const count = (value: number | null) => value === null || value === undefined ? '—' : countFormat.format(value)
const sourceLabel = (source: CampusRow['source']) => ({ live: 'En vivo', backup: 'Respaldo', 'backup-stale': 'Respaldo anterior', unavailable: 'Sin conexión' })[source]
const formattedDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
}
const onCycleChange = (event: Event) => setActiveCiclo((event.target as HTMLSelectElement).value)
const toggleGrade = (plantel: string) => {
  const next = new Set(expanded.value)
  if (next.has(plantel)) next.delete(plantel)
  else next.add(plantel)
  expanded.value = next
}
let controller: AbortController | null = null
let requestSequence = 0
const load = async () => {
  controller?.abort()
  const sequence = ++requestSequence
  const nextController = new AbortController()
  controller = nextController
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await $fetch<Summary>('/api/dashboard/enrollment-summary', {
      query: { ciclo: activeCicloKey.value }, signal: nextController.signal, retry: 0,
    })
    if (sequence !== requestSequence) return
    summary.value = result
    expanded.value = new Set()
  } catch (error: any) {
    if (sequence !== requestSequence || nextController.signal.aborted) return
    console.error('[Dashboard Enrollment] No se pudo cargar resumen', error)
    errorMessage.value = String(error?.data?.message || error?.message || 'No se pudo consultar Control Escolar.')
  } finally {
    if (sequence === requestSequence) { loading.value = false; controller = null }
  }
}
watch(activeCicloKey, () => { void load() })
onMounted(() => { void load() })
onBeforeUnmount(() => { controller?.abort(); requestSequence++ })
</script>

<style scoped>
.enrollment-dashboard{display:grid;gap:16px;min-width:0;color:#243545}
.enrollment-heading{display:flex;align-items:end;justify-content:space-between;gap:18px;flex-wrap:wrap;padding:13px 8px 2px}
.enrollment-heading>div:first-child{display:grid;gap:5px}
.enrollment-eyebrow{color:#41885d;text-transform:uppercase;letter-spacing:.12em;font-size:.68rem;font-weight:900}
.enrollment-heading h1{font-size:clamp(1.5rem,2.6vw,2.2rem);font-weight:850;letter-spacing:-.045em;margin:0;color:#21442d}
.enrollment-heading p{margin:0;color:#7b8b83;font-size:.84rem}
.enrollment-actions{display:flex;align-items:end;flex-wrap:wrap;gap:10px}
.cycle-field{display:grid;gap:6px;color:#6b8072;font-weight:800;font-size:.68rem}
.cycle-field select{min-width:164px;border:1px solid #dce9df;border-radius:12px;padding:10px 13px;background:#fff;color:#284934;font:inherit;font-size:.85rem;font-weight:800;outline-color:#3a9560}
.reload-button{display:flex;align-items:center;justify-content:center;gap:8px;padding:0 15px;height:41px;border:1px solid #dce9df;border-radius:12px;background:#fff;color:#39704e;font-size:.8rem;font-weight:850;cursor:pointer}
.reload-button:hover:not(:disabled){background:#f2faf4}.reload-button:disabled{opacity:.48;cursor:default}
.enrollment-table-card{min-width:0;overflow:hidden;border:1px solid #e3ece6;border-radius:23px;background:#fff;box-shadow:0 14px 36px rgba(28,64,37,.045)}
.enrollment-table-intro{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;padding:19px 22px;border-bottom:1px solid #eff3f0;background:linear-gradient(120deg,#f8fbf8,#fff)}
.enrollment-table-intro>div:first-child{display:grid;gap:3px}.enrollment-table-intro strong{font-size:1rem;color:#244933}.enrollment-table-intro span{font-size:.74rem;color:#7d9284}
.enrollment-table-meta{display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:.72rem;color:#86958a}
.enrollment-table-meta .origin-note{color:#896329;background:#fff8e8;padding:5px 9px;border-radius:8px}
.coverage-warning,.enrollment-error{display:flex;align-items:flex-start;gap:9px;margin:0;padding:12px 20px;font-size:.77rem;line-height:1.5}
.coverage-warning{color:#815b22;background:#fffaf0;border-bottom:1px solid #f5ead4}.enrollment-error{color:#a33531;background:#fff2f1;border-bottom:1px solid #fae0dd}
.coverage-warning svg,.enrollment-error svg{flex-shrink:0;margin-top:1px}
.enrollment-table-scroll{max-width:100%;overflow-x:auto;outline-offset:-3px}
.enrollment-table{width:100%;min-width:850px;border-collapse:separate;border-spacing:0;text-align:left;font-size:.79rem;font-variant-numeric:tabular-nums}
.enrollment-table caption{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.enrollment-table th,.enrollment-table td{padding:13px 15px;border-bottom:1px solid #f0f3f0;vertical-align:middle}
.enrollment-table thead th{color:#75877b;background:#f9fbf9;text-transform:uppercase;font-size:.64rem;letter-spacing:.04em;font-weight:850;white-space:nowrap}
.enrollment-table th:first-child{width:20%;min-width:160px;position:sticky;left:0;background:#fff;z-index:1}
.enrollment-table thead th:first-child{background:#f9fbf9;z-index:2}
.enrollment-table tbody tr:hover:not(.grade-row) td,.enrollment-table tbody tr:hover:not(.grade-row) th{background:#f8fcf8}
.enrollment-table .numeric{text-align:right;white-space:nowrap}.enrollment-table .primary-col{color:#3d8052}.enrollment-table .primary-value{color:#205e3a;font-weight:900;font-size:.92rem}
.enrollment-table .muted-count{color:#667d70}
.campus-toggle{display:inline-flex;align-items:center;gap:8px;min-height:28px;border:0;padding:0;background:transparent;color:#294936;cursor:pointer;font:inherit}
.campus-toggle svg{color:#849b89;transition:transform .18s}.campus-toggle .rotated{transform:rotate(90deg)}
.campus-toggle strong,.campus-without-grades strong{font-weight:900;font-size:.85rem}
.campus-without-grades{display:inline-flex;align-items:center;gap:8px;color:#294936}.chevron-placeholder{display:inline-block;width:15px}
.source-pill{display:inline-flex;align-items:center;gap:6px;border-radius:99px;background:#eff7ef;color:#3e8053;padding:5px 9px;font-size:.68rem;font-weight:800;white-space:nowrap}
.source-pill i{width:6px;height:6px;border-radius:100%;background:#5da66b}.source-backup,.source-backup-stale{color:#9b7530;background:#fff8e8}.source-backup i,.source-backup-stale i{background:#c7a353}.source-unavailable{color:#965858;background:#fff2f0}.source-unavailable i{background:#cb7777}
.backup-time{display:block;font-size:.63rem;color:#997d49;margin-top:4px;padding-left:8px}
.grade-row td,.grade-row th{background:#f7faf8!important;padding-top:10px;padding-bottom:10px;color:#667e6f;font-size:.75rem}
.grade-row th span{padding-left:26px;font-weight:680}.grade-row .grade-source{color:#9aaa9b;font-size:.68rem}
.enrollment-table tbody .expanded-row th,.enrollment-table tbody .expanded-row td{background:#f2f9f3!important}
.enrollment-table tbody .unavailable-row td{color:#a0aaa4}
.enrollment-table tfoot th,.enrollment-table tfoot td{border-bottom:0;border-top:2px solid #dcebdc;background:#edf7ef!important;font-size:.85rem;font-weight:900;color:#294a34}
.enrollment-table tfoot th:first-child{background:#edf7ef!important}
.total-coverage{font-size:.7rem!important;color:#6d937a!important;white-space:nowrap}
.empty-cell{text-align:center;padding:60px!important;color:#93a197}
.skeleton-row span{display:block;height:14px;border-radius:10px;background:linear-gradient(90deg,#eef4ee,#f7faf7,#eef4ee);animation:skeleton 1.25s linear infinite}
.skeleton-row td{padding:21px 24px}
.table-footnote{padding:13px 22px;color:#91a095;font-size:.68rem;border-top:1px solid #f2f5f3}
.spinning{animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@keyframes skeleton{50%{opacity:.48}}
@media(max-width:760px){.enrollment-heading{padding:4px 3px}.enrollment-actions{width:100%}.cycle-field{flex:1}.cycle-field select{width:100%}.enrollment-table-intro{padding:15px}.enrollment-table th,.enrollment-table td{padding:12px 10px}.enrollment-table th:first-child{min-width:130px}.table-footnote{padding:12px 15px}}
@media(prefers-reduced-motion:reduce){.spinning,.skeleton-row span{animation:none}.campus-toggle svg{transition:none}}
</style>
