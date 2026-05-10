<template>
  <Teleport to="body">
    <Transition name="selection-dock">
      <div v-if="selectedCount > 0" class="selection-action-dock">
        <div class="selection-action-dock__summary">
          <div class="selection-action-dock__count">{{ selectedCount }}</div>
          <div class="selection-action-dock__copy">
            <strong>{{ selectedCount }} {{ selectedCount === 1 ? 'seleccionado' : 'seleccionados' }}</strong>
            <span>${{ formatMoney(selectedBalanceTotal) }} total</span>
          </div>
        </div>
        <div class="selection-action-dock__actions">
          <button type="button" class="dock-action secondary" @click="$emit('open-selection-details')">
            <span>Estado de cuenta</span>
            <LucideArrowRight :size="16" />
          </button>
          <button type="button" class="dock-action secondary" @click="$emit('open-section-selection')">
            <LucideTags :size="16" />
            <span>Secciones</span>
          </button>
          <button type="button" class="dock-action primary" @click="$emit('open-bulk-payment')">
            <LucideCreditCard :size="16" />
            <span>Aplicar pago</span>
          </button>
          <button type="button" class="dock-action ghost" @click="$emit('clear-selected')">Limpiar</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { LucideArrowRight, LucideCreditCard, LucideTags } from 'lucide-vue-next'
import { formatMoney } from '~/shared/utils/studentPresentation'

defineProps({
  selectedCount: { type: Number, default: 0 },
  selectedBalanceTotal: { type: Number, default: 0 }
})

defineEmits([
  'open-selection-details',
  'open-section-selection',
  'open-bulk-payment',
  'clear-selected'
])
</script>
