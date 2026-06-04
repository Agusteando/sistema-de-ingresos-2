<template>
  <div class="role-chips" :class="{ interactive }">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="role-chip"
      :class="[option.value, { active: mode === option.value }]"
      :disabled="!interactive || disabled || mode === option.value"
      @click="$emit('change', option.value)"
    >
      <component :is="option.icon" :size="14" />
      {{ compact ? option.short : option.label }}
    </button>
  </div>
</template>

<script setup>
import { LucideGraduationCap, LucideShieldCheck, LucideShield } from 'lucide-vue-next'

defineProps({
  mode: { type: String, default: 'admin' },
  interactive: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  compact: { type: Boolean, default: false }
})
defineEmits(['change'])

const options = [
  { value: 'admin', label: 'Financiero', short: 'Fin', icon: LucideShieldCheck },
  { value: 'control', label: 'Control Escolar', short: 'CTRL', icon: LucideGraduationCap },
  { value: 'admin_control', label: 'Ambos', short: 'Ambos', icon: LucideShield }
]
</script>

<style scoped>
.role-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.role-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #f8fafc;
  color: #475569;
  border-radius: 999px;
  padding: 6px 9px;
  font-size: 12px;
  font-weight: 750;
  transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
}
.role-chip.active.admin { background: #ecfdf5; border-color: rgba(22, 163, 74, 0.2); color: #166534; }
.role-chip.active.control { background: #eff6ff; border-color: rgba(37, 99, 235, 0.2); color: #1d4ed8; }
.role-chip.active.admin_control { background: #f5f3ff; border-color: rgba(124, 58, 237, 0.2); color: #6d28d9; }
.role-chips.interactive .role-chip:not(:disabled) { cursor: pointer; }
.role-chips.interactive .role-chip:not(:disabled):hover { transform: translateY(-1px); border-color: rgba(37, 99, 235, 0.28); }
.role-chip:disabled { cursor: default; opacity: 0.72; }
</style>
