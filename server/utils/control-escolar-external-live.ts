import { fetchControlEscolarStudents, runControlEscolar } from './control-escolar'
import { normalizePlantel } from './auth-session'
import { normalizeCicloKey } from '../../shared/utils/ciclo'

const CANONICAL_PLANTELES = ['PREEM', 'PREET', 'GM', 'PM', 'PT', 'SM', 'ST'] as const
const CANONICAL_SET = new Set<string>(CANONICAL_PLANTELES)
const DEFAULT_CICLOS = [
  { value: '2026', label: '2026-2027' },
  { value: '2025', label: '2025-2026' }
]

const clean = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max)
const canonicalMatricula = (value: unknown) => clean(value, 64).toUpperCase().replace(/\s+/g, '')

export const normalizeExternalLivePlantel = (value: unknown) => {
  const plantel = normalizePlantel(value || '')
  if (plantel === 'CT') return 'PREET'
  if (plantel === 'CM') return 'PREEM'
  if (plantel === 'PMA' || plantel === 'PMB') return 'PM'
  return CANONICAL_SET.has(plantel) ? plantel : ''
}

const resolveScope = (query: any = {}) => {
  const plantel = normalizeExternalLivePlantel(query.plantel || query.agentId)
  const ciclo = normalizeCicloKey(query.ciclo || query.cicloKey || query.schoolYear || '')
  if (!plantel) {
    throw createError({ statusCode: 400, statusMessage: 'PLANTEL_INVALID', message: 'El plantel no es válido para Control Escolar.' })
  }
  if (!ciclo) {
    throw createError({ statusCode: 400, statusMessage: 'CICLO_INVALID', message: 'El ciclo escolar no es válido.' })
  }
  return { plantel, ciclo }
}

const encodeCursor = (page: number) => Buffer.from(JSON.stringify({ page })).toString('base64url')
const decodeCursor = (value: unknown) => {
  const cursor = clean(value, 300)
  if (!cursor) return 1
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    const page = Number(parsed?.page || 1)
    return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  } catch {
    return 1
  }
}

const sanitizeStudent = (studentValue: any) => {
  const student = { ...(studentValue || {}) }
  for (const key of [
    'huskyPassPlaintext',
    'rawPhoto',
    'centralMatriculaRaw',
    'Control_Escolar_RAW_JSON',
    'raw',
    'rawBase',
    'rawMatricula',
    'rawUsers'
  ]) delete student[key]

  student.matricula = clean(student.matricula, 64).toUpperCase()
  student.fullName = clean(student.fullName || student.nombreCompleto, 255)
  student.plantel = normalizeExternalLivePlantel(student.plantel || student.basePlantel)
  student.display = {
    nombre: student.fullName,
    gradoGrupo: [student.grado, student.group || student.grupo].filter(Boolean).join(' '),
    plantelNivel: [student.plantel, student.nivel].filter(Boolean).join(' · '),
    estado: clean(student.status, 80),
    ciclo: clean(student.cicloBase || student.ciclo, 20)
  }
  student.padre = {
    nombreCompleto: clean(student.fatherName, 255),
    nombres: clean(student.nombrePadre, 120),
    apellidoPaterno: clean(student.apellidoPaternoPadre, 120),
    apellidoMaterno: clean(student.apellidoMaternoPadre, 120),
    telefono: clean(student.telefonoPadre, 80),
    correo: clean(student.emailPadre, 255)
  }
  student.madre = {
    nombreCompleto: clean(student.motherName, 255),
    nombres: clean(student.nombreMadre, 120),
    apellidoPaterno: clean(student.apellidoPaternoMadre, 120),
    apellidoMaterno: clean(student.apellidoMaternoMadre, 120),
    telefono: clean(student.telefonoMadre, 80),
    correo: clean(student.emailMadre, 255)
  }
  student.contactoPrincipal = {
    nombre: clean([student.fatherName, student.motherName].filter(Boolean).join(' / '), 500),
    telefono: clean(student.telefonoPadre || student.telefonoMadre || student.phone, 80),
    correo: clean(student.emailPadre || student.emailMadre || student.email, 255)
  }
  return student
}

const sourceMeta = (source: any, plantel: string, ciclo: string) => ({
  source: clean(source?.source || source?.mode || source?.kind || 'aurora-control-escolar', 80),
  freshness: clean(source?.freshness || (source?.cacheRefreshDue ? 'stale' : 'fresh'), 40) || 'fresh',
  plantel,
  ciclo,
  generatedAt: source?.generatedAt || source?.updatedAt || new Date().toISOString(),
  staleAfter: source?.staleAfter || null,
  expiresAt: source?.expiresAt || null,
  bridge: Boolean(source?.bridge || source?.bridgeSource || source?.localBridge),
  cacheRows: Number(source?.cacheRows || 0)
})

export const readExternalLiveHealth = () => ({
  status: 'ok',
  mode: 'live-bridge',
  canonicalPlanteles: CANONICAL_PLANTELES.map((plantel) => ({ plantel })),
  schoolYears: DEFAULT_CICLOS,
  scopes: []
})

export const readExternalLiveStudents = async (event: any, query: any = {}) => {
  const { plantel, ciclo } = resolveScope(query)
  const page = decodeCursor(query.cursor)
  const limit = Math.min(100, Math.max(25, Number(query.limit || 100) || 100))
  const filters = {
    ...query,
    plantel,
    agentId: plantel,
    ciclo,
    cicloKey: ciclo,
    page,
    limit,
    group: query.grupo || query.group || ''
  }
  delete filters.cursor

  return await runControlEscolar(event, plantel, async () => {
    const result = await fetchControlEscolarStudents(plantel, filters)
    const total = Number(result?.pagination?.total || 0)
    const pages = Number(result?.pagination?.pages || Math.max(1, Math.ceil(total / limit)))
    return {
      data: Array.isArray(result?.data) ? result.data.map(sanitizeStudent) : [],
      pagination: {
        page,
        limit,
        total,
        nextCursor: page < pages ? encodeCursor(page + 1) : null
      },
      catalogs: result?.catalogs || { niveles: [], grados: [], grupos: [], gruposPorGrado: {} },
      meta: sourceMeta(result?.source, plantel, ciclo)
    }
  })
}

export const readExternalLiveStudentDetail = async (event: any, query: any = {}, matriculaValue: unknown) => {
  const { plantel, ciclo } = resolveScope(query)
  const matricula = canonicalMatricula(matriculaValue)
  if (!matricula) {
    throw createError({ statusCode: 400, statusMessage: 'MATRICULA_REQUIRED', message: 'La matrícula es obligatoria.' })
  }

  return await runControlEscolar(event, plantel, async () => {
    const result = await fetchControlEscolarStudents(plantel, {
      plantel,
      agentId: plantel,
      ciclo,
      cicloKey: ciclo,
      search: matricula,
      page: 1,
      limit: 100
    })
    const student = (result?.data || []).find((item: any) => canonicalMatricula(item?.matricula) === matricula)
    if (!student) {
      throw createError({ statusCode: 404, statusMessage: 'STUDENT_NOT_FOUND', message: 'Alumno no encontrado en el plantel y ciclo seleccionados.' })
    }
    return {
      data: sanitizeStudent(student),
      meta: sourceMeta(result?.source, plantel, ciclo)
    }
  })
}

export const sanitizeExternalLiveStudent = sanitizeStudent
