<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-container direct-concept-modal">
        <div class="modal-header">
          <div>
            <h2 class="modal-title">Cambiar concepto</h2>
            <p class="modal-subtitle">Doc. {{ debt?.documento }}</p>
          </div>
          <button
            class="modal-icon-button"
            type="button"
            aria-label="Cerrar"
            @click="$emit('close')"
          >
            <LucideX :size="18" />
          </button>
        </div>

        <div class="modal-content direct-concept-content">
          <section class="direct-concept-card">
            <div class="direct-token">
              <small>Actual</small>
              <strong>{{ debt?.conceptoNombre || 'Concepto' }}</strong>
            </div>
            <LucideArrowRight class="direct-arrow" :size="16" />
            <div class="direct-token active">
              <small>Nuevo</small>
              <strong>{{ selectedConcept?.concepto || 'Seleccionar' }}</strong>
            </div>
          </section>

          <label class="field-block">
            <span>Concepto</span>
            <ConceptSearchSelect
              v-model="selectedConceptId"
              :concepts="conceptos"
              :loading="loadingConcepts"
              :disabled="busy"
              placeholder="Buscar concepto..."
            />
          </label>

          <section class="direct-preview">
            <span>{{ debt?.conceptoNombre || 'Actual' }}</span>
            <LucideArrowRight :size="14" />
            <strong>{{ selectedConcept?.concepto || 'Nuevo concepto' }}</strong>
            <em>Importe sin cambios</em>
          </section>

          <div class="modal-action-row">
            <button class="btn btn-outline" type="button" :disabled="busy" @click="$emit('close')">
              Cancelar
            </button>
            <button
              class="btn btn-primary"
              type="button"
              :disabled="busy || !selectedConceptId || String(selectedConceptId) === String(debt?.conceptoId || debt?.concepto)"
              @click="submit"
            >
              <LucideLoader2 v-if="busy" class="animate-spin" :size="15" />
              <LucideCheckCircle v-else :size="15" />
              Cambiar
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useState } from '#app'
import { LucideArrowRight, LucideCheckCircle, LucideLoader2, LucideX } from 'lucide-vue-next'
import ConceptSearchSelect from '~/components/ConceptSearchSelect.vue'
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
const busy = ref(false)

const selectedConcept = computed(() =>
  conceptos.value.find((item) => String(item.id) === String(selectedConceptId.value)) || null,
)

const loadConcepts = async () => {
  loadingConcepts.value = true
  try {
    const rows = await $fetch('/api/conceptos', {
      params: { ciclo: normalizeCicloKey(state.value.ciclo) },
    })
    conceptos.value = Array.isArray(rows) ? rows : []
  } catch (error) {
    show(error?.data?.message || 'No se pudieron cargar los conceptos', 'danger')
  } finally {
    loadingConcepts.value = false
  }
}

const submit = async () => {
  if (!props.debt?.documento || !selectedConceptId.value || busy.value) return
  busy.value = true
  try {
    await $fetch(`/api/documentos/${props.debt.documento}/concepto`, {
      method: 'PUT',
      body: {
        conceptoId: selectedConceptId.value,
        ciclo: normalizeCicloKey(state.value.ciclo),
      },
    })
    show('Concepto actualizado', 'success')
    emit('success')
  } catch (error) {
    show(error?.data?.message || 'No se pudo cambiar el concepto', 'danger')
  } finally {
    busy.value = false
  }
}

onMounted(loadConcepts)
</script>

<style scoped>
.direct-concept-modal {
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
}

.direct-concept-content {
  display: grid;
  gap: 14px;
}

.direct-concept-card,
.direct-preview {
  border: 1px solid #e1e8f0;
  border-radius: 16px;
  background: #fff;
  padding: 14px;
}

.direct-concept-card {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  background: linear-gradient(135deg, #f7fbff, #ffffff);
}

.direct-token {
  min-width: 0;
  border-radius: 14px;
  background: #f5f7fa;
  padding: 10px 12px;
}

.direct-token.active {
  background: #eef8eb;
}

.direct-token small,
.field-block span {
  display: block;
  color: #7b8798;
  font-size: 0.68rem;
  font-weight: 760;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.direct-token strong {
  display: block;
  overflow: hidden;
  margin-top: 3px;
  color: #263752;
  font-size: 0.86rem;
  font-weight: 820;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.direct-arrow {
  color: #9aa6b6;
}

.field-block {
  display: grid;
  gap: 7px;
}

.direct-preview {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: #6f7b8f;
  font-size: 0.78rem;
  font-weight: 720;
}

.direct-preview strong {
  color: #263752;
}

.direct-preview em {
  margin-left: auto;
  border-radius: 999px;
  background: #f5f7fa;
  color: #6f7b8f;
  padding: 5px 9px;
  font-size: 0.7rem;
  font-style: normal;
  font-weight: 800;
}

.modal-action-row {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 640px) {
  .direct-concept-card {
    grid-template-columns: 1fr;
  }

  .direct-arrow {
    display: none;
  }

  .modal-action-row {
    flex-direction: column;
  }
}
</style>
