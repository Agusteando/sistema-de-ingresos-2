<template>
  <section class="change-workspace" aria-label="Historial de cambios de alumnos">
    <header class="change-header">
      <div>
        <p class="eyebrow">CONTROL ESCOLAR</p>
        <h1>Historial de cambios</h1>
        <p class="subheading">Todos los campos · Todos los sistemas</p>
      </div>
      <div class="header-tools">
        <button class="filter-button" type="button" :aria-expanded="showFilters" @click="showFilters = !showFilters">
          <LucideSlidersHorizontal :size="20" /> Filtros
        </button>
        <button class="refresh-button" type="button" :disabled="status === 'pending'" aria-label="Actualizar cambios" @click="refresh">
          <LucideRefreshCw :size="21" :class="{ spinning: status === 'pending' }" />
        </button>
      </div>
    </header>

    <div class="legend" aria-label="Origen de los cambios">
      <span><i class="source-indicator aurora"></i>Aurora</span>
      <span><i class="source-indicator husky"></i>Husky Pass</span>
      <span><i class="source-indicator other"></i>Otros</span>
    </div>

    <div v-if="showFilters" class="filter-drawer">
      <label><span>Buscar alumno o usuario</span><input v-model="search" type="search" placeholder="Nombre, matrícula o usuario" /></label>
      <label><span>Sistema</span>
        <select v-model="system"><option value="all">Todos</option><option value="Aurora">Aurora</option><option value="Husky Pass">Husky Pass</option><option value="Otro">Otros</option></select>
      </label>
      <label><span>Periodo</span>
        <select v-model.number="range"><option :value="7">7 días</option><option :value="30">30 días</option><option :value="90">90 días</option></select>
      </label>
      <button type="button" class="clear-button" @click="resetFilters">Ver todos</button>
    </div>

    <div v-if="error" class="audit-warning" role="alert">
      No se pudo consultar la auditoría. <button type="button" @click="refresh">Reintentar</button>
    </div>
    <div v-else-if="status === 'pending'" class="audit-loading" role="status">Cargando cambios registrados…</div>
    <template v-else>
      <div class="stat-line">
        <div><strong>{{ filteredEvents.length }}</strong><span>Registros</span></div>
        <div><strong>{{ distinctStudents }}</strong><span>Alumnos</span></div>
        <div><strong>{{ activeFields }}</strong><span>Tipos de campo</span></div>
      </div>

      <div class="section-heading">
        <div>
          <h2>Cambios por campo</h2>
          <p>Selecciona una fecha para ver el detalle.</p>
        </div>
        <span class="period-label">{{ range }} días</span>
      </div>

      <div class="matrix-scroll" role="region" aria-label="Cambios por campo y fecha" tabindex="0">
        <div class="matrix-grid" :style="{ '--day-count': String(days.length) }" role="table" aria-label="Matriz de cambios">
          <div class="matrix-column-title" role="columnheader">CAMPO</div>
          <div v-for="day in days" :key="'header-' + day.key" class="matrix-day-title" role="columnheader">
            <span>{{ day.weekday }}</span><strong>{{ day.day }}</strong>
          </div>
          <template v-for="category in categories" :key="category.key">
            <button type="button" class="field-title" :class="{ chosen: focus?.category === category.key && !focus?.day }" @click="selectField(category.key)">
              <span class="field-name">{{ category.label }}</span>
              <strong class="field-total">{{ categoryTotals[category.key] || 0 }}</strong>
            </button>
            <button v-for="day in days" :key="category.key + '-' + day.key" type="button" class="matrix-cell"
              :class="{ active: focus?.category === category.key && focus?.day === day.key, filled: cell(category.key,day.key).length > 0 }"
              :aria-label="category.label + ', ' + day.key + ', ' + cell(category.key,day.key).length + ' registros'"
              @click="selectCell(category.key, day.key)">
              <template v-if="cell(category.key, day.key).length">
                <span class="cell-count">{{ cell(category.key,day.key).length }}</span>
                <span v-for="actor in cellActors(category.key,day.key).slice(0,2)" :key="actor.identity" class="cell-person">
                  <span class="actor-avatar" :class="sourceClass(actor.source)">
                    <img v-if="actor.avatar" :src="actor.avatar" alt="" loading="lazy" referrerpolicy="no-referrer" />
                    <span v-else>{{ initials(actor.name) }}</span>
                  </span>
                  <span class="actor-name">{{ actor.name }}</span>
                </span>
                <span v-if="cellActors(category.key,day.key).length > 2" class="remaining">
                  +{{ cellActors(category.key,day.key).length - 2 }} usuarios
                </span>
              </template>
              <span v-else class="cell-empty">—</span>
            </button>
          </template>
        </div>
      </div>
      <p class="matrix-note">El nombre y la foto identifican a la cuenta registrada. En Husky Pass, una cuenta familiar no identifica necesariamente a la persona que utilizó el dispositivo.</p>

      <div class="section-heading entries-heading">
        <div>
          <h2>{{ selectionTitle }}</h2>
          <p>{{ selectedEvents.length }} registros · {{ focus ? 'Selección del mapa' : 'Todos los campos y sistemas' }}</p>
        </div>
        <button v-if="focus" type="button" class="clear-button" @click="focus = null">Ver todos</button>
      </div>
      <div class="event-list" aria-live="polite">
        <article v-for="record in selectedEvents.slice(0, visibleCount)" :key="record.id" class="event-card">
          <div class="event-heading">
            <div class="event-person">
              <span class="actor-avatar large" :class="sourceClass(record.source)">
                <img v-if="record.avatar" :src="record.avatar" alt="" loading="lazy" referrerpolicy="no-referrer" />
                <span v-else>{{ initials(record.actor) }}</span>
              </span>
              <div class="actor-copy">
                <strong>{{ record.actor }}</strong>
                <span>{{ record.source }} · {{ record.recordedAt.slice(0,16).replace('T',' · ') }}</span>
              </div>
            </div>
            <span class="source-chip" :class="sourceClass(record.source)">{{ record.fieldLabel }}</span>
          </div>
          <div class="event-student"><strong>{{ record.student }}</strong><span>{{ record.matricula }} · {{ record.plantel }}</span></div>
          <div class="value-diff" v-if="record.quality === 'verified'">
            <div><span>Antes</span><strong>{{ displayValue(record.before) }}</strong></div>
            <LucideArrowRight :size="23" aria-hidden="true" />
            <div><span>Después</span><strong>{{ displayValue(record.after) }}</strong></div>
          </div>
          <div v-else class="historical-note">Registro anterior · Sin valores guardados</div>
          <div class="event-reference">Evento #{{ record.eventId }} · {{ record.flow || 'Registro de actividad' }}</div>
        </article>
        <div v-if="!selectedEvents.length" class="empty-state">
          <LucideSearchX :size="35" />
          <strong>Sin registros en este periodo</strong>
          <p>No significa que se pueda descartar un cambio fuera de la auditoría disponible.</p>
        </div>
        <button v-if="selectedEvents.length > visibleCount" class="show-more" type="button" @click="visibleCount += 30">
          Ver más cambios ({{ selectedEvents.length - visibleCount }})
        </button>
      </div>
      <p v-if="data?.truncated" class="audit-warning">Hay más registros que el límite de esta consulta. Reduce el periodo para revisar fechas específicas.</p>
      <p class="coverage">Fuente: auditoría MySQL · Los registros anteriores pueden carecer de valores antes/después. Las modificaciones directas fuera de las aplicaciones pueden no identificar al responsable.</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LucideArrowRight, LucideRefreshCw, LucideSearchX, LucideSlidersHorizontal } from 'lucide-vue-next'

type AuditEvent = {
  id: string; eventId: number; date: string; recordedAt: string
  matricula: string; student: string; field: string; fieldLabel: string; category: string
  before: string | null; after: string | null; source: string; actor: string
  actorEmail: string; avatar: string; flow: string; quality: string; plantel: string; ciclo: string
}
type Result = { events: AuditEvent[]; categories: Array<{key: string;label: string}>; truncated: boolean }
type ActorChip = { identity: string; name: string; source: string; avatar: string }

const showFilters = ref(false)
const search = ref('')
const system = ref('all')
const range = ref(7)
const focus = ref<{category: string; day?: string} | null>(null)
const visibleCount = ref(30)
const { data, status, error, refresh } = await useFetch<Result>('/api/control-escolar/audit/changes', {
  cache: 'no-store',
  default: () => ({ events: [], categories: [], truncated: false })
})
const defaultCategories = [
  {key:'grupo',label:'Grupo'}, {key:'nombre',label:'Nombre'},
  {key:'grado',label:'Grado'}, {key:'estatus',label:'Estatus'},
  {key:'contacto',label:'Contacto'}, {key:'trabajo',label:'Lugares de trabajo'},
  {key:'otros',label:'Otros campos'}
]
const categories = computed(() => data.value?.categories?.length ? data.value.categories : defaultCategories)
const sourceClass = (source: string) => source === 'Aurora' ? 'aurora' : source === 'Husky Pass' ? 'husky' : 'other'
const initials = (name: string) => {
  const parts = String(name || '?').split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : String(name || '?').slice(0, 2)).toUpperCase()
}
const displayValue = (value: string | null) => value === null ? 'Sin dato' : value === '' ? 'Vacío' : value
const mexicoDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date)
  const get = (type: string) => parts.find(p=>p.type===type)?.value || ''
  return get('year')+'-'+get('month')+'-'+get('day')
}
const days = computed(() => {
  const current = mexicoDate(new Date())
  const [year,month,day] = current.split('-').map(Number)
  const max = range.value
  return Array.from({length:max}, (_,i) => {
    const date = new Date(Date.UTC(year,month-1,day-(max-1-i)))
    const key = date.toISOString().slice(0,10)
    return {
      key,
      day: new Intl.DateTimeFormat('es-MX',{timeZone:'UTC',day:'numeric',month:'short'}).format(date),
      weekday: new Intl.DateTimeFormat('es-MX',{timeZone:'UTC',weekday:'short'}).format(date)
    }
  })
})
const startDate = computed(() => days.value[0]?.key || '')
const filteredEvents = computed(() => (data.value?.events || []).filter(event => {
  if (event.date < startDate.value) return false
  if (system.value !== 'all' && event.source !== system.value) return false
  const q = search.value.toLocaleLowerCase('es-MX').trim()
  return !q || [event.actor,event.actorEmail,event.matricula,event.student,event.fieldLabel].join(' ').toLocaleLowerCase('es-MX').includes(q)
}))
const indexedCells = computed(() => {
  const map = new Map<string, AuditEvent[]>()
  for (const event of filteredEvents.value) {
    const key = event.category + '|' + event.date
    const list = map.get(key) || []
    list.push(event)
    map.set(key,list)
  }
  return map
})
const cell = (category: string, day: string) => indexedCells.value.get(category + '|' + day) || []
const cellActors = (category: string, day: string): ActorChip[] => {
  const people = new Map<string,ActorChip>()
  for (const e of cell(category,day)) {
    const identity = e.actorEmail || e.source+':'+e.actor
    if (!people.has(identity)) people.set(identity,{identity,name:e.actor,source:e.source,avatar:e.avatar})
  }
  return Array.from(people.values())
}
const categoryTotals = computed(() => Object.fromEntries(categories.value.map(cat=>[cat.key,filteredEvents.value.filter(e=>e.category===cat.key).length])))
const distinctStudents = computed(() => new Set(filteredEvents.value.map(e=>e.matricula)).size)
const activeFields = computed(() => new Set(filteredEvents.value.map(e=>e.field)).size)
const selectedEvents = computed(() => filteredEvents.value.filter(e=>
  !focus.value || (e.category === focus.value.category && (!focus.value.day || e.date === focus.value.day))
))
const selectionTitle = computed(() => {
  if (!focus.value) return 'Cambios recientes'
  const category = categories.value.find(c=>c.key===focus.value?.category)
  return (category?.label || 'Cambios') + (focus.value.day ? ' · '+focus.value.day : '')
})
const selectCell = (category: string, day: string) => {
  focus.value = focus.value?.category===category && focus.value?.day===day ? null : {category,day}
}
const selectField = (category: string) => {
  focus.value = focus.value?.category===category && !focus.value?.day ? null : {category}
}
const resetFilters = () => { search.value=''; system.value='all'; range.value=7; focus.value=null }
watch([focus,search,system,range],()=>{visibleCount.value=30})
</script>

<style scoped>
.change-workspace{--aurora:#198a5a;--husky:#287bc9;--other:#767f90;background:#fff;color:#213047;border:1px solid #dde5e8;border-radius:24px;padding:clamp(16px,2.5vw,30px);display:grid;gap:22px;font:500 16px/1.45 Montserrat,system-ui,sans-serif}
.change-workspace *{box-sizing:border-box}
.change-header,.header-tools,.legend,.stat-line,.section-heading,.event-heading,.event-person,.value-diff,.event-student{display:flex;align-items:center}
.change-header,.section-heading,.event-heading{justify-content:space-between;gap:16px}
.change-header h1{font:650 clamp(28px,3vw,36px)/1.1 Fredoka,Montserrat,sans-serif;margin:5px 0}
.eyebrow{font-size:14px;color:#31745d;font-weight:800;letter-spacing:.08em;margin:0}
.subheading,.section-heading p,.matrix-note,.coverage{color:#5c6d7d;font-size:15px;margin:0}
.header-tools{gap:10px}
.filter-button,.refresh-button,.clear-button,.show-more{border:1px solid #cddadf;background:white;color:#263b50;border-radius:12px;min-height:44px;padding:10px 15px;font:750 15px Montserrat,sans-serif;cursor:pointer}
.filter-button{display:flex;align-items:center;gap:9px}
.refresh-button{width:47px;padding:8px;display:grid;place-items:center}
button:focus-visible{outline:3px solid #178ac0;outline-offset:2px}
.legend{gap:22px;flex-wrap:wrap;font-size:16px;font-weight:750}
.legend>span{display:flex;align-items:center;gap:8px}
.source-indicator{width:13px;height:13px;border-radius:5px;display:inline-block}
.source-indicator.aurora{background:var(--aurora)}.source-indicator.husky{background:var(--husky)}.source-indicator.other{background:var(--other)}
.filter-drawer{display:flex;flex-wrap:wrap;gap:14px;padding:18px;background:#f4f7f8;border-radius:16px;align-items:end}
.filter-drawer label{display:grid;gap:7px;flex:1;min-width:200px;font-weight:750;font-size:15px}
.filter-drawer input,.filter-drawer select{background:#fff;border:1px solid #bccdd5;padding:12px;border-radius:10px;min-height:45px;font:550 16px Montserrat,sans-serif}
.stat-line{gap:10px}
.stat-line>div{flex:1;min-width:0;display:grid;gap:1px;padding:16px;background:#f4f7f7;border-radius:16px}
.stat-line strong{font-size:28px;font-weight:850;line-height:1.15}.stat-line span{font-size:15px;color:#536474}
.section-heading{align-items:flex-end}.section-heading h2{font:650 25px Fredoka,Montserrat,sans-serif;margin:0 0 4px}
.period-label{padding:8px 12px;border:1px solid #dce5e7;border-radius:10px;font-size:15px;font-weight:750;white-space:nowrap}
.matrix-scroll{width:100%;overflow-x:auto;border:1px solid #e0e7ea;border-radius:16px;background:white}
.matrix-grid{display:grid;grid-template-columns:210px repeat(var(--day-count),minmax(155px,1fr));min-width:max-content}
.matrix-column-title,.matrix-day-title{background:#edf4f3;padding:14px;border-bottom:1px solid #dce7e7;font-weight:800;color:#334b50}
.matrix-column-title{position:sticky;left:0;z-index:3;font-size:15px}
.matrix-day-title{text-align:center;font-size:15px;display:grid;gap:3px}.matrix-day-title strong{font-size:17px}
.field-title{position:sticky;left:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:6px;text-align:left;min-height:145px;padding:15px;background:#fafcfc;border:0;border-right:1px solid #dee7e8;border-bottom:1px solid #e6ecee;color:#253b4c;cursor:pointer}
.field-title.chosen{background:#eaf2f1}
.field-name{font-size:17px;font-weight:800}.field-total{display:grid;place-items:center;background:#e5efed;min-width:34px;height:34px;border-radius:11px;font-size:17px}
.matrix-cell{min-height:145px;border:0;border-right:1px solid #e7ecef;border-bottom:1px solid #e7ecef;background:#fff;display:flex;flex-direction:column;align-items:stretch;gap:5px;padding:9px;text-align:left;cursor:pointer}
.matrix-cell.filled{background:#f9fbfb}.matrix-cell.active{background:#e3f0ed;box-shadow:inset 0 0 0 2px #267a68}
.cell-count{font-weight:850;font-size:19px;line-height:1.1;text-align:right;color:#274356}
.cell-person{display:flex;align-items:center;gap:7px;min-width:0}
.actor-avatar{width:32px;height:32px;min-width:32px;border-radius:50%;background:#d9eae3;color:#195438;display:grid;place-items:center;font-size:12px;font-weight:850;overflow:hidden;border:2px solid var(--aurora)}
.actor-avatar.husky{background:#e2eefb;color:#1b5890;border-color:var(--husky)}
.actor-avatar.other{background:#e8eaee;color:#626d7d;border-color:var(--other)}
.actor-avatar.large{width:47px;height:47px;min-width:47px;font-size:15px;border-width:3px}
.actor-avatar img{width:100%;height:100%;object-fit:cover}
.actor-name{font-size:16px;font-weight:750;line-height:1.2;overflow-wrap:anywhere}
.remaining{font-size:15px;font-weight:800;color:#446276}
.cell-empty{margin:auto;color:#a7b3b9;font-size:20px}
.matrix-note{font-size:15px}
.entries-heading{padding-top:8px;border-top:1px solid #e2eaeb}
.event-list{display:grid;gap:12px}
.event-card{border:1px solid #dfe8eb;border-radius:17px;padding:18px;display:grid;gap:12px}
.actor-copy{display:grid;gap:3px;min-width:0}.actor-copy strong{font-size:17px;overflow-wrap:anywhere}.actor-copy span,.event-student span{font-size:15px;color:#657686}
.source-chip{background:#ecf7f0;color:#1f6d47;padding:8px 12px;font-size:15px;font-weight:800;border-radius:10px;white-space:normal;text-align:right}
.source-chip.husky{background:#eaf3fc;color:#235a89}.source-chip.other{background:#f0f1f4;color:#566171}
.event-person{gap:10px;min-width:0}.event-student{gap:10px;flex-wrap:wrap}.event-student strong{font-size:17px}
.value-diff{gap:14px;align-items:center}
.value-diff>div{min-width:0;flex:1;padding:14px;border:1px solid #e1e8eb;background:#f8fafb;border-radius:12px;display:grid;gap:4px}
.value-diff>div:last-child{background:#f2f9f4;border-color:#d9e9dc}
.value-diff span{color:#596b79;font-size:15px;font-weight:650}
.value-diff strong{font-size:18px;overflow-wrap:anywhere;line-height:1.35}
.event-reference{font-size:15px;color:#586c7d;overflow-wrap:anywhere}
.historical-note{background:#f5f4ed;border-radius:10px;padding:12px;color:#795b2d;font-size:16px;font-weight:750}
.empty-state,.audit-loading{padding:35px;text-align:center;display:grid;justify-items:center;gap:10px;color:#58707e}
.empty-state strong{font-size:20px}.empty-state p{font-size:15px;margin:0}
.show-more{width:100%;min-height:50px}
.audit-warning{padding:16px;background:#fff5eb;color:#805522;border:1px solid #f0d0a7;border-radius:12px;font-size:16px}
.audit-warning button{border:0;background:transparent;text-decoration:underline;font:inherit;cursor:pointer}
.coverage{border-top:1px solid #e2eaeb;padding-top:14px}
.spinning{animation:spin .85s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:700px){.change-workspace{padding:13px;border-radius:15px;gap:17px}.change-header{align-items:start}.change-header h1{font-size:27px}.stat-line strong{font-size:24px}.stat-line span{font-size:14px}.stat-line>div{padding:12px}.event-heading{align-items:start}.source-chip{max-width:45%}.matrix-grid{grid-template-columns:145px repeat(var(--day-count),minmax(160px,1fr))}.field-title{padding:10px}.field-name{font-size:16px}.filter-button{padding:9px}}
</style>
