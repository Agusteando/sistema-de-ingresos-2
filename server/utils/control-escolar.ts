import { queryWithoutSchema, runWithBridgeAgentId, getDbTransport } from './db'
import { PLANTELES_LIST } from '../../utils/constants'
import { calculatePromotedGrado, displayGrado, normalizeGradoForPlantel, resolveNivelEscolar } from '../../shared/utils/grado'
import { normalizeCicloKey } from '../../shared/utils/ciclo'
import {
  isSuperAdminRole,
  isValidPlantelScope,
  normalizePlantel,
  parsePlanteles,
  resolveAuthHomePlantel
} from './auth-session'

type ControlEscolarUser = {
  email: string
  name: string
  role: string
  plantelesList: string[]
  isSuperAdmin: boolean
  authHomePlantel: string
}

type ColumnDef = {
  Field: string
  Type?: string
  Null?: string
  Key?: string
  Default?: unknown
  Extra?: string
}

type BaseColumnMap = Record<string, string>

type StudentFilters = {
  search?: string
  status?: string
  missing?: string
  program?: string
  nivel?: string
  grado?: string
  group?: string
  recentlyUpdated?: string
  ciclo?: string | number
}

const normalizeColumnKey = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '')

const q = (identifier: string) => `\`${String(identifier || '').replace(/`/g, '``')}\``

const isBlankSql = (column: string) => `(${q(column)} IS NULL OR TRIM(CAST(${q(column)} AS CHAR)) = '' OR LOWER(TRIM(CAST(${q(column)} AS CHAR))) IN ('null', 'undefined', 'sin dato'))`
const isPresentSql = (column: string) => `NOT ${isBlankSql(column)}`

const asText = (value: unknown) => String(value ?? '').trim()
const cleanText = (value: unknown, max = 255) => asText(value).slice(0, max)
const cleanOptional = (value: unknown, max = 255) => {
  const next = cleanText(value, max)
  return next || ''
}

const findColumn = (columns: ColumnDef[], candidates: string[]) => {
  const byKey = new Map(columns.map(column => [normalizeColumnKey(column.Field), column.Field]))
  return candidates.map(normalizeColumnKey).map(key => byKey.get(key)).find(Boolean) || ''
}

const getBaseColumns = async () => {
  const columns = await queryWithoutSchema<ColumnDef[]>(`SHOW COLUMNS FROM base`)
  const columnMap: BaseColumnMap = {
    id: findColumn(columns, ['id']),
    matricula: findColumn(columns, ['matricula', 'matrícula']),
    fullName: findColumn(columns, ['nombreCompleto', 'nombre completo']),
    apellidoPaterno: findColumn(columns, ['apellidoPaterno', 'apellido paterno', 'primer apellido']),
    apellidoMaterno: findColumn(columns, ['apellidoMaterno', 'apellido materno', 'segundo apellido']),
    nombres: findColumn(columns, ['nombres', 'nombre', 'name']),
    curp: findColumn(columns, ['curp']),
    phone: findColumn(columns, ['telefono', 'teléfono', 'phone', 'celular']),
    email: findColumn(columns, ['correo', 'email', 'correoElectronico', 'correo electronico']),
    status: findColumn(columns, ['estatus', 'status', 'estado']),
    plantel: findColumn(columns, ['plantel']),
    nivel: findColumn(columns, ['nivel', 'programa', 'program']),
    grado: findColumn(columns, ['grado']),
    group: findColumn(columns, ['grupo', 'group']),
    ciclo: findColumn(columns, ['ciclo', 'cicloIngreso', 'ciclo ingreso']),
    guardianName: findColumn(columns, ['Nombre del padre o tutor', 'padreTutor', 'padre tutor', 'tutor', 'responsable', 'guardianName']),
    guardianPhone: findColumn(columns, ['telefonoTutor', 'telefono tutor', 'tutorTelefono', 'tutor telefono', 'telefonoResponsable']),
    guardianEmail: findColumn(columns, ['correoTutor', 'correo tutor', 'emailTutor', 'email tutor', 'correoResponsable']),
    birthDate: findColumn(columns, ['Fecha de nacimiento', 'fechaNacimiento', 'fecha nacimiento', 'nacimiento']),
    gender: findColumn(columns, ['genero', 'género']),
    address: findColumn(columns, ['direccion', 'dirección', 'domicilio', 'address']),
    street: findColumn(columns, ['calle']),
    neighborhood: findColumn(columns, ['colonia']),
    city: findColumn(columns, ['municipio', 'ciudad']),
    state: findColumn(columns, ['estado']),
    postalCode: findColumn(columns, ['codigoPostal', 'codigo postal', 'cp']),
    updatedAt: findColumn(columns, ['updated_at', 'updatedAt', 'actualizado_en', 'fechaActualizacion', 'fecha_actualizacion', 'modificado_en', 'modified_at']),
    user: findColumn(columns, ['usuario'])
  }

  if (!columnMap.matricula || !columnMap.plantel) {
    throw createError({ statusCode: 500, message: 'La tabla base no contiene las columnas mínimas requeridas para Control Escolar.' })
  }

  return { columns, columnMap }
}

const configuredBridgeAgentId = () => String((useRuntimeConfig() as any).dbBridgeAgentId || '').trim().toUpperCase()

export const getControlEscolarAuthUser = async (event: any): Promise<ControlEscolarUser> => {
  const email = String(getCookie(event, 'auth_email') || '').trim()
  if (!email) throw createError({ statusCode: 401, message: 'Acceso no autorizado.' })

  const homePlantel = resolveAuthHomePlantel(event)
  if (!homePlantel) throw createError({ statusCode: 401, message: 'Sesión sin plantel de autenticación.' })

  const [dbUser] = await runWithBridgeAgentId(homePlantel, async () => queryWithoutSchema<any[]>(
    'SELECT username, email, role, planteles, plantel FROM users WHERE email = ? LIMIT 1',
    [email]
  ))

  if (!dbUser) throw createError({ statusCode: 401, message: 'Sesión no válida para Control Escolar.' })

  const role = String(dbUser.role || 'plantel')
  const isSuperAdmin = isSuperAdminRole(role)
  const legacyPlantel = normalizePlantel(dbUser.plantel)
  const explicitPlanteles = parsePlanteles(dbUser.planteles)
  const plantelesList = isSuperAdmin
    ? [...PLANTELES_LIST]
    : (explicitPlanteles.length ? explicitPlanteles : (legacyPlantel ? [legacyPlantel] : []))

  return {
    email,
    name: String(dbUser.username || getCookie(event, 'auth_name') || email),
    role,
    plantelesList,
    isSuperAdmin,
    authHomePlantel: homePlantel
  }
}

export const getControlEscolarOptions = async (event: any) => {
  const user = await getControlEscolarAuthUser(event)
  const fixedAgentId = configuredBridgeAgentId()
  const planteles = user.plantelesList
    .filter(plantel => plantel && plantel !== 'GLOBAL' && isValidPlantelScope(plantel))
    .map(plantel => ({ agentId: plantel, plantel, label: `Plantel ${plantel}` }))

  return {
    user: {
      name: user.name,
      email: user.email,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin
    },
    planteles,
    defaultAgentId: planteles[0]?.agentId || '',
    bridge: {
      transport: getDbTransport(),
      fixedAgentId: fixedAgentId || null,
      dynamicSelectionAvailable: !(getDbTransport() === 'bridge' && fixedAgentId)
    }
  }
}

export const validateControlEscolarAgent = async (event: any, requestedAgentId: unknown) => {
  const user = await getControlEscolarAuthUser(event)
  const agentId = normalizePlantel(requestedAgentId)

  if (!agentId) throw createError({ statusCode: 400, message: 'Selecciona un plantel para Control Escolar.' })
  if (agentId === 'GLOBAL') throw createError({ statusCode: 400, message: 'Control Escolar trabaja un plantel a la vez.' })
  if (!isValidPlantelScope(agentId)) throw createError({ statusCode: 400, message: 'Plantel inválido para Control Escolar.' })
  if (!user.isSuperAdmin && !user.plantelesList.includes(agentId)) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para consultar este plantel en Control Escolar.' })
  }

  const fixedAgentId = configuredBridgeAgentId()
  if (getDbTransport() === 'bridge' && fixedAgentId && fixedAgentId !== agentId) {
    throw createError({
      statusCode: 409,
      message: `Control Escolar requiere selección dinámica de agente. DB_BRIDGE_AGENT_ID está fijo en ${fixedAgentId}, por lo que no puede consultar ${agentId} sin cambiar la configuración del servidor.`
    })
  }

  return { user, agentId }
}

export const runControlEscolarQuery = async <T>(event: any, agentId: unknown, callback: (ctx: { user: ControlEscolarUser, agentId: string }) => Promise<T>) => {
  const ctx = await validateControlEscolarAgent(event, agentId)

  try {
    return await runWithBridgeAgentId(ctx.agentId, () => callback(ctx))
  } catch (error: any) {
    if (error?.statusCode) throw error
    const message = String(error?.message || '')
    const isBridgeAvailabilityIssue = /bridge|abort|timeout|fetch|ECONN|ETIMEDOUT|no esta configurado|respondio/i.test(message)
    throw createError({
      statusCode: isBridgeAvailabilityIssue ? 503 : 500,
      message: isBridgeAvailabilityIssue
        ? `El plantel ${ctx.agentId} no está disponible en este momento. Intenta refrescar o selecciona otro plantel.`
        : 'No se pudo completar la consulta de Control Escolar.',
      data: process.env.NODE_ENV === 'production' ? undefined : { cause: message }
    })
  }
}

const selectExpr = (columnMap: BaseColumnMap, key: string, alias: string) => {
  const column = columnMap[key]
  return column ? `${q(column)} AS ${q(alias)}` : `NULL AS ${q(alias)}`
}

const studentSelectFields = (columnMap: BaseColumnMap) => [
  selectExpr(columnMap, 'id', 'id'),
  selectExpr(columnMap, 'matricula', 'matricula'),
  selectExpr(columnMap, 'fullName', 'fullName'),
  selectExpr(columnMap, 'apellidoPaterno', 'apellidoPaterno'),
  selectExpr(columnMap, 'apellidoMaterno', 'apellidoMaterno'),
  selectExpr(columnMap, 'nombres', 'nombres'),
  selectExpr(columnMap, 'curp', 'curp'),
  selectExpr(columnMap, 'phone', 'phone'),
  selectExpr(columnMap, 'email', 'email'),
  selectExpr(columnMap, 'status', 'status'),
  selectExpr(columnMap, 'plantel', 'plantel'),
  selectExpr(columnMap, 'nivel', 'nivelBase'),
  selectExpr(columnMap, 'grado', 'gradoBase'),
  selectExpr(columnMap, 'group', 'group'),
  selectExpr(columnMap, 'ciclo', 'cicloBase'),
  selectExpr(columnMap, 'guardianName', 'guardianName'),
  selectExpr(columnMap, 'guardianPhone', 'guardianPhone'),
  selectExpr(columnMap, 'guardianEmail', 'guardianEmail'),
  selectExpr(columnMap, 'birthDate', 'birthDate'),
  selectExpr(columnMap, 'gender', 'gender'),
  selectExpr(columnMap, 'address', 'address'),
  selectExpr(columnMap, 'street', 'street'),
  selectExpr(columnMap, 'neighborhood', 'neighborhood'),
  selectExpr(columnMap, 'city', 'city'),
  selectExpr(columnMap, 'state', 'state'),
  selectExpr(columnMap, 'postalCode', 'postalCode'),
  selectExpr(columnMap, 'updatedAt', 'updatedAt')
]

const buildMissingSql = (columnMap: BaseColumnMap, field: string) => {
  const map: Record<string, string[]> = {
    curp: ['curp'],
    phone: ['phone'],
    email: ['email'],
    guardian: ['guardianName'],
    tutor: ['guardianName'],
    address: ['address', 'street']
  }
  const keys = map[field] || [field]
  const expressions = keys.map(key => columnMap[key]).filter(Boolean).map(isBlankSql)
  return expressions.length ? `(${expressions.join(' AND ')})` : ''
}

const buildStudentWhere = (agentId: string, columnMap: BaseColumnMap, filters: StudentFilters) => {
  const where: string[] = [`${q(columnMap.plantel)} = ?`]
  const params: any[] = [agentId]
  const search = cleanText(filters.search, 120)
  const status = cleanText(filters.status, 80)
  const missing = cleanText(filters.missing, 80)
  const program = cleanText(filters.program, 120)
  const nivel = cleanText(filters.nivel, 120)
  const grado = cleanText(filters.grado, 120)
  const group = cleanText(filters.group, 120)
  const cicloKey = normalizeCicloKey(filters.ciclo || '')

  if (search) {
    const searchColumns = ['fullName', 'matricula', 'curp', 'phone', 'email', 'guardianName']
      .map(key => columnMap[key])
      .filter(Boolean)
    if (searchColumns.length) {
      where.push(`(${searchColumns.map(column => `${q(column)} LIKE ?`).join(' OR ')})`)
      searchColumns.forEach(() => params.push(`%${search}%`))
    }
  } else if (columnMap.status && columnMap.ciclo && cicloKey) {
    where.push(`(${q(columnMap.status)} = 'Activo' OR ${q(columnMap.ciclo)} = ?)`)
    params.push(cicloKey)
  }

  if (status && status !== 'all') {
    if (columnMap.status) {
      if (status === 'active' || status === 'activo') {
        where.push(`${q(columnMap.status)} = 'Activo'`)
      } else if (status === 'inactive' || status === 'bajas' || status === 'baja') {
        where.push(`(${q(columnMap.status)} IS NULL OR ${q(columnMap.status)} <> 'Activo')`)
      } else {
        where.push(`${q(columnMap.status)} = ?`)
        params.push(status)
      }
    }
  }

  if (missing && missing !== 'all') {
    if (missing === 'any') {
      const checks = ['curp', 'phone', 'email', 'guardianName'].map(key => columnMap[key]).filter(Boolean).map(isBlankSql)
      if (checks.length) where.push(`(${checks.join(' OR ')})`)
    } else {
      const missingSql = buildMissingSql(columnMap, missing)
      if (missingSql) where.push(missingSql)
    }
  }

  if (program && columnMap.nivel) {
    where.push(`${q(columnMap.nivel)} = ?`)
    params.push(program)
  }

  if (nivel && columnMap.nivel) {
    where.push(`${q(columnMap.nivel)} = ?`)
    params.push(nivel)
  }

  if (grado && columnMap.grado) {
    where.push(`${q(columnMap.grado)} = ?`)
    params.push(grado)
  }

  if (group && columnMap.group) {
    where.push(`${q(columnMap.group)} = ?`)
    params.push(group)
  }

  if (filters.recentlyUpdated && filters.recentlyUpdated !== 'all' && columnMap.updatedAt) {
    const days = Number(filters.recentlyUpdated)
    if (Number.isFinite(days) && days > 0) where.push(`${q(columnMap.updatedAt)} >= DATE_SUB(NOW(), INTERVAL ${Math.min(Math.max(Math.floor(days), 1), 365)} DAY)`)
  }

  return { where: where.join(' AND '), params }
}

const normalizeMissingFields = (row: any) => {
  const checks = [
    ['curp', row.curp],
    ['phone', row.phone],
    ['email', row.email],
    ['guardian', row.guardianName]
  ]
  return checks.filter(([, value]) => !asText(value)).map(([key]) => key)
}

const combineAddress = (row: any) => {
  if (asText(row.address)) return asText(row.address)
  return [row.street, row.neighborhood, row.city, row.state, row.postalCode]
    .map(asText)
    .filter(Boolean)
    .join(', ')
}

export const normalizeControlEscolarStudent = (row: any, agentId: string, ciclo: unknown) => {
  const promoted = calculatePromotedGrado(row.gradoBase, row.plantel || agentId, row.cicloBase, ciclo, row.nivelBase)
  const grado = row.gradoBase ? displayGrado(promoted.grado) : ''
  const nivel = row.nivelBase ? promoted.nivel : resolveNivelEscolar({ plantel: row.plantel || agentId, nivel: row.nivelBase })
  const fullName = asText(row.fullName) || [row.apellidoPaterno, row.apellidoMaterno, row.nombres].map(asText).filter(Boolean).join(' ')
  const matricula = asText(row.matricula)

  return {
    agentId,
    plantel: asText(row.plantel) || agentId,
    studentId: matricula || asText(row.id),
    matricula,
    fullName,
    apellidoPaterno: asText(row.apellidoPaterno),
    apellidoMaterno: asText(row.apellidoMaterno),
    nombres: asText(row.nombres),
    curp: asText(row.curp),
    phone: asText(row.phone),
    email: asText(row.email),
    status: asText(row.status) || 'Sin estado',
    program: asText(row.nivelBase),
    nivel,
    grado,
    group: asText(row.group),
    guardianName: asText(row.guardianName),
    guardianPhone: asText(row.guardianPhone),
    guardianEmail: asText(row.guardianEmail),
    birthDate: asText(row.birthDate),
    gender: asText(row.gender),
    address: combineAddress(row),
    addressParts: {
      street: asText(row.street),
      neighborhood: asText(row.neighborhood),
      city: asText(row.city),
      state: asText(row.state),
      postalCode: asText(row.postalCode)
    },
    ciclo: asText(row.cicloBase),
    missingFields: normalizeMissingFields(row),
    updatedAt: row.updatedAt ? String(row.updatedAt) : ''
  }
}

const supportedEditableFields = (columnMap: BaseColumnMap) => ({
  apellidoPaterno: Boolean(columnMap.apellidoPaterno),
  apellidoMaterno: Boolean(columnMap.apellidoMaterno),
  nombres: Boolean(columnMap.nombres),
  fullName: Boolean(columnMap.fullName),
  curp: Boolean(columnMap.curp),
  phone: Boolean(columnMap.phone),
  email: Boolean(columnMap.email),
  guardianName: Boolean(columnMap.guardianName),
  guardianPhone: Boolean(columnMap.guardianPhone),
  guardianEmail: Boolean(columnMap.guardianEmail),
  address: Boolean(columnMap.address),
  street: Boolean(columnMap.street),
  neighborhood: Boolean(columnMap.neighborhood),
  city: Boolean(columnMap.city),
  state: Boolean(columnMap.state),
  postalCode: Boolean(columnMap.postalCode),
  status: Boolean(columnMap.status),
  nivel: Boolean(columnMap.nivel),
  grado: Boolean(columnMap.grado),
  group: Boolean(columnMap.group),
  ciclo: Boolean(columnMap.ciclo)
})

export const getControlEscolarStudents = async (agentId: string, filters: StudentFilters, page: number, limit: number) => {
  const { columnMap } = await getBaseColumns()
  const { where, params } = buildStudentWhere(agentId, columnMap, filters)
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const safeLimit = Math.min(Math.max(Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 30, 10), 200)
  const offset = (safePage - 1) * safeLimit
  const orderParts = [
    columnMap.status ? `${q(columnMap.status)} = 'Activo' DESC` : '',
    columnMap.updatedAt ? `${q(columnMap.updatedAt)} DESC` : '',
    columnMap.fullName ? `${q(columnMap.fullName)} ASC` : q(columnMap.matricula)
  ].filter(Boolean)

  const [countRow] = await queryWithoutSchema<any[]>(`SELECT COUNT(*) AS total FROM base WHERE ${where}`, params)
  const rows = await queryWithoutSchema<any[]>(`
    SELECT ${studentSelectFields(columnMap).join(',\n      ')}
    FROM base
    WHERE ${where}
    ORDER BY ${orderParts.join(', ')}
    LIMIT ? OFFSET ?
  `, [...params, safeLimit, offset])

  return {
    agentId,
    plantel: agentId,
    page: safePage,
    limit: safeLimit,
    total: Number(countRow?.total || 0),
    totalPages: Math.max(1, Math.ceil(Number(countRow?.total || 0) / safeLimit)),
    rows: rows.map(row => normalizeControlEscolarStudent(row, agentId, filters.ciclo || '')),
    schema: {
      editableFields: supportedEditableFields(columnMap),
      hasUpdatedAt: Boolean(columnMap.updatedAt),
      hasProgram: Boolean(columnMap.nivel),
      hasGroup: Boolean(columnMap.group)
    }
  }
}

export const getControlEscolarKpis = async (agentId: string, ciclo: unknown) => {
  const { columnMap } = await getBaseColumns()
  const cicloKey = normalizeCicloKey(ciclo || '')
  const plantelCondition = `${q(columnMap.plantel)} = ?`
  const params: any[] = [agentId]
  const activeExpr = columnMap.status ? `${q(columnMap.status)} = 'Activo'` : '1=1'
  const inactiveExpr = columnMap.status ? `(${q(columnMap.status)} IS NULL OR ${q(columnMap.status)} <> 'Activo')` : '0=1'
  const cycleExpr = columnMap.ciclo && cicloKey ? `${q(columnMap.ciclo)} = ?` : '0=1'
  if (columnMap.ciclo && cicloKey) params.push(cicloKey)
  const missingCore = ['curp', 'phone', 'guardianName'].map(key => columnMap[key]).filter(Boolean).map(isBlankSql)
  const missingCurp = columnMap.curp ? isBlankSql(columnMap.curp) : '0=1'
  const missingPhone = columnMap.phone ? isBlankSql(columnMap.phone) : '0=1'
  const missingGuardian = columnMap.guardianName ? isBlankSql(columnMap.guardianName) : '0=1'

  const [summary] = await queryWithoutSchema<any[]>(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN ${activeExpr} THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN ${inactiveExpr} THEN 1 ELSE 0 END) AS inactive,
      SUM(CASE WHEN ${activeExpr} AND ${cycleExpr} THEN 1 ELSE 0 END) AS newInscritos,
      SUM(CASE WHEN ${missingCore.length ? `(${missingCore.join(' OR ')})` : '0=1'} THEN 1 ELSE 0 END) AS incompleteFiles,
      SUM(CASE WHEN ${missingCurp} THEN 1 ELSE 0 END) AS withoutCurp,
      SUM(CASE WHEN ${missingPhone} THEN 1 ELSE 0 END) AS withoutPhone,
      SUM(CASE WHEN ${missingGuardian} THEN 1 ELSE 0 END) AS withoutGuardian
    FROM base
    WHERE ${plantelCondition}
  `, params)

  const distributionRows = columnMap.nivel
    ? await queryWithoutSchema<any[]>(`
      SELECT ${q(columnMap.nivel)} AS label, COUNT(*) AS total
      FROM base
      WHERE ${plantelCondition} AND ${isPresentSql(columnMap.nivel)}
      GROUP BY ${q(columnMap.nivel)}
      ORDER BY total DESC, label ASC
      LIMIT 8
    `, [agentId])
    : []

  const groupRows = columnMap.group
    ? await queryWithoutSchema<any[]>(`
      SELECT ${q(columnMap.group)} AS label, COUNT(*) AS total
      FROM base
      WHERE ${plantelCondition} AND ${isPresentSql(columnMap.group)}
      GROUP BY ${q(columnMap.group)}
      ORDER BY total DESC, label ASC
      LIMIT 10
    `, [agentId])
    : []

  return {
    agentId,
    plantel: agentId,
    totalInscritos: Number(summary?.total || 0),
    active: Number(summary?.active || 0),
    inactive: Number(summary?.inactive || 0),
    newInscritos: Number(summary?.newInscritos || 0),
    incompleteFiles: Number(summary?.incompleteFiles || 0),
    withoutCurp: Number(summary?.withoutCurp || 0),
    withoutPhone: Number(summary?.withoutPhone || 0),
    withoutGuardian: Number(summary?.withoutGuardian || 0),
    byProgram: distributionRows.map(row => ({ label: asText(row.label) || 'Sin programa', total: Number(row.total || 0) })),
    byGroup: groupRows.map(row => ({ label: asText(row.label) || 'Sin grupo', total: Number(row.total || 0) })),
    schema: {
      hasProgram: Boolean(columnMap.nivel),
      hasGroup: Boolean(columnMap.group),
      hasUpdatedAt: Boolean(columnMap.updatedAt)
    }
  }
}

const normalizePatchBody = (body: any, columnMap: BaseColumnMap, current: any) => {
  const setClauses: string[] = []
  const params: any[] = []
  const push = (field: string, value: unknown, max = 255) => {
    const column = columnMap[field]
    if (!column) return
    setClauses.push(`${q(column)} = ?`)
    params.push(cleanOptional(value, max))
  }

  const apellidoPaterno = Object.prototype.hasOwnProperty.call(body, 'apellidoPaterno') ? cleanOptional(body.apellidoPaterno) : current.apellidoPaterno
  const apellidoMaterno = Object.prototype.hasOwnProperty.call(body, 'apellidoMaterno') ? cleanOptional(body.apellidoMaterno) : current.apellidoMaterno
  const nombres = Object.prototype.hasOwnProperty.call(body, 'nombres') ? cleanOptional(body.nombres) : current.nombres

  if (Object.prototype.hasOwnProperty.call(body, 'apellidoPaterno')) push('apellidoPaterno', apellidoPaterno)
  if (Object.prototype.hasOwnProperty.call(body, 'apellidoMaterno')) push('apellidoMaterno', apellidoMaterno)
  if (Object.prototype.hasOwnProperty.call(body, 'nombres')) push('nombres', nombres)
  if (columnMap.fullName && (Object.prototype.hasOwnProperty.call(body, 'apellidoPaterno') || Object.prototype.hasOwnProperty.call(body, 'apellidoMaterno') || Object.prototype.hasOwnProperty.call(body, 'nombres') || Object.prototype.hasOwnProperty.call(body, 'fullName'))) {
    const fullName = cleanOptional(body.fullName) || [apellidoPaterno, apellidoMaterno, nombres].map(asText).filter(Boolean).join(' ')
    push('fullName', fullName)
  }

  if (Object.prototype.hasOwnProperty.call(body, 'curp')) push('curp', String(body.curp || '').trim().toUpperCase(), 18)
  if (Object.prototype.hasOwnProperty.call(body, 'phone')) push('phone', body.phone, 80)
  if (Object.prototype.hasOwnProperty.call(body, 'email')) push('email', String(body.email || '').trim().toLowerCase(), 160)
  if (Object.prototype.hasOwnProperty.call(body, 'guardianName')) push('guardianName', body.guardianName)
  if (Object.prototype.hasOwnProperty.call(body, 'guardianPhone')) push('guardianPhone', body.guardianPhone, 80)
  if (Object.prototype.hasOwnProperty.call(body, 'guardianEmail')) push('guardianEmail', String(body.guardianEmail || '').trim().toLowerCase(), 160)
  if (Object.prototype.hasOwnProperty.call(body, 'address')) push('address', body.address, 500)
  if (Object.prototype.hasOwnProperty.call(body, 'street')) push('street', body.street)
  if (Object.prototype.hasOwnProperty.call(body, 'neighborhood')) push('neighborhood', body.neighborhood)
  if (Object.prototype.hasOwnProperty.call(body, 'city')) push('city', body.city)
  if (Object.prototype.hasOwnProperty.call(body, 'state')) push('state', body.state)
  if (Object.prototype.hasOwnProperty.call(body, 'postalCode')) push('postalCode', body.postalCode, 20)
  if (Object.prototype.hasOwnProperty.call(body, 'status')) push('status', body.status, 80)
  if (Object.prototype.hasOwnProperty.call(body, 'nivel')) push('nivel', body.nivel, 80)
  if (Object.prototype.hasOwnProperty.call(body, 'grado')) {
    const plantel = String(current.plantel || '').trim()
    const nivel = body.nivel ?? current.nivelBase
    push('grado', plantel ? normalizeGradoForPlantel(body.grado, plantel, nivel) : body.grado, 80)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'group')) push('group', body.group, 80)
  if (Object.prototype.hasOwnProperty.call(body, 'ciclo')) push('ciclo', normalizeCicloKey(body.ciclo), 20)

  if (columnMap.updatedAt) {
    setClauses.push(`${q(columnMap.updatedAt)} = NOW()`)
  }

  return { setClauses, params }
}

export const patchControlEscolarStudent = async (agentId: string, studentId: string, body: any, auditUser: ControlEscolarUser) => {
  const { columnMap } = await getBaseColumns()
  const cleanId = cleanText(studentId, 255)
  if (!cleanId) throw createError({ statusCode: 400, message: 'Alumno requerido.' })

  const [current] = await queryWithoutSchema<any[]>(`
    SELECT ${studentSelectFields(columnMap).join(',\n      ')}
    FROM base
    WHERE ${q(columnMap.plantel)} = ? AND ${q(columnMap.matricula)} = ?
    LIMIT 1
  `, [agentId, cleanId])

  if (!current) throw createError({ statusCode: 404, message: 'Alumno no encontrado en el plantel seleccionado.' })

  const allowedKeys = new Set([
    'apellidoPaterno', 'apellidoMaterno', 'nombres', 'fullName', 'curp', 'phone', 'email',
    'guardianName', 'guardianPhone', 'guardianEmail', 'address', 'street', 'neighborhood', 'city', 'state', 'postalCode',
    'status', 'nivel', 'grado', 'group', 'ciclo'
  ])

  const invalidKeys = Object.keys(body || {}).filter(key => !allowedKeys.has(key))
  if (invalidKeys.length) throw createError({ statusCode: 400, message: `Campos no permitidos: ${invalidKeys.join(', ')}` })

  if (Object.prototype.hasOwnProperty.call(body, 'email') && body.email && !/^\S+@\S+\.\S+$/.test(String(body.email))) {
    throw createError({ statusCode: 400, message: 'Correo inválido.' })
  }

  if (Object.prototype.hasOwnProperty.call(body, 'guardianEmail') && body.guardianEmail && !/^\S+@\S+\.\S+$/.test(String(body.guardianEmail))) {
    throw createError({ statusCode: 400, message: 'Correo del tutor inválido.' })
  }

  if (Object.prototype.hasOwnProperty.call(body, 'curp') && body.curp && !/^[A-Z0-9]{18}$/.test(String(body.curp).trim().toUpperCase())) {
    throw createError({ statusCode: 400, message: 'CURP inválida. Debe contener 18 caracteres alfanuméricos.' })
  }

  const { setClauses, params } = normalizePatchBody(body || {}, columnMap, current)
  if (!setClauses.length) return normalizeControlEscolarStudent(current, agentId, body?.ciclo || current.cicloBase)

  await queryWithoutSchema(`
    UPDATE base
    SET ${setClauses.join(', ')}
    WHERE ${q(columnMap.plantel)} = ? AND ${q(columnMap.matricula)} = ?
    LIMIT 1
  `, [...params, agentId, cleanId])

  // TODO: Integrar con el patrón de auditoría del proyecto si se centraliza un logger para cambios administrativos.
  console.info('[Control Escolar] student update', {
    agentId,
    studentId: cleanId,
    updatedBy: auditUser.email,
    fields: Object.keys(body || {}).filter(key => allowedKeys.has(key))
  })

  const [updated] = await queryWithoutSchema<any[]>(`
    SELECT ${studentSelectFields(columnMap).join(',\n      ')}
    FROM base
    WHERE ${q(columnMap.plantel)} = ? AND ${q(columnMap.matricula)} = ?
    LIMIT 1
  `, [agentId, cleanId])

  return normalizeControlEscolarStudent(updated || current, agentId, body?.ciclo || current.cicloBase)
}
