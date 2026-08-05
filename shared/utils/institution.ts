export const INSTITUTION_NAME_IECS = 'INSTITUTO EDUCATIVO LA CASITA DEL SABER'
export const INSTITUTION_NAME_IEDIS = 'INSTITUTO EDUCATIVO PARA EL DESARROLLO INTEGRAL DEL SABER'

const IEDIS_PLANTELES = new Set(['PT', 'ST', 'PM', 'SM'])

export const normalizePlantelCode = (value: unknown) => String(value ?? '').trim().toUpperCase()

export const isIedisPlantel = (value: unknown) => IEDIS_PLANTELES.has(normalizePlantelCode(value))

export const institutionNameForPlantel = (value: unknown) => (
  isIedisPlantel(value) ? INSTITUTION_NAME_IEDIS : INSTITUTION_NAME_IECS
)

export const institutionFlagForPlantel = (value: unknown) => (isIedisPlantel(value) ? 1 : 0)

export const resolveInstitutionPlantel = (record: Record<string, any> | null | undefined) => (
  normalizePlantelCode(
    record?.plantel
    || record?.scopePlantel
    || record?.plantel_alumno
    || record?.plantelAlumno
  )
)

export const institutionNameForRecord = (record: Record<string, any> | null | undefined) => (
  institutionNameForPlantel(resolveInstitutionPlantel(record))
)
