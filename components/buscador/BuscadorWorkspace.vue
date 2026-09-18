<template>
  <section class="buscador-shell">
    <div class="buscador-canvas">
      <header class="search-hero">
        <div class="hero-copy">
          <span class="eyebrow"><Search :size="14" /> Buscador</span>
          <h2>Encuentra a cualquier alumno</h2>
          <p>Alumno, matrícula, mamá, papá o tutor.</p>
        </div>

        <div class="search-box" :class="{ focused: searchFocused }">
          <Search :size="21" class="search-icon" />
          <input
            v-model="searchText"
            type="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="Nombre, apellido de mamá o papá, o matrícula…"
            aria-label="Buscar alumno por nombre, familiar o matrícula"
            @focus="searchFocused = true"
            @blur="searchFocused = false"
            @keydown.enter.prevent="openFirstResult"
          />
          <LoaderCircle v-if="searching" :size="18" class="spin muted-icon" />
          <button
            v-else-if="searchText"
            type="button"
            class="clear-search"
            aria-label="Limpiar búsqueda"
            @click="clearSearch"
          >
            <X :size="17" />
          </button>
        </div>

        <div v-if="planteles.length" class="plantel-strip" aria-label="Plantel">
          <button
            v-for="plantel in planteles"
            :key="plantel"
            type="button"
            class="plantel-pill"
            :class="{ active: selectedPlantel === plantel }"
            @click="selectPlantel(plantel)"
          >
            {{ plantel }}
          </button>
        </div>
      </header>

      <div v-if="fatalError" class="error-banner">
        <AlertTriangle :size="18" />
        <span>{{ fatalError }}</span>
      </div>

      <div v-if="!hasSearched && !selectedProfile" class="start-state">
        <div class="start-orbit">
          <div class="orbit-core"><UsersRound :size="34" /></div>
          <span class="orbit-dot dot-one"></span>
          <span class="orbit-dot dot-two"></span>
          <span class="orbit-dot dot-three"></span>
        </div>
        <strong>Busca por familia</strong>
        <span>Funciona con nombres y apellidos parciales.</span>
      </div>

      <div v-else class="workspace" :class="{ 'has-profile': !!selectedProfile || loadingProfile }">
        <aside class="results-panel">
          <div class="results-heading">
            <div>
              <span>Resultados</span>
              <strong>{{ resultCountLabel }}</strong>
            </div>
            <span v-if="searchMeta?.query" class="query-chip">“{{ searchMeta.query }}”</span>
          </div>

          <div v-if="searching && !results.length" class="result-skeletons" aria-hidden="true">
            <div v-for="index in 4" :key="index" class="result-skeleton">
              <span></span><div><i></i><i></i><i></i></div>
            </div>
          </div>

          <button
            v-for="student in results"
            :key="student.matricula"
            type="button"
            class="result-card"
            :class="{ selected: selectedMatricula === student.matricula }"
            @click="openStudent(student)"
          >
            <span class="result-avatar">
              <span>{{ initials(student.nombreCompleto) }}</span>
              <img
                v-if="student.photoUrl"
                :src="student.photoUrl"
                :alt="student.nombreCompleto"
                @error="removeBrokenImage"
              />
            </span>
            <span class="result-body">
              <span class="result-topline">
                <strong>{{ student.nombreCompleto || student.matricula }}</strong>
                <span class="matricula">{{ student.matricula }}</span>
              </span>
              <span class="academic-line">
                <School :size="13" />
                {{ [student.nivel, student.grado, student.grupo].filter(Boolean).join(' · ') || student.plantel }}
              </span>
              <span v-if="student.matchedBy" class="match-line">
                <span>{{ student.matchedBy.label }}</span>
                <b>{{ student.matchedBy.value || searchText }}</b>
              </span>
              <span v-if="student.parents?.length" class="parents-line">
                {{ student.parents.join(' · ') }}
              </span>
            </span>
            <ChevronRight :size="17" class="result-arrow" />
          </button>

          <div v-if="hasSearched && !searching && !results.length" class="no-results">
            <SearchX :size="28" />
            <strong>Sin coincidencias</strong>
            <span>Prueba otro nombre, apellido o matrícula.</span>
          </div>
        </aside>

        <main class="profile-panel">
          <div v-if="loadingProfile" class="profile-loading" aria-live="polite">
            <span class="profile-loading-photo"></span>
            <div class="profile-loading-lines">
              <i></i><i></i><i></i>
            </div>
            <div class="profile-loading-grid">
              <span v-for="index in 6" :key="index"></span>
            </div>
          </div>

          <template v-else-if="selectedProfile">
            <article class="profile-hero">
              <div class="student-photo">
                <span>{{ initials(selectedProfile.nombreCompleto) }}</span>
                <img
                  v-if="selectedProfile.photoUrl"
                  :src="selectedProfile.photoUrl"
                  :alt="selectedProfile.nombreCompleto"
                  @error="removeBrokenImage"
                />
              </div>

              <div class="student-identity">
                <div class="identity-badges">
                  <span class="status-badge" :class="{ inactive: !isActiveProfile }">
                    <BadgeCheck v-if="isActiveProfile" :size="13" />
                    <AlertTriangle v-else :size="13" />
                    {{ selectedProfile.status || 'Sin estatus' }}
                  </span>
                  <span class="campus-badge"><MapPin :size="13" /> {{ selectedProfile.plantel }}</span>
                </div>
                <h3>{{ selectedProfile.nombreCompleto }}</h3>
                <div class="identity-meta">
                  <span><IdCard :size="15" /> {{ selectedProfile.matricula }}</span>
                  <span v-if="academicSummary"><School :size="15" /> {{ academicSummary }}</span>
                </div>
                <div v-if="selectedProfile.meta?.sources?.length" class="source-row">
                  <span v-for="source in selectedProfile.meta.sources" :key="source">{{ source }}</span>
                </div>
              </div>
            </article>

            <section class="profile-grid">
              <article class="info-card family-card">
                <div class="card-heading">
                  <span class="card-icon"><UsersRound :size="18" /></span>
                  <div><strong>Familia</strong><small>Padres y tutores</small></div>
                </div>

                <div class="family-columns">
                  <div class="family-person">
                    <span class="family-role">Mamá</span>
                    <strong>{{ selectedProfile.sections?.madre?.nombre || 'Sin registro' }}</strong>
                    <a v-if="selectedProfile.sections?.madre?.telefono" :href="'tel:' + selectedProfile.sections.madre.telefono">
                      <Phone :size="13" /> {{ selectedProfile.sections.madre.telefono }}
                    </a>
                    <a v-if="selectedProfile.sections?.madre?.correo" :href="'mailto:' + selectedProfile.sections.madre.correo">
                      <Mail :size="13" /> {{ selectedProfile.sections.madre.correo }}
                    </a>
                    <button
                      v-if="sectionEntries(selectedProfile.sections?.madre).length > 3"
                      type="button"
                      class="mini-details"
                      @click="toggleFamily('madre')"
                    >
                      {{ expandedFamily === 'madre' ? 'Ocultar datos' : 'Ver más datos' }}
                      <ChevronDown :size="13" :class="{ rotated: expandedFamily === 'madre' }" />
                    </button>
                    <dl v-if="expandedFamily === 'madre'" class="mini-data">
                      <template v-for="[key, value] in sectionEntries(selectedProfile.sections?.madre, ['nombre', 'telefono', 'correo'])" :key="key">
                        <dt>{{ labelFor(key) }}</dt><dd>{{ formatValue(value) }}</dd>
                      </template>
                    </dl>
                  </div>

                  <div class="family-divider"></div>

                  <div class="family-person">
                    <span class="family-role">Papá / tutor</span>
                    <strong>{{ selectedProfile.sections?.padre?.nombre || 'Sin registro' }}</strong>
                    <a v-if="selectedProfile.sections?.padre?.telefono" :href="'tel:' + selectedProfile.sections.padre.telefono">
                      <Phone :size="13" /> {{ selectedProfile.sections.padre.telefono }}
                    </a>
                    <a v-if="selectedProfile.sections?.padre?.correo" :href="'mailto:' + selectedProfile.sections.padre.correo">
                      <Mail :size="13" /> {{ selectedProfile.sections.padre.correo }}
                    </a>
                    <button
                      v-if="sectionEntries(selectedProfile.sections?.padre).length > 3"
                      type="button"
                      class="mini-details"
                      @click="toggleFamily('padre')"
                    >
                      {{ expandedFamily === 'padre' ? 'Ocultar datos' : 'Ver más datos' }}
                      <ChevronDown :size="13" :class="{ rotated: expandedFamily === 'padre' }" />
                    </button>
                    <dl v-if="expandedFamily === 'padre'" class="mini-data">
                      <template v-for="[key, value] in sectionEntries(selectedProfile.sections?.padre, ['nombre', 'telefono', 'correo'])" :key="key">
                        <dt>{{ labelFor(key) }}</dt><dd>{{ formatValue(value) }}</dd>
                      </template>
                    </dl>
                  </div>
                </div>
              </article>

              <article class="info-card">
                <div class="card-heading">
                  <span class="card-icon"><School :size="18" /></span>
                  <div><strong>Escolar</strong><small>Situación actual</small></div>
                </div>
                <dl class="data-grid">
                  <template v-for="[key, value] in sectionEntries(selectedProfile.sections?.escolar)" :key="key">
                    <div><dt>{{ labelFor(key) }}</dt><dd>{{ formatValue(value) }}</dd></div>
                  </template>
                </dl>
              </article>

              <article class="info-card">
                <div class="card-heading">
                  <span class="card-icon"><HeartPulse :size="18" /></span>
                  <div><strong>Identidad y salud</strong><small>Datos disponibles</small></div>
                </div>
                <dl class="data-grid">
                  <template v-for="[key, value] in sectionEntries(selectedProfile.sections?.identidad)" :key="key">
                    <div><dt>{{ labelFor(key) }}</dt><dd>{{ formatValue(value) }}</dd></div>
                  </template>
                </dl>
                <span v-if="!sectionEntries(selectedProfile.sections?.identidad).length" class="empty-card">Sin datos adicionales.</span>
              </article>

              <article class="info-card">
                <div class="card-heading">
                  <span class="card-icon"><House :size="18" /></span>
                  <div><strong>Domicilio</strong><small>Información familiar</small></div>
                </div>
                <dl class="data-grid">
                  <template v-for="[key, value] in sectionEntries(selectedProfile.sections?.domicilio)" :key="key">
                    <div><dt>{{ labelFor(key) }}</dt><dd>{{ formatValue(value) }}</dd></div>
                  </template>
                </dl>
                <span v-if="!sectionEntries(selectedProfile.sections?.domicilio).length" class="empty-card">Sin domicilio registrado.</span>
              </article>
            </section>

            <section class="authorized-section">
              <div class="section-heading">
                <div>
                  <span class="section-kicker"><ShieldCheck :size="14" /> Husky Pass</span>
                  <h4>Personas autorizadas</h4>
                </div>
                <span class="count-badge">{{ selectedProfile.authorizedPeople?.length || 0 }}</span>
              </div>

              <div v-if="selectedProfile.authorizedPeople?.length" class="authorized-grid">
                <article v-for="person in selectedProfile.authorizedPeople" :key="person.id" class="authorized-card">
                  <div class="authorized-photo">
                    <span>{{ initials(person.name) }}</span>
                    <img v-if="person.photoUrl" :src="person.photoUrl" :alt="person.name" @error="removeBrokenImage" />
                  </div>
                  <div>
                    <strong>{{ person.name || 'Persona autorizada' }}</strong>
                    <span>{{ person.relationship || 'Autorizado' }}</span>
                  </div>
                  <Camera v-if="person.photoUrl" :size="14" class="photo-ready" />
                </article>
              </div>
              <div v-else class="authorized-empty">
                <ShieldCheck :size="22" />
                <span>No hay personas autorizadas vinculadas en Husky Pass.</span>
              </div>
            </section>

            <section v-if="hasNotes || huskyPassVisible" class="profile-grid compact-grid">
              <article v-if="huskyPassVisible" class="info-card compact-card">
                <div class="card-heading">
                  <span class="card-icon"><KeyRound :size="18" /></span>
                  <div><strong>Husky Pass</strong><small>Cuenta vinculada</small></div>
                </div>
                <dl class="data-grid">
                  <div><dt>Estado</dt><dd>{{ selectedProfile.huskyPass.available ? 'Disponible' : 'Sin credenciales completas' }}</dd></div>
                  <div v-if="selectedProfile.huskyPass.username"><dt>Usuario</dt><dd>{{ selectedProfile.huskyPass.username }}</dd></div>
                  <div v-if="selectedProfile.huskyPass.email"><dt>Correo</dt><dd>{{ selectedProfile.huskyPass.email }}</dd></div>
                </dl>
              </article>

              <article v-if="hasNotes" class="info-card compact-card">
                <div class="card-heading">
                  <span class="card-icon"><NotebookText :size="18" /></span>
                  <div><strong>Notas</strong><small>Seguimiento registrado</small></div>
                </div>
                <dl class="notes-list">
                  <template v-for="[key, value] in sectionEntries(selectedProfile.notes)" :key="key">
                    <div><dt>{{ labelFor(key) }}</dt><dd>{{ formatValue(value) }}</dd></div>
                  </template>
                </dl>
              </article>
            </section>

            <section v-if="sectionEntries(selectedProfile.sections?.documentos).length" class="documents-section">
              <div class="section-heading">
                <div>
                  <span class="section-kicker"><FileCheck2 :size="14" /> Expediente</span>
                  <h4>Documentos registrados</h4>
                </div>
              </div>
              <div class="documents-grid">
                <div v-for="[key, value] in sectionEntries(selectedProfile.sections?.documentos)" :key="key" class="document-chip">
                  <FileCheck2 :size="15" />
                  <span>{{ labelFor(key) }}</span>
                  <a v-if="isWebLink(value)" :href="String(value)" target="_blank" rel="noopener" aria-label="Abrir documento">
                    <ExternalLink :size="14" />
                  </a>
                  <BadgeCheck v-else :size="14" />
                </div>
              </div>
            </section>

            <details class="all-data">
              <summary>
                <span>
                  <Database :size="16" />
                  Todos los datos disponibles
                </span>
                <span class="all-data-count">{{ sectionEntries(selectedProfile.allData).length }}</span>
              </summary>
              <div class="all-data-grid">
                <div v-for="[key, value] in sectionEntries(selectedProfile.allData)" :key="key">
                  <span>{{ humanizeRawKey(key) }}</span>
                  <a v-if="isWebLink(value)" :href="String(value)" target="_blank" rel="noopener">
                    Abrir <ExternalLink :size="12" />
                  </a>
                  <strong v-else>{{ formatValue(value) }}</strong>
                </div>
              </div>
            </details>
          </template>

          <div v-else-if="hasSearched && results.length" class="choose-result">
            <UserRoundSearch :size="30" />
            <strong>Selecciona un alumno</strong>
            <span>El perfil reúne Aurora, Matrícula y Husky Pass.</span>
          </div>
        </main>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
  AlertTriangle,
  BadgeCheck,
  Camera,
  ChevronDown,
  ChevronRight,
  Database,
  ExternalLink,
  FileCheck2,
  HeartPulse,
  House,
  IdCard,
  KeyRound,
  LoaderCircle,
  Mail,
  MapPin,
  NotebookText,
  Phone,
  School,
  Search,
  SearchX,
  ShieldCheck,
  UserRoundSearch,
  UsersRound,
  X
} from 'lucide-vue-next'

const props = defineProps({
  fixture: { type: Boolean, default: false }
})

const searchText = ref('')
const searchFocused = ref(false)
const searching = ref(false)
const loadingProfile = ref(false)
const results = ref([])
const searchMeta = ref(null)
const selectedProfile = ref(null)
const selectedMatricula = ref('')
const selectedPlantel = ref('')
const planteles = ref([])
const fatalError = ref('')
const hasSearched = ref(false)
const expandedFamily = ref('')
let searchTimer = null
let searchSequence = 0

const LABELS = {
  nivel: 'Nivel',
  grado: 'Grado',
  grupo: 'Grupo',
  plantel: 'Plantel',
  ciclo: 'Ciclo',
  tipoIngreso: 'Tipo de ingreso',
  servicio: 'Servicio',
  estado: 'Estado',
  curp: 'CURP',
  fechaNacimiento: 'Fecha de nacimiento',
  sexo: 'Sexo',
  lugarNacimiento: 'Lugar de nacimiento',
  talla: 'Talla',
  peso: 'Peso',
  tipoSangre: 'Tipo de sangre',
  alergias: 'Alergias',
  nombre: 'Nombre',
  telefono: 'Teléfono',
  correo: 'Correo',
  lugarTrabajo: 'Lugar de trabajo',
  puesto: 'Puesto',
  estadoCivil: 'Estado civil',
  ine: 'INE',
  direccion: 'Dirección',
  calle: 'Calle',
  numero: 'Número',
  colonia: 'Colonia',
  codigoPostal: 'Código postal',
  municipio: 'Municipio',
  certificadoMedico: 'Certificado médico',
  certificadoVacunacionCovid19: 'Certificado de vacunación',
  actaNacimiento: 'Acta de nacimiento',
  curpAlumno: 'CURP del alumno',
  certificadoPrimaria: 'Certificado de primaria',
  boletaSextoPrimaria: 'Boleta 6º primaria',
  boletaPrimeroSecundaria: 'Boleta 1º secundaria',
  boletaSegundoSecundaria: 'Boleta 2º secundaria',
  motivoBaja: 'Motivo de baja',
  categoriaBaja: 'Categoría de baja',
  seguimientoBaja: 'Seguimiento de baja'
}

const resultCountLabel = computed(() => {
  if (searching.value && !results.value.length) return 'Buscando…'
  const total = Number(searchMeta.value?.total ?? results.value.length)
  return total === 1 ? '1 alumno' : total + ' alumnos'
})

const academicSummary = computed(() => {
  const escolar = selectedProfile.value?.sections?.escolar || {}
  return [escolar.nivel, escolar.grado, escolar.grupo].filter(Boolean).join(' · ')
})

const isActiveProfile = computed(() => String(selectedProfile.value?.status || '').toLowerCase() !== 'baja')
const hasNotes = computed(() => sectionEntries(selectedProfile.value?.notes).length > 0)
const huskyPassVisible = computed(() => {
  const account = selectedProfile.value?.huskyPass || {}
  return Boolean(account.available || account.username || account.email)
})

function initials(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'A'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

function sectionEntries(section, omit = []) {
  if (!section || typeof section !== 'object') return []
  const hidden = new Set(omit)
  return Object.entries(section).filter(([key, value]) => !hidden.has(key) && value !== null && value !== undefined && String(value).trim() !== '')
}

function labelFor(key) {
  return LABELS[key] || humanizeRawKey(key)
}

function humanizeRawKey(key) {
  return String(key || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase())
}

function formatValue(value) {
  if (value === true || value === 1) return 'Sí'
  if (value === false || value === 0) return 'No'
  return String(value ?? '').trim()
}

function isWebLink(value) {
  return /^https?:\/\//i.test(String(value || '').trim())
}

function removeBrokenImage(event) {
  const element = event?.currentTarget
  if (element?.parentNode) element.parentNode.removeChild(element)
}

function toggleFamily(key) {
  expandedFamily.value = expandedFamily.value === key ? '' : key
}

function clearSearch() {
  searchText.value = ''
  results.value = []
  searchMeta.value = null
  selectedProfile.value = null
  selectedMatricula.value = ''
  hasSearched.value = false
  fatalError.value = ''
}

function selectPlantel(plantel) {
  if (selectedPlantel.value === plantel) return
  selectedPlantel.value = plantel
  selectedProfile.value = null
  selectedMatricula.value = ''
  if (searchText.value.trim().length >= 2) runSearch()
}

function openFirstResult() {
  if (results.value[0]) openStudent(results.value[0])
}

async function runSearch() {
  const q = searchText.value.trim()
  if (q.length < 2 || !selectedPlantel.value) {
    results.value = []
    searchMeta.value = null
    hasSearched.value = false
    return
  }

  if (props.fixture) {
    applyFixtureSearch(q)
    return
  }

  const sequence = ++searchSequence
  searching.value = true
  fatalError.value = ''
  try {
    const response = await $fetch('/api/buscador', {
      query: { q, plantel: selectedPlantel.value, limit: 36 }
    })
    if (sequence !== searchSequence) return
    results.value = Array.isArray(response?.data) ? response.data : []
    searchMeta.value = response || null
    hasSearched.value = true
    if (selectedMatricula.value && !results.value.some((row) => row.matricula === selectedMatricula.value)) {
      selectedProfile.value = null
      selectedMatricula.value = ''
    }
  } catch (error) {
    if (sequence !== searchSequence) return
    results.value = []
    searchMeta.value = { total: 0, query: q }
    hasSearched.value = true
    fatalError.value = error?.data?.message || error?.message || 'No se pudo completar la búsqueda.'
  } finally {
    if (sequence === searchSequence) searching.value = false
  }
}

async function openStudent(student) {
  if (!student?.matricula || !selectedPlantel.value) return
  selectedMatricula.value = student.matricula
  expandedFamily.value = ''
  fatalError.value = ''

  if (props.fixture) {
    selectedProfile.value = fixtureProfile(student.matricula)
    return
  }

  loadingProfile.value = true
  try {
    selectedProfile.value = await $fetch('/api/buscador/' + encodeURIComponent(student.matricula), {
      query: { plantel: selectedPlantel.value }
    })
  } catch (error) {
    selectedProfile.value = null
    fatalError.value = error?.data?.message || error?.message || 'No se pudo abrir el perfil del alumno.'
  } finally {
    loadingProfile.value = false
  }
}

watch(searchText, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(runSearch, 260)
})

onMounted(async () => {
  if (props.fixture) return

  try {
    const session = await $fetch('/api/auth/session')
    planteles.value = Array.isArray(session?.planteles) ? session.planteles : []
    selectedPlantel.value = session?.activePlantel && session.activePlantel !== 'GLOBAL' && planteles.value.includes(session.activePlantel)
      ? session.activePlantel
      : planteles.value[0] || ''
  } catch (error) {
    fatalError.value = error?.data?.message || error?.message || 'No se pudo cargar el alcance de planteles.'
  }
})

function fixtureAvatar(label, background, accent) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 280">' +
    '<rect width="240" height="280" rx="34" fill="' + background + '"/>' +
    '<circle cx="120" cy="102" r="56" fill="#f2c8a4"/>' +
    '<path d="M65 105c2-61 106-76 116-5-27-10-49-28-62-49-11 22-31 40-55 49z" fill="#26364d"/>' +
    '<path d="M38 268c9-72 43-108 82-108s73 36 82 108" fill="' + accent + '"/>' +
    '<text x="120" y="252" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700" fill="white">' + label + '</text>' +
    '</svg>'
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg)
}

const fixtureStudents = [
  {
    matricula: 'PT20260841',
    nombreCompleto: 'Sofía Hernández García',
    plantel: 'PT',
    nivel: 'Primaria',
    grado: 'Cuarto',
    grupo: 'Canadá',
    estatus: 'Activo',
    photoUrl: fixtureAvatar('Sofía', '#edf7f0', '#137b54'),
    parents: ['Mariana García Luna', 'Eduardo Hernández Soto'],
    matchedBy: { label: 'Mamá', value: 'Mariana García Luna', score: 93 }
  },
  {
    matricula: 'PT20260427',
    nombreCompleto: 'Emilio Cortés García',
    plantel: 'PT',
    nivel: 'Primaria',
    grado: 'Segundo',
    grupo: 'México',
    estatus: 'Activo',
    photoUrl: fixtureAvatar('Emilio', '#eef4fb', '#2775a5'),
    parents: ['Paulina García Ortega', 'Jorge Cortés Díaz'],
    matchedBy: { label: 'Mamá', value: 'Paulina García Ortega', score: 90 }
  },
  {
    matricula: 'PT20260113',
    nombreCompleto: 'Renata García Méndez',
    plantel: 'PT',
    nivel: 'Primaria',
    grado: 'Sexto',
    grupo: 'América',
    estatus: 'Activo',
    photoUrl: fixtureAvatar('Renata', '#fbf2ec', '#b56a4c'),
    parents: ['Gabriela Méndez Lara', 'Arturo García León'],
    matchedBy: { label: 'Alumno', value: 'Renata García Méndez', score: 88 }
  }
]

function applyFixtureSearch(q) {
  const needle = String(q || '').toLowerCase()
  results.value = fixtureStudents.filter((student) =>
    [student.nombreCompleto, student.matricula, ...student.parents]
      .join(' ')
      .toLowerCase()
      .includes(needle)
  )
  searchMeta.value = { total: results.value.length, query: q }
  hasSearched.value = true
  searching.value = false
}

function fixtureProfile(matricula) {
  const student = fixtureStudents.find((item) => item.matricula === matricula) || fixtureStudents[0]
  return {
    matricula: student.matricula,
    plantel: 'PT',
    nombreCompleto: student.nombreCompleto,
    photoUrl: student.photoUrl,
    status: 'Activo',
    sections: {
      escolar: { nivel: 'Primaria', grado: student.grado, grupo: student.grupo, plantel: 'PT', ciclo: '2026-2027', tipoIngreso: 'Interno', servicio: 'Primaria', estado: 'Activo' },
      identidad: { curp: 'HEGS180214MMCRRFA1', fechaNacimiento: '2018-02-14', sexo: 'M', lugarNacimiento: 'Estado de México', talla: '1.31 m', peso: '29 kg', tipoSangre: 'O+', alergias: 'Sin alergias reportadas' },
      padre: { nombre: 'Eduardo Hernández Soto', telefono: '722 555 1818', correo: 'eduardo@example.test', lugarTrabajo: 'Grupo Horizonte', puesto: 'Arquitecto', estadoCivil: 'Casado', fechaNacimiento: '1986-05-21', curp: 'HESE860521HMCXXX01' },
      madre: { nombre: 'Mariana García Luna', telefono: '722 555 1212', correo: 'mariana@example.test', lugarTrabajo: 'Clínica Central', puesto: 'Médica', estadoCivil: 'Casada', fechaNacimiento: '1987-11-03', curp: 'GALM871103MMCXXX02' },
      domicilio: { direccion: 'Paseo de las Flores 118', calle: 'Paseo de las Flores', numero: '118', colonia: 'La Asunción', codigoPostal: '52172', municipio: 'Metepec' },
      documentos: { certificadoMedico: 'registrado', actaNacimiento: 'registrada', curpAlumno: 'registrada' }
    },
    authorizedPeople: [
      { id: 1, name: 'Mariana García Luna', relationship: 'Mamá', photoUrl: fixtureAvatar('Mariana', '#f8eef2', '#9f5575') },
      { id: 2, name: 'Eduardo Hernández Soto', relationship: 'Papá', photoUrl: fixtureAvatar('Eduardo', '#eef3f8', '#446a8d') },
      { id: 3, name: 'Patricia Luna Reyes', relationship: 'Abuela', photoUrl: fixtureAvatar('Patricia', '#f6f3e9', '#8d7d46') }
    ],
    huskyPass: { available: true, username: student.matricula, email: 'familia@example.test' },
    notes: { servicio: 'Recoger únicamente con personas autorizadas.' },
    allData: {
      matricula: student.matricula,
      nombreCompleto: student.nombreCompleto,
      curp: 'HEGS180214MMCRRFA1',
      plantel: 'PT',
      nivel: 'Primaria',
      grado: student.grado,
      grupo: student.grupo,
      ciclo: '2026-2027',
      nombre_padre: 'Eduardo',
      apellido_paterno_padre: 'Hernández',
      apellido_materno_padre: 'Soto',
      nombre_madre: 'Mariana',
      apellido_paterno_madre: 'García',
      apellido_materno_madre: 'Luna',
      telefono_padre: '7225551818',
      telefono_madre: '7225551212',
      domicilio_municipio: 'Metepec',
      tipo_sangre: 'O+',
      alergias: 'Sin alergias reportadas'
    },
    meta: { sources: ['Aurora base', 'Matrícula central', 'Husky Pass'], authorizedPeople: 3, updatedAt: '2026-09-18T16:10:00Z' }
  }
}

if (props.fixture) {
  planteles.value = ['PT', 'PM', 'SM']
  selectedPlantel.value = 'PT'
  searchText.value = 'García'
  applyFixtureSearch('García')
  selectedMatricula.value = results.value[0]?.matricula || ''
  selectedProfile.value = fixtureProfile(selectedMatricula.value)
}

</script>

<style scoped>
.buscador-shell {
  height: 100%;
  min-height: 0;
  overflow: auto;
  background:
    radial-gradient(circle at 9% 4%, rgba(112, 176, 111, .10), transparent 24rem),
    radial-gradient(circle at 96% 12%, rgba(49, 143, 159, .08), transparent 20rem),
    #f7f9f8;
  color: #203047;
}

.buscador-canvas {
  width: min(1500px, calc(100% - 32px));
  margin: 0 auto;
  padding: 24px 0 48px;
}

.search-hero {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(198, 216, 203, .85);
  border-radius: 27px;
  padding: 24px 26px 20px;
  background:
    radial-gradient(circle at 90% 12%, rgba(98, 166, 78, .16), transparent 16rem),
    linear-gradient(130deg, rgba(255,255,255,.99), rgba(244,250,245,.98));
  box-shadow: 0 14px 38px rgba(50, 75, 60, .07);
}

.hero-copy {
  display: grid;
  gap: 3px;
  margin-bottom: 17px;
}

.eyebrow, .section-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  color: #427e4e;
  font: 700 11px/1 Montserrat, sans-serif;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.hero-copy h2 {
  margin: 3px 0 0;
  color: #27364d;
  font: 600 clamp(23px, 2vw, 32px)/1.12 Fredoka, Montserrat, sans-serif;
}

.hero-copy p {
  margin: 0;
  color: #748078;
  font: 600 12px/1.5 Montserrat, sans-serif;
}

.search-box {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 58px;
  border: 1px solid #d9e4dc;
  border-radius: 18px;
  padding: 0 16px;
  background: rgba(255,255,255,.98);
  box-shadow: 0 8px 22px rgba(43, 69, 51, .055);
  transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
}

.search-box.focused {
  border-color: #80ae72;
  box-shadow: 0 0 0 4px rgba(105, 163, 83, .10), 0 12px 28px rgba(43, 69, 51, .08);
  transform: translateY(-1px);
}

.search-icon { color: #568f5b; }

.search-box input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #26364d;
  font: 600 15px/1.3 Montserrat, sans-serif;
}

.search-box input::placeholder { color: #9aa59e; font-weight: 500; }

.clear-search {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: #f1f5f2;
  color: #6f7d73;
  cursor: pointer;
}

.plantel-strip {
  display: flex;
  gap: 7px;
  margin-top: 13px;
  overflow-x: auto;
  scrollbar-width: none;
}

.plantel-strip::-webkit-scrollbar { display: none; }

.plantel-pill {
  flex: 0 0 auto;
  border: 1px solid #d8e2da;
  border-radius: 999px;
  padding: 7px 12px;
  background: rgba(255,255,255,.72);
  color: #6b786f;
  font: 700 10px/1 Montserrat, sans-serif;
  cursor: pointer;
}

.plantel-pill.active {
  border-color: #5f985e;
  background: #edf6eb;
  color: #376f43;
  box-shadow: inset 0 0 0 1px rgba(87, 145, 83, .12);
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 14px;
  border: 1px solid #f0d6ce;
  border-radius: 14px;
  padding: 11px 13px;
  background: #fff7f4;
  color: #a34f38;
  font: 600 12px/1.45 Montserrat, sans-serif;
}

.start-state {
  display: grid;
  min-height: 390px;
  place-items: center;
  align-content: center;
  gap: 7px;
  text-align: center;
  color: #78847c;
  font: 600 12px/1.45 Montserrat, sans-serif;
}

.start-state strong {
  margin-top: 10px;
  color: #324357;
  font: 600 20px/1.2 Fredoka, Montserrat, sans-serif;
}

.start-orbit {
  position: relative;
  display: grid;
  width: 112px;
  height: 112px;
  place-items: center;
  border: 1px dashed #c5d9c5;
  border-radius: 50%;
}

.orbit-core {
  display: grid;
  width: 68px;
  height: 68px;
  place-items: center;
  border-radius: 24px;
  background: linear-gradient(145deg, #edf7ec, #f6fbf7);
  color: #4f8b57;
  box-shadow: 0 10px 24px rgba(71, 119, 77, .10);
}

.orbit-dot {
  position: absolute;
  width: 9px;
  height: 9px;
  border: 2px solid #f7f9f8;
  border-radius: 50%;
  background: #62a467;
}
.dot-one { top: 4px; left: 29px; }
.dot-two { right: 2px; bottom: 31px; background: #3f94a0; }
.dot-three { left: 12px; bottom: 13px; background: #c4a154; }

.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  margin-top: 16px;
  min-height: 460px;
}

.workspace.has-profile {
  grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
  align-items: start;
}

.results-panel,
.profile-panel {
  min-width: 0;
}

.results-panel {
  display: grid;
  align-content: start;
  gap: 8px;
}

.results-heading {
  display: flex;
  min-height: 43px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 5px;
}

.results-heading > div {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.results-heading span {
  color: #879189;
  font: 700 10px/1 Montserrat, sans-serif;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.results-heading strong {
  color: #39495c;
  font: 700 12px/1 Montserrat, sans-serif;
}

.query-chip {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: 999px;
  padding: 6px 9px;
  background: #eef3ef;
  text-transform: none !important;
  letter-spacing: 0 !important;
}

.result-card {
  display: grid;
  grid-template-columns: 48px minmax(0,1fr) 18px;
  gap: 11px;
  width: 100%;
  align-items: center;
  border: 1px solid #dfe7e1;
  border-radius: 17px;
  padding: 11px;
  background: rgba(255,255,255,.94);
  color: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 5px 16px rgba(49, 69, 55, .035);
  transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
}

.result-card:hover {
  border-color: #b6ceb6;
  box-shadow: 0 9px 22px rgba(49, 69, 55, .075);
  transform: translateY(-1px);
}

.result-card.selected {
  border-color: #77a872;
  background: linear-gradient(135deg, #fff, #f1f8ef);
  box-shadow: 0 0 0 3px rgba(95, 152, 94, .08);
}

.result-avatar,
.student-photo,
.authorized-photo {
  position: relative;
  display: grid;
  overflow: hidden;
  place-items: center;
  background: linear-gradient(145deg, #eaf4ec, #f3f7f4);
  color: #4f7c5d;
  font: 700 13px/1 Montserrat, sans-serif;
}

.result-avatar {
  width: 48px;
  height: 53px;
  border-radius: 14px;
}

.result-avatar img,
.student-photo img,
.authorized-photo img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.result-body {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.result-topline {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 7px;
}

.result-topline strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #2f3e52;
  font: 700 12px/1.35 Montserrat, sans-serif;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.matricula {
  flex: 0 0 auto;
  color: #929b95;
  font: 700 9px/1 Montserrat, sans-serif;
}

.academic-line,
.parents-line {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  color: #7d8881;
  font: 600 10px/1.3 Montserrat, sans-serif;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-line {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  margin-top: 1px;
  color: #466d4c;
  font: 600 9.5px/1.3 Montserrat, sans-serif;
}

.match-line span {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 3px 6px;
  background: #eaf4e8;
  font-weight: 700;
}

.match-line b {
  min-width: 0;
  overflow: hidden;
  color: #53625a;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-arrow { color: #9ba69f; }

.profile-panel {
  border: 1px solid #dde6df;
  border-radius: 24px;
  background: rgba(255,255,255,.91);
  box-shadow: 0 13px 34px rgba(44, 67, 51, .06);
}

.profile-hero {
  display: grid;
  grid-template-columns: 132px minmax(0,1fr);
  gap: 22px;
  align-items: center;
  padding: 22px;
  border-bottom: 1px solid #e6ece7;
  background:
    radial-gradient(circle at 92% 16%, rgba(89, 159, 76, .12), transparent 15rem),
    linear-gradient(135deg, #fff, #f8fbf8);
  border-radius: 24px 24px 0 0;
}

.student-photo {
  width: 132px;
  height: 150px;
  border: 5px solid white;
  border-radius: 24px;
  box-shadow: 0 11px 28px rgba(48, 76, 56, .13);
  font-size: 25px;
}

.student-identity { min-width: 0; }

.identity-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.status-badge,
.campus-badge,
.source-row span,
.count-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  padding: 5px 8px;
  font: 700 9px/1 Montserrat, sans-serif;
}

.status-badge {
  background: #e9f5e8;
  color: #427a48;
}

.status-badge.inactive {
  background: #fff0ec;
  color: #a85842;
}

.campus-badge {
  background: #edf3f5;
  color: #55717a;
}

.student-identity h3 {
  margin: 0;
  color: #27364b;
  font: 600 clamp(23px, 2.2vw, 34px)/1.08 Fredoka, Montserrat, sans-serif;
}

.identity-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 9px 16px;
  margin-top: 9px;
  color: #66736c;
  font: 600 11px/1.3 Montserrat, sans-serif;
}

.identity-meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.source-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 13px;
}

.source-row span {
  padding: 4px 7px;
  background: #f1f4f2;
  color: #879089;
  font-size: 8.5px;
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0,1fr));
  gap: 12px;
  padding: 14px 14px 0;
}

.info-card {
  min-width: 0;
  border: 1px solid #e1e8e3;
  border-radius: 18px;
  padding: 15px;
  background: #fff;
}

.family-card { grid-column: 1 / -1; }

.card-heading {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 13px;
}

.card-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border-radius: 11px;
  background: #edf5ec;
  color: #548358;
}

.card-heading > div {
  display: grid;
  gap: 1px;
}

.card-heading strong {
  color: #334256;
  font: 700 12px/1.2 Montserrat, sans-serif;
}

.card-heading small {
  color: #969f99;
  font: 600 9px/1.2 Montserrat, sans-serif;
}

.family-columns {
  display: grid;
  grid-template-columns: minmax(0,1fr) 1px minmax(0,1fr);
  gap: 17px;
}

.family-divider { background: #e8ede9; }

.family-person {
  display: grid;
  align-content: start;
  gap: 6px;
  min-width: 0;
}

.family-role {
  color: #809087;
  font: 700 9px/1 Montserrat, sans-serif;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.family-person > strong {
  overflow: hidden;
  color: #304054;
  font: 700 12px/1.4 Montserrat, sans-serif;
  text-overflow: ellipsis;
}

.family-person > a {
  display: flex;
  align-items: center;
  gap: 5px;
  width: fit-content;
  max-width: 100%;
  overflow: hidden;
  color: #5f7467;
  font: 600 10px/1.3 Montserrat, sans-serif;
  text-decoration: none;
  text-overflow: ellipsis;
}

.mini-details {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 4px;
  margin-top: 3px;
  border: 0;
  padding: 0;
  background: none;
  color: #4d8554;
  font: 700 9px/1.2 Montserrat, sans-serif;
  cursor: pointer;
}

.rotated { transform: rotate(180deg); }

.mini-data {
  display: grid;
  grid-template-columns: auto minmax(0,1fr);
  gap: 5px 8px;
  margin: 4px 0 0;
  border-top: 1px solid #edf1ee;
  padding-top: 8px;
}

.mini-data dt,
.data-grid dt,
.notes-list dt {
  color: #939d96;
  font: 700 8.5px/1.3 Montserrat, sans-serif;
  text-transform: uppercase;
}

.mini-data dd,
.data-grid dd,
.notes-list dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: #4b5a50;
  font: 600 10px/1.4 Montserrat, sans-serif;
}

.data-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0,1fr));
  gap: 10px 12px;
  margin: 0;
}

.data-grid > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.data-grid dd { color: #35465a; }

.empty-card {
  color: #9aa39e;
  font: 600 10px/1.4 Montserrat, sans-serif;
}

.authorized-section,
.documents-section {
  margin: 14px;
  border: 1px solid #e0e7e2;
  border-radius: 19px;
  padding: 16px;
  background: linear-gradient(145deg, #fbfdfb, #f7faf8);
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 13px;
}

.section-heading > div {
  display: grid;
  gap: 4px;
}

.section-heading h4 {
  margin: 0;
  color: #324257;
  font: 600 17px/1.15 Fredoka, Montserrat, sans-serif;
}

.count-badge {
  min-width: 25px;
  justify-content: center;
  background: #e7f2e6;
  color: #477b4b;
}

.authorized-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 9px;
}

.authorized-card {
  position: relative;
  display: grid;
  grid-template-columns: 52px minmax(0,1fr);
  gap: 10px;
  align-items: center;
  min-width: 0;
  border: 1px solid #e3e9e4;
  border-radius: 15px;
  padding: 9px;
  background: white;
}

.authorized-photo {
  width: 52px;
  height: 58px;
  border-radius: 13px;
}

.authorized-card > div:not(.authorized-photo) {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.authorized-card strong {
  overflow: hidden;
  color: #354459;
  font: 700 10px/1.35 Montserrat, sans-serif;
  text-overflow: ellipsis;
}

.authorized-card span {
  color: #7d8a82;
  font: 600 9px/1.2 Montserrat, sans-serif;
}

.photo-ready {
  position: absolute;
  top: 7px;
  right: 7px;
  color: #6ca16b;
}

.authorized-empty,
.choose-result {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #8b968f;
  font: 600 10px/1.4 Montserrat, sans-serif;
}

.compact-grid { padding-top: 0; }
.compact-card { min-height: 130px; }

.notes-list {
  display: grid;
  gap: 8px;
  margin: 0;
}

.notes-list > div {
  display: grid;
  gap: 3px;
}

.documents-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.document-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #dfe7e1;
  border-radius: 10px;
  padding: 7px 9px;
  background: white;
  color: #53675a;
  font: 700 9px/1.2 Montserrat, sans-serif;
}

.document-chip a {
  display: inline-flex;
  color: #4d8653;
}

.all-data {
  margin: 0 14px 14px;
  border: 1px solid #e0e7e2;
  border-radius: 17px;
  background: #fbfcfb;
}

.all-data summary {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px;
  color: #536158;
  cursor: pointer;
  list-style: none;
  font: 700 10px/1 Montserrat, sans-serif;
}

.all-data summary::-webkit-details-marker { display: none; }

.all-data summary > span:first-child {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.all-data-count {
  border-radius: 999px;
  padding: 5px 7px;
  background: #edf2ee;
  color: #7c8980;
}

.all-data-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 1px;
  border-top: 1px solid #e6ebe7;
  background: #e6ebe7;
}

.all-data-grid > div {
  display: grid;
  min-width: 0;
  gap: 4px;
  padding: 10px 12px;
  background: white;
}

.all-data-grid span {
  overflow: hidden;
  color: #929d96;
  font: 700 8px/1.25 Montserrat, sans-serif;
  text-overflow: ellipsis;
  text-transform: uppercase;
}

.all-data-grid strong,
.all-data-grid a {
  overflow: hidden;
  color: #405044;
  font: 600 9.5px/1.4 Montserrat, sans-serif;
  text-overflow: ellipsis;
  overflow-wrap: anywhere;
}

.all-data-grid a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #477e4e;
  text-decoration: none;
}

.profile-loading {
  display: grid;
  grid-template-columns: 118px minmax(0,1fr);
  gap: 22px;
  min-height: 420px;
  padding: 22px;
}

.profile-loading-photo,
.profile-loading-lines i,
.profile-loading-grid span,
.result-skeleton span,
.result-skeleton i {
  display: block;
  border-radius: 12px;
  background: linear-gradient(90deg, #eef2ef 20%, #f8faf8 50%, #eef2ef 80%);
  background-size: 220% 100%;
  animation: shimmer 1.3s linear infinite;
}

.profile-loading-photo {
  width: 118px;
  height: 138px;
  border-radius: 22px;
}

.profile-loading-lines {
  display: grid;
  align-content: center;
  gap: 10px;
}

.profile-loading-lines i { height: 14px; }
.profile-loading-lines i:first-child { width: 56%; height: 26px; }
.profile-loading-lines i:last-child { width: 74%; }

.profile-loading-grid {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0,1fr));
  gap: 12px;
}

.profile-loading-grid span { height: 115px; }

.result-skeleton {
  display: grid;
  grid-template-columns: 48px minmax(0,1fr);
  gap: 11px;
  border: 1px solid #e4eae5;
  border-radius: 17px;
  padding: 11px;
  background: white;
}

.result-skeleton > span { height: 53px; }
.result-skeleton > div { display: grid; align-content: center; gap: 6px; }
.result-skeleton i { height: 8px; }
.result-skeleton i:first-child { width: 70%; height: 11px; }
.result-skeleton i:last-child { width: 54%; }

.no-results,
.choose-result {
  min-height: 220px;
  justify-content: center;
  flex-direction: column;
  text-align: center;
}

.no-results {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #8e9892;
}

.no-results strong,
.choose-result strong {
  color: #425148;
  font: 700 12px/1.3 Montserrat, sans-serif;
}

.no-results span,
.choose-result span {
  color: #909b94;
  font: 600 10px/1.4 Montserrat, sans-serif;
}

.muted-icon { color: #7b8d80; }
.spin { animation: spin .8s linear infinite; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes shimmer { to { background-position: -220% 0; } }

@media (max-width: 1050px) {
  .workspace.has-profile { grid-template-columns: minmax(255px, 315px) minmax(0,1fr); }
  .profile-grid { grid-template-columns: 1fr; }
  .family-card { grid-column: auto; }
  .all-data-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
}

@media (max-width: 760px) {
  .buscador-canvas { width: min(100% - 18px, 680px); padding-top: 10px; }
  .search-hero { border-radius: 21px; padding: 18px 15px 15px; }
  .hero-copy h2 { font-size: 23px; }
  .search-box { min-height: 52px; border-radius: 15px; padding: 0 13px; }
  .search-box input { font-size: 13px; }
  .workspace.has-profile { grid-template-columns: 1fr; }
  .results-panel { max-height: 300px; overflow-y: auto; padding-right: 2px; }
  .profile-panel { border-radius: 20px; }
  .profile-hero { grid-template-columns: 92px minmax(0,1fr); gap: 14px; padding: 15px; border-radius: 20px 20px 0 0; }
  .student-photo { width: 92px; height: 108px; border-radius: 18px; border-width: 4px; }
  .student-identity h3 { font-size: 21px; }
  .identity-meta { display: grid; gap: 5px; }
  .profile-grid { padding: 10px 10px 0; gap: 9px; }
  .info-card { border-radius: 15px; padding: 13px; }
  .family-columns { grid-template-columns: 1fr; gap: 13px; }
  .family-divider { width: 100%; height: 1px; }
  .authorized-section, .documents-section { margin: 10px; padding: 13px; border-radius: 16px; }
  .authorized-grid { grid-template-columns: 1fr; }
  .all-data { margin: 0 10px 10px; }
  .all-data-grid { grid-template-columns: 1fr; }
  .data-grid { gap: 9px; }
}

@media (max-width: 420px) {
  .buscador-canvas { width: calc(100% - 12px); }
  .hero-copy p { display: none; }
  .profile-hero { grid-template-columns: 78px minmax(0,1fr); }
  .student-photo { width: 78px; height: 92px; }
  .identity-badges { margin-bottom: 5px; }
  .source-row { margin-top: 8px; }
  .data-grid { grid-template-columns: 1fr; }
}
</style>
