<template>
  <div class="concept-multi" :class="{ 'is-open': isOpen, 'is-disabled': disabled }">
    <div class="concept-multi-input-wrap">
      <LucideSearch class="concept-multi-search-icon" :size="14" />
      <input
        ref="inputRef"
        v-model="search"
        class="concept-multi-input"
        type="search"
        autocomplete="off"
        :placeholder="selectedCount ? 'Buscar y agregar otro concepto...' : placeholder"
        :disabled="disabled"
        @focus="open"
        @input="open"
        @keydown.esc.prevent="close"
        @blur="deferClose"
      />
      <span v-if="selectedCount" class="concept-multi-count">{{ selectedCount }}</span>
    </div>

    <div v-if="selectedConcepts.length" class="concept-multi-selected" aria-label="Conceptos seleccionados">
      <button
        v-for="concept in selectedConcepts"
        :key="concept.id"
        class="concept-multi-chip"
        type="button"
        :disabled="disabled"
        :title="`Quitar ${concept.concepto}`"
        @mousedown.prevent
        @click="toggle(concept)"
      >
        <span>{{ concept.concepto }}</span>
        <LucideX :size="12" />
      </button>
      <button
        v-if="selectedConcepts.length > 1"
        class="concept-multi-clear-all"
        type="button"
        :disabled="disabled"
        @mousedown.prevent
        @click="clearAll"
      >
        Limpiar
      </button>
    </div>

    <div v-if="isOpen" class="concept-multi-menu" role="listbox" aria-label="Conceptos" aria-multiselectable="true">
      <div class="concept-multi-toolbar">
        <span>{{ filteredConcepts.length }} {{ filteredConcepts.length === 1 ? 'resultado' : 'resultados' }}</span>
        <button
          v-if="filteredConcepts.length"
          type="button"
          @mousedown.prevent
          @click="toggleVisible"
        >
          {{ allVisibleSelected ? 'Quitar visibles' : 'Seleccionar visibles' }}
        </button>
      </div>

      <div class="concept-multi-options">
        <div v-if="loading" class="concept-multi-state">
          <LucideLoader2 class="animate-spin" :size="14" />
          Cargando...
        </div>
        <div v-else-if="!filteredConcepts.length" class="concept-multi-state">Sin resultados</div>
        <template v-else>
          <button
            v-for="concept in visibleConcepts"
            :key="concept.id"
            class="concept-multi-option"
            :class="{ selected: isSelected(concept) }"
            type="button"
            role="option"
            :aria-selected="isSelected(concept)"
            @mousedown.prevent
            @click="toggle(concept)"
          >
            <span class="concept-multi-checkbox" aria-hidden="true">
              <LucideCheck v-if="isSelected(concept)" :size="13" />
            </span>
            <span class="concept-multi-main">
              <strong>{{ concept.concepto }}</strong>
              <small>ID {{ concept.id }}<template v-if="concept.description"> · {{ concept.description }}</template></small>
            </span>
            <span class="concept-multi-meta">
              <b>${{ formatMoney(concept.costo) }}</b>
              <em>{{ conceptMeta(concept) }}</em>
            </span>
          </button>
          <div v-if="filteredConcepts.length > visibleConcepts.length" class="concept-multi-hint">
            Mostrando {{ visibleConcepts.length }} de {{ filteredConcepts.length }}. Refina la búsqueda para ver más.
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { LucideCheck, LucideLoader2, LucideSearch, LucideX } from 'lucide-vue-next'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  concepts: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Buscar conceptos...' },
  limit: { type: Number, default: 80 },
})

const emit = defineEmits(['update:modelValue'])

const search = ref('')
const isOpen = ref(false)
const inputRef = ref(null)

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const selectedKeys = computed(() => new Set((props.modelValue || []).map(value => String(value))))
const selectedCount = computed(() => selectedKeys.value.size)
const selectedConcepts = computed(() => props.concepts.filter(concept => selectedKeys.value.has(String(concept.id))))

const filteredConcepts = computed(() => {
  const term = normalize(search.value)
  if (!term) return props.concepts
  return props.concepts.filter((concept) => [
    concept?.id,
    concept?.concepto,
    concept?.description,
    concept?.ciclo,
    concept?.ciclos,
    concept?.costo,
  ].some(value => normalize(value).includes(term)))
})

const visibleConcepts = computed(() => filteredConcepts.value.slice(0, props.limit))
const allVisibleSelected = computed(() => visibleConcepts.value.length > 0 && visibleConcepts.value.every(isSelected))

const formatMoney = (value) => Number(value || 0).toFixed(2)
const isTruthyFlag = (value) => ['1', 'true', 'si', 'sí', 'yes'].includes(String(value || '').trim().toLowerCase())

const conceptMeta = (concept) => {
  const parts = []
  if (concept?.historico) parts.push('histórico')
  else parts.push(isTruthyFlag(concept?.eventual) ? 'eventual' : 'recurrente')
  if (concept?.plazo) parts.push(`${concept.plazo} meses`)
  if (concept?.ciclos) parts.push(String(concept.ciclos))
  else if (concept?.ciclo) parts.push(String(concept.ciclo))
  return parts.join(' · ')
}

const isSelected = (concept) => selectedKeys.value.has(String(concept?.id))

const updateSelection = (values) => {
  emit('update:modelValue', Array.from(new Set(values.map(value => String(value)))))
}

const toggle = (concept) => {
  if (props.disabled) return
  const key = String(concept.id)
  const next = new Set(selectedKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  updateSelection([...next])
  isOpen.value = true
  nextTick(() => inputRef.value?.focus?.())
}

const toggleVisible = () => {
  const next = new Set(selectedKeys.value)
  if (allVisibleSelected.value) visibleConcepts.value.forEach(concept => next.delete(String(concept.id)))
  else visibleConcepts.value.forEach(concept => next.add(String(concept.id)))
  updateSelection([...next])
  nextTick(() => inputRef.value?.focus?.())
}

const clearAll = () => {
  updateSelection([])
  search.value = ''
  isOpen.value = true
  nextTick(() => inputRef.value?.focus?.())
}

const open = () => {
  if (!props.disabled) isOpen.value = true
}

const close = () => {
  isOpen.value = false
}

const deferClose = () => {
  window.setTimeout(close, 160)
}
</script>

<style scoped>
.concept-multi {
  position: relative;
  display: grid;
  min-width: 0;
  gap: 7px;
}

.concept-multi-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.concept-multi-search-icon {
  position: absolute;
  left: 12px;
  color: #8a96a8;
  pointer-events: none;
}

.concept-multi-input {
  width: 100%;
  min-height: 40px;
  border: 1px solid #d8e1eb;
  border-radius: 12px;
  background: #fff;
  color: #263752;
  font-size: 0.86rem;
  font-weight: 650;
  padding: 0 48px 0 34px;
  outline: none;
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

.concept-multi-input:focus {
  border-color: #9ec7a0;
  box-shadow: 0 0 0 3px rgba(79, 139, 71, 0.11);
}

.concept-multi.is-disabled .concept-multi-input {
  background: #f6f8fb;
  color: #8a96a8;
}

.concept-multi-count {
  position: absolute;
  right: 10px;
  display: grid;
  min-width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 999px;
  background: #eaf4ec;
  color: #2f6a39;
  padding: 0 7px;
  font-size: 0.7rem;
  font-weight: 850;
  pointer-events: none;
}

.concept-multi-selected {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  min-width: 0;
}

.concept-multi-chip,
.concept-multi-clear-all {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 27px;
  border: 0;
  border-radius: 999px;
  padding: 0 9px;
  font-size: 0.69rem;
  font-weight: 760;
}

.concept-multi-chip {
  max-width: 240px;
  background: #eef8eb;
  color: #356b2f;
}

.concept-multi-chip span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.concept-multi-chip:hover {
  background: #e3f2df;
}

.concept-multi-clear-all {
  background: #eef2f6;
  color: #667085;
}

.concept-multi-menu {
  position: absolute;
  z-index: 40;
  top: calc(100% + 5px);
  right: 0;
  left: 0;
  overflow: hidden;
  border: 1px solid #dce5ef;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 18px 42px rgba(38, 55, 82, 0.16);
}

.concept-multi-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid #edf1f5;
  background: #f9fbfc;
  padding: 8px 10px;
}

.concept-multi-toolbar span {
  color: #7b8798;
  font-size: 0.68rem;
  font-weight: 720;
}

.concept-multi-toolbar button {
  border: 0;
  background: transparent;
  color: #2f6a39;
  padding: 3px 4px;
  font-size: 0.68rem;
  font-weight: 800;
}

.concept-multi-options {
  max-height: 330px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.concept-multi-state,
.concept-multi-hint {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #778499;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 12px;
}

.concept-multi-option {
  display: grid;
  width: 100%;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  border: 0;
  border-bottom: 1px solid #f1f4f8;
  background: #fff;
  padding: 9px 11px;
  text-align: left;
}

.concept-multi-option:hover,
.concept-multi-option:focus-visible,
.concept-multi-option.selected {
  background: #f7fbf6;
  outline: none;
}

.concept-multi-checkbox {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  background: #fff;
  color: #fff;
}

.concept-multi-option.selected .concept-multi-checkbox {
  border-color: #4f8b47;
  background: #4f8b47;
}

.concept-multi-main,
.concept-multi-meta {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.concept-multi-main strong {
  overflow: hidden;
  color: #263752;
  font-size: 0.79rem;
  font-weight: 820;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.concept-multi-main small,
.concept-multi-meta em {
  overflow: hidden;
  color: #7b8798;
  font-size: 0.67rem;
  font-style: normal;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.concept-multi-meta {
  justify-items: end;
}

.concept-multi-meta b {
  color: #263752;
  font-size: 0.76rem;
  font-weight: 820;
}

@media (max-width: 620px) {
  .concept-multi-option {
    grid-template-columns: 20px minmax(0, 1fr);
  }

  .concept-multi-meta {
    display: none;
  }

  .concept-multi-chip {
    max-width: calc(50% - 3px);
  }
}
</style>
