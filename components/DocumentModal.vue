<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-container document-modal-container">
        <div class="modal-header document-modal-header">
          <div>
            <p class="document-eyebrow">Documento</p>
            <h2 class="text-lg font-bold text-gray-800">Agregar documento</h2>
          </div>
          <button class="document-close-button" type="button" aria-label="Cerrar" @click="$emit('close')">
            <LucideX :size="18" />
          </button>
        </div>
        <div class="modal-content document-modal-content">
          <form @submit.prevent="submit" class="grid grid-cols-2 gap-4">
            <div class="form-group col-span-2 mb-0">
              <div class="concept-label-row">
                <label class="form-label">Concepto</label>
                <button
                  class="concept-refresh-button"
                  type="button"
                  :disabled="loadingConcepts || loading"
                  title="Volver a consultar conceptos del ciclo activo"
                  @click="refreshConcepts"
                >
                  <LucideRefreshCcw :class="{ 'animate-spin': loadingConcepts }" :size="13" />
                  Actualizar
                </button>
              </div>

              <div class="concept-combobox" :class="{ 'is-open': conceptDropdownOpen }">
                <div class="concept-search-shell">
                  <LucideSearch class="concept-search-icon" :size="15" />
                  <input
                    v-model="conceptSearch"
                    class="concept-search-input"
                    type="search"
                    autocomplete="off"
                    placeholder="Buscar por concepto, ID, descripción o plantel..."
                    :disabled="loadingConcepts || loading"
                    @focus="conceptDropdownOpen = true"
                    @input="conceptDropdownOpen = true"
                    @keydown.down.prevent="focusFirstConceptOption"
                    @keydown.esc.prevent="conceptDropdownOpen = false"
                    @blur="deferCloseDropdown"
                  >
                  <button
                    v-if="selectedDocumentoId || conceptSearch"
                    class="concept-clear-button"
                    type="button"
                    title="Limpiar concepto"
                    :disabled="loadingConcepts || loading"
                    @mousedown.prevent
                    @click="clearConceptSelection"
                  >
                    <LucideX :size="14" />
                  </button>
                </div>

                <div v-if="selectedConcept" class="concept-selected-pill">
                  <LucideCheckCircle :size="13" />
                  <span>{{ selectedConcept.concepto }}</span>
                  <strong>${{ formatMoney(selectedConcept.costo) }}</strong>
                </div>
                <div v-if="selectedConceptServicio" class="concept-service-pill">
                  <img :src="selectedConceptServicio.imagen" alt="" loading="lazy" />
                  <span>{{ selectedConceptServicio.nombre }}</span>
                </div>

                <div
                  v-if="conceptDropdownOpen"
                  class="concept-dropdown"
                  role="listbox"
                  aria-label="Conceptos disponibles"
                >
                  <div v-if="loadingConcepts" class="concept-dropdown-state">
                    <LucideLoader2 class="animate-spin" :size="15" />
                    Cargando conceptos...
                  </div>
                  <div v-else-if="conceptLoadError" class="concept-dropdown-state concept-dropdown-state--error">
                    {{ conceptLoadError }}
                  </div>
                  <div v-else-if="!filteredConceptos.length" class="concept-dropdown-state">
                    No hay conceptos que coincidan con la búsqueda.
                  </div>
                  <template v-else>
                    <button
                      v-for="(c, index) in visibleConceptos"
                      :key="c.id"
                      :ref="index === 0 ? setFirstConceptOptionRef : undefined"
                      class="concept-option"
                      type="button"
                      role="option"
                      :aria-selected="String(c.id) === String(selectedDocumentoId)"
                      @mousedown.prevent
                      @click="selectConcept(c)"
                    >
                      <span class="concept-option-main">
                        <strong>{{ c.concepto }}</strong>
                        <small>
                          ID {{ c.id }}<template v-if="c.description"> · {{ c.description }}</template>
                        </small>
                      </span>
                      <span class="concept-option-meta">
                        <b>${{ formatMoney(c.costo) }}</b>
                        <em>{{ conceptMeta(c) }}</em>
                      </span>
                    </button>
                    <div v-if="filteredConceptos.length > visibleConceptos.length" class="concept-dropdown-hint">
                      Mostrando {{ visibleConceptos.length }} de {{ filteredConceptos.length }} resultados. Refina la búsqueda para ver menos opciones.
                    </div>
                  </template>
                </div>
              </div>

              <p class="concept-source-note">
                Fuente: tabla <code>conceptos</code> del bridge del plantel activo, filtrada por ciclo {{ activeCicloLabel }}. “Actualizar” vuelve a consultar esa fuente.
              </p>
            </div>

            <div class="form-group mb-0">
              <label class="form-label">Costo (MXN)</label>
              <input type="number" v-model="form.costo" class="input-field font-semibold text-gray-500 bg-gray-50" step="0.01" disabled>
            </div>
            <div class="form-group mb-0">
              <label class="form-label">Meses</label>
              <input type="number" v-model="form.meses" class="input-field" min="1" max="12" required>
            </div>

            <div class="form-group col-span-2 mb-0 scholarship-card">
              <div class="scholarship-card-header">
                <div>
                  <label class="form-label">Tipo de beca</label>
                  <p>Opciones cerradas. Puedes seleccionar varias; se guardan separadas por coma para lectura posterior.</p>
                </div>
                <span v-if="selectedBecaTypes.length">{{ becaTypesCsv }}</span>
              </div>

              <div class="scholarship-options" role="group" aria-label="Tipos de beca">
                <button
                  v-for="option in becaOptions"
                  :key="option"
                  type="button"
                  :class="['scholarship-option', { selected: selectedBecaTypes.includes(option) }]"
                  :disabled="loading"
                  @click="toggleBecaType(option)"
                >
                  <LucideBadgePercent :size="14" />
                  {{ option }}
                </button>
              </div>

              <label class="scholarship-motivo">
                <span>Motivo de beca <em>opcional</em></span>
                <textarea
                  v-model="becaMotivo"
                  :disabled="loading"
                  maxlength="1200"
                  rows="2"
                  placeholder="Notas internas sobre la autorización, convenio o contexto de la beca..."
                ></textarea>
              </label>
            </div>
            
            <div class="form-group col-span-2 mt-1 p-5 bg-gray-50 rounded-lg border border-gray-200">
              <label class="form-label mb-1 text-brand-campus">Total del documento</label>
              <p class="text-xs text-gray-500 mb-3">Este es el total que tendrá el documento. La beca se calcula contra el costo del concepto.</p>
              <div class="relative">
                <div class="absolute inset-y-0 left-3 flex items-center text-brand-campus text-sm font-bold">$</div>
                <input
                  type="number"
                  v-model.number="montoFinalInput"
                  class="input-field font-mono font-bold text-gray-800 pl-8"
                  min="0"
                  step="1"
                  required
                >
              </div>

              <div class="mt-4 pt-4 border-t border-gray-200">
                <div class="flex justify-between items-center text-xs mb-3">
                  <span class="text-gray-500 font-medium">Costo del concepto:</span>
                  <span class="font-mono text-gray-500">${{ Number(form.costo).toFixed(2) }}</span>
                </div>
                <div class="flex justify-between items-center text-xs mb-3">
                  <span class="text-gray-500 font-medium">Beca / apoyo aplicado:</span>
                  <span class="font-mono text-emerald-700 font-bold">-${{ scholarshipDiscount.toFixed(2) }} · {{ scholarshipPercent.toFixed(2) }}%</span>
                </div>
                <div class="flex justify-between items-center mt-2 bg-white p-3 rounded-md border border-gray-100 shadow-sm">
                  <span class="text-xs font-bold text-gray-700 uppercase">Total a generar:</span>
                  <span class="font-mono text-lg font-bold text-brand-campus">${{ Number(montoFinalInput || 0).toFixed(2) }}</span>
                </div>
                <label class="mt-3 flex items-start gap-2 text-xs font-semibold text-gray-600">
                  <input type="checkbox" v-model="montoFinalConfirmed" class="mt-0.5">
                  <span>Confirmo que este total es correcto.</span>
                </label>
              </div>
            </div>

            <div class="form-group col-span-2 mb-0 other-campus-payment-card" :class="{ selected: pagoRealizadoEnOtroPlantel }">
              <label class="other-campus-payment-toggle">
                <input
                  v-model="pagoRealizadoEnOtroPlantel"
                  type="checkbox"
                  :disabled="loading"
                >
                <span>
                  <strong><LucideBuilding2 :size="15" /> Pagado en otro plantel</strong>
                  <small>Marca esta opción solo si una parte o todo el documento ya fue pagado fuera de este plantel.</small>
                </span>
              </label>

              <div v-if="pagoRealizadoEnOtroPlantel" class="other-campus-payment-details">
                <div class="other-campus-ledger">
                  <div class="other-campus-ledger-card total">
                    <span>Total del documento</span>
                    <strong>${{ formatMoney(otherCampusTotal) }}</strong>
                  </div>

                  <label class="other-campus-ledger-card editable">
                    <span>Pagado en otro plantel</span>
                    <div class="other-campus-amount-input">
                      <b>$</b>
                      <input
                        v-model.number="montoPagadoOtroPlantel"
                        type="number"
                        min="0.01"
                        :max="otherCampusTotal"
                        step="0.01"
                        :disabled="loading"
                        @input="markOtherCampusAmountEdited"
                      >
                    </div>
                  </label>

                  <div class="other-campus-ledger-card balance" :class="{ pending: otherCampusIsPartial }">
                    <span>Saldo pendiente</span>
                    <strong>${{ formatMoney(otherCampusBalance) }}</strong>
                  </div>
                </div>

                <div class="other-campus-summary">
                  <span v-if="periodCount > 1">{{ periodCount }} cargos de ${{ formatMoney(montoFinalInput) }}</span>
                  <span v-if="!otherCampusIsPartial && otherCampusPaid >= otherCampusTotal">Quedará cubierto completo</span>
                  <span v-else>Quedará saldo por cobrar en este plantel</span>
                </div>
              </div>
            </div>

            <div class="form-group col-span-2 mb-0 carta-beca-card" :class="{ disabled: !selectedBecaTypes.length }">
              <label class="carta-beca-toggle">
                <input
                  v-model="generarCartaBeca"
                  type="checkbox"
                  :disabled="!selectedBecaTypes.length || loading"
                >
                <span>
                  <strong><LucideFileCheck2 :size="15" /> Generar carta de beca PDF</strong>
                  <small>Se abrirá una carta oficial con logos, datos del alumno, tipo(s) de beca, motivo y monto final.</small>
                </span>
              </label>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="$emit('close')" type="button">Cancelar</button>
          <button class="btn btn-primary" @click="submit" :disabled="loading || loadingConcepts || !selectedDocumentoId">
            <LucideLoader2 v-if="loading" class="animate-spin" :size="16" />
            {{ loading ? 'Agregando...' : (pagoRealizadoEnOtroPlantel ? 'Agregar y registrar' : 'Agregar documento') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { LucideBadgePercent, LucideBuilding2, LucideCheckCircle, LucideFileCheck2, LucideLoader2, LucideRefreshCcw, LucideSearch, LucideX } from 'lucide-vue-next'
import { useState } from '#app'
import { useToast } from '~/composables/useToast'
import { useScrollLock } from '~/composables/useScrollLock'
import { normalizeCicloKey } from '~/shared/utils/ciclo'
import { DEFAULT_TALLER_SERVICIO_IMAGE, normalizeServicioClave } from '~/shared/utils/talleresServicios'

const props = defineProps({ student: Object })
const emit = defineEmits(['close', 'success'])
const { show } = useToast()
const state = useState('globalState')

useScrollLock()

const becaOptions = ['Colaborador', 'DRES', 'Hermanos', 'Promoción', 'SEP', 'Mercadotecnia']
const conceptos = ref([])
const serviceLinks = ref([])
const selectedDocumentoId = ref('')
const conceptSearch = ref('')
const conceptDropdownOpen = ref(false)
const firstConceptOptionRef = ref(null)
const loading = ref(false)
const loadingConcepts = ref(false)
const conceptLoadError = ref('')
const form = ref({ costo: 0, meses: 1, eventual: false })
const selectedBecaTypes = ref([])
const becaMotivo = ref('')
const generarCartaBeca = ref(false)
const pagoRealizadoEnOtroPlantel = ref(false)
const montoPagadoOtroPlantel = ref(0)
const montoPagadoOtroPlantelEditado = ref(false)

const montoFinalInput = ref(0)
const montoFinalConfirmed = ref(false)

const activeCicloKey = computed(() => normalizeCicloKey(state.value.ciclo))
const activeCicloLabel = computed(() => String(activeCicloKey.value || state.value.ciclo || '').trim() || 'activo')

const selectedConcept = computed(() => {
  return conceptos.value.find((item) => String(item.id) === String(selectedDocumentoId.value)) || null
})
const selectedConceptServicio = computed(() => {
  if (!selectedConcept.value?.id) return null
  return serviceLinks.value.find((item) => String(item.concepto_id) === String(selectedConcept.value.id)) || null
})

const becaTypesCsv = computed(() => selectedBecaTypes.value.join(', '))
const scholarshipDiscount = computed(() => Math.max(0, Number(form.value.costo || 0) - Number(montoFinalInput.value || 0)))
const scholarshipPercent = computed(() => {
  const costo = Number(form.value.costo || 0)
  return costo > 0 ? (scholarshipDiscount.value * 100) / costo : 0
})
const periodCount = computed(() => form.value.eventual ? 1 : Math.max(1, Number(form.value.meses || 1) || 1))
const otherCampusTotal = computed(() => Math.max(0, Number(montoFinalInput.value || 0)) * periodCount.value)
const otherCampusPaid = computed(() => Math.max(0, Number(montoPagadoOtroPlantel.value || 0)))
const otherCampusBalance = computed(() => Math.max(0, otherCampusTotal.value - Math.min(otherCampusPaid.value, otherCampusTotal.value)))
const otherCampusIsPartial = computed(() => pagoRealizadoEnOtroPlantel.value && otherCampusPaid.value > 0 && otherCampusPaid.value < otherCampusTotal.value)

const filteredConceptos = computed(() => {
  const term = conceptSearch.value.trim().toLowerCase()
  if (!term) return conceptos.value

  return conceptos.value.filter((concepto) => {
    return [
      concepto.id,
      concepto.concepto,
      concepto.description,
      concepto.plantel,
      concepto.ciclo,
      concepto.costo
    ].some((value) => String(value || '').toLowerCase().includes(term))
  })
})

const visibleConceptos = computed(() => filteredConceptos.value.slice(0, 80))

const formatMoney = (value) => Number(value || 0).toFixed(2)

const isTruthyFlag = (value) => ['1', 'true', 'si', 'sí', 'yes'].includes(String(value || '').trim().toLowerCase())

const conceptMeta = (concepto) => {
  const parts = []
  if (isTruthyFlag(concepto?.eventual)) parts.push('eventual')
  else parts.push('recurrente')
  if (concepto?.plazo) parts.push(`${concepto.plazo} meses`)
  if (concepto?.plantel) parts.push(concepto.plantel)
  return parts.filter(Boolean).join(' · ')
}

const setFirstConceptOptionRef = (el) => {
  firstConceptOptionRef.value = el
}

const focusFirstConceptOption = () => {
  conceptDropdownOpen.value = true
  requestAnimationFrame(() => firstConceptOptionRef.value?.focus?.())
}

const deferCloseDropdown = () => {
  window.setTimeout(() => {
    conceptDropdownOpen.value = false
  }, 140)
}

const syncOtherCampusAmount = ({ force = false } = {}) => {
  if (!pagoRealizadoEnOtroPlantel.value) {
    montoPagadoOtroPlantel.value = 0
    montoPagadoOtroPlantelEditado.value = false
    return
  }
  const max = otherCampusTotal.value
  const current = Number(montoPagadoOtroPlantel.value || 0)
  if (force || !montoPagadoOtroPlantelEditado.value || current <= 0) {
    montoPagadoOtroPlantel.value = max
  } else if (current > max) {
    montoPagadoOtroPlantel.value = max
  }
}

const markOtherCampusAmountEdited = () => {
  montoPagadoOtroPlantelEditado.value = true
  if (Number(montoPagadoOtroPlantel.value || 0) > otherCampusTotal.value) {
    montoPagadoOtroPlantel.value = otherCampusTotal.value
  }
}

const applyConceptToForm = (concepto) => {
  form.value.costo = Number(concepto?.costo || 0)
  form.value.meses = Number(concepto?.plazo || 1) || 1
  form.value.eventual = isTruthyFlag(concepto?.eventual)
  montoFinalInput.value = Math.round(Number(concepto?.costo || 0))
  montoFinalConfirmed.value = false
  syncOtherCampusAmount()
}

const selectConcept = (concepto) => {
  selectedDocumentoId.value = String(concepto.id)
  conceptSearch.value = concepto.concepto || String(concepto.id)
  conceptDropdownOpen.value = false
  applyConceptToForm(concepto)
}

const clearConceptSelection = () => {
  selectedDocumentoId.value = ''
  conceptSearch.value = ''
  form.value = { costo: 0, meses: 1, eventual: false }
  montoFinalInput.value = 0
  montoFinalConfirmed.value = false
  syncOtherCampusAmount({ force: true })
  conceptDropdownOpen.value = true
}

const toggleBecaType = (option) => {
  if (selectedBecaTypes.value.includes(option)) {
    selectedBecaTypes.value = selectedBecaTypes.value.filter((item) => item !== option)
  } else {
    selectedBecaTypes.value = [...selectedBecaTypes.value, option]
  }
  if (!selectedBecaTypes.value.length) generarCartaBeca.value = false
}


const loadServiceLinks = async () => {
  try {
    const config = await $fetch('/api/conceptos-config/all')
    const cicloNode = config?.ciclos?.[activeCicloKey.value]
    const planteles = cicloNode?.planteles_talleres_servicios || {}
    const rows = Object.values(planteles).flatMap((items) => Array.isArray(items) ? items : [])
    serviceLinks.value = rows
      .filter((item) => Number(item?.concepto_id || 0) > 0 && item?.servicio_clave)
      .map((item) => {
        const key = normalizeServicioClave(item.servicio_clave || item.servicio)
        return {
          concepto_id: Number(item.concepto_id),
          clave: key,
          nombre: item.servicio || item.concepto_nombre || key,
          imagen: key ? `/talleres-servicios/${key}.svg` : DEFAULT_TALLER_SERVICIO_IMAGE,
        }
      })
  } catch (e) {
    serviceLinks.value = []
  }
}

const loadConcepts = async ({ manual = false } = {}) => {
  loadingConcepts.value = true
  conceptLoadError.value = ''
  try {
    const rows = await $fetch('/api/conceptos', {
      params: {
        ciclo: activeCicloKey.value,
        refresh: manual ? Date.now() : undefined
      }
    })
    conceptos.value = Array.isArray(rows) ? rows : []

    if (selectedDocumentoId.value) {
      const updatedSelection = conceptos.value.find((item) => String(item.id) === String(selectedDocumentoId.value))
      if (updatedSelection) {
        conceptSearch.value = updatedSelection.concepto || String(updatedSelection.id)
        applyConceptToForm(updatedSelection)
      } else {
        clearConceptSelection()
      }
    }

    if (manual) show(`Conceptos actualizados (${conceptos.value.length})`, 'success')
  } catch (e) {
    conceptLoadError.value = e?.data?.message || 'No se pudieron cargar los conceptos.'
    show(conceptLoadError.value, 'danger')
  } finally {
    loadingConcepts.value = false
  }
}

const refreshConcepts = async () => {
  await Promise.all([loadConcepts({ manual: true }), loadServiceLinks()])
}

const openCartaWindow = () => {
  if (!generarCartaBeca.value || !selectedBecaTypes.value.length || typeof window === 'undefined') return null
  const win = window.open('', '_blank', 'noopener')
  if (win) {
    win.document.write('<p style="font-family: system-ui; padding: 24px; color: #27411f;">Generando carta de beca...</p>')
  }
  return win
}

const submit = async () => {
  if (!selectedDocumentoId.value) return show('Seleccione un concepto', 'danger')
  const montoFinal = Number(montoFinalInput.value)
  if (!Number.isFinite(montoFinal) || montoFinal < 0 || Math.floor(montoFinal) !== montoFinal) {
    return show('Ingresa un monto final sin decimales', 'danger')
  }
  if (selectedBecaTypes.value.length && montoFinal > Number(form.value.costo || 0)) {
    return show('El monto final no puede ser mayor al costo cuando hay beca.', 'danger')
  }
  if (generarCartaBeca.value && !selectedBecaTypes.value.length) return show('Selecciona al menos un tipo de beca para generar la carta.', 'danger')
  if (pagoRealizadoEnOtroPlantel.value) {
    const pagoOtroPlantel = Number(montoPagadoOtroPlantel.value || 0)
    if (!Number.isFinite(pagoOtroPlantel) || pagoOtroPlantel <= 0) {
      return show('Ingresa el monto pagado en otro plantel.', 'danger')
    }
    if (pagoOtroPlantel > otherCampusTotal.value + 0.009) {
      return show('El monto pagado en otro plantel no puede ser mayor al total.', 'danger')
    }
  }
  if (!montoFinalConfirmed.value) return show('Confirma el monto final', 'danger')

  const cartaWindow = openCartaWindow()
  loading.value = true

  try {
    const result = await $fetch('/api/documentos', {
      method: 'POST',
      body: { 
        matricula: props.student.matricula, 
        conceptoId: selectedDocumentoId.value, 
        costo: form.value.costo, 
        montoFinal,
        meses: form.value.meses,
        becaTipos: selectedBecaTypes.value,
        becaMotivo: becaMotivo.value,
        generarCartaBeca: generarCartaBeca.value,
        pagoRealizadoEnOtroPlantel: pagoRealizadoEnOtroPlantel.value,
        montoPagadoOtroPlantel: pagoRealizadoEnOtroPlantel.value ? Number(montoPagadoOtroPlantel.value || 0) : undefined,
        ciclo: activeCicloKey.value, 
        eventual: form.value.eventual 
      }
    })

    if (generarCartaBeca.value && result?.becaCartaUrl) {
      if (cartaWindow) cartaWindow.location.href = result.becaCartaUrl
      else window.open(result.becaCartaUrl, '_blank', 'noopener')
      const serviceText = result?.servicio?.mapped ? ` Servicio: ${result.servicio.servicio?.nombre || result.servicio.servicio?.clave || ''}.` : ''
      const depuracionText = result?.depurado
        ? (result?.depuradoParcial ? `Documento agregado, carta generada y pago en otro plantel registrado. Saldo pendiente: $${formatMoney(result?.depuradoSaldoPendiente || 0)}.` : 'Documento agregado, carta generada y pago marcado como realizado en otro plantel.')
        : 'Documento agregado y carta de beca generada.'
      show(depuracionText + serviceText)
    } else {
      cartaWindow?.close?.()
      const serviceText = result?.servicio?.mapped ? ` Servicio: ${result.servicio.servicio?.nombre || result.servicio.servicio?.clave || ''}.` : ''
      const depuracionText = result?.depurado
        ? (result?.depuradoParcial ? `Documento agregado y pago en otro plantel registrado. Saldo pendiente: $${formatMoney(result?.depuradoSaldoPendiente || 0)}.` : 'Documento agregado y pago marcado como realizado en otro plantel.')
        : 'Documento agregado.'
      show(depuracionText + serviceText)
    }
    emit('success')
  } catch (e) {
    cartaWindow?.close?.()
    show(e?.data?.message || 'Error al agregar', 'danger')
  } finally { loading.value = false }
}


watch(pagoRealizadoEnOtroPlantel, (active) => {
  if (active) syncOtherCampusAmount({ force: true })
  else syncOtherCampusAmount()
})

watch([montoFinalInput, () => form.value.meses, () => form.value.eventual], () => {
  syncOtherCampusAmount()
})

onMounted(() => {
  loadConcepts()
  loadServiceLinks()
})
</script>

<style scoped>
.document-modal-container {
  max-width: 760px;
}

.document-modal-header {
  align-items: center;
  justify-content: space-between;
}

.document-eyebrow {
  color: #4f8b47;
  font-size: 0.66rem;
  font-weight: 850;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.document-close-button {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border: 1px solid #e1e8ef;
  border-radius: 999px;
  background: #fff;
  color: #617087;
}

.document-modal-content {
  max-height: min(72vh, 720px);
  overflow: auto;
}

.concept-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.concept-refresh-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #d7e2d6;
  border-radius: 999px;
  background: #f8fbf7;
  color: #44723d;
  font-size: 0.7rem;
  font-weight: 760;
  padding: 6px 10px;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.concept-refresh-button:hover:not(:disabled) {
  background: #eef8ec;
  border-color: #bdd9b7;
  transform: translateY(-1px);
}

.concept-refresh-button:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.concept-combobox {
  position: relative;
}

.concept-search-shell {
  position: relative;
  display: flex;
  align-items: center;
}

.concept-search-icon {
  position: absolute;
  left: 12px;
  color: #738196;
  pointer-events: none;
}

.concept-search-input {
  width: 100%;
  min-height: 42px;
  border: 1px solid #d8e0ea;
  border-radius: 12px;
  background: #fff;
  color: #263752;
  font-size: 0.86rem;
  font-weight: 650;
  outline: none;
  padding: 0 42px 0 36px;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.concept-search-input:focus {
  border-color: #84b97d;
  box-shadow: 0 0 0 3px rgba(79, 139, 71, 0.12);
}

.concept-clear-button {
  position: absolute;
  right: 9px;
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: #eef2f6;
  color: #657287;
}

.concept-selected-pill {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 7px;
  margin-top: 8px;
  border: 1px solid #d8ebd5;
  border-radius: 999px;
  background: #f6fbf4;
  color: #44723d;
  font-size: 0.74rem;
  font-weight: 750;
  padding: 5px 9px;
}

.concept-selected-pill span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.concept-selected-pill strong {
  color: #2f5f2d;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.concept-dropdown {
  position: absolute;
  z-index: 80;
  top: calc(100% + 8px);
  right: 0;
  left: 0;
  max-height: min(340px, 44vh);
  overflow: auto;
  border: 1px solid #d7e0ea;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 22px 60px rgba(24, 39, 66, 0.18);
  padding: 6px;
}

.concept-option {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #263752;
  padding: 9px 10px;
  text-align: left;
  transition: background 140ms ease, color 140ms ease;
}

.concept-option:hover,
.concept-option:focus,
.concept-option[aria-selected="true"] {
  background: #f1f7ef;
  outline: none;
}

.concept-option-main {
  min-width: 0;
}

.concept-option-main strong,
.concept-option-main small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.concept-option-main strong {
  font-size: 0.82rem;
  font-weight: 780;
}

.concept-option-main small {
  margin-top: 2px;
  color: #788397;
  font-size: 0.69rem;
  font-weight: 620;
}

.concept-option-meta {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  color: #657287;
}

.concept-option-meta b {
  color: #2f5f2d;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
}

.concept-option-meta em {
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.65rem;
  font-style: normal;
  font-weight: 650;
}

.concept-dropdown-state,
.concept-dropdown-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #718096;
  font-size: 0.76rem;
  font-weight: 680;
  padding: 18px 12px;
  text-align: center;
}

.concept-dropdown-state--error {
  color: #b03a2f;
}

.concept-dropdown-hint {
  justify-content: flex-start;
  border-top: 1px solid #edf2f7;
  padding: 9px 10px 6px;
}

.concept-source-note {
  margin: 7px 0 0;
  color: #768398;
  font-size: 0.68rem;
  font-weight: 620;
  line-height: 1.35;
}

.concept-source-note code {
  border-radius: 5px;
  background: #f0f4f8;
  color: #45566f;
  padding: 1px 4px;
}

.scholarship-card,
.other-campus-payment-card,
.carta-beca-card {
  border: 1px solid #dce8d9;
  border-radius: 14px;
  background: linear-gradient(180deg, #fbfefb 0%, #f5fbf3 100%);
  padding: 14px;
}

.scholarship-card-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.scholarship-card-header p {
  color: #738196;
  font-size: 0.72rem;
  font-weight: 620;
  line-height: 1.35;
  margin-top: 2px;
}

.scholarship-card-header span {
  align-self: start;
  border-radius: 999px;
  background: #fff;
  color: #35713c;
  font-size: 0.68rem;
  font-weight: 760;
  padding: 5px 8px;
  white-space: nowrap;
}

.scholarship-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.scholarship-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #d9e6d6;
  border-radius: 999px;
  background: #fff;
  color: #4f5f73;
  font-size: 0.74rem;
  font-weight: 760;
  padding: 7px 10px;
}

.scholarship-option.selected {
  border-color: #76b26e;
  background: #eaf7e7;
  color: #327036;
  box-shadow: 0 7px 18px rgba(73, 137, 67, 0.12);
}

.scholarship-motivo {
  display: block;
  margin-top: 12px;
}

.scholarship-motivo span {
  display: flex;
  gap: 6px;
  color: #4f5f73;
  font-size: 0.74rem;
  font-weight: 770;
  margin-bottom: 5px;
}

.scholarship-motivo em {
  color: #8b97aa;
  font-style: normal;
  font-weight: 650;
}

.scholarship-motivo textarea {
  width: 100%;
  resize: vertical;
  min-height: 66px;
  border: 1px solid #d8e0ea;
  border-radius: 12px;
  background: #fff;
  color: #263752;
  font-size: 0.82rem;
  font-weight: 620;
  outline: none;
  padding: 10px 12px;
}

.carta-beca-card.disabled {
  opacity: 0.72;
}

.other-campus-payment-card {
  background: linear-gradient(180deg, #fffdf8 0%, #fff7e6 100%);
  border-color: #f0d9ad;
}

.other-campus-payment-card.selected {
  box-shadow: 0 0 0 3px rgba(217, 151, 43, 0.12);
}

.other-campus-payment-toggle,
.carta-beca-toggle {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}

.other-campus-payment-toggle input,
.carta-beca-toggle input {
  margin-top: 4px;
}

.other-campus-payment-toggle strong,
.carta-beca-toggle strong {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #284c2a;
  font-size: 0.82rem;
}

.other-campus-payment-toggle small,
.carta-beca-toggle small {
  display: block;
  color: #758399;
  font-size: 0.72rem;
  font-weight: 620;
  line-height: 1.35;
  margin-top: 2px;
}

.other-campus-payment-details {
  margin-top: 13px;
  border-top: 1px solid rgba(220, 153, 44, 0.24);
  padding-top: 13px;
}

.other-campus-ledger {
  display: grid;
  grid-template-columns: minmax(0, 0.86fr) minmax(150px, 1fr) minmax(0, 0.86fr);
  gap: 10px;
  align-items: stretch;
}

.other-campus-ledger-card {
  min-height: 58px;
  border: 1px solid rgba(234, 211, 158, 0.85);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);
  padding: 9px 11px;
}

.other-campus-ledger-card span {
  display: block;
  color: #6f7b8f;
  font-size: 0.62rem;
  font-weight: 820;
  letter-spacing: 0.035em;
  margin-bottom: 5px;
  text-transform: uppercase;
}

.other-campus-ledger-card strong {
  color: #34445e;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.92rem;
  font-weight: 900;
}

.other-campus-ledger-card.total strong {
  color: #7d5d20;
}

.other-campus-ledger-card.editable {
  display: block;
  border-color: #dca545;
  background: #fff;
  box-shadow: 0 8px 18px rgba(138, 95, 28, 0.08);
}

.other-campus-ledger-card.balance {
  border-color: #dfe8d9;
  background: #fbfefb;
}

.other-campus-ledger-card.balance strong {
  color: #327036;
}

.other-campus-ledger-card.balance.pending {
  border-color: #ead39e;
  background: #fffaf0;
}

.other-campus-ledger-card.balance.pending strong {
  color: #996515;
}

.other-campus-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 9px;
}

.other-campus-summary span {
  border: 1px solid rgba(234, 211, 158, 0.8);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.76);
  color: #806328;
  font-size: 0.66rem;
  font-weight: 780;
  padding: 4px 8px;
}

@media (max-width: 640px) {
  .other-campus-ledger {
    grid-template-columns: 1fr;
  }
}
</style>

<style scoped>
.concept-service-pill {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 7px;
  margin-top: 7px;
  border: 1px solid #d7ead2;
  border-radius: 999px;
  background: #f8fcf5;
  color: #44723d;
  padding: 4px 9px 4px 4px;
  font-size: 0.72rem;
  font-weight: 800;
}

.concept-service-pill img {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  border-radius: 9px;
  object-fit: cover;
}
</style>
