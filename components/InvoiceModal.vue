<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-container large">
      <div class="modal-header">
        <h2 style="font-size: 1.25rem; font-weight: 700; color: var(--brand-campus);">Emisión de Factura Electrónica</h2>
      </div>
      <form @submit.prevent="submit">
        <div class="modal-content">
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">RFC Receptor</label>
              <input type="text" v-model="form.rfc" class="input-field" required placeholder="XAXX010101000" style="text-transform: uppercase;">
            </div>
            <div class="form-group">
              <label class="form-label">Razón Social</label>
              <input type="text" v-model="form.razonSocial" class="input-field" required>
            </div>
            <div class="form-group">
              <label class="form-label">Régimen Fiscal (Clave SAT)</label>
              <select v-model="form.regimenFiscal" class="input-field" required>
                <option value="601">601 - General de Ley Personas Morales</option>
                <option value="603">603 - Personas Morales con Fines no Lucrativos</option>
                <option value="605">605 - Sueldos y Salarios e Ingresos Asimilados</option>
                <option value="606">606 - Arrendamiento</option>
                <option value="612">612 - Personas Físicas con Actividades Empresariales</option>
                <option value="616">616 - Sin obligaciones fiscales</option>
                <option value="626">626 - Régimen Simplificado de Confianza (RESICO)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Uso de CFDI</label>
              <select v-model="form.usoCfdi" class="input-field" required>
                <option value="G03">G03 - Gastos en general</option>
                <option value="D10">D10 - Pagos por servicios educativos (colegiaturas)</option>
                <option value="S01">S01 - Sin efectos fiscales</option>
                <option value="CP01">CP01 - Pagos</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Código Postal</label>
              <input type="text" v-model="form.cp" class="input-field" required maxlength="5">
            </div>
            <div class="form-group">
              <label class="form-label">Correo de Recepción</label>
              <input type="email" v-model="form.correo" class="input-field" required>
            </div>
          </div>
          
          <div style="background: var(--bg-app); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--neutral-mist); margin-top: 1rem;">
            <p style="font-weight: 600; font-size: 0.875rem;">Total a Timbrar: <span style="color: var(--brand-campus); font-size: 1.125rem;">${{ total.toFixed(2) }}</span></p>
            <p style="font-size: 0.75rem; color: #5B665E;">Se registrará la petición de timbrado sobre los conceptos previamente pagados y seleccionados.</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="$emit('close')" type="button">Cerrar</button>
          <button class="btn btn-primary" type="submit" :disabled="loading">
            Guardar Factura y Emitir
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useToast } from '~/composables/useToast'

const props = defineProps({ debts: Array, student: Object })
const emit = defineEmits(['close', 'success'])
const { show } = useToast()

const total = computed(() => props.debts.reduce((s, d) => s + (d.pagos || 0), 0))
const foliosAsociados = computed(() => {
  const f = []
  props.debts.forEach(d => {
    if(d.historialPagos) d.historialPagos.forEach(h => f.push(h.folio))
  })
  return f
})

const loading = ref(false)
const form = ref({
  rfc: '', razonSocial: '', regimenFiscal: '616', usoCfdi: 'D10',
  cp: '', correo: props.student.correo || ''
})

const submit = async () => {
  if (total.value <= 0) {
    show('No existen abonos pagados para facturar los conceptos seleccionados.', 'danger')
    return
  }
  loading.value = true
  try {
    await $fetch('/api/invoices', {
      method: 'POST',
      body: {
        matricula: props.student.matricula,
        rfc: form.value.rfc.toUpperCase(),
        razonSocial: form.value.razonSocial,
        regimenFiscal: form.value.regimenFiscal,
        usoCfdi: form.value.usoCfdi,
        cp: form.value.cp,
        correo: form.value.correo,
        total: total.value,
        folios: foliosAsociados.value
      }
    })
    show('Factura registrada y solicitada correctamente al sistema fiscal')
    emit('success')
  } catch (e) {
    show('Excepción en la solicitud de facturación', 'danger')
  } finally {
    loading.value = false
  }
}
</script>