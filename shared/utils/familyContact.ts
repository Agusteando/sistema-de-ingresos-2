export type ResolvedFamilyContact = {
  tutorName: string
  fatherName: string
  motherName: string
  fatherPhone: string
  motherPhone: string
  fatherEmail: string
  motherEmail: string
  phone: string
  email: string
  hasControlEscolarData: boolean
}

export const familyContactText = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  if (Array.isArray(value)) return value.map(familyContactText).filter(Boolean).join(' / ')
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['label', 'nombre', 'name', 'value', 'descripcion', 'description', 'text', 'title']) {
      const text = familyContactText(record[key])
      if (text) return text
    }
  }
  return ''
}

const camelToSnake = (value: string) => value.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)

const directValue = (source: any, key: string): string => {
  if (!source || typeof source !== 'object') return ''
  const direct = familyContactText(source[key])
  if (direct) return direct
  const snake = camelToSnake(key)
  if (snake !== key) {
    const snakeValue = familyContactText(source[snake])
    if (snakeValue) return snakeValue
  }
  return ''
}

const contactSources = (student: any = {}) => {
  const sources: any[] = []
  if (student?.centralMatricula && typeof student.centralMatricula === 'object') sources.push(student.centralMatricula)
  if (student?.centralMatriculaRaw && typeof student.centralMatriculaRaw === 'object') sources.push(student.centralMatriculaRaw)
  if (student && typeof student === 'object') sources.push(student)
  return sources
}

const firstFromSources = (student: any, keys: string[]): string => {
  for (const source of contactSources(student)) {
    for (const key of keys) {
      const value = directValue(source, key)
      if (value) return value
    }
  }
  return ''
}

const joinedName = (...values: unknown[]) => values.map(familyContactText).filter(Boolean).join(' ')

const joinedFromSources = (student: any, keys: string[]) => {
  for (const source of contactSources(student)) {
    const value = joinedName(...keys.map(key => directValue(source, key)))
    if (value) return value
  }
  return ''
}

const distinctJoin = (...values: string[]) => {
  const seen = new Set<string>()
  const items = values
    .map(familyContactText)
    .filter((value) => {
      if (!value) return false
      const key = value.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  return items.join(' / ')
}

export const resolveFinancialFamilyContact = (student: any = {}): ResolvedFamilyContact => {
  const fatherName = joinedFromSources(student, ['nombrePadre', 'apellidoPaternoPadre', 'apellidoMaternoPadre']) ||
    firstFromSources(student, ['fatherName', 'nombrePadreCompleto', 'padre', 'tutor', 'padreTutor', 'Nombre del padre o tutor'])
  const motherName = joinedFromSources(student, ['nombreMadre', 'apellidoPaternoMadre', 'apellidoMaternoMadre']) ||
    firstFromSources(student, ['motherName', 'nombreMadreCompleto', 'madre'])

  const fatherPhone = firstFromSources(student, ['telefonoPadre', 'celularPadre'])
  const motherPhone = firstFromSources(student, ['telefonoMadre', 'celularMadre'])
  const fatherEmail = firstFromSources(student, ['emailPadre', 'correoPadre'])
  const motherEmail = firstFromSources(student, ['emailMadre', 'correoMadre'])

  const fallbackTutor = firstFromSources(student, ['guardianName', 'padre', 'tutor', 'padreTutor', 'Nombre del padre o tutor'])
  const fallbackPhone = firstFromSources(student, ['phone', 'telefono'])
  const fallbackEmail = firstFromSources(student, ['email', 'correo'])

  const hasControlEscolarData = Boolean(
    student?.centralMatricula ||
    student?.centralMatriculaRaw ||
    fatherName ||
    motherName ||
    fatherPhone ||
    motherPhone ||
    fatherEmail ||
    motherEmail
  )

  return {
    tutorName: distinctJoin(fatherName, motherName) || fallbackTutor,
    fatherName,
    motherName,
    fatherPhone,
    motherPhone,
    fatherEmail,
    motherEmail,
    phone: fatherPhone || motherPhone || fallbackPhone,
    email: fatherEmail || motherEmail || fallbackEmail,
    hasControlEscolarData
  }
}
