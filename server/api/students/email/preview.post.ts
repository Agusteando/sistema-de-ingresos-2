import { searchWorkspaceDirectoryUsers, isCasitaWorkspaceEmail } from '../../../utils/google-workspace-directory'
import { resolveStudentEmailAudience } from '../../../utils/studentEmail'

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const body = await readBody(event)
  const audience = await resolveStudentEmailAudience(body?.matriculas, user, {
    contactSource: 'selection',
    students: body?.students,
  })

  const config = useRuntimeConfig()
  const fallbackCandidates = [
    {
      email: normalizeEmail(user?.email),
      name: String(user?.name || user?.email || '').trim(),
      source: 'session',
      available: true,
    },
    {
      email: normalizeEmail(config.adminEmailToImpersonate),
      name: 'Cuenta administrativa',
      source: 'configured-admin',
      available: true,
    },
  ].filter((candidate) => candidate.email && isCasitaWorkspaceEmail(candidate.email))

  let directoryUsers: any[] = []
  try {
    directoryUsers = await searchWorkspaceDirectoryUsers('', 25)
  } catch (error: any) {
    console.warn('[Control Escolar email] Workspace directory unavailable:', error?.message || error)
  }

  const senderMap = new Map<string, any>()
  for (const candidate of [...fallbackCandidates, ...directoryUsers]) {
    const email = normalizeEmail(candidate?.email || candidate?.primaryEmail)
    if (!email || !isCasitaWorkspaceEmail(email) || senderMap.has(email)) continue
    if (candidate?.available === false || candidate?.suspended || candidate?.archived) continue
    senderMap.set(email, {
      email,
      name: String(candidate?.name || candidate?.displayName || email).trim() || email,
      source: candidate?.source || 'google-workspace-directory',
    })
  }

  const senders = Array.from(senderMap.values())
  const defaultSender = fallbackCandidates.find((candidate) => senderMap.has(candidate.email))?.email || senders[0]?.email || ''

  return {
    recipients: audience.recipients,
    groups: audience.groups,
    summary: audience.summary,
    senders,
    defaultSender,
    domain: 'casitaiedis.edu.mx',
  }
})
