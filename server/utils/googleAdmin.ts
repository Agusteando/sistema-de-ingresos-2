import { google } from 'googleapis'

export const getAdminProfilePhoto = async (userEmail: string): Promise<string | null> => {
  const config = useRuntimeConfig()
  
  if (!config.googleServiceAccountEmail || !config.googlePrivateKey || !config.adminEmailToImpersonate) {
    console.warn('[Directorio Institucional] Credenciales de cuenta de servicio no configuradas.')
    return null
  }

  try {
    // 1. Create an authenticated JWT client using the service account credentials
    const jwtClient = new google.auth.JWT({
      email: config.googleServiceAccountEmail,
      key: config.googlePrivateKey.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/admin.directory.user.readonly'],
      subject: config.adminEmailToImpersonate // Must impersonate a domain administrator
    })

    // 2. Instantiate the Admin Directory service
    const service = google.admin({ version: 'directory_v1', auth: jwtClient })

    // 3. Resolve the user photo securely by their email
    const userPhotoResponse = await service.users.photos.get({
      userKey: userEmail,
    })

    // 4. Convert and return the WebSafeBase64 response safely to the frontend
    if (userPhotoResponse.data && userPhotoResponse.data.photoData) {
      const photoBase64 = userPhotoResponse.data.photoData
      // Google's Directory API returns URL-safe Base64. Browser Data URIs require standard Base64.
      const standardBase64 = photoBase64.replace(/-/g, '+').replace(/_/g, '/')
      return `data:image/jpeg;base64,${standardBase64}`
    }

    return null
  } catch (error: any) {
    // Graceful fallback: Avoid exposing secrets or breaking the app if a photo is missing or an API error occurs.
    if (error?.code !== 404) {
      console.error('[Directorio Institucional] Hubo un error al obtener la imagen de perfil:', error.message || error)
    }
    return null
  }
}