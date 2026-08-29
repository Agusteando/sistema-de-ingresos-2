<template>
  <main class="visual-concept-lab">
    <!-- Permanent dev-only visual seam for the auth-heavy /conceptos screen. -->
    <header v-if="showChrome" class="visual-concept-toolbar">
      <div><strong>Visual Lab</strong><span>conceptos · talleres 2026–2027</span></div>
      <nav><NuxtLink to="/__visual-lab/students-account">Estado de cuenta</NuxtLink></nav>
    </header>
    <section class="visual-concept-frame">
      <ClientOnly>
        <ConceptosPage
          :visual-lab-payload="payload"
          initial-view-mode="mappings"
          initial-category="talleres_servicios"
        />
        <template #fallback>
          <div class="visual-concept-loading">Preparando escenario de Conceptos…</div>
        </template>
      </ClientOnly>
    </section>
  </main>
</template>

<script setup>
import { computed } from 'vue'
import ConceptosPage from '~/pages/conceptos.vue'
import { CONCEPTOS_PLANTELES_LIST } from '~/utils/constants'
import { FINAL_TALLERES } from '~/shared/utils/talleresServicios'

definePageMeta({ layout: false })

const route = useRoute()
const showChrome = computed(() => route.query.chrome !== '0')
const authRole = useCookie('auth_role')
const activePlantel = useCookie('auth_active_plantel')
authRole.value = 'superadmin,role_ctrl'
activePlantel.value = 'PT'
useState('globalState', () => ({ ciclo: '2026' })).value = { ciclo: '2026' }

const tallerKeys = [
  'TAE_KWON_DO', 'BE_AN_ARTIST', 'JAZZ', 'BALLET', 'DANZA_ARABE', 'GIMNASIA',
  'TENIS', 'BASQUETBOL', 'TOCHITO_BANDERA', 'AJEDREZ', 'VOLEIBOL',
]
const talleres = tallerKeys
  .map((key) => FINAL_TALLERES.find((taller) => taller.clave === key))
  .filter(Boolean)

const conceptos = talleres.slice(0, 6).map(({ clave, nombre, imagen }, index) => ({
  id: 1101 + index,
  concepto: `${nombre} 2026-2027`,
  costo: index === 0 ? 850 : 790,
  ciclo_escolar: '2026',
  plantel: 'TODOS LOS NIVELES',
  eventual: 0,
  plazo: '[1,2,3,4,5,6,7,8,9,10]',
  image_url: imagen,
  stock: { controlled: false, status: 'uncontrolled' },
}))

const seedCandidates = conceptos.map((concepto, index) => ({
  concepto_id: concepto.id,
  concepto_nombre: concepto.concepto,
  servicio_clave: talleres[index].clave,
  servicio_nombre: talleres[index].nombre,
}))

const payload = {
  canManage: true,
  source: 'central',
  cicloActual: '2026',
  user: { email: 'visual-lab@example.test', role: 'superadmin', roles: ['superadmin'], isSuperAdmin: true, activePlantel: 'PT' },
  categorias: [
    { key: 'regular', label: 'Inscripción' },
    { key: 'talleres_servicios', label: 'Talleres y Servicios' },
    { key: 'servicio_global', label: 'Servicio global' },
    { key: 'curso_verano', label: 'Curso de Verano' },
    { key: 'mensual_baja4', label: 'Mensual baja 4' },
    { key: 'issste', label: 'ISSSTE' },
    { key: 'otro', label: 'Otro' },
  ],
  cycles: [{ cycle_name: '2026', is_current: 1 }, { cycle_name: '2025', is_current: 0 }],
  ciclos: { '2026': { esActual: true, planteles_talleres_servicios: { PT: [] } } },
  conceptos,
  mappings: seedCandidates.slice(0, 2).map((candidate, index) => ({
    id: index + 1,
    cycle_name: '2026',
    plantel: 'PT',
    concepto_id: candidate.concepto_id,
    concepto_nombre: candidate.concepto_nombre,
    enrollment_type: 'talleres_servicios',
    months_json: '[]',
    servicio_clave: candidate.servicio_clave,
    servicio_nombre: candidate.servicio_nombre,
    activo: 1,
  })),
  talleresCatalogo: talleres.map(({ clave, nombre, imagen }, index) => ({
    clave,
    nombre,
    imagen,
    activo: true,
    orden: (index + 1) * 10,
  })),
  stock: { source: 'central', plantel: 'PT', snapshots: [], allSnapshots: [], movements: [] },
  temporaryWorkshopSeed: {
    ciclo: '2026',
    planteles: [...CONCEPTOS_PLANTELES_LIST],
    plantelesCount: CONCEPTOS_PLANTELES_LIST.length,
    conceptos: seedCandidates,
    conceptosCount: seedCandidates.length,
    expectedMappings: seedCandidates.length * CONCEPTOS_PLANTELES_LIST.length,
    completeMappings: 2,
    pendingMappings: seedCandidates.length * CONCEPTOS_PLANTELES_LIST.length - 2,
    missingWorkshops: [],
    ready: true,
    complete: false,
  },
}
</script>

<style scoped>
.visual-concept-lab { display: flex; width: 100vw; height: 100vh; min-width: 0; min-height: 0; flex-direction: column; overflow: hidden; padding: 8px; background: #f3f7f2; }
.visual-concept-frame { display: flex; min-height: 0; flex: 1; overflow: hidden; }
.visual-concept-loading { display: grid; min-height: 240px; flex: 1; place-items: center; color: #64748b; font-size: 12px; font-weight: 800; }
.visual-concept-toolbar { display: flex; min-height: 38px; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; padding: 0 10px; border: 1px solid #d8e2dc; border-radius: 10px; background: #fff; }
.visual-concept-toolbar div, .visual-concept-toolbar nav { display: flex; align-items: center; gap: 9px; }
.visual-concept-toolbar strong { color: #172941; font-size: 12px; font-weight: 900; }
.visual-concept-toolbar span { color: #64748b; font-size: 11px; font-weight: 750; }
.visual-concept-toolbar a { border: 1px solid #d5e8ce; border-radius: 8px; color: #2f7f32; padding: 5px 9px; font-size: 10.5px; font-weight: 850; text-decoration: none; }
</style>
