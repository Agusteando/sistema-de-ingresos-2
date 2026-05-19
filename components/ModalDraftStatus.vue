<template>
  <div v-if="restored || visibleState" class="modal-draft-status" role="status" aria-live="polite">
    <span v-if="restored" class="modal-draft-pill restored">
      <LucideInfo :size="15" :stroke-width="2.2" />
      Se restauró información no guardada.
    </span>

    <span v-if="status === 'saving'" class="modal-draft-pill saving">
      <LucideLoader2 class="animate-spin" :size="15" :stroke-width="2.2" />
      Guardando borrador…
    </span>
    <span v-else-if="status === 'saved'" class="modal-draft-pill saved">
      <LucideCheckCircle :size="15" :stroke-width="2.2" />
      Borrador guardado
    </span>
    <span v-else-if="status === 'error'" class="modal-draft-pill error">
      <LucideAlertCircle :size="15" :stroke-width="2.2" />
      No se pudo guardar el borrador local
    </span>
    <span v-else-if="dirty" class="modal-draft-pill pending">
      <LucideCloud :size="15" :stroke-width="2.2" />
      Cambios pendientes
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { LucideAlertCircle, LucideCheckCircle, LucideCloud, LucideInfo, LucideLoader2 } from 'lucide-vue-next'

const props = defineProps({
  restored: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    default: 'idle'
  },
  dirty: {
    type: Boolean,
    default: false
  }
})

const visibleState = computed(() => props.dirty || props.status === 'saving' || props.status === 'saved' || props.status === 'error')
</script>
