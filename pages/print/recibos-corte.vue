<template>
  <div class="receipt-batch-page min-h-screen bg-slate-50 px-5 py-6 font-sans text-neutral-ink print:bg-white print:p-0">
    <header class="batch-toolbar" aria-label="Acciones de impresión">
      <button class="btn btn-ghost" type="button" @click="closeWindow">Volver</button>
      <div class="batch-toolbar-copy">
        <strong>Tiras de recibos</strong>
        <span v-if="receipts.length">{{ receipts.length }} recibo{{ receipts.length === 1 ? '' : 's' }} · Plantel {{ reportPlantel }} · {{ reportPeriod }}</span>
      </div>
      <button class="btn btn-primary" type="button" :disabled="loading || !!error || !receipts.length || preparingPrint" @click="triggerPrint">
        <LucideLoader2 v-if="preparingPrint" class="animate-spin" :size="16" />
        <LucideFileDown v-else :size="16" />
        Guardar PDF
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

    <main v-else ref="receiptListRef" class="receipt-strips-list" :data-receipt-count="receipts.length">
      <section
        v-for="(page, pageIndex) in receiptPages"
        :key="`page-${pageIndex}`"
        class="receipt-print-page"
        :data-page="pageIndex + 1"
      >
        <div
          v-for="(receipt, receiptIndex) in page"
          :key="receiptRenderKey(receipt, pageIndex, receiptIndex)"
          class="receipt-strip-item"
          :data-corte-folio="receipt.folio"
        >
          <CorteReceiptStrip
            :items="[receipt]"
            :receipt-data="receipt"
            :issued-at="generatedAt"
            :active-user-name="receipt.usuario || generatedBy"
            variant="strip"
            folio-mode="corte"
          />
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { LucideFileDown, LucideLoader2 } from 'lucide-vue-next'

definePageMeta({ layout: false })

const route = useRoute()
const receiptListRef = ref(null)
const receipts = ref([])
const loading = ref(true)
const preparingPrint = ref(false)
const error = ref('')
const reportPlantel = ref('')
const reportFilters = ref({ inicio: '', fin: '' })
const generatedBy = ref('Administrador')
const generatedAt = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  dateStyle: 'short',
  timeStyle: 'short'
}).format(new Date())

const receiptPages = computed(() => {
  const pages = []
  for (let index = 0; index < receipts.value.length; index += 2) {
    pages.push(receipts.value.slice(index, index + 2))
  }
  return pages
})

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

const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve))

const waitForRenderedReceipts = async (expectedCount) => {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const renderedCount = receiptListRef.value?.querySelectorAll('.receipt-strip-item').length || 0
    if (renderedCount === expectedCount) return
    await nextFrame()
  }

  const renderedCount = receiptListRef.value?.querySelectorAll('.receipt-strip-item').length || 0
  throw new Error(`La vista preparó ${renderedCount} de ${expectedCount} recibos.`)
}

const waitForImages = async () => {
  const images = Array.from(receiptListRef.value?.querySelectorAll('img') || [])
  await Promise.all(images.map(image => image.complete
    ? Promise.resolve()
    : new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true })
        image.addEventListener('error', resolve, { once: true })
      })))
}

const preparePrintDocument = async () => {
  if (!receipts.value.length) return

  preparingPrint.value = true
  try {
    await nextTick()
    await waitForRenderedReceipts(receipts.value.length)
    await waitForImages()
    if (document.fonts?.ready) await document.fonts.ready
    await nextFrame()
    await nextFrame()
  } finally {
    preparingPrint.value = false
  }
}

const triggerPrint = async () => {
  try {
    await preparePrintDocument()
    window.print()
  } catch (printError) {
    error.value = printError?.message || 'No fue posible preparar todos los recibos para impresión.'
  }
}

onMounted(async () => {
  try {
    const query = new URLSearchParams(route.query).toString()
    const response = await $fetch(`/api/reports/corte_receipts?${query}`)
    const loadedReceipts = Array.isArray(response?.receipts) ? response.receipts : []
    const sourceFolios = Array.isArray(response?.sourceFolios)
      ? response.sourceFolios.map(folio => Number(folio))
      : loadedReceipts.map(receipt => Number(receipt?.folio))
    const receiptFolios = loadedReceipts.map(receipt => Number(receipt?.folio))
    const expectedCount = Number(response?.sourceCount ?? sourceFolios.length)
    const foliosMatch = sourceFolios.length === receiptFolios.length
      && sourceFolios.every((folio, index) => folio === receiptFolios[index])

    if (expectedCount !== loadedReceipts.length || !foliosMatch) {
      throw new Error(`El corte contiene ${expectedCount} folios, pero la serie de recibos no coincide completamente.`)
    }

    receipts.value = loadedReceipts
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
    loading.value = false

    if (receipts.value.length) {
      await preparePrintDocument()
      window.print()
    }
  } catch (requestError) {
    error.value = requestError?.data?.message || requestError?.message || 'No fue posible consultar los movimientos del periodo.'
    loading.value = false
  }
})

const receiptRenderKey = (receipt, pageIndex, receiptIndex) => [
  receipt.receiptId,
  receipt.folio,
  receipt.documento,
  receipt.fechaRegistro,
  pageIndex,
  receiptIndex
].filter(value => value !== null && value !== undefined && value !== '').join('-')

const closeWindow = () => {
  if (window.opener) window.close()
  else window.history.back()
}
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

.receipt-print-page {
  display: grid;
  gap: 18px;
}

@media print {
  @page {
    size: letter portrait;
    margin: 0.22in 0.3in;
  }

  :global(html),
  :global(body),
  :global(#__nuxt) {
    width: auto !important;
    min-width: 0 !important;
    height: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    background: #fff !important;
  }

  :global(body) {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .batch-toolbar,
  .batch-state {
    display: none !important;
  }

  .receipt-batch-page,
  .receipt-strips-list {
    display: block !important;
    width: auto !important;
    max-width: none !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    background: #fff !important;
  }

  .receipt-print-page {
    display: grid !important;
    grid-template-rows: repeat(2, minmax(0, auto));
    gap: 0.08in;
    width: 100%;
    min-height: 10.4in;
    break-after: page;
    page-break-after: always;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .receipt-print-page:last-child {
    break-after: auto;
    page-break-after: auto;
  }

  .receipt-strip-item {
    width: 100%;
    min-height: 5.12in;
    break-inside: avoid;
    page-break-inside: avoid;
    overflow: visible;
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
