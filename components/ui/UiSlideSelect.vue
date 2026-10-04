<template>
  <div class="slide-select" role="group" :aria-label="label">
    <button class="slide-select__arrow" type="button" :aria-label="`${label}: anterior`" :disabled="atStart" @click="step(-1)">‹</button>
    <div ref="viewport" class="slide-select__viewport" @keydown="onKey" @click="onClick">
      <div ref="track" class="slide-select__track"><slot /></div>
    </div>
    <button class="slide-select__arrow" type="button" :aria-label="`${label}: siguiente`" :disabled="atEnd" @click="step(1)">›</button>
  </div>
</template>
<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
const props = defineProps({ label: { type: String, required: true }, selection: { type: String, default: '' }, activeIndex: { type: Number, default: -1 } })
const viewport = ref(null)
const track = ref(null)
const atStart = ref(true)
const atEnd = ref(false)
let observer
let current = 0
const buttons = () => [...(track.value?.querySelectorAll('button') || [])]
function reveal(index) {
  const items = buttons()
  if (!items.length || !viewport.value) return
  current = Math.max(0, Math.min(index, items.length - 1))
  items.forEach((item, i) => item.tabIndex = i === current ? 0 : -1)
  const selected = items[current]
  const previous = items[Math.max(0, current - 1)]
  const following = items[Math.min(items.length - 1, current + 1)]
  const width = viewport.value.clientWidth
  const left = previous.offsetLeft
  const right = following.offsetLeft + following.offsetWidth
  // Center the selection and its neighbors; narrow panels retain a peek on both sides.
  let offset = (left + right - width) / 2
  offset = Math.min(offset, selected.offsetLeft)
  offset = Math.max(offset, selected.offsetLeft + selected.offsetWidth - width)
  viewport.value.scrollTo({ left: Math.max(0, Math.min(offset, track.value.scrollWidth - width)), behavior: 'auto' })
  atStart.value = current === 0
  atEnd.value = current === items.length - 1
}
function sync() {
  const items = buttons()
  const index = props.activeIndex >= 0 ? props.activeIndex : items.findIndex(item => item.getAttribute('aria-pressed') === 'true')
  reveal(index < 0 ? current : index)
}
async function step(direction, index) {
  const items = buttons()
  const next = Math.max(0, Math.min(index ?? current + direction, items.length - 1))
  if (!items[next]) return
  current = next
  items[next].click()
  await nextTick()
  reveal(next)
  items[next]?.focus({ preventScroll: true })
}
function onClick(event) {
  const index = buttons().indexOf(event.target.closest('button'))
  if (index >= 0) nextTick(() => reveal(index))
}
function onKey(event) {
  const index = buttons().indexOf(event.target.closest('button'))
  if (index < 0) return
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  current = index
  step(event.key === 'ArrowLeft' ? -1 : 1, event.key === 'Home' ? 0 : event.key === 'End' ? buttons().length - 1 : undefined)
}
watch(() => props.selection, () => nextTick(sync))
onMounted(() => {
  observer = new ResizeObserver(sync)
  observer.observe(viewport.value)
  nextTick(sync)
})
onBeforeUnmount(() => observer?.disconnect())
</script>
<style scoped>
.slide-select { display: flex; align-items: center; min-width: var(--slide-select-min, 0); gap: 4px; overflow: hidden; }
.slide-select__viewport { flex: 1; min-width: 0; overflow: hidden; padding: 3px 1px; }
.slide-select__track { display: flex; position: relative; width: max-content; gap: 5px; }
.slide-select__track :deep(button) { flex: none; white-space: nowrap; }
.slide-select__arrow { flex: none; width: 22px; height: 32px; padding: 0; border: 1px solid #dce5df; border-radius: 8px; background: #fff; color: var(--brand-iecs-secondary); font-size: 24px; line-height: 1; cursor: pointer; }
.slide-select__arrow:disabled { opacity: .3; cursor: default; }
.slide-select__arrow:focus-visible { outline: 2px solid var(--brand-iecs-secondary); outline-offset: 1px; }
.slide-select__viewport :deep(button:focus-visible) { outline-offset: -3px; }
</style>
