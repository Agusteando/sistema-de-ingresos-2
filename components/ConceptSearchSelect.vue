<template>
  <div class="concept-select" :class="{ 'is-open': isOpen, 'is-disabled': disabled }">
    <div class="concept-select-input-wrap">
      <LucideSearch class="concept-select-icon" :size="14" />
      <input
        ref="inputRef"
        v-model="search"
        class="concept-select-input"
        type="search"
        autocomplete="off"
        :placeholder="placeholder"
        :disabled="disabled"
        @focus="open"
        @input="open"
        @keydown.down.prevent="focusFirstOption"
        @keydown.esc.prevent="close"
        @blur="deferClose"
      />
      <button
        v-if="modelValue || search"
        class="concept-select-clear"
        type="button"
        :disabled="disabled"
        title="Limpiar"
        @mousedown.prevent
        @click="clear"
      >
        <LucideX :size="13" />
      </button>
    </div>

    <div v-if="selectedConcept" class="concept-select-value">
      <LucideCheckCircle :size="12" />
      <span>{{ selectedConcept.concepto }}</span>
      <strong>${{ formatMoney(selectedConcept.costo) }}</strong>
      <em :class="['concept-stock-chip', stockClass(selectedConcept.stock)]">{{ stockLabel(selectedConcept.stock) }}</em>
    </div>

    <div v-if="isOpen" class="concept-select-menu" role="listbox" aria-label="Conceptos">
      <div v-if="loading" class="concept-select-state">
        <LucideLoader2 class="animate-spin" :size="14" />
        Cargando...
      </div>
      <div v-else-if="!filteredConcepts.length" class="concept-select-state">
        Sin resultados
      </div>
      <template v-else>
        <button
          v-for="(concept, index) in visibleConcepts"
          :key="concept.id"
          :ref="index === 0 ? setFirstOptionRef : undefined"
          class="concept-select-option"
          type="button"
          role="option"
          :disabled="isStockBlocked(concept)"
          :aria-selected="String(concept.id) === String(modelValue)"
          @mousedown.prevent
          @click="select(concept)"
        >
          <span class="concept-select-main">
            <strong>{{ concept.concepto }}</strong>
            <small>ID {{ concept.id }}<template v-if="concept.description"> · {{ concept.description }}</template></small>
          </span>
          <span class="concept-select-meta">
            <b>${{ formatMoney(concept.costo) }}</b>
            <em>{{ conceptMeta(concept) }}</em>
            <i :class="['concept-stock-chip', stockClass(concept.stock)]">{{ stockLabel(concept.stock) }}</i>
          </span>
        </button>
        <div v-if="filteredConcepts.length > visibleConcepts.length" class="concept-select-hint">
          {{ visibleConcepts.length }} de {{ filteredConcepts.length }}
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { LucideCheckCircle, LucideLoader2, LucideSearch, LucideX } from 'lucide-vue-next'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  concepts: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Buscar concepto...' },
  limit: { type: Number, default: 80 },
})

const emit = defineEmits(['update:modelValue', 'select', 'clear'])

const search = ref('')
const isOpen = ref(false)
const inputRef = ref(null)
const firstOptionRef = ref(null)

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const selectedConcept = computed(() =>
  props.concepts.find((item) => String(item.id) === String(props.modelValue)) || null,
)

const filteredConcepts = computed(() => {
  const term = normalize(search.value)
  if (!term) return props.concepts
  return props.concepts.filter((concept) => [
    concept?.id,
    concept?.concepto,
    concept?.description,
    concept?.ciclo,
    concept?.costo,
  ].some((value) => normalize(value).includes(term)))
})

const visibleConcepts = computed(() => filteredConcepts.value.slice(0, props.limit))

const formatMoney = (value) => Number(value || 0).toFixed(2)

const isTruthyFlag = (value) => ['1', 'true', 'si', 'sí', 'yes'].includes(String(value || '').trim().toLowerCase())

const conceptMeta = (concept) => {
  const parts = []
  if (isTruthyFlag(concept?.eventual)) parts.push('eventual')
  else parts.push('recurrente')
  if (concept?.plazo) parts.push(`${concept.plazo} meses`)
  return parts.join(' · ')
}

const stockLabel = (stock) => {
  if (!stock?.controlled) return 'infinito'
  if (stock.status === 'out') return 'agotado'
  if (stock.status === 'low') return `bajo · ${stock.available ?? 0}`
  return `${stock.available ?? 0} disp.`
}

const stockClass = (stock) => {
  if (!stock?.controlled) return 'neutral'
  if (stock.status === 'out') return 'danger'
  if (stock.status === 'low') return 'warning'
  return 'success'
}

const isStockBlocked = (concept) => Boolean(concept?.stock?.controlled && concept?.stock?.status === 'out' && !concept?.stock?.allow_negative)

const syncSearchFromSelection = () => {
  if (selectedConcept.value) search.value = selectedConcept.value.concepto || String(selectedConcept.value.id)
}

const open = () => {
  if (props.disabled) return
  isOpen.value = true
}

const close = () => {
  isOpen.value = false
  syncSearchFromSelection()
}

const deferClose = () => {
  window.setTimeout(close, 140)
}

const setFirstOptionRef = (el) => {
  firstOptionRef.value = el
}

const focusFirstOption = async () => {
  open()
  await nextTick()
  firstOptionRef.value?.focus?.()
}

const select = (concept) => {
  if (isStockBlocked(concept)) return
  emit('update:modelValue', String(concept.id))
  emit('select', concept)
  search.value = concept.concepto || String(concept.id)
  isOpen.value = false
}

const clear = () => {
  emit('update:modelValue', '')
  emit('clear')
  search.value = ''
  isOpen.value = true
  nextTick(() => inputRef.value?.focus?.())
}

watch(() => props.modelValue, syncSearchFromSelection)
watch(() => props.concepts, syncSearchFromSelection, { immediate: true })
</script>

<style scoped>
.concept-select {
  position: relative;
  display: grid;
  gap: 7px;
}

.concept-select-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.concept-select-icon {
  position: absolute;
  left: 12px;
  color: #8a96a8;
  pointer-events: none;
}

.concept-select-input {
  width: 100%;
  min-height: 40px;
  border: 1px solid #d8e1eb;
  border-radius: 12px;
  background: #fff;
  color: #263752;
  font-size: 0.86rem;
  font-weight: 650;
  padding: 0 38px 0 34px;
  outline: none;
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

.concept-select-input:focus {
  border-color: #9ec7a0;
  box-shadow: 0 0 0 3px rgba(79, 139, 71, 0.11);
}

.concept-select.is-disabled .concept-select-input {
  background: #f6f8fb;
  color: #8a96a8;
}

.concept-select-clear {
  position: absolute;
  right: 8px;
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: #eef2f7;
  color: #657186;
}

.concept-select-value {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  background: #eef8eb;
  color: #356b2f;
  padding: 5px 9px;
  font-size: 0.72rem;
  font-weight: 800;
}

.concept-select-value span {
  overflow: hidden;
  max-width: 360px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.concept-select-value strong {
  color: #263752;
}

.concept-select-menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + 5px);
  right: 0;
  left: 0;
  overflow: hidden;
  border: 1px solid #dce5ef;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 18px 42px rgba(38, 55, 82, 0.16);
}

.concept-select-state,
.concept-select-hint {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #778499;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 12px;
}

.concept-select-option {
  display: grid;
  width: 100%;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  border: 0;
  border-bottom: 1px solid #f1f4f8;
  background: #fff;
  padding: 10px 12px;
  text-align: left;
}

.concept-select-option:hover,
.concept-select-option:focus-visible {
  background: #f7fbf6;
  outline: none;
}

.concept-select-option:disabled {
  cursor: not-allowed;
  opacity: .62;
}

.concept-select-main,
.concept-select-meta {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.concept-select-main strong {
  overflow: hidden;
  color: #263752;
  font-size: 0.8rem;
  font-weight: 820;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.concept-select-main small,
.concept-select-meta em {
  overflow: hidden;
  color: #7b8798;
  font-size: 0.69rem;
  font-style: normal;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.concept-select-meta {
  justify-items: end;
}

.concept-select-meta b {
  color: #263752;
  font-size: 0.78rem;
  font-weight: 820;
}
.concept-stock-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  min-height: 19px;
  border-radius: 999px;
  padding: 0 7px;
  font-size: 0.63rem;
  font-style: normal;
  font-weight: 850;
}

.concept-stock-chip.neutral { background: #f1f4f8; color: #68778c; }
.concept-stock-chip.success { background: #edf8ea; color: #356b2f; }
.concept-stock-chip.warning { background: #fff4d9; color: #925b0d; }
.concept-stock-chip.danger { background: #fff1f1; color: #b42318; }

</style>
