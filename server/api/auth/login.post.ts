import { OAuth2Client } from 'google-auth-library'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const config = useRuntimeConfig()
  
  if (!config.public.googleClientId) {
    throw createError({ statusCode: 500, message: 'Configuración de Google ausente' })
  }

  const client = new OAuth2Client(config.public.googleClientId)
  
  try {
    const ticket = await client.verifyIdToken({
      idToken: body.credential,
      audience: config.public.googleClientId
    })
    
    const payload = ticket.getPayload()
    if (!payload || !payload.email) throw new Error('Token inválido')
    
    // CRITICAL FIX: Removed `httpOnly: true`. 
    // Nuxt's client-side middleware uses `useCookie('auth_email')` to check if the user is authenticated.
    // If httpOnly is true, the browser hides the cookie from JavaScript, causing the middleware
    // to incorrectly believe the user is logged out and forcefully redirect back to /login.
    setCookie(event, 'auth_email', payload.email, { 
      secure: process.env.NODE_ENV === 'production', 
      path: '/', 
      maxAge: 86400 * 7 
    })
    
    setCookie(event, 'auth_name', payload.name || 'Admin', { 
      secure: process.env.NODE_ENV === 'production',
      path: '/', 
      maxAge: 86400 * 7 
    })
    
    return { success: true }
  } catch (error) {
    throw createError({ statusCode: 401, message: 'Fallo de autenticación con Google' })
  }
})