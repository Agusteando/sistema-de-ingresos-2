import {
  CONTROL_ESCOLAR_ROLE,
  createExternalUser,
  externalRoleCsv,
  hasExternalRole,
  isExternalControlEscolarOnlyRole,
  isExternalSuperAdminRole,
  isExternalUsersAvailable,
  mapExternalUsersByEmail,
  parseExternalRoleTokens,
  updateExternalControlEscolarAccess
} from '../../utils/external-users'
import { searchWorkspaceDirectoryUsers, WORKSPACE_DOMAIN } from '../../utils/google-workspace-directory'

const assertExternalUsersAvailable = async () => {
  if (await isExternalUsersAvailable()) return
  throw createError({
    statusCode: 503,
    message: 'No se pudo consultar la configuración de accesos de Control Escolar. Intente de nuevo o revise la conexión con la base central.'
  })
}

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()
const normalizeSearch = (value: unknown) => String(value || '').trim().slice(0, 120)

const roleLabel = (role: unknown) => {
  if (isExternalSuperAdminRole(role)) return 'Administrador'
  if (isExternalControlEscolarOnlyRole(role)) return 'Solo Control Escolar'
  if (hasExternalRole(role, CONTROL_ESCOLAR_ROLE)) return 'Control Escolar habilitado'
  return 'Sin acceso Control Escolar'
}

const mergeDirectoryUser = (person: any, external: any) => {
  const role = externalRoleCsv(external?.role || 'plantel')
  const hasRoleCtrl = hasExternalRole(role, CONTROL_ESCOLAR_ROLE)
  const isSuperAdmin = isExternalSuperAdminRole(role)
  const planteles = external?.planteles || external?.plantel || ''

  return {
    id: external?.id || `workspace:${person.email}`,
    externalId: external?.id || null,
    workspaceId: person.id || person.email,
    name: person.name || person.displayName || person.email,
    displayName: person.displayName || person.name || person.email,
    email: normalizeEmail(person.email),
    avatar: person.avatar,
    thumbnailPhotoUrl: person.thumbnailPhotoUrl || '',
    orgUnitPath: person.orgUnitPath || '',
    suspended: Boolean(person.suspended),
    archived: Boolean(person.archived),
    available: Boolean(person.available),
    role,
    roles: parseExternalRoleTokens(role),
    roleLabel: roleLabel(role),
    planteles,
    plantel: external?.plantel || (planteles ? String(planteles).split(',')[0] : ''),
    hasControlEscolarRole: hasRoleCtrl,
    hasControlEscolarAccess: hasRoleCtrl || isSuperAdmin,
    isControlEscolarOnly: isExternalControlEscolarOnlyRole(role),
    isSuperAdmin,
    hasExternalConfig: Boolean(external?.id),
    source: 'google-workspace-directory'
  }
}

export default defineEventHandler(async (event) => {
  const method = event.node.req.method
  const user = event.context.user

  if (!user.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'No tiene los permisos necesarios.' })
  }

  await assertExternalUsersAvailable()

  if (method === 'GET') {
    const query = getQuery(event)
    const search = normalizeSearch(query.q || query.search)
    const limit = Math.max(10, Math.min(Number(query.limit || 100) || 100, 200))
    const [directoryUsers, externalByEmail] = await Promise.all([
      searchWorkspaceDirectoryUsers(search, limit),
      mapExternalUsersByEmail()
    ])

    const merged = directoryUsers
      .filter((person) => normalizeEmail(person.email).endsWith(`@${WORKSPACE_DOMAIN}`))
      .map((person) => mergeDirectoryUser(person, externalByEmail.get(normalizeEmail(person.email))))

    const directoryEmails = new Set(merged.map((entry) => entry.email))
    const externalOnly = Array.from(externalByEmail.values())
      .filter((entry) => entry.email && !directoryEmails.has(entry.email))
      .filter((entry) => !search || `${entry.username} ${entry.displayName} ${entry.email}`.toLowerCase().includes(search.toLowerCase()))
      .map((entry) => {
        const role = externalRoleCsv(entry.role)
        const isSuperAdmin = isExternalSuperAdminRole(role)
        const hasRoleCtrl = hasExternalRole(role, CONTROL_ESCOLAR_ROLE)
        return {
          ...entry,
          name: entry.displayName || entry.username || entry.email,
          workspaceId: `external:${entry.email}`,
          externalId: entry.id,
          role,
          roles: parseExternalRoleTokens(role),
          roleLabel: roleLabel(role),
          hasControlEscolarRole: hasRoleCtrl,
          hasControlEscolarAccess: hasRoleCtrl || isSuperAdmin,
          isControlEscolarOnly: isExternalControlEscolarOnlyRole(role),
          isSuperAdmin,
          suspended: false,
          archived: false,
          available: true,
          hasExternalConfig: true,
          source: 'external-without-directory-match'
        }
      })

    const users = [...merged, ...externalOnly].sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email), 'es'))
    const stats = {
      total: users.length,
      withAccess: users.filter((entry) => entry.hasControlEscolarAccess).length,
      roleCtrl: users.filter((entry) => entry.hasControlEscolarRole).length,
      withoutAccess: users.filter((entry) => !entry.hasControlEscolarAccess && entry.available).length,
      inactive: users.filter((entry) => entry.suspended || entry.archived || !entry.available).length
    }

    return {
      domain: WORKSPACE_DOMAIN,
      source: 'google-workspace-directory',
      users,
      stats
    }
  }

  if (method === 'POST') {
    const body = await readBody(event)
    if (typeof body?.enabled === 'boolean') {
      return await updateExternalControlEscolarAccess(body)
    }
    return await createExternalUser(body)
  }

  throw createError({ statusCode: 405, message: 'Metodo no permitido.' })
})
