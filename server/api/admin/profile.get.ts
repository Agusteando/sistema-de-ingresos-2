import { getAdminProfilePhoto } from '../../utils/googleAdmin'

export default defineEventHandler(async (event) => {
  const email = getCookie(event, 'auth_email')
  if (!email) throw createError({ statusCode: 401, message: 'No autenticado' })
  
  const photoUrl = await getAdminProfilePhoto(email)
  const name = getCookie(event, 'auth_name') || 'Administrador Central'
  
  return { photoUrl, email, name }
})