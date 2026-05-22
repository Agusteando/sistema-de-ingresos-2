import { searchWorkspaceDirectoryUsers, WORKSPACE_DOMAIN } from '../../utils/google-workspace-directory'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user?.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'Solo superadmin puede buscar usuarios de Google Workspace.' })
  }

  const query = getQuery(event)
  const search = String(query.q || query.search || '').trim()
  const limit = Math.max(1, Math.min(Number(query.limit || 25) || 25, 200))

  const users = await searchWorkspaceDirectoryUsers(search, limit)
  return {
    domain: WORKSPACE_DOMAIN,
    source: 'google-workspace-directory',
    users
  }
})
