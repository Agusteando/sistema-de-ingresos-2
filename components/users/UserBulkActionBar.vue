<template>
  <section v-if="selectedCount || totalCount" class="bulk-bar" :class="{ prominent: selectedCount }">
    <div>
      <strong v-if="selectedCount">{{ selectedCount }} seleccionados</strong>
      <strong v-else>{{ totalCount }} usuarios filtrados</strong>
      <span>{{ selectedCount ? 'Acciones rápidas sobre la selección.' : 'Puedes aplicar acciones a todo el resultado filtrado.' }}</span>
    </div>

    <div class="bulk-actions">
      <select v-model="scope" class="scope-select">
        <option value="selected" :disabled="!selectedCount">Seleccionados</option>
        <option value="filtered">Todos los filtrados</option>
      </select>
      <button type="button" :disabled="disabled || !canRun" @click="emitAccess('admin')">Financiero</button>
      <button type="button" :disabled="disabled || !canRun" @click="emitAccess('control')">Control Escolar</button>
      <button type="button" :disabled="disabled || !canRun" @click="emitAccess('admin_control')">Ambos</button>
      <select v-model="plantel" class="plantel-select">
        <option value="">Plantel…</option>
        <option v-for="item in planteles" :key="item" :value="item">{{ item }}</option>
      </select>
      <button type="button" :disabled="disabled || !canRun || !plantel" @click="emitPlantel('add')">Agregar</button>
      <button type="button" :disabled="disabled || !canRun || !plantel" @click="emitPlantel('remove')">Quitar</button>
      <button type="button" :disabled="disabled || !canRun || !plantel" @click="emitPlantel('replace')">Reemplazar</button>
      <button type="button" class="danger" :disabled="disabled || !canRun" @click="emitBlock(true)">Bloquear</button>
      <button type="button" :disabled="disabled || !canRun" @click="emitBlock(false)">Reactivar</button>
      <button v-if="selectedCount" type="button" class="ghost" @click="$emit('clear')">Limpiar</button>
    </div>
  </section>
</template>

<script setup>
const props = defineProps({
  selectedCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
  planteles: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['access', 'block', 'plantel', 'clear'])
const scope = ref('selected')
const plantel = ref('')
const canRun = computed(() => scope.value === 'filtered' || props.selectedCount > 0)
watch(() => props.selectedCount, (count) => {
  if (!count && scope.value === 'selected') scope.value = 'filtered'
  if (count && scope.value === 'filtered') scope.value = 'selected'
}, { immediate: true })
const emitAccess = (accessMode) => emit('access', { scope: scope.value, accessMode })
const emitBlock = (ingresosBlocked) => emit('block', { scope: scope.value, ingresosBlocked })
const emitPlantel = (mode) => emit('plantel', { scope: scope.value, mode, plantel: plantel.value })
</script>

<style scoped>
.bulk-bar {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  background: #ffffff;
  border: 1px solid rgba(15,23,42,0.08);
  border-radius: 24px;
  padding: 14px;
  box-shadow: 0 16px 38px rgba(15,23,42,0.07);
}
.bulk-bar.prominent { border-color: rgba(37,99,235,0.18); }
.bulk-bar strong { display: block; color: #0f172a; }
.bulk-bar span { color: #64748b; font-size: 13px; }
.bulk-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
button, select {
  border: 1px solid rgba(15,23,42,0.12);
  background: #f8fafc;
  color: #334155;
  border-radius: 12px;
  padding: 9px 10px;
  font-weight: 800;
  font-size: 12px;
}
button { cursor: pointer; }
button:hover:not(:disabled) { background: #eef2ff; }
button.danger { background: #fef2f2; color: #b91c1c; }
button.ghost { background: white; color: #64748b; }
button:disabled, select:disabled { opacity: .55; cursor: not-allowed; }
.scope-select { min-width: 136px; }
.plantel-select { min-width: 112px; }
@media (max-width: 1080px) { .bulk-bar { align-items: stretch; flex-direction: column; } .bulk-actions { justify-content: flex-start; } }
</style>
