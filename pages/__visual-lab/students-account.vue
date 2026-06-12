<template>
  <main class="visual-lab-page">
    <!-- Permanent iteration/debugging tool. Do not remove without replacing docs/visual-testing.md. -->
    <header v-if="showLabChrome" class="visual-lab-toolbar">
      <div>
        <strong>Visual Lab</strong>
        <span>students-account</span>
      </div>
      <nav aria-label="Visual lab actions">
        <button type="button" @click="seedVisualState">Sembrar sesion y cache</button>
        <NuxtLink to="/">Inicio protegido</NuxtLink>
        <NuxtLink to="/control-escolar">Control escolar</NuxtLink>
        <button type="button" @click="clearVisualState">Limpiar lab</button>
      </nav>
    </header>

    <div v-if="isClientReady" class="students-scale-shell visual-lab-frame">
      <div class="students-design-canvas">
        <div class="students-workspace has-detail visual-lab-workspace">
          <StudentsListPanel
            :displayed-students="students"
            :selected-student="selectedStudent"
            :selected-matriculas="selectedMatriculas"
            :selected-count="selectedCount"
            :all-displayed-selected="allDisplayedSelected"
            :some-displayed-selected="someDisplayedSelected"
            :has-account-workspace="true"
            :external-concepts="externalConcepts"
            :tipo-ingreso-concepts="externalConcepts"
            target-ciclo="2026"
            :photo-cache="photoCache"
            @student-row-click="selectStudent"
            @select-student="selectStudent"
            @toggle-student-selection="toggleSelection"
          />
          <div class="students-workspace-resizer" aria-hidden="true">
            <span class="students-workspace-resizer-rail"></span>
          </div>
          <section class="student-detail-panel student-detail-panel--account">
            <StudentDetails
              :student="selectedStudent"
              :is-enrolled="true"
              :external-concepts="externalConcepts"
              :tipo-ingreso-concepts="externalConcepts"
              :visual-lab-debts="selectedVisualDebts"
            />
          </section>
        </div>
      </div>
    </div>
    <div v-else class="visual-lab-loading">Preparando visual lab...</div>

    <ContextMenu v-if="isClientReady" />
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import ContextMenu from '~/components/ContextMenu.vue'
import StudentDetails from '~/components/StudentDetails.vue'
import StudentsListPanel from '~/components/students/StudentsListPanel.vue'

definePageMeta({ layout: false })

const route = useRoute()
const showLabChrome = computed(() => route.query.chrome !== '0')
const globalState = useState('globalState', () => ({ ciclo: '2026', lateFeeActive: true }))
globalState.value = { ...(globalState.value || {}), ciclo: '2026', lateFeeActive: true }

const authEmail = useCookie('auth_email')
const authName = useCookie('auth_name')
const authRole = useCookie('auth_role')
const authPlanteles = useCookie('auth_planteles')
const authActivePlantel = useCookie('auth_active_plantel')
const authHasControlEscolar = useCookie('auth_has_control_escolar')
const visualLabCookie = useCookie('visual_lab')

const externalConcepts = ['1001']
const labMatriculas = ['PTO574', 'PTO696', 'PTO161', 'PTO799']
const visualPhotoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 220">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ecf7ff"/>
      <stop offset="1" stop-color="#eef9ec"/>
    </linearGradient>
    <linearGradient id="shirt" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1684a7"/>
      <stop offset="1" stop-color="#48a33d"/>
    </linearGradient>
  </defs>
  <rect width="180" height="220" rx="28" fill="url(#bg)"/>
  <circle cx="90" cy="78" r="40" fill="#f5cda9"/>
  <path d="M55 78c8-39 62-45 76-8 2 5 3 12 2 18-17-3-33-13-43-28-8 14-20 23-36 27-1-3 0-6 1-9z" fill="#23364f"/>
  <path d="M36 191c6-43 30-68 54-68s48 25 54 68" fill="url(#shirt)"/>
  <circle cx="75" cy="82" r="4" fill="#15233c"/>
  <circle cx="105" cy="82" r="4" fill="#15233c"/>
  <path d="M76 101c9 8 20 8 28 0" fill="none" stroke="#b36a56" stroke-width="4" stroke-linecap="round"/>
  <path d="M55 154c24 18 46 18 70 0" fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round" opacity=".85"/>
</svg>`
const visualPhotoUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(visualPhotoSvg)}`
const isClientReady = ref(false)
const students = ref([
  {
    matricula: 'PTO574',
    nombreCompleto: 'Acra Ayllon Kaleb Alexander',
    grado: '4',
    grupo: 'AMERICA',
    estatus: 'Activo',
    plantel: 'PT',
    cicloBase: '2024',
    saldoNeto: 0.4,
    currentEnrollmentConceptMatch: true,
    conceptoIdsTarget: ['1001'],
    tipoIngreso: 'interno'
  },
  {
    matricula: 'PTO696',
    nombreCompleto: 'Adan Gutierrez Melissa',
    grado: '5',
    grupo: 'AMERICA',
    estatus: 'Activo',
    plantel: 'PT',
    cicloBase: '2024',
    saldoNeto: 0,
    currentEnrollmentConceptMatch: true,
    conceptoIdsTarget: ['1001'],
    tipoIngreso: 'interno'
  },
  {
    matricula: 'PTO161',
    nombreCompleto: 'Aguilar Huerta Christopher',
    grado: '2',
    grupo: 'AMERICA',
    estatus: 'Activo',
    plantel: 'PT',
    cicloBase: '2024',
    saldoNeto: 240,
    currentEnrollmentConceptMatch: true,
    conceptoIdsTarget: ['1001'],
    tipoIngreso: 'interno'
  },
  {
    matricula: 'PTO799',
    nombreCompleto: 'Alarcon Martinez Maria Fernanda',
    grado: '6',
    grupo: 'AMERICA',
    estatus: 'Activo',
    plantel: 'PT',
    cicloBase: '2024',
    saldoNeto: 1380,
    currentEnrollmentConceptMatch: true,
    conceptoIdsTarget: ['1001'],
    tipoIngreso: 'interno'
  }
])

const accountDebtsByMatricula = {
  PTO574: [
    accountDebt('PT-2026-0001', 1, 'Septiembre', 'INSCRIPCION 2026-2027 PRIM TOL', 1900, 1899.6, 0.4, 100),
    accountDebt('PT-2026-0002', 2, 'Octubre', 'COLEGIATURA PRIMARIA', 1840, 1520, 320, 83),
    accountDebt('PT-2026-0003', 3, 'Noviembre', 'COLEGIATURA PRIMARIA', 1840, 0, 1840, 0),
    accountDebt('PT-2026-0004', 4, 'Diciembre', 'TALLERES Y MATERIALES', 680, 0, 680, 0)
  ],
  PTO696: [
    accountDebt('PT-2026-0011', 1, 'Septiembre', 'INSCRIPCION 2026-2027 PRIM TOL', 1900, 1900, 0, 100),
    accountDebt('PT-2026-0012', 2, 'Octubre', 'COLEGIATURA PRIMARIA', 1840, 1840, 0, 100),
    accountDebt('PT-2026-0013', 3, 'Noviembre', 'COLEGIATURA PRIMARIA', 1840, 1840, 0, 100),
    accountDebt('PT-2026-0014', 4, 'Diciembre', 'TALLERES Y MATERIALES', 680, 680, 0, 100)
  ],
  PTO161: [
    accountDebt('PT-2026-0021', 1, 'Septiembre', 'INSCRIPCION 2026-2027 PRIM TOL', 1900, 1900, 0, 100),
    accountDebt('PT-2026-0022', 2, 'Octubre', 'COLEGIATURA PRIMARIA', 1840, 1600, 240, 87),
    accountDebt('PT-2026-0023', 3, 'Noviembre', 'COLEGIATURA PRIMARIA', 1840, 0, 1840, 0),
    accountDebt('PT-2026-0024', 4, 'Diciembre', 'TALLERES Y MATERIALES', 680, 0, 680, 0)
  ],
  PTO799: [
    accountDebt('PT-2026-0031', 1, 'Septiembre', 'INSCRIPCION 2026-2027 PRIM TOL', 1900, 1900, 0, 100),
    accountDebt('PT-2026-0032', 2, 'Octubre', 'COLEGIATURA PRIMARIA', 1840, 460, 1380, 25),
    accountDebt('PT-2026-0033', 3, 'Noviembre', 'COLEGIATURA PRIMARIA', 1840, 0, 1840, 0),
    accountDebt('PT-2026-0034', 4, 'Diciembre', 'TALLERES Y MATERIALES', 680, 0, 680, 0)
  ]
}

const selectedStudent = ref(students.value[0])
const selectedMatriculas = ref(new Set(['PTO574']))
const selectedCount = computed(() => selectedMatriculas.value.size)
const allDisplayedSelected = computed(() => selectedCount.value === students.value.length)
const someDisplayedSelected = computed(() => selectedCount.value > 0 && !allDisplayedSelected.value)
const selectedVisualDebts = computed(() => accountDebtsByMatricula[selectedStudent.value?.matricula] || [])
const photoCache = computed(() => labMatriculas.reduce((cache, matricula) => {
  cache[matricula] = matricula === 'PTO574' ? visualPhotoUrl : 'none'
  return cache
}, {}))

function accountDebt(documento, mes, mesLabel, conceptoNombre, monto, pagos, saldo, porcentajePagado) {
  return {
    documento,
    mes,
    mesLabel,
    conceptoNombre,
    monto,
    subtotal: monto,
    pagos,
    saldo,
    porcentajePagado,
    porcentajePagoReal: porcentajePagado,
    pagosDepurados: 0,
    porcentajeDepurado: 0,
    hasRecargo: false,
    plantel: 'PT',
    historialPagos: []
  }
}

function selectStudent(student) {
  selectedStudent.value = student
}

function toggleSelection(student) {
  const next = new Set(selectedMatriculas.value)
  if (next.has(student.matricula)) next.delete(student.matricula)
  else next.add(student.matricula)
  selectedMatriculas.value = next
}

function seedVisualAuth() {
  authEmail.value = 'visual-lab@example.test'
  authName.value = 'Visual Lab'
  authRole.value = 'superadmin,role_ctrl'
  authPlanteles.value = 'PT'
  authActivePlantel.value = 'PT'
  authHasControlEscolar.value = 'true'
  visualLabCookie.value = 'students-account'
  if (typeof document !== 'undefined') {
    document.cookie = 'visual_lab=students-account; path=/; SameSite=Lax'
    document.cookie = 'auth_email=visual-lab%40example.test; path=/; SameSite=Lax'
    document.cookie = 'auth_name=Visual%20Lab; path=/; SameSite=Lax'
    document.cookie = 'auth_role=superadmin%2Crole_ctrl; path=/; SameSite=Lax'
    document.cookie = 'auth_planteles=PT; path=/; SameSite=Lax'
    document.cookie = 'auth_active_plantel=PT; path=/; SameSite=Lax'
    document.cookie = 'auth_has_control_escolar=true; path=/; SameSite=Lax'
  }
}

function cacheScopes() {
  return [
    ['plantel', 'default'],
    ['plantel', 'PT'],
    [String(authRole.value || 'plantel'), String(authActivePlantel.value || 'default')]
  ]
}

function seedVisualCache() {
  if (typeof window === 'undefined') return
  cacheScopes().forEach(([scopeRole, scopePlantel]) => {
    labMatriculas.forEach((matricula) => {
      const key = [
        'account-state-cache',
        'v1',
        encodeURIComponent(scopeRole),
        encodeURIComponent(scopePlantel),
        encodeURIComponent(matricula),
        '2026',
        'recargos-on'
      ].join(':')
      localStorage.setItem(key, JSON.stringify({
        version: 1,
        key,
        matricula,
        ciclo: '2026',
        lateFeeActive: true,
        savedAt: new Date().toISOString(),
        debts: accountDebtsByMatricula[matricula] || []
      }))
      sessionStorage.setItem(`foto_${matricula}`, photoCache.value[matricula] || 'none')
    })
  })
}

function seedVisualState() {
  seedVisualAuth()
  seedVisualCache()
}

function clearVisualState() {
  if (typeof window === 'undefined') return
  Object.keys(localStorage)
    .filter((key) => key.startsWith('account-state-cache:v1:') && labMatriculas.some((matricula) => key.includes(`:${matricula}:`)))
    .forEach((key) => localStorage.removeItem(key))
  labMatriculas.forEach((matricula) => sessionStorage.removeItem(`foto_${matricula}`))
}

seedVisualAuth()
onMounted(() => {
  seedVisualState()
  isClientReady.value = true
})
</script>

<style scoped>
.visual-lab-page {
  display: flex;
  width: 100vw;
  height: 100vh;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  flex-direction: column;
  padding: 8px;
  background: #f6f9f5;
  color: #15233c;
  font-family: var(--students-font, Montserrat, ui-sans-serif, system-ui, sans-serif);
}

.visual-lab-toolbar {
  display: flex;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  padding: 0 10px;
  border: 1px solid rgba(211, 222, 235, .9);
  border-radius: 10px;
  background: rgba(255, 255, 255, .94);
  box-shadow: 0 8px 18px rgba(21, 35, 60, .05);
}

.visual-lab-toolbar div,
.visual-lab-toolbar nav {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.visual-lab-toolbar strong {
  font-size: 12px;
  font-weight: 900;
}

.visual-lab-toolbar span {
  color: #64748b;
  font-size: 11px;
  font-weight: 750;
}

.visual-lab-toolbar a,
.visual-lab-toolbar button {
  display: inline-flex;
  height: 26px;
  align-items: center;
  border: 1px solid rgba(63, 145, 56, .18);
  border-radius: 8px;
  background: #fff;
  color: #2f7f32;
  cursor: pointer;
  font-size: 10.5px;
  font-weight: 850;
  line-height: 1;
  padding-inline: 9px;
  text-decoration: none;
}

.visual-lab-frame {
  width: 100%;
  flex: 1 1 0;
}

.visual-lab-loading {
  display: grid;
  min-height: 0;
  flex: 1 1 0;
  place-items: center;
  border: 1px solid rgba(211, 222, 235, .9);
  border-radius: 14px;
  background: #fff;
  color: #64748b;
  font-size: 12px;
  font-weight: 850;
}

.visual-lab-workspace {
  --students-list-panel-size: 40%;
  --students-detail-panel-size: 60%;
}
</style>
