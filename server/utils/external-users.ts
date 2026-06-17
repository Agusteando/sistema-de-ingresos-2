import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { PoolConnection } from 'mysql2/promise'
import { PLANTELES_LIST } from '../../utils/constants'
import { controlEscolarCentralQuery, withControlEscolarCentralConnection } from './control-escolar-central'
import { buildWorkspacePhotoUrl, isCasitaWorkspaceEmail, WORKSPACE_DOMAIN } from './google-workspace-directory'
import { CONTROL_ESCOLAR_ROLE, FINANCIAL_ADMIN_ROLE, normalizePlantel } from './auth-session'

type TableColumn = { Field: string }

type ExternalUserInput = {
  username?: string
  displayName?: string
  password?: string
  email?: string
  plantel?: string[] | string
  role?: string
  accessMode?: 'admin' | 'control' | 'financial' | 'both' | 'admin_control' | string
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
export const NO_ADEUDO_CONTROL_PLANTELES_COLUMN = 'no_adeudo_control_planteles'
const DEFAULT_EXTERNAL_ROLE = CONTROL_ESCOLAR_ROLE
const SUPERADMIN_ROLES = new Set(['superadmin'])
const HARD_CODED_SUPERADMIN_EMAIL = 'desarrollo.tecnologico@casitaiedis.edu.mx'
const ALL_PLANTELES_VALUE = PLANTELES_LIST.join(',')
const SEEDED_SUPERADMIN_EMAILS = new Set([
  HARD_CODED_SUPERADMIN_EMAIL,
  `coord.admon@${WORKSPACE_DOMAIN}`
])
const PROTECTED_EMAILS = SEEDED_SUPERADMIN_EMAILS

const escapeIdentifier = (value: string) => `\`${String(value).replace(/`/g, '``')}\``
const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()
const normalizeText = (value: unknown, max = 255) => String(value || '').trim().slice(0, max)
const normalizedRole = (value: unknown) => String(value || '').trim().toLowerCase()
const isHardCodedSuperAdminEmail = (value: unknown) => SEEDED_SUPERADMIN_EMAILS.has(normalizeEmail(value))
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
const hasSuperAdminRoleValue = (value: unknown) => splitRoleTokens(value).some((role) => SUPERADMIN_ROLES.has(normalizedRole(role)))
const hasFinancialAdminRoleValue = (value: unknown) => hasRole(splitRoleTokens(value), FINANCIAL_ADMIN_ROLE)

const normalizedApplicationRoles = (value: unknown) => {
  if (hasSuperAdminRoleValue(value)) return ['superadmin']
  const roles: string[] = []
  if (hasControlRoleValue(value)) roles.push(CONTROL_ESCOLAR_ROLE)
  if (hasFinancialAdminRoleValue(value)) roles.push(FINANCIAL_ADMIN_ROLE)
  return roles.length ? roles : [DEFAULT_EXTERNAL_ROLE]
}

const serializeApplicationRoles = (value: unknown) => normalizedApplicationRoles(value).join(',')

const resolveRoleForWrite = (body: ExternalUserInput, currentRole?: string | null) => {
  if (isHardCodedSuperAdminEmail(body.email)) return 'superadmin'

  const accessMode = normalizeText(body.accessMode, 40)
  if (accessMode === 'superadmin') return 'superadmin'
  if (accessMode === 'both' || accessMode === 'admin_control') {
    return `${CONTROL_ESCOLAR_ROLE},${FINANCIAL_ADMIN_ROLE}`
  }
  if (accessMode === 'financial' || accessMode === 'admin') return FINANCIAL_ADMIN_ROLE
  if (accessMode === 'control') return CONTROL_ESCOLAR_ROLE

  return serializeApplicationRoles(body.role || currentRole || DEFAULT_EXTERNAL_ROLE)
}

const assertWorkspaceEmail = (email: unknown) => {
  const normalized = normalizeEmail(email)
  if (!normalized || !isCasitaWorkspaceEmail(normalized)) {
    throw createError({ statusCode: 400, message: 'No se pudo guardar el usuario.' })
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

type SqlExecutor = <T>(sql: string, params?: any[]) => Promise<T>

const centralExecutor: SqlExecutor = async <T>(sql: string, params?: any[]) =>
  await controlEscolarCentralQuery<T>(sql, params)

const connectionExecutor = (connection: PoolConnection): SqlExecutor => async <T>(sql: string, params?: any[]) => {
  const [rows] = await connection.query(sql, params as never)
  return rows as T
}

const externalUserLockName = (email: string) => `aurora-user-${createHash('sha256').update(email).digest('hex').slice(0, 40)}`

const withExternalUserEmailLocks = async <T>(emails: unknown[], callback: (query: SqlExecutor) => Promise<T>) => {
  const normalizedEmails = Array.from(new Set(emails.map(normalizeEmail).filter(Boolean))).sort()
  return await withControlEscolarCentralConnection(async (connection) => {
    const query = connectionExecutor(connection)
    const acquired: string[] = []
    try {
      for (const email of normalizedEmails) {
        const lockName = externalUserLockName(email)
        const rows = await query<Array<{ acquired: number | string | null }>>('SELECT GET_LOCK(?, 10) AS acquired', [lockName])
        if (Number(rows?.[0]?.acquired) !== 1) {
          throw createError({ statusCode: 503, message: 'No se pudo asegurar la actualización única del usuario.' })
        }
        acquired.push(lockName)
      }
      return await callback(query)
    } finally {
      for (const lockName of acquired.reverse()) {
        try {
          await query('SELECT RELEASE_LOCK(?)', [lockName])
        } catch {}
      }
    }
  })
}

let externalUsersReady: { ok: boolean; columns: Set<string>; loadedAt: number; error?: string } | null = null
const CACHE_MS = 1000 * 60 * 5

export const getExternalUsersColumns = async (force = false) => {
  if (!force && externalUsersReady && externalUsersReady.ok && Date.now() - externalUsersReady.loadedAt < CACHE_MS) {
    return externalUsersReady.columns
  }

  try {
    const rows = await controlEscolarCentralQuery<TableColumn[]>(`SHOW COLUMNS FROM ${escapeIdentifier(TABLE)}`)
    const columns = new Set(rows.map((row) => row.Field))
    externalUsersReady = { ok: true, columns, loadedAt: Date.now() }
    return columns
  } catch (error: any) {
    externalUsersReady = {
      ok: false,
      columns: new Set(),
      loadedAt: Date.now(),
      error: error?.message || String(error || 'External users unavailable')
    }
    throw error
  }
}

export const getExternalUsersDiagnostics = async () => {
  const config = useRuntimeConfig() as any
  const requiredColumns = ['email', 'plantel', 'role', 'last_login_at', 'ingresos_blocked']
  const safeRuntime = {
    target: 'CONTROL_ESCOLAR_MYSQL_DATABASE.users',
    table: TABLE,
    domain: WORKSPACE_DOMAIN,
    hostConfigured: Boolean(String(config.controlEscolarMysqlHost || '').trim()),
    databaseConfigured: Boolean(String(config.controlEscolarMysqlDatabase || '').trim()),
    userConfigured: Boolean(String(config.controlEscolarMysqlUser || '').trim()),
    port: Number(config.controlEscolarMysqlPort || 3306)
  }

  try {
    const columns = await getExternalUsersColumns(true)
    const columnList = Array.from(columns).sort()
    return {
      ok: true,
      ...safeRuntime,
      columns: columnList,
      requiredColumns,
      missingColumns: requiredColumns.filter((column) => !columns.has(column)),
      lastCachedError: externalUsersReady?.error || null
    }
  } catch (error: any) {
    return {
      ok: false,
      ...safeRuntime,
      requiredColumns,
      columns: [],
      missingColumns: requiredColumns,
      errorName: error?.name || 'ExternalUsersError',
      errorCode: error?.code || error?.errno || null,
      errorMessage: error?.message || String(error || 'No se pudo leer la tabla users'),
      lastCachedError: externalUsersReady?.error || null
    }
  }
}

export const ensureExternalUsersTable = async () => {
  return await getExternalUsersColumns(true)
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
    'plantel',
    'campus',
    'empresa',
    'role',
    'picture',
    'avatar',
    'last_login_at',
    'ingresos_blocked',
    NO_ADEUDO_CONTROL_PLANTELES_COLUMN
  ].filter((column) => columns.has(column))
}

const selectAuthColumns = async () => {
  const columns = await getExternalUsersColumns()
  return [
    'id',
    'displayName',
    'username',
    'email',
    'plantel',
    'role',
    'ingresos_blocked'
  ].filter((column) => columns.has(column))
}

/**
 * Bounded one-row projection for login and impersonation. It deliberately
 * excludes picture/avatar and does not consolidate duplicate records.
 */
export const findExternalAuthUserByEmail = async (email: string) => {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail || !isCasitaWorkspaceEmail(normalizedEmail)) return null

  const columns = await selectAuthColumns()
  if (!columns.includes('email')) return null

  const blockedProjection = columns.includes('ingresos_blocked')
    ? `COALESCE((
        SELECT MAX(COALESCE(auth_blocked.${escapeIdentifier('ingresos_blocked')}, 0))
        FROM ${escapeIdentifier(TABLE)} auth_blocked
        WHERE LOWER(TRIM(auth_blocked.${escapeIdentifier('email')})) = ?
      ), 0) AS ${escapeIdentifier('__effective_ingresos_blocked')}`
    : `0 AS ${escapeIdentifier('__effective_ingresos_blocked')}`
  const orderBy = columns.includes('id') ? `ORDER BY ${escapeIdentifier('id')} ASC` : ''
  const params = columns.includes('ingresos_blocked')
    ? [normalizedEmail, normalizedEmail]
    : [normalizedEmail]

  const rows = await controlEscolarCentralQuery<any[]>(`
    SELECT ${columns.map(escapeIdentifier).join(', ')}, ${blockedProjection}
    FROM ${escapeIdentifier(TABLE)}
    WHERE LOWER(TRIM(${escapeIdentifier('email')})) = ?
    ${orderBy}
    LIMIT 1
  `, params)

  const row = rows[0]
  if (!row) return null

  const resolvedEmail = normalizeEmail(row.email)
  const displayName = normalizeText(row.displayName || row.username || resolvedEmail || 'Usuario')
  const plantel = plantelesValue(row.plantel)
  const ingresosBlocked = normalizeBlocked(row.__effective_ingresos_blocked ?? row.ingresos_blocked)

  return {
    id: row.id,
    username: displayName,
    displayName,
    email: resolvedEmail,
    plantel,
    planteles: plantel,
    role: String(row.role || 'plantel').trim() || 'plantel',
    ingresos_blocked: ingresosBlocked ? 1 : 0,
    ingresosBlocked,
    source: 'external-auth'
  }
}

const normalizeUserRow = (row: any) => {
  const email = normalizeEmail(row.email)
  const fullName = normalizeText(row.displayName || row.username || email || 'Usuario')
  const plantel = plantelesValue(row.plantel)
  const avatar = row.picture || row.avatar || (email ? buildWorkspacePhotoUrl(email, fullName) : null)
  const ingresosBlocked = normalizeBlocked(row.ingresos_blocked)

  return {
    id: row.id,
    username: fullName,
    displayName: fullName,
    workspaceName: fullName,
    email,
    plantel,
    planteles: plantel,
    role: row.role || DEFAULT_EXTERNAL_ROLE,
    created_at: row.created_at || null,
    last_login_at: row.last_login_at || null,
    lastLoginAt: row.last_login_at || null,
    ingresos_blocked: ingresosBlocked ? 1 : 0,
    ingresosBlocked,
    no_adeudo_control_planteles: row[NO_ADEUDO_CONTROL_PLANTELES_COLUMN] || '',
    noAdeudoControlPlanteles: plantelesValue(row[NO_ADEUDO_CONTROL_PLANTELES_COLUMN]),
    protected: PROTECTED_EMAILS.has(email),
    avatar,
    picture: avatar,
    campus: row.campus || '',
    empresa: row.empresa || '',
    source: 'external'
  }
}

const rawUserSortValue = (row: any) => {
  const id = Number(row?.id)
  if (Number.isFinite(id) && id > 0) return id
  const created = dateMs(row?.created_at)
  return created || Number.MAX_SAFE_INTEGER
}

const canonicalRawUserRow = (rows: any[]) => [...rows]
  .filter((row) => isCasitaWorkspaceEmail(normalizeEmail(row?.email)))
  .sort((a, b) => rawUserSortValue(a) - rawUserSortValue(b))[0] || null

const mergeRowsForEmail = (rows: any[]) => {
  const canonical = canonicalRawUserRow(rows)
  if (!canonical) return null
  return {
    ...normalizeUserRow(canonical),
    role: serializeApplicationRoles(canonical.role),
    duplicateCount: rows.length
  }
}


export const externalUserAccessMode = (userOrRole: unknown) => {
  const user = userOrRole && typeof userOrRole === 'object' ? userOrRole as any : null
  const role = user ? user.role : userOrRole
  if (hasSuperAdminRoleValue(role)) return 'superadmin'
  const control = hasControlRoleValue(role)
  const financial = hasFinancialAdminRoleValue(role)
  if (control && financial) return 'both'
  if (financial) return 'financial'
  return 'control'
}

const accessLabelForMode = (mode: string) => {
  if (mode === 'superadmin') return 'Superadmin'
  if (mode === 'both') return 'Control Escolar + Financiero'
  if (mode === 'financial') return 'Financiero'
  return 'Control Escolar'
}

const normalizedPlantelList = (value: unknown) => plantelesValue(value)
  .split(',')
  .map(normalizePlantel)
  .filter(Boolean)

const userMatchesPlantel = (user: any, plantelValue: unknown) => {
  const rawPlantel = String(plantelValue || '').trim()
  if (rawPlantel === '__sin_plantel__') return !normalizedPlantelList(user?.plantel).length
  const plantel = normalizePlantel(plantelValue)
  if (!plantel || plantel === 'all') return true
  return normalizedPlantelList(user?.plantel).includes(plantel)
}

const userLastLoginMs = (user: any) => dateMs(user?.last_login_at || user?.lastLoginAt)
const userIsProtected = (user: any) => Boolean(user?.protected) || PROTECTED_EMAILS.has(normalizeEmail(user?.email))
const userIsBlocked = (user: any) => normalizeBlocked(user?.ingresos_blocked ?? user?.ingresosBlocked)
const userStatusMode = (user: any) => {
  if (userIsProtected(user)) return 'protected'
  if (userIsBlocked(user)) return 'blocked'
  return 'active'
}
const userActivityMode = (user: any) => {
  const ms = userLastLoginMs(user)
  if (!ms) return 'never'
  const age = Date.now() - ms
  if (age <= 24 * 60 * 60 * 1000) return 'today'
  if (age <= 7 * 24 * 60 * 60 * 1000) return 'week'
  if (age <= 30 * 24 * 60 * 60 * 1000) return 'month'
  return 'older'
}

const enrichAccessMetadata = (user: any) => {
  const accessMode = externalUserAccessMode(user)
  return {
    ...user,
    accessMode,
    accessLabel: accessLabelForMode(accessMode),
    statusMode: userStatusMode(user),
    activityMode: userActivityMode(user),
    plantelesList: normalizedPlantelList(user?.plantel),
    protected: userIsProtected(user)
  }
}

const userMatchesStatus = (user: any, value: unknown) => {
  const status = normalizeText(value, 40) || 'all'
  if (status === 'all') return true
  return userStatusMode(user) === status
}

const userMatchesAccess = (user: any, value: unknown) => {
  const access = normalizeText(value, 40) || 'all'
  if (access === 'all') return true
  return externalUserAccessMode(user) === access
}

const userMatchesActivity = (user: any, value: unknown) => {
  const activity = normalizeText(value, 40) || 'all'
  if (activity === 'all') return true
  return userActivityMode(user) === activity
}

const sortExternalUsers = (rows: any[], sortValue: unknown) => {
  const sort = normalizeText(sortValue, 60) || 'last_login_desc'
  return [...rows].sort((a, b) => {
    const nameA = String(a.displayName || a.username || a.email || '')
    const nameB = String(b.displayName || b.username || b.email || '')
    if (sort === 'name_asc') return nameA.localeCompare(nameB)
    if (sort === 'name_desc') return nameB.localeCompare(nameA)
    if (sort === 'access_asc') return String(a.accessLabel || '').localeCompare(String(b.accessLabel || '')) || nameA.localeCompare(nameB)
    if (sort === 'status_asc') return String(a.statusMode || '').localeCompare(String(b.statusMode || '')) || nameA.localeCompare(nameB)
    if (sort === 'plantel_asc') return String(a.planteles || '').localeCompare(String(b.planteles || '')) || nameA.localeCompare(nameB)
    return userLastLoginMs(b) - userLastLoginMs(a) || nameA.localeCompare(nameB)
  })
}

const buildExternalUsersFacets = (rows: any[]) => {
  const byPlantel = new Map<string, any>()
  const emptyPlantel = { plantel: '__sin_plantel__', label: 'Sin plantel', total: 0, control: 0, financial: 0, both: 0, superadmin: 0, blocked: 0, protected: 0 }
  const access = { control: 0, financial: 0, both: 0, superadmin: 0 }
  const status = { active: 0, blocked: 0, protected: 0 }
  const activity = { today: 0, week: 0, month: 0, older: 0, never: 0 }

  for (const user of rows) {
    const mode = externalUserAccessMode(user) as 'control' | 'financial' | 'both' | 'superadmin'
    access[mode]++
    status[userStatusMode(user) as 'active' | 'blocked' | 'protected']++
    activity[userActivityMode(user) as 'today' | 'week' | 'month' | 'older' | 'never']++

    const planteles = normalizedPlantelList(user.plantel)
    if (!planteles.length) {
      emptyPlantel.total++
      emptyPlantel[mode]++
      if (userIsBlocked(user)) emptyPlantel.blocked++
      if (userIsProtected(user)) emptyPlantel.protected++
    }
    for (const plantel of planteles) {
      const item = byPlantel.get(plantel) || { plantel, label: plantel, total: 0, control: 0, financial: 0, both: 0, superadmin: 0, blocked: 0, protected: 0 }
      item.total++
      item[mode]++
      if (userIsBlocked(user)) item.blocked++
      if (userIsProtected(user)) item.protected++
      byPlantel.set(plantel, item)
    }
  }

  const planteles = PLANTELES_LIST.map((plantel) => byPlantel.get(plantel) || { plantel, label: plantel, total: 0, control: 0, financial: 0, both: 0, superadmin: 0, blocked: 0, protected: 0 })
  if (emptyPlantel.total) planteles.push(emptyPlantel)

  return {
    total: rows.length,
    access,
    status,
    activity,
    byPlantel: planteles,
    alerts: {
      missingPlantel: emptyPlantel.total,
      blocked: status.blocked,
      protected: status.protected,
      noActivity: activity.never
    }
  }
}

export const queryExternalUsers = async (query: any = {}) => {
  const page = Math.max(1, Number(query.page || 1) || 1)
  const maxPageSize = query.bulk === true || query.bulk === '1' ? 5000 : 100
  const pageSize = Math.min(maxPageSize, Math.max(10, Number(query.pageSize || query.limit || 25) || 25))
  const search = normalizeText(query.search || query.q || '', 120)
  const allRows = (await listExternalUsers(search)).map(enrichAccessMetadata)
  const searchFacets = buildExternalUsersFacets(allRows)

  const filtered = allRows.filter((user) => {
    if (!userMatchesPlantel(user, query.plantel)) return false
    if (!userMatchesAccess(user, query.access)) return false
    if (!userMatchesStatus(user, query.status)) return false
    if (!userMatchesActivity(user, query.activity)) return false
    return true
  })

  const sorted = sortExternalUsers(filtered, query.sort)
  const start = (page - 1) * pageSize
  const rows = sorted.slice(start, start + pageSize)

  return {
    rows,
    total: filtered.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
    facets: buildExternalUsersFacets(filtered),
    globalFacets: searchFacets,
    filters: {
      search,
      plantel: normalizeText(query.plantel || 'all', 40),
      access: normalizeText(query.access || 'all', 40),
      status: normalizeText(query.status || 'all', 40),
      activity: normalizeText(query.activity || 'all', 40),
      sort: normalizeText(query.sort || 'last_login_desc', 60)
    }
  }
}

const workspaceDomainWhere = () => `LOWER(TRIM(COALESCE(${escapeIdentifier('email')}, ''))) LIKE ?`
const workspaceDomainParam = () => `%@${WORKSPACE_DOMAIN}`

const loadRawUsersByEmail = async (email: string, query: SqlExecutor = centralExecutor) => {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail || !isCasitaWorkspaceEmail(normalizedEmail)) return []

  const columns = await selectColumns()
  if (!columns.includes('email')) return []

  return await query<any[]>(`
    SELECT ${columns.map(escapeIdentifier).join(', ')}
    FROM ${escapeIdentifier(TABLE)}
    WHERE LOWER(TRIM(${escapeIdentifier('email')})) = ? AND ${workspaceDomainWhere()}
    ORDER BY ${escapeIdentifier('id')} ASC
  `, [normalizedEmail, workspaceDomainParam()])
}

const loadRawUserById = async (id: unknown, query: SqlExecutor = centralExecutor) => {
  const columns = await selectColumns()
  const rows = await query<any[]>(`
    SELECT ${columns.map(escapeIdentifier).join(', ')}
    FROM ${escapeIdentifier(TABLE)}
    WHERE ${escapeIdentifier('id')} = ? AND ${workspaceDomainWhere()}
    LIMIT 1
  `, [id, workspaceDomainParam()])
  return rows[0] || null
}

const consolidateExternalUserRows = async (email: string, rows: any[], query: SqlExecutor) => {
  const canonical = canonicalRawUserRow(rows)
  if (!canonical) return null
  const duplicateIds = rows
    .filter((row) => String(row.id) !== String(canonical.id))
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0)

  const canonicalUpdates: Record<string, any> = {}
  if (String(canonical.email || '') !== email) canonicalUpdates.email = email

  // A duplicate marked as blocked must never be discarded in a way that re-enables access.
  // Roles and plantels intentionally remain those of the oldest canonical row; they are not
  // merged because combining permissions from stale duplicates can grant unintended access.
  if (rows.some((row) => normalizeBlocked(row.ingresos_blocked)) && !normalizeBlocked(canonical.ingresos_blocked)) {
    canonicalUpdates.ingresos_blocked = 1
  }

  const updateEntries = Object.entries(canonicalUpdates)
  if (updateEntries.length) {
    await query(
      `UPDATE ${escapeIdentifier(TABLE)} SET ${updateEntries.map(([column]) => `${escapeIdentifier(column)} = ?`).join(', ')} WHERE ${escapeIdentifier('id')} = ? AND ${workspaceDomainWhere()}`,
      [...updateEntries.map(([, value]) => value), canonical.id, workspaceDomainParam()]
    )
    Object.assign(canonical, canonicalUpdates)
  }

  if (duplicateIds.length) {
    const placeholders = duplicateIds.map(() => '?').join(', ')
    await query(
      `DELETE FROM ${escapeIdentifier(TABLE)} WHERE ${escapeIdentifier('id')} IN (${placeholders}) AND ${workspaceDomainWhere()}`,
      [...duplicateIds, workspaceDomainParam()]
    )
  }

  return canonical
}

export const findExternalUserByEmail = async (email: string) => {
  const normalizedEmail = normalizeEmail(email)
  const rows = await loadRawUsersByEmail(normalizedEmail)
  if (rows.length <= 1) return mergeRowsForEmail(rows)

  return await withExternalUserEmailLocks([normalizedEmail], async (query) => {
    const lockedRows = await loadRawUsersByEmail(normalizedEmail, query)
    const canonical = await consolidateExternalUserRows(normalizedEmail, lockedRows, query)
    return canonical ? mergeRowsForEmail([canonical]) : null
  })
}

export const listExternalUsers = async (searchValue: unknown = '') => {
  const columns = await selectColumns()
  const search = normalizeText(searchValue, 120).toLowerCase()
  const orderParts = []
  if (columns.includes('last_login_at')) orderParts.push(`${escapeIdentifier('last_login_at')} IS NULL ASC`, `${escapeIdentifier('last_login_at')} DESC`)
  if (columns.includes('displayName')) orderParts.push(`${escapeIdentifier('displayName')} ASC`)
  orderParts.push(`${escapeIdentifier('id')} ASC`)

  // Resolve uniqueness before applying search. Filtering raw duplicate rows first could
  // expose a stale role or plantel from a non-canonical duplicate.
  const rows = await controlEscolarCentralQuery<any[]>(`
    SELECT ${columns.map(escapeIdentifier).join(', ')}
    FROM ${escapeIdentifier(TABLE)}
    WHERE ${workspaceDomainWhere()}
    ORDER BY ${orderParts.join(', ')}
  `, [workspaceDomainParam()])

  const byEmail = new Map<string, any[]>()
  for (const row of rows) {
    const email = normalizeEmail(row.email)
    if (!isCasitaWorkspaceEmail(email)) continue
    const bucket = byEmail.get(email) || []
    bucket.push(row)
    byEmail.set(email, bucket)
  }

  const users: any[] = []
  for (const [email, emailRows] of byEmail.entries()) {
    const user = emailRows.length === 1
      ? mergeRowsForEmail(emailRows)
      : await findExternalUserByEmail(email)
    if (user) users.push(user)
  }

  const filtered = search
    ? users.filter((user) => [
        user.displayName,
        user.username,
        user.email,
        user.plantel,
        user.campus,
        user.empresa,
        user.role
      ].some((value) => String(value || '').toLowerCase().includes(search)))
    : users

  return filtered
    .sort((a, b) => dateMs(b.last_login_at) - dateMs(a.last_login_at) || String(a.displayName || a.email).localeCompare(String(b.displayName || b.email)))
}

const buildUserWrite = async (body: ExternalUserInput, includePassword: boolean, current: any = null) => {
  const columns = await getExternalUsersColumns()
  const email = assertWorkspaceEmail(body.email)
  const hardCodedSuperAdmin = isHardCodedSuperAdminEmail(email)
  const plantel = hardCodedSuperAdmin
    ? ALL_PLANTELES_VALUE
    : plantelesValue(body.plantel ?? current?.plantel)
  const displayName = normalizeText(body.displayName || body.username || current?.displayName || current?.username || email || 'Usuario')
  const picture = body.picture || body.avatar || current?.picture || current?.avatar || buildWorkspacePhotoUrl(email, displayName)
  const values: Record<string, any> = {
    displayName,
    username: normalizeText(body.username || current?.username || email || displayName),
    email,
    plantel,
    role: resolveRoleForWrite(body, current?.role),
    avatar: picture,
    picture
  }

  if ('ingresosBlocked' in body || 'ingresos_blocked' in body) {
    const blocked = body.ingresosBlocked ?? body.ingresos_blocked
    assertNotProtectedBlock(email, blocked)
    values.ingresos_blocked = blockedValue(blocked)
  }

  if (hardCodedSuperAdmin) {
    values.role = 'superadmin'
    values.plantel = ALL_PLANTELES_VALUE
    values.ingresos_blocked = 0
  }

  if (includePassword && columns.has('password')) {
    values.password = body.password ? bcrypt.hashSync(String(body.password), 10) : ''
  }

  return Object.entries(values).filter(([column]) => columns.has(column))
}

const responseUserByEmail = async (email: unknown) => {
  const user = await findExternalUserByEmail(normalizeEmail(email))
  return user ? enrichAccessMetadata(user) : null
}

export const createExternalUser = async (body: ExternalUserInput) => {
  const email = assertWorkspaceEmail(body.email)

  return await withExternalUserEmailLocks([email], async (query) => {
    const existingRows = await loadRawUsersByEmail(email, query)
    if (existingRows.length) {
      await consolidateExternalUserRows(email, existingRows, query)
      throw createError({ statusCode: 409, message: 'Ya existe un usuario con este correo.' })
    }

    const entries = await buildUserWrite({ ...body, email }, true)
    if (!entries.some(([column]) => column === 'email')) {
      throw createError({ statusCode: 400, message: 'Correo requerido.' })
    }

    const columns = entries.map(([column]) => column)
    const values = entries.map(([, value]) => value)
    try {
      await query(
        `INSERT INTO ${escapeIdentifier(TABLE)} (${columns.map(escapeIdentifier).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        values
      )
    } catch (error: any) {
      if (Number(error?.errno) === 1062 || String(error?.code || '') === 'ER_DUP_ENTRY') {
        throw createError({ statusCode: 409, message: 'Ya existe un usuario con este correo.' })
      }
      throw error
    }

    const rows = await loadRawUsersByEmail(email, query)
    const user = mergeRowsForEmail(rows)
    const enriched = user ? enrichAccessMetadata(user) : null
    return { success: true, user: enriched, rows: enriched ? [enriched] : [] }
  })
}

export const updateExternalUser = async (id: unknown, body: ExternalUserInput) => {
  const initial = await loadRawUserById(id)
  if (!initial) {
    throw createError({ statusCode: 404, message: 'Usuario no encontrado.' })
  }

  const sourceEmail = assertWorkspaceEmail(initial.email)
  const targetEmail = assertWorkspaceEmail(body.email || initial.email)

  return await withExternalUserEmailLocks([sourceEmail, targetEmail], async (query) => {
    const sourceRows = await loadRawUsersByEmail(sourceEmail, query)
    const canonical = await consolidateExternalUserRows(sourceEmail, sourceRows, query)
    if (!canonical) {
      throw createError({ statusCode: 404, message: 'Usuario no encontrado.' })
    }

    if (targetEmail !== sourceEmail) {
      const targetRows = await loadRawUsersByEmail(targetEmail, query)
      if (targetRows.some((row) => String(row.id) !== String(canonical.id))) {
        throw createError({ statusCode: 409, message: 'Ya existe un usuario con este correo.' })
      }
    }

    const entries = (await buildUserWrite({ ...body, email: targetEmail }, Boolean(body.password && String(body.password).trim()), canonical))
      .filter(([column]) => column !== 'password' || Boolean(body.password && String(body.password).trim()))

    if (!entries.length) {
      throw createError({ statusCode: 400, message: 'No hay cambios para guardar.' })
    }

    await query(
      `UPDATE ${escapeIdentifier(TABLE)} SET ${entries.map(([column]) => `${escapeIdentifier(column)} = ?`).join(', ')} WHERE ${escapeIdentifier('id')} = ? AND ${workspaceDomainWhere()}`,
      [...entries.map(([, value]) => value), canonical.id, workspaceDomainParam()]
    )

    const rows = await loadRawUsersByEmail(targetEmail, query)
    const user = mergeRowsForEmail(rows)
    const enriched = user ? enrichAccessMetadata(user) : null
    return { success: true, user: enriched, rows: enriched ? [enriched] : [] }
  })
}

export const bulkUpdateExternalUsers = async (body: ExternalUserInput & {
  emails?: string[]
  ids?: Array<string | number>
  filterScope?: Record<string, any>
  addPlanteles?: string[] | string
  removePlanteles?: string[] | string
  replacePlanteles?: string[] | string
}) => {
  const columns = await getExternalUsersColumns()
  let emails = Array.from(new Set((body.emails || [])
    .map(normalizeEmail)
    .filter((email) => isCasitaWorkspaceEmail(email))))
  const ids = Array.from(new Set((body.ids || [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0)))

  if (body.filterScope && !emails.length && !ids.length) {
    const result = await queryExternalUsers({ ...body.filterScope, page: 1, pageSize: 5000, bulk: true })
    emails = Array.from(new Set((result.rows || [])
      .map((row: any) => normalizeEmail(row.email))
      .filter((email: string) => isCasitaWorkspaceEmail(email))))
  }

  if (!emails.length && !ids.length) {
    throw createError({ statusCode: 400, message: 'Seleccione usuarios.' })
  }

  const selectedRows: any[] = []
  for (const email of emails) {
    const user = await findExternalUserByEmail(email)
    if (!user?.id) continue
    const row = await loadRawUserById(user.id)
    if (row) selectedRows.push(row)
  }
  for (const id of ids) {
    const raw = await loadRawUserById(id)
    if (!raw?.email) continue
    const user = await findExternalUserByEmail(raw.email)
    if (!user?.id) continue
    const row = await loadRawUserById(user.id)
    if (row) selectedRows.push(row)
  }

  const uniqueRows = Array.from(new Map(selectedRows.map((row) => [normalizeEmail(row.email), row])).values())
  let updated = 0
  const skipped: Array<{ email: string; reason: string }> = []
  const failed: Array<{ email: string; reason: string }> = []
  const updatedEmails = new Set<string>()
  const shouldUpdateBlocked = columns.has('ingresos_blocked') && ('ingresosBlocked' in body || 'ingresos_blocked' in body)
  const shouldReplacePlanteles = 'replacePlanteles' in body
  const addPlanteles = normalizedPlantelList(body.addPlanteles)
  const removePlanteles = normalizedPlantelList(body.removePlanteles)
  const replacePlanteles = normalizedPlantelList(body.replacePlanteles)
  const shouldUpdatePlanteles = columns.has('plantel') && (shouldReplacePlanteles || addPlanteles.length || removePlanteles.length)
  const shouldUpdateRole = Boolean(body.accessMode || body.role)

  for (const row of uniqueRows) {
    const email = normalizeEmail(row.email)
    if (!isCasitaWorkspaceEmail(email)) {
      skipped.push({ email: email || String(row.id || ''), reason: 'Correo fuera del dominio institucional.' })
      continue
    }
    const protectedRoleOnlyChange = PROTECTED_EMAILS.has(email) && shouldUpdateRole && !shouldUpdateBlocked && !shouldUpdatePlanteles
    if (PROTECTED_EMAILS.has(email) && !protectedRoleOnlyChange && (shouldUpdateBlocked || shouldUpdateRole || shouldUpdatePlanteles)) {
      skipped.push({ email, reason: 'Usuario protegido.' })
      continue
    }

    const values: Record<string, any> = {}
    if (shouldUpdateBlocked) {
      const blocked = body.ingresosBlocked ?? body.ingresos_blocked
      assertNotProtectedBlock(email, blocked)
      values.ingresos_blocked = blockedValue(blocked)
    }

    const currentPlanteles = normalizedPlantelList(row.plantel)
    let nextPlanteles = shouldReplacePlanteles ? replacePlanteles : currentPlanteles
    if (addPlanteles.length) nextPlanteles = Array.from(new Set([...nextPlanteles, ...addPlanteles]))
    if (removePlanteles.length) nextPlanteles = nextPlanteles.filter((plantel) => !removePlanteles.includes(plantel))

    if (shouldUpdatePlanteles) {
      values.plantel = plantelesValue(nextPlanteles)
    }
    if (shouldUpdateRole && columns.has('role')) {
      values.role = resolveRoleForWrite({ ...body, email }, row.role)
    }

    if (isHardCodedSuperAdminEmail(email)) {
      if (columns.has('plantel')) values.plantel = ALL_PLANTELES_VALUE
      if (columns.has('role')) values.role = 'superadmin'
      if (columns.has('ingresos_blocked')) values.ingresos_blocked = 0
    }

    const entries = Object.entries(values).filter(([column]) => columns.has(column))
    if (!entries.length) {
      skipped.push({ email, reason: 'No hubo cambios aplicables.' })
      continue
    }

    try {
      await controlEscolarCentralQuery(
        `UPDATE ${escapeIdentifier(TABLE)} SET ${entries.map(([column]) => `${escapeIdentifier(column)} = ?`).join(', ')} WHERE ${escapeIdentifier('id')} = ? AND ${workspaceDomainWhere()}`,
        [...entries.map(([, value]) => value), row.id, workspaceDomainParam()]
      )
      updated++
      updatedEmails.add(email)
    } catch (error: any) {
      failed.push({ email, reason: error?.message || 'No se pudo actualizar.' })
    }
  }

  const rows = (await Promise.all(Array.from(updatedEmails).map(responseUserByEmail))).filter(Boolean)

  return {
    success: true,
    updated,
    requested: uniqueRows.length,
    skipped,
    failed,
    rows
  }
}


const noAdeudoControlPlantelesValue = (value: unknown) => plantelesValue(value)
const noAdeudoControlPlantelList = (value: unknown) => noAdeudoControlPlantelesValue(value)
  .split(',')
  .map(normalizePlantel)
  .filter(Boolean)

const serializeNoAdeudoControlPlanteles = (values: string[]) => Array.from(new Set(values.map(normalizePlantel).filter(Boolean))).join(',')

export const hasExternalControlRole = (value: unknown) => hasControlRoleValue(value)

const mapNoAdeudoControlUser = (user: any) => {
  if (!user) return null
  return {
    id: user.id,
    displayName: user.displayName || user.username || user.email || 'Control Escolar',
    username: user.username || user.displayName || user.email || 'Control Escolar',
    email: normalizeEmail(user.email),
    role: user.role || CONTROL_ESCOLAR_ROLE,
    avatar: user.avatar || user.picture || null,
    picture: user.picture || user.avatar || null,
    plantel: plantelesValue(user.plantel),
    planteles: plantelesValue(user.plantel),
    noAdeudoControlPlanteles: noAdeudoControlPlantelesValue(user.noAdeudoControlPlanteles || user.no_adeudo_control_planteles)
  }
}

export const noAdeudoControlUsersColumnExists = async () => {
  const columns = await getExternalUsersColumns()
  return columns.has(NO_ADEUDO_CONTROL_PLANTELES_COLUMN)
}

const assertNoAdeudoControlColumn = async () => {
  const columns = await getExternalUsersColumns()
  if (!columns.has(NO_ADEUDO_CONTROL_PLANTELES_COLUMN)) {
    throw createError({
      statusCode: 500,
      message: `Falta la columna users.${NO_ADEUDO_CONTROL_PLANTELES_COLUMN} en la base externa. Ejecuta el ALTER TABLE manual indicado para recordar el usuario de Control Escolar por plantel.`
    })
  }
  return columns
}

export const listExternalControlUsersForNoAdeudo = async (searchValue: unknown = '') => {
  const users = await listExternalUsers(searchValue)
  return users
    .filter((user: any) => hasControlRoleValue(user.role))
    .map(mapNoAdeudoControlUser)
    .filter(Boolean)
}

export const getNoAdeudoControlUserForPlantel = async (plantelValue: unknown) => {
  const plantel = normalizePlantel(plantelValue)
  if (!plantel) return null
  const hasColumn = await noAdeudoControlUsersColumnExists()
  if (!hasColumn) return null
  const users = await listExternalControlUsersForNoAdeudo('')
  return users.find((user: any) => noAdeudoControlPlantelList(user.noAdeudoControlPlanteles).includes(plantel)) || null
}

export const setNoAdeudoControlUserForPlantel = async (plantelValue: unknown, userIdValue: unknown) => {
  const plantel = normalizePlantel(plantelValue)
  if (!plantel || !PLANTELES_LIST.includes(plantel)) {
    throw createError({ statusCode: 400, message: 'Plantel inválido para asignar Control Escolar.' })
  }

  const columns = await assertNoAdeudoControlColumn()
  const select = [
    'id',
    'displayName',
    'username',
    'email',
    'plantel',
    'role',
    'picture',
    'avatar',
    NO_ADEUDO_CONTROL_PLANTELES_COLUMN
  ].filter((column) => columns.has(column))
  const rows = await controlEscolarCentralQuery<any[]>(`
    SELECT ${select.map(escapeIdentifier).join(', ')}
    FROM ${escapeIdentifier(TABLE)}
    WHERE ${workspaceDomainWhere()}
    ORDER BY ${escapeIdentifier('id')} ASC
  `, [workspaceDomainParam()])

  const userId = String(userIdValue || '').trim()
  const selectedRaw = userId ? rows.find((row) => String(row.id) === userId) : null
  if (userId && !selectedRaw) {
    throw createError({ statusCode: 404, message: 'Usuario de Control Escolar no encontrado.' })
  }
  if (selectedRaw && !hasControlRoleValue(selectedRaw.role)) {
    throw createError({ statusCode: 400, message: 'El usuario seleccionado no tiene rol ROLE_CTRL.' })
  }

  let updated = 0
  for (const row of rows) {
    const current = noAdeudoControlPlantelList(row[NO_ADEUDO_CONTROL_PLANTELES_COLUMN])
    let next = current.filter((item) => item !== plantel)
    if (selectedRaw && String(row.id) === String(selectedRaw.id)) next.push(plantel)
    const serialized = serializeNoAdeudoControlPlanteles(next)
    const currentSerialized = serializeNoAdeudoControlPlanteles(current)
    if (serialized === currentSerialized) continue
    await controlEscolarCentralQuery(
      `UPDATE ${escapeIdentifier(TABLE)} SET ${escapeIdentifier(NO_ADEUDO_CONTROL_PLANTELES_COLUMN)} = ? WHERE ${escapeIdentifier('id')} = ? AND ${workspaceDomainWhere()}`,
      [serialized || null, row.id, workspaceDomainParam()]
    )
    updated++
  }

  const selected = selectedRaw ? mapNoAdeudoControlUser({
    ...selectedRaw,
    [NO_ADEUDO_CONTROL_PLANTELES_COLUMN]: serializeNoAdeudoControlPlanteles([
      ...noAdeudoControlPlantelList(selectedRaw[NO_ADEUDO_CONTROL_PLANTELES_COLUMN]).filter((item) => item !== plantel),
      plantel
    ])
  }) : null

  return { success: true, plantel, selected, updated }
}

export const touchExternalUserLogin = async ({ email, name, picture, requestedPlantel }: ExternalLoginInput) => {
  const normalizedEmail = assertWorkspaceEmail(email)
  const columns = await getExternalUsersColumns()
  const hardCodedSuperAdmin = isHardCodedSuperAdminEmail(normalizedEmail)

  return await withExternalUserEmailLocks([normalizedEmail], async (query) => {
    let rawRows = await loadRawUsersByEmail(normalizedEmail, query)
    let canonical = await consolidateExternalUserRows(normalizedEmail, rawRows, query)

    if (!canonical) {
      const displayName = normalizeText(name || normalizedEmail)
      const entries = await buildUserWrite({
        email: normalizedEmail,
        username: normalizedEmail,
        displayName,
        picture: picture || buildWorkspacePhotoUrl(normalizedEmail, displayName),
        avatar: picture || buildWorkspacePhotoUrl(normalizedEmail, displayName),
        plantel: hardCodedSuperAdmin ? ALL_PLANTELES_VALUE : (normalizePlantel(requestedPlantel) || PLANTELES_LIST[0]),
        role: hardCodedSuperAdmin ? 'superadmin' : DEFAULT_EXTERNAL_ROLE,
        ingresosBlocked: false
      }, true)
      const insertColumns = entries.map(([column]) => column)
      const insertValues = entries.map(([, value]) => value)
      try {
        await query(
          `INSERT INTO ${escapeIdentifier(TABLE)} (${insertColumns.map(escapeIdentifier).join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`,
          insertValues
        )
      } catch (error: any) {
        if (Number(error?.errno) !== 1062 && String(error?.code || '') !== 'ER_DUP_ENTRY') throw error
      }
      rawRows = await loadRawUsersByEmail(normalizedEmail, query)
      canonical = await consolidateExternalUserRows(normalizedEmail, rawRows, query)
    }

    if (!canonical) return null
    const merged = mergeRowsForEmail([canonical])
    if (!merged) return null
    if (merged.ingresosBlocked && !hardCodedSuperAdmin) return merged

    const updates: Record<string, any> = {}
    if (columns.has('last_login_at')) updates.last_login_at = new Date()
    if (columns.has('displayName') && name) updates.displayName = normalizeText(name)
    if (columns.has('username')) updates.username = normalizedEmail
    if (picture) {
      if (columns.has('picture')) updates.picture = picture
      if (columns.has('avatar')) updates.avatar = picture
    }
    if (hardCodedSuperAdmin) {
      if (columns.has('role')) updates.role = 'superadmin'
      if (columns.has('plantel')) updates.plantel = ALL_PLANTELES_VALUE
      if (columns.has('ingresos_blocked')) updates.ingresos_blocked = 0
    }

    const entries = Object.entries(updates).filter(([column]) => columns.has(column))
    if (entries.length) {
      try {
        await query(
          `UPDATE ${escapeIdentifier(TABLE)} SET ${entries.map(([column]) => `${escapeIdentifier(column)} = ?`).join(', ')} WHERE ${escapeIdentifier('id')} = ? AND ${workspaceDomainWhere()}`,
          [...entries.map(([, value]) => value), canonical.id, workspaceDomainParam()]
        )
      } catch (error: any) {
        console.warn('[Auth Login] External users login touch skipped after role read', error?.message || error)
        return merged
      }
    }

    const refreshed = await loadRawUserById(canonical.id, query)
    return refreshed ? mergeRowsForEmail([refreshed]) : merged
  })
}

export const deleteExternalUser = async (id: unknown) => {
  await controlEscolarCentralQuery(
    `DELETE FROM ${escapeIdentifier(TABLE)} WHERE ${escapeIdentifier('id')} = ? AND ${workspaceDomainWhere()}`,
    [id, workspaceDomainParam()]
  )
  return { success: true }
}
