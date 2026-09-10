<template>
  <div ref="root" class="searchable-select" :class="{ open, disabled }">
    <button
      class="searchable-select__trigger"
      type="button"
      :disabled="disabled"
      :aria-expanded="open ? 'true' : 'false'"
      aria-haspopup="listbox"
      :aria-label="accessibleLabel || placeholder"
      @click="toggle"
    >
      <span :class="{ placeholder: !selectedOption }">{{ selectedOption?.label || placeholder }}</span>
      <LucideChevronDown :size="16" :class="{ rotated: open }" />
    </button>

    <div v-if="open" class="searchable-select__menu">
      <label class="searchable-select__search">
        <LucideSearch :size="16" />
        <input
          ref="searchInput"
          v-model="query"
          type="search"
          :placeholder="searchPlaceholder"
          autocomplete="off"
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
          @keydown.enter.prevent="chooseActive"
          @keydown.esc.prevent="close"
        />
      </label>

      <div class="searchable-select__options" role="listbox">
        <button
          v-if="clearable"
          type="button"
          class="searchable-select__option clear-option"
          :class="{ selected: !modelValue }"
          @click="choose('')"
        >
          {{ clearLabel }}
          <LucideCheck v-if="!modelValue" :size="15" />
        </button>

        <button
          v-for="(option, index) in filteredOptions"
          :key="String(option.value)"
          type="button"
          class="searchable-select__option"
          :class="{ active: index === activeIndex, selected: String(option.value) === String(modelValue) }"
          role="option"
          :aria-selected="String(option.value) === String(modelValue) ? 'true' : 'false'"
          @mouseenter="activeIndex = index"
          @click="choose(option.value)"
        >
          <span>{{ option.label }}</span>
          <LucideCheck v-if="String(option.value) === String(modelValue)" :size="15" />
        </button>

        <div v-if="!filteredOptions.length" class="searchable-select__empty">Sin resultados</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { LucideCheck, LucideChevronDown, LucideSearch } from 'lucide-vue-next'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Selecciona una opción...' },
  searchPlaceholder: { type: String, default: 'Buscar...' },
  clearLabel: { type: String, default: 'Sin selección' },
  clearable: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  accessibleLabel: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'change'])
const root = ref(null)
const searchInput = ref(null)
const open = ref(false)
const query = ref('')
const activeIndex = ref(0)

const normalizedOptions = computed(() => (props.options || [])
  .map((option) => ({
    ...option,
    value: option?.value ?? '',
    label: String(option?.label ?? option?.value ?? ''),
    search: String(option?.search ?? ''),
  }))
  .filter((option) => option.label))

const selectedOption = computed(() => normalizedOptions.value.find((option) => String(option.value) === String(props.modelValue)) || null)

const normalizeSearch = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es')
  .trim()

const filteredOptions = computed(() => {
  const needle = normalizeSearch(query.value)
  if (!needle) return normalizedOptions.value
  return normalizedOptions.value.filter((option) => normalizeSearch(`${option.label} ${option.value} ${option.search}`).includes(needle))
})

watch(query, () => { activeIndex.value = 0 })
watch(() => props.disabled, (value) => { if (value) close() })
watch(filteredOptions, (items) => {
  if (!items.length) activeIndex.value = 0
  else if (activeIndex.value >= items.length) activeIndex.value = items.length - 1
})

const openMenu = async () => {
  if (props.disabled) return
  open.value = true
  query.value = ''
  const selectedIndex = normalizedOptions.value.findIndex((option) => String(option.value) === String(props.modelValue))
  activeIndex.value = selectedIndex >= 0 ? selectedIndex : 0
  await nextTick()
  searchInput.value?.focus()
}

const close = () => {
  open.value = false
  query.value = ''
}

const toggle = () => open.value ? close() : openMenu()

const choose = (value) => {
  emit('update:modelValue', value)
  emit('change', value)
  close()
}

const move = (direction) => {
  if (!filteredOptions.value.length) return
  activeIndex.value = (activeIndex.value + direction + filteredOptions.value.length) % filteredOptions.value.length
}

const chooseActive = () => {
  const option = filteredOptions.value[activeIndex.value]
  if (option) choose(option.value)
}

const handleOutside = (event) => {
  if (root.value && !root.value.contains(event.target)) close()
}

onMounted(() => document.addEventListener('pointerdown', handleOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', handleOutside))
</script>

<style scoped>
.searchable-select{position:relative;width:100%;min-width:0}.searchable-select.open{z-index:90}.searchable-select__trigger{width:100%;height:42px;border:1px solid #d5dfe9;border-radius:12px;background:#fff;padding:0 11px 0 12px;color:#27374a;font:inherit;font-weight:700;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;cursor:pointer;outline:0}.searchable-select__trigger span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.searchable-select__trigger .placeholder{color:#8b98a8;font-weight:650}.searchable-select__trigger svg{flex:0 0 auto;color:#718096;transition:transform .15s ease}.searchable-select__trigger svg.rotated{transform:rotate(180deg)}.searchable-select.open .searchable-select__trigger,.searchable-select__trigger:focus-visible{border-color:#77b9cb;box-shadow:0 0 0 3px rgba(11,136,177,.1)}.searchable-select__trigger:disabled{opacity:.55;cursor:not-allowed}.searchable-select__menu{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:100;min-width:min(360px,calc(100vw - 32px));padding:6px;background:#fff;border:1px solid #dce5ec;border-radius:14px;box-shadow:0 18px 48px rgba(27,48,66,.18)}.searchable-select__search{height:40px;display:flex;align-items:center;gap:7px;padding:0 10px;color:#748294;border:1px solid #dbe4eb;border-radius:10px;background:#fafdff}.searchable-select__search:focus-within{border-color:#77b9cb;box-shadow:0 0 0 2px rgba(11,136,177,.08)}.searchable-select__search input{width:100%;height:36px!important;padding:0!important;border:0!important;box-shadow:none!important;outline:0;background:transparent;color:#27374a;font:inherit;font-weight:650}.searchable-select__options{display:grid;gap:2px;max-height:260px;overflow-y:auto;margin-top:5px}.searchable-select__option{width:100%;min-height:38px;border:0;border-radius:9px;background:transparent;padding:7px 9px;color:#34465a;font:inherit;font-weight:700;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer}.searchable-select__option span{min-width:0;overflow:hidden;text-overflow:ellipsis}.searchable-select__option:hover,.searchable-select__option.active{background:#f1f7fa}.searchable-select__option.selected{color:#087fa8;background:#eef8fb}.searchable-select__option svg{flex:0 0 auto}.searchable-select__option.clear-option{color:#728093}.searchable-select__empty{padding:16px 10px;color:#8b98a8;font-size:.78rem;text-align:center}.disabled{pointer-events:none}
@media(max-width:620px){.searchable-select__menu{min-width:100%}}
</style>
