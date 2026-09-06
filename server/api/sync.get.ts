import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../utils/external-api-auth'
import { readExternalResilientStudents } from '../utils/control-escolar-external-resilient'
import { readInstitutionalSchoolCycle } from '../utils/school-cycle'
import { fetchControlEscolarStudents, runControlEscolar } from '../utils/control-escolar'

const FACTURA_PLANTELES = new Set(['PM', 'SM', 'PT', 'ST', 'PREEM', 'PREET', 'CT', 'DM', 'CM'])
const MAX_PAGE_SIZE = 500

const clean = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max)
const normalizePlantel = (value: unknown) => clean(value, 20).toUpperCase()

const canonicalAuroraPlantel = (plantel: string) => {
  if (plantel === 'CT') return 'PREET'
  if (plantel === 'CM') return 'PREEM'
  return plantel
}

const toLegacyRow = (student: any) => {
  const apellidoPaterno = clean(student?.apellidoPaterno || student?.apellido_paterno, 120)
  const apellidoMaterno = clean(student?.apellidoMaterno || student?.apellido_materno, 120)
  const nombresDirectos = clean(student?.nombres, 180)
  const fullName = clean(student?.nombreCompleto || student?.fullName || student?.display?.nombre, 255)
  const nombres = nombresDirectos || (!apellidoPaterno && !apellidoMaterno ? fullName : '')

  return {
    matricula: clean(student?.matricula, 64),
    apellido_paterno: apellidoPaterno,
    apellido_materno: apellidoMaterno,
    nombres,
  }
}

const readAuroraScope = async (event: any, plantel: string, ciclo: string) => {
  const rows: any[] = []
  let cursor = ''

  do {
    const response = await readExternalResilientStudents(event, {
      plantel,
      ciclo,
      limit: MAX_PAGE_SIZE,
      cursor,
    })

    if (Array.isArray(response?.data)) rows.push(...response.data)
    cursor = clean(response?.pagination?.nextCursor, 500)
  } while (cursor)

  return rows
}

const readDmScope = async (event: any, ciclo: string) => {
  const result = await runControlEscolar(event, 'DM', async () =>
    await fetchControlEscolarStudents('DM', {
      plantel: 'DM',
      agentId: 'DM',
      ciclo,
      cicloKey: ciclo,
      page: 1,
      limit: MAX_PAGE_SIZE,
      all: '1',
      externalApi: true,
    })
  )

  if (Array.isArray(result)) return result
  return Array.isArray((result as any)?.data) ? (result as any).data : []
}

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 0)

  const query = getQuery(event)
  const requestedPlantel = normalizePlantel(query.plantel)

  if (!FACTURA_PLANTELES.has(requestedPlantel)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'PLANTEL_INVALID',
      message: 'El plantel solicitado no es válido para la integración de factura-api.',
    })
  }

  const cycle = await readInstitutionalSchoolCycle()
  const ciclo = clean(cycle?.key, 20)
  if (!ciclo) {
    throw createError({
      statusCode: 503,
      statusMessage: 'SCHOOL_CYCLE_UNAVAILABLE',
      message: 'Aurora no pudo determinar el ciclo escolar institucional actual.',
    })
  }

  const canonicalPlantel = canonicalAuroraPlantel(requestedPlantel)
  const students = requestedPlantel === 'DM'
    ? await readDmScope(event, ciclo)
    : await readAuroraScope(event, canonicalPlantel, ciclo)

  const seen = new Set<string>()
  const rows = students
    .map(toLegacyRow)
    .filter((row) => {
      const matricula = row.matricula.toUpperCase()
      if (!matricula || seen.has(matricula)) return false
      if (!row.apellido_paterno && !row.apellido_materno && !row.nombres) return false
      seen.add(matricula)
      return true
    })

  return {
    rows,
    meta: {
      source: 'aurora',
      plantel: requestedPlantel,
      canonicalPlantel,
      ciclo,
      total: rows.length,
    },
  }
})
