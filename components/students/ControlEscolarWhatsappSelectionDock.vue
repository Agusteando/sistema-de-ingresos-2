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
          <button
            v-if="filterTargetCount > 0"
            type="button"
            :class="['dock-action secondary ce-filter-action', { active: filterSelected }]"
            :title="filterActionTitle"
            @click="$emit('toggle-filter')"
          >
            <LucideFilter :size="16" />
            <span>{{ filterSelected ? 'Quitar filtro' : 'Todo el filtro' }}</span>
            <b>{{ filterTargetCount }}</b>
          </button>
          <button type="button" class="dock-action secondary ce-page-action" @click="$emit('toggle-page')">
            <LucideListChecks :size="16" />
            <span>{{ pageSelected ? 'Quitar página' : 'Página' }}</span>
          </button>
          <button type="button" class="dock-action email" @click="$emit('open-email')">
            <LucideMail :size="17" />
            <span>Email</span>
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
import { computed } from 'vue'
import { LucideFilter, LucideListChecks, LucideMail, LucideMessageCircle, LucideX } from 'lucide-vue-next'

const props = defineProps({
  selectedCount: { type: Number, default: 0 },
  filteredCount: { type: Number, default: 0 },
  filterTargetCount: { type: Number, default: 0 },
  filterSelected: { type: Boolean, default: false },
  pageSelected: { type: Boolean, default: false }
})

const filterActionTitle = computed(() => {
  if (props.filterSelected) return `Quitar ${props.filterTargetCount} alumnos filtrados de la selección`
  if (props.filteredCount > props.filterTargetCount) {
    return `Seleccionar ${props.filterTargetCount} de ${props.filteredCount} alumnos filtrados (máximo por selección)`
  }
  return `Seleccionar los ${props.filterTargetCount} alumnos filtrados`
})

defineEmits(['toggle-filter', 'toggle-page', 'open-email', 'open-whatsapp', 'clear'])
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

.ce-whatsapp-selection-dock .ce-filter-action {
  min-width: 142px;
}

.ce-whatsapp-selection-dock .ce-filter-action.active {
  border-color: rgba(45, 111, 184, .26);
  background: #f1f6fc;
  color: #356b9d;
}

.ce-whatsapp-selection-dock .ce-filter-action b {
  display: inline-grid;
  min-width: 20px;
  height: 20px;
  place-items: center;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(53, 107, 157, .11);
  color: inherit;
  font-size: 10px;
}


.ce-whatsapp-selection-dock .dock-action.email {
  min-width: 112px;
  border-color: rgba(71, 122, 169, .24);
  background: linear-gradient(180deg, #f4f8fc, #edf4fa);
  color: #3d70a0;
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
  .ce-whatsapp-selection-dock .ce-filter-action span,
  .ce-whatsapp-selection-dock .ce-page-action span,
  .ce-whatsapp-selection-dock .dock-action.ghost span {
    display: none;
  }

  .ce-whatsapp-selection-dock .dock-action,
  .ce-whatsapp-selection-dock .ce-filter-action,
  .ce-whatsapp-selection-dock .dock-action.ghost {
    min-width: 40px;
    width: 40px;
    padding: 0;
  }

  .ce-whatsapp-selection-dock .dock-action.email,
  .ce-whatsapp-selection-dock .dock-action.whatsapp {
    width: auto;
    min-width: 92px;
    padding: 0 11px;
  }
}
</style>
