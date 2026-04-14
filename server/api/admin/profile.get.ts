import { getAdminProfilePhoto } from '../../utils/googleAdmin'

export default defineEventHandler(async (event) => {
  const email = getCookie(event, 'auth_email')
  
  if (!email) {
    throw createError({ statusCode: 401, message: 'Acceso no autorizado' })
  }
  
  // Attempt to fetch the administrator's profile image dynamically.
  // Will gracefully fall back to null if the user has no photo or the API fails.
  const photoUrl = await getAdminProfilePhoto(email)
  const name = getCookie(event, 'auth_name') || 'Administrador Central'
  
  return { 
    photoUrl, 
    email, 
    name 
  }
})