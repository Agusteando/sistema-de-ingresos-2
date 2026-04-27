<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-container baja-modal">
        <div class="modal-header">
          <div>
            <h2 class="modal-title">Dar de baja</h2>
            <p class="modal-subtitle">{{ student?.nombreCompleto }}</p>
          </div>
          <button class="modal-icon-button" type="button" aria-label="Cerrar" @click="$emit('close')">
            <LucideX :size="18" />
          </button>
        </div>

        <div class="modal-content">
          <div class="reason-grid">
            <button
              v-for="reason in presetReasons"
              :key="reason"
              type="button"
              :class="['reason-option', selectedReason === reason ? 'active' : '']"
              @click="selectReason(reason)"
            >
              {{ reason }}
            </button>
          </div>

          <Transition name="liquid-fade">
            <div v-if="requiresCustomText" class="custom-reason">
              <label class="form-label">Motivo personalizado</label>
              <textarea
                v-model.trim="customReason"
                class="input-field reason-textarea"
                rows="4"
                placeholder="Detalle brevemente el motivo de baja"
              />
            </div>
          </Transition>
        </div>

        <div class="modal-footer">
          <button class="btn btn-ghost" type="button" @click="$emit('close')">Cancelar</button>
          <button class="btn btn-danger" type="button" :disabled="!canSubmit" @click="submit">
            <LucideCheckCircle :size="16" />
            Confirmar baja
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref } from 'vue'
import { LucideCheckCircle, LucideX } from 'lucide-vue-next'
import { useScrollLock } from '~/composables/useScrollLock'

defineProps({ student: Object })
const emit = defineEmits(['close', 'confirm'])

useScrollLock()

const presetReasons = ['Cambio de domicilio', 'Económico', 'Tema pedagógico', 'Otro']
const selectedReason = ref(presetReasons[0])
const customReason = ref('')

const requiresCustomText = computed(() => ['Otro', 'Personalizado'].includes(selectedReason.value))
const finalReason = computed(() => requiresCustomText.value ? customReason.value : selectedReason.value)
const canSubmit = computed(() => Boolean(finalReason.value && finalReason.value.trim().length >= 3))

const selectReason = (reason) => {
  selectedReason.value = reason
  if (!['Otro', 'Personalizado'].includes(reason)) customReason.value = ''
}

const submit = () => {
  if (!canSubmit.value) return
  emit('confirm', finalReason.value.trim())
}
</script>

<style scoped>
.baja-modal {
  max-width: 520px;
}

.modal-title {
  margin: 0;
  color: #263752;
  font-size: 1rem;
  font-weight: 780;
}

.modal-subtitle {
  margin: 3px 0 0;
  color: #7b8798;
  font-size: 0.78rem;
  font-weight: 560;
}

.modal-icon-button {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 10px;
  background: #f4f7fa;
  color: #6f7b8f;
  transition: background 180ms ease, color 180ms ease, transform 180ms ease;
}

.modal-icon-button:hover {
  background: #edf2f7;
  color: #263752;
  transform: translateY(-1px);
}

.reason-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.reason-option {
  min-height: 46px;
  border: 1px solid #dfe6ef;
  border-radius: 10px;
  background: linear-gradient(180deg, #ffffff, #f8fafc);
  color: #344158;
  padding: 0 12px;
  font-size: 0.82rem;
  font-weight: 720;
  text-align: center;
  transition: border-color 180ms ease, box-shadow 180ms ease, color 180ms ease, transform 180ms ease;
}

.reason-option:hover {
  border-color: #bfd4be;
  color: #2f7036;
  transform: translateY(-1px);
}

.reason-option.active {
  border-color: rgba(101, 167, 68, 0.42);
  background: linear-gradient(135deg, rgba(236, 248, 230, 0.96), rgba(255, 255, 255, 0.98));
  box-shadow: inset 0 0 0 1px rgba(101, 167, 68, 0.24), 0 12px 26px rgba(22, 38, 65, 0.06);
  color: #2f7036;
}

.custom-reason {
  margin-top: 16px;
}

.reason-textarea {
  height: auto;
  min-height: 98px;
  resize: vertical;
  line-height: 1.45;
}

@media (max-width: 520px) {
  .reason-grid {
    grid-template-columns: 1fr;
  }
}
</style>
