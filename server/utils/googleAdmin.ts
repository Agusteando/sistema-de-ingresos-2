import { google } from 'googleapis'

export const getAdminProfilePhoto = async (userEmail: string): Promise<string | null> => {
  const config = useRuntimeConfig()
  
  if (!config.googleServiceAccountEmail || !config.googlePrivateKey || !config.adminEmailToImpersonate) {
    return null
  }

  try {
    const privateKey = config.googlePrivateKey
      .replace(/\\n/g, '\n')
      .replace(/^"|"$/g, '')

    const jwtClient = new google.auth.JWT({
      email: config.googleServiceAccountEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/admin.directory.user.readonly'],
      subject: config.adminEmailToImpersonate
    })

    const admin = google.admin({ version: 'directory_v1', auth: jwtClient })

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
    return null
  }
}