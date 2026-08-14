<template>
  <Teleport to="body">
    <Transition name="selection-dock">
      <div v-if="selectedCount > 0" class="selection-action-dock ce-whatsapp-selection-dock">
        <div class="selection-action-dock__summary">
          <div class="selection-action-dock__count">{{ selectedCount }}</div>
          <div class="selection-action-dock__copy">
            <strong>{{ selectedCount }} {{ selectedCount === 1 ? 'seleccionado' : 'seleccionados' }}</strong>
            <span>Control Escolar</span>
          </div>
        </div>
        <div class="selection-action-dock__actions">
          <button type="button" class="dock-action secondary ce-page-action" @click="$emit('toggle-page')">
            <LucideListChecks :size="16" />
            <span>{{ pageSelected ? 'Quitar página' : 'Página' }}</span>
          </button>
          <button type="button" class="dock-action whatsapp" @click="$emit('open-whatsapp')">
            <LucideMessageCircle :size="17" />
            <span>WhatsApp</span>
          </button>
          <button type="button" class="dock-action ghost" @click="$emit('clear')">
            <LucideX :size="16" />
            <span>Limpiar</span>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { LucideListChecks, LucideMessageCircle, LucideX } from 'lucide-vue-next'

defineProps({
  selectedCount: { type: Number, default: 0 },
  pageSelected: { type: Boolean, default: false }
})

defineEmits(['toggle-page', 'open-whatsapp', 'clear'])
</script>

<style scoped>
.ce-whatsapp-selection-dock {
  max-width: calc(100vw - 48px);
}

.ce-whatsapp-selection-dock .selection-action-dock__summary {
  min-width: 156px;
}

.ce-whatsapp-selection-dock .dock-action {
  min-width: 104px;
}

.ce-whatsapp-selection-dock .dock-action.whatsapp {
  min-width: 126px;
  border-color: rgba(37, 165, 93, .26);
  background: linear-gradient(180deg, #f3fbf6, #edf9f1);
  color: #1d8b49;
}

.ce-whatsapp-selection-dock .dock-action.ghost {
  min-width: 88px;
}

@media (max-width: 720px) {
  .ce-whatsapp-selection-dock {
    width: calc(100vw - 24px);
    max-width: none;
    gap: 8px;
    padding: 7px 8px;
  }

  .ce-whatsapp-selection-dock .selection-action-dock__summary {
    min-width: 0;
    flex: 1;
  }

  .ce-whatsapp-selection-dock .selection-action-dock__copy span,
  .ce-whatsapp-selection-dock .ce-page-action span,
  .ce-whatsapp-selection-dock .dock-action.ghost span {
    display: none;
  }

  .ce-whatsapp-selection-dock .dock-action,
  .ce-whatsapp-selection-dock .dock-action.whatsapp,
  .ce-whatsapp-selection-dock .dock-action.ghost {
    min-width: 40px;
    width: 40px;
    padding: 0;
  }

  .ce-whatsapp-selection-dock .dock-action.whatsapp {
    width: auto;
    min-width: 110px;
    padding: 0 13px;
  }
}
</style>
