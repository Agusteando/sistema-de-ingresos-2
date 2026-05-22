import { getWorkspaceDirectoryUsersByEmails, WORKSPACE_DOMAIN } from '../../utils/google-workspace-directory'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user?.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'Solo superadmin puede consultar usuarios de Google Workspace.' })
  }

  const body = await readBody(event)
  const emails = Array.isArray(body?.emails) ? body.emails : []
  const result = await getWorkspaceDirectoryUsersByEmails(emails)

  return {
    domain: WORKSPACE_DOMAIN,
    source: 'google-workspace-directory',
    ...result
  }
})
