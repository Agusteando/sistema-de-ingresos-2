<template>
  <main class="public-report">
    <header class="public-header">
      <img src="/brand/institutional-emblem.webp" alt="IECS IEDIS" />
      <div class="public-brand"><strong>IECS · IEDIS</strong><span>Aurora · Reporte institucional</span></div>
    </header>
    <div class="public-content">
      <div class="public-kicker">REPORTE COMPARTIDO</div>
      <h1>{{ reportTitle }}</h1>
      <p class="public-description">{{ modeTitle }} <span v-if="data"> · Ciclo {{ data.ciclo }}</span></p>
      <div v-if="loading" class="public-state">Consultando planteles…</div>
      <div v-else-if="error" class="public-state public-error">
        <strong>No se pudo cargar el reporte</strong>
        <span>{{ error }}</span>
        <button type="button" @click="load">Reintentar</button>
      </div>
      <template v-else-if="data">
        <div v-if="data.cobertura?.parcial" class="public-coverage" role="status">
          <div class="public-coverage-copy">
            <LucideAlertTriangle :size="19" aria-hidden="true" />
            <div>
              <strong>Consulta parcial · {{ data.cobertura.disponibles }} de {{ data.cobertura.solicitados }} planteles</strong>
              <p>Sin datos de {{ data.cobertura.noDisponibles.join(', ') }}. Los totales y el Excel solo incluyen los planteles consultados.</p>
            </div>
          </div>
          <button type="button" :disabled="loading" @click="load">Actualizar</button>
        </div>
        <div class="public-topline">
          <div class="public-stat"><span>{{ data.cobertura?.parcial ? 'Subtotal disponible' : 'Alumnos' }}</span><strong>{{ data.resumen.alumnos.toLocaleString('es-MX') }}</strong></div>
          <div class="public-stat"><span>Planteles consultados</span><strong>{{ data.cobertura?.disponibles ?? data.resumen.planteles.length }} / {{ data.cobertura?.solicitados ?? data.resumen.planteles.length }}</strong></div>
          <div v-if="data.modo === 'movements'" class="public-stat"><span>Movimientos</span><strong>{{ data.resumen.movimientos.toLocaleString('es-MX') }}</strong></div>
          <div v-else-if="data.modo === 'missing'" class="public-stat"><span>Inscritos revisados</span><strong>{{ data.resumen.inscritos.toLocaleString('es-MX') }}</strong></div>
        </div>
        <div class="public-block">
          <h2>Por plantel</h2>
          <div class="public-table-scroll"><table><thead><tr><th>Plantel</th><th>Alumnos</th><th>Estado</th></tr></thead><tbody>
            <tr v-for="campus in data.resumen.planteles" :key="campus.plantel"><td>{{ campus.plantel }}</td><td class="numeric">{{ campus.alumnos === null ? '—' : campus.alumnos }}</td><td :class="{ 'public-campus-unavailable': campus.estado === 'unavailable' }">{{ campus.estado === 'unavailable' ? 'No disponible' : 'Consultado' }}</td></tr>
          </tbody></table></div>
        </div>
        <div class="public-block">
          <div class="public-list-title">
            <h2>Alumnos <span>{{ filtered.length }}</span></h2>
            <div class="public-actions">
              <input v-model="search" type="search" aria-label="Buscar alumno o matrícula" placeholder="Buscar alumno o matrícula" />
              <a :href="excelUrl" class="public-excel"><LucideDownload :size="16" /> Excel</a>
            </div>
          </div>
          <div class="public-table-scroll"><table><thead><tr><th>Matrícula</th><th>Alumno</th><th>Nivel</th><th>Grado</th><th>Grupo</th><th>Sección</th><th>Plantel</th></tr></thead><tbody>
            <tr v-for="student in filtered" :key="student.plantel + student.matricula">
              <td class="mono">{{ student.matricula }}</td><td class="student">{{ student.nombreCompleto }}</td>
              <td>{{ student.nivel || '—' }}</td><td>{{ student.grado || '—' }}</td>
              <td>{{ student.grupo || '—' }}</td><td>{{ student.seccion || '—' }}</td><td>{{ student.plantel }}</td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="7" class="public-empty">Sin alumnos para esta búsqueda.</td></tr>
          </tbody></table></div>
        </div>
        <footer>Consulta generada {{ generatedAt }} · Datos sujetos a cambios en los registros institucionales.</footer>
      </template>
    </div>
  </main>
</template>

<script setup lang="ts">
import { Download as LucideDownload, AlertTriangle as LucideAlertTriangle } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
definePageMeta({ layout: false })
useHead({ title: 'Reporte institucional · IECS IEDIS', meta:[{name:'robots',content:'noindex,nofollow,noarchive'},{name:'referrer',content:'no-referrer'}] })
const route = useRoute()
const token = String(route.params.token || '')
const data = ref<any>(null)
const loading = ref(true)
const error = ref('')
const search = ref('')
const excelUrl = '/api/public/concept-report/' + encodeURIComponent(token) + '/excel'
const modeTitle = computed(() => ({movements:'Con concepto',missing:'Sin concepto',debtors:'Deudores'} as Record<string,string>)[data.value?.modo] || 'Por concepto')
const reportTitle = computed(() => data.value?.conceptos?.join(', ') || 'Resumen por concepto')
const generatedAt = computed(() => data.value?.generatedAt ? new Date(data.value.generatedAt).toLocaleString('es-MX',{timeZone:'America/Mexico_City'}) : '')
const filtered = computed(() => {
  const q = search.value.trim().toLocaleLowerCase('es')
  return (data.value?.rows || []).filter((row:any) => !q || [row.matricula,row.nombreCompleto,row.plantel].some(v => String(v || '').toLocaleLowerCase('es').includes(q)))
})
async function load() {
  loading.value = true
  error.value = ''
  try { data.value = await $fetch('/api/public/concept-report/' + encodeURIComponent(token)) }
  catch (err:any) { data.value = null; error.value = String(err?.data?.message || err?.message || 'Enlace no disponible.') }
  finally { loading.value = false }
}
onMounted(load)
</script>

<style scoped>
.public-report{min-height:100vh;background:#f5f8f6;color:#244637;font-family:Montserrat,Arial,sans-serif}
.public-header{height:83px;display:flex;align-items:center;gap:11px;padding:13px max(20px,calc((100vw - 1150px)/2));background:#fff;border-bottom:1px solid #e4ede7}
.public-header img{width:44px;height:44px;object-fit:contain}
.public-brand{display:flex;flex-direction:column;gap:3px}
.public-brand strong{font-family:Fredoka,sans-serif;font-size:20px;line-height:1}
.public-brand span{font-size:11px;color:#789286;font-weight:600}
.public-content{max-width:1170px;padding:35px 20px 55px;margin:0 auto}
.public-kicker{letter-spacing:.14em;font-size:11px;color:#63917a;font-weight:800}
h1{font-size:clamp(24px,4vw,36px);font-family:Fredoka,sans-serif;margin:7px 0 4px;color:#174532;font-weight:600}
.public-description{font-size:12px;color:#7b8e82;margin-bottom:28px}
.public-topline{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:19px}
.public-coverage{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:16px;padding:14px 17px;border:1px solid #ead9a9;background:#fffaf0;border-radius:13px;color:#765b22}
.public-coverage-copy{display:flex;align-items:flex-start;gap:10px}
.public-coverage-copy strong{font-size:13px}
.public-coverage-copy p{font-size:11px;line-height:1.6;margin:5px 0 0}
.public-coverage button{padding:8px 12px;border:1px solid #d8bd79;border-radius:8px;font-size:11px;font-weight:700;white-space:nowrap}
.public-campus-unavailable{color:#9a742b;font-weight:700}
@media(max-width:520px){.public-coverage{align-items:flex-start;flex-direction:column}.public-coverage button{align-self:flex-end}}
.public-stat{min-width:150px;flex:1;background:#fff;padding:19px 21px;border-radius:15px;border:1px solid #e5ebe6;display:flex;flex-direction:column;gap:5px}
.public-stat span{font-size:11px;color:#819589;font-weight:700}
.public-stat strong{font-family:Fredoka,sans-serif;font-size:28px;line-height:1.2;color:#1e5a42}
.public-block{background:#fff;border:1px solid #e5ebe6;border-radius:16px;margin-top:14px;padding:19px 21px}
h2{font-family:Fredoka,sans-serif;font-size:20px;margin:0 0 13px;color:#265542}
h2 span{font-size:12px;background:#eaf4ef;padding:3px 8px;border-radius:12px;vertical-align:middle;font-family:Montserrat,sans-serif}
.public-list-title{display:flex;justify-content:space-between;align-items:center;gap:10px}
.public-list-title h2{margin:0 0 12px}
.public-actions{display:flex;gap:9px;margin-bottom:12px}
.public-actions input{font:inherit;min-height:37px;border:1px solid #dae6df;border-radius:9px;padding:8px 12px;font-size:12px;max-width:250px}
.public-excel{display:flex;align-items:center;gap:7px;background:#245e47;color:#fff;border-radius:9px;padding:9px 14px;font-size:12px;font-weight:700;white-space:nowrap}
.public-table-scroll{overflow-x:auto}
table{width:100%;border-collapse:collapse;text-align:left;font-size:12px}
th{padding:12px;color:#779286;font-weight:700;border-bottom:1px solid #e7eeea;white-space:nowrap}
td{padding:11px 12px;border-bottom:1px solid #f1f4f2;white-space:nowrap}
tbody tr:last-child td{border:0}
tbody tr:nth-child(even){background:#fafcfb}
.numeric{text-align:right;font-variant-numeric:tabular-nums}
.mono{font-family:monospace;color:#4d7664}
.student{font-weight:700;color:#294d3b}
.public-empty{text-align:center;color:#83958b;padding:28px}
.public-state{background:#fff;border:1px solid #e1ebe4;border-radius:14px;padding:36px;font-size:14px;color:#718a7d;display:flex;flex-direction:column;gap:10px;align-items:flex-start}
.public-error{color:#a54948}
.public-error button{padding:9px 13px;background:#245e47;color:#fff;border-radius:8px}
footer{margin-top:24px;color:#82948a;font-size:10px}
@media(max-width:680px){.public-header{height:72px}.public-content{padding:23px 12px}.public-block{padding:13px}.public-list-title{align-items:stretch;flex-direction:column}.public-actions{width:100%}.public-actions input{flex:1;min-width:0}.public-topline{gap:8px}.public-stat{min-width:calc(50% - 8px)}}
</style>
