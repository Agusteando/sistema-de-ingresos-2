import { getAdminProfilePhoto } from '../../utils/googleAdmin'

export default defineEventHandler(async (event) => {
  const email = String(getCookie(event, 'auth_email') || '')
  const name = String(getCookie(event, 'auth_name') || email || 'Administrador')

  if (!email) {
    throw createError({ statusCode: 401, message: 'Acceso no autorizado.' })
  }

  let photoUrl: string | null = null

  try {
    photoUrl = await getAdminProfilePhoto(email)
  } catch (err) {
    console.error('[API Perfil] Fallo la resolución de la foto de Google Workspace:', err)
  }

  return { photoUrl, email, name }
})
