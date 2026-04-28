<template>
  <div class="max-w-[1400px] mx-auto">
    <div class="card p-5 mb-6 border-l-4 border-accent-coral flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h2 class="text-lg font-bold text-gray-800 tracking-tight">Deudores</h2>
        <p class="text-gray-500 text-sm mt-0.5">Gestion de deudores global por concepto con flujo mensual, evidencias y notificacion.</p>
      </div>
      <div class="flex gap-3 w-full md:w-auto flex-wrap">
        <button class="btn btn-outline flex-1 md:flex-none" @click="loadData" :disabled="loading">
          <LucideRefreshCw :size="16" :class="{ 'animate-spin': loading }" /> Actualizar
        </button>
        <button class="btn btn-secondary flex-1 md:flex-none" @click="exportData" :disabled="loading || filteredDeudores.length === 0">
          <LucideDownload :size="16" /> Exportar CSV
        </button>
        <button class="btn btn-primary flex-1 md:flex-none w-full" :disabled="selectedDeudores.length === 0" @click="openMassEmailModal">
          <LucideMail :size="16" /> Enviar recordatorio ({{ selectedDeudores.length }})
        </button>
      </div>
    </div>

    <WhatsappOnboarding class="mb-6" />

    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="form-group m-0">
        <label class="form-label">Buscar</label>
        <input type="text" v-model="search" class="input-field" placeholder="Matricula o nombre...">
      </div>
      <div class="form-group m-0">
        <label class="form-label">Estatus</label>
        <select v-model="estatusFiltro" class="input-field">
          <option value="deudores">Solo deudores</option>
          <option value="todos">Todos</option>
          <option value="no_deudores">No deudores</option>
        </select>
      </div>
      <div class="form-group m-0 md:col-span-2 flex items-end">
        <div class="flex items-center gap-4 px-5 h-[36px] bg-gray-50 rounded-lg border border-gray-200 w-full">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total pendiente:</div>
          <div class="text-lg font-bold text-accent-coral font-mono">${{ totalCartera.toLocaleString('es-MX', { minimumFractionDigits: 2 }) }}</div>
        </div>
      </div>
    </div>

    <div class="card table-wrapper mb-8 max-h-[55vh] overflow-y-auto">
      <table class="w-full relative">
        <thead class="sticky top-0 z-10">
          <tr>
            <th class="w-12 text-center"><input type="checkbox" @change="toggleAll" :checked="selectedDeudores.length === filteredDeudores.length && filteredDeudores.length > 0" class="w-4 h-4 text-brand-leaf border-gray-300 rounded focus:ring-brand-leaf cursor-pointer"></th>
            <th>Matricula</th>
            <th>Alumno</th>
            <th>Grado</th>
            <th>Tutor</th>
            <th>Estatus</th>
            <th>Accion hoy</th>
            <th class="text-right">Saldo</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="8" class="text-center font-medium py-12 text-gray-500">Cargando...</td></tr>
          <tr v-else-if="!filteredDeudores.length"><td colspan="8" class="text-center py-12 text-gray-400">No hay alumnos con saldos vencidos bajo estos filtros.</td></tr>
          <tr v-else v-for="d in filteredDeudores" :key="`${d.matricula}-${d.mes}`"
              class="cursor-context-menu"
              :class="{ selected: selectedDeudores.includes(d) }"
              @contextmenu.prevent="showContextMenu($event, d)">
            <td class="text-center"><input type="checkbox" :value="d" v-model="selectedDeudores" class="w-4 h-4 text-brand-leaf border-gray-300 rounded focus:ring-brand-leaf cursor-pointer"></td>
            <td class="font-mono text-xs font-semibold text-accent-sky">{{ d.matricula }}</td>
            <td class="font-bold text-gray-800">{{ d.nombreCompleto }}</td>
            <td class="text-gray-600 font-medium">{{ d.nivel }} - {{ d.grado }} {{ d.grupo }}</td>
            <td>
              <div class="text-gray-800 truncate max-w-[200px]">{{ d.padre || 'No registrado' }}</div>
              <div class="text-[11px] font-semibold text-brand-teal mt-0.5" v-if="d.correo">{{ d.correo }}</div>
              <div class="text-[11px] text-accent-coral mt-0.5 font-semibold" v-else>Sin correo</div>
            </td>
            <td><span class="text-[11px] font-semibold uppercase" :class="d.isDeudor ? 'text-accent-coral' : 'text-brand-teal'">{{ d.estatusFlujo }}</span></td>
            <td class="text-[11px] text-gray-600">{{ d.accionHoy || '-' }}</td>
            <td class="text-right font-bold text-accent-coral font-mono text-sm">${{ saldoValue(d).toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-container">
          <div class="modal-header">
            <h2 class="text-lg font-bold text-gray-800 flex items-center gap-2"><LucideMail :size="20" /> Enviar recordatorio</h2>
          </div>
          <div class="modal-content">
            <div class="mb-4 px-4 py-2 bg-blue-50 border border-blue-100 rounded-lg text-sm font-medium text-blue-800 flex justify-between items-center">
              <span>Destinatarios: {{ selectedDeudores.length }}</span>
              <span class="text-accent-coral text-xs" v-if="selectedDeudores.some(d => !d.correo)">{{ selectedDeudores.filter(d => !d.correo).length }} sin correo.</span>
            </div>

            <div class="form-group mb-4">
              <label class="form-label">Asunto</label>
              <input type="text" v-model="emailForm.asunto" class="input-field font-semibold" required>
            </div>

            <div class="form-group mb-0">
              <label class="form-label flex justify-between items-end">
                <span>Mensaje (Soporta HTML)</span>
                <span class="text-[10px] text-gray-500 font-mono font-normal" v-pre>Variables: {{nombre_alumno}}, {{tutor}}, {{deuda}}, {{desglose}}, {{matricula}}</span>
              </label>
              <textarea v-model="emailForm.template" class="input-field min-h-[200px] font-mono text-xs leading-relaxed resize-y py-3" required></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" @click="showModal = false" :disabled="sending">Cancelar</button>
            <button class="btn btn-primary px-6" @click="executeBatch" :disabled="sending">
              <LucideSend :size="16" :class="{ 'animate-pulse': sending }" /> {{ sending ? 'Enviando...' : 'Enviar' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { LucideMail, LucideRefreshCw, LucideSend, LucideEye, LucideUserCheck, LucideDownload } from 'lucide-vue-next'
import { useState } from '#app'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'
import { exportToCSV } from '~/utils/export'
import { normalizeCicloKey } from '~/shared/utils/ciclo'
import WhatsappOnboarding from '~/components/WhatsappOnboarding.vue'

const state = useState('globalState')
const { show } = useToast()
const { openMenu } = useContextMenu()

const deudores = ref([])
const estatusFiltro = ref('deudores')
const loading = ref(false)
const search = ref('')
const selectedDeudores = ref([])
const showModal = ref(false)
const sending = ref(false)

const emailForm = ref({
  asunto: 'Recordatorio de pago - Estado de Cuenta Institucional',
  template: `<p>Estimado(a) <strong>{{tutor}}</strong>,</p>
<p>Esperando que se encuentre muy bien, nos dirigimos a usted por parte de la administracion del Instituto.</p>
<p>Le recordamos amablemente que el alumno(a) <strong>{{nombre_alumno}}</strong> (Matricula: {{matricula}}) presenta un saldo pendiente en su estado de cuenta por un total de <strong>\${{deuda}} MXN</strong>.</p>
<p>{{desglose}}</p>
<p>Le solicitamos atentamente regularizar este importe a la brevedad para evitar inconvenientes administrativos.</p>
<p>Si usted ya realizo el pago en las ultimas 24 horas, le pedimos hacer caso omiso a este mensaje automatico.</p>`
})

watch(showModal, (val) => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = val ? 'hidden' : ''
  }
})

onUnmounted(() => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
  }
})

const saldoValue = (d) => Number(d?.saldoPendiente ?? d?.saldoColegiatura ?? 0)

const loadData = async () => {
  loading.value = true
  selectedDeudores.value = []
  try {
    deudores.value = await $fetch('/api/deudores', { params: { ciclo: normalizeCicloKey(state.value.ciclo), estatus: estatusFiltro.value } })
  } catch (e) {
    show('Error al cargar alumnos deudores', 'danger')
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
watch(() => normalizeCicloKey(state.value.ciclo), loadData)
watch(estatusFiltro, loadData)

const filteredDeudores = computed(() => {
  if (!search.value) return deudores.value
  const q = search.value.toLowerCase()
  return deudores.value.filter(d =>
    String(d.nombreCompleto || '').toLowerCase().includes(q) || String(d.matricula || '').toLowerCase().includes(q)
  )
})

const totalCartera = computed(() => filteredDeudores.value.reduce((sum, d) => sum + saldoValue(d), 0))

const toggleAll = (e) => {
  selectedDeudores.value = e.target.checked ? [...filteredDeudores.value] : []
}

const showContextMenu = (event, d) => {
  openMenu(event, [
    { label: `Saldo pendiente: $${saldoValue(d).toFixed(2)}`, disabled: true },
    { label: '-' },
    { label: 'Seleccionar para correo', icon: LucideUserCheck, action: () => { if (!selectedDeudores.value.includes(d)) selectedDeudores.value.push(d) } },
    { label: 'Ver detalles de alumno', icon: LucideEye, action: () => { window.location.href = `/?q=${d.matricula}` } }
  ])
}

const exportData = async () => {
  loading.value = true
  try {
    const rows = await $fetch('/api/deudores', {
      params: {
        ciclo: normalizeCicloKey(state.value.ciclo),
        estatus: estatusFiltro.value,
        detalles: '1'
      }
    })
    const q = search.value.toLowerCase()
    const rowsForExport = q
      ? rows.filter(d => String(d.nombreCompleto || '').toLowerCase().includes(q) || String(d.matricula || '').toLowerCase().includes(q))
      : rows
    const exportList = rowsForExport.map(d => ({
      Matricula: d.matricula,
      Nombre: d.nombreCompleto,
      Grado: `${d.nivel} - ${d.grado} ${d.grupo}`,
      Tutor: d.padre || 'No registrado',
      Correo: d.correo || 'Sin correo',
      Telefono: d.telefono || '',
      Saldo_Pendiente_MXN: saldoValue(d).toFixed(2),
      Conceptos_Adeudados: (d.desglose || [])
        .filter(item => Number(item.saldo || 0) > 0)
        .map(item => `${item.conceptoNombre} ${item.mesLabel || ''}`.trim())
        .join(' | '),
      Estatus_Flujo: d.estatusFlujo,
      Accion_Hoy: d.accionHoy || ''
    }))
    exportToCSV(`Deudores_${normalizeCicloKey(state.value.ciclo)}.csv`, exportList)
  } catch (e) {
    show('Error al exportar reporte de deudores', 'danger')
  } finally {
    loading.value = false
  }
}

const openMassEmailModal = () => {
  if (selectedDeudores.value.length === 0) return
  showModal.value = true
}

const executeBatch = async () => {
  sending.value = true
  try {
    let sent = 0
    let failed = 0
    for (const dest of selectedDeudores.value) {
      try {
        await $fetch('/api/deudores/actions', {
          method: 'POST',
          body: {
            matricula: dest.matricula,
            ciclo: normalizeCicloKey(state.value.ciclo),
            mes: dest.mes,
            accion: 'correo_recordatorio'
          }
        })
        sent++
      } catch (e) {
        failed++
      }
    }
    show(`Reporte de envio: ${sent} exitosos, ${failed} fallidos.`)
    showModal.value = false
    selectedDeudores.value = []
    await loadData()
  } catch (e) {
    show('Error de red al establecer comunicacion.', 'danger')
  } finally {
    sending.value = false
  }
}
</script>
