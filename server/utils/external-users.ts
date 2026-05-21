import bcrypt from 'bcryptjs'
import { PLANTELES_LIST } from '../../utils/constants'
import { controlEscolarCentralQuery } from './control-escolar-central'
import { normalizePlantel, parsePlanteles } from './auth-session'

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
const escapeIdentifier = (value: string) => `\`${String(value).replace(/`/g, '``')}\``
const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()
const normalizeText = (value: unknown, max = 255) => String(value || '').trim().slice(0, max)
const roleValue = (value: unknown) => normalizeText(value || 'plantel', 80) || 'plantel'
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
      role VARCHAR(80) NOT NULL DEFAULT 'plantel',
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

const normalizeUserRow = (row: any) => {
  const planteles = plantelesValue(row.planteles || row.plantel)
  return {
    id: row.id,
    username: row.username || row.displayName || row.email || 'Usuario',
    displayName: row.displayName || row.username || row.email || 'Usuario',
    email: row.email || '',
    planteles,
    role: row.role || 'plantel',
    created_at: row.created_at || null,
    avatar: row.avatar || null,
    plantel: normalizePlantel(row.plantel) || (planteles ? planteles.split(',')[0] : ''),
    source: 'external'
  }
}

export const listExternalUsers = async () => {
  const columns = await selectColumns()
  const rows = await controlEscolarCentralQuery<any[]>(`
    SELECT ${columns.map(escapeIdentifier).join(', ')}
    FROM ${escapeIdentifier(TABLE)}
    ORDER BY ${columns.includes('username') ? '`username`' : '`email`'} ASC
  `)
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
    WHERE ${escapeIdentifier('email')} = ?
    LIMIT 1
  `, [normalizedEmail])

  return rows[0] ? normalizeUserRow(rows[0]) : null
}

const buildUserWrite = async (body: ExternalUserInput, includePassword: boolean) => {
  const columns = await getExternalUsersColumns()
  const planteles = plantelesValue(body.planteles)
  const firstPlantel = planteles ? planteles.split(',')[0] : ''
  const values: Record<string, any> = {
    username: normalizeText(body.username || body.email || 'Usuario'),
    email: normalizeEmail(body.email),
    planteles,
    role: roleValue(body.role),
    plantel: firstPlantel,
    avatar: body.avatar || null
  }

  if (includePassword && columns.has('password')) {
    values.password = body.password ? bcrypt.hashSync(String(body.password), 10) : ''
  }

  return Object.entries(values).filter(([column]) => columns.has(column))
}

export const createExternalUser = async (body: ExternalUserInput) => {
  const entries = await buildUserWrite(body, true)
  if (!entries.some(([column]) => column === 'email')) {
    throw createError({ statusCode: 400, message: 'Correo requerido para usuario externo.' })
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
  const entries = (await buildUserWrite(body, Boolean(body.password && String(body.password).trim())))
    .filter(([column]) => column !== 'password' || Boolean(body.password && String(body.password).trim()))

  if (!entries.length) {
    throw createError({ statusCode: 400, message: 'No hay campos para actualizar.' })
  }

  const assignments = entries.map(([column]) => `${escapeIdentifier(column)} = ?`)
  const values = entries.map(([, value]) => value)
  values.push(id)

  await controlEscolarCentralQuery(
    `UPDATE ${escapeIdentifier(TABLE)} SET ${assignments.join(', ')} WHERE ${escapeIdentifier('id')} = ?`,
    values
  )
  return { success: true }
}

export const deleteExternalUser = async (id: unknown) => {
  await controlEscolarCentralQuery(`DELETE FROM ${escapeIdentifier(TABLE)} WHERE ${escapeIdentifier('id')} = ?`, [id])
  return { success: true }
}
