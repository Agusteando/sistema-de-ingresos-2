const CURP_STATES = new Set([
  'AS', 'BC', 'BS', 'CC', 'CL', 'CM', 'CS', 'CH', 'DF', 'DG', 'GT', 'GR', 'HG', 'JC', 'MC', 'MN', 'MS', 'NT', 'NL', 'OC', 'PL', 'QT', 'QR', 'SP', 'SL', 'SR', 'TC', 'TS', 'TL', 'VZ', 'YN', 'ZS', 'NE'
])

const CURP_ALPHABET = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'

export type CurpGenderValue = '1' | '0'

export type CurpParseResult = {
  normalized: string
  isEmpty: boolean
  isComplete: boolean
  isValid: boolean
  birthDate: string
  age: number | null
  gender: CurpGenderValue | ''
  genderLabel: string
  stateCode: string
  message: string
}

export const normalizeCurp = (value: unknown) => {
  return String(value || '')
    .trim()
    .toLocaleUpperCase('es-MX')
    .replace(/\s+/g, '')
    .slice(0, 18)
}

const isRealDate = (year: number, month: number, day: number) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

const ageFromBirthDate = (birthDate: string, now = new Date()) => {
  const match = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  let age = now.getFullYear() - year
  const monthDelta = now.getMonth() + 1 - month
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < day)) age -= 1
  return age >= 0 && age < 130 ? age : null
}

const validateCurpCheckDigit = (curp: string) => {
  if (curp.length !== 18 || !/\d$/.test(curp)) return false

  let sum = 0
  for (let index = 0; index < 17; index += 1) {
    const value = CURP_ALPHABET.indexOf(curp[index])
    if (value < 0) return false
    sum += value * (18 - index)
  }

  const expected = (10 - (sum % 10)) % 10
  return Number(curp[17]) === expected
}

export const parseCurp = (value: unknown, now = new Date()): CurpParseResult => {
  const normalized = normalizeCurp(value)
  const emptyResult: CurpParseResult = {
    normalized,
    isEmpty: normalized.length === 0,
    isComplete: normalized.length === 18,
    isValid: false,
    birthDate: '',
    age: null,
    gender: '',
    genderLabel: '',
    stateCode: '',
    message: ''
  }

  if (!normalized) {
    return {
      ...emptyResult,
      message: 'Captura la CURP para calcular nacimiento, edad y género.'
    }
  }

  if (!/^[A-ZÑ0-9]+$/.test(normalized)) {
    return {
      ...emptyResult,
      message: 'La CURP solo puede contener letras y números.'
    }
  }

  if (normalized.length < 18) {
    return {
      ...emptyResult,
      message: `Faltan ${18 - normalized.length} caracteres para validar la CURP.`
    }
  }

  const structure = normalized.match(/^([A-ZÑ][AEIOUX][A-ZÑ]{2})(\d{2})(\d{2})(\d{2})([HM])([A-Z]{2})([B-DF-HJ-NP-TV-ZÑ]{3})([A-Z0-9])(\d)$/)
  if (!structure) {
    return {
      ...emptyResult,
      message: 'La CURP no tiene una estructura válida. Revisa letras, fecha, sexo, entidad y dígito verificador.'
    }
  }

  const [, , yyRaw, mmRaw, ddRaw, genderRaw, stateCode, , homoclave] = structure
  if (!CURP_STATES.has(stateCode)) {
    return {
      ...emptyResult,
      stateCode,
      message: `La entidad "${stateCode}" no es válida para una CURP.`
    }
  }

  const yy = Number(yyRaw)
  const month = Number(mmRaw)
  const day = Number(ddRaw)
  const century = /[A-Z]/.test(homoclave) ? 2000 : 1900
  const year = century + yy
  if (!isRealDate(year, month, day)) {
    return {
      ...emptyResult,
      stateCode,
      message: 'La fecha codificada en la CURP no existe.'
    }
  }

  const birthDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const age = ageFromBirthDate(birthDate, now)
  if (age === null) {
    return {
      ...emptyResult,
      birthDate,
      stateCode,
      message: 'La fecha de nacimiento de la CURP no es válida para un alumno.'
    }
  }

  if (!validateCurpCheckDigit(normalized)) {
    return {
      ...emptyResult,
      birthDate,
      age,
      gender: genderRaw === 'H' ? '1' : '0',
      genderLabel: genderRaw === 'H' ? 'Masculino' : 'Femenino',
      stateCode,
      message: 'El dígito verificador de la CURP no coincide. Revisa que esté capturada completa y sin errores.'
    }
  }

  return {
    normalized,
    isEmpty: false,
    isComplete: true,
    isValid: true,
    birthDate,
    age,
    gender: genderRaw === 'H' ? '1' : '0',
    genderLabel: genderRaw === 'H' ? 'Masculino' : 'Femenino',
    stateCode,
    message: 'CURP válida. Datos personales inferidos correctamente.'
  }
}

export const formatBirthDate = (birthDate: string) => {
  const match = String(birthDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  return `${match[3]}/${match[2]}/${match[1]}`
}
