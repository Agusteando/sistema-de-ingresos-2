import { query } from '../../utils/db'
import { getAdminProfilePhoto } from '../../utils/googleAdmin'

export default defineEventHandler(async (event) => {
  const email = getCookie(event, 'auth_email')
  
  if (!email) {
    throw createError({ statusCode: 401, message: 'Acceso no autorizado.' })
  }
  
  const [user] = await query<any[]>('SELECT avatar, username as name, email FROM users WHERE email = ?', [email])
  
  let photoUrl = user?.avatar || null
  
  try {
    // Resolver la imagen real de Workspace servidor a servidor
    const workspacePhoto = await getAdminProfilePhoto(email)
    
    if (workspacePhoto) {
      photoUrl = workspacePhoto
      
      // Sincronizar silenciosamente la base de datos si la foto de Google Workspace cambió
      if (workspacePhoto !== user?.avatar) {
        await query('UPDATE users SET avatar = ? WHERE email = ?', [workspacePhoto, email])
      }
    }
  } catch (err) {
    console.error('[API Perfil] Fallo la resolución de la foto de Google Workspace:', err)
  }
  
  return { 
    photoUrl, 
    email: user?.email || '', 
    name: user?.name || 'Administrador' 
  }
})