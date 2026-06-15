<template>
  <div class="min-h-screen flex items-center justify-center bg-[#F4F6F8] px-4 font-sans relative overflow-hidden">
    <div v-if="step === 'planteles'" class="max-w-2xl w-full bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white p-8 relative z-10">
      <div class="text-center mb-6">
        <h1 class="text-xl font-bold text-gray-800 mb-2">Configuración inicial</h1>
        <p class="text-gray-500 text-sm">Selecciona el plantel con el que iniciarás.</p>
      </div>

      <div v-if="loadingOptions" class="text-center text-sm text-gray-500 py-8">
        Cargando planteles asignados...
      </div>
      <div v-else-if="optionsError" class="text-center text-sm text-red-600 py-8">
        {{ optionsError }}
      </div>
      <div v-else class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <label
          v-for="p in availablePlanteles"
          :key="p"
          class="flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer hover:bg-brand-leaf/5 transition-all"
          :class="selectedPlantel === p ? 'border-brand-leaf bg-brand-leaf/5' : 'border-gray-100'"
        >
          <input v-model="selectedPlantel" type="radio" name="plantel-inicial" :value="p" class="w-4 h-4 text-brand-leaf border-gray-300 focus:ring-brand-leaf">
          <span class="font-semibold text-gray-700 text-sm">{{ p }}</span>
        </label>
      </div>

      <div class="flex justify-end items-center">
        <button class="btn btn-primary px-6" :disabled="loading || loadingOptions || !selectedPlantel" @click="submitPlantel">
          Continuar
        </button>
      </div>
    </div>

    <div v-else class="max-w-3xl w-full relative z-10">
      <WhatsappOnboarding show-skip @skip="finish" @ready="finish" />
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useToast } from '~/composables/useToast'
import WhatsappOnboarding from '~/components/WhatsappOnboarding.vue'

definePageMeta({ layout: false })

const { show } = useToast()
const availablePlanteles = ref([])
const selectedPlantel = ref('')
const loadingOptions = ref(true)
const optionsError = ref('')
const loading = ref(false)
const step = ref('planteles')
const redirectTo = ref('/control-escolar')

const loadOptions = async () => {
  loadingOptions.value = true
  optionsError.value = ''
  try {
    const response = await $fetch('/api/control-escolar/options')
    availablePlanteles.value = Array.isArray(response?.planteles) ? response.planteles : []
    selectedPlantel.value = availablePlanteles.value.includes(response?.activePlantel)
      ? response.activePlantel
      : (availablePlanteles.value[0] || '')
    if (!availablePlanteles.value.length) optionsError.value = 'No hay planteles asignados a esta cuenta.'
  } catch (error) {
    optionsError.value = error?.data?.message || error?.message || 'No se pudieron cargar los planteles asignados.'
  } finally {
    loadingOptions.value = false
  }
}

const submitPlantel = async () => {
  if (!selectedPlantel.value) return
  loading.value = true
  try {
    const response = await $fetch('/api/auth/onboarding', {
      method: 'POST',
      body: { planteles: [selectedPlantel.value] }
    })
    redirectTo.value = response?.redirectTo || '/control-escolar'
    step.value = 'whatsapp'
  } catch (error) {
    show(error?.data?.message || error?.message || 'No se pudo guardar el plantel inicial.', 'danger')
  } finally {
    loading.value = false
  }
}

const finish = () => {
  window.location.href = redirectTo.value
}

onMounted(loadOptions)
</script>
