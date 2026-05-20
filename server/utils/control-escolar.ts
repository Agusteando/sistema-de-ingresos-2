import { query, runWithBridgeAgentId } from './db'
import { getTrustedAuthUser, normalizePlantel, type AuthSessionUser } from './auth-session'
import { PLANTELES_LIST } from '../../utils/constants'
import { controlEscolarCentralQuery } from './control-escolar-central'

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
  nombrePadre: string
  apellidoPaternoPadre: string
  apellidoMaternoPadre: string
  nombreMadre: string
  apellidoPaternoMadre: string
  apellidoMaternoMadre: string
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

type ControlEscolarSchema = {
  base: Set<string>
  matricula: Set<string>
  ingresos: boolean
  loadedAt: number
}

const PLANTEL_SET = new Set(PLANTELES_LIST.map(normalizePlantel))
const schemaCache = new Map<string, ControlEscolarSchema>()
const centralSchemaCache = new Map<string, { columns: Set<string>; loadedAt: number }>()
const SCHEMA_CACHE_MS = 1000 * 60 * 5
const MAX_LOCAL_ROWS = 25000
const CENTRAL_CHUNK_SIZE = 600

const normalizeKey = (value: unknown) => String(value || '').trim()
const normalizeText = (value: unknown, max = 255) => normalizeKey(value).slice(0, max)
const normalizeUpper = (value: unknown, max = 255) => normalizeText(value, max).toUpperCase()
const normalizeEmail = (value: unknown) => normalizeText(value, 255).toLowerCase()
const normalizePhone = (value: unknown) => normalizeText(value, 40).replace(/[^0-9+()\-\s.]/g, '').slice(0, 40)
const normalizeNullable = (value: unknown, max = 255) => {
  const text = normalizeText(value, max)
  return text || null
}

const sqlLiteral = (value: string) => `'${String(value).replace(/'/g, "''")}'`
const safeAlias = (value: string) => value.replace(/[^A-Za-z0-9_]/g, '')
const col = (alias: string, column: string) => `${alias}.\`${column.replace(/`/g, '``')}\``
const has = (columns: Set<string>, column: string) => columns.has(column)
const expr = (columns: Set<string>, alias: string, column: string, fallback = 'NULL') => has(columns, column) ? col(alias, column) : fallback
const selectAs = (sql: string, alias: string) => `${sql} AS ${safeAlias(alias)}`
const nullIfTrim = (sql: string) => `NULLIF(TRIM(CAST(${sql} AS CHAR)), '')`
const coalesceExpr = (...parts: Array<string | false | null | undefined>) => {
  const clean = parts.filter(Boolean) as string[]
  return clean.length ? `COALESCE(${clean.join(', ')})` : 'NULL'
}
const escapeColumn = (column: string) => `\`${column.replace(/`/g, '``')}\``

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

  const requested = normalizePlantel(requestedAgentId)
  const active = normalizePlantel(user.active_plantel)
  const agentId = requested || active

  if (!agentId || agentId === 'GLOBAL' || !PLANTEL_SET.has(agentId)) {
    throw createError({
      statusCode: 400,
      message: 'Selecciona un plantel específico en el selector lateral para usar Control Escolar.'
    })
  }

  assertControlEscolarDynamicBridge(agentId)

  return { user, agentId }
}

export const listControlEscolarPlanteles = async (event: any) => {
  const user = await getTrustedAuthUser(event)

  const allowedPlanteles = [...PLANTELES_LIST]

  const activePlantel = normalizePlantel(user.active_plantel)
  const selectedPlantel = activePlantel && activePlantel !== 'GLOBAL' && allowedPlanteles.includes(activePlantel)
    ? activePlantel
    : ''

  return {
    user,
    activePlantel: selectedPlantel,
    planteles: allowedPlanteles.map((plantel) => ({
      agentId: plantel,
      plantel,
      label: plantel,
      selected: selectedPlantel === plantel
    }))
  }
}

const localTableExists = async (tableName: string) => {
  const rows = await query<any[]>(`SHOW TABLES LIKE ?`, [tableName])
  return rows.length > 0
}

const localColumns = async (tableName: string) => {
  const rows = await query<TableColumn[]>(`SHOW COLUMNS FROM ${escapeColumn(tableName)}`)
  return new Set(rows.map((row) => row.Field))
}

const getCentralMatriculaColumns = async () => {
  const cached = centralSchemaCache.get('matricula')
  if (cached && Date.now() - cached.loadedAt < SCHEMA_CACHE_MS) return cached.columns

  const tableRows = await controlEscolarCentralQuery<any[]>(`SHOW TABLES LIKE 'matricula'`)
  if (!tableRows.length) {
    throw createError({
      statusCode: 500,
      message: 'La tabla matricula no existe en la base MySQL centralizada de Control Escolar.'
    })
  }

  const rows = await controlEscolarCentralQuery<TableColumn[]>(`SHOW COLUMNS FROM \`matricula\``)
  const columns = new Set(rows.map((row) => row.Field))
  if (!columns.has('matricula')) {
    throw createError({
      statusCode: 500,
      message: 'La tabla centralizada matricula no tiene columna matricula para unir contra base.'
    })
  }

  centralSchemaCache.set('matricula', { columns, loadedAt: Date.now() })
  return columns
}

export const getControlEscolarSchema = async (agentId: string): Promise<ControlEscolarSchema> => {
  const cacheKey = normalizePlantel(agentId)
  const cached = schemaCache.get(cacheKey)
  if (cached && Date.now() - cached.loadedAt < SCHEMA_CACHE_MS) return cached

  const baseExists = await localTableExists('base')
  if (!baseExists) {
    throw createError({ statusCode: 500, message: 'La tabla base no existe en el plantel seleccionado.' })
  }

  const [baseColumns, matriculaColumns, ingresosExists] = await Promise.all([
    localColumns('base'),
    getCentralMatriculaColumns(),
    localTableExists('ingresos')
  ])

  if (!baseColumns.has('matricula')) {
    throw createError({ statusCode: 500, message: 'La tabla base no tiene columna matricula.' })
  }

  const schema = { base: baseColumns, matricula: matriculaColumns, ingresos: ingresosExists, loadedAt: Date.now() }
  schemaCache.set(cacheKey, schema)
  return schema
}

const buildLocalBaseSelect = (agentId: string, baseColumns: Set<string>) => {
  const baseNombreCompleto = has(baseColumns, 'nombreCompleto')
    ? nullIfTrim(col('b', 'nombreCompleto'))
    : `NULLIF(TRIM(CONCAT_WS(' ', ${expr(baseColumns, 'b', 'apellidoPaterno')}, ${expr(baseColumns, 'b', 'apellidoMaterno')}, ${expr(baseColumns, 'b', 'nombres')})), '')`
  const updatedAt = coalesceExpr(
    expr(baseColumns, 'b', 'updated_at'),
    expr(baseColumns, 'b', 'updatedAt'),
    expr(baseColumns, 'b', 'fecha_actualizacion')
  )

  return [
    selectAs(sqlLiteral(agentId), 'agentId'),
    selectAs(col('b', 'matricula'), 'matricula'),
    selectAs(col('b', 'matricula'), 'studentId'),
    selectAs(coalesceExpr(nullIfTrim(expr(baseColumns, 'b', 'plantel')), sqlLiteral(agentId)), 'basePlantel'),
    selectAs(expr(baseColumns, 'b', 'nombres'), 'baseNombres'),
    selectAs(expr(baseColumns, 'b', 'apellidoPaterno'), 'baseApellidoPaterno'),
    selectAs(expr(baseColumns, 'b', 'apellidoMaterno'), 'baseApellidoMaterno'),
    selectAs(baseNombreCompleto, 'baseNombreCompleto'),
    selectAs(expr(baseColumns, 'b', 'curp'), 'baseCurp'),
    selectAs(expr(baseColumns, 'b', 'correo'), 'baseCorreo'),
    selectAs(expr(baseColumns, 'b', 'telefono'), 'baseTelefono'),
    selectAs(expr(baseColumns, 'b', 'grado'), 'baseGrado'),
    selectAs(expr(baseColumns, 'b', 'grupo'), 'baseGrupo'),
    selectAs(expr(baseColumns, 'b', 'nivel'), 'baseNivel'),
    selectAs(expr(baseColumns, 'b', 'interno'), 'baseInterno'),
    selectAs(expr(baseColumns, 'b', 'estatus', sqlLiteral('Activo')), 'baseEstatus'),
    selectAs(expr(baseColumns, 'b', 'Nombre del padre o tutor'), 'baseGuardian'),
    selectAs(expr(baseColumns, 'b', 'direccion'), 'baseDireccion'),
    selectAs(expr(baseColumns, 'b', 'domicilio'), 'baseDomicilio'),
    selectAs(updatedAt, 'baseUpdatedAt')
  ]
}

const buildLocalBaseWhere = (schema: ControlEscolarSchema) => {
  const where: string[] = []
  if (schema.ingresos) {
    where.push(`EXISTS (SELECT 1 FROM ingresos i WHERE i.matricula = b.matricula AND i.estatus = 'Activo')`)
  }
  where.push(`${expr(schema.base, 'b', 'estatus', sqlLiteral('Activo'))} = 'Activo'`)
  return where.join(' AND ')
}

const fetchLocalBaseRows = async (agentId: string, schema: ControlEscolarSchema) => {
  const fields = buildLocalBaseSelect(agentId, schema.base)
  const whereSql = buildLocalBaseWhere(schema)
  return await query<any[]>(`
    SELECT ${fields.join(',\n      ')}
    FROM base b
    WHERE ${whereSql}
    ORDER BY b.matricula ASC
    LIMIT ${MAX_LOCAL_ROWS + 1}
  `)
}

const centralSelectColumns = (schema: ControlEscolarSchema) => {
  const wanted = [
    'matricula',
    'plantel',
    'grado',
    'grupo',
    'nivel',
    'nombres',
    'apellido_paterno',
    'apellido_materno',
    'curp',
    'email_padre',
    'email_madre',
    'telefono_padre',
    'telefono_madre',
    'interno',
    'baja',
    'motivo_baja',
    'categoria_baja',
    'seguimiento_baja',
    'nombre_padre',
    'apellido_paterno_padre',
    'apellido_materno_padre',
    'nombre_madre',
    'apellido_paterno_madre',
    'apellido_materno_madre',
    'servicio',
    'direccion',
    'domicilio',
    'calle',
    'foto',
    'updated_at',
    'updatedAt',
    'fecha_actualizacion',
    'created_at'
  ]

  return wanted.filter((column) => schema.matricula.has(column))
}

const fetchMatriculaOverlayMap = async (matriculas: string[], schema: ControlEscolarSchema) => {
  const unique = Array.from(new Set(matriculas.map((matricula) => normalizeText(matricula, 64)).filter(Boolean)))
  const result = new Map<string, any>()
  if (!unique.length) return result

  const columns = centralSelectColumns(schema)
  if (!columns.includes('matricula')) columns.unshift('matricula')
  const selectSql = columns.map(escapeColumn).join(', ')

  for (let index = 0; index < unique.length; index += CENTRAL_CHUNK_SIZE) {
    const chunk = unique.slice(index, index + CENTRAL_CHUNK_SIZE)
    const placeholders = chunk.map(() => '?').join(', ')
    const rows = await controlEscolarCentralQuery<any[]>(
      `SELECT ${selectSql} FROM \`matricula\` WHERE \`matricula\` IN (${placeholders})`,
      chunk
    )
    rows.forEach((row) => result.set(normalizeText(row.matricula, 64), row))
  }

  return result
}

const truthyBaja = (value: unknown) => {
  const normalized = normalizeText(value).toLowerCase()
  return value === true || value === 1 || ['1', 'si', 'sí', 'true', 'baja'].includes(normalized)
}

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

const firstLower = (...values: unknown[]) => firstText(...values).toLowerCase()
const firstUpper = (...values: unknown[]) => firstText(...values).toUpperCase()

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

const buildMissingFields = (row: any) => {
  const missing: string[] = []
  if (!normalizeKey(row.curp)) missing.push('curp')
  if (!normalizeKey(row.phone) && !normalizeKey(row.telefonoPadre) && !normalizeKey(row.telefonoMadre)) missing.push('teléfono')
  if (!normalizeKey(row.email) && !normalizeKey(row.emailPadre) && !normalizeKey(row.emailMadre)) missing.push('email')
  if (!normalizeKey(row.guardianName) && !normalizeKey(row.fatherName) && !normalizeKey(row.motherName)) missing.push('tutor')
  if (!normalizeKey(row.group)) missing.push('grupo')
  return missing
}

const overlayStudentRow = (agentId: string, base: any, overlay?: any): ControlEscolarStudentRow => {
  const hasOverlay = Boolean(overlay?.matricula)
  const nombres = firstText(overlay?.nombres, base.baseNombres)
  const apellidoPaterno = firstText(overlay?.apellido_paterno, base.baseApellidoPaterno)
  const apellidoMaterno = firstText(overlay?.apellido_materno, base.baseApellidoMaterno)
  const fullName = firstText([apellidoPaterno, apellidoMaterno, nombres].filter(Boolean).join(' '), base.baseNombreCompleto)
  const fatherName = firstText([overlay?.nombre_padre, overlay?.apellido_paterno_padre, overlay?.apellido_materno_padre].map(normalizeText).filter(Boolean).join(' '))
  const motherName = firstText([overlay?.nombre_madre, overlay?.apellido_paterno_madre, overlay?.apellido_materno_madre].map(normalizeText).filter(Boolean).join(' '))
  const updatedAt = firstText(overlay?.updated_at, overlay?.updatedAt, overlay?.fecha_actualizacion, overlay?.created_at, base.baseUpdatedAt)
  const baja = hasOverlay && truthyBaja(overlay?.baja) ? 1 : 0
  const status = baja ? 'Baja' : firstText(base.baseEstatus, 'Activo')

  const normalized: ControlEscolarStudentRow = {
    agentId: normalizePlantel(agentId),
    plantel: firstText(overlay?.plantel, base.basePlantel, agentId),
    basePlantel: firstText(base.basePlantel, agentId),
    studentId: normalizeText(base.studentId || base.matricula),
    matricula: normalizeText(base.matricula),
    fullName,
    nombreCompleto: fullName,
    nombres,
    apellidoPaterno,
    apellidoMaterno,
    curp: firstUpper(overlay?.curp, base.baseCurp).slice(0, 18),
    phone: firstText(overlay?.telefono_padre, base.baseTelefono),
    email: firstLower(overlay?.email_padre, base.baseCorreo),
    status,
    statusSource: hasOverlay ? 'matricula' : 'base',
    baja,
    motivoBaja: normalizeText(overlay?.motivo_baja, 500),
    categoriaBaja: normalizeText(overlay?.categoria_baja),
    seguimientoBaja: normalizeText(overlay?.seguimiento_baja, 500),
    program: firstText(overlay?.servicio, overlay?.nivel, base.baseNivel),
    nivel: firstLower(overlay?.nivel, base.baseNivel),
    grado: firstLower(overlay?.grado, base.baseGrado),
    group: firstText(overlay?.grupo, base.baseGrupo),
    guardianName: firstText(fatherName, motherName, base.baseGuardian),
    fatherName,
    motherName,
    nombrePadre: normalizeText(overlay?.nombre_padre),
    apellidoPaternoPadre: normalizeText(overlay?.apellido_paterno_padre),
    apellidoMaternoPadre: normalizeText(overlay?.apellido_materno_padre),
    nombreMadre: normalizeText(overlay?.nombre_madre),
    apellidoPaternoMadre: normalizeText(overlay?.apellido_paterno_madre),
    apellidoMaternoMadre: normalizeText(overlay?.apellido_materno_madre),
    telefonoPadre: firstText(overlay?.telefono_padre, base.baseTelefono),
    telefonoMadre: normalizeText(overlay?.telefono_madre),
    emailPadre: firstLower(overlay?.email_padre, base.baseCorreo),
    emailMadre: firstLower(overlay?.email_madre, base.baseCorreo),
    interno: firstText(overlay?.interno, base.baseInterno),
    servicio: normalizeText(overlay?.servicio),
    address: firstText(overlay?.direccion, overlay?.domicilio, overlay?.calle, base.baseDireccion, base.baseDomicilio),
    photoUrl: resolvePhotoUrl(overlay?.foto),
    overlayExists: hasOverlay,
    missingFields: [],
    updatedAt: updatedAt ? new Date(updatedAt).toISOString?.() || String(updatedAt) : null
  }

  normalized.missingFields = buildMissingFields(normalized)
  return normalized
}

const compareStudents = (a: ControlEscolarStudentRow, b: ControlEscolarStudentRow) => {
  const statusA = a.status === 'Activo' ? 0 : 1
  const statusB = b.status === 'Activo' ? 0 : 1
  if (statusA !== statusB) return statusA - statusB
  return `${a.grado}|${a.group}|${a.fullName}|${a.matricula}`.localeCompare(`${b.grado}|${b.group}|${b.fullName}|${b.matricula}`, 'es')
}

const fetchAllNormalizedStudents = async (agentId: string) => {
  const schema = await getControlEscolarSchema(agentId)
  const localRows = await fetchLocalBaseRows(agentId, schema)

  if (localRows.length > MAX_LOCAL_ROWS) {
    throw createError({
      statusCode: 413,
      message: `El plantel excede el límite temporal de ${MAX_LOCAL_ROWS} alumnos activos para Control Escolar. Ajusta la consulta antes de editar.`
    })
  }

  const overlayMap = await fetchMatriculaOverlayMap(localRows.map((row) => row.matricula), schema)
  return localRows.map((row) => overlayStudentRow(agentId, row, overlayMap.get(normalizeText(row.matricula, 64)))).sort(compareStudents)
}

const applyFilters = (students: ControlEscolarStudentRow[], filters: any) => {
  let result = students
  const search = normalizeText(filters.search || filters.q || '', 80).toLowerCase()
  if (search) {
    result = result.filter((student) => [
      student.matricula,
      student.fullName,
      student.curp,
      student.email,
      student.phone,
      student.emailPadre,
      student.emailMadre,
      student.telefonoPadre,
      student.telefonoMadre,
      student.guardianName,
      student.nivel,
      student.grado,
      student.group
    ].some((value) => normalizeText(value).toLowerCase().includes(search)))
  }

  const status = normalizeText(filters.status || '')
  if (status && status !== 'all') {
    if (status === 'active') result = result.filter((student) => student.status === 'Activo')
    if (status === 'inactive') result = result.filter((student) => student.status !== 'Activo')
    if (status === 'baja') result = result.filter((student) => student.status === 'Baja')
  }

  const nivel = normalizeText(filters.nivel || filters.program || '').toLowerCase()
  if (nivel && nivel !== 'all') result = result.filter((student) => student.nivel.toLowerCase() === nivel)

  const grado = normalizeText(filters.grado || '').toLowerCase()
  if (grado && grado !== 'all') result = result.filter((student) => student.grado.toLowerCase() === grado)

  const grupo = normalizeText(filters.group || filters.grupo || '')
  if (grupo && grupo !== 'all') result = result.filter((student) => student.group === grupo)

  const missing = normalizeText(filters.missing || '')
  if (missing && missing !== 'all') {
    if (missing === 'curp') result = result.filter((student) => student.missingFields.includes('curp'))
    if (missing === 'phone') result = result.filter((student) => student.missingFields.includes('teléfono'))
    if (missing === 'email') result = result.filter((student) => student.missingFields.includes('email'))
    if (missing === 'guardian') result = result.filter((student) => student.missingFields.includes('tutor'))
    if (missing === 'overlay') result = result.filter((student) => !student.overlayExists)
  }

  const recent = normalizeText(filters.recent || '')
  if (recent && recent !== 'all') {
    const days = recent === '7d' ? 7 : recent === '30d' ? 30 : recent === '90d' ? 90 : 0
    if (days > 0) {
      const threshold = Date.now() - days * 24 * 60 * 60 * 1000
      result = result.filter((student) => student.updatedAt && new Date(student.updatedAt).getTime() >= threshold)
    }
  }

  return result
}

const buildCatalogs = (students: ControlEscolarStudentRow[]) => ({
  niveles: Array.from(new Set(students.map((student) => student.nivel).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')),
  grados: Array.from(new Set(students.map((student) => student.grado).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')),
  grupos: Array.from(new Set(students.map((student) => student.group).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'))
})

export const fetchControlEscolarStudents = async (agentId: string, filters: any) => {
  const page = Math.max(1, Number(filters.page || 1) || 1)
  const limit = Math.min(100, Math.max(10, Number(filters.limit || 25) || 25))
  const allStudents = await fetchAllNormalizedStudents(agentId)
  const filtered = applyFilters(allStudents, filters)
  const offset = (page - 1) * limit

  return {
    data: filtered.slice(offset, offset + limit),
    pagination: {
      page,
      limit,
      total: filtered.length,
      pages: Math.max(1, Math.ceil(filtered.length / limit))
    },
    catalogs: buildCatalogs(allStudents)
  }
}

export const fetchControlEscolarKpis = async (agentId: string) => {
  const students = await fetchAllNormalizedStudents(agentId)
  const byNivel = new Map<string, number>()
  const byGrupo = new Map<string, number>()

  students.forEach((student) => {
    if (student.nivel) byNivel.set(student.nivel, (byNivel.get(student.nivel) || 0) + 1)
    const groupKey = [student.grado, student.group].filter(Boolean).join(' ') || student.group
    if (groupKey) byGrupo.set(groupKey, (byGrupo.get(groupKey) || 0) + 1)
  })

  const active = students.filter((student) => student.status === 'Activo').length
  const missing = (field: string) => students.filter((student) => student.missingFields.includes(field)).length

  return {
    totalInscritos: students.length,
    activos: active,
    inactivos: students.length - active,
    bajas: students.filter((student) => student.status === 'Baja').length,
    nuevosOverlay: students.filter((student) => !student.overlayExists).length,
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
  const [baseRow] = await query<any[]>(`SELECT matricula, ${expr(schema.base, 'b', 'plantel', sqlLiteral(agentId))} AS plantel FROM base b WHERE b.matricula = ? AND ${expr(schema.base, 'b', 'estatus', sqlLiteral('Activo'))} = 'Activo' LIMIT 1`, [normalizedMatricula])
  if (!baseRow) {
    throw createError({ statusCode: 404, message: 'El alumno no existe como fila activa en base. Control Escolar no crea alumnos locales.' })
  }

  const requestedFields = Object.keys(body || {})
  const rejected = requestedFields.filter((field) => !Object.prototype.hasOwnProperty.call(PATCH_FIELD_COLUMN_MAP, field))
  if (rejected.length) {
    throw createError({ statusCode: 400, message: `Campos no permitidos para Control Escolar: ${rejected.join(', ')}` })
  }

  const editableEntries = Object.entries(body || {})
    .map(([field, value]) => ({ field, column: PATCH_FIELD_COLUMN_MAP[field], value: normalizePatchValue(field, value) }))
    .filter((entry) => entry.column && schema.matricula.has(entry.column))

  if (!editableEntries.length) {
    throw createError({ statusCode: 400, message: 'No hay campos editables disponibles en la tabla centralizada matricula para guardar.' })
  }

  if (editableEntries.some((entry) => entry.field === 'curp' && entry.value && !/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(String(entry.value)))) {
    throw createError({ statusCode: 400, message: 'CURP inválida. Debe tener 18 caracteres con formato oficial.' })
  }

  const [existing] = await controlEscolarCentralQuery<any[]>(`SELECT matricula FROM \`matricula\` WHERE \`matricula\` = ? LIMIT 1`, [normalizedMatricula])
  const auditContext = {
    user: user.email,
    agentId,
    matricula: normalizedMatricula,
    fields: editableEntries.map((entry) => entry.field)
  }

  if (existing) {
    const assignments = editableEntries.map((entry) => `${escapeColumn(entry.column)} = ?`)
    const params = [...editableEntries.map((entry) => entry.value)]
    if (schema.matricula.has('updated_at')) assignments.push('`updated_at` = CURRENT_TIMESTAMP')
    if (schema.matricula.has('updated_by')) {
      assignments.push('`updated_by` = ?')
      params.push(user.email)
    }
    params.push(normalizedMatricula)
    await controlEscolarCentralQuery(`UPDATE \`matricula\` SET ${assignments.join(', ')} WHERE \`matricula\` = ?`, params)
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

    await controlEscolarCentralQuery(
      `INSERT INTO \`matricula\` (${columns.map(escapeColumn).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      values
    )
  }

  // TODO: Wire this into the project audit log if a Control Escolar audit table/pattern is introduced.
  console.info('[Control Escolar] centralized matricula overlay updated', auditContext)

  const result = await fetchControlEscolarStudents(agentId, { search: normalizedMatricula, page: 1, limit: 10 })
  return { success: true, student: result.data.find((student) => student.matricula === normalizedMatricula) || result.data[0] || null }
}

export const runControlEscolar = async <T>(event: any, agentId: string, callback: () => Promise<T>) => {
  event.context.controlEscolarAgentId = agentId
  return await runWithBridgeAgentId(agentId, callback)
}

export const fetchControlEscolarExportRows = async (agentId: string, filters: any) => {
  const allStudents = await fetchAllNormalizedStudents(agentId)
  return applyFilters(allStudents, filters).slice(0, 5000)
}
