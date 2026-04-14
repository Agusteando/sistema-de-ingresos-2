<template>
  <div class="min-h-screen flex items-center justify-center bg-[#F4F6F8] px-4 font-sans relative overflow-hidden">
    <div class="absolute top-[-10%] left-[-10%] w-96 h-96 bg-brand-leaf/20 rounded-full blur-3xl pointer-events-none"></div>
    <div class="absolute bottom-[-10%] right-[-10%] w-[30rem] h-[30rem] bg-brand-campus/10 rounded-full blur-3xl pointer-events-none"></div>

    <div class="max-w-2xl w-full bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] border border-white p-10 relative z-10">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-black text-gray-800 mb-3 tracking-tight">Configuración Inicial</h1>
        <p class="text-gray-500 text-sm font-medium leading-relaxed">Seleccione los planteles a los que tendrá acceso. Esta configuración podrá ser actualizada posteriormente por un administrador.</p>
      </div>
      
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <label v-for="p in PLANTELES_LIST" :key="p" class="flex items-center justify-center gap-3 p-4 rounded-xl border-2 border-gray-100 cursor-pointer hover:bg-brand-leaf/5 transition-all" :class="{ '!border-brand-leaf bg-brand-leaf/5 shadow-sm': selected.includes(p) }">
          <input type="checkbox" :value="p" v-model="selected" class="w-5 h-5 text-brand-leaf border-gray-300 rounded focus:ring-brand-leaf shadow-inner">
          <span class="font-bold text-gray-700">{{ p }}</span>
        </label>
      </div>

      <div class="flex justify-between items-center">
        <span class="text-xs font-bold text-gray-400 uppercase tracking-widest"><span class="text-brand-campus">{{ selected.length }}</span> Planteles Seleccionados</span>
        <button @click="submit" class="btn btn-primary px-8 py-3 shadow-lg hover:shadow-xl" :disabled="loading || selected.length === 0">Guardar y Continuar</button>
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
    show('Error al guardar la configuración.', 'danger') 
  } finally { 
    loading.value = false 
  }
}
</script>