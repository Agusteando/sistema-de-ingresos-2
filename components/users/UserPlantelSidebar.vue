<template>
  <aside class="plantel-sidebar">
    <div class="sidebar-section">
      <button type="button" class="plantel-item" :class="{ active: selected === 'all' }" @click="$emit('select', 'all')">
        <span>Todos los planteles</span>
        <strong>{{ total }}</strong>
      </button>
      <button
        v-for="item in visiblePlanteles"
        :key="item.plantel"
        type="button"
        class="plantel-item"
        :class="{ active: selected === item.plantel, muted: !item.total }"
        @click="$emit('select', item.plantel)"
      >
        <span>{{ item.label || item.plantel }}</span>
        <strong>{{ item.total || 0 }}</strong>
      </button>
    </div>

    <div class="sidebar-section alerts">
      <p class="sidebar-title">Alertas</p>
      <button type="button" class="alert-item" @click="$emit('filter-status', 'blocked')">
        <span>Bloqueados</span><strong>{{ alerts.blocked || 0 }}</strong>
      </button>
      <button type="button" class="alert-item" @click="$emit('filter-status', 'protected')">
        <span>Protegidos</span><strong>{{ alerts.protected || 0 }}</strong>
      </button>
      <button type="button" class="alert-item" @click="$emit('filter-activity', 'never')">
        <span>Sin actividad</span><strong>{{ alerts.noActivity || 0 }}</strong>
      </button>
      <button v-if="alerts.missingPlantel" type="button" class="alert-item" @click="$emit('select', '__sin_plantel__')">
        <span>Sin plantel</span><strong>{{ alerts.missingPlantel }}</strong>
      </button>
    </div>
  </aside>
</template>

<script setup>
const props = defineProps({
  selected: { type: String, default: 'all' },
  facets: { type: Object, default: () => ({}) }
})
defineEmits(['select', 'filter-status', 'filter-activity'])

const planteles = computed(() => props.facets?.byPlantel || [])
const total = computed(() => props.facets?.total || 0)
const alerts = computed(() => props.facets?.alerts || {})
const visiblePlanteles = computed(() => planteles.value.filter((item) => item.total || item.plantel === props.selected))
</script>

<style scoped>
.plantel-sidebar {
  display: grid;
  gap: 16px;
  align-content: start;
}
.sidebar-section {
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 24px;
  padding: 12px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.06);
}
.sidebar-title {
  margin: 2px 4px 10px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: #64748b;
}
.plantel-item,
.alert-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 0;
  background: transparent;
  border-radius: 16px;
  padding: 11px 12px;
  color: #334155;
  font-weight: 750;
  cursor: pointer;
  text-align: left;
}
.plantel-item:hover,
.alert-item:hover { background: #f8fafc; }
.plantel-item.active {
  background: #0f172a;
  color: white;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.18);
}
.plantel-item.muted { color: #94a3b8; }
.plantel-item strong,
.alert-item strong {
  font-size: 12px;
  background: rgba(148, 163, 184, 0.16);
  border-radius: 999px;
  padding: 3px 8px;
}
.plantel-item.active strong { background: rgba(255,255,255,0.16); color: white; }
.alert-item strong { color: #0f172a; }
</style>
