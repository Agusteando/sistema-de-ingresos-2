<template>
  <Teleport to="body">
    <Transition name="selection-dock">
      <div v-if="selectedCount > 0" class="selection-action-dock ce-selection-dock">
        <div class="selection-action-dock__summary">
          <div class="selection-action-dock__count">{{ selectedCount }}</div>
          <div class="selection-action-dock__copy">
            <strong>{{ selectedCount }} {{ selectedCount === 1 ? 'seleccionado' : 'seleccionados' }}</strong>
            <span>Control Escolar</span>
          </div>
        </div>

        <div class="selection-action-dock__actions ce-selection-actions">
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

          <div class="ce-husky-bulk-group" aria-label="Acciones masivas de Husky Pass">
            <span class="ce-husky-bulk-group__brand" aria-hidden="true">
              <img src="/brand/husky-pass-header-gray.png" alt="" />
            </span>
            <button
              type="button"
              class="dock-action husky-generate"
              :disabled="huskyBusy"
              title="Generar Husky Pass únicamente para alumnos que todavía no tienen acceso"
              @click="$emit('generate-husky-missing')"
            >
              <LucideKeyRound :size="16" />
              <span>Generar faltantes</span>
              <b v-if="missingHuskyCount > 0">{{ missingHuskyCount }}</b>
            </button>
            <button
              type="button"
              class="dock-action husky-send"
              :disabled="huskyBusy"
              title="Enviar los accesos Husky Pass existentes de los alumnos seleccionados"
              @click="$emit('send-husky')"
            >
              <LucideSend :size="16" />
              <span>Enviar accesos</span>
            </button>
          </div>

          <button type="button" class="dock-action email" :disabled="huskyBusy" @click="$emit('open-email')">
            <LucideMail :size="17" />
            <span>Email</span>
          </button>
          <button type="button" class="dock-action whatsapp" :disabled="huskyBusy" @click="$emit('open-whatsapp')">
            <LucideMessageCircle :size="17" />
            <span>WhatsApp</span>
          </button>
          <button type="button" class="dock-action ghost" :disabled="huskyBusy" @click="$emit('clear')">
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
import {
  LucideFilter,
  LucideKeyRound,
  LucideListChecks,
  LucideMail,
  LucideMessageCircle,
  LucideSend,
  LucideX,
} from 'lucide-vue-next'

const props = defineProps({
  selectedCount: { type: Number, default: 0 },
  filteredCount: { type: Number, default: 0 },
  filterTargetCount: { type: Number, default: 0 },
  filterSelected: { type: Boolean, default: false },
  pageSelected: { type: Boolean, default: false },
  missingHuskyCount: { type: Number, default: 0 },
  huskyBusy: { type: Boolean, default: false },
})

const filterActionTitle = computed(() => {
  if (props.filterSelected) return `Quitar ${props.filterTargetCount} alumnos filtrados de la selección`
  if (props.filteredCount > props.filterTargetCount) {
    return `Seleccionar ${props.filterTargetCount} de ${props.filteredCount} alumnos filtrados (máximo por selección)`
  }
  return `Seleccionar los ${props.filterTargetCount} alumnos filtrados`
})

defineEmits([
  'toggle-filter',
  'toggle-page',
  'generate-husky-missing',
  'send-husky',
  'open-email',
  'open-whatsapp',
  'clear',
])
</script>

<style scoped>
.ce-selection-dock {
  max-width: calc(100vw - 40px);
}

.ce-selection-dock .selection-action-dock__summary {
  min-width: 156px;
}

.ce-selection-actions {
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.ce-selection-actions::-webkit-scrollbar {
  display: none;
}

.ce-selection-dock .dock-action {
  min-width: 104px;
  flex: 0 0 auto;
}

.ce-selection-dock .dock-action:disabled {
  cursor: wait;
  opacity: .5;
}

.ce-selection-dock .ce-filter-action {
  min-width: 142px;
}

.ce-selection-dock .ce-filter-action.active {
  border-color: rgba(45, 111, 184, .26);
  background: #f1f6fc;
  color: #356b9d;
}

.ce-selection-dock .ce-filter-action b,
.ce-selection-dock .husky-generate b {
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

.ce-husky-bulk-group {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 5px;
  padding: 3px;
  border: 1px solid rgba(76, 103, 92, .14);
  border-radius: 12px;
  background: rgba(247, 250, 248, .88);
}

.ce-husky-bulk-group__brand {
  display: inline-grid;
  width: 30px;
  height: 30px;
  place-items: center;
  overflow: hidden;
  border-radius: 9px;
  background: #fff;
}

.ce-husky-bulk-group__brand img {
  width: 27px;
  height: 27px;
  object-fit: contain;
  opacity: .72;
}

.ce-selection-dock .dock-action.husky-generate,
.ce-selection-dock .dock-action.husky-send {
  min-width: 138px;
  height: 38px;
  border: 0;
  box-shadow: none;
}

.ce-selection-dock .dock-action.husky-generate {
  background: #fff;
  color: #3d6751;
}

.ce-selection-dock .dock-action.husky-send {
  background: #eef7f1;
  color: #267140;
}

.ce-selection-dock .dock-action.email {
  min-width: 112px;
  border-color: rgba(71, 122, 169, .24);
  background: linear-gradient(180deg, #f4f8fc, #edf4fa);
  color: #3d70a0;
}

.ce-selection-dock .dock-action.whatsapp {
  min-width: 126px;
  border-color: rgba(37, 165, 93, .26);
  background: linear-gradient(180deg, #f3fbf6, #edf9f1);
  color: #1d8b49;
}

.ce-selection-dock .dock-action.ghost {
  min-width: 88px;
}

@media (max-width: 900px) {
  .ce-selection-dock {
    width: calc(100vw - 24px);
    max-width: none;
    gap: 8px;
    padding: 7px 8px;
  }

  .ce-selection-dock .selection-action-dock__summary {
    min-width: 116px;
  }

  .ce-selection-dock .selection-action-dock__copy span,
  .ce-selection-dock .ce-filter-action span,
  .ce-selection-dock .ce-page-action span,
  .ce-selection-dock .dock-action.ghost span {
    display: none;
  }

  .ce-selection-dock .dock-action,
  .ce-selection-dock .ce-filter-action,
  .ce-selection-dock .dock-action.ghost {
    min-width: 40px;
    width: 40px;
    padding: 0;
  }

  .ce-husky-bulk-group__brand {
    display: none;
  }

  .ce-selection-dock .dock-action.husky-generate,
  .ce-selection-dock .dock-action.husky-send {
    width: auto;
    min-width: 112px;
    padding: 0 10px;
  }

  .ce-selection-dock .dock-action.email,
  .ce-selection-dock .dock-action.whatsapp {
    width: auto;
    min-width: 84px;
    padding: 0 10px;
  }
}

@media (max-width: 560px) {
  .ce-selection-dock .selection-action-dock__copy {
    display: none;
  }

  .ce-selection-dock .selection-action-dock__summary {
    min-width: 40px;
  }

  .ce-selection-dock .dock-action.husky-generate span,
  .ce-selection-dock .dock-action.husky-send span {
    display: none;
  }

  .ce-selection-dock .dock-action.husky-generate,
  .ce-selection-dock .dock-action.husky-send {
    min-width: 40px;
    width: 40px;
    padding: 0;
  }
}
</style>
