<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-container concept-modal">
        <div class="modal-header">
          <div>
            <h2 class="modal-title">Ajustar concepto</h2>
            <p class="modal-subtitle">{{ debt?.conceptoNombre }} · {{ debt?.mesLabel }}</p>
          </div>
          <button class="modal-icon-button" type="button" aria-label="Cerrar" @click="$emit('close')">
            <LucideX :size="18" />
          </button>
        </div>

        <div class="modal-content concept-content">
          <section class="operation-card">
            <div class="operation-heading">
              <LucideReplace :size="17" />
              <div>
                <strong>Cambiar desde {{ debt?.mesLabel }}</strong>
                <span>Los meses anteriores conservan su concepto e historial.</span>
              </div>
            </div>

            <label class="form-label">Nuevo concepto</label>
            <select v-model="selectedConceptId" class="input-field" :disabled="loadingConcepts || busy">
              <option disabled value="">{{ loadingConcepts ? 'Cargando conceptos...' : 'Seleccione un concepto' }}</option>
              <option v-for="concept in conceptos" :key="concept.id" :value="concept.id">
                {{ concept.concepto }} - ${{ Number(concept.costo || 0).toFixed(2) }}
              </option>
            </select>

            <button class="btn btn-primary operation-button" type="button" :disabled="busy || !selectedConceptId" @click="submitChange">
              <LucideLoader2 v-if="busyAction === 'change'" class="animate-spin" :size="15" />
              <LucideCheckCircle v-else :size="15" />
              Aplicar cambio
            </button>
          </section>

          <section class="operation-card calm-danger">
            <div class="operation-heading">
              <LucideBan :size="17" />
              <div>
                <strong>Cancelar cargos</strong>
                <span>La cancelación completa solo procede cuando no hay pagos vigentes.</span>
              </div>
            </div>

            <div class="operation-actions">
              <button class="btn btn-outline" type="button" :disabled="busy" @click="cancelFromMonth">
                <LucideLoader2 v-if="busyAction === 'cancel_from'" class="animate-spin" :size="15" />
                <LucideCalendarX v-else :size="15" />
                Cancelar desde este mes
              </button>
              <button class="btn btn-danger" type="button" :disabled="busy" @click="cancelFull">
                <LucideLoader2 v-if="busyAction === 'cancel_full'" class="animate-spin" :size="15" />
                <LucideBan v-else :size="15" />
                Cancelar completo
              </button>
            </div>
          </section>
        </div>

        <div class="modal-footer">
          <button class="btn btn-ghost" type="button" :disabled="busy" @click="$emit('close')">Cerrar</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useState } from '#app'
import { LucideBan, LucideCalendarX, LucideCheckCircle, LucideLoader2, LucideReplace, LucideX } from 'lucide-vue-next'
import { useScrollLock } from '~/composables/useScrollLock'
import { useToast } from '~/composables/useToast'
import { normalizeCicloKey } from '~/shared/utils/ciclo'

const props = defineProps({ debt: Object })
const emit = defineEmits(['close', 'success'])
const state = useState('globalState')
const { show } = useToast()

useScrollLock()

const conceptos = ref([])
const selectedConceptId = ref('')
const loadingConcepts = ref(false)
const busyAction = ref('')

const busy = computed(() => Boolean(busyAction.value))

const loadConcepts = async () => {
  loadingConcepts.value = true
  try {
    conceptos.value = await $fetch('/api/conceptos', {
      params: { ciclo: normalizeCicloKey(state.value.ciclo) }
    })
  } catch (e) {
    show('No se pudieron cargar los conceptos', 'danger')
  } finally {
    loadingConcepts.value = false
  }
}

const runOperation = async (action, extraBody = {}) => {
  if (!props.debt?.documento) return

  busyAction.value = action
  try {
    await $fetch('/api/documentos/period', {
      method: 'POST',
      body: {
        action,
        documento: props.debt.documento,
        fromMes: props.debt.mes,
        ciclo: normalizeCicloKey(state.value.ciclo),
        ...extraBody
      }
    })
    show('Concepto actualizado', 'success')
    emit('success')
  } catch (e) {
    show(e?.data?.message || 'No se pudo ajustar el concepto', 'danger')
  } finally {
    busyAction.value = ''
  }
}

const submitChange = () => {
  if (!selectedConceptId.value) return
  runOperation('change', { conceptoId: selectedConceptId.value })
}

const cancelFromMonth = () => {
  if (!confirm(`Cancelar los cargos de ${props.debt?.mesLabel || 'este mes'} en adelante?`)) return
  runOperation('cancel_from')
}

const cancelFull = () => {
  if (!confirm('Cancelar el concepto completo? Esta operacion se bloqueara si existen pagos vigentes.')) return
  runOperation('cancel_full')
}

onMounted(loadConcepts)
</script>

<style scoped>
.concept-modal {
  max-width: 620px;
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

.concept-content {
  display: grid;
  gap: 14px;
}

.operation-card {
  border: 1px solid #dce8d8;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(248, 253, 246, 0.98), rgba(255, 255, 255, 0.98));
  padding: 16px;
  box-shadow: 0 12px 30px rgba(22, 38, 65, 0.045);
}

.operation-card.calm-danger {
  border-color: #f0d8d5;
  background: linear-gradient(135deg, rgba(255, 248, 247, 0.98), rgba(255, 255, 255, 0.98));
}

.operation-heading {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
  color: #427d3c;
}

.calm-danger .operation-heading {
  color: #b85a54;
}

.operation-heading strong {
  display: block;
  color: #263752;
  font-size: 0.86rem;
  font-weight: 760;
  line-height: 1.2;
}

.operation-heading span {
  display: block;
  margin-top: 3px;
  color: #7b8798;
  font-size: 0.72rem;
  font-weight: 520;
  line-height: 1.35;
}

.operation-button {
  margin-top: 12px;
}

.operation-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
</style>
