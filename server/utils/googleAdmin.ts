import { google } from 'googleapis'

export const getAdminProfilePhoto = async (userEmail: string): Promise<string | null> => {
  const config = useRuntimeConfig()
  
  if (!config.googleServiceAccountEmail || !config.googlePrivateKey || !config.adminEmailToImpersonate) {
    console.warn('[Directorio Institucional] Credenciales de cuenta de servicio no configuradas.')
    return null
  }

  try {
    const privateKey = config.googlePrivateKey
      .replace(/\\n/g, '\n')
      .replace(/^"|"$/g, '')

    // Autenticación con Delegación de Dominio (DWD) usando el administrador configurado
    const jwtClient = new google.auth.JWT({
      email: config.googleServiceAccountEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/admin.directory.user.readonly'],
      subject: config.adminEmailToImpersonate
    })

    const admin = google.admin({ version: 'directory_v1', auth: jwtClient })

    // Se obtiene el perfil público del dominio para acceder a la URL real de la foto de perfil en Workspace
    const response = await admin.users.get({
      userKey: userEmail,
      projection: 'full',
      viewType: 'domain_public'
    })

    if (response.data && response.data.thumbnailPhotoUrl) {
      return response.data.thumbnailPhotoUrl
    }

    return null
  } catch (error: any) {
    console.error('[Google Admin SDK] Error al resolver la foto de perfil de Workspace:', error.message || error)
    return null
  }
}