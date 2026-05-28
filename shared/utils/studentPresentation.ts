import { resolveNivelEscolar } from './grado'
import { studentGroupIconUrl } from './studentGroupIcons'

export const formatMoney = (value: unknown) => Number(value || 0).toFixed(2)

export const normalizeStudentMatricula = (value: unknown) => String(value || '').trim().toUpperCase()
export const photoStorageKey = (matricula: unknown) => `foto_${normalizeStudentMatricula(matricula)}`

export const normalizeCurpValue = (value: unknown): string => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, '')
  .slice(0, 18)

export const inferMexicanCurpIdentity = (value: unknown) => {
  const curp = normalizeCurpValue(value)
  const match = curp.match(/^[A-Z]{4}(\d{2})(\d{2})(\d{2})([HM])[A-Z]{5}[A-Z0-9]\d$/)
  if (!match) {
    return {
      curp,
      valid: false,
      fechaNacimiento: '',
      sexo: '',
      sexoCorto: '',
    }
  }

  const [, yy, mm, dd, sexoCorto] = match
  const month = Number(mm)
  const day = Number(dd)
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { curp, valid: false, fechaNacimiento: '', sexo: '', sexoCorto: '' }
  }

  const currentYear = new Date().getFullYear()
  const currentCentury = Math.floor(currentYear / 100) * 100
  const currentTwoDigitYear = currentYear % 100
  const year = Number(yy) <= currentTwoDigitYear ? currentCentury + Number(yy) : currentCentury - 100 + Number(yy)
  const date = new Date(Date.UTC(year, month - 1, day))
  const validDate = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  if (!validDate) {
    return { curp, valid: false, fechaNacimiento: '', sexo: '', sexoCorto: '' }
  }

  return {
    curp,
    valid: true,
    fechaNacimiento: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    sexo: sexoCorto === 'H' ? 'Masculino' : 'Femenino',
    sexoCorto,
  }
}

export const sectionFilterKey = (id: unknown) => `section:${Number(id)}`
export const isSectionFilter = (filter: unknown) => String(filter || '').startsWith('section:')
export const sectionIdFromFilter = (filter: unknown) => Number(String(filter || '').split(':')[1] || 0)
export const normalizeSectionIds = (sections: Array<{ id?: unknown }> = []) => sections.map(section => Number(section.id)).filter(Boolean)
export const studentHasSection = (student: any, sectionId: unknown) => normalizeSectionIds(student?.customSections || []).includes(Number(sectionId))
export const visibleStudentSections = (student: any) => (student?.customSections || []).slice(0, 1)
export const hiddenStudentSectionsCount = (student: any) => Math.max(0, (student?.customSections || []).length - visibleStudentSections(student).length)
export const sectionBadgeTitle = (student: any) => (student?.customSections || []).map((section: any) => section.name).join(' · ')

export const normalizeGradeValue = (value: unknown = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const GRADE_NUMBER_MAP: Record<string, number> = {
  primero: 1,
  primer: 1,
  '1ro': 1,
  '1ero': 1,
  segundo: 2,
  '2do': 2,
  tercero: 3,
  '3ro': 3,
  cuarto: 4,
  '4to': 4,
  quinto: 5,
  '5to': 5,
  sexto: 6,
  '6to': 6
}

const GRADE_PALETTES: Record<number, { accent: string; soft: string; border: string }> = {
  1: { accent: '#6aa957', soft: '#edf7e8', border: '#d6e8ca' },
  2: { accent: '#3e9b8c', soft: '#e7f7f3', border: '#c8e7df' },
  3: { accent: '#4f7fd1', soft: '#ebf2ff', border: '#d4e0fb' },
  4: { accent: '#7b67c7', soft: '#f1edff', border: '#ddd5fa' },
  5: { accent: '#c6753e', soft: '#fff2e8', border: '#f0dbc9' },
  6: { accent: '#cc607f', soft: '#fff0f4', border: '#f2d1da' },
  0: { accent: '#7b8798', soft: '#f5f7fa', border: '#e2e8f0' }
}

export const gradeNumberValue = (grado: unknown) => {
  const normalized = normalizeGradeValue(grado)
  if (!normalized || normalized === 'null') return 0

  const direct = normalized.match(/\d+/)?.[0]
  if (direct) {
    const parsed = Number(direct)
    if (parsed >= 1 && parsed <= 6) return parsed
  }

  const mapped = Object.entries(GRADE_NUMBER_MAP).find(([key]) => normalized.includes(key))
  return mapped ? mapped[1] : 0
}

export const gradeVisualNumber = (student: any) => {
  const number = gradeNumberValue(student?.grado)
  if (number) return String(number)
  const fallback = String(student?.grado || '').trim()
  return fallback ? fallback.slice(0, 1).toUpperCase() : '•'
}

export const gradePalette = (student: any) => GRADE_PALETTES[gradeNumberValue(student?.grado)] || GRADE_PALETTES[0]
export const gradeAccentStyle = (student: any) => {
  const palette = gradePalette(student)
  return {
    '--grade-accent': palette.accent,
    '--grade-soft': palette.soft,
    '--grade-border': palette.border
  }
}


export const studentNivelLabel = (student: any) => {
  const nivel = resolveNivelEscolar(student)
  return nivel || 'Preescolar'
}

export const gradeVisualTitle = (student: any) => {
  const number = gradeNumberValue(student?.grado)
  const grado = String(student?.grado || '').trim()
  return number ? `Grado ${number}` : (grado || 'Sin grado')
}

export const studentGroupLabel = (student: any) => {
  const value = String(student?.grupo || '').replaceAll('"', '').trim()
  if (!value || value.toLowerCase() === 'null') return ''
  return value
}


export const studentGroupIconStyle = (student: any) => {
  const url = studentGroupIconUrl(studentGroupLabel(student))
  return url ? { '--student-group-icon-mask': `url("${url}")` } : {}
}

export const studentPresentationStyle = (student: any) => ({
  ...gradeAccentStyle(student),
  ...studentGroupIconStyle(student)
})

export const normalizeEnrollmentConceptId = (value: unknown) => {
  const raw = String(value ?? '').trim()
  if (!raw) return ''

  return /^\d+$/.test(raw) ? String(Number(raw)) : ''
}

export const normalizeEnrollmentConceptIds = (values: unknown): string[] => {
  if (values === null || values === undefined) return []

  if (Array.isArray(values)) return values.flatMap(normalizeEnrollmentConceptIds)

  if (typeof values === 'object') {
    return Object.values(values as Record<string, unknown>).flatMap(normalizeEnrollmentConceptIds)
  }

  return String(values)
    .split(/[|,;]/)
    .map(normalizeEnrollmentConceptId)
    .filter(Boolean)
}

export const studentHasCurrentEnrollmentConcept = (student: any, enrollmentConcepts: string[] = []) => {
  if (student?.currentEnrollmentConceptMatch === true || student?.inscritoCicloActual === true) return true

  const enrollmentConceptIds = normalizeEnrollmentConceptIds(enrollmentConcepts)
  if (!enrollmentConceptIds.length) return false

  const studentConceptIds = new Set(normalizeEnrollmentConceptIds([
    student?.tipoIngresoEvidence?.targetConceptIds,
    student?.tipoIngresoEvidence?.targetConceptosIds,
    student?.tipoIngresoEvidence?.targetConcepts,
    student?.tipoIngresoEvidence?.targetConceptos,
    student?.conceptoIdsTarget,
    student?.conceptoIdsTargetCiclo,
    student?.conceptoIdsCicloActual,
    student?.conceptoIdsPagados,
    student?.conceptoIdsCargados,
    student?.conceptoIds,
    student?.conceptosIds
  ]))

  if (!studentConceptIds.size) return false
  return enrollmentConceptIds.some(conceptId => studentConceptIds.has(conceptId))
}

export const isStudentEnrolled = (student: any, enrollmentConcepts: string[] = []) => {
  if (student?.estatus !== 'Activo') return false
  return studentHasCurrentEnrollmentConcept(student, enrollmentConcepts)
}

export const statusSecondaryLine = (student: any, enrollmentConcepts: string[] = []) => {
  const parts = []
  parts.push(studentNivelLabel(student))
  const group = studentGroupLabel(student)
  if (group) parts.push(group)
  if (student?.estatus !== 'Activo') return parts[0] || 'Alumno'
  if (!isStudentEnrolled(student, enrollmentConcepts)) return parts.length ? `${parts.join(' · ')} · pendiente` : 'Pendiente de inscripción'
  return parts.join(' · ') || 'Alumno activo'
}

export const parseEnrollmentConcepts = (source: unknown) => {
  const ids: string[] = []
  const explicitConceptIdKeys = new Set([
    'conceptoid',
    'concepto_id',
    'conceptid',
    'concept_id',
    'idconcepto',
    'id_concepto'
  ])
  const conceptNameKeys = new Set([
    'concepto',
    'conceptonombre',
    'concepto_nombre',
    'conceptname',
    'concept_name'
  ])

  const normalizedKey = (key: unknown) => String(key || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

  const pushId = (value: unknown) => {
    const conceptId = normalizeEnrollmentConceptId(value)
    if (conceptId) ids.push(conceptId)
  }

  const traverse = (value: any) => {
    if (!value) return

    if (Array.isArray(value)) {
      value.forEach(traverse)
      return
    }

    if (typeof value !== 'object') return

    const entries = Object.entries(value)
    const hasConceptName = entries.some(([key]) => conceptNameKeys.has(normalizedKey(key)))

    entries.forEach(([key, entryValue]) => {
      const keyName = normalizedKey(key)
      const likelyConceptIdCollection = keyName.includes('concept') || keyName.includes('inscrip')

      if (explicitConceptIdKeys.has(keyName) || (keyName === 'id' && hasConceptName)) {
        pushId(entryValue)
      } else if (likelyConceptIdCollection && typeof entryValue !== 'object') {
        pushId(entryValue)
      } else if (likelyConceptIdCollection && Array.isArray(entryValue)) {
        entryValue.forEach(pushId)
      }

      traverse(entryValue)
    })
  }

  traverse(source)
  return [...new Set(ids)]
}

export const expedienteDisplayText = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  if (Array.isArray(value)) return value.map(expedienteDisplayText).filter(Boolean).join(' / ')
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['label', 'nombre', 'name', 'value', 'servicio', 'descripcion', 'description', 'text', 'title']) {
      const text = expedienteDisplayText(record[key])
      if (text) return text
    }
  }
  return ''
}

export const expedienteFirstText = (...values: unknown[]): string => {
  for (const value of values) {
    const text = expedienteDisplayText(value)
    if (text) return text
  }
  return ''
}

export const validExpedientePhone = (value: unknown): boolean => expedienteDisplayText(value).replace(/\D/g, '').length >= 10

export const validExpedienteFamilyEmail = (value: unknown): boolean => {
  const email = expedienteDisplayText(value).toLowerCase()
  if (!email || email.includes('@casita')) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const expedienteValue = (student: any = {}, ...keys: string[]) => {
  for (const key of keys) {
    const direct = expedienteDisplayText(student?.[key])
    if (direct) return direct
    const snake = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
    const snakeValue = expedienteDisplayText(student?.[snake])
    if (snakeValue) return snakeValue
  }
  return ''
}

export const expedienteParentNameParts = (student: any = {}, type: 'padre' | 'madre' = 'padre') => {
  if (type === 'madre') {
    return {
      nombre: expedienteValue(student, 'nombreMadre'),
      apellidoPaterno: expedienteValue(student, 'apellidoPaternoMadre'),
      apellidoMaterno: expedienteValue(student, 'apellidoMaternoMadre'),
      completo: expedienteFirstText(
        [expedienteValue(student, 'nombreMadre'), expedienteValue(student, 'apellidoPaternoMadre'), expedienteValue(student, 'apellidoMaternoMadre')]
          .filter(Boolean)
          .join(' '),
        expedienteValue(student, 'motherName'),
        expedienteValue(student, 'nombreMadreCompleto'),
        expedienteValue(student, 'madre')
      )
    }
  }

  return {
    nombre: expedienteValue(student, 'nombrePadre'),
    apellidoPaterno: expedienteValue(student, 'apellidoPaternoPadre'),
    apellidoMaterno: expedienteValue(student, 'apellidoMaternoPadre'),
    completo: expedienteFirstText(
      [expedienteValue(student, 'nombrePadre'), expedienteValue(student, 'apellidoPaternoPadre'), expedienteValue(student, 'apellidoMaternoPadre')]
        .filter(Boolean)
        .join(' '),
      expedienteValue(student, 'fatherName'),
      expedienteValue(student, 'nombrePadreCompleto'),
      expedienteValue(student, 'padre'),
      expedienteValue(student, 'tutor'),
      expedienteValue(student, 'padreTutor')
    )
  }
}

export const expedienteParentName = (student: any = {}, type: 'padre' | 'madre' = 'padre'): string => expedienteParentNameParts(student, type).completo

export const expedienteParentPhone = (student: any = {}, type: 'padre' | 'madre' = 'padre'): string => {
  if (type === 'madre') return expedienteFirstText(expedienteValue(student, 'telefonoMadre'), expedienteValue(student, 'celularMadre'))
  return expedienteFirstText(expedienteValue(student, 'telefonoPadre'), expedienteValue(student, 'celularPadre'), expedienteValue(student, 'phone'), expedienteValue(student, 'telefono'))
}

export const expedienteParentEmail = (student: any = {}, type: 'padre' | 'madre' = 'padre'): string => {
  if (type === 'madre') return expedienteFirstText(expedienteValue(student, 'emailMadre'), expedienteValue(student, 'correoMadre'))
  return expedienteFirstText(expedienteValue(student, 'emailPadre'), expedienteValue(student, 'correoPadre'), expedienteValue(student, 'email'), expedienteValue(student, 'correo'))
}

export const isExpedienteParentComplete = (student: any = {}, type: 'padre' | 'madre' = 'padre'): boolean => {
  const parts = expedienteParentNameParts(student, type)
  return Boolean(
    parts.nombre &&
    parts.apellidoPaterno &&
    validExpedientePhone(expedienteParentPhone(student, type)) &&
    validExpedienteFamilyEmail(expedienteParentEmail(student, type))
  )
}

export const CONTROL_ESCOLAR_BASIC_REQUIRED_FIELDS = [
  { key: 'curp', label: 'CURP' },
  { key: 'padreNombre', label: 'Nombre padre' },
  { key: 'padreApellidoPaterno', label: 'Apellido paterno padre' },
  { key: 'padreTelefono', label: 'Teléfono padre' },
  { key: 'padreEmail', label: 'Email padre' },
  { key: 'madreNombre', label: 'Nombre madre' },
  { key: 'madreApellidoPaterno', label: 'Apellido paterno madre' },
  { key: 'madreTelefono', label: 'Teléfono madre' },
  { key: 'madreEmail', label: 'Email madre' },
]

export const CONTROL_ESCOLAR_COMPLETE_REQUIRED_FIELDS = [
  ...CONTROL_ESCOLAR_BASIC_REQUIRED_FIELDS,
  { key: 'apellidoPaternoAlumno', label: 'Apellido paterno alumno' },
  { key: 'apellidoMaternoAlumno', label: 'Apellido materno alumno' },
  { key: 'nombresAlumno', label: 'Nombre(s) alumno' },
  { key: 'fechaNacimiento', label: 'Fecha nacimiento alumno' },
  { key: 'lugarNacimiento', label: 'Lugar nacimiento alumno' },
  { key: 'sexo', label: 'Sexo' },
  { key: 'nivel', label: 'Nivel' },
  { key: 'grado', label: 'Grado' },
  { key: 'grupo', label: 'Grupo' },
  { key: 'servicio', label: 'Servicio' },
  { key: 'padreApellidoMaterno', label: 'Apellido materno padre' },
  { key: 'padreLugarTrabajo', label: 'Lugar trabajo padre' },
  { key: 'padrePuesto', label: 'Puesto padre' },
  { key: 'padreEstadoCivil', label: 'Estado civil padre' },
  { key: 'padreFechaNacimiento', label: 'Fecha nacimiento padre' },
  { key: 'padreIne', label: 'INE padre' },
  { key: 'padreCurp', label: 'CURP padre' },
  { key: 'madreApellidoMaterno', label: 'Apellido materno madre' },
  { key: 'madreLugarTrabajo', label: 'Lugar trabajo madre' },
  { key: 'madrePuesto', label: 'Puesto madre' },
  { key: 'madreEstadoCivil', label: 'Estado civil madre' },
  { key: 'madreFechaNacimiento', label: 'Fecha nacimiento madre' },
  { key: 'madreIne', label: 'INE madre' },
  { key: 'madreCurp', label: 'CURP madre' },
  { key: 'domicilioCalle', label: 'Calle' },
  { key: 'domicilioNumero', label: 'Número' },
  { key: 'domicilioColonia', label: 'Colonia' },
  { key: 'domicilioCp', label: 'Código postal' },
  { key: 'domicilioMunicipio', label: 'Municipio' },
  { key: 'tipoSangre', label: 'Tipo de sangre' },
  { key: 'alergias', label: 'Alergias' },
]

const controlEscolarFieldIsPresent = (student: any = {}, key: string): boolean => {
  const padre = expedienteParentNameParts(student, 'padre')
  const madre = expedienteParentNameParts(student, 'madre')
  const inferredCurp = inferMexicanCurpIdentity(expedienteValue(student, 'curp', 'CURP'))
  const checks: Record<string, () => boolean> = {
    curp: () => Boolean(expedienteDisplayText(expedienteValue(student, 'curp', 'CURP'))),
    padreNombre: () => Boolean(padre.nombre),
    padreApellidoPaterno: () => Boolean(padre.apellidoPaterno),
    padreApellidoMaterno: () => Boolean(padre.apellidoMaterno),
    padreTelefono: () => validExpedientePhone(expedienteParentPhone(student, 'padre')),
    padreEmail: () => validExpedienteFamilyEmail(expedienteParentEmail(student, 'padre')),
    madreNombre: () => Boolean(madre.nombre),
    madreApellidoPaterno: () => Boolean(madre.apellidoPaterno),
    madreApellidoMaterno: () => Boolean(madre.apellidoMaterno),
    madreTelefono: () => validExpedientePhone(expedienteParentPhone(student, 'madre')),
    madreEmail: () => validExpedienteFamilyEmail(expedienteParentEmail(student, 'madre')),
    apellidoPaternoAlumno: () => Boolean(expedienteValue(student, 'apellidoPaterno')),
    apellidoMaternoAlumno: () => Boolean(expedienteValue(student, 'apellidoMaterno')),
    nombresAlumno: () => Boolean(expedienteValue(student, 'nombres')),
    fechaNacimiento: () => Boolean(expedienteValue(student, 'fechaNacimiento')) || Boolean(inferredCurp.fechaNacimiento),
    lugarNacimiento: () => Boolean(expedienteValue(student, 'lugarNacimiento')),
    sexo: () => Boolean(expedienteValue(student, 'sexo', 'genero')) || Boolean(inferredCurp.sexo),
    nivel: () => Boolean(expedienteValue(student, 'nivel')),
    grado: () => Boolean(expedienteValue(student, 'grado')),
    grupo: () => Boolean(expedienteValue(student, 'grupo', 'group')),
    servicio: () => Boolean(expedienteValue(student, 'servicio')),
    padreLugarTrabajo: () => Boolean(expedienteValue(student, 'lugarTrabajoPadre')),
    padrePuesto: () => Boolean(expedienteValue(student, 'puestoPadre')),
    padreEstadoCivil: () => Boolean(expedienteValue(student, 'estadoCivilPadre')),
    padreFechaNacimiento: () => Boolean(expedienteValue(student, 'fechaNacimientoPadre')),
    padreIne: () => Boolean(expedienteValue(student, 'inePadre')),
    padreCurp: () => Boolean(expedienteValue(student, 'curpPadre')),
    madreLugarTrabajo: () => Boolean(expedienteValue(student, 'lugarTrabajoMadre')),
    madrePuesto: () => Boolean(expedienteValue(student, 'puestoMadre')),
    madreEstadoCivil: () => Boolean(expedienteValue(student, 'estadoCivilMadre')),
    madreFechaNacimiento: () => Boolean(expedienteValue(student, 'fechaNacimientoMadre')),
    madreIne: () => Boolean(expedienteValue(student, 'ineMadre')),
    madreCurp: () => Boolean(expedienteValue(student, 'curpMadre')),
    domicilioCalle: () => Boolean(expedienteValue(student, 'domicilioCalle')),
    domicilioNumero: () => Boolean(expedienteValue(student, 'domicilioNumero', 'domicilioNum', 'domicioNum')),
    domicilioColonia: () => Boolean(expedienteValue(student, 'domicilioColonia')),
    domicilioCp: () => Boolean(expedienteValue(student, 'domicilioCp')),
    domicilioMunicipio: () => Boolean(expedienteValue(student, 'domicilioMunicipio')),
    tipoSangre: () => Boolean(expedienteValue(student, 'tipoSangre')),
    alergias: () => Boolean(expedienteValue(student, 'alergias')),
  }
  return Boolean(checks[key]?.())
}

export const resolveControlEscolarMissingFields = (student: any = {}, tier: 'basic' | 'complete' = 'basic'): string[] => {
  const fields = tier === 'complete' ? CONTROL_ESCOLAR_COMPLETE_REQUIRED_FIELDS : CONTROL_ESCOLAR_BASIC_REQUIRED_FIELDS
  return fields.filter(field => !controlEscolarFieldIsPresent(student, field.key)).map(field => field.key)
}

export const resolveControlEscolarCompleteness = (student: any = {}, options: { honorEnrollmentState?: boolean } = {}) => {
  const honorEnrollmentState = options.honorEnrollmentState !== false
  const inProgressScope = !honorEnrollmentState || isStudentInscritoForExpedienteProgress(student)
  const buildTier = (fields: Array<{ key: string; label: string }>, tier: 'basic' | 'complete') => {
    const missingFields = inProgressScope ? resolveControlEscolarMissingFields(student, tier) : fields.map(field => field.key)
    const completed = fields.length - missingFields.length
    const progress = inProgressScope ? Math.max(0, Math.round((completed / Math.max(fields.length, 1)) * 100)) : 0
    return {
      tier,
      label: tier === 'basic' ? 'Expediente básico' : 'Expediente completo',
      progress,
      complete: progress >= 100,
      total: fields.length,
      completed,
      pending: missingFields.length,
      missingFields,
      missingLabels: fields.filter(field => missingFields.includes(field.key)).map(field => field.label),
      summary: !inProgressScope
        ? 'Fuera de inscritos'
        : progress >= 100
          ? 'Completo'
          : missingFields.length === 1
            ? '1 pendiente'
            : `${missingFields.length} pendientes`,
    }
  }
  const basic = buildTier(CONTROL_ESCOLAR_BASIC_REQUIRED_FIELDS, 'basic')
  const complete = buildTier(CONTROL_ESCOLAR_COMPLETE_REQUIRED_FIELDS, 'complete')
  return { basic, complete, inProgressScope }
}

export const isStudentInscritoForExpedienteProgress = (student: any = {}): boolean => {
  const state = expedienteDisplayText(student?.enrollmentState || student?.estadoInscripcion || student?.inscripcionEstado).toLowerCase()
  if (!state) return true
  return state === 'inscrito'
}

export const resolveControlEscolarProgress = (student: any = {}, options: { honorEnrollmentState?: boolean } = {}) => {
  const completeness = resolveControlEscolarCompleteness(student, options)
  return {
    progress: completeness.basic.progress,
    complete: completeness.basic.complete,
    missingFields: completeness.basic.missingFields,
    missingLabels: completeness.basic.missingLabels,
    completenessTiers: completeness,
    inProgressScope: completeness.inProgressScope,
    summary: completeness.basic.summary
  }
}

