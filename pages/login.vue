<template>
  <div class="min-h-screen flex items-center justify-center bg-[#F4F6F8] px-4 font-sans relative overflow-hidden">
    <div class="absolute top-[-10%] left-[-10%] w-96 h-96 bg-brand-leaf/20 rounded-full blur-3xl pointer-events-none"></div>
    <div class="absolute bottom-[-10%] right-[-10%] w-[30rem] h-[30rem] bg-brand-campus/10 rounded-full blur-3xl pointer-events-none"></div>

    <div class="max-w-md w-full bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white p-10 text-center relative z-10">
      <img src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp" alt="Logo Institucional" class="h-16 mx-auto mb-6" />
      <h1 class="text-xl font-bold text-gray-800 mb-2 tracking-tight">Sistema de Ingresos 2</h1>
      <p class="text-gray-500 mb-8 text-sm font-medium">Inicie sesión con su cuenta institucional.</p>
      
      <div class="flex justify-center w-full min-h-[44px] mb-4 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
         <div id="google-btn" class="w-full flex justify-center"></div>
      </div>
      <p v-if="errorMsg" class="mt-4 text-xs text-accent-coral font-semibold bg-accent-coral/10 py-2 px-3 rounded-md">{{ errorMsg }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRuntimeConfig } from '#app'

definePageMeta({ layout: false })

const errorMsg = ref('')
const config = useRuntimeConfig()

onMounted(() => {
  if (!config.public.googleClientId) {
    errorMsg.value = 'Error: Credenciales no configuradas.'
    return
  }

  const script = document.createElement('script')
  script.src = 'https://accounts.google.com/gsi/client'
  script.async = true
  script.defer = true
  script.onload = () => {
    window.google.accounts.id.initialize({
      client_id: config.public.googleClientId,
      callback: async (response) => {
        try {
          await $fetch('/api/auth/login', {
            method: 'POST',
            body: { credential: response.credential }
          })
          
          window.location.href = '/'
        } catch (e) {
          errorMsg.value = 'Credenciales no autorizadas.'
        }
      }
    })
    window.google.accounts.id.renderButton(
      document.getElementById('google-btn'),
      { theme: 'outline', size: 'large', width: 300 }
    )
  }
  document.head.appendChild(script)
})
</script>