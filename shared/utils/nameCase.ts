const stringifyNameValue = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(stringifyNameValue).filter(Boolean).join(' ')
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['label', 'nombre', 'name', 'value', 'text', 'title']) {
      const text = stringifyNameValue(record[key]).trim()
      if (text) return text
    }
  }
  return ''
}

const LOWERCASE_SPANISH_NAME_PARTICLES = new Set([
  'de',
  'del',
  'la',
  'las',
  'los',
  'y',
  'e',
])

const ROMAN_NUMERAL_PATTERN = /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i

const capitalizeNameToken = (token: string): string => {
  const lower = token.toLocaleLowerCase('es-MX')
  if (!lower) return ''
  if (ROMAN_NUMERAL_PATTERN.test(lower)) return lower.toLocaleUpperCase('es-MX')
  return lower.replace(/^(\p{L})/u, (letter) => letter.toLocaleUpperCase('es-MX'))
}

const capitalizeCompositeToken = (token: string): string => token
  .split(/([\-’'])/)
  .map((part) => (part === '-' || part === '’' || part === "'" ? part : capitalizeNameToken(part)))
  .join('')

export const toNameDisplayCase = (value: unknown): string => {
  const text = stringifyNameValue(value).replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text
    .split(' ')
    .map((word, index) => {
      const lower = word.toLocaleLowerCase('es-MX')
      if (index > 0 && LOWERCASE_SPANISH_NAME_PARTICLES.has(lower)) return lower
      return capitalizeCompositeToken(word)
    })
    .join(' ')
}

export const CONTROL_ESCOLAR_NAME_FIELDS = new Set([
  'nombres',
  'apellidoPaterno',
  'apellidoMaterno',
  'nombreVerificado',
  'nombreCompletoAlumno',
  'nombrePadre',
  'apellidoPaternoPadre',
  'apellidoMaternoPadre',
  'nombrePadreCompleto',
  'fatherName',
  'nombreMadre',
  'apellidoPaternoMadre',
  'apellidoMaternoMadre',
  'nombreMadreCompleto',
  'motherName',
  'fullName',
  'nombreCompleto',
])

export const isControlEscolarNameField = (field: string): boolean => CONTROL_ESCOLAR_NAME_FIELDS.has(field)
