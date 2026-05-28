import { resolveNivelEscolar } from './grado'
import { studentGroupIconUrl } from './studentGroupIcons'

export const formatMoney = (value: unknown) => Number(value || 0).toFixed(2)

export const normalizeStudentMatricula = (value: unknown) => String(value || '').trim().toUpperCase()
export const photoStorageKey = (matricula: unknown) => `foto_${normalizeStudentMatricula(matricula)}`

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

export const expedienteParentName = (student: any = {}, type: 'padre' | 'madre' = 'padre'): string => {
  if (type === 'madre') {
    return expedienteFirstText(
      [student.nombreMadre, student.apellidoPaternoMadre, student.apellidoMaternoMadre]
        .map(expedienteDisplayText)
        .filter(Boolean)
        .join(' '),
      student.motherName,
      student.nombreMadreCompleto,
      student.madre
    )
  }

  return expedienteFirstText(
    [student.nombrePadre, student.apellidoPaternoPadre, student.apellidoMaternoPadre]
      .map(expedienteDisplayText)
      .filter(Boolean)
      .join(' '),
    student.fatherName,
    student.nombrePadreCompleto,
    student.padre,
    student.tutor,
    student.padreTutor,
    student.padre_tutor
  )
}

export const expedienteParentPhone = (student: any = {}, type: 'padre' | 'madre' = 'padre'): string => {
  if (type === 'madre') return expedienteFirstText(student.telefonoMadre, student.celularMadre)
  return expedienteFirstText(student.telefonoPadre, student.celularPadre, student.phone, student.telefono)
}

export const expedienteParentEmail = (student: any = {}, type: 'padre' | 'madre' = 'padre'): string => {
  if (type === 'madre') return expedienteFirstText(student.emailMadre, student.correoMadre)
  return expedienteFirstText(student.emailPadre, student.correoPadre, student.email, student.correo)
}

export const isExpedienteParentComplete = (student: any = {}, type: 'padre' | 'madre' = 'padre'): boolean => Boolean(
  expedienteParentName(student, type) &&
  validExpedientePhone(expedienteParentPhone(student, type)) &&
  validExpedienteFamilyEmail(expedienteParentEmail(student, type))
)

export const resolveControlEscolarMissingFields = (student: any = {}): string[] => {
  const missing: string[] = []
  if (!expedienteDisplayText(student?.curp || student?.CURP)) missing.push('curp')
  if (!isExpedienteParentComplete(student, 'padre')) missing.push('padre')
  if (!isExpedienteParentComplete(student, 'madre')) missing.push('madre')
  return missing
}

export const isStudentInscritoForExpedienteProgress = (student: any = {}): boolean => {
  const state = expedienteDisplayText(student?.enrollmentState || student?.estadoInscripcion || student?.inscripcionEstado).toLowerCase()
  if (!state) return true
  return state === 'inscrito'
}

export const resolveControlEscolarProgress = (student: any = {}, options: { honorEnrollmentState?: boolean } = {}) => {
  const honorEnrollmentState = options.honorEnrollmentState !== false
  const inProgressScope = !honorEnrollmentState || isStudentInscritoForExpedienteProgress(student)
  const fields = ['curp', 'padre', 'madre']
  const missingFields = inProgressScope ? resolveControlEscolarMissingFields(student) : fields.slice()
  const completeFields = fields.filter((field) => !missingFields.includes(field)).length
  const progress = inProgressScope ? Math.max(0, Math.round((completeFields / fields.length) * 100)) : 0
  return {
    progress,
    complete: progress >= 100,
    missingFields,
    inProgressScope,
    summary: !inProgressScope
      ? 'Fuera de inscritos'
      : progress >= 100
        ? 'Completo'
        : missingFields.length === 1
          ? '1 pendiente'
          : `${missingFields.length} pendientes`
  }
}

