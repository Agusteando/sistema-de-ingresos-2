<template>
  <Teleport to="body">
    <div class="modal-overlay overflow-y-auto p-4" @click.self="$emit('close')">
      <div class="modal-container large w-full max-w-4xl h-auto my-auto">
        <div class="modal-header rounded-t-xl sticky top-0 z-10">
          <h2 class="text-lg font-bold text-gray-800">Facturar CFDI</h2>
        </div>
        <div class="modal-content p-6 space-y-4">
          
          <div class="card p-5">
            <h3 class="text-xs font-bold text-brand-teal uppercase tracking-wide mb-4 border-b border-gray-100 pb-2">Receptor</h3>
            <div class="grid grid-cols-12 gap-4">
              <div class="col-span-12 md:col-span-8 form-group mb-0"><label class="form-label">Razón Social</label><input type="text" v-model="form.legal_name" class="input-field" required></div>
              <div class="col-span-12 md:col-span-4 form-group mb-0"><label class="form-label">RFC</label><input type="text" v-model="form.tax_id" class="input-field uppercase font-mono" required></div>
              <div class="col-span-12 md:col-span-6 form-group mb-0"><label class="form-label">Email</label><input type="email" v-model="form.email" class="input-field" required></div>
              <div class="col-span-12 md:col-span-2 form-group mb-0"><label class="form-label">C.P.</label><input type="text" v-model="form.zip" class="input-field font-mono" required></div>
              <div class="col-span-12 md:col-span-4 form-group mb-0"><label class="form-label">Régimen Fiscal</label>
                <select v-model="form.tax_system" class="input-field" required>
                  <option value="601">601 - Personas Morales</option>
                  <option value="603">603 - Fines no Lucrativos</option>
                  <option value="605">605 - Sueldos y Salarios</option>
                  <option value="612">612 - PF Act. Emp.</option>
                  <option value="616">616 - Sin obligaciones</option>
                  <option value="621">621 - RIF</option>
                  <option value="626">626 - RESICO</option>
                </select>
              </div>
              <div class="col-span-12 md:col-span-6 form-group mb-0"><label class="form-label">Uso de CFDI</label>
                <select v-model="form.use" class="input-field" required>
                  <option value="D10">D10 - Colegiaturas</option>
                  <option value="G03">G03 - Gastos en general</option>
                  <option value="S01">S01 - Sin efectos fiscales</option>
                </select>
              </div>
              <div class="col-span-12 md:col-span-6 form-group mb-0"><label class="form-label">Emisión</label><input type="datetime-local" v-model="form.invoiceDate" class="input-field font-mono text-gray-500 bg-gray-50" required></div>
            </div>
          </div>

          <div class="card p-5">
            <h3 class="text-xs font-bold text-accent-sky uppercase tracking-wide mb-4 border-b border-gray-100 pb-2">Parámetros</h3>
            <div class="grid grid-cols-12 gap-4">
              <div class="col-span-12 md:col-span-4 form-group mb-0"><label class="form-label">Emisor</label>
                <select v-model="form.facturaCon" class="input-field"><option value="IECS">IECS</option><option value="IEDIS">IEDIS</option></select>
              </div>
              <div class="col-span-12 md:col-span-4 form-group mb-0"><label class="form-label">Serie</label>
                <select v-model="form.series" class="input-field"><option value="">N/A</option><option value="PT">PT</option><option value="ST">ST</option></select>
              </div>
              <div class="col-span-12 md:col-span-4 form-group mb-0"><label class="form-label">Clave SAT</label><input type="text" v-model="form.productKeyGlobal" class="input-field font-mono"></div>
            </div>
          </div>

          <div class="card p-5">
            <h3 class="text-xs font-bold text-brand-campus uppercase tracking-wide mb-4 border-b border-gray-100 pb-2">Complemento IEDU</h3>
            <div class="grid grid-cols-12 gap-4">
              <div class="col-span-12 md:col-span-6 form-group mb-0"><label class="form-label">Alumno</label><input type="text" v-model="form.nombreCompleto" class="input-field"></div>
              <div class="col-span-12 md:col-span-6 form-group mb-0"><label class="form-label">CURP</label><input type="text" v-model="form.CURP" class="input-field uppercase font-mono"></div>
              <div class="col-span-12 md:col-span-6 form-group mb-0"><label class="form-label">Nivel</label>
                <select v-model="form.nivelEducativo" class="input-field">
                  <option value="Preescolar">Preescolar</option>
                  <option value="Primaria">Primaria</option>
                  <option value="Secundaria">Secundaria</option>
                </select>
              </div>
              <div class="col-span-12 md:col-span-6 form-group mb-0"><label class="form-label">RVOE</label><input type="text" v-model="form.autRVOE" class="input-field font-mono"></div>
            </div>
          </div>

          <div class="card p-5">
            <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
              <h3 class="text-xs font-bold text-gray-800 uppercase tracking-wide m-0">Desglose</h3>
              <button class="btn btn-ghost text-xs !py-1 !px-2" @click.prevent="conceptos.push({conceptoNombre: 'Concepto Extraordinario', monto: 0})">+ Fila</button>
            </div>
            <div class="space-y-2">
              <div v-for="(c, i) in conceptos" :key="i" class="flex gap-3 items-center">
                <input type="text" v-model="c.conceptoNombre" class="input-field flex-1" placeholder="Concepto">
                <input type="number" step="0.01" v-model="c.monto" class="input-field w-32 text-right font-mono font-semibold text-brand-campus" placeholder="Monto">
                <button class="btn btn-ghost text-accent-coral !px-2" @click.prevent="conceptos.splice(i, 1)"><LucideTrash2 :size="14"/></button>
              </div>
            </div>
            <div class="flex justify-end mt-4 pt-3 border-t border-gray-100">
              <div class="text-right">
                <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wide block">Total Factura</span>
                <span class="text-lg font-bold text-brand-campus font-mono">${{ conceptos.reduce((s, c) => s + Number(c.monto||0), 0).toFixed(2) }}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="modal-footer rounded-b-xl sticky bottom-0 z-10">
          <span class="text-xs text-gray-400 font-medium absolute left-6 top-5 hidden md:block"><LucideShieldCheck :size="14" class="inline mr-1"/> Conexión SAT</span>
          <button class="btn btn-ghost" @click="$emit('close')" type="button">Cancelar</button>
          <button class="btn btn-primary" @click="submit" :disabled="loading || conceptos.length === 0">Emitir CFDI</button>
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
const sanitizeNivel = (value) => {
  const allowed = ['Preescolar', 'Primaria', 'Secundaria']
  return allowed.includes(value) ? value : (allowed.includes(props.student.nivel) ? props.student.nivel : 'Preescolar')
}

const form = ref({
  legal_name: '', tax_id: '', email: props.student.correo || '', zip: '',
  tax_system: '616', use: 'D10', invoiceDate: new Date().toISOString().slice(0, 16),
  facturaCon: 'IECS', series: '', productKeyGlobal: '86121503',
  nombreCompleto: props.student.nombreCompleto || '', CURP: '', nivelEducativo: sanitizeNivel(props.student.nivel), autRVOE: ''
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
      form.value.nivelEducativo = sanitizeNivel(form.value.nivelEducativo)
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
      nivelEducativo: sanitizeNivel(form.value.nivelEducativo),
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
      show('Factura timbrada exitosamente.')
      const invoice_id = res.invoice_id || (res.factura && res.factura.id)
      if (invoice_id) {
        window.open(`/api/cfdi/downloadInvoice/${encodeURIComponent(invoice_id)}/pdf?matricula=${encodeURIComponent(props.student.matricula)}`, '_blank')
      }
      emit('success')
    } else {
      show(res.error || 'Error al timbrar', 'danger')
    }
  } catch (e) {
    show('Fallo de conexión SAT', 'danger')
  } finally {
    loading.value = false
  }
}
</script>
