<template>
  <div class="max-w-[1400px] mx-auto">
    <div class="card p-6 mb-8 border-l-4 border-accent-coral bg-white shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
      <div>
        <h2 class="text-xl font-bold text-gray-800 tracking-tight">Deudores</h2>
        <p class="text-gray-500 text-sm mt-1">Gestión de alumnos con saldos vencidos y notificación masiva.</p>
      </div>
      <div class="flex gap-3 w-full md:w-auto">
        <button class="btn btn-outline flex-1 md:flex-none" @click="loadData" :disabled="loading">
          <LucideRefreshCw :size="18" :class="{'animate-spin': loading}"/> Actualizar
        </button>
        <button class="btn btn-primary flex-1 md:flex-none" :disabled="selectedDeudores.length === 0" @click="openMassEmailModal">
          <LucideMail :size="18"/> Enviar recordatorio ({{ selectedDeudores.length }})
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div class="form-group m-0"><label class="form-label">Buscar</label><input type="text" v-model="search" class="input-field shadow-sm" placeholder="Matrícula o nombre..."></div>
      <div class="form-group m-0 md:col-span-3 flex items-end">
        <div class="flex items-center gap-6 px-6 py-2.5 bg-gray-50 rounded-xl border border-gray-100 w-full h-[46px]">
          <div class="text-sm font-bold text-gray-500 uppercase tracking-wider">Total adeudado:</div>
          <div class="text-2xl font-black text-accent-coral font-mono">${{ totalCartera.toLocaleString('es-MX', {minimumFractionDigits:2}) }}</div>
        </div>
      </div>
    </div>

    <div class="card table-wrapper shadow-sm border border-gray-100 mb-10 h-[50vh] overflow-y-auto">
      <table class="w-full relative">
        <thead class="bg-gray-50/95 backdrop-blur-md sticky top-0 z-10 shadow-sm">
          <tr>
            <th class="w-12 text-center py-4"><input type="checkbox" @change="toggleAll" :checked="selectedDeudores.length === filteredDeudores.length && filteredDeudores.length > 0" class="w-4 h-4 text-brand-leaf border-gray-300 rounded focus:ring-brand-leaf cursor-pointer shadow-inner"></th>
            <th class="py-4 px-6">Matrícula</th>
            <th class="py-4 px-6">Alumno</th>
            <th class="py-4 px-6">Grado</th>
            <th class="py-4 px-6">Tutor</th>
            <th class="py-4 px-6 text-right">Saldo</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="6" class="text-center font-medium py-16 text-gray-500">Cargando...</td></tr>
          <tr v-else-if="!filteredDeudores.length"><td colspan="6" class="text-center py-16 text-gray-400">No hay alumnos con saldos vencidos bajo estos filtros.</td></tr>
          <tr v-else v-for="d in filteredDeudores" :key="d.matricula" 
              class="hover:bg-gray-50/80 transition-colors border-b border-gray-50 last:border-none cursor-context-menu"
              :class="{'bg-brand-leaf/5': selectedDeudores.includes(d)}"
              @contextmenu.prevent="showContextMenu($event, d)">
            <td class="text-center py-4"><input type="checkbox" :value="d" v-model="selectedDeudores" class="w-4 h-4 text-brand-leaf border-gray-300 rounded focus:ring-brand-leaf cursor-pointer"></td>
            <td class="font-mono text-[0.95rem] font-bold text-accent-sky py-4 px-6">{{ d.matricula }}</td>
            <td class="font-bold text-gray-800 py-4 px-6">{{ d.nombreCompleto }}</td>
            <td class="text-gray-600 font-medium py-4 px-6">{{ d.nivel }} - {{ d.grado }} {{ d.grupo }}</td>
            <td class="py-4 px-6">
              <div class="font-medium text-gray-800 truncate max-w-[200px]">{{ d.padre || 'No registrado' }}</div>
              <div class="text-[11px] font-bold text-brand-teal mt-0.5" v-if="d.correo">{{ d.correo }}</div>
              <div class="text-[11px] text-accent-coral mt-0.5 font-bold" v-else>Sin correo</div>
            </td>
            <td class="text-right font-bold text-accent-coral font-mono text-lg py-4 px-6">${{ Number(d.deudaVigente).toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Mass Email Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-container large w-[800px] max-w-[95vw]">
          <div class="modal-header bg-white">
            <h2 class="text-xl font-bold text-brand-campus flex items-center gap-3"><LucideMail :size="24"/> Enviar recordatorio de pago</h2>
          </div>
          <div class="modal-content bg-gray-50/50">
            <div class="mb-5 px-5 py-3 bg-blue-50 border border-blue-100 rounded-xl text-sm font-semibold text-blue-800 flex justify-between items-center">
              <span>Destinatarios: {{ selectedDeudores.length }}</span>
              <span class="text-accent-coral" v-if="selectedDeudores.some(d => !d.correo)">{{ selectedDeudores.filter(d => !d.correo).length }} alumnos no tienen correo.</span>
            </div>

            <div class="form-group mb-5">
              <label class="form-label">Asunto</label>
              <input type="text" v-model="emailForm.asunto" class="input-field font-bold" required>
            </div>

            <div class="form-group mb-2">
              <label class="form-label flex justify-between items-end">
                <span>Mensaje (Soporta HTML)</span>
                <div class="text-[10px] bg-white px-2 py-1 rounded border border-gray-200 text-gray-500 font-mono">
                  Variables: {{nombre_alumno}}, {{tutor}}, {{deuda}}, {{matricula}}
                </div>
              </label>
              <textarea v-model="emailForm.template" class="input-field min-h-[250px] font-mono text-[13px] leading-relaxed resize-y" required></textarea>
            </div>
          </div>
          <div class="modal-footer bg-white">
            <button class="btn btn-ghost" @click="showModal = false" :disabled="sending">Cancelar</button>
            <button class="btn btn-primary px-8" @click="executeBatch" :disabled="sending">
              <LucideSend :size="18" :class="{'animate-pulse': sending}"/> {{ sending ? 'Enviando...' : 'Enviar' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { LucideMail, LucideRefreshCw, LucideSend, LucideEye, LucideUserCheck } from 'lucide-vue-next'
import { useState } from '#app'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'

const state = useState('globalState')
const { show } = useToast()
const { openMenu } = useContextMenu()

const deudores = ref([])
const loading = ref(false)
const search = ref('')
const selectedDeudores = ref([])
const showModal = ref(false)
const sending = ref(false)

const emailForm = ref({
  asunto: 'Recordatorio de pago - IECS IEDIS',
  template: `<p>Estimado(a) <strong>{{tutor}}</strong>,</p>
<p>Esperando que se encuentre muy bien, nos dirigimos a usted por parte de la administración del Instituto.</p>
<p>Le recordamos que el alumno(a) <strong>{{nombre_alumno}}</strong> (Matrícula: {{matricula}}) presenta un saldo pendiente de <strong>\${{deuda}} MXN</strong>.</p>
<p>Le solicitamos atentamente regularizar este importe a la brevedad.</p>
<p>Si usted ya realizó el pago, haga caso omiso a este mensaje.</p>`
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

const loadData = async () => {
  loading.value = true
  selectedDeudores.value = []
  try {
    deudores.value = await $fetch('/api/deudores', { params: { ciclo: state.value.ciclo } })
  } catch (e) {
    show('Error al cargar alumnos deudores', 'danger')
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

const filteredDeudores = computed(() => {
  if (!search.value) return deudores.value
  const q = search.value.toLowerCase()
  return deudores.value.filter(d => 
    d.nombreCompleto.toLowerCase().includes(q) || d.matricula.toLowerCase().includes(q)
  )
})

const totalCartera = computed(() => filteredDeudores.value.reduce((sum, d) => sum + Number(d.deudaVigente), 0))

const toggleAll = (e) => {
  selectedDeudores.value = e.target.checked ? [...filteredDeudores.value] : []
}

const showContextMenu = (event, d) => {
  openMenu(event, [
    { label: `Saldo: $${Number(d.deudaVigente).toFixed(2)}`, disabled: true },
    { label: '-' },
    { label: 'Seleccionar para correo', icon: LucideUserCheck, action: () => { if (!selectedDeudores.value.includes(d)) selectedDeudores.value.push(d) } },
    { label: 'Ver alumno', icon: LucideEye, action: () => { window.location.href = `/?q=${d.matricula}` } }
  ])
}

const openMassEmailModal = () => {
  if (selectedDeudores.value.length === 0) return
  showModal.value = true
}

const executeBatch = async () => {
  sending.value = true
  try {
    const res = await $fetch('/api/reminders/batch', {
      method: 'POST',
      body: {
        asunto: emailForm.value.asunto,
        template: emailForm.value.template,
        destinatarios: selectedDeudores.value
      }
    })
    if (res.success) {
      show(`Enviados: ${res.results.sent}. Fallidos: ${res.results.failed}`)
      showModal.value = false
      selectedDeudores.value = []
    } else {
      show(res.message || 'Error al enviar correos', 'danger')
    }
  } catch (e) {
    show('Error de conexión', 'danger')
  } finally {
    sending.value = false
  }
}
</script>