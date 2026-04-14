import { google } from 'googleapis'

export const getAdminProfilePhoto = async (): Promise<string | null> => {
  const config = useRuntimeConfig()
  if (!config.googleServiceAccountEmail || !config.googlePrivateKey) return null

  try {
    const auth = new google.auth.JWT({
      email: config.googleServiceAccountEmail,
      key: config.googlePrivateKey.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/admin.directory.user.readonly'],
      subject: config.adminEmailToImpersonate
    })
    const admin = google.admin({ version: 'directory_v1', auth })
    const res = await admin.users.photos.get({ userKey: config.adminEmailToImpersonate })
    
    if (res.data.photoData) {
      // Safe base64 resolution
      return `data:image/jpeg;base64,${res.data.photoData.replace(/-/g, '+').replace(/_/g, '/')}`
    }
    return null
  } catch (error) {
    console.warn('Unable to fetch Admin Directory photo. Using fallback.')
    return null
  }
}