import {
  buildWorkspacePhotoUrl,
  isCasitaWorkspaceEmail,
  searchWorkspaceDirectoryUsers,
  WORKSPACE_DOMAIN,
} from '../../../utils/google-workspace-directory'

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()
const normalizeText = (value: unknown) => String(value || '').trim()

const matchesSearch = (candidate: any, search: string) => {
  const needle = normalizeText(search).toLowerCase()
  if (!needle) return true
  return [
    candidate?.name,
    candidate?.displayName,
    candidate?.email,
    candidate?.primaryEmail,
    candidate?.title,
    candidate?.department,
    candidate?.orgUnitPath,
  ].join(' ').toLowerCase().includes(needle)
}

const normalizeSender = (candidate: any) => {
  const email = normalizeEmail(candidate?.email || candidate?.primaryEmail)
  const name = normalizeText(candidate?.name || candidate?.displayName || email) || email
  return {
    id: String(candidate?.id || email),
    email,
    name,
    displayName: name,
    avatar: String(candidate?.avatar || buildWorkspacePhotoUrl(email, name)),
    title: normalizeText(candidate?.title),
    department: normalizeText(candidate?.department),
    orgUnitPath: normalizeText(candidate?.orgUnitPath),
    source: String(candidate?.source || 'google-workspace-directory'),
    available: candidate?.available !== false && !candidate?.suspended && !candidate?.archived,
  }
}

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Sesión requerida.' })

  const query = getQuery(event)
  const search = normalizeText(query.q || query.search).slice(0, 80)
  const limit = Math.max(1, Math.min(Number(query.limit) || 12, 15))
  const config = useRuntimeConfig()

  const fallbackCandidates = [
    {
      email: normalizeEmail(user.email),
      name: normalizeText(user.name || user.email),
      source: 'session',
      available: true,
    },
    {
      email: normalizeEmail(config.adminEmailToImpersonate),
      name: 'Cuenta administrativa',
      source: 'configured-admin',
      available: true,
    },
  ].filter((candidate) => candidate.email && isCasitaWorkspaceEmail(candidate.email) && matchesSearch(candidate, search))

  let directoryUsers: any[] = []
  let directoryError = ''
  try {
    directoryUsers = await searchWorkspaceDirectoryUsers(search, limit)
  } catch (error: any) {
    directoryError = String(error?.message || 'No se pudo consultar Google Workspace.')
    console.warn('[Control Escolar email] Sender directory search unavailable:', directoryError)
  }

  const senderMap = new Map<string, ReturnType<typeof normalizeSender>>()
  for (const candidate of [...directoryUsers, ...fallbackCandidates]) {
    const sender = normalizeSender(candidate)
    if (!sender.email || !isCasitaWorkspaceEmail(sender.email) || !sender.available || senderMap.has(sender.email)) continue
    senderMap.set(sender.email, sender)
    if (senderMap.size >= limit) break
  }

  return {
    domain: WORKSPACE_DOMAIN,
    source: 'google-workspace-directory',
    search,
    users: Array.from(senderMap.values()),
    directoryAvailable: !directoryError,
    warning: directoryError || undefined,
  }
})
