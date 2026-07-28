<template>
  <div class="receipt-batch-page min-h-screen bg-slate-50 px-5 py-6 font-sans text-neutral-ink print:bg-white print:p-0">
    <header class="batch-toolbar print:hidden">
      <button class="btn btn-ghost" type="button" @click="closeWindow">Volver</button>
      <div class="batch-toolbar-copy">
        <strong>Tiras de recibos</strong>
        <span v-if="receipts.length">{{ receipts.length }} recibo{{ receipts.length === 1 ? '' : 's' }} · Plantel {{ reportPlantel }} · {{ reportPeriod }}</span>
      </div>
      <button class="btn btn-primary" type="button" :disabled="loading || !!error || !receipts.length" @click="triggerPrint">
        <LucideFileDown :size="16" /> Guardar PDF
      </button>
    </header>

    <section v-if="loading" class="batch-state">
      <LucideLoader2 class="animate-spin" :size="22" />
      <strong>Preparando recibos...</strong>
    </section>

    <section v-else-if="error" class="batch-state batch-state--error">
      <strong>No se pudo generar el PDF</strong>
      <span>{{ error }}</span>
    </section>

    <section v-else-if="!receipts.length" class="batch-state">
      <strong>No hay movimientos en el periodo.</strong>
    </section>

    <main v-else class="receipt-strips-list">
      <div v-for="receipt in receipts" :key="receipt.folio" class="receipt-strip-item">
        <PaymentReceiptSheet
          :items="[receipt]"
          :receipt-data="receipt"
          :issued-at="generatedAt"
          :active-user-name="receipt.usuario || generatedBy"
          variant="strip"
        />
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { LucideFileDown, LucideLoader2 } from 'lucide-vue-next'

const route = useRoute()
const receipts = ref([])
const loading = ref(true)
const error = ref('')
const reportPlantel = ref('')
const reportFilters = ref({ inicio: '', fin: '' })
const generatedBy = ref('Administrador')
const generatedAt = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  dateStyle: 'short',
  timeStyle: 'short'
}).format(new Date())

const formatDateKey = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '')
}

const reportPeriod = computed(() => {
  const { inicio, fin } = reportFilters.value
  if (!inicio || !fin) return 'Hoy'
  if (inicio === fin) return formatDateKey(inicio)
  return `${formatDateKey(inicio)} al ${formatDateKey(fin)}`
})

const waitForImages = async () => {
  const images = Array.from(document.images)
  await Promise.all(images.map(image => image.complete
    ? Promise.resolve()
    : new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true })
        image.addEventListener('error', resolve, { once: true })
      })))
}

onMounted(async () => {
  try {
    const query = new URLSearchParams(route.query).toString()
    const response = await $fetch(`/api/reports/corte_receipts?${query}`)
    receipts.value = Array.isArray(response?.receipts) ? response.receipts : []
    reportPlantel.value = response?.filtros?.plantel || ''
    reportFilters.value = {
      inicio: response?.filtros?.inicio || '',
      fin: response?.filtros?.fin || ''
    }
    generatedBy.value = response?.generadoPor?.nombre || generatedBy.value

    const periodPart = reportFilters.value.inicio === reportFilters.value.fin
      ? reportFilters.value.inicio
      : `${reportFilters.value.inicio}_${reportFilters.value.fin}`
    document.title = `Recibos_Corte_${reportPlantel.value}_${periodPart || 'hoy'}`

    if (receipts.value.length) {
      await nextTick()
      await waitForImages()
      setTimeout(() => window.print(), 350)
    }
  } catch (requestError) {
    error.value = requestError?.data?.message || requestError?.message || 'No fue posible consultar los movimientos del periodo.'
  } finally {
    loading.value = false
  }
})

const closeWindow = () => window.close()
const triggerPrint = () => window.print()
</script>

<style scoped>
.batch-toolbar {
  position: sticky;
  top: 14px;
  z-index: 30;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  max-width: 850px;
  margin: 0 auto 18px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  padding: 10px 12px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(12px);
}

.batch-toolbar-copy {
  min-width: 0;
}

.batch-toolbar-copy strong,
.batch-toolbar-copy span {
  display: block;
}

.batch-toolbar-copy strong {
  color: #172033;
  font-size: 0.9rem;
}

.batch-toolbar-copy span {
  overflow: hidden;
  color: #64748b;
  font-size: 0.72rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-state {
  display: grid;
  justify-items: center;
  gap: 8px;
  max-width: 850px;
  margin: 80px auto 0;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
  padding: 42px 24px;
  color: #64748b;
  text-align: center;
}

.batch-state strong {
  color: #1e293b;
}

.batch-state--error {
  border-color: #fecaca;
  background: #fffafa;
}

.batch-state--error strong {
  color: #b42318;
}

.receipt-strips-list {
  display: grid;
  gap: 18px;
  max-width: 850px;
  margin: 0 auto;
}

@media print {
  @page {
    size: letter portrait;
    margin: 0.25in 0.32in;
  }

  .receipt-batch-page,
  .receipt-strips-list {
    display: block;
    width: auto;
    max-width: none;
    margin: 0;
  }

  .receipt-strip-item {
    min-height: 5.05in;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .receipt-strip-item:nth-child(2n) {
    break-after: page;
    page-break-after: always;
  }

  .receipt-strip-item:last-child {
    break-after: auto;
    page-break-after: auto;
  }
}

@media (max-width: 720px) {
  .batch-toolbar {
    grid-template-columns: 1fr auto;
  }

  .batch-toolbar-copy {
    grid-column: 1 / -1;
    grid-row: 1;
  }
}
</style>
