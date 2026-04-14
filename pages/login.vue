<template>
  <div class="min-h-screen flex items-center justify-center bg-[#F4F6F8] px-4 font-sans relative overflow-hidden">
    <div class="absolute top-[-10%] left-[-10%] w-96 h-96 bg-brand-leaf/20 rounded-full blur-3xl pointer-events-none"></div>
    <div class="absolute bottom-[-10%] right-[-10%] w-[30rem] h-[30rem] bg-brand-campus/10 rounded-full blur-3xl pointer-events-none"></div>

    <div class="max-w-md w-full bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] border border-white p-10 relative z-10">
      <img src="https://casitaiedis.edu.mx/assets/img/IECS-IEDIS%20IMAGES/IMAGOTIPO-IECS-IEDIS-23-24.webp" alt="Logo Institucional" class="h-20 mx-auto mb-8 drop-shadow-sm" />
      
      <div class="text-center mb-8">
        <h1 class="text-2xl font-black text-gray-800 mb-2 tracking-tight">Sistema de Ingresos 2</h1>
        <p class="text-gray-500 text-sm font-medium leading-relaxed">Autenticación segura requerida para acceder a los controles administrativos financieros.</p>
      </div>
      
      <form @submit.prevent="handleLogin" class="space-y-5">
        <div class="form-group m-0">
          <label class="form-label text-[0.75rem]">Usuario Asignado</label>
          <input type="text" v-model="form.username" class="input-field" required autofocus autocomplete="username" />
        </div>
        
        <div class="form-group m-0">
          <label class="form-label text-[0.75rem]">Contraseña de Acceso</label>
          <input type="password" v-model="form.password" class="input-field" required autocomplete="current-password" />
        </div>
        
        <button type="submit" class="btn btn-primary w-full h-12 mt-4 text-[0.9rem] shadow-md hover:shadow-lg" :disabled="loading">
          {{ loading ? 'Autenticando...' : 'Iniciar Sesión' }}
        </button>
      </form>
      
      <div v-if="errorMsg" class="mt-6 text-sm text-accent-coral text-center font-bold bg-accent-coral/10 py-3 px-4 rounded-xl">
        {{ errorMsg }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

definePageMeta({ layout: false })

const loading = ref(false)
const errorMsg = ref('')
const form = ref({ username: '', password: '' })

const handleLogin = async () => {
  loading.value = true
  errorMsg.value = ''
  
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: form.value
    })
    window.location.href = '/'
  } catch (e) {
    errorMsg.value = e.response?.data?.message || 'Credenciales no autorizadas.'
  } finally {
    loading.value = false
  }
}
</script>