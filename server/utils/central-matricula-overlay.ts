import { controlEscolarCentralQuery, getCentralTableColumns } from './control-escolar-central'
import { toNameDisplayCase } from '../../shared/utils/nameCase'

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
const normalizeNameText = (value: unknown, maxLength = 500) => toNameDisplayCase(normalizeText(value, maxLength)).slice(0, maxLength)
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
  'nombre_verificado',
  'nombre_completo_alumno',
  'fecha_nacimiento',
  'lugar_nacimiento',
  'sexo',
  'talla',
  'peso',
  'tipo_sangre',
  'alergias',
  'certificado_medico_adjunto',
  'certificado_vacunacion_covid19_adjunto',
  'acta_nacimiento_adjunta',
  'curp_alumno_adjunto',
  'certificado_primaria_adjunto',
  'boleta_sexto_primaria_adjunta',
  'boleta_primero_secundaria_adjunta',
  'boleta_segundo_secundaria_adjunta',
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
  'lugar_trabajo_padre',
  'puesto_padre',
  'estado_civil_padre',
  'fecha_nacimiento_padre',
  'ine_padre',
  'curp_padre',
  'nombre_padre_completo',
  'padre',
  'tutor',
  'padre_tutor',
  'ocupacion_padre',
  'ocupacion_tutor',
  'nombre_madre',
  'apellido_paterno_madre',
  'apellido_materno_madre',
  'lugar_trabajo_madre',
  'puesto_madre',
  'estado_civil_madre',
  'fecha_nacimiento_madre',
  'ine_madre',
  'curp_madre',
  'nombre_madre_completo',
  'madre',
  'ocupacion_madre',
  'servicio',
  'servicios',
  'direccion',
  'domicilio',
  'calle',
  'domicilio_calle',
  'domicilio_num',
  'domicio_num',
  'domicilio_colonia',
  'domicilio_cp',
  'domicilio_municipio',
  'servicio_notas',
  'foto',
  'updated_at',
  'updatedAt',
  'fecha_actualizacion',
  'created_at'
]

const MATRICULA_LARGE_VALUE_COLUMNS = new Set([
  'foto',
  'certificado_medico_adjunto',
  'certificado_vacunacion_covid19_adjunto',
  'acta_nacimiento_adjunta',
  'curp_alumno_adjunto',
  'certificado_primaria_adjunto',
  'boleta_sexto_primaria_adjunta',
  'boleta_primero_secundaria_adjunta',
  'boleta_segundo_secundaria_adjunta'
])

const PRESENCE_ALIAS_PREFIX = '__aurora_has_'
const presenceAlias = (column: string) => `${PRESENCE_ALIAS_PREFIX}${column}`

const hasStoredValue = (value: unknown) => {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'boolean') return value
  if (ArrayBuffer.isView(value)) return value.byteLength > 0
  if (value instanceof ArrayBuffer) return value.byteLength > 0
  return true
}

const sanitizeCentralMatriculaRaw = (raw: Record<string, any>) => {
  const sanitized: Record<string, any> = {}

  for (const column of MATRICULA_COLUMNS) {
    if (MATRICULA_LARGE_VALUE_COLUMNS.has(column)) {
      const exists = hasStoredValue(raw[presenceAlias(column)]) || hasStoredValue(raw[column])
      sanitized[column] = exists ? '1' : ''
      continue
    }

    if (Object.prototype.hasOwnProperty.call(raw, column)) sanitized[column] = raw[column]
  }

  return sanitized
}

const normalizeCentralMatriculaOverlay = (
  raw: Record<string, any>,
  options: { includeRaw?: boolean } = {}
) => {
  raw = sanitizeCentralMatriculaRaw(raw)
  const padre = firstText(
    [raw.nombre_padre, raw.apellido_paterno_padre, raw.apellido_materno_padre].map((value) => normalizeNameText(value)).filter(Boolean).join(' '),
    raw.nombre_padre_completo,
    raw.padre,
    raw.tutor,
    raw.padre_tutor
  )
  const madre = firstText(
    [raw.nombre_madre, raw.apellido_paterno_madre, raw.apellido_materno_madre].map((value) => normalizeNameText(value)).filter(Boolean).join(' '),
    raw.nombre_madre_completo,
    raw.madre
  )
  const apellidoPaterno = normalizeNameText(raw.apellido_paterno)
  const apellidoMaterno = normalizeNameText(raw.apellido_materno)
  const nombres = normalizeNameText(raw.nombres)
  const fullName = normalizeNameText(firstText([apellidoPaterno, apellidoMaterno, nombres].filter(Boolean).join(' ')))

  return {
    source: 'CONTROL_ESCOLAR_MYSQL.matricula',
    overlayExists: true,
    ...(options.includeRaw === false ? {} : { raw }),
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
      nombreVerificado: normalizeNameText(raw.nombre_verificado),
      nombreCompletoAlumno: normalizeNameText(raw.nombre_completo_alumno),
      fechaNacimiento: normalizeText(raw.fecha_nacimiento),
      lugarNacimiento: normalizeText(raw.lugar_nacimiento),
      sexo: normalizeText(raw.sexo),
      talla: normalizeText(raw.talla),
      peso: normalizeText(raw.peso),
      tipoSangre: normalizeText(raw.tipo_sangre),
      alergias: normalizeText(raw.alergias),
      foto: normalizeText(raw.foto),
      certificadoMedicoAdjunto: normalizeText(raw.certificado_medico_adjunto),
      certificadoVacunacionCovid19Adjunto: normalizeText(raw.certificado_vacunacion_covid19_adjunto),
      actaNacimientoAdjunta: normalizeText(raw.acta_nacimiento_adjunta),
      curpAlumnoAdjunto: normalizeText(raw.curp_alumno_adjunto),
      certificadoPrimariaAdjunto: normalizeText(raw.certificado_primaria_adjunto),
      boletaSextoPrimariaAdjunta: normalizeText(raw.boleta_sexto_primaria_adjunta),
      boletaPrimeroSecundariaAdjunta: normalizeText(raw.boleta_primero_secundaria_adjunta),
      boletaSegundoSecundariaAdjunta: normalizeText(raw.boleta_segundo_secundaria_adjunta),
      telefono: firstText(raw.telefono_padre, raw.celular_padre, raw.telefono_madre, raw.celular_madre),
      correo: firstLower(raw.email_padre, raw.correo_padre, raw.email_madre, raw.correo_madre),
      padre,
      madre,
      telefonoPadre: firstText(raw.telefono_padre, raw.celular_padre),
      telefonoMadre: firstText(raw.telefono_madre, raw.celular_madre),
      emailPadre: firstLower(raw.email_padre, raw.correo_padre),
      emailMadre: firstLower(raw.email_madre, raw.correo_madre),
      nombrePadre: normalizeNameText(raw.nombre_padre),
      apellidoPaternoPadre: normalizeNameText(raw.apellido_paterno_padre),
      apellidoMaternoPadre: normalizeNameText(raw.apellido_materno_padre),
      nombrePadreCompleto: normalizeNameText(raw.nombre_padre_completo),
      ocupacionPadre: firstText(raw.ocupacion_padre, raw.ocupacion_tutor),
      lugarTrabajoPadre: normalizeText(raw.lugar_trabajo_padre),
      puestoPadre: normalizeText(raw.puesto_padre),
      estadoCivilPadre: normalizeText(raw.estado_civil_padre),
      fechaNacimientoPadre: normalizeText(raw.fecha_nacimiento_padre),
      inePadre: normalizeText(raw.ine_padre),
      curpPadre: normalizeText(raw.curp_padre),
      nombreMadre: normalizeNameText(raw.nombre_madre),
      apellidoPaternoMadre: normalizeNameText(raw.apellido_paterno_madre),
      apellidoMaternoMadre: normalizeNameText(raw.apellido_materno_madre),
      nombreMadreCompleto: normalizeNameText(raw.nombre_madre_completo),
      ocupacionMadre: normalizeText(raw.ocupacion_madre),
      lugarTrabajoMadre: normalizeText(raw.lugar_trabajo_madre),
      puestoMadre: normalizeText(raw.puesto_madre),
      estadoCivilMadre: normalizeText(raw.estado_civil_madre),
      fechaNacimientoMadre: normalizeText(raw.fecha_nacimiento_madre),
      ineMadre: normalizeText(raw.ine_madre),
      curpMadre: normalizeText(raw.curp_madre),
      interno: normalizeText(raw.interno),
      servicio: normalizeText(raw.servicio || raw.servicios),
      servicios: normalizeText(raw.servicio || raw.servicios),
      direccion: firstText(raw.direccion, raw.domicilio, raw.calle),
      domicilioCalle: normalizeText(raw.domicilio_calle),
      domicilioNumero: normalizeText(raw.domicilio_num || raw.domicio_num),
      domicilioNum: normalizeText(raw.domicilio_num || raw.domicio_num),
      domicioNum: normalizeText(raw.domicio_num || raw.domicilio_num),
      domicilioColonia: normalizeText(raw.domicilio_colonia),
      domicilioCp: normalizeText(raw.domicilio_cp),
      domicilioMunicipio: normalizeText(raw.domicilio_municipio),
      servicioNotas: normalizeText(raw.servicio_notas),
      updatedAt: firstText(raw.updated_at, raw.updatedAt, raw.fecha_actualizacion, raw.created_at)
    }
  }
}

const loadCentralMatriculaSelectExpressions = async () => {
  const columns = await getCentralTableColumns('matricula')
  if (!columns.has('matricula')) {
    throw createError({ statusCode: 500, message: 'La tabla matricula no tiene columna matricula.' })
  }

  return MATRICULA_COLUMNS
    .filter((column) => columns.has(column))
    .map((column) => {
      if (!MATRICULA_LARGE_VALUE_COLUMNS.has(column)) return escapeIdentifier(column)

      const identifier = escapeIdentifier(column)
      const alias = escapeIdentifier(presenceAlias(column))
      return `CASE WHEN ${identifier} IS NULL OR OCTET_LENGTH(${identifier}) = 0 THEN 0 ELSE 1 END AS ${alias}`
    })
}

export const fetchCentralMatriculaOverlay = async (matricula: string) => {
  const normalizedMatricula = normalizeText(matricula, 64)
  if (!normalizedMatricula) {
    throw createError({ statusCode: 400, message: 'Matrícula requerida.' })
  }

  const selectExpressions = await loadCentralMatriculaSelectExpressions()
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT ${selectExpressions.join(', ')} FROM \`matricula\` WHERE UPPER(TRIM(\`matricula\`)) = ? LIMIT 1`,
    [normalizedMatricula.toUpperCase()]
  )
  const raw = rows[0] || null
  return raw ? normalizeCentralMatriculaOverlay(raw, { includeRaw: true }) : null
}

export const fetchCentralMatriculaOverlays = async (matriculas: string[]) => {
  const normalized = Array.from(new Set(
    matriculas
      .map((value) => normalizeText(value, 64))
      .filter(Boolean)
  ))
  if (!normalized.length) return new Map<string, any>()

  const selectExpressions = await loadCentralMatriculaSelectExpressions()
  const result = new Map<string, any>()
  const batchSize = 250

  for (let index = 0; index < normalized.length; index += batchSize) {
    const batch = normalized.slice(index, index + batchSize)
    const placeholders = batch.map(() => '?').join(', ')
    const rows = await controlEscolarCentralQuery<any[]>(
      `SELECT ${selectExpressions.join(', ')} FROM \`matricula\` WHERE UPPER(TRIM(\`matricula\`)) IN (${placeholders})`,
      batch.map((matricula) => String(matricula || '').toUpperCase())
    )
    for (const raw of rows) {
      // Bulk financial enrichment only needs the normalized student payload.
      // Keeping a second `raw` copy for every matrícula doubles retained memory
      // and is unnecessary for list screens.
      const overlay = normalizeCentralMatriculaOverlay(raw, { includeRaw: false })
      const key = normalizeText(overlay.student?.matricula, 64).toUpperCase()
      if (key) result.set(key, overlay)
    }
  }

  return result
}
