import { getWorkspaceDirectoryPhoto, isCasitaWorkspaceEmail } from '../../utils/google-workspace-directory'

const avatarFallback = (email: unknown, name: unknown) => {
  const label = String(name || email || 'User').trim() || 'User'
  const params = new URLSearchParams({
    name: label,
    background: 'eef2ff',
    color: '4f46e5',
    bold: 'true',
    rounded: 'true',
    size: '128'
  })
  return `https://ui-avatars.com/api/?${params.toString()}`
}

export default defineEventHandler(async (event) => {
  const { email, name } = getQuery(event)
  const fallbackUrl = avatarFallback(email, name)
  const normalizedEmail = String(email || '').trim().toLowerCase()

  if (!normalizedEmail || !isCasitaWorkspaceEmail(normalizedEmail)) {
    return sendRedirect(event, fallbackUrl)
  }

  try {
    const buffer = await getWorkspaceDirectoryPhoto(normalizedEmail)
    if (buffer) {
      setResponseHeader(event, 'Content-Type', 'image/jpeg')
      setResponseHeader(event, 'Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
      return buffer
    }
  } catch (error: any) {
    console.warn(`[Directory Photo] Falling back for ${normalizedEmail}:`, error?.message || error)
  }

  return sendRedirect(event, fallbackUrl)
})
