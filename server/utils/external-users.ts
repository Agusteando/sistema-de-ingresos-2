import bcrypt from 'bcryptjs'
import { PLANTELES_LIST } from '../../utils/constants'
import { controlEscolarCentralQuery } from './control-escolar-central'
import { buildWorkspacePhotoUrl, isCasitaWorkspaceEmail, WORKSPACE_DOMAIN } from './google-workspace-directory'
import { normalizePlantel } from './auth-session'

type TableColumn = { Field: string }

type ExternalUserInput = {
  username?: string
  password?: string
  email?: string
  planteles?: string[] | string
  role?: string
  avatar?: string | null
}

const TABLE = 'users'
export const CONTROL_ESCOLAR_ROLE = 'ROLE_CTRL'
const DEFAULT_ROLE = 'plantel'

const escapeIdentifier = (value: string) => `\`${String(value).replace(/`/g, '``')}\``
const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()
const normalizeText = (value: unknown, max = 255) => String(value || '').trim().slice(0, max)

const ROLE_CANONICAL: Record<string, string> = {
  role_ctrl: CONTROL_ESCOLAR_ROLE,
  control_escolar: CONTROL_ESCOLAR_ROLE,
  control: CONTROL_ESCOLAR_ROLE,
  plantel: 'plantel',
  global: 'global',
  superadmin: 'superadmin',
  role_super_admin: 'role_super_admin',
  role_superadmin: 'role_superadmin'
}

const SUPERADMIN_ROLES = new Set(['global', 'superadmin', 'role_super_admin', 'role_superadmin'])

export const parseExternalRoleTokens = (value: unknown) => {
  const seen = new Set<string>()
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => ROLE_CANONICAL[entry.toLowerCase()] || entry)
    .filter((entry) => {
      const key = entry.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export const externalRoleCsv = (value: unknown, fallback = DEFAULT_ROLE) => {
  const tokens = parseExternalRoleTokens(value)
  return (tokens.length ? tokens : [fallback]).join(',')
}

export const hasExternalRole = (roleValue: unknown, roleName: string) => {
  const target = (ROLE_CANONICAL[roleName.toLowerCase()] || roleName).toLowerCase()
  return parseExternalRoleTokens(roleValue).some((entry) => entry.toLowerCase() === target)
}

export const isExternalSuperAdminRole = (roleValue: unknown) => {
  return parseExternalRoleTokens(roleValue).some((entry) => SUPERADMIN_ROLES.has(entry.toLowerCase()))
}

export const isExternalControlEscolarOnlyRole = (roleValue: unknown) => {
  const roles = parseExternalRoleTokens(roleValue).map((entry) => entry.toLowerCase())
  return roles.length === 1 && roles[0] === CONTROL_ESCOLAR_ROLE.toLowerCase()
}

export const setControlEscolarRole = (currentRole: unknown, enabled: boolean, exclusive = false) => {
  if (enabled && exclusive) return CONTROL_ESCOLAR_ROLE

  const tokens = parseExternalRoleTokens(currentRole)
  const withoutControl = tokens.filter((entry) => entry.toLowerCase() !== CONTROL_ESCOLAR_ROLE.toLowerCase())

  if (enabled) {
    const base = withoutControl.length ? withoutControl : [DEFAULT_ROLE]
    return externalRoleCsv([...base, CONTROL_ESCOLAR_ROLE].join(','))
  }

  return externalRoleCsv(withoutControl.join(','), DEFAULT_ROLE)
}

const assertWorkspaceEmail = (email: unknown) => {
  const normalized = normalizeEmail(email)
  if (!normalized || !isCasitaWorkspaceEmail(normalized)) {
    throw createError({ statusCode: 400, message: `Solo se pueden asignar usuarios @${WORKSPACE_DOMAIN}.` })
  }
  return normalized
}

const plantelesValue = (value: unknown) => {
  const raw = Array.isArray(value) ? value : String(value || '').split(',')
  const planteles = raw
    .map(normalizePlantel)
    .filter((plantel) => PLANTELES_LIST.includes(plantel))
  return Array.from(new Set(planteles)).join(',')
}

let externalUsersReady: { ok: boolean; columns: Set<string>; loadedAt: number; error?: string } | null = null
const CACHE_MS = 1000 * 60 * 5

export const ensureExternalUsersTable = async () => {
  await controlEscolarCentralQuery(`
    CREATE TABLE IF NOT EXISTS ${escapeIdentifier(TABLE)} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) NOT NULL,
      password VARCHAR(255) DEFAULT '',
      email VARCHAR(255) DEFAULT NULL,
      planteles TEXT,
      role VARCHAR(255) NOT NULL DEFAULT 'plantel',
      avatar VARCHAR(512) DEFAULT NULL,
      plantel VARCHAR(20) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY users_email_unique (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

export const getExternalUsersColumns = async (force = false) => {
  if (!force && externalUsersReady && externalUsersReady.ok && Date.now() - externalUsersReady.loadedAt < CACHE_MS) {
    return externalUsersReady.columns
  }

  await ensureExternalUsersTable()
  const rows = await controlEscolarCentralQuery<TableColumn[]>(`SHOW COLUMNS FROM ${escapeIdentifier(TABLE)}`)
  const columns = new Set(rows.map((row) => row.Field))
  externalUsersReady = { ok: true, columns, loadedAt: Date.now() }
  return columns
}

export const isExternalUsersAvailable = async () => {
  try {
    await getExternalUsersColumns()
    return true
  } catch (error: any) {
    externalUsersReady = {
      ok: false,
      columns: new Set(),
      loadedAt: Date.now(),
      error: error?.message || 'External users unavailable'
    }
    return false
  }
}

const selectColumns = async () => {
  const columns = await getExternalUsersColumns()
  return ['id', 'username', 'email', 'planteles', 'role', 'created_at', 'avatar', 'plantel']
    .filter((column) => columns.has(column))
}

const workspaceWhere = (columns: string[]) => columns.includes('email')
  ? ` WHERE LOWER(${escapeIdentifier('email')}) LIKE ?`
  : ''

const normalizeUserRow = (row: any) => {
  const planteles = plantelesValue(row.planteles || row.plantel)
  const role = externalRoleCsv(row.role)
  const email = normalizeEmail(row.email)
  return {
    id: row.id,
    username: row.username || row.displayName || email || 'Usuario',
    displayName: row.displayName || row.username || email || 'Usuario',
    email,
    planteles,
    role,
    roles: parseExternalRoleTokens(role),
    hasControlEscolarRole: hasExternalRole(role, CONTROL_ESCOLAR_ROLE),
    isControlEscolarOnly: isExternalControlEscolarOnlyRole(role),
    isSuperAdmin: isExternalSuperAdminRole(role),
    created_at: row.created_at || null,
    avatar: row.avatar || (email ? buildWorkspacePhotoUrl(email, row.username || row.displayName || email) : null),
    plantel: normalizePlantel(row.plantel) || (planteles ? planteles.split(',')[0] : ''),
    source: 'external'
  }
}

export const listExternalUsers = async (workspaceOnly = true) => {
  const columns = await selectColumns()
  const where = workspaceOnly ? workspaceWhere(columns) : ''
  const params = where ? [`%@${WORKSPACE_DOMAIN}`] : []
  const rows = await controlEscolarCentralQuery<any[]>(`
    SELECT ${columns.map(escapeIdentifier).join(', ')}
    FROM ${escapeIdentifier(TABLE)}
    ${where}
    ORDER BY ${columns.includes('username') ? '`username`' : '`email`'} ASC
  `, params)
  return rows.map(normalizeUserRow)
}

export const findExternalUserByEmail = async (email: string) => {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return null

  const columns = await selectColumns()
  if (!columns.includes('email')) return null

  const rows = await controlEscolarCentralQuery<any[]>(`
    SELECT ${columns.map(escapeIdentifier).join(', ')}
    FROM ${escapeIdentifier(TABLE)}
    WHERE LOWER(${escapeIdentifier('email')}) = ?
    LIMIT 1
  `, [normalizedEmail])

  return rows[0] ? normalizeUserRow(rows[0]) : null
}

export const mapExternalUsersByEmail = async () => {
  const rows = await listExternalUsers(true)
  const map = new Map<string, ReturnType<typeof normalizeUserRow>>()
  for (const row of rows) {
    if (row.email) map.set(row.email, row)
  }
  return map
}

const buildUserWrite = async (body: ExternalUserInput, includePassword: boolean, existingRole?: string) => {
  const columns = await getExternalUsersColumns()
  const email = assertWorkspaceEmail(body.email)
  const planteles = plantelesValue(body.planteles)
  const firstPlantel = planteles ? planteles.split(',')[0] : ''
  const role = externalRoleCsv(body.role || existingRole || DEFAULT_ROLE)
  const values: Record<string, any> = {
    username: normalizeText(body.username || body.email || 'Usuario'),
    email,
    planteles,
    role,
    plantel: firstPlantel,
    avatar: body.avatar || buildWorkspacePhotoUrl(email, body.username || body.email || 'Usuario')
  }

  if (includePassword && columns.has('password')) {
    values.password = body.password ? bcrypt.hashSync(String(body.password), 10) : ''
  }

  return Object.entries(values).filter(([column]) => columns.has(column))
}

export const createExternalUser = async (body: ExternalUserInput) => {
  const email = assertWorkspaceEmail(body.email)
  const existing = await findExternalUserByEmail(email)
  const entries = await buildUserWrite(body, Boolean(body.password && String(body.password).trim()), existing?.role)

  if (!entries.some(([column]) => column === 'email')) {
    throw createError({ statusCode: 400, message: 'Correo requerido para usuario institucional.' })
  }

  if (existing?.id) {
    const updateEntries = entries.filter(([column]) => column !== 'email')
    if (updateEntries.length) {
      await controlEscolarCentralQuery(
        `UPDATE ${escapeIdentifier(TABLE)} SET ${updateEntries.map(([column]) => `${escapeIdentifier(column)} = ?`).join(', ')} WHERE ${escapeIdentifier('id')} = ?`,
        [...updateEntries.map(([, value]) => value), existing.id]
      )
    }
    return { success: true, id: existing.id, mode: 'updated' }
  }

  const columns = entries.map(([column]) => column)
  const values = entries.map(([, value]) => value)
  const result: any = await controlEscolarCentralQuery(
    `INSERT INTO ${escapeIdentifier(TABLE)} (${columns.map(escapeIdentifier).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    values
  )
  return { success: true, id: result?.insertId || null, mode: 'created' }
}

export const updateExternalUser = async (idOrEmail: unknown, body: ExternalUserInput) => {
  const idText = String(idOrEmail || '').trim()
  const existing = idText.includes('@') ? await findExternalUserByEmail(idText) : null
  const entries = (await buildUserWrite(body, Boolean(body.password && String(body.password).trim()), existing?.role))
    .filter(([column]) => column !== 'password' || Boolean(body.password && String(body.password).trim()))
    .filter(([column]) => column !== 'email')

  if (!entries.length) {
    throw createError({ statusCode: 400, message: 'No hay campos para actualizar.' })
  }

  const assignments = entries.map(([column]) => `${escapeIdentifier(column)} = ?`)
  const values = entries.map(([, value]) => value)
  const whereColumn = existing?.id || !idText.includes('@') ? 'id' : 'email'
  values.push(existing?.id || idText)

  await controlEscolarCentralQuery(
    `UPDATE ${escapeIdentifier(TABLE)} SET ${assignments.join(', ')} WHERE ${escapeIdentifier(whereColumn)} = ?`,
    values
  )
  return { success: true }
}

export const updateExternalControlEscolarAccess = async (body: ExternalUserInput & { enabled?: boolean; exclusive?: boolean }) => {
  const email = assertWorkspaceEmail(body.email)
  const existing = await findExternalUserByEmail(email)
  const role = setControlEscolarRole(existing?.role || body.role || DEFAULT_ROLE, Boolean(body.enabled), Boolean(body.exclusive))
  return createExternalUser({ ...body, email, role })
}

export const deleteExternalUser = async (id: unknown) => {
  const existing = String(id || '').includes('@') ? await findExternalUserByEmail(String(id)) : null
  const targetId = existing?.id || id
  await controlEscolarCentralQuery(`DELETE FROM ${escapeIdentifier(TABLE)} WHERE ${escapeIdentifier('id')} = ?`, [targetId])
  return { success: true }
}
