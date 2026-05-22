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
  ingresosBlocked?: boolean | number | string | null
  ingresos_blocked?: boolean | number | string | null
}

type ExternalLoginInput = {
  email: string
  name?: string | null
  picture?: string | null
  requestedPlantel?: string | null
}

const TABLE = 'users'
const CONTROL_ESCOLAR_ROLE = 'ROLE_CTRL'
const DEFAULT_EXTERNAL_ROLE = 'ROLE_HUSKY_USER'
const PROTECTED_EMAILS = new Set([
  `desarrollo.tecnologico@${WORKSPACE_DOMAIN}`,
  `coord.admon@${WORKSPACE_DOMAIN}`
])

const escapeIdentifier = (value: string) => `\`${String(value).replace(/`/g, '``')}\``
const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()
const normalizeText = (value: unknown, max = 255) => String(value || '').trim().slice(0, max)
const normalizedRole = (value: unknown) => String(value || '').trim().toLowerCase()
const normalizeBlocked = (value: unknown) => value === true || value === 1 || value === '1' || String(value || '').toLowerCase() === 'true'
const blockedValue = (value: unknown) => normalizeBlocked(value) ? 1 : 0
const dateMs = (value: unknown) => {
  const parsed = value ? new Date(String(value)).getTime() : 0
  return Number.isFinite(parsed) ? parsed : 0
}

const splitRoleTokens = (value: unknown) => Array.from(new Set(String(value || '')
  .split(',')
  .map((role) => role.trim())
  .filter(Boolean)
  .map((role) => role.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 80))
  .filter(Boolean)))

const hasRole = (roles: string[], target: string) => roles.some((role) => normalizedRole(role) === normalizedRole(target))
const hasControlRoleValue = (value: unknown) => hasRole(splitRoleTokens(value), CONTROL_ESCOLAR_ROLE)
const withoutControlRole = (roles: string[]) => roles.filter((role) => normalizedRole(role) !== normalizedRole(CONTROL_ESCOLAR_ROLE))

const ensureDefaultBase = (roles: string[]) => {
  const cleaned = roles.filter((role) => normalizedRole(role) !== 'plantel')
  return cleaned.length ? cleaned : [DEFAULT_EXTERNAL_ROLE]
}

const resolveRoleForWrite = (body: ExternalUserInput, currentRole?: string | null) => {
  const accessMode = normalizeText(body.accessMode, 40)
  const sourceRoles = splitRoleTokens(currentRole || body.role || DEFAULT_EXTERNAL_ROLE)

  if (accessMode === 'control') {
    return CONTROL_ESCOLAR_ROLE
  }

  if (accessMode === 'admin_control') {
    const roles = ensureDefaultBase(withoutControlRole(sourceRoles))
    if (!hasRole(roles, CONTROL_ESCOLAR_ROLE)) roles.push(CONTROL_ESCOLAR_ROLE)
    return roles.join(',')
  }

  if (accessMode === 'admin') {
    return ensureDefaultBase(withoutControlRole(sourceRoles)).join(',')
  }

  return (splitRoleTokens(body.role || currentRole).join(',') || DEFAULT_EXTERNAL_ROLE).slice(0, 255)
}

const assertWorkspaceEmail = (email: unknown) => {
  const normalized = normalizeEmail(email)
  if (!normalized || !isCasitaWorkspaceEmail(normalized)) {
    throw createError({ statusCode: 400, message: `Solo se pueden guardar cuentas @${WORKSPACE_DOMAIN}.` })
  }
  return normalized
}

const assertNotProtectedBlock = (email: unknown, blocked: unknown) => {
  const normalized = normalizeEmail(email)
  if (PROTECTED_EMAILS.has(normalized) && normalizeBlocked(blocked)) {
    throw createError({ statusCode: 400, message: 'No se puede bloquear una cuenta protegida.' })
  }
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
      role VARCHAR(255) NOT NULL DEFAULT '${DEFAULT_EXTERNAL_ROLE}',
      planteles TEXT,
      plantel VARCHAR(255) DEFAULT NULL,
      campus VARCHAR(255) DEFAULT NULL,
      empresa VARCHAR(255) DEFAULT NULL,
      facebook VARCHAR(255) DEFAULT NULL,
      unidad VARCHAR(255) DEFAULT NULL,
      sala VARCHAR(255) DEFAULT NULL,
      nombre_nino VARCHAR(255) DEFAULT NULL,
      last_login_at DATETIME DEFAULT NULL,
      ingresos_blocked TINYINT(1) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY users_email_idx (email)
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
    'avatar',
    'last_login_at',
    'ingresos_blocked'
  ].filter((column) => columns.has(column))
}

const normalizeUserRow = (row: any) => {
  const email = normalizeEmail(row.email)
  const fullName = normalizeText(row.displayName || row.username || email || 'Usuario')
  const planteles = plantelesValue(row.planteles || row.plantel)
  const avatar = row.picture || row.avatar || (email ? buildWorkspacePhotoUrl(email, fullName) : null)
  const ingresosBlocked = normalizeBlocked(row.ingresos_blocked)

  return {
    id: row.id,
    username: fullName,
    displayName: fullName,
    workspaceName: fullName,
    email,
    planteles,
    role: row.role || DEFAULT_EXTERNAL_ROLE,
    created_at: row.created_at || null,
    last_login_at: row.last_login_at || null,
    lastLoginAt: row.last_login_at || null,
    ingresos_blocked: ingresosBlocked ? 1 : 0,
    ingresosBlocked,
    protected: PROTECTED_EMAILS.has(email),
    avatar,
    picture: avatar,
    plantel: normalizePlantel(row.plantel) || (planteles ? planteles.split(',')[0] : ''),
    campus: row.campus || '',
    empresa: row.empresa || '',
    source: 'external'
  }
}

const betterDisplayRow = (current: any, candidate: any) => {
  if (!current) return candidate
  const currentHasControl = hasControlRoleValue(current.role)
  const candidateHasControl = hasControlRoleValue(candidate.role)
  if (candidateHasControl && !currentHasControl) return candidate
  if (candidate.ingresos_blocked && !current.ingresos_blocked) return candidate
  if (dateMs(candidate.last_login_at) > dateMs(current.last_login_at)) return candidate
  if (!current.displayName && candidate.displayName) return candidate
  if ((Number(candidate.id) || 0) > (Number(current.id) || 0) && dateMs(candidate.last_login_at) === dateMs(current.last_login_at)) return candidate
  return current
}

const mergeRowsForEmail = (rows: any[]) => {
  if (!rows.length) return null
  const normalizedRows = rows.map(normalizeUserRow).filter((row) => isCasitaWorkspaceEmail(row.email))
  if (!normalizedRows.length) return null
  const selected = normalizedRows.reduce((current, candidate) => betterDisplayRow(current, candidate), null as any)
  const blocked = normalizedRows.some((row) => row.ingresosBlocked)
  const lastLogin = normalizedRows.reduce((max, row) => dateMs(row.last_login_at) > dateMs(max) ? row.last_login_at : max, selected.last_login_at || null)
  const role = normalizedRows.some((row) => hasControlRoleValue(row.role))
    ? CONTROL_ESCOLAR_ROLE
    : selected.role

  return {
    ...selected,
    role,
    last_login_at: lastLogin,
    lastLoginAt: lastLogin,
    ingresos_blocked: blocked ? 1 : 0,
    ingresosBlocked: blocked,
    duplicateCount: normalizedRows.length
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
    const searchable = ['displayName', 'username', 'email', 'planteles', 'plantel', 'campus', 'empresa', 'role']
      .filter((column) => columns.includes(column))
    if (searchable.length) {
      where.push(`(${searchable.map((column) => `LOWER(COALESCE(${escapeIdentifier(column)}, '')) LIKE ?`).join(' OR ')})`)
      params.push(...searchable.map(() => `%${search}%`))
    }
  }

  const orderParts = []
  if (columns.includes('last_login_at')) orderParts.push(`${escapeIdentifier('last_login_at')} IS NULL ASC`, `${escapeIdentifier('last_login_at')} DESC`)
  if (columns.includes('displayName')) orderParts.push(`${escapeIdentifier('displayName')} ASC`)
  orderParts.push(`${escapeIdentifier('id')} DESC`)

  const rows = await controlEscolarCentralQuery<any[]>(`
    SELECT ${columns.map(escapeIdentifier).join(', ')}
    FROM ${escapeIdentifier(TABLE)}
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderParts.join(', ')}
  `, params)

  const byEmail = new Map<string, any[]>()
  for (const row of rows) {
    const email = normalizeEmail(row.email)
    if (!isCasitaWorkspaceEmail(email)) continue
    const bucket = byEmail.get(email) || []
    bucket.push(row)
    byEmail.set(email, bucket)
  }

  return Array.from(byEmail.values())
    .map((emailRows) => mergeRowsForEmail(emailRows))
    .filter(Boolean)
    .sort((a, b) => dateMs(b.last_login_at) - dateMs(a.last_login_at) || String(a.displayName || a.email).localeCompare(String(b.displayName || b.email)))
}

const loadRawUsersByEmail = async (email: string) => {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail || !isCasitaWorkspaceEmail(normalizedEmail)) return []

  const columns = await selectColumns()
  if (!columns.includes('email')) return []

  return await controlEscolarCentralQuery<any[]>(`
    SELECT ${columns.map(escapeIdentifier).join(', ')}
    FROM ${escapeIdentifier(TABLE)}
    WHERE LOWER(TRIM(${escapeIdentifier('email')})) = ? AND ${workspaceDomainWhere()}
    ORDER BY ${escapeIdentifier('id')} DESC
  `, [normalizedEmail, workspaceDomainParam()])
}

export const findExternalUserByEmail = async (email: string) => {
  const rows = await loadRawUsersByEmail(email)
  return mergeRowsForEmail(rows)
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

  if ('ingresosBlocked' in body || 'ingresos_blocked' in body) {
    const blocked = body.ingresosBlocked ?? body.ingresos_blocked
    assertNotProtectedBlock(email, blocked)
    values.ingresos_blocked = blockedValue(blocked)
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

  const entries = (await buildUserWrite({ ...body, email: body.email || current.email }, Boolean(body.password && String(body.password).trim()), current.role))
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

export const bulkUpdateExternalUsers = async (body: ExternalUserInput & { emails?: string[]; ids?: Array<string | number> }) => {
  const columns = await getExternalUsersColumns()
  const emails = Array.from(new Set((body.emails || [])
    .map(normalizeEmail)
    .filter((email) => isCasitaWorkspaceEmail(email))))
  const ids = Array.from(new Set((body.ids || [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0)))

  if (!emails.length && !ids.length) {
    throw createError({ statusCode: 400, message: 'Seleccione usuarios.' })
  }

  const selectedRows: any[] = []
  for (const email of emails) selectedRows.push(...await loadRawUsersByEmail(email))
  for (const id of ids) {
    const row = await loadRawUserById(id)
    if (row) selectedRows.push(row)
  }

  const uniqueRows = Array.from(new Map(selectedRows.map((row) => [String(row.id), row])).values())
  let updated = 0
  const shouldUpdateBlocked = columns.has('ingresos_blocked') && ('ingresosBlocked' in body || 'ingresos_blocked' in body)
  const shouldUpdateRole = Boolean(body.accessMode || body.role)

  for (const row of uniqueRows) {
    const email = normalizeEmail(row.email)
    if (!isCasitaWorkspaceEmail(email)) continue

    const values: Record<string, any> = {}
    if (shouldUpdateBlocked) {
      const blocked = body.ingresosBlocked ?? body.ingresos_blocked
      assertNotProtectedBlock(email, blocked)
      values.ingresos_blocked = blockedValue(blocked)
    }
    if (shouldUpdateRole && columns.has('role')) {
      values.role = resolveRoleForWrite({ ...body, email }, row.role)
    }

    const entries = Object.entries(values).filter(([column]) => columns.has(column))
    if (!entries.length) continue

    await controlEscolarCentralQuery(
      `UPDATE ${escapeIdentifier(TABLE)} SET ${entries.map(([column]) => `${escapeIdentifier(column)} = ?`).join(', ')} WHERE ${escapeIdentifier('id')} = ? AND ${workspaceDomainWhere()}`,
      [...entries.map(([, value]) => value), row.id, workspaceDomainParam()]
    )
    updated++
  }

  return { success: true, updated }
}

export const touchExternalUserLogin = async ({ email, name, picture, requestedPlantel }: ExternalLoginInput) => {
  const normalizedEmail = assertWorkspaceEmail(email)
  const columns = await getExternalUsersColumns()
  let rawRows = await loadRawUsersByEmail(normalizedEmail)

  if (!rawRows.length) {
    const displayName = normalizeText(name || normalizedEmail)
    await createExternalUser({
      email: normalizedEmail,
      username: normalizedEmail,
      displayName,
      picture: picture || buildWorkspacePhotoUrl(normalizedEmail, displayName),
      avatar: picture || buildWorkspacePhotoUrl(normalizedEmail, displayName),
      planteles: normalizePlantel(requestedPlantel) || PLANTELES_LIST[0],
      role: DEFAULT_EXTERNAL_ROLE,
      ingresosBlocked: false
    })
    rawRows = await loadRawUsersByEmail(normalizedEmail)
  }

  const merged = mergeRowsForEmail(rawRows)
  if (!merged) return null
  if (merged.ingresosBlocked) return merged

  const updates: Record<string, any> = {}
  if (columns.has('last_login_at')) updates.last_login_at = new Date()
  if (columns.has('displayName') && name) updates.displayName = normalizeText(name)
  if (columns.has('username')) updates.username = normalizedEmail
  if (picture) {
    if (columns.has('picture')) updates.picture = picture
    if (columns.has('avatar')) updates.avatar = picture
  }

  const entries = Object.entries(updates).filter(([column]) => columns.has(column))
  if (entries.length) {
    await controlEscolarCentralQuery(
      `UPDATE ${escapeIdentifier(TABLE)} SET ${entries.map(([column]) => `${escapeIdentifier(column)} = ?`).join(', ')} WHERE LOWER(TRIM(${escapeIdentifier('email')})) = ? AND ${workspaceDomainWhere()}`,
      [...entries.map(([, value]) => value), normalizedEmail, workspaceDomainParam()]
    )
  }

  return await findExternalUserByEmail(normalizedEmail)
}

export const deleteExternalUser = async (id: unknown) => {
  await controlEscolarCentralQuery(
    `DELETE FROM ${escapeIdentifier(TABLE)} WHERE ${escapeIdentifier('id')} = ? AND ${workspaceDomainWhere()}`,
    [id, workspaceDomainParam()]
  )
  return { success: true }
}
