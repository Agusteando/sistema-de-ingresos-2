export default defineNuxtPlugin(async () => {
  const config = useRuntimeConfig()

  try {
    const response = await $fetch('/api/auth/google-config', { retry: 0 })
    const clientId = String(response?.clientId || '').trim()
    if (clientId) config.public.googleClientId = clientId
  } catch {
    // Keep the existing Nuxt/Vercel value as fallback.
  }
})
