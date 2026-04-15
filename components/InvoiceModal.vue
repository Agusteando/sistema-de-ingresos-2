<template>
  <Teleport to="body">
    <div class="modal-overlay overflow-y-auto p-4" @click.self="$emit('close')">
      <div class="modal-container large w-full max-w-5xl h-auto my-auto shadow-2xl">
        <div class="modal-header bg-white sticky top-0 z-10 rounded-t-2xl">
          <h2 class="text-xl font-bold text-brand-campus tracking-tight">Facturar comprobante CFDI</h2>
        </div>
        <div class="modal-content bg-gray-50/50 p-8 space-y-6">
          
          <div class="card p-6 border border-gray-200 shadow-sm bg-white">
            <h3 class="text-[0.75rem] font-black text-brand-teal uppercase tracking-widest mb-5 border-b border-gray-100 pb-3 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-brand-teal"></span> Datos del Receptor</h3>
            <div class="grid grid-cols-12 gap-5">
              <div class="col-span-12 md:col-span-8 form-group m-0"><label class="form-label">Razón Social</label><input type="text" v-model="form.legal_name" class="input-field" required></div>
              <div class="col-span-12 md:col-span-4 form-group m-0"><label class="form-label">RFC</label><input type="text" v-model="form.tax_id" class="input-field uppercase font-mono font-bold" required></div>
              <div class="col-span-12 md:col-span-6 form-group m-0"><label class="form-label">Email de Envío</label><input type="email" v-model="form.email" class="input-field" required></div>
              <div class="col-span-12 md:col-span-2 form-group m-0"><label class="form-label">C.P.</label><input type="text" v-model="form.zip" class="input-field font-mono" required></div>
              <div class="col-span-12 md:col-span-4 form-group m-0"><label class="form-label">Régimen Fiscal</label>
                <select v-model="form.tax_system" class="input-field" required>
                  <option value="601">601 - General de Ley Personas Morales</option>
                  <option value="603">603 - Personas Morales con Fines no Lucrativos</option>
                  <option value="605">605 - Sueldos y Salarios</option>
                  <option value="612">612 - PF con Actividades Empresariales</option>
                  <option value="616">616 - Sin obligaciones fiscales</option>
                  <option value="621">621 - Incorporación Fiscal</option>
                  <option value="626">626 - RESICO</option>
                </select>
              </div>
              <div class="col-span-12 md:col-span-6 form-group m-0"><label class="form-label">Uso de CFDI</label>
                <select v-model="form.use" class="input-field" required>
                  <option value="D10">D10 - Pagos por servicios educativos (colegiaturas)</option>
                  <option value="G03">G03 - Gastos en general</option>
                  <option value="S01">S01 - Sin efectos fiscales</option>
                </select>
              </div>
              <div class="col-span-12 md:col-span-6 form-group m-0"><label class="form-label">Fecha de Emisión</label><input type="datetime-local" v-model="form.invoiceDate" class="input-field bg-gray-50 text-gray-500 font-mono" required></div>
            </div>
          </div>

          <div class="card p-6 border border-gray-200 shadow-sm bg-white">
            <h3 class="text-[0.75rem] font-black text-accent-sky uppercase tracking-widest mb-5 border-b border-gray-100 pb-3 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-accent-sky"></span> Parámetros</h3>
            <div class="grid grid-cols-12 gap-5">
              <div class="col-span-12 md:col-span-4 form-group m-0"><label class="form-label">Facturar por</label>
                <select v-model="form.facturaCon" class="input-field"><option value="IECS">IECS</option><option value="IEDIS">IEDIS</option></select>
              </div>
              <div class="col-span-12 md:col-span-4 form-group m-0"><label class="form-label">Serie</label>
                <select v-model="form.series" class="input-field"><option value="">N/A</option><option value="PT">PT</option><option value="ST">ST</option></select>
              </div>
              <div class="col-span-12 md:col-span-4 form-group m-0"><label class="form-label">Clave Producto SAT</label><input type="text" v-model="form.productKeyGlobal" class="input-field font-mono font-bold"></div>
            </div>
          </div>

          <div class="card p-6 border border-gray-200 shadow-sm bg-white">
            <h3 class="text-[0.75rem] font-black text-brand-campus uppercase tracking-widest mb-5 border-b border-gray-100 pb-3 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-brand-campus"></span> Complemento IEDU</h3>
            <div class="grid grid-cols-12 gap-5">
              <div class="col-span-12 md:col-span-6 form-group m-0"><label class="form-label">Nombre del alumno</label><input type="text" v-model="form.nombreCompleto" class="input-field"></div>
              <div class="col-span-12 md:col-span-6 form-group m-0"><label class="form-label">CURP</label><input type="text" v-model="form.CURP" class="input-field uppercase font-mono"></div>
              <div class="col-span-12 md:col-span-6 form-group m-0"><label class="form-label">Nivel</label>
                <select v-model="form.nivelEducativo" class="input-field">
                  <option value="Preescolar">Preescolar</option>
                  <option value="Primaria">Primaria</option>
                  <option value="Secundaria">Secundaria</option>
                  <option value="Bachillerato o su equivalente">Bachillerato o su equivalente</option>
                </select>
              </div>
              <div class="col-span-12 md:col-span-6 form-group m-0"><label class="form-label">RVOE</label><input type="text" v-model="form.autRVOE" class="input-field font-mono"></div>
            </div>
          </div>

          <div class="card p-6 border border-gray-200 shadow-sm bg-white">
            <div class="flex justify-between items-center mb-5 border-b border-gray-100 pb-3">
              <h3 class="text-[0.75rem] font-black text-gray-800 uppercase tracking-widest m-0 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-gray-800"></span> Desglose</h3>
              <button class="btn btn-outline text-xs py-1 px-3 shadow-none border-dashed hover:border-brand-campus hover:bg-brand-leaf/5" @click.prevent="conceptos.push({conceptoNombre: 'Concepto Extraordinario', monto: 0})">+ Agregar línea</button>
            </div>
            <div class="space-y-3">
              <div v-for="(c, i) in conceptos" :key="i" class="flex flex-col md:flex-row gap-3 items-end">
                <div class="form-group m-0 w-full"><label class="form-label" v-if="i===0">Descripción</label><input type="text" v-model="c.conceptoNombre" class="input-field shadow-none bg-gray-50/50"></div>
                <div class="form-group m-0 w-full md:w-40 shrink-0"><label class="form-label" v-if="i===0">Monto</label><input type="number" step="0.01" v-model="c.monto" class="input-field text-right font-mono font-bold text-brand-campus shadow-none bg-brand-leaf/5 border-brand-leaf/20"></div>
                <button class="btn btn-ghost text-accent-coral hover:bg-accent-coral/10 px-3 py-2.5 shrink-0" @click.prevent="conceptos.splice(i, 1)"><LucideTrash2 :size="18"/></button>
              </div>
            </div>
            <div class="flex justify-end mt-4 pt-4 border-t border-gray-100">
              <div class="text-right">
                <span class="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Total a facturar</span>
                <span class="text-2xl font-black text-brand-campus font-mono">${{ conceptos.reduce((s, c) => s + Number(c.monto||0), 0).toFixed(2) }}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="modal-footer bg-white rounded-b-2xl sticky bottom-0 z-10 border-t border-gray-100 flex justify-between items-center px-8">
          <span class="text-xs text-gray-400 font-medium hidden md:inline-block"><LucideShieldCheck :size="14" class="inline-block mr-1 mb-[2px]"/> Conexión SAT activa</span>
          <div class="flex gap-3 w-full md:w-auto">
            <button class="btn btn-ghost w-full md:w-auto" @click="$emit('close')" type="button">Cancelar</button>
            <button class="btn btn-primary px-8 shadow-lg hover:shadow-xl w-full md:w-auto" @click="submit" :disabled="loading || conceptos.length === 0">Facturar</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { LucideTrash2, LucideShieldCheck } from 'lucide-vue-next'
import { useToast } from '~/composables/useToast'
import { useScrollLock } from '~/composables/useScrollLock'

const props = defineProps({ debts: Array, student: Object })
const emit = defineEmits(['close', 'success'])
const { show } = useToast()

useScrollLock()

const loading = ref(false)
const form = ref({
  legal_name: '', tax_id: '', email: props.student.correo || '', zip: '',
  tax_system: '616', use: 'D10', invoiceDate: new Date().toISOString().slice(0, 16),
  facturaCon: 'IECS', series: '', productKeyGlobal: '86121503',
  nombreCompleto: props.student.nombreCompleto || '', CURP: '', nivelEducativo: props.student.nivel || 'Primaria', autRVOE: ''
})

const conceptos = ref([])

onMounted(async () => {
  conceptos.value = props.debts.map(d => ({
    conceptoNombre: d.conceptoNombre,
    monto: d.pagos,
    folio_plantel: d.documento
  }))

  try {
    const res = await $fetch('/api/cfdi/getCompanyData', { params: { matricula: props.student.matricula } })
    if (res && res.data) {
      Object.assign(form.value, res.data)
      form.value.invoiceDate = new Date().toISOString().slice(0, 16)
    }
  } catch(e) {}
})

const submit = async () => {
  loading.value = true
  
  const payload = {
    companyData: {
      legal_name: form.value.legal_name,
      tax_id: form.value.tax_id.toUpperCase(),
      email: form.value.email,
      tax_system: form.value.tax_system,
      zip: form.value.zip,
      nombreCompleto: form.value.nombreCompleto,
      CURP: form.value.CURP.toUpperCase(),
      nivelEducativo: form.value.nivelEducativo,
      autRVOE: form.value.autRVOE
    },
    invoiceData: {
      customer: { 
        matricula: props.student.matricula, 
        legal_name: form.value.legal_name, 
        tax_id: form.value.tax_id.toUpperCase(), 
        email: form.value.email, 
        tax_system: form.value.tax_system, 
        address: { zip: form.value.zip } 
      },
      items: conceptos.value.map(c => ({
        quantity: 1,
        product: {
          description: c.conceptoNombre,
          product_key: form.value.productKeyGlobal,
          unit_key: 'E48',
          price: parseFloat(c.monto),
          tax_included: true,
          taxability: '02',
          taxes: [{ type: 'IVA', rate: 0, factor: 'Exento' }]
        },
        complement: `<iedu:instEducativas xmlns:iedu="http://www.sat.gob.mx/iedu" version="1.0" nombreAlumno="${c.nombreAlumno || form.value.nombreCompleto}" CURP="${form.value.CURP}" nivelEducativo="${form.value.nivelEducativo}" autRVOE="${form.value.autRVOE}" />`
      })),
      use: form.value.use,
      payment_form: '01',
      type: 'I',
      payment_method: 'PUE',
      currency: 'MXN',
      exchange: 1,
      date: new Date(form.value.invoiceDate).toISOString(),
      ...(form.value.series ? { series: form.value.series } : {}),
      facturaCon: form.value.facturaCon,
      test_mode: false
    }
  }

  try {
    const res = await $fetch('/api/cfdi/saveCompanyAndGenerate', { method: 'POST', body: payload })
    if (res.success) {
      show('Factura generada y validada correctamente en el SAT.')
      
      const invoice_id = res.invoice_id || (res.factura && res.factura.id)
      if (invoice_id) {
        window.open(`/api/cfdi/downloadInvoice/${encodeURIComponent(invoice_id)}/pdf?matricula=${encodeURIComponent(props.student.matricula)}`, '_blank')
      }
      
      emit('success')
    } else {
      show(res.error || 'Error al autorizar la factura', 'danger')
    }
  } catch (e) {
    show('Error de conexión con el proveedor CFDI', 'danger')
  } finally {
    loading.value = false
  }
}
</script>