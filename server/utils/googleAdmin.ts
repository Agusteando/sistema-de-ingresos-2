import { google } from 'googleapis'

export const getAdminProfilePhoto = async (userEmail: string): Promise<string | null> => {
  const config = useRuntimeConfig()
  
  if (!config.googleServiceAccountEmail || !config.googlePrivateKey || !config.adminEmailToImpersonate) {
    console.warn('[Directorio Institucional] Credenciales de cuenta de servicio no configuradas.')
    return null
  }

  try {
    // Normalizar la llave privada: Evita errores por comillas literales inyectadas por entornos
    const privateKey = config.googlePrivateKey
      .replace(/\\n/g, '\n')
      .replace(/^"|"$/g, '')

    // 1. Crear un cliente JWT autenticado asumiendo la identidad del administrador del dominio
    const jwtClient = new google.auth.JWT({
      email: config.googleServiceAccountEmail,
      key: privateKey,
      scopes:['https://www.googleapis.com/auth/admin.directory.user.readonly'],
      subject: config.adminEmailToImpersonate
    })

    // 2. Instanciar el servicio Directory API
    const service = google.admin({ version: 'directory_v1', auth: jwtClient })

    // 3. Consultar la API utilizando users.get para recuperar el thumbnailPhotoUrl de forma segura y directa
    const userResponse = await service.users.get({
      userKey: userEmail,
      projection: 'basic'
    })

    // 4. Retornar la URL directa que proporciona Google para el DP
    if (userResponse.data && userResponse.data.thumbnailPhotoUrl) {
      return userResponse.data.thumbnailPhotoUrl
    }

    return null
  } catch (error: any) {
    if (error?.code !== 404) {
      console.error('[Directorio Institucional] Hubo un error al obtener la imagen de perfil:', error.message || error)
    }
    return null
  }
}