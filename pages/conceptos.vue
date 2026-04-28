<template>
  <div class="catalog-page">
    <section class="catalog-summary">
      <div>
        <span class="section-kicker">Fuente central</span>
        <h2>Catálogo de conceptos</h2>
        <p>Consulta los conceptos disponibles para el ciclo activo y genera reportes puntuales sin capturar ni duplicar conceptos localmente.</p>
      </div>

      <div class="summary-strip">
        <div>
          <span>Total</span>
          <strong>{{ conceptos.length }}</strong>
        </div>
        <div>
          <span>Recurrentes</span>
          <strong>{{ recurrentesCount }}</strong>
        </div>
        <div>
          <span>Únicos</span>
          <strong>{{ eventualesCount }}</strong>
        </div>
      </div>
    </section>

    <section class="catalog-toolbar">
      <div class="search-box">
        <LucideSearch :size="17" />
        <input v-model="search" type="search" placeholder="Buscar por concepto, descripción o ID" />
      </div>

      <div class="filter-pills" aria-label="Tipo de concepto">
        <button type="button" :class="{ active: tipoFilter === 'todos' }" @click="tipoFilter = 'todos'">Todos</button>
        <button type="button" :class="{ active: tipoFilter === 'recurrente' }" @click="tipoFilter = 'recurrente'">Recurrentes</button>
        <button type="button" :class="{ active: tipoFilter === 'eventual' }" @click="tipoFilter = 'eventual'">Únicos</button>
      </div>

      <button class="btn btn-outline" type="button" @click="loadConceptos" :disabled="loadingTable">
        <LucideRefreshCw :class="{ 'animate-spin': loadingTable }" :size="16" />
        Actualizar
      </button>
    </section>

    <div class="card table-wrapper">
      <div class="table-header">
        <div>
          <h3>Conceptos del ciclo {{ cicloLabel }}</h3>
          <p>{{ filteredConceptos.length }} visibles</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th class="w-20">ID</th>
            <th>Concepto</th>
            <th>Descripción</th>
            <th class="text-right">Costo</th>
            <th class="text-center">Meses</th>
            <th class="text-center">Tipo</th>
            <th class="text-right">Reporte</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loadingTable">
            <td colspan="7" class="text-center py-12 text-gray-500 font-medium">Cargando conceptos...</td>
          </tr>
          <tr v-else-if="!filteredConceptos.length">
            <td colspan="7" class="text-center py-12 text-gray-500">No hay conceptos que coincidan con la búsqueda.</td>
          </tr>
          <tr
            v-else
            v-for="c in filteredConceptos"
            :key="c.id"
            class="cursor-context-menu"
            @contextmenu.prevent="showContextMenu($event, c)"
          >
            <td class="font-mono text-gray-400 text-xs">{{ c.id }}</td>
            <td class="font-semibold text-gray-800">{{ c.concepto }}</td>
            <td class="text-gray-500">{{ c.description || 'Sin descripción' }}</td>
            <td class="text-right font-bold text-gray-800 font-mono">${{ Number(c.costo || 0).toFixed(2) }}</td>
            <td class="text-center text-gray-600">{{ displayMeses(c) }}</td>
            <td class="text-center">
              <span :class="['badge', isEventual(c) ? 'badge-info' : 'badge-neutral']">{{ isEventual(c) ? 'Único' : 'Recurrente' }}</span>
            </td>
            <td class="text-right">
              <button class="icon-action" type="button" title="Generar reporte" @click="openReport(c)">
                <LucideFileText :size="16" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useState } from '#app'
import { LucideFileText, LucideRefreshCw, LucideSearch } from 'lucide-vue-next'
import { useContextMenu } from '~/composables/useContextMenu'
import { useToast } from '~/composables/useToast'
import { formatCicloLabel, normalizeCicloKey } from '~/shared/utils/ciclo'

const state = useState('globalState')
const router = useRouter()
const { show } = useToast()
const { openMenu } = useContextMenu()

const conceptos = ref([])
const loadingTable = ref(false)
const search = ref('')
const tipoFilter = ref('todos')

const cicloKey = computed(() => normalizeCicloKey(state.value.ciclo))
const cicloLabel = computed(() => formatCicloLabel(state.value.ciclo))

const isEventual = (concepto) => String(concepto?.eventual) === '1' || concepto?.eventual === true

const displayMeses = (concepto) => {
  const raw = String(concepto?.plazo || '1').trim()

  if (!raw) return '1'
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? String(Math.max(1, parsed.length)) : '1'
    } catch (e) {
      return raw
    }
  }

  if (raw.includes(',')) return String(raw.split(',').filter(Boolean).length || 1)
  return raw
}

const recurrentesCount = computed(() => conceptos.value.filter(c => !isEventual(c)).length)
const eventualesCount = computed(() => conceptos.value.filter(isEventual).length)

const filteredConceptos = computed(() => {
  const term = search.value.trim().toLowerCase()

  return conceptos.value.filter((concepto) => {
    if (tipoFilter.value === 'recurrente' && isEventual(concepto)) return false
    if (tipoFilter.value === 'eventual' && !isEventual(concepto)) return false
    if (!term) return true

    return [
      concepto.id,
      concepto.concepto,
      concepto.description,
      concepto.plantel
    ].some(value => String(value || '').toLowerCase().includes(term))
  })
})

const loadConceptos = async () => {
  loadingTable.value = true
  try {
    conceptos.value = await $fetch('/api/conceptos', {
      params: { ciclo: cicloKey.value }
    })
  } catch (e) {
    show('Error cargando conceptos', 'danger')
  } finally {
    loadingTable.value = false
  }
}

const openReport = (concepto) => {
  router.push({
    path: '/reportes',
    query: {
      tipo: 'concepto',
      conceptoId: concepto.id
    }
  })
}

const showContextMenu = (event, concepto) => {
  openMenu(event, [
    { label: concepto.concepto, disabled: true },
    { label: '-' },
    { label: 'Generar reporte', icon: LucideFileText, action: () => openReport(concepto) }
  ])
}

onMounted(loadConceptos)
watch(() => cicloKey.value, loadConceptos)
</script>

<style scoped>
.catalog-page {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 14px;
}

.catalog-summary {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 18px;
  border: 1px solid #dfe6ef;
  border-radius: 18px;
  background:
    radial-gradient(circle at 98% 8%, rgba(103, 168, 216, 0.14), transparent 13rem),
    linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(247, 252, 246, 0.96));
  padding: 18px 20px;
  box-shadow: 0 12px 30px rgba(22, 38, 65, 0.06);
}

.section-kicker {
  display: block;
  margin-bottom: 4px;
  color: #3f7e36;
  font-size: 0.66rem;
  font-weight: 850;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.catalog-summary h2,
.table-header h3 {
  margin: 0;
  color: #162641;
  font-weight: 850;
  letter-spacing: 0;
}

.catalog-summary h2 {
  font-size: 1.2rem;
}

.catalog-summary p,
.table-header p {
  margin: 4px 0 0;
  color: #66728a;
  font-size: 0.82rem;
  font-weight: 520;
}

.summary-strip {
  display: grid;
  min-width: 330px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid #dfe6ef;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.82);
}

.summary-strip div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  border-right: 1px solid #edf2f7;
  padding: 12px 14px;
}

.summary-strip div:last-child {
  border-right: 0;
}

.summary-strip span {
  color: #66728a;
  font-size: 0.66rem;
  font-weight: 800;
  text-transform: uppercase;
}

.summary-strip strong {
  color: #162641;
  font-size: 1.12rem;
  line-height: 1;
}

.catalog-toolbar {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) auto auto;
  gap: 12px;
  align-items: center;
}

.search-box {
  display: flex;
  height: 38px;
  align-items: center;
  gap: 9px;
  border: 1px solid #dfe6ef;
  border-radius: 12px;
  background: #fff;
  padding: 0 12px;
  color: #66728a;
  box-shadow: 0 8px 20px rgba(22, 38, 65, 0.04);
}

.search-box input {
  min-width: 0;
  flex: 1;
  border: 0;
  color: #162641;
  font-size: 0.84rem;
  font-weight: 650;
  outline: none;
}

.filter-pills {
  display: inline-flex;
  height: 38px;
  overflow: hidden;
  border: 1px solid #dfe6ef;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(22, 38, 65, 0.04);
}

.filter-pills button {
  border: 0;
  border-right: 1px solid #edf2f7;
  background: transparent;
  color: #66728a;
  padding: 0 13px;
  font-size: 0.73rem;
  font-weight: 800;
  transition: background 160ms ease, color 160ms ease;
}

.filter-pills button:last-child {
  border-right: 0;
}

.filter-pills button.active {
  background: #eaf8e7;
  color: #2d6b31;
}

.table-wrapper {
  overflow: auto;
}

.table-header {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #edf2f7;
  padding: 14px 18px;
}

.table-header h3 {
  font-size: 0.98rem;
}

.icon-action {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid #dfe6ef;
  border-radius: 10px;
  background: #fff;
  color: #397fe8;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.icon-action:hover {
  border-color: rgba(57, 127, 232, 0.36);
  background: rgba(57, 127, 232, 0.07);
  transform: translateY(-1px);
}

@media (max-width: 980px) {
  .catalog-summary,
  .catalog-toolbar {
    grid-template-columns: 1fr;
  }

  .catalog-summary {
    flex-direction: column;
  }

  .summary-strip {
    min-width: 0;
  }

  .catalog-toolbar {
    display: grid;
  }
}
</style>
