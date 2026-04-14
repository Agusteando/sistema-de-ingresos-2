import { getAdminProfilePhoto } from '../../utils/googleAdmin'

export default defineEventHandler(async (event) => {
  const email = getCookie(event, 'auth_email')
  
  if (!email) {
    throw createError({ statusCode: 401, message: 'Acceso no autorizado' })
  }
  
  // Resolve the current administrator by email and fetch their profile image reliably
  const photoUrl = await getAdminProfilePhoto(email)
  const name = getCookie(event, 'auth_name') || 'Administrador Central'
  
  return { 
    photoUrl, 
    email, 
    name 
  }
})