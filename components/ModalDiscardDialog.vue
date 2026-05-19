<template>
  <Transition name="modal-safety-dialog">
    <div v-if="show" class="modal-safety-layer" @click.self="emit('continue')">
      <section
        class="modal-safety-card"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="descriptionId"
        @click.stop
      >
        <span class="modal-safety-icon" aria-hidden="true">
          <LucideAlertTriangle :size="30" :stroke-width="1.9" />
        </span>

        <div class="modal-safety-copy">
          <h3 :id="titleId">Hay información sin guardar.</h3>
          <p :id="descriptionId">¿Quieres salir y descartar los cambios?</p>
          <small>Los cambios que hiciste no se guardarán. Puedes continuar editando o descartarlos.</small>
        </div>

        <div class="modal-safety-actions">
          <button ref="continueButton" class="modal-safety-primary" type="button" @click="emit('continue')">
            Continuar editando
          </button>
          <button class="modal-safety-discard" type="button" @click="emit('discard')">
            Descartar cambios
          </button>
        </div>
      </section>
    </div>
  </Transition>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'
import { LucideAlertTriangle } from 'lucide-vue-next'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['continue', 'discard'])
const continueButton = ref(null)
const idSuffix = Math.random().toString(36).slice(2, 8)
const titleId = `modal-unsaved-title-${idSuffix}`
const descriptionId = `modal-unsaved-description-${idSuffix}`

watch(
  () => props.show,
  async (show) => {
    if (!show) return
    await nextTick()
    continueButton.value?.focus?.()
  },
  { immediate: true }
)
</script>
