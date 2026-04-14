<template>
  <div class="min-h-screen flex items-center justify-center bg-app px-4 font-sans">
    <div class="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center">
      <img src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp" alt="Logo Institucional" class="h-16 mx-auto mb-6" />
      <h1 class="text-2xl font-bold text-brand-campus mb-2">Sistema de Ingresos 2</h1>
      <p class="text-gray-500 mb-8 text-sm">Autenticación requerida para acceder al panel de administración operativa e información financiera.</p>
      
      <div id="google-btn" class="flex justify-center min-h-[44px] mb-2"></div>
      <p v-if="errorMsg" class="mt-4 text-sm text-accent-coral font-semibold">{{ errorMsg }}</p>
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
    errorMsg.value = 'Error interno: Credenciales de Google no configuradas.'
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
          
          // CRITICAL FIX: Use window.location.href instead of Nuxt's navigateTo() here.
          // Since this callback is executed by an external Google script outside of Vue's
          // internal reactivity context, navigateTo() can lose context or trigger race conditions.
          // A hard redirect ensures the server fully rehydrates with the newly injected cookies.
          window.location.href = '/'
        } catch (e) {
          errorMsg.value = 'Credenciales institucionales no autorizadas.'
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