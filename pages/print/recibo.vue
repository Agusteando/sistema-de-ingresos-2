<template>
  <div class="print-container">
    <div class="receipt">
      <div class="header">
        <div class="brand">
          <img src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp" alt="Logo" class="logo" />
          <div class="text">
            <h2>{{ institutoNombre }}</h2>
            <p>Comprobante de Pago</p>
          </div>
        </div>
        <div class="meta">
          <p><strong>Fecha:</strong> {{ fecha }}</p>
          <p><strong>Folios:</strong> {{ route.query.folios }}</p>
        </div>
      </div>
      
      <div class="student-info">
        <p><strong>Alumno:</strong> {{ receiptData.nombreCompleto }}</p>
        <p><strong>Matrícula:</strong> {{ receiptData.matricula }}</p>
        <p><strong>Nivel:</strong> {{ receiptData.nivel }} - {{ receiptData.grado }} {{ receiptData.grupo }}</p>
      </div>
      
      <table class="items-table">
        <thead>
          <tr>
            <th>Folio</th>
            <th>Concepto</th>
            <th>Forma de Pago</th>
            <th class="amount">Importe</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in items" :key="r.folio">
            <td>{{ r.folio }}</td>
            <td>{{ r.conceptoNombre }}</td>
            <td>{{ r.formaDePago }}</td>
            <td class="amount">${{ Number(r.monto).toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>

      <div class="total-section">
        <p><strong>Total Pagado:</strong> ${{ total.toFixed(2) }}</p>
      </div>

      <div class="footer">
        <p>Compartimos contigo la formación integral de tus hijos</p>
        <p>SISTEMA DE INGRESOS 2</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'

definePageMeta({ layout: false })

const route = useRoute()
const items = ref([])
const receiptData = ref({})
const fecha = dayjs().format('DD/MM/YYYY HH:mm')

onMounted(async () => {
  const folios = route.query.folios
  if (!folios) return
  
  try {
    const res = await $fetch(`/api/payments/receipt?folios=${folios}&raw=true`)
    if (res && res.length) {
      items.value = res
      receiptData.value = res[0]
      setTimeout(() => window.print(), 500)
    }
  } catch(e) {}
})

const total = computed(() => items.value.reduce((a,b) => a + Number(b.monto), 0))
const institutoNombre = computed(() => {
  return receiptData.value.nivel === 'Secundaria' 
    ? 'INSTITUTO EDUCATIVO PARA EL DESARROLLO INTEGRAL DEL SABER SC' 
    : 'INSTITUTO EDUCATIVO LA CASITA DEL SABER SC'
})
</script>

<style scoped>
.print-container { background: white; width: 100vw; min-height: 100vh; padding: 20px; font-family: 'Inter', sans-serif; color: black; }
.receipt { max-width: 800px; margin: 0 auto; }
.header { display: flex; justify-content: space-between; border-bottom: 2px solid black; padding-bottom: 20px; margin-bottom: 20px; }
.brand { display: flex; align-items: center; gap: 15px; }
.logo { height: 60px; filter: grayscale(100%); }
.text h2 { margin: 0; font-size: 16px; text-transform: uppercase; }
.text p { margin: 5px 0 0; font-size: 14px; }
.meta { text-align: right; font-size: 14px; }
.meta p { margin: 0 0 5px; }
.student-info { margin-bottom: 20px; font-size: 14px; }
.student-info p { margin: 0 0 5px; }
.items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
.items-table th, .items-table td { border: 1px solid black; padding: 8px; font-size: 14px; text-align: left; }
.items-table th { background: #f0f0f0; }
.amount { text-align: right !important; }
.total-section { text-align: right; font-size: 18px; margin-bottom: 40px; }
.footer { text-align: center; font-size: 12px; border-top: 1px solid black; padding-top: 20px; }
@media print {
  @page { margin: 0.5cm; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style>