import { google } from 'googleapis'

export const getAdminProfilePhoto = async (userEmail: string): Promise<string | null> => {
  const config = useRuntimeConfig()
  
  if (!config.googleServiceAccountEmail || !config.googlePrivateKey || !config.adminEmailToImpersonate) {
    console.warn('[Directorio Institucional] Credenciales de cuenta de servicio no configuradas.')
    return null
  }

  try {
    // Normalizar la llave privada: Evita errores por comillas literales inyectadas por entornos (ej. Docker/Vercel)
    // y convierte los saltos de línea literales en saltos reales válidos para la firma criptográfica.
    const privateKey = config.googlePrivateKey
      .replace(/\\n/g, '\n')
      .replace(/^"|"$/g, '')

    // 1. Crear un cliente JWT autenticado asumiendo la identidad del administrador del dominio
    const jwtClient = new google.auth.JWT({
      email: config.googleServiceAccountEmail,
      key: privateKey,
      scopes:['https://www.googleapis.com/auth/admin.directory.user.readonly'],
      subject: config.adminEmailToImpersonate // Sujeto de delegación (Admin principal)
    })

    // 2. Instanciar el servicio Directory API
    const service = google.admin({ version: 'directory_v1', auth: jwtClient })

    // 3. Consultar la fotografía correspondiente al correo del usuario autenticado
    const userPhotoResponse = await service.users.photos.get({
      userKey: userEmail,
    })

    // 4. Transformar los datos binarios al formato correcto de renderizado para el Frontend
    if (userPhotoResponse.data && userPhotoResponse.data.photoData) {
      // FIX CRÍTICO: Google retorna la imagen en formato "WebSafe Base64" (usa '-' y '_', y omite el padding '=').
      // Si se pasa directamente al navegador, este fallará al renderizar y la imagen no se verá.
      // El constructor de Buffer de Node.js decodifica de forma nativa Base64Url a binario.
      const imageBuffer = Buffer.from(userPhotoResponse.data.photoData, 'base64')
      
      // Al re-codificar el binario con toString('base64'), se asegura que utilice Base64 Estándar con el padding correcto,
      // que es el estándar estricto que esperan los navegadores para los Data URIs.
      const standardBase64 = imageBuffer.toString('base64')
      const mimeType = userPhotoResponse.data.mimeType || 'image/jpeg'
      
      return `data:${mimeType};base64,${standardBase64}`
    }

    return null
  } catch (error: any) {
    // Fallback elegante: Evita corromper la respuesta en caso de errores en la API o si el usuario no tiene foto (404).
    if (error?.code !== 404) {
      console.error('[Directorio Institucional] Hubo un error al obtener la imagen de perfil:', error.message || error)
    }
    return null
  }
}