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

export const isStudentEnrolled = (student: any, enrollmentConcepts: string[] = []) => {
  if (student?.estatus !== 'Activo') return false
  const concepts = ((student?.conceptosCargados || '') + '|' + (student?.conceptosPagados || '')).toLowerCase()
  return enrollmentConcepts.some(concept => concepts.includes(concept))
}

export const statusSecondaryLine = (student: any, enrollmentConcepts: string[] = []) => {
  const parts = []
  if (student?.nivel && String(student.nivel).toLowerCase() !== 'null') parts.push(student.nivel)
  const group = studentGroupLabel(student)
  if (group) parts.push(group)
  if (student?.estatus !== 'Activo') return parts[0] || 'Alumno'
  if (!isStudentEnrolled(student, enrollmentConcepts)) return parts.length ? `${parts.join(' · ')} · pendiente` : 'Pendiente de inscripción'
  return parts.join(' · ') || 'Alumno activo'
}

export const parseEnrollmentConcepts = (source: unknown) => {
  const concepts: string[] = []
  const traverse = (value: any) => {
    if (!value) return
    if (Array.isArray(value)) value.forEach(traverse)
    else if (typeof value === 'object') {
      if (value.concepto_nombre) concepts.push(value.concepto_nombre)
      Object.values(value).forEach(traverse)
    }
  }
  traverse(source)
  return [...new Set(concepts.map(concept => concept.toLowerCase().trim()).filter(Boolean))]
}
