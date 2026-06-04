const stringifyScalar = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(stringifyScalar).filter(Boolean).join(' ')
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['label', 'nombre', 'name', 'value', 'text', 'title']) {
      const text = stringifyScalar(record[key]).trim()
      if (text) return text
    }
  }
  return ''
}

export const normalizeParentName = (value: unknown): string => {
  const text = stringifyScalar(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return text
}

const firstParentText = (...values: unknown[]) => {
  for (const value of values) {
    const text = stringifyScalar(value).trim().replace(/\s+/g, ' ')
    if (text) return text
  }
  return ''
}

const joinedParentName = (...values: unknown[]) => {
  const parts = values.map((value) => stringifyScalar(value).trim()).filter(Boolean)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

export const buildFatherFullName = (row: Record<string, unknown> = {}) => firstParentText(
  joinedParentName(row.nombrePadre, row.apellidoPaternoPadre, row.apellidoMaternoPadre),
  joinedParentName(row.nombre_padre, row.apellido_paterno_padre, row.apellido_materno_padre),
  row.fatherName,
  row.nombrePadreCompleto,
  row.nombre_padre_completo,
  row.padre,
)

export const buildMotherFullName = (row: Record<string, unknown> = {}) => firstParentText(
  joinedParentName(row.nombreMadre, row.apellidoPaternoMadre, row.apellidoMaternoMadre),
  joinedParentName(row.nombre_madre, row.apellido_paterno_madre, row.apellido_materno_madre),
  row.motherName,
  row.nombreMadreCompleto,
  row.nombre_madre_completo,
  row.madre,
)

export type ParentSiblingSignature = {
  fatherName: string
  motherName: string
  normalizedFatherName: string
  normalizedMotherName: string
  key: string
  complete: boolean
}

export const buildParentSiblingSignature = (row: Record<string, unknown> = {}): ParentSiblingSignature => {
  const fatherName = buildFatherFullName(row)
  const motherName = buildMotherFullName(row)
  const normalizedFatherName = normalizeParentName(fatherName)
  const normalizedMotherName = normalizeParentName(motherName)
  const complete = Boolean(normalizedFatherName && normalizedMotherName)

  return {
    fatherName,
    motherName,
    normalizedFatherName,
    normalizedMotherName,
    key: complete ? `${normalizedFatherName}|${normalizedMotherName}` : '',
    complete,
  }
}

export const sameParentSiblingSignature = (left: Record<string, unknown> = {}, right: Record<string, unknown> = {}) => {
  const leftSignature = buildParentSiblingSignature(left)
  const rightSignature = buildParentSiblingSignature(right)
  return Boolean(leftSignature.complete && rightSignature.complete && leftSignature.key === rightSignature.key)
}
