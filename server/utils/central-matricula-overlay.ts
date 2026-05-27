import { controlEscolarCentralQuery, getCentralTableColumns } from './control-escolar-central'

const escapeIdentifier = (value: string) => `\`${String(value).replace(/`/g, '``')}\``
const stringifyScalar = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(stringifyScalar).filter(Boolean).join(' / ')
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['label', 'nombre', 'name', 'value', 'servicio', 'descripcion', 'description', 'text', 'title']) {
      const text = stringifyScalar(record[key])
      if (text) return text
    }
    return ''
  }
  return ''
}
const normalizeText = (value: unknown, maxLength = 500) => stringifyScalar(value).trim().slice(0, maxLength)
const normalizeUpper = (value: unknown, maxLength = 500) => normalizeText(value, maxLength).toUpperCase()
const normalizeLower = (value: unknown, maxLength = 500) => normalizeText(value, maxLength).toLowerCase()
const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}
const firstLower = (...values: unknown[]) => {
  const text = firstText(...values)
  return text ? text.toLowerCase() : ''
}
const firstUpper = (...values: unknown[]) => {
  const text = firstText(...values)
  return text ? text.toUpperCase() : ''
}

const MATRICULA_COLUMNS = [
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
  'correo_padre',
  'correo_madre',
  'telefono_padre',
  'telefono_madre',
  'celular_padre',
  'celular_madre',
  'interno',
  'baja',
  'motivo_baja',
  'categoria_baja',
  'seguimiento_baja',
  'nombre_padre',
  'apellido_paterno_padre',
  'apellido_materno_padre',
  'nombre_padre_completo',
  'padre',
  'tutor',
  'padre_tutor',
  'ocupacion_padre',
  'ocupacion_tutor',
  'nombre_madre',
  'apellido_paterno_madre',
  'apellido_materno_madre',
  'nombre_madre_completo',
  'madre',
  'ocupacion_madre',
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

const normalizeCentralMatriculaOverlay = (raw: Record<string, any>) => {
  const padre = firstText(
    [raw.nombre_padre, raw.apellido_paterno_padre, raw.apellido_materno_padre].map((value) => normalizeText(value)).filter(Boolean).join(' '),
    raw.nombre_padre_completo,
    raw.padre,
    raw.tutor,
    raw.padre_tutor
  )
  const madre = firstText(
    [raw.nombre_madre, raw.apellido_paterno_madre, raw.apellido_materno_madre].map((value) => normalizeText(value)).filter(Boolean).join(' '),
    raw.nombre_madre_completo,
    raw.madre
  )
  const apellidoPaterno = normalizeText(raw.apellido_paterno)
  const apellidoMaterno = normalizeText(raw.apellido_materno)
  const nombres = normalizeText(raw.nombres)
  const fullName = firstText([apellidoPaterno, apellidoMaterno, nombres].filter(Boolean).join(' '))

  return {
    source: 'CONTROL_ESCOLAR_MYSQL.matricula',
    overlayExists: true,
    raw,
    student: {
      matricula: normalizeText(raw.matricula, 64),
      plantel: normalizeUpper(raw.plantel, 40),
      nivel: normalizeLower(raw.nivel, 120),
      grado: normalizeLower(raw.grado, 80),
      grupo: normalizeText(raw.grupo, 40),
      nombres,
      apellidoPaterno,
      apellidoMaterno,
      nombreCompleto: fullName,
      fullName,
      curp: normalizeUpper(raw.curp, 18),
      telefono: firstText(raw.telefono_padre, raw.celular_padre, raw.telefono_madre, raw.celular_madre),
      correo: firstLower(raw.email_padre, raw.correo_padre, raw.email_madre, raw.correo_madre),
      padre,
      madre,
      telefonoPadre: firstText(raw.telefono_padre, raw.celular_padre),
      telefonoMadre: firstText(raw.telefono_madre, raw.celular_madre),
      emailPadre: firstLower(raw.email_padre, raw.correo_padre),
      emailMadre: firstLower(raw.email_madre, raw.correo_madre),
      nombrePadre: normalizeText(raw.nombre_padre),
      apellidoPaternoPadre: normalizeText(raw.apellido_paterno_padre),
      apellidoMaternoPadre: normalizeText(raw.apellido_materno_padre),
      nombrePadreCompleto: normalizeText(raw.nombre_padre_completo),
      ocupacionPadre: firstText(raw.ocupacion_padre, raw.ocupacion_tutor),
      nombreMadre: normalizeText(raw.nombre_madre),
      apellidoPaternoMadre: normalizeText(raw.apellido_paterno_madre),
      apellidoMaternoMadre: normalizeText(raw.apellido_materno_madre),
      nombreMadreCompleto: normalizeText(raw.nombre_madre_completo),
      ocupacionMadre: normalizeText(raw.ocupacion_madre),
      interno: normalizeText(raw.interno),
      servicio: normalizeText(raw.servicio),
      direccion: firstText(raw.direccion, raw.domicilio, raw.calle),
      updatedAt: firstText(raw.updated_at, raw.updatedAt, raw.fecha_actualizacion, raw.created_at)
    }
  }
}

const loadCentralMatriculaColumns = async () => {
  const columns = await getCentralTableColumns('matricula')
  if (!columns.has('matricula')) {
    throw createError({ statusCode: 500, message: 'La tabla matricula no tiene columna matricula.' })
  }
  const selected = MATRICULA_COLUMNS.filter((column) => columns.has(column))
  if (!selected.includes('matricula')) selected.unshift('matricula')
  return selected
}

export const fetchCentralMatriculaOverlay = async (matricula: string) => {
  const normalizedMatricula = normalizeText(matricula, 64)
  if (!normalizedMatricula) {
    throw createError({ statusCode: 400, message: 'Matrícula requerida.' })
  }

  const selected = await loadCentralMatriculaColumns()
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT ${selected.map(escapeIdentifier).join(', ')} FROM \`matricula\` WHERE \`matricula\` = ? LIMIT 1`,
    [normalizedMatricula]
  )
  const raw = rows[0] || null
  return raw ? normalizeCentralMatriculaOverlay(raw) : null
}

export const fetchCentralMatriculaOverlays = async (matriculas: string[]) => {
  const normalized = Array.from(new Set(
    matriculas
      .map((value) => normalizeText(value, 64))
      .filter(Boolean)
  ))
  if (!normalized.length) return new Map<string, any>()

  const selected = await loadCentralMatriculaColumns()
  const result = new Map<string, any>()
  const batchSize = 250

  for (let index = 0; index < normalized.length; index += batchSize) {
    const batch = normalized.slice(index, index + batchSize)
    const placeholders = batch.map(() => '?').join(', ')
    const rows = await controlEscolarCentralQuery<any[]>(
      `SELECT ${selected.map(escapeIdentifier).join(', ')} FROM \`matricula\` WHERE \`matricula\` IN (${placeholders})`,
      batch
    )
    for (const raw of rows) {
      const overlay = normalizeCentralMatriculaOverlay(raw)
      const key = normalizeText(overlay.student?.matricula, 64).toUpperCase()
      if (key) result.set(key, overlay)
    }
  }

  return result
}
