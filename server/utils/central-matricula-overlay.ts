import { controlEscolarCentralQuery, getCentralTableColumns } from './control-escolar-central'

const escapeIdentifier = (value: string) => `\`${String(value).replace(/`/g, '``')}\``
const normalizeText = (value: unknown, maxLength = 500) => String(value ?? '').trim().slice(0, maxLength)
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

export const fetchCentralMatriculaOverlay = async (matricula: string) => {
  const normalizedMatricula = normalizeText(matricula, 64)
  if (!normalizedMatricula) {
    throw createError({ statusCode: 400, message: 'Matrícula requerida.' })
  }

  const columns = await getCentralTableColumns('matricula')
  if (!columns.has('matricula')) {
    throw createError({ statusCode: 500, message: 'La tabla matricula no tiene columna matricula.' })
  }

  const selected = MATRICULA_COLUMNS.filter((column) => columns.has(column))
  if (!selected.includes('matricula')) selected.unshift('matricula')

  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT ${selected.map(escapeIdentifier).join(', ')} FROM \`matricula\` WHERE \`matricula\` = ? LIMIT 1`,
    [normalizedMatricula]
  )
  const raw = rows[0] || null
  if (!raw) return null

  const padre = firstText(
    [raw.nombre_padre, raw.apellido_paterno_padre, raw.apellido_materno_padre].map((value) => normalizeText(value)).filter(Boolean).join(' ')
  )
  const madre = firstText(
    [raw.nombre_madre, raw.apellido_paterno_madre, raw.apellido_materno_madre].map((value) => normalizeText(value)).filter(Boolean).join(' ')
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
      telefono: firstText(raw.telefono_padre, raw.telefono_madre),
      correo: firstLower(raw.email_padre, raw.email_madre),
      padre,
      telefonoPadre: normalizeText(raw.telefono_padre),
      telefonoMadre: normalizeText(raw.telefono_madre),
      emailPadre: normalizeLower(raw.email_padre),
      emailMadre: normalizeLower(raw.email_madre),
      nombrePadre: normalizeText(raw.nombre_padre),
      apellidoPaternoPadre: normalizeText(raw.apellido_paterno_padre),
      apellidoMaternoPadre: normalizeText(raw.apellido_materno_padre),
      nombreMadre: normalizeText(raw.nombre_madre),
      apellidoPaternoMadre: normalizeText(raw.apellido_paterno_madre),
      apellidoMaternoMadre: normalizeText(raw.apellido_materno_madre),
      interno: normalizeText(raw.interno),
      servicio: normalizeText(raw.servicio),
      direccion: firstText(raw.direccion, raw.domicilio, raw.calle),
      updatedAt: firstText(raw.updated_at, raw.updatedAt, raw.fecha_actualizacion, raw.created_at)
    }
  }
}
