import { formatCicloLabel, normalizeCicloKey } from '../../shared/utils/ciclo'
import {
  canonicalTallerKey,
  finalTallerSeed,
  isFinalTaller,
  normalizeServicioClave,
  parseServiciosCsv,
  serviceSeedByKey,
} from '../../shared/utils/talleresServicios'
import { fetchControlEscolarStudents, runControlEscolar } from './control-escolar'
import { controlEscolarCentralQuery, getCentralTableColumns } from './control-escolar-central'
import { normalizeExternalControlEscolarPlantel } from './control-escolar-plantel-routing'
import { query } from './db'
import {
  readBestTalleresServiciosCatalog,
  readConceptMappedServiciosForMatriculas,
} from './talleres-servicios'

const text = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max)
const matriculaKey = (value: unknown) => text(value, 64).toUpperCase().replace(/\s+/g, '')

const REPORTABLE_SERVICE_KEYS = new Set([
  'DESAYUNO',
  'COMIDA',
  'CENA',
  'CLUB_DE_TAREAS',
])

const isReportableTallerServicio = (value: unknown) => {
  const key = canonicalTallerKey(value)
  return Boolean(key && (isFinalTaller(key) || REPORTABLE_SERVICE_KEYS.has(key)))
}

// Critical legacy concepts existed before their config_enrollment_mappings rows.
// Keep this explicit and narrow: only the named institutional services plus
// AJEDREZ/AJEDREZ 4 DIAS receive a read-time fallback.
const hardcodedConceptServiceKey = (value: unknown) => {
  let key = normalizeServicioClave(value)
  if (!key) return ''

  key = key
    .replace(/_(?:CICLO_)?20\d{2}_20\d{2}$/, '')
    .replace(/_(?:CICLO_)?20\d{2}$/, '')
    .replace(/^SERVICIO_DE_/, '')
    .replace(/^SERVICIO_/, '')
    .replace(/^TALLER_DE_/, '')
    .replace(/^TALLER_/, '')
    .replace(/^_+|_+$/g, '')

  const aliases: Array<[string, string]> = [
    ['CLUB_DE_TAREAS', 'CLUB_DE_TAREAS'],
    ['DESAYUNO', 'DESAYUNO'],
    ['COMIDA', 'COMIDA'],
    ['CENA', 'CENA'],
    ['AJEDREZ_4_DIAS', 'AJEDREZ'],
    ['AJEDREZ_CUATRO_DIAS', 'AJEDREZ'],
    ['AJEDREZ', 'AJEDREZ'],
  ]

  for (const [prefix, mapped] of aliases) {
    if (key === prefix || key.startsWith(`${prefix}_`)) return mapped
  }
  return ''
}

const cycleCandidatesFor = (value: unknown) => {
  const key = normalizeCicloKey(value)
  return Array.from(new Set([key, formatCicloLabel(key)].filter(Boolean)))
}

const readHardcodedConceptMap = async (ciclo: unknown) => {
  const result = new Map<number, string>()
  const columns = await getCentralTableColumns('conceptos')
  if (!columns.has('id') || !columns.has('concepto')) return result

  const cycleColumn = columns.has('ciclo') ? 'ciclo' : (columns.has('ciclo_escolar') ? 'ciclo_escolar' : '')
  const cycleCandidates = cycleCandidatesFor(ciclo)
  const cycleWhere = cycleColumn
    ? `AND CAST(\`${cycleColumn}\` AS CHAR) IN (${cycleCandidates.map(() => '?').join(',')})`
    : ''

  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT id, concepto
       FROM conceptos
      WHERE concepto IS NOT NULL
        AND TRIM(concepto) <> ''
        ${cycleWhere}`,
    cycleColumn ? cycleCandidates : [],
  )

  for (const row of rows) {
    const conceptoId = Number(row?.id || 0)
    const key = hardcodedConceptServiceKey(row?.concepto)
    if (conceptoId > 0 && key && isReportableTallerServicio(key)) result.set(conceptoId, key)
  }
  return result
}

const readHardcodedFinancialRows = async (matriculas: string[], ciclo: unknown) => {
  const mappings = await readHardcodedConceptMap(ciclo)
  const conceptIds = Array.from(mappings.keys())
  if (!matriculas.length || !conceptIds.length) return [] as Array<{ matricula: string; clave: string }>

  let hasPeriodTable = false
  try {
    const tables = await query<any[]>(`SHOW TABLES LIKE 'documento_concepto_periodos'`)
    hasPeriodTable = tables.length > 0
  } catch {}

  const cycleCandidates = cycleCandidatesFor(ciclo)
  const rows: Array<{ matricula: string; concepto_id: number }> = []

  for (let offset = 0; offset < matriculas.length; offset += 250) {
    const chunk = matriculas.slice(offset, offset + 250)
    const periodJoin = hasPeriodTable
      ? `LEFT JOIN documento_concepto_periodos P
           ON P.id = (
             SELECT P2.id
               FROM documento_concepto_periodos P2
              WHERE P2.documento = D.documento
                AND LOWER(TRIM(CAST(P2.estatus AS CHAR))) = 'activo'
              ORDER BY P2.start_mes DESC, P2.id DESC
              LIMIT 1
           )`
      : ''
    const effectiveConcept = hasPeriodTable ? 'COALESCE(P.concepto_id, D.concepto)' : 'D.concepto'
    const activePeriod = hasPeriodTable
      ? `AND (P.id IS NULL OR LOWER(TRIM(CAST(P.accion AS CHAR))) <> 'cancelacion')`
      : ''

    const batch = await query<any[]>(
      `SELECT UPPER(TRIM(D.matricula)) AS matricula,
              CAST(${effectiveConcept} AS UNSIGNED) AS concepto_id
         FROM documentos D
         ${periodJoin}
        WHERE CAST(D.ciclo AS CHAR) IN (${cycleCandidates.map(() => '?').join(',')})
          AND LOWER(TRIM(CAST(D.estatus AS CHAR))) = 'activo'
          AND UPPER(TRIM(D.matricula)) IN (${chunk.map(() => '?').join(',')})
          AND CAST(${effectiveConcept} AS UNSIGNED) IN (${conceptIds.map(() => '?').join(',')})
          ${activePeriod}
        GROUP BY UPPER(TRIM(D.matricula)), CAST(${effectiveConcept} AS UNSIGNED)`,
      [...cycleCandidates, ...chunk, ...conceptIds],
    )
    rows.push(...batch)
  }

  return rows
    .map((row) => ({
      matricula: matriculaKey(row?.matricula),
      clave: mappings.get(Number(row?.concepto_id || 0)) || '',
    }))
    .filter((row) => row.matricula && row.clave)
}

const isActiveStudent = (student: any) => {
  if (Number(student?.baja || 0) === 1) return false
  const status = text(student?.status, 40).toLowerCase()
  return !['baja', 'withdrawn', 'inactive', 'inactivo'].includes(status)
}

export type TalleresAdminStudentRow = {
  matricula: string
  nombre: string
  grado: string
  grupo: string
}

export type TalleresAdminSummaryRow = {
  clave: string
  nombre: string
  imagen: string
  alumnos: number
  students?: TalleresAdminStudentRow[]
}

const toStudentRow = (student: any, matricula: string): TalleresAdminStudentRow => {
  const nombre = text(
    student?.fullName
    || student?.nombreCompleto
    || [student?.nombres, student?.apellidoPaterno, student?.apellidoMaterno].filter(Boolean).join(' '),
    220,
  )

  return {
    matricula,
    nombre,
    grado: text(student?.grado, 80),
    grupo: text(student?.grupo || student?.group, 40).toUpperCase(),
  }
}

const compareStudentRows = (left: TalleresAdminStudentRow, right: TalleresAdminStudentRow) => (
  left.grado.localeCompare(right.grado, 'es', { numeric: true, sensitivity: 'base' })
  || left.grupo.localeCompare(right.grupo, 'es', { numeric: true, sensitivity: 'base' })
  || left.nombre.localeCompare(right.nombre, 'es', { sensitivity: 'base' })
  || left.matricula.localeCompare(right.matricula, 'es', { numeric: true })
)

export const readTalleresAdminSummary = async ({
  event,
  plantel,
  ciclo,
  includeStudents = false,
}: {
  event: any
  plantel: unknown
  ciclo?: unknown
  includeStudents?: boolean
}) => {
  const publicPlantel = text(plantel, 40).toUpperCase()
  if (!publicPlantel || publicPlantel === 'GLOBAL') {
    throw createError({ statusCode: 400, message: 'Selecciona un plantel para consultar Talleres.' })
  }

  const cycle = normalizeCicloKey(ciclo)
  const sourcePlantel = normalizeExternalControlEscolarPlantel(publicPlantel) || publicPlantel

  return await runControlEscolar(event, sourcePlantel, async () => {
    const studentsResult = await fetchControlEscolarStudents(sourcePlantel, {
      plantel: sourcePlantel,
      agentId: sourcePlantel,
      ciclo: cycle,
      cicloKey: cycle,
      all: '1',
      limit: 10000,
    })
    const students = (Array.isArray(studentsResult?.data) ? studentsResult.data : []).filter(isActiveStudent)
    const matriculas = students.map((student: any) => matriculaKey(student?.matricula)).filter(Boolean)

    const [catalogResult, financialAssignments, hardcodedFinancialRows] = await Promise.all([
      readBestTalleresServiciosCatalog(),
      readConceptMappedServiciosForMatriculas({ matriculas, ciclo: cycle, plantel: publicPlantel }),
      readHardcodedFinancialRows(matriculas, cycle),
    ])

    const catalog = new Map<string, any>()
    for (const item of catalogResult.catalog || []) {
      const key = canonicalTallerKey(item?.servicio_clave || item?.servicio_nombre)
      if (!key || !isReportableTallerServicio(key) || Number(item?.activo ?? 1) === 0) continue
      catalog.set(key, item)
    }

    const counts = new Map<string, Set<string>>()
    const ensureCount = (value: unknown, matricula: string) => {
      const key = canonicalTallerKey(value)
      if (!key || !matricula || !isReportableTallerServicio(key)) return
      const members = counts.get(key) || new Set<string>()
      members.add(matricula)
      counts.set(key, members)
    }

    for (const student of students) {
      const matricula = matriculaKey(student?.matricula)
      if (!matricula) continue

      for (const direct of parseServiciosCsv(student?.servicio)) {
        ensureCount(direct, matricula)
      }

      for (const assignment of financialAssignments.result.get(matricula) || []) {
        ensureCount(assignment?.clave || assignment?.nombre, matricula)
      }
    }

    for (const row of hardcodedFinancialRows) ensureCount(row.clave, row.matricula)

    const studentsByMatricula = new Map<string, any>()
    if (includeStudents) {
      for (const student of students) {
        const matricula = matriculaKey(student?.matricula)
        if (matricula) studentsByMatricula.set(matricula, student)
      }
    }

    const talleres: TalleresAdminSummaryRow[] = Array.from(counts.entries())
      .map(([clave, members]) => {
        const item = catalog.get(clave)
        const seed = finalTallerSeed(clave) || serviceSeedByKey(clave)
        const detailRows = includeStudents
          ? Array.from(members)
              .map((matricula) => toStudentRow(studentsByMatricula.get(matricula), matricula))
              .sort(compareStudentRows)
          : undefined

        return {
          clave,
          nombre: text(item?.servicio_nombre || seed?.nombre || clave, 160),
          imagen: text(item?.imagen_url || seed?.imagen || `/talleres-servicios/${clave}.svg`, 500),
          alumnos: members.size,
          orden: Number(item?.orden || seed?.orden || 9999),
          ...(includeStudents ? { students: detailRows } : {}),
        }
      })
      .filter((item) => item.alumnos > 0)
      .sort((left, right) => left.orden - right.orden || left.nombre.localeCompare(right.nombre, 'es'))
      .map(({ orden: _orden, ...item }) => item)

    const uniqueStudents = new Set<string>()
    for (const members of counts.values()) {
      for (const matricula of members) uniqueStudents.add(matricula)
    }

    return {
      ok: true,
      plantel: publicPlantel,
      ciclo: cycle,
      talleres,
      totals: {
        talleres: talleres.length,
        alumnos: uniqueStudents.size,
      },
      generatedAt: new Date().toISOString(),
    }
  })
}
