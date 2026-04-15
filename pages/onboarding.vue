<template>
  <div class="min-h-screen flex items-center justify-center bg-[#F4F6F8] px-4 font-sans relative overflow-hidden">
    <div class="max-w-2xl w-full bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white p-8 relative z-10">
      <div class="text-center mb-6">
        <h1 class="text-xl font-bold text-gray-800 mb-2">Configuración Inicial</h1>
        <p class="text-gray-500 text-sm">Seleccione los planteles a los que tendrá acceso.</p>
      </div>
      
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <label v-for="p in PLANTELES_LIST" :key="p" class="flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-gray-100 cursor-pointer hover:bg-brand-leaf/5 transition-all" :class="{ '!border-brand-leaf bg-brand-leaf/5': selected.includes(p) }">
          <input type="checkbox" :value="p" v-model="selected" class="w-4 h-4 text-brand-leaf border-gray-300 rounded focus:ring-brand-leaf">
          <span class="font-semibold text-gray-700 text-sm">{{ p }}</span>
        </label>
      </div>

      <div class="flex justify-between items-center">
        <span class="text-xs font-semibold text-gray-400 uppercase"><span class="text-brand-campus">{{ selected.length }}</span> Seleccionados</span>
        <button @click="submit" class="btn btn-primary px-6" :disabled="loading || selected.length === 0">Guardar</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { PLANTELES_LIST } from '~/utils/constants'
import { useToast } from '~/composables/useToast'

definePageMeta({ layout: false })
const { show } = useToast()
const selected = ref([])
const loading = ref(false)

const submit = async () => {
  loading.value = true
  try {
    await $fetch('/api/auth/onboarding', { method: 'POST', body: { planteles: selected.value } })
    window.location.href = '/'
  } catch(e) { 
    show('Error al guardar.', 'danger') 
  } finally { 
    loading.value = false 
  }
}
</script>