import bcrypt from 'bcryptjs'
import { PLANTELES_LIST } from '../../utils/constants'
import { controlEscolarCentralQuery } from './control-escolar-central'
import { buildWorkspacePhotoUrl, isCasitaWorkspaceEmail, WORKSPACE_DOMAIN } from './google-workspace-directory'
import { normalizePlantel } from './auth-session'

type TableColumn = { Field: string }

type ExternalUserInput = {
  username?: string
  displayName?: string
  password?: string
  email?: string
  planteles?: string[] | string
  role?: string
  accessMode?: 'admin' | 'control' | 'admin_control' | string
  avatar?: string | null
  picture?: string | null
}

const TABLE = 'users'
const CONTROL_ESCOLAR_ROLE = 'ROLE_CTRL'
const DEFAULT_ADMIN_ROLE = 'ROLE_ADMIN'
const escapeIdentifier = (value: string) => `\`${String(value).replace(/`/g, '``')}\``
const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()
const normalizeText = (value: unknown, max = 255) => String(value || '').trim().slice(0, max)

const normalizedRole = (value: unknown) => String(value || '').trim().toLowerCase()
const splitRoleTokens = (value: unknown) => Array.from(new Set(String(value || '')
  .split(',')
  .map((role) => role.trim())
  .filter(Boolean)
  .map((role) => role.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 80))
  .filter(Boolean)))

const hasRole = (roles: string[], target: string) => roles.some((role) => normalizedRole(role) === normalizedRole(target))
const withoutControlRole = (roles: string[]) => roles.filter((role) => normalizedRole(role) !== normalizedRole(CONTROL_ESCOLAR_ROLE))

const ensureAdminBase = (roles: string[]) => {
  const cleaned = roles.filter((role) => normalizedRole(role) !== 'plantel')
  return cleaned.length ? cleaned : [DEFAULT_ADMIN_ROLE]
}

const resolveRoleForWrite = (body: ExternalUserInput, currentRole?: string | null) => {
  const accessMode = normalizeText(body.accessMode, 40)
  const sourceRoles = splitRoleTokens(currentRole || body.role || DEFAULT_ADMIN_ROLE)

  if (accessMode === 'control') {
    return CONTROL_ESCOLAR_ROLE
  }

  if (accessMode === 'admin_control') {
    const roles = ensureAdminBase(withoutControlRole(sourceRoles))
    if (!hasRole(roles, CONTROL_ESCOLAR_ROLE)) roles.push(CONTROL_ESCOLAR_ROLE)
    return roles.join(',')
  }

  if (accessMode === 'admin') {
    return ensureAdminBase(withoutControlRole(sourceRoles)).join(',')
  }

  return (splitRoleTokens(body.role || currentRole).join(',') || DEFAULT_ADMIN_ROLE).slice(0, 255)
}

const assertWorkspaceEmail = (email: unknown) => {
  const normalized = normalizeEmail(email)
  if (!normalized || !isCasitaWorkspaceEmail(normalized)) {
    throw createError({ statusCode: 400, message: `Solo se pueden guardar cuentas @${WORKSPACE_DOMAIN}.` })
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      displayName VARCHAR(255) DEFAULT NULL,
      username VARCHAR(255) NOT NULL,
      email VARCHAR(255) DEFAULT NULL,
      password VARCHAR(255) DEFAULT '',
      plaintext VARCHAR(255) DEFAULT NULL,
      picture TEXT,
      role VARCHAR(255) NOT NULL DEFAULT '${DEFAULT_ADMIN_ROLE}',
      planteles TEXT,
      plantel VARCHAR(255) DEFAULT NULL,
      campus VARCHAR(255) DEFAULT NULL,
      empresa VARCHAR(255) DEFAULT NULL,
      facebook VARCHAR(255) DEFAULT NULL,
      unidad VARCHAR(255) DEFAULT NULL,
      sala VARCHAR(255) DEFAULT NULL,
      nombre_nino VARCHAR(255) DEFAULT NULL,
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
  return [
    'id',
    'created_at',
    'displayName',
    'username',
    'email',
    'planteles',
    'plantel',
    'campus',
    'empresa',
    'role',
    'picture',
    'avatar'
  ].filter((column) => columns.has(column))
}

const normalizeUserRow = (row: any) => {
  const email = normalizeEmail(row.email)
  const fullName = normalizeText(row.displayName || row.username || email || 'Usuario')
  const planteles = plantelesValue(row.planteles || row.plantel)
  const avatar = row.picture || row.avatar || (email ? buildWorkspacePhotoUrl(email, fullName) : null)

  return {
    id: row.id,
    username: fullName,
    displayName: fullName,
    workspaceName: fullName,
    email,
    planteles,
    role: row.role || DEFAULT_ADMIN_ROLE,
    created_at: row.created_at || null,
    avatar,
    picture: avatar,
    plantel: normalizePlantel(row.plantel) || (planteles ? planteles.split(',')[0] : ''),
    campus: row.campus || '',
    empresa: row.empresa || '',
    source: 'external'
  }
}

const workspaceDomainWhere = () => `LOWER(TRIM(COALESCE(${escapeIdentifier('email')}, ''))) LIKE ?`
const workspaceDomainParam = () => `%@${WORKSPACE_DOMAIN}`

export const listExternalUsers = async (searchValue: unknown = '') => {
  const columns = await selectColumns()
  const search = normalizeText(searchValue, 120).toLowerCase()
  const where = [workspaceDomainWhere()]
  const params: any[] = [workspaceDomainParam()]

  if (search) {
    const searchable = ['displayName', 'username', 'email', 'planteles', 'plantel', 'campus', 'empresa']
      .filter((column) => columns.includes(column))
    if (searchable.length) {
      where.push(`(${searchable.map((column) => `LOWER(COALESCE(${escapeIdentifier(column)}, '')) LIKE ?`).join(' OR ')})`)
      params.push(...searchable.map(() => `%${search}%`))
    }
  }

  const sortColumn = columns.includes('displayName') ? 'displayName' : (columns.includes('username') ? 'username' : 'email')
  const rows = await controlEscolarCentralQuery<any[]>(`
    SELECT ${columns.map(escapeIdentifier).join(', ')}
    FROM ${escapeIdentifier(TABLE)}
    WHERE ${where.join(' AND ')}
    ORDER BY ${escapeIdentifier(sortColumn)} ASC
  `, params)
  return rows.map(normalizeUserRow).filter((row) => isCasitaWorkspaceEmail(row.email))
}

export const findExternalUserByEmail = async (email: string) => {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail || !isCasitaWorkspaceEmail(normalizedEmail)) return null

  const columns = await selectColumns()
  if (!columns.includes('email')) return null

  const rows = await controlEscolarCentralQuery<any[]>(`
    SELECT ${columns.map(escapeIdentifier).join(', ')}
    FROM ${escapeIdentifier(TABLE)}
    WHERE ${escapeIdentifier('email')} = ? AND ${workspaceDomainWhere()}
    LIMIT 1
  `, [normalizedEmail, workspaceDomainParam()])

  return rows[0] ? normalizeUserRow(rows[0]) : null
}

const loadRawUserById = async (id: unknown) => {
  const columns = await selectColumns()
  const rows = await controlEscolarCentralQuery<any[]>(`
    SELECT ${columns.map(escapeIdentifier).join(', ')}
    FROM ${escapeIdentifier(TABLE)}
    WHERE ${escapeIdentifier('id')} = ? AND ${workspaceDomainWhere()}
    LIMIT 1
  `, [id, workspaceDomainParam()])
  return rows[0] || null
}

const buildUserWrite = async (body: ExternalUserInput, includePassword: boolean, currentRole?: string | null) => {
  const columns = await getExternalUsersColumns()
  const email = assertWorkspaceEmail(body.email)
  const planteles = plantelesValue(body.planteles)
  const firstPlantel = planteles ? planteles.split(',')[0] : ''
  const displayName = normalizeText(body.displayName || body.username || email || 'Usuario')
  const picture = body.picture || body.avatar || buildWorkspacePhotoUrl(email, displayName)
  const values: Record<string, any> = {
    displayName,
    username: normalizeText(body.username || email || displayName),
    email,
    planteles,
    role: resolveRoleForWrite(body, currentRole),
    plantel: firstPlantel,
    avatar: picture,
    picture
  }

  if (includePassword && columns.has('password')) {
    values.password = body.password ? bcrypt.hashSync(String(body.password), 10) : ''
  }

  return Object.entries(values).filter(([column]) => columns.has(column))
}

export const createExternalUser = async (body: ExternalUserInput) => {
  const email = assertWorkspaceEmail(body.email)
  const existing = await findExternalUserByEmail(email)
  if (existing?.id) return updateExternalUser(existing.id, body)

  const entries = await buildUserWrite(body, true)
  if (!entries.some(([column]) => column === 'email')) {
    throw createError({ statusCode: 400, message: 'Correo requerido.' })
  }

  const columns = entries.map(([column]) => column)
  const values = entries.map(([, value]) => value)
  await controlEscolarCentralQuery(
    `INSERT INTO ${escapeIdentifier(TABLE)} (${columns.map(escapeIdentifier).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    values
  )
  return { success: true }
}

export const updateExternalUser = async (id: unknown, body: ExternalUserInput) => {
  const current = await loadRawUserById(id)
  if (!current) {
    throw createError({ statusCode: 404, message: 'Usuario no encontrado.' })
  }

  const entries = (await buildUserWrite(body, Boolean(body.password && String(body.password).trim()), current.role))
    .filter(([column]) => column !== 'password' || Boolean(body.password && String(body.password).trim()))

  if (!entries.length) {
    throw createError({ statusCode: 400, message: 'No hay cambios para guardar.' })
  }

  const assignments = entries.map(([column]) => `${escapeIdentifier(column)} = ?`)
  const values = entries.map(([, value]) => value)
  values.push(id)

  await controlEscolarCentralQuery(
    `UPDATE ${escapeIdentifier(TABLE)} SET ${assignments.join(', ')} WHERE ${escapeIdentifier('id')} = ? AND ${workspaceDomainWhere()}`,
    [...values, workspaceDomainParam()]
  )
  return { success: true }
}

export const deleteExternalUser = async (id: unknown) => {
  await controlEscolarCentralQuery(
    `DELETE FROM ${escapeIdentifier(TABLE)} WHERE ${escapeIdentifier('id')} = ? AND ${workspaceDomainWhere()}`,
    [id, workspaceDomainParam()]
  )
  return { success: true }
}
