<template>
  <div class="max-w-[1400px] mx-auto">
    <div class="card p-5 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div class="form-group m-0"><label class="form-label">Buscar</label><input type="text" v-model="filters.q" @keyup.enter="performSearch" placeholder="Nombre o folio..." class="input-field"></div>
        <div class="form-group m-0"><label class="form-label">RFC</label><input type="text" v-model="filters.tax_id" @keyup.enter="performSearch" placeholder="XAXX010101000" class="input-field uppercase"></div>
        <div class="form-group m-0"><label class="form-label">Serie</label><input type="text" v-model="filters.series" @keyup.enter="performSearch" placeholder="PT / ST" class="input-field uppercase"></div>
        <div class="form-group m-0"><label class="form-label">Estatus</label>
          <select v-model="filters.status" class="input-field" @change="performSearch">
            <option value="">Todas</option><option value="valid">Vigente</option><option value="canceled">Cancelada</option>
          </select>
        </div>
        <div class="form-group m-0"><label class="form-label">Cancelación SAT</label>
          <select v-model="filters.cancel_status" class="input-field" @change="performSearch">
            <option value="">Cualquiera</option><option value="none">Sin cancelar</option><option value="pending">Pendiente</option><option value="accepted">Aceptada</option><option value="rejected">Rechazada</option>
          </select>
        </div>
      </div>
      <div class="flex justify-end mt-4 pt-4 border-t border-gray-100 gap-3">
        <button class="btn btn-ghost" @click="resetFilters">Limpiar</button>
        <button class="btn btn-primary w-full md:w-auto px-6" @click="performSearch" :disabled="loading"><LucideSearch :size="16"/> Buscar</button>
      </div>
    </div>

    <div class="card table-wrapper mb-8">
      <table class="w-full">
        <thead>
          <tr>
            <th class="w-24 text-center">Folio</th>
            <th>Datos</th>
            <th>Receptor</th>
            <th class="text-center">Estatus</th>
            <th class="text-center w-28">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="5" class="text-center py-12 text-gray-500 font-medium">Buscando...</td></tr>
          <tr v-else-if="!invoices.length"><td colspan="5" class="text-center py-12 text-gray-500">No se encontraron facturas.</td></tr>
          <tr v-else v-for="inv in invoices" :key="inv.id" 
              class="cursor-context-menu"
              @contextmenu.prevent="showContextMenu($event, inv)">
            <td class="text-center">
              <div class="font-bold text-gray-800 text-sm tracking-tight">{{ inv.series || '' }}{{ inv.folio_number || '' }}</div>
              <div class="font-mono text-gray-400 text-[10px] mt-0.5">{{ inv.invoice_id || inv.id }}</div>
            </td>
            <td>
              <div class="font-semibold text-gray-800 text-sm">{{ new Date(inv.created_at).toLocaleString('es-MX') }}</div>
              <div class="text-gray-500 text-xs mt-0.5">Pago: <span class="font-semibold">{{ inv.payment_form }}</span></div>
            </td>
            <td>
              <div class="font-mono font-semibold text-gray-800 text-sm">{{ inv.customer_tax_id }}</div>
              <div class="text-xs text-gray-500 truncate max-w-[200px]" :title="inv.customer_name">{{ inv.customer_name }}</div>
            </td>
            <td class="text-center">
              <span :class="['badge block w-max mx-auto', inv.status === 'valid' && (!inv.cancel_status_label || inv.cancel_status_label.includes('none') || inv.cancel_status_label === '') ? 'badge-success' : 'badge-warning']">
                {{ inv.cancel_status_label || (inv.status === 'valid' ? 'Vigente' : 'Cancelada') }}
              </span>
            </td>
            <td class="text-center">
              <div class="flex gap-1 justify-center">
                <button class="btn btn-outline px-2 py-1 text-xs text-brand-teal" title="PDF" @click="downloadPdf(inv)"><LucideFileDown :size="14"/></button>
                <button class="btn btn-outline px-2 py-1 text-xs text-gray-500" title="XML" @click="downloadXml(inv)"><LucideFileText :size="14"/></button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      
      <div v-if="pages > 1" class="flex justify-between items-center p-3 bg-gray-50 border-t border-gray-200">
        <span class="text-xs text-gray-500 font-semibold">Mostrando {{ invoices.length }} de {{ total }}</span>
        <div class="flex gap-2">
          <button class="btn btn-ghost !px-3 py-1 text-xs" :disabled="filters.page <= 1" @click="filters.page--; performSearch()">Anterior</button>
          <span class="px-3 py-1 font-semibold text-xs text-gray-700 bg-white border border-gray-200 rounded-md shadow-sm">{{ filters.page }} / {{ pages }}</span>
          <button class="btn btn-ghost !px-3 py-1 text-xs" :disabled="filters.page >= pages" @click="filters.page++; performSearch()">Siguiente</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { LucideSearch, LucideFileDown, LucideFileText, LucideMail, LucideXCircle } from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { useContextMenu } from '~/composables/useContextMenu'

const { show } = useToast()
const { openMenu } = useContextMenu()

const invoices = ref([])
const loading = ref(false)
const total = ref(0)
const pages = ref(1)

const filters = ref({
  q: '', tax_id: '', series: '', status: '', cancel_status: '', page: 1, limit: 20
})

const performSearch = async () => {
  loading.value = true
  try {
    const res = await $fetch('/api/cfdi/invoices', { params: filters.value })
    invoices.value = res.invoices || []
    total.value = res.total || 0
    pages.value = res.pages || 1
  } catch (e) {
    show('Error al buscar facturas', 'danger')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  filters.value = { q: '', tax_id: '', series: '', status: '', cancel_status: '', page: 1, limit: 20 }
  performSearch()
}

onMounted(performSearch)

const downloadPdf = (inv) => window.open(`/api/cfdi/downloadInvoice/${encodeURIComponent(inv.invoice_id || inv.id)}/pdf?matricula=${encodeURIComponent(inv.matricula || '')}`, '_blank')
const downloadXml = (inv) => window.open(`/api/cfdi/downloadInvoice/${encodeURIComponent(inv.invoice_id || inv.id)}/xml?matricula=${encodeURIComponent(inv.matricula || '')}`, '_blank')

const showContextMenu = (event, inv) => {
  const isVigente = inv.status === 'valid' && (!inv.cancel_status_label || inv.cancel_status_label.includes('none') || inv.cancel_status_label === '')
  
  openMenu(event, [
    { label: 'Opciones', disabled: true },
    { label: '-' },
    { label: 'Descargar PDF', icon: LucideFileDown, action: () => downloadPdf(inv) },
    { label: 'Descargar XML', icon: LucideFileDown, action: () => downloadXml(inv) },
    { label: 'Reenviar por Email', icon: LucideMail, action: () => sendEmail(inv) },
    { label: 'Cancelar Factura', icon: LucideXCircle, class: 'text-accent-coral', disabled: !isVigente, action: () => cancelInvoice(inv) }
  ])
}

const cancelInvoice = async (inv) => {
  const motivo = prompt('Motivo de Cancelación SAT (01, 02, 03, 04):', '03')
  if (!motivo) return
  let substitution_folio
  if (motivo === '01') substitution_folio = prompt('UUID de la factura que sustituye:')
  
  try {
    await $fetch(`/api/cfdi/invoices/${encodeURIComponent(inv.invoice_id || inv.id)}/cancel`, {
      method: 'POST',
      body: { matricula: inv.matricula || '', motive: motivo, substitution_folio }
    })
    show('Solicitud de cancelación enviada.')
    performSearch()
  } catch (e) { show('Error al intentar cancelar', 'danger') }
}

const sendEmail = async (inv) => {
  const correo = prompt('Ingresa el correo para enviar la factura:', inv.customer_email || '')
  if (!correo) return
  
  try {
    await $fetch('/api/cfdi/sendInvoiceEmail', {
      method: 'POST',
      body: { invoice_id: inv.invoice_id || inv.id, email: correo, matricula: inv.matricula || '' }
    })
    show('Factura enviada por correo.')
  } catch (e) { show('Error al enviar el correo', 'danger') }
}
</script>