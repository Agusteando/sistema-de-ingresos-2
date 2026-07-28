<template>
  <Teleport to="body">
    <Transition name="corte-users-modal" appear>
      <div class="corte-users-backdrop" @click.self="closeModal">
        <section
          class="corte-users-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="corte-users-title"
          aria-describedby="corte-users-description"
        >
          <header class="corte-users-header">
            <span class="corte-users-icon" aria-hidden="true">
              <LucideUsers :size="22" />
            </span>
            <div>
              <h3 id="corte-users-title">Selecciona los usuarios</h3>
              <p id="corte-users-description">
                El corte en pantalla y el PDF conservan todos los movimientos. Elige cuáles incluir únicamente en este Excel.
              </p>
            </div>
            <button ref="closeButton" class="corte-users-close" type="button" aria-label="Cerrar" :disabled="loading" @click="closeModal">
              <LucideX :size="18" />
            </button>
          </header>

          <div class="corte-users-context">
            <span><strong>Plantel:</strong> {{ plantel }}</span>
            <span><strong>Periodo:</strong> {{ periodLabel }}</span>
          </div>

          <div class="corte-users-toolbar">
            <span>{{ selectedKeys.length }} de {{ users.length }} seleccionados</span>
            <button type="button" :disabled="loading" @click="toggleAll">
              {{ allSelected ? 'Quitar selección' : 'Seleccionar todos' }}
            </button>
          </div>

          <div class="corte-users-list">
            <label v-for="user in users" :key="user.key" class="corte-user-option" :class="{ selected: selectedSet.has(user.key) }">
              <input
                v-model="selectedKeys"
                type="checkbox"
                :value="user.key"
                :disabled="loading"
              >
              <span class="corte-user-check" aria-hidden="true">
                <LucideCheck :size="14" />
              </span>
              <span class="corte-user-copy">
                <strong>{{ user.nombre || user.email || 'No identificado' }}</strong>
                <small v-if="user.email && user.nombre && user.nombre.toLowerCase() !== user.email">{{ user.email }}</small>
                <small v-else-if="!user.nombre && !user.email">Sin usuario registrado</small>
              </span>
              <span class="corte-user-stats">
                <strong>{{ formatCurrency(user.total) }}</strong>
                <small>{{ user.movimientos }} {{ user.movimientos === 1 ? 'movimiento' : 'movimientos' }}</small>
              </span>
            </label>
          </div>

          <footer class="corte-users-actions">
            <button class="btn btn-outline" type="button" :disabled="loading" @click="closeModal">
              Cancelar
            </button>
            <button class="btn btn-primary" type="button" :disabled="loading || !selectedKeys.length" @click="confirmSelection">
              <LucideLoader2 v-if="loading" class="animate-spin" :size="16" />
              <LucideDownload v-else :size="16" />
              Generar Excel
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { LucideCheck, LucideDownload, LucideLoader2, LucideUsers, LucideX } from 'lucide-vue-next'
import { useModalEscape } from '~/composables/useModalEscape'
import { useScrollLock } from '~/composables/useScrollLock'

const props = defineProps({
  users: {
    type: Array,
    default: () => []
  },
  plantel: {
    type: String,
    default: ''
  },
  periodLabel: {
    type: String,
    default: 'Periodo completo'
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['cancel', 'confirm'])
const closeButton = ref(null)
const selectedKeys = ref(props.users.map(user => user.key))
const selectedSet = computed(() => new Set(selectedKeys.value))
const allSelected = computed(() => props.users.length > 0 && selectedKeys.value.length === props.users.length)

const closeModal = () => {
  if (!props.loading) emit('cancel')
}

const toggleAll = () => {
  selectedKeys.value = allSelected.value ? [] : props.users.map(user => user.key)
}

const confirmSelection = () => {
  if (!props.loading && selectedKeys.value.length) emit('confirm', [...selectedKeys.value])
}

const formatCurrency = value => new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN'
}).format(Number(value || 0))

onMounted(async () => {
  await nextTick()
  closeButton.value?.focus?.()
})

useScrollLock()
useModalEscape(closeModal, { enabled: () => !props.loading })
</script>

<style scoped>
.corte-users-backdrop {
  position: fixed;
  z-index: 1200;
  inset: 0;
  display: grid;
  place-items: center;
  overflow-y: auto;
  background: rgba(12, 23, 40, 0.58);
  padding: 20px;
  backdrop-filter: blur(5px);
}

.corte-users-card {
  width: min(620px, 100%);
  max-height: min(760px, calc(100vh - 40px));
  overflow: hidden;
  border: 1px solid rgba(216, 226, 237, 0.95);
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 28px 70px rgba(9, 24, 44, 0.26);
}

.corte-users-header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  border-bottom: 1px solid #e8eef5;
  padding: 18px 20px;
}

.corte-users-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 13px;
  background: #eaf8e7;
  color: #2f7237;
}

.corte-users-header h3 {
  margin: 1px 0 4px;
  color: #162641;
  font-size: 1.02rem;
  font-weight: 850;
}

.corte-users-header p {
  margin: 0;
  color: #66728a;
  font-size: 0.8rem;
  line-height: 1.45;
}

.corte-users-close {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #718096;
}

.corte-users-close:hover:not(:disabled) {
  background: #f1f5f9;
  color: #162641;
}

.corte-users-context {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  border-bottom: 1px solid #edf2f7;
  background: #f8fafc;
  color: #5f6d82;
  padding: 10px 20px;
  font-size: 0.74rem;
}

.corte-users-context strong {
  color: #314158;
}

.corte-users-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 20px 10px;
  color: #66728a;
  font-size: 0.74rem;
  font-weight: 720;
}

.corte-users-toolbar button {
  border: 0;
  background: transparent;
  color: #2f7237;
  font-size: 0.74rem;
  font-weight: 820;
}

.corte-users-list {
  display: grid;
  max-height: 390px;
  gap: 8px;
  overflow-y: auto;
  padding: 0 20px 16px;
}

.corte-user-option {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  gap: 11px;
  align-items: center;
  border: 1px solid #dfe6ef;
  border-radius: 14px;
  background: #fff;
  padding: 12px 13px;
  cursor: pointer;
  transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
}

.corte-user-option:hover,
.corte-user-option.selected {
  border-color: #93be87;
  background: #f8fcf7;
}

.corte-user-option.selected {
  box-shadow: 0 0 0 2px rgba(101, 167, 68, 0.08);
}

.corte-user-option input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.corte-user-check {
  display: grid;
  width: 21px;
  height: 21px;
  place-items: center;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: transparent;
}

.corte-user-option.selected .corte-user-check {
  border-color: #4f8d48;
  background: #4f8d48;
  color: #fff;
}

.corte-user-copy,
.corte-user-stats {
  min-width: 0;
}

.corte-user-copy strong,
.corte-user-copy small,
.corte-user-stats strong,
.corte-user-stats small {
  display: block;
}

.corte-user-copy strong {
  overflow: hidden;
  color: #24344d;
  font-size: 0.82rem;
  font-weight: 820;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.corte-user-copy small,
.corte-user-stats small {
  margin-top: 2px;
  color: #78859a;
  font-size: 0.69rem;
}

.corte-user-stats {
  text-align: right;
}

.corte-user-stats strong {
  color: #2f7237;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
}

.corte-users-actions {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  border-top: 1px solid #e8eef5;
  padding: 14px 20px;
}

.corte-users-modal-enter-active,
.corte-users-modal-leave-active {
  transition: opacity 160ms ease;
}

.corte-users-modal-enter-active .corte-users-card,
.corte-users-modal-leave-active .corte-users-card {
  transition: transform 180ms ease, opacity 160ms ease;
}

.corte-users-modal-enter-from,
.corte-users-modal-leave-to {
  opacity: 0;
}

.corte-users-modal-enter-from .corte-users-card,
.corte-users-modal-leave-to .corte-users-card {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
}

@media (max-width: 560px) {
  .corte-users-backdrop {
    align-items: end;
    padding: 0;
  }

  .corte-users-card {
    max-height: 92vh;
    border-radius: 20px 20px 0 0;
  }

  .corte-user-option {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .corte-user-option input {
    grid-column: 1;
  }

  .corte-user-check {
    grid-column: 1;
    grid-row: 1 / span 2;
  }

  .corte-user-copy,
  .corte-user-stats {
    grid-column: 2;
    text-align: left;
  }

  .corte-users-actions .btn {
    flex: 1;
  }
}
</style>
