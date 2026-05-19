import { normalizeCicloKey } from '../../shared/utils/ciclo'
import { normalizeGradoForPlantel, resolveNivelEscolar } from '../../shared/utils/grado'
import { normalizeCurp, parseCurp } from '../../shared/utils/curp'
import { getDbTransport, query, runWithBridgeAgentId } from './db'

const CONTROL_ESCOLAR_PLANTELES = ['PREEM', 'PREET', 'CT', 'CM', 'DM', 'CO', 'DC', 'PM', 'PT', 'SM', 'ST', 'IS', 'ISM']
const CONTROL_ESCOLAR_PLANTEL_SET = new Set(CONTROL_ESCOLAR_PLANTELES)

const CONTROL_ESCOLAR_BRIDGE_FIXED_MESSAGE = 'Control Escolar requiere selección dinámica de agentId. DB_BRIDGE_AGENT_ID está fijo en el entorno; retire esa variable o use una configuración que permita runWithBridgeAgentId para este módulo.'

type QueryInput = string | number | boolean | null | undefined | string[]

type ColumnMap = {
  columns: Set<string>
  plantel: string | null
  matricula: string
  apellidoPaterno: string | null
  apellidoMaterno: string | null
  nombres: string | null
  nombreCompleto: string | null
  curp: string | null
  telefono: string | null
  correo: string | null
  estatus: string | null
  nivel: string | null
  grado: string | null
  grupo: string | null
  guardian: string | null
  birth: string | null
  ciclo: string | null
  address: string | null
  updatedAt: string | null
}

type ListStudentsInput = {
  agentId: string
  search?: QueryInput
  status?: QueryInput
  missingData?: QueryInput
  program?: QueryInput
  nivel?: QueryInput
  group?: QueryInput
  recentlyUpdated?: QueryInput
  page?: QueryInput
  limit?: QueryInput
  exportMode?: boolean
}

type NormalizedStudent = {
  agentId: string
  plantel: string
  studentId: string
  matricula: string
  fullName: string
  apellidoPaterno: string
  apellidoMaterno: string
  nombres: string
  curp: string
  phone: string
  email: string
  status: string
  program: string
  nivel: string
  grado: string
  group: string
  guardianName: string
  address: string
  missingFields: string[]
  updatedAt: string
  birth: string
  ciclo: string
}

const asFirst = (value: QueryInput) => Array.isArray(value) ? value[0] : value
const asString = (value: QueryInput) => String(asFirst(value) ?? '').trim()
const normalizeAgentId = (value: QueryInput) => asString(value).toUpperCase()
const escapeLike = (value: string) => value.replace(/[\\%_]/g, match => `\\${match}`)
const canonicalColumn = (columns: Set<string>, candidates: string[]) => {
  for (const candidate of candidates) {
    if (columns.has(candidate)) return candidate
  }

  const normalized = new Map<string, string>()
  for (const column of columns) normalized.set(column.toLowerCase(), column)
  for (const candidate of candidates) {
    const found = normalized.get(candidate.toLowerCase())
    if (found) return found
  }

  return null
}

const qid = (identifier: string) => `\`${identifier.replace(/`/g, '``')}\``
const acol = (column: string | null, fallback = "''") => column ? `A.${qid(column)}` : fallback
const selectAs = (column: string | null, alias: string, fallback = "''") => `${acol(column, fallback)} AS ${qid(alias)}`
const nullish = (value: unknown) => String(value ?? '').trim()
const normalizedStatus = (value: unknown) => nullish(value) || 'Sin estado'
const isMissing = (value: unknown) => !nullish(value)
const toIsoDateTime = (value: unknown) => {
  if (!value) return ''
  const date = new Date(value as any)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

export const getControlEscolarAllowedAgentIds = (user: any) => {
  const role = String(user?.role || '').trim().toLowerCase()
  const rawPlanteles = String(user?.planteles || '').split(',').map((p: string) => p.trim().toUpperCase()).filter(Boolean)
  const approved = rawPlanteles.filter((plantel: string) => CONTROL_ESCOLAR_PLANTEL_SET.has(plantel))

  if (role === 'global') {
    return approved.length ? approved : CONTROL_ESCOLAR_PLANTELES
  }

  const activePlantel = String(user?.active_plantel || '').trim().toUpperCase()
  if (CONTROL_ESCOLAR_PLANTEL_SET.has(activePlantel) && !approved.includes(activePlantel)) approved.push(activePlantel)

  return approved
}

export const assertControlEscolarDynamicBridge = () => {
  const config = useRuntimeConfig() as any
  const fixedAgentId = String(config.dbBridgeAgentId || process.env.DB_BRIDGE_AGENT_ID || '').trim()

  if (getDbTransport() === 'bridge' && fixedAgentId) {
    throw createError({ statusCode: 409, message: CONTROL_ESCOLAR_BRIDGE_FIXED_MESSAGE })
  }
}

export const assertControlEscolarAgent = (event: any, agentIdInput: QueryInput) => {
  const agentId = normalizeAgentId(agentIdInput)

  if (!agentId || agentId === 'GLOBAL') {
    throw createError({ statusCode: 400, message: 'Selecciona un plantel válido para Control Escolar.' })
  }

  if (!CONTROL_ESCOLAR_PLANTEL_SET.has(agentId)) {
    throw createError({ statusCode: 403, message: 'El plantel solicitado no está aprobado para Control Escolar.' })
  }

  const allowed = getControlEscolarAllowedAgentIds(event.context.user)
  if (!allowed.includes(agentId)) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para consultar este plantel en Control Escolar.' })
  }

  return agentId
}

export const runControlEscolarForAgent = async <T>(event: any, agentIdInput: QueryInput, callback: (agentId: string) => Promise<T>) => {
  assertControlEscolarDynamicBridge()
  const agentId = assertControlEscolarAgent(event, agentIdInput)
  event.context.controlEscolarAgentId = agentId
  return await runWithBridgeAgentId(agentId, () => callback(agentId))
}

export const getControlEscolarColumnMap = async (): Promise<ColumnMap> => {
  const rows = await query<any[]>(`SHOW COLUMNS FROM base`)
  const columns = new Set(rows.map(row => String(row.Field || '').trim()).filter(Boolean))

  if (!columns.has('matricula')) {
    throw createError({ statusCode: 500, message: 'La tabla base no contiene la columna requerida matricula.' })
  }

  return {
    columns,
    plantel: canonicalColumn(columns, ['plantel']),
    matricula: 'matricula',
    apellidoPaterno: canonicalColumn(columns, ['apellidoPaterno', 'apellido_paterno', 'Apellido paterno', 'apellido paterno']),
    apellidoMaterno: canonicalColumn(columns, ['apellidoMaterno', 'apellido_materno', 'Apellido materno', 'apellido materno']),
    nombres: canonicalColumn(columns, ['nombres', 'nombre', 'Nombre']),
    nombreCompleto: canonicalColumn(columns, ['nombreCompleto', 'nombre_completo', 'Nombre completo', 'nombre completo']),
    curp: canonicalColumn(columns, ['curp', 'CURP']),
    telefono: canonicalColumn(columns, ['telefono', 'teléfono', 'Telefono', 'Teléfono', 'celular', 'Celular']),
    correo: canonicalColumn(columns, ['correo', 'email', 'Correo', 'Email']),
    estatus: canonicalColumn(columns, ['estatus', 'status', 'estado', 'Estado']),
    nivel: canonicalColumn(columns, ['nivel', 'programa', 'program', 'Nivel', 'Programa']),
    grado: canonicalColumn(columns, ['grado', 'Grado']),
    grupo: canonicalColumn(columns, ['grupo', 'Grupo']),
    guardian: canonicalColumn(columns, ['Nombre del padre o tutor', 'padre', 'tutor', 'guardianName', 'responsable', 'Responsable']),
    birth: canonicalColumn(columns, ['Fecha de nacimiento', 'fecha_nacimiento', 'fechaNacimiento', 'birth']),
    ciclo: canonicalColumn(columns, ['ciclo', 'Ciclo']),
    address: canonicalColumn(columns, ['direccion', 'dirección', 'Direccion', 'Dirección', 'domicilio', 'Domicilio', 'address']),
    updatedAt: canonicalColumn(columns, ['updated_at', 'updatedAt', 'fecha_actualizacion', 'fechaActualizacion', 'ultima_actualizacion', 'ultimaActualizacion'])
  }
}

const externalSyncExists = async () => {
  try {
    const rows = await query<any[]>(`SHOW TABLES LIKE 'external_base_sync'`)
    return rows.length > 0
  } catch (error) {
    return false
  }
}

const updatedExprFor = async (columns: ColumnMap) => {
  if (columns.updatedAt) return acol(columns.updatedAt)
  return await externalSyncExists() ? 'E.last_synced_at' : "''"
}

const fromClauseFor = async (columns: ColumnMap) => {
  const joins = []
  if (!columns.updatedAt && await externalSyncExists()) {
    joins.push('LEFT JOIN external_base_sync E ON E.matricula = A.matricula')
  }
  return `FROM base A\n${joins.join('\n')}`
}

const basePlantelWhere = (columns: ColumnMap, agentId: string, params: any[]) => {
  if (!columns.plantel) return ''
  params.push(agentId)
  return ` AND ${acol(columns.plantel)} = ?`
}

const missingFieldExpression = (columns: ColumnMap, field: string) => {
  const normalized = String(field || '').trim().toLowerCase()
  const map: Record<string, string | null> = {
    curp: columns.curp,
    phone: columns.telefono,
    telefono: columns.telefono,
    email: columns.correo,
    correo: columns.correo,
    guardian: columns.guardian,
    tutor: columns.guardian,
    address: columns.address,
    direccion: columns.address,
    nombre: columns.nombreCompleto || columns.nombres
  }
  const column = map[normalized]
  return column ? `(${acol(column)} IS NULL OR TRIM(CAST(${acol(column)} AS CHAR)) = '')` : ''
}

const buildListWhere = async (columns: ColumnMap, input: ListStudentsInput, agentId: string) => {
  const params: any[] = []
  const where: string[] = ['1=1']

  const plantelWhere = basePlantelWhere(columns, agentId, params)
  if (plantelWhere) where.push(plantelWhere.replace(/^ AND /, ''))

  const search = asString(input.search)
  if (search) {
    const like = `%${escapeLike(search)}%`
    const searchColumns = [
      columns.matricula,
      columns.nombreCompleto,
      columns.apellidoPaterno,
      columns.apellidoMaterno,
      columns.nombres,
      columns.curp,
      columns.telefono,
      columns.correo,
      columns.guardian
    ].filter(Boolean) as string[]
    where.push(`(${searchColumns.map(column => `${acol(column)} LIKE ?`).join(' OR ')})`)
    params.push(...searchColumns.map(() => like))
  }

  const status = asString(input.status)
  if (status && status !== 'all' && columns.estatus) {
    where.push(`${acol(columns.estatus)} = ?`)
    params.push(status)
  }

  const program = asString(input.program || input.nivel)
  if (program && program !== 'all' && columns.nivel) {
    where.push(`${acol(columns.nivel)} = ?`)
    params.push(program)
  }

  const group = asString(input.group)
  if (group && group !== 'all' && columns.grupo) {
    where.push(`${acol(columns.grupo)} = ?`)
    params.push(group)
  }

  const missingData = asString(input.missingData)
  if (missingData && missingData !== 'all') {
    const expr = missingFieldExpression(columns, missingData)
    if (expr) where.push(expr)
  }

  const recentlyUpdated = asString(input.recentlyUpdated)
  const updatedExpr = await updatedExprFor(columns)
  if (recentlyUpdated && recentlyUpdated !== 'all' && updatedExpr !== "''") {
    const days = recentlyUpdated === '7d' ? 7 : recentlyUpdated === '30d' ? 30 : 0
    if (days > 0) where.push(`${updatedExpr} >= DATE_SUB(NOW(), INTERVAL ${days} DAY)`)
  }

  return { whereSql: where.join(' AND '), params, updatedExpr }
}

const fullNameExpr = (columns: ColumnMap) => {
  const parts = [columns.apellidoPaterno, columns.apellidoMaterno, columns.nombres]
    .filter(Boolean)
    .map(column => `NULLIF(${acol(column)}, '')`)
  const fallbackName = parts.length ? `NULLIF(TRIM(CONCAT_WS(' ', ${parts.join(', ')})), '')` : "''"
  return `COALESCE(NULLIF(${acol(columns.nombreCompleto)}, ''), ${fallbackName}, ${acol(columns.matricula)})`
}

export const normalizeControlEscolarStudent = (row: any, agentId: string, columns: ColumnMap): NormalizedStudent => {
  const fullName = nullish(row.fullName || [row.apellidoPaterno, row.apellidoMaterno, row.nombres].filter(Boolean).join(' '))
  const plantel = nullish(row.plantel) || agentId
  const program = nullish(row.program || row.nivel)
  const missingFields = [
    ['curp', row.curp],
    ['phone', row.phone],
    ['email', row.email],
    ['guardianName', row.guardianName],
    ...(columns.address ? [['address', row.address] as [string, unknown]] : []),
    ['fullName', fullName]
  ].flatMap(([field, value]) => isMissing(value) ? [field] : [])

  return {
    agentId,
    plantel,
    studentId: nullish(row.studentId || row.matricula),
    matricula: nullish(row.matricula || row.studentId),
    fullName,
    apellidoPaterno: nullish(row.apellidoPaterno),
    apellidoMaterno: nullish(row.apellidoMaterno),
    nombres: nullish(row.nombres),
    curp: normalizeCurp(row.curp),
    phone: nullish(row.phone),
    email: nullish(row.email),
    status: normalizedStatus(row.status),
    program,
    nivel: nullish(row.nivel || program),
    grado: nullish(row.grado),
    group: nullish(row.group),
    guardianName: nullish(row.guardianName),
    address: nullish(row.address),
    missingFields,
    updatedAt: toIsoDateTime(row.updatedAt),
    birth: row.birth ? String(row.birth).slice(0, 10) : '',
    ciclo: nullish(row.ciclo)
  }
}

const listSelectSql = async (columns: ColumnMap) => {
  const updatedExpr = await updatedExprFor(columns)
  return `
    SELECT
      ${selectAs(columns.matricula, 'studentId')},
      ${selectAs(columns.matricula, 'matricula')},
      ${selectAs(columns.plantel, 'plantel')},
      ${selectAs(columns.apellidoPaterno, 'apellidoPaterno')},
      ${selectAs(columns.apellidoMaterno, 'apellidoMaterno')},
      ${selectAs(columns.nombres, 'nombres')},
      ${fullNameExpr(columns)} AS fullName,
      ${selectAs(columns.curp, 'curp')},
      ${selectAs(columns.telefono, 'phone')},
      ${selectAs(columns.correo, 'email')},
      ${selectAs(columns.estatus, 'status')},
      ${selectAs(columns.nivel, 'program')},
      ${selectAs(columns.nivel, 'nivel')},
      ${selectAs(columns.grado, 'grado')},
      ${selectAs(columns.grupo, 'group')},
      ${selectAs(columns.guardian, 'guardianName')},
      ${selectAs(columns.address, 'address')},
      ${selectAs(columns.birth, 'birth')},
      ${selectAs(columns.ciclo, 'ciclo')},
      ${updatedExpr} AS updatedAt
  `
}

const orderSql = (columns: ColumnMap) => {
  const statusOrder = columns.estatus ? `${acol(columns.estatus)} = 'Activo' DESC,` : ''
  return `ORDER BY ${statusOrder} ${fullNameExpr(columns)} ASC, ${acol(columns.matricula)} ASC`
}

export const listControlEscolarStudents = async (input: ListStudentsInput) => {
  const agentId = normalizeAgentId(input.agentId)
  const columns = await getControlEscolarColumnMap()
  const fromSql = await fromClauseFor(columns)
  const { whereSql, params } = await buildListWhere(columns, input, agentId)
  const countRows = await query<any[]>(`SELECT COUNT(*) AS total ${fromSql} WHERE ${whereSql}`, params)
  const total = Number(countRows[0]?.total || 0)
  const rawLimit = Number(asFirst(input.limit) || (input.exportMode ? 10000 : 25))
  const limit = input.exportMode ? Math.min(Math.max(rawLimit || 10000, 1), 10000) : Math.min(Math.max(rawLimit || 25, 1), 100)
  const page = Math.max(Number(asFirst(input.page) || 1), 1)
  const offset = input.exportMode ? 0 : (page - 1) * limit
  const selectSql = await listSelectSql(columns)
  const rows = await query<any[]>(`
    ${selectSql}
    ${fromSql}
    WHERE ${whereSql}
    ${orderSql(columns)}
    LIMIT ? OFFSET ?
  `, [...params, limit, offset])

  return {
    rows: rows.map(row => normalizeControlEscolarStudent(row, agentId, columns)),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1)
    },
    schema: {
      hasAddress: Boolean(columns.address),
      hasUpdatedAt: Boolean(columns.updatedAt) || await externalSyncExists(),
      editableFields: [
        'apellidoPaterno',
        'apellidoMaterno',
        'nombres',
        'phone',
        'email',
        'curp',
        ...(columns.address ? ['address'] : []),
        'guardianName',
        ...(columns.estatus ? ['status'] : []),
        ...(columns.nivel ? ['nivel'] : []),
        ...(columns.grado ? ['grado'] : []),
        ...(columns.grupo ? ['group'] : [])
      ]
    }
  }
}

export const getControlEscolarFacets = async (agentId: string) => {
  const columns = await getControlEscolarColumnMap()
  const fromSql = await fromClauseFor(columns)
  const params: any[] = []
  const plantelWhere = basePlantelWhere(columns, agentId, params)
  const whereSql = `1=1${plantelWhere}`
  const result: Record<string, string[]> = { statuses: [], programs: [], groups: [] }

  if (columns.estatus) {
    const rows = await query<any[]>(`SELECT DISTINCT ${acol(columns.estatus)} AS value ${fromSql} WHERE ${whereSql} AND ${acol(columns.estatus)} IS NOT NULL AND TRIM(${acol(columns.estatus)}) <> '' ORDER BY value ASC LIMIT 40`, params)
    result.statuses = rows.map(row => nullish(row.value)).filter(Boolean)
  }

  if (columns.nivel) {
    const rows = await query<any[]>(`SELECT DISTINCT ${acol(columns.nivel)} AS value ${fromSql} WHERE ${whereSql} AND ${acol(columns.nivel)} IS NOT NULL AND TRIM(${acol(columns.nivel)}) <> '' ORDER BY value ASC LIMIT 60`, params)
    result.programs = rows.map(row => nullish(row.value)).filter(Boolean)
  }

  if (columns.grupo) {
    const rows = await query<any[]>(`SELECT DISTINCT ${acol(columns.grupo)} AS value ${fromSql} WHERE ${whereSql} AND ${acol(columns.grupo)} IS NOT NULL AND TRIM(${acol(columns.grupo)}) <> '' ORDER BY value ASC LIMIT 80`, params)
    result.groups = rows.map(row => nullish(row.value)).filter(Boolean)
  }

  return result
}

export const getControlEscolarKpis = async (agentId: string, cicloInput: QueryInput) => {
  const columns = await getControlEscolarColumnMap()
  const fromSql = await fromClauseFor(columns)
  const params: any[] = []
  const where = ['1=1']
  const plantelWhere = basePlantelWhere(columns, agentId, params)
  if (plantelWhere) where.push(plantelWhere.replace(/^ AND /, ''))
  const whereSql = where.join(' AND ')
  const ciclo = normalizeCicloKey(cicloInput)
  const activeExpr = columns.estatus ? `${acol(columns.estatus)} = 'Activo'` : '0'
  const inactiveExpr = columns.estatus ? `(${acol(columns.estatus)} <> 'Activo' OR ${acol(columns.estatus)} IS NULL)` : '0'
  const cicloExpr = columns.ciclo ? `${acol(columns.ciclo)} = ?` : '0'
  const kpiParams = columns.ciclo ? [...params, ciclo] : params
  const missingCurpExpr = missingFieldExpression(columns, 'curp') || '0'
  const missingPhoneExpr = missingFieldExpression(columns, 'phone') || '0'
  const missingGuardianExpr = missingFieldExpression(columns, 'guardian') || '0'

  const [summary] = await query<any[]>(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN ${activeExpr} THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN ${inactiveExpr} THEN 1 ELSE 0 END) AS inactive,
      SUM(CASE WHEN ${cicloExpr} THEN 1 ELSE 0 END) AS newEnrollments,
      SUM(CASE WHEN ${missingCurpExpr} THEN 1 ELSE 0 END) AS missingCurp,
      SUM(CASE WHEN ${missingPhoneExpr} THEN 1 ELSE 0 END) AS missingPhone,
      SUM(CASE WHEN ${missingGuardianExpr} THEN 1 ELSE 0 END) AS missingGuardian
    ${fromSql}
    WHERE ${whereSql}
  `, kpiParams)

  const incompleteFields = [
    missingFieldExpression(columns, 'curp'),
    missingFieldExpression(columns, 'phone'),
    missingFieldExpression(columns, 'email'),
    missingFieldExpression(columns, 'guardian'),
    missingFieldExpression(columns, 'nombre'),
    missingFieldExpression(columns, 'address')
  ].filter(Boolean)

  const [incomplete] = incompleteFields.length
    ? await query<any[]>(`
      SELECT COUNT(*) AS total
      ${fromSql}
      WHERE ${whereSql} AND (${incompleteFields.join(' OR ')})
    `, params)
    : [{ total: 0 }]

  const byProgram = columns.nivel
    ? await query<any[]>(`
      SELECT ${acol(columns.nivel)} AS label, COUNT(*) AS total
      ${fromSql}
      WHERE ${whereSql} AND ${acol(columns.nivel)} IS NOT NULL AND TRIM(${acol(columns.nivel)}) <> ''
      GROUP BY ${acol(columns.nivel)}
      ORDER BY total DESC, label ASC
      LIMIT 8
    `, params)
    : []

  const byGroup = columns.grupo
    ? await query<any[]>(`
      SELECT ${acol(columns.grupo)} AS label, COUNT(*) AS total
      ${fromSql}
      WHERE ${whereSql} AND ${acol(columns.grupo)} IS NOT NULL AND TRIM(${acol(columns.grupo)}) <> ''
      GROUP BY ${acol(columns.grupo)}
      ORDER BY total DESC, label ASC
      LIMIT 8
    `, params)
    : []

  return {
    total: Number(summary?.total || 0),
    active: Number(summary?.active || 0),
    inactive: Number(summary?.inactive || 0),
    newEnrollments: Number(summary?.newEnrollments || 0),
    incompleteRecords: Number(incomplete?.total || 0),
    missingCurp: Number(summary?.missingCurp || 0),
    missingPhone: Number(summary?.missingPhone || 0),
    missingGuardian: Number(summary?.missingGuardian || 0),
    byProgram: byProgram.map(row => ({ label: nullish(row.label), total: Number(row.total || 0) })).filter(item => item.label),
    byGroup: byGroup.map(row => ({ label: nullish(row.label), total: Number(row.total || 0) })).filter(item => item.label)
  }
}

const cleanText = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max)
const hasOwn = (body: any, key: string) => Object.prototype.hasOwnProperty.call(body || {}, key)

export const updateControlEscolarStudent = async (agentId: string, studentId: string, body: any) => {
  const columns = await getControlEscolarColumnMap()
  const matricula = String(studentId || '').trim()

  if (!matricula) {
    throw createError({ statusCode: 400, message: 'Matrícula requerida.' })
  }

  const ownershipParams: any[] = [matricula]
  const ownershipWhere = [`${acol(columns.matricula)} = ?`]
  if (columns.plantel) {
    ownershipWhere.push(`${acol(columns.plantel)} = ?`)
    ownershipParams.push(agentId)
  }

  const [current] = await query<any[]>(`
    SELECT
      ${selectAs(columns.matricula, 'matricula')},
      ${selectAs(columns.plantel, 'plantel')},
      ${selectAs(columns.apellidoPaterno, 'apellidoPaterno')},
      ${selectAs(columns.apellidoMaterno, 'apellidoMaterno')},
      ${selectAs(columns.nombres, 'nombres')},
      ${selectAs(columns.nivel, 'nivel')},
      ${selectAs(columns.grado, 'grado')},
      ${selectAs(columns.grupo, 'group')},
      ${selectAs(columns.estatus, 'status')}
    FROM base A
    WHERE ${ownershipWhere.join(' AND ')}
    LIMIT 1
  `, ownershipParams)

  if (!current) {
    throw createError({ statusCode: 404, message: 'Alumno no encontrado en el plantel seleccionado.' })
  }

  const setClauses: string[] = []
  const params: any[] = []
  const setIfAllowed = (column: string | null, value: unknown, max = 255) => {
    if (!column) return
    setClauses.push(`${qid(column)} = ?`)
    params.push(cleanText(value, max))
  }

  if (hasOwn(body, 'apellidoPaterno')) setIfAllowed(columns.apellidoPaterno, body.apellidoPaterno, 120)
  if (hasOwn(body, 'apellidoMaterno')) setIfAllowed(columns.apellidoMaterno, body.apellidoMaterno, 120)
  if (hasOwn(body, 'nombres')) setIfAllowed(columns.nombres, body.nombres, 180)

  const nameChanged = ['apellidoPaterno', 'apellidoMaterno', 'nombres'].some(key => hasOwn(body, key))
  if (nameChanged && columns.nombreCompleto) {
    const nextPaterno = hasOwn(body, 'apellidoPaterno') ? body.apellidoPaterno : current.apellidoPaterno
    const nextMaterno = hasOwn(body, 'apellidoMaterno') ? body.apellidoMaterno : current.apellidoMaterno
    const nextNombres = hasOwn(body, 'nombres') ? body.nombres : current.nombres
    setIfAllowed(columns.nombreCompleto, [nextPaterno, nextMaterno, nextNombres].map(part => cleanText(part, 120)).filter(Boolean).join(' '), 255)
  }

  if (hasOwn(body, 'phone')) setIfAllowed(columns.telefono, body.phone, 80)
  if (hasOwn(body, 'email')) {
    const email = cleanText(body.email, 180).toLowerCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw createError({ statusCode: 400, message: 'Correo electrónico inválido.' })
    }
    setIfAllowed(columns.correo, email, 180)
  }

  if (hasOwn(body, 'curp')) {
    const curp = normalizeCurp(body.curp)
    if (curp) {
      const curpInfo = parseCurp(curp)
      if (!curpInfo.isValid) {
        throw createError({ statusCode: 400, message: curpInfo.message || 'CURP inválida.' })
      }
      setIfAllowed(columns.curp, curpInfo.normalized, 18)
      if (columns.birth) setIfAllowed(columns.birth, curpInfo.birthDate, 20)
    } else {
      setIfAllowed(columns.curp, '', 18)
    }
  }

  if (hasOwn(body, 'address')) setIfAllowed(columns.address, body.address, 500)
  if (hasOwn(body, 'guardianName')) setIfAllowed(columns.guardian, body.guardianName, 255)
  if (hasOwn(body, 'status')) setIfAllowed(columns.estatus, body.status || 'Activo', 80)

  const requestedNivel = hasOwn(body, 'nivel') ? cleanText(body.nivel, 80) : current.nivel
  const resolvedNivel = requestedNivel ? resolveNivelEscolar({ plantel: agentId, nivel: requestedNivel }) : ''
  if (hasOwn(body, 'nivel')) setIfAllowed(columns.nivel, resolvedNivel, 80)
  if (hasOwn(body, 'grado')) {
    const requestedGrado = cleanText(body.grado, 80)
    setIfAllowed(columns.grado, requestedGrado ? normalizeGradoForPlantel(requestedGrado, agentId, resolvedNivel || current.nivel) : '', 80)
  }
  if (hasOwn(body, 'group')) setIfAllowed(columns.grupo, body.group, 80)

  if (!setClauses.length) {
    throw createError({ statusCode: 400, message: 'No hay campos permitidos para actualizar.' })
  }

  if (columns.updatedAt) {
    setClauses.push(`${qid(columns.updatedAt)} = CURRENT_TIMESTAMP`)
  }

  params.push(matricula)
  if (columns.plantel) params.push(agentId)

  await query(`
    UPDATE base
    SET ${setClauses.join(', ')}
    WHERE ${qid(columns.matricula)} = ?${columns.plantel ? ` AND ${qid(columns.plantel)} = ?` : ''}
    LIMIT 1
  `, params)

  // TODO: conectar con el mecanismo real de auditoría del proyecto si se agrega uno para cambios de Control Escolar.

  const [updated] = await query<any[]>(`
    ${await listSelectSql(columns)}
    ${await fromClauseFor(columns)}
    WHERE ${acol(columns.matricula)} = ?${columns.plantel ? ` AND ${acol(columns.plantel)} = ?` : ''}
    LIMIT 1
  `, columns.plantel ? [matricula, agentId] : [matricula])

  return normalizeControlEscolarStudent(updated, agentId, columns)
}

export const filtersSummary = (query: Record<string, any>) => {
  const labels = [
    ['search', 'Búsqueda'],
    ['status', 'Estado'],
    ['missingData', 'Dato faltante'],
    ['program', 'Programa/nivel'],
    ['nivel', 'Nivel'],
    ['group', 'Grupo'],
    ['recentlyUpdated', 'Actualización']
  ]

  return labels
    .map(([key, label]) => {
      const value = asString(query[key])
      return value && value !== 'all' ? `${label}: ${value}` : ''
    })
    .filter(Boolean)
    .join(' | ')
}

export const encodeCsv = (rows: NormalizedStudent[], headerRows: string[][] = []) => {
  const columns = [
    ['plantel', 'Plantel'],
    ['matricula', 'Matrícula / ID'],
    ['fullName', 'Nombre completo'],
    ['curp', 'CURP'],
    ['phone', 'Teléfono'],
    ['email', 'Email'],
    ['status', 'Estado'],
    ['program', 'Programa / nivel'],
    ['group', 'Grupo'],
    ['guardianName', 'Tutor / responsable'],
    ['missingFields', 'Datos faltantes'],
    ['updatedAt', 'Última actualización']
  ] as const
  const escape = (value: unknown) => {
    const raw = Array.isArray(value) ? value.join(', ') : String(value ?? '')
    const cleaned = raw.replace(/"/g, '""')
    return /[",\n]/.test(cleaned) ? `"${cleaned}"` : cleaned
  }

  const body = [
    ...headerRows,
    columns.map(([, label]) => label),
    ...rows.map(row => columns.map(([key]) => (row as any)[key]))
  ]

  return `\ufeff${body.map(line => line.map(escape).join(',')).join('\n')}`
}
