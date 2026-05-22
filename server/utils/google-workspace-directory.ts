import { google } from 'googleapis'

export const WORKSPACE_DOMAIN = 'casitaiedis.edu.mx'
export const WORKSPACE_DIRECTORY_SCOPE = 'https://www.googleapis.com/auth/admin.directory.user.readonly'

type DirectoryUser = {
  id?: string | null
  primaryEmail?: string | null
  name?: {
    fullName?: string | null
    givenName?: string | null
    familyName?: string | null
  } | null
  thumbnailPhotoUrl?: string | null
  suspended?: boolean | null
  archived?: boolean | null
  orgUnitPath?: string | null
}

const normalizeEmail = (email: unknown) => String(email || '').trim().toLowerCase()
const normalizeText = (value: unknown) => String(value || '').trim()

export const isCasitaWorkspaceEmail = (email: unknown) => {
  const normalized = normalizeEmail(email)
  return normalized.endsWith(`@${WORKSPACE_DOMAIN}`)
}

const getDirectoryCredentials = () => {
  const config = useRuntimeConfig()
  const clientEmail = normalizeText(config.googleServiceAccountEmail || config.gcpClientEmail)
  const privateKey = normalizeText(config.googlePrivateKey || config.gcpPrivateKey)
  const subject = normalizeText(config.adminEmailToImpersonate || config.gcpAdminSubject) || `desarrollo.tecnologico@${WORKSPACE_DOMAIN}`

  if (!clientEmail || !privateKey || !subject) {
    throw createError({
      statusCode: 503,
      message: 'Google Workspace Directory no esta configurado. Configure GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY y GOOGLE_ADMIN_EMAIL.'
    })
  }

  return {
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n').replace(/^"|"$/g, ''),
    subject
  }
}

export const getWorkspaceDirectoryService = () => {
  const credentials = getDirectoryCredentials()
  const auth = new google.auth.JWT({
    email: credentials.clientEmail,
    key: credentials.privateKey,
    scopes: [WORKSPACE_DIRECTORY_SCOPE],
    subject: credentials.subject
  })

  return google.admin({ version: 'directory_v1', auth })
}

export const buildWorkspacePhotoUrl = (email: string, name = '') => {
  const params = new URLSearchParams({ email: normalizeEmail(email) })
  if (name) params.set('name', name)
  return `/api/directory/photo?${params.toString()}`
}

const normalizeDirectoryUser = (user: DirectoryUser) => {
  const email = normalizeEmail(user.primaryEmail)
  const fullName = normalizeText(user.name?.fullName) || email
  const givenName = normalizeText(user.name?.givenName)
  const familyName = normalizeText(user.name?.familyName)

  return {
    id: user.id || email,
    name: fullName,
    displayName: fullName,
    givenName,
    familyName,
    email,
    primaryEmail: email,
    domain: WORKSPACE_DOMAIN,
    orgUnitPath: user.orgUnitPath || '',
    suspended: Boolean(user.suspended),
    archived: Boolean(user.archived),
    available: !user.suspended && !user.archived,
    thumbnailPhotoUrl: user.thumbnailPhotoUrl || '',
    avatar: buildWorkspacePhotoUrl(email, fullName),
    source: 'google-workspace-directory'
  }
}

const directoryQueryForSearch = (search: string) => {
  const value = search.replace(/["']/g, '').trim()
  if (!value) return undefined
  if (value.includes('@')) return `email:${value}*`
  const firstToken = value.split(/\s+/).filter(Boolean)[0] || value
  return `name:${firstToken}*`
}

const textMatches = (user: ReturnType<typeof normalizeDirectoryUser>, search: string) => {
  const value = search.toLowerCase()
  if (!value) return true
  return [user.name, user.email, user.givenName, user.familyName, user.orgUnitPath]
    .join(' ')
    .toLowerCase()
    .includes(value)
}

export const searchWorkspaceDirectoryUsers = async (search: string, maxResults = 12) => {
  const admin = getWorkspaceDirectoryService()
  const normalizedSearch = normalizeText(search).slice(0, 80)
  const limit = Math.max(1, Math.min(Number(maxResults) || 12, 25))

  const makeRequest = async (query?: string) => {
    const response = await admin.users.list({
      domain: WORKSPACE_DOMAIN,
      maxResults: limit,
      orderBy: 'email',
      projection: 'full',
      viewType: 'domain_public',
      query,
      fields: 'users(id,primaryEmail,name,thumbnailPhotoUrl,suspended,archived,orgUnitPath)'
    })

    return (response.data.users || [])
      .map((user) => normalizeDirectoryUser(user as DirectoryUser))
      .filter((user) => isCasitaWorkspaceEmail(user.email))
  }

  try {
    const users = await makeRequest(directoryQueryForSearch(normalizedSearch))
    return users.filter((user) => textMatches(user, normalizedSearch)).slice(0, limit)
  } catch (error: any) {
    if (!normalizedSearch) throw error
    const users = await makeRequest(undefined)
    return users.filter((user) => textMatches(user, normalizedSearch)).slice(0, limit)
  }
}


export const getWorkspaceDirectoryUsersByEmails = async (emails: string[]) => {
  const admin = getWorkspaceDirectoryService()
  const uniqueEmails = Array.from(new Set((emails || [])
    .map(normalizeEmail)
    .filter((email) => isCasitaWorkspaceEmail(email))))
    .slice(0, 250)
  const users = []
  const errors: Array<{ email: string; message: string }> = []

  for (const email of uniqueEmails) {
    try {
      const response = await admin.users.get({
        userKey: email,
        projection: 'full',
        viewType: 'domain_public',
        fields: 'id,primaryEmail,name,thumbnailPhotoUrl,suspended,archived,orgUnitPath'
      })
      users.push(normalizeDirectoryUser(response.data as DirectoryUser))
    } catch (error: any) {
      errors.push({ email, message: error?.message || 'No se pudo leer usuario de Workspace.' })
    }
  }

  return { users, errors }
}

export const getWorkspaceDirectoryPhoto = async (email: string) => {
  const normalizedEmail = normalizeEmail(email)
  if (!isCasitaWorkspaceEmail(normalizedEmail)) return null

  const admin = getWorkspaceDirectoryService()
  const response = await admin.users.photos.get({ userKey: normalizedEmail })
  const photoData = response.data.photoData
  if (!photoData) return null

  return Buffer.from(String(photoData).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}
