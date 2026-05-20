import { query, runWithBridgeAgentId } from './db'
import { getTrustedAuthUser, normalizePlantel, type AuthSessionUser } from './auth-session'
import { PLANTELES_LIST } from '../../utils/constants'

export type ControlEscolarStudentRow = {
  agentId: string
  plantel: string
  basePlantel: string
  studentId: string
  matricula: string
  fullName: string
  nombreCompleto: string
  nombres: string
  apellidoPaterno: string
  apellidoMaterno: string
  curp: string
  phone: string
  email: string
  status: string
  statusSource: string
  baja: number | null
  motivoBaja: string
  categoriaBaja: string
  seguimientoBaja: string
  program: string
  nivel: string
  grado: string
  group: string
  guardianName: string
  fatherName: string
  motherName: string
  telefonoPadre: string
  telefonoMadre: string
  emailPadre: string
  emailMadre: string
  interno: string
  servicio: string
  address: string
  photoUrl: string
  overlayExists: boolean
  missingFields: string[]
  updatedAt: string | null
}

type TableColumn = {
  Field: string
  Type?: string
  Null?: string
  Key?: string
  Default?: any
  Extra?: string
}

type MatriculaPatch = Record<string, any>

export const CONTROL_ESCOLAR_ALLOWED_BASE_COLUMNS = new Set([
  'matricula',
  'plantel',
  'grado',
  'grupo',
  'nivel',
  'nombres',
  'apellidoPaterno',
  'apellidoMaterno',
  'nombreCompleto',
  'curp',
  'correo',
  'telefono',
  'interno',
  'estatus',
  'Nombre del padre o tutor',
  'Fecha de nacimiento',
  'updated_at',
  'updatedAt',
  'fecha_actualizacion'
])

const PLANTEL_SET = new Set(PLANTELES_LIST.map(normalizePlantel))
const controlEscolarSchemaCache = new Map<string, { base: Set<string>; matricula: Set<string>; ingresos: boolean; loadedAt: number }>()
const SCHEMA_CACHE_MS = 1000 * 60 * 5

const normalizeKey = (value: unknown) => String(value || '').trim()
const normalizeText = (value: unknown, max = 255) => normalizeKey(value).slice(0, max)
const normalizeUpper = (value: unknown, max = 255) => normalizeText(value, max).toUpperCase()
const normalizeEmail = (value: unknown) => normalizeText(value, 255).toLowerCase()
const normalizePhone = (value: unknown) => normalizeText(value, 40).replace(/[^0-9+()\-\s.]/g, '').slice(0, 40)
const normalizeNullable = (value: unknown, max = 255) => {
  const text = normalizeText(value, max)
  return text || null
}

const safeAlias = (value: string) => value.replace(/[^A-Za-z0-9_]/g, '')
const col = (alias: string, column: string) => `${alias}.\`${column.replace(/`/g, '``')}\``
const has = (columns: Set<string>, column: string) => columns.has(column)
const expr = (columns: Set<string>, alias: string, column: string, fallback = 'NULL') => has(columns, column) ? col(alias, column) : fallback
const coalesceExpr = (...parts: Array<string | false | null | undefined>) => {
  const clean = parts.filter(Boolean) as string[]
  return clean.length ? `COALESCE(${clean.join(', ')})` : 'NULL'
}
const nullIfTrim = (sql: string) => `NULLIF(TRIM(CAST(${sql} AS CHAR)), '')`
const selectAs = (sql: string, alias: string) => `${sql} AS ${safeAlias(alias)}`

const getConfiguredBridgeAgentId = () => {
  const config = useRuntimeConfig() as any
  return String(config.dbBridgeAgentId || '').trim()
}

const getTransport = () => {
  const config = useRuntimeConfig() as any
  return String(config.dbTransport || 'direct').toLowerCase()
}

export const assertControlEscolarDynamicBridge = (agentId: string) => {
  const configuredAgentId = getConfiguredBridgeAgentId()
  if (getTransport() === 'bridge' && configuredAgentId && normalizePlantel(configuredAgentId) !== normalizePlantel(agentId)) {
    throw createError({
      statusCode: 409,
      message: 'Control Escolar requiere selección dinámica de agentId. DB_BRIDGE_AGENT_ID está fijado y bloquearía el plantel solicitado.'
    })
  }
}

export const resolveControlEscolarAuth = async (event: any, requestedAgentId?: unknown) => {
  const user = await getTrustedAuthUser(event)
  const agentId = normalizePlantel(requestedAgentId)

  if (!agentId || !PLANTEL_SET.has(agentId)) {
    throw createError({ statusCode: 400, message: 'Selecciona un plantel válido para Control Escolar.' })
  }

  const allowedPlanteles = Array.isArray(user.plantelesList)
    ? user.plantelesList.map(normalizePlantel).filter(Boolean)
    : []

  if (!user.isSuperAdmin && !allowedPlanteles.includes(agentId)) {
    throw createError({ statusCode: 403, message: 'No tienes permisos para consultar este plantel en Control Escolar.' })
  }

  assertControlEscolarDynamicBridge(agentId)

  return { user, agentId }
}

export const listControlEscolarPlanteles = async (event: any) => {
  const user = await getTrustedAuthUser(event)
  const allowedPlanteles = user.isSuperAdmin
    ? [...PLANTELES_LIST]
    : (user.plantelesList || []).map(normalizePlantel).filter((plantel) => PLANTEL_SET.has(plantel))

  return {
    user,
    planteles: allowedPlanteles.map((plantel) => ({
      agentId: plantel,
      plantel,
      label: plantel,
      selected: normalizePlantel(user.active_plantel) === plantel
    }))
  }
}

const getColumns = async (tableName: string) => {
  const rows = await query<TableColumn[]>(`SHOW COLUMNS FROM \`${tableName.replace(/`/g, '``')}\``)
  return new Set(rows.map((row) => row.Field))
}

const tableExists = async (tableName: string) => {
  const rows = await query<any[]>(`SHOW TABLES LIKE ?`, [tableName])
  return rows.length > 0
}

export const getControlEscolarSchema = async (agentId: string) => {
  const cacheKey = normalizePlantel(agentId)
  const cached = controlEscolarSchemaCache.get(cacheKey)
  if (cached && Date.now() - cached.loadedAt < SCHEMA_CACHE_MS) return cached

  const baseExists = await tableExists('base')
  if (!baseExists) {
    throw createError({ statusCode: 500, message: 'La tabla base no existe en el plantel seleccionado.' })
  }

  const matriculaExists = await tableExists('matricula')
  const [baseColumns, matriculaColumns, ingresosExists] = await Promise.all([
    getColumns('base'),
    matriculaExists ? getColumns('matricula') : Promise.resolve(new Set<string>()),
    tableExists('ingresos')
  ])

  if (!matriculaExists) {
    throw createError({ statusCode: 500, message: 'La tabla matricula no existe para el plantel seleccionado. Control Escolar necesita esa capa centralizada para edición.' })
  }

  if (!baseColumns.has('matricula') || !matriculaColumns.has('matricula')) {
    throw createError({ statusCode: 500, message: 'No se puede unir base y matricula porque falta la columna matricula.' })
  }

  const schema = { base: baseColumns, matricula: matriculaColumns, ingresos: ingresosExists, loadedAt: Date.now() }
  controlEscolarSchemaCache.set(cacheKey, schema)
  return schema
}

export const buildControlEscolarSelect = (agentId: string, schema: Awaited<ReturnType<typeof getControlEscolarSchema>>) => {
  const b = schema.base
  const m = schema.matricula

  const baseNombreCompleto = has(b, 'nombreCompleto')
    ? nullIfTrim(col('b', 'nombreCompleto'))
    : `NULLIF(TRIM(CONCAT_WS(' ', ${expr(b, 'b', 'apellidoPaterno')}, ${expr(b, 'b', 'apellidoMaterno')}, ${expr(b, 'b', 'nombres')})), '')`

  const nombres = coalesceExpr(nullIfTrim(expr(m, 'm', 'nombres')), nullIfTrim(expr(b, 'b', 'nombres')))
  const apellidoPaterno = coalesceExpr(nullIfTrim(expr(m, 'm', 'apellido_paterno')), nullIfTrim(expr(b, 'b', 'apellidoPaterno')))
  const apellidoMaterno = coalesceExpr(nullIfTrim(expr(m, 'm', 'apellido_materno')), nullIfTrim(expr(b, 'b', 'apellidoMaterno')))
  const fullName = coalesceExpr(
    `NULLIF(TRIM(CONCAT_WS(' ', ${apellidoPaterno}, ${apellidoMaterno}, ${nombres})), '')`,
    baseNombreCompleto
  )
  const grado = `TRIM(LOWER(${coalesceExpr(nullIfTrim(expr(m, 'm', 'grado')), nullIfTrim(expr(b, 'b', 'grado')))}))`
  const nivel = `LOWER(${coalesceExpr(nullIfTrim(expr(m, 'm', 'nivel')), nullIfTrim(expr(b, 'b', 'nivel')))} )`
  const grupo = coalesceExpr(nullIfTrim(expr(m, 'm', 'grupo')), nullIfTrim(expr(b, 'b', 'grupo')))
  const curp = coalesceExpr(nullIfTrim(expr(m, 'm', 'curp')), nullIfTrim(expr(b, 'b', 'curp')))
  const emailPadre = coalesceExpr(nullIfTrim(expr(m, 'm', 'email_padre')), nullIfTrim(expr(b, 'b', 'correo')))
  const emailMadre = coalesceExpr(nullIfTrim(expr(m, 'm', 'email_madre')), nullIfTrim(expr(b, 'b', 'correo')))
  const telefonoPadre = coalesceExpr(nullIfTrim(expr(m, 'm', 'telefono_padre')), nullIfTrim(expr(b, 'b', 'telefono')))
  const telefonoMadre = coalesceExpr(nullIfTrim(expr(m, 'm', 'telefono_madre')), nullIfTrim(expr(b, 'b', 'telefono')))
  const interno = coalesceExpr(nullIfTrim(expr(m, 'm', 'interno')), nullIfTrim(expr(b, 'b', 'interno')))
  const padreFullName = `NULLIF(TRIM(CONCAT_WS(' ', ${expr(m, 'm', 'nombre_padre')}, ${expr(m, 'm', 'apellido_paterno_padre')}, ${expr(m, 'm', 'apellido_materno_padre')})), '')`
  const madreFullName = `NULLIF(TRIM(CONCAT_WS(' ', ${expr(m, 'm', 'nombre_madre')}, ${expr(m, 'm', 'apellido_paterno_madre')}, ${expr(m, 'm', 'apellido_materno_madre')})), '')`
  const guardian = coalesceExpr(padreFullName, madreFullName, nullIfTrim(expr(b, 'b', 'Nombre del padre o tutor')))
  const updatedAt = coalesceExpr(
    expr(m, 'm', 'updated_at'),
    expr(m, 'm', 'updatedAt'),
    expr(m, 'm', 'fecha_actualizacion'),
    expr(m, 'm', 'created_at'),
    expr(b, 'b', 'updated_at'),
    expr(b, 'b', 'updatedAt'),
    expr(b, 'b', 'fecha_actualizacion')
  )
  const address = coalesceExpr(
    nullIfTrim(expr(m, 'm', 'direccion')),
    nullIfTrim(expr(m, 'm', 'domicilio')),
    nullIfTrim(expr(m, 'm', 'calle')),
    nullIfTrim(expr(b, 'b', 'direccion')),
    nullIfTrim(expr(b, 'b', 'domicilio'))
  )

  const plantel = coalesceExpr(nullIfTrim(expr(m, 'm', 'plantel')), nullIfTrim(expr(b, 'b', 'plantel')), `'${agentId}'`)
  const status = `CASE WHEN ${expr(m, 'm', 'baja')} IN (1, '1', 'SI', 'Si', 'si', 'TRUE', 'true', 'Baja', 'BAJA') THEN 'Baja' ELSE ${coalesceExpr(nullIfTrim(expr(b, 'b', 'estatus')), `'Activo'`)} END`

  return {
    selectFields: [
      selectAs(`'${agentId}'`, 'agentId'),
      selectAs(plantel, 'plantel'),
      selectAs(coalesceExpr(nullIfTrim(expr(b, 'b', 'plantel')), `'${agentId}'`), 'basePlantel'),
      selectAs(col('b', 'matricula'), 'studentId'),
      selectAs(col('b', 'matricula'), 'matricula'),
      selectAs(fullName, 'fullName'),
      selectAs(fullName, 'nombreCompleto'),
      selectAs(nombres, 'nombres'),
      selectAs(apellidoPaterno, 'apellidoPaterno'),
      selectAs(apellidoMaterno, 'apellidoMaterno'),
      selectAs(curp, 'curp'),
      selectAs(telefonoPadre, 'phone'),
      selectAs(emailPadre, 'email'),
      selectAs(status, 'status'),
      selectAs(`CASE WHEN m.matricula IS NULL THEN 'base' ELSE 'matricula' END`, 'statusSource'),
      selectAs(expr(m, 'm', 'baja'), 'baja'),
      selectAs(expr(m, 'm', 'motivo_baja'), 'motivoBaja'),
      selectAs(expr(m, 'm', 'categoria_baja'), 'categoriaBaja'),
      selectAs(expr(m, 'm', 'seguimiento_baja'), 'seguimientoBaja'),
      selectAs(coalesceExpr(nullIfTrim(expr(m, 'm', 'servicio')), nivel), 'program'),
      selectAs(nivel, 'nivel'),
      selectAs(grado, 'grado'),
      selectAs(grupo, 'group'),
      selectAs(guardian, 'guardianName'),
      selectAs(padreFullName, 'fatherName'),
      selectAs(madreFullName, 'motherName'),
      selectAs(expr(m, 'm', 'nombre_padre'), 'nombrePadre'),
      selectAs(expr(m, 'm', 'apellido_paterno_padre'), 'apellidoPaternoPadre'),
      selectAs(expr(m, 'm', 'apellido_materno_padre'), 'apellidoMaternoPadre'),
      selectAs(expr(m, 'm', 'nombre_madre'), 'nombreMadre'),
      selectAs(expr(m, 'm', 'apellido_paterno_madre'), 'apellidoPaternoMadre'),
      selectAs(expr(m, 'm', 'apellido_materno_madre'), 'apellidoMaternoMadre'),
      selectAs(telefonoPadre, 'telefonoPadre'),
      selectAs(telefonoMadre, 'telefonoMadre'),
      selectAs(emailPadre, 'emailPadre'),
      selectAs(emailMadre, 'emailMadre'),
      selectAs(interno, 'interno'),
      selectAs(expr(m, 'm', 'servicio'), 'servicio'),
      selectAs(address, 'address'),
      selectAs(expr(m, 'm', 'foto'), 'foto'),
      selectAs(`m.matricula IS NOT NULL`, 'overlayExists'),
      selectAs(updatedAt, 'updatedAt')
    ],
    expressions: {
      fullName,
      curp,
      phone: telefonoPadre,
      email: emailPadre,
      status,
      nivel,
      grado,
      grupo,
      guardian,
      updatedAt
    }
  }
}

const buildMissingFields = (row: any) => {
  const missing: string[] = []
  if (!normalizeKey(row.curp)) missing.push('curp')
  if (!normalizeKey(row.phone) && !normalizeKey(row.telefonoPadre) && !normalizeKey(row.telefonoMadre)) missing.push('teléfono')
  if (!normalizeKey(row.email) && !normalizeKey(row.emailPadre) && !normalizeKey(row.emailMadre)) missing.push('email')
  if (!normalizeKey(row.guardianName) && !normalizeKey(row.fatherName) && !normalizeKey(row.motherName)) missing.push('tutor')
  if (!normalizeKey(row.group)) missing.push('grupo')
  return missing
}

const resolvePhotoUrl = (value: unknown) => {
  const raw = normalizeKey(value)
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('//')) return `https:${raw}`

  const config = useRuntimeConfig() as any
  const baseUrl = String(config.studentPhotoBaseUrl || 'https://matricula.casitaapps.com').trim().replace(/\/+$/, '')
  const normalized = raw.replace(/\\/g, '/').replace(/^\.\//, '')
  const path = normalized.startsWith('/') ? normalized : (normalized.includes('/') ? `/${normalized}` : `/uploads/${normalized}`)
  return `${baseUrl}${path}`
}

export const normalizeControlEscolarRow = (row: any): ControlEscolarStudentRow => {
  const normalized = {
    ...row,
    agentId: normalizePlantel(row.agentId),
    plantel: normalizeText(row.plantel || row.basePlantel),
    basePlantel: normalizeText(row.basePlantel),
    studentId: normalizeText(row.studentId || row.matricula),
    matricula: normalizeText(row.matricula),
    fullName: normalizeText(row.fullName || row.nombreCompleto),
    nombreCompleto: normalizeText(row.nombreCompleto || row.fullName),
    nombres: normalizeText(row.nombres),
    apellidoPaterno: normalizeText(row.apellidoPaterno),
    apellidoMaterno: normalizeText(row.apellidoMaterno),
    curp: normalizeUpper(row.curp, 18),
    phone: normalizeText(row.phone),
    email: normalizeEmail(row.email),
    status: normalizeText(row.status || 'Activo'),
    statusSource: normalizeText(row.statusSource),
    baja: row.baja == null ? null : Number(row.baja) || 0,
    motivoBaja: normalizeText(row.motivoBaja, 500),
    categoriaBaja: normalizeText(row.categoriaBaja),
    seguimientoBaja: normalizeText(row.seguimientoBaja, 500),
    program: normalizeText(row.program),
    nivel: normalizeText(row.nivel),
    grado: normalizeText(row.grado),
    group: normalizeText(row.group),
    guardianName: normalizeText(row.guardianName),
    fatherName: normalizeText(row.fatherName),
    motherName: normalizeText(row.motherName),
    telefonoPadre: normalizeText(row.telefonoPadre),
    telefonoMadre: normalizeText(row.telefonoMadre),
    emailPadre: normalizeEmail(row.emailPadre),
    emailMadre: normalizeEmail(row.emailMadre),
    interno: normalizeText(row.interno),
    servicio: normalizeText(row.servicio),
    address: normalizeText(row.address, 700),
    photoUrl: resolvePhotoUrl(row.foto),
    overlayExists: Boolean(row.overlayExists),
    missingFields: [] as string[],
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString?.() || String(row.updatedAt) : null
  }

  normalized.missingFields = buildMissingFields(normalized)
  return normalized
}

export const buildControlEscolarWhere = (schema: Awaited<ReturnType<typeof getControlEscolarSchema>>, fields: ReturnType<typeof buildControlEscolarSelect>, filters: any) => {
  const where: string[] = []
  const params: any[] = []

  if (schema.ingresos) {
    where.push(`EXISTS (SELECT 1 FROM ingresos i WHERE i.matricula = b.matricula AND i.estatus = 'Activo')`)
  }

  where.push(`${expr(schema.base, 'b', 'estatus', `'Activo'`)} = 'Activo'`)

  const search = normalizeText(filters.search || filters.q || '', 80)
  if (search) {
    where.push(`(${fields.expressions.fullName} LIKE ? OR b.matricula LIKE ? OR ${fields.expressions.curp} LIKE ? OR ${fields.expressions.email} LIKE ? OR ${fields.expressions.phone} LIKE ?)`)
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
  }

  const status = normalizeText(filters.status || '')
  if (status && status !== 'all') {
    if (status === 'active') where.push(`${fields.expressions.status} = 'Activo'`)
    if (status === 'inactive') where.push(`${fields.expressions.status} <> 'Activo'`)
    if (status === 'baja') where.push(`${fields.expressions.status} = 'Baja'`)
  }

  const nivel = normalizeText(filters.nivel || filters.program || '')
  if (nivel && nivel !== 'all') {
    where.push(`${fields.expressions.nivel} = ?`)
    params.push(nivel.toLowerCase())
  }

  const grado = normalizeText(filters.grado || '')
  if (grado && grado !== 'all') {
    where.push(`${fields.expressions.grado} = ?`)
    params.push(grado.toLowerCase())
  }

  const grupo = normalizeText(filters.group || filters.grupo || '')
  if (grupo && grupo !== 'all') {
    where.push(`${fields.expressions.grupo} = ?`)
    params.push(grupo)
  }

  const missing = normalizeText(filters.missing || '')
  if (missing && missing !== 'all') {
    if (missing === 'curp') where.push(`(${fields.expressions.curp} IS NULL OR ${fields.expressions.curp} = '')`)
    if (missing === 'phone') where.push(`(${fields.expressions.phone} IS NULL OR ${fields.expressions.phone} = '')`)
    if (missing === 'email') where.push(`(${fields.expressions.email} IS NULL OR ${fields.expressions.email} = '')`)
    if (missing === 'guardian') where.push(`(${fields.expressions.guardian} IS NULL OR ${fields.expressions.guardian} = '')`)
    if (missing === 'overlay') where.push(`m.matricula IS NULL`)
  }

  const recent = normalizeText(filters.recent || '')
  if (recent && recent !== 'all') {
    const days = recent === '7d' ? 7 : recent === '30d' ? 30 : recent === '90d' ? 90 : 0
    if (days > 0) where.push(`${fields.expressions.updatedAt} >= DATE_SUB(NOW(), INTERVAL ${days} DAY)`)
  }

  return { whereSql: where.length ? where.join(' AND ') : '1=1', params }
}

export const getControlEscolarCatalogs = async (agentId: string) => {
  const schema = await getControlEscolarSchema(agentId)
  const fields = buildControlEscolarSelect(agentId, schema)
  const { whereSql, params } = buildControlEscolarWhere(schema, fields, {})
  const rows = await query<any[]>(`
    SELECT
      ${fields.expressions.nivel} AS nivel,
      ${fields.expressions.grado} AS grado,
      ${fields.expressions.grupo} AS grupo,
      COUNT(*) AS total
    FROM base b
    LEFT JOIN matricula m ON m.matricula = b.matricula
    WHERE ${whereSql}
    GROUP BY nivel, grado, grupo
    ORDER BY nivel ASC, grado ASC, grupo ASC
  `, params)

  return {
    niveles: Array.from(new Set(rows.map((row) => normalizeText(row.nivel)).filter(Boolean))),
    grados: Array.from(new Set(rows.map((row) => normalizeText(row.grado)).filter(Boolean))),
    grupos: Array.from(new Set(rows.map((row) => normalizeText(row.grupo)).filter(Boolean)))
  }
}

export const fetchControlEscolarStudents = async (agentId: string, filters: any) => {
  const page = Math.max(1, Number(filters.page || 1) || 1)
  const limit = Math.min(100, Math.max(10, Number(filters.limit || 25) || 25))
  const offset = (page - 1) * limit
  const schema = await getControlEscolarSchema(agentId)
  const fields = buildControlEscolarSelect(agentId, schema)
  const { whereSql, params } = buildControlEscolarWhere(schema, fields, filters)

  const countRows = await query<any[]>(`
    SELECT COUNT(*) AS total
    FROM base b
    LEFT JOIN matricula m ON m.matricula = b.matricula
    WHERE ${whereSql}
  `, params)

  const rows = await query<any[]>(`
    SELECT ${fields.selectFields.join(',\n      ')}
    FROM base b
    LEFT JOIN matricula m ON m.matricula = b.matricula
    WHERE ${whereSql}
    ORDER BY ${fields.expressions.status} = 'Activo' DESC, ${fields.expressions.grado} ASC, ${fields.expressions.grupo} ASC, ${fields.expressions.fullName} ASC, b.matricula ASC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset])

  const data = rows.map(normalizeControlEscolarRow)
  const catalogs = await getControlEscolarCatalogs(agentId)

  return {
    data,
    pagination: {
      page,
      limit,
      total: Number(countRows[0]?.total || 0),
      pages: Math.max(1, Math.ceil(Number(countRows[0]?.total || 0) / limit))
    },
    catalogs
  }
}

export const fetchControlEscolarKpis = async (agentId: string) => {
  const schema = await getControlEscolarSchema(agentId)
  const fields = buildControlEscolarSelect(agentId, schema)
  const { whereSql, params } = buildControlEscolarWhere(schema, fields, {})
  const rows = await query<any[]>(`
    SELECT ${fields.selectFields.join(',\n      ')}
    FROM base b
    LEFT JOIN matricula m ON m.matricula = b.matricula
    WHERE ${whereSql}
    LIMIT 10000
  `, params)

  const students = rows.map(normalizeControlEscolarRow)
  const byNivel = new Map<string, number>()
  const byGrupo = new Map<string, number>()

  students.forEach((student) => {
    if (student.nivel) byNivel.set(student.nivel, (byNivel.get(student.nivel) || 0) + 1)
    const groupKey = [student.grado, student.group].filter(Boolean).join(' ') || student.group
    if (groupKey) byGrupo.set(groupKey, (byGrupo.get(groupKey) || 0) + 1)
  })

  const active = students.filter((student) => student.status === 'Activo').length
  const inactive = students.length - active
  const overlayMissing = students.filter((student) => !student.overlayExists).length
  const missing = (field: string) => students.filter((student) => student.missingFields.includes(field)).length

  return {
    totalInscritos: students.length,
    activos: active,
    inactivos: inactive,
    bajas: students.filter((student) => student.status === 'Baja').length,
    nuevosOverlay: overlayMissing,
    expedientesIncompletos: students.filter((student) => student.missingFields.length > 0).length,
    sinCurp: missing('curp'),
    sinTelefono: missing('teléfono'),
    sinTutor: missing('tutor'),
    sinEmail: missing('email'),
    porNivel: Array.from(byNivel.entries()).map(([label, total]) => ({ label, total })),
    porGrupo: Array.from(byGrupo.entries()).map(([label, total]) => ({ label, total })).slice(0, 18)
  }
}

const PATCH_FIELD_COLUMN_MAP: Record<string, string> = {
  nombres: 'nombres',
  apellidoPaterno: 'apellido_paterno',
  apellidoMaterno: 'apellido_materno',
  curp: 'curp',
  emailPadre: 'email_padre',
  emailMadre: 'email_madre',
  telefonoPadre: 'telefono_padre',
  telefonoMadre: 'telefono_madre',
  interno: 'interno',
  baja: 'baja',
  motivoBaja: 'motivo_baja',
  categoriaBaja: 'categoria_baja',
  seguimientoBaja: 'seguimiento_baja',
  nombrePadre: 'nombre_padre',
  apellidoPaternoPadre: 'apellido_paterno_padre',
  apellidoMaternoPadre: 'apellido_materno_padre',
  nombreMadre: 'nombre_madre',
  apellidoPaternoMadre: 'apellido_paterno_madre',
  apellidoMaternoMadre: 'apellido_materno_madre',
  servicio: 'servicio',
  grado: 'grado',
  grupo: 'grupo',
  nivel: 'nivel',
  direccion: 'direccion',
  domicilio: 'domicilio'
}

const normalizePatchValue = (field: string, value: unknown) => {
  if (field === 'curp') return normalizeUpper(value, 18) || null
  if (field.toLowerCase().includes('email')) return normalizeEmail(value) || null
  if (field.toLowerCase().includes('telefono')) return normalizePhone(value) || null
  if (field === 'baja') return value === true || value === 1 || String(value).toLowerCase() === 'true' || String(value) === '1' ? 1 : 0
  if (field === 'grado' || field === 'nivel') return normalizeText(value, 80).toLowerCase() || null
  if (field === 'grupo') return normalizeText(value, 40) || null
  if (field === 'direccion' || field === 'domicilio' || field === 'seguimientoBaja' || field === 'motivoBaja') return normalizeNullable(value, 700)
  return normalizeNullable(value, 255)
}

export const updateControlEscolarStudent = async (agentId: string, matricula: string, body: MatriculaPatch, user: AuthSessionUser) => {
  const normalizedMatricula = normalizeText(matricula, 64)
  if (!normalizedMatricula) {
    throw createError({ statusCode: 400, message: 'Matrícula inválida.' })
  }

  const schema = await getControlEscolarSchema(agentId)
  const [baseRow] = await query<any[]>(`SELECT matricula, plantel FROM base WHERE matricula = ? AND estatus = 'Activo' LIMIT 1`, [normalizedMatricula])
  if (!baseRow) {
    throw createError({ statusCode: 404, message: 'El alumno no existe como fila activa en base. Control Escolar no crea alumnos locales.' })
  }

  const editableEntries = Object.entries(body || {})
    .filter(([field]) => Object.prototype.hasOwnProperty.call(PATCH_FIELD_COLUMN_MAP, field))
    .map(([field, value]) => ({ field, column: PATCH_FIELD_COLUMN_MAP[field], value: normalizePatchValue(field, value) }))
    .filter((entry) => schema.matricula.has(entry.column))

  const requestedFields = Object.keys(body || {})
  const rejected = requestedFields.filter((field) => !Object.prototype.hasOwnProperty.call(PATCH_FIELD_COLUMN_MAP, field))
  if (rejected.length) {
    throw createError({ statusCode: 400, message: `Campos no permitidos para Control Escolar: ${rejected.join(', ')}` })
  }

  if (!editableEntries.length) {
    throw createError({ statusCode: 400, message: 'No hay campos editables disponibles en la tabla matricula para guardar.' })
  }

  if (editableEntries.some((entry) => entry.field === 'curp' && entry.value && !/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(String(entry.value)))) {
    throw createError({ statusCode: 400, message: 'CURP inválida. Debe tener 18 caracteres con formato oficial.' })
  }

  const [existing] = await query<any[]>(`SELECT matricula FROM matricula WHERE matricula = ? LIMIT 1`, [normalizedMatricula])
  const auditContext = {
    user: user.email,
    agentId,
    matricula: normalizedMatricula,
    fields: editableEntries.map((entry) => entry.field)
  }

  if (existing) {
    const assignments = editableEntries.map((entry) => `\`${entry.column}\` = ?`)
    const params = [...editableEntries.map((entry) => entry.value)]
    if (schema.matricula.has('updated_at')) assignments.push('`updated_at` = CURRENT_TIMESTAMP')
    if (schema.matricula.has('updated_by')) {
      assignments.push('`updated_by` = ?')
      params.push(user.email)
    }
    params.push(normalizedMatricula)
    await query(`UPDATE matricula SET ${assignments.join(', ')} WHERE matricula = ?`, params)
  } else {
    const columns = ['matricula']
    const values: any[] = [normalizedMatricula]

    if (schema.matricula.has('plantel')) {
      columns.push('plantel')
      values.push(normalizePlantel(baseRow.plantel || agentId))
    }

    if (schema.matricula.has('created_by')) {
      columns.push('created_by')
      values.push(user.email)
    }

    if (schema.matricula.has('updated_by')) {
      columns.push('updated_by')
      values.push(user.email)
    }

    editableEntries.forEach((entry) => {
      if (!columns.includes(entry.column)) {
        columns.push(entry.column)
        values.push(entry.value)
      }
    })

    await query(
      `INSERT INTO matricula (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      values
    )
  }

  // TODO: Wire this into the project audit log if a Control Escolar audit table/pattern is introduced.
  console.info('[Control Escolar] matricula overlay updated', auditContext)

  const result = await fetchControlEscolarStudents(agentId, { search: normalizedMatricula, page: 1, limit: 1 })
  return { success: true, student: result.data[0] || null }
}

export const runControlEscolar = async <T>(event: any, agentId: string, callback: () => Promise<T>) => {
  event.context.controlEscolarAgentId = agentId
  return await runWithBridgeAgentId(agentId, callback)
}

export const fetchControlEscolarExportRows = async (agentId: string, filters: any) => {
  const schema = await getControlEscolarSchema(agentId)
  const fields = buildControlEscolarSelect(agentId, schema)
  const { whereSql, params } = buildControlEscolarWhere(schema, fields, filters)
  const rows = await query<any[]>(`
    SELECT ${fields.selectFields.join(',\n      ')}
    FROM base b
    LEFT JOIN matricula m ON m.matricula = b.matricula
    WHERE ${whereSql}
    ORDER BY ${fields.expressions.status} = 'Activo' DESC, ${fields.expressions.grado} ASC, ${fields.expressions.grupo} ASC, ${fields.expressions.fullName} ASC, b.matricula ASC
    LIMIT 5000
  `, params)

  return rows.map(normalizeControlEscolarRow)
}
