import { normalizeCicloKey } from '../../shared/utils/ciclo'
import {
  canonicalTallerKey,
  finalTallerSeed,
  isFinalTaller,
  parseServiciosCsv,
} from '../../shared/utils/talleresServicios'
import { fetchControlEscolarStudents, runControlEscolar } from './control-escolar'
import { normalizeExternalControlEscolarPlantel } from './control-escolar-plantel-routing'
import {
  readBestTalleresServiciosCatalog,
  readConceptMappedServiciosForMatriculas,
} from './talleres-servicios'

const text = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max)
const matriculaKey = (value: unknown) => text(value, 64).toUpperCase().replace(/\s+/g, '')

const isActiveStudent = (student: any) => {
  if (Number(student?.baja || 0) === 1) return false
  const status = text(student?.status, 40).toLowerCase()
  return !['baja', 'withdrawn', 'inactive', 'inactivo'].includes(status)
}

export type TalleresAdminSummaryRow = {
  clave: string
  nombre: string
  imagen: string
  alumnos: number
}

export const readTalleresAdminSummary = async ({
  event,
  plantel,
  ciclo,
}: {
  event: any
  plantel: unknown
  ciclo?: unknown
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

    const [catalogResult, financialAssignments] = await Promise.all([
      readBestTalleresServiciosCatalog(),
      readConceptMappedServiciosForMatriculas({ matriculas, ciclo: cycle, plantel: publicPlantel }),
    ])

    const catalog = new Map<string, any>()
    for (const item of catalogResult.catalog || []) {
      const key = canonicalTallerKey(item?.servicio_clave || item?.servicio_nombre)
      if (!key || !isFinalTaller(key) || Number(item?.activo ?? 1) === 0) continue
      catalog.set(key, item)
    }

    const counts = new Map<string, Set<string>>()
    const ensureCount = (key: string, matricula: string) => {
      if (!key || !matricula || !isFinalTaller(key)) return
      const members = counts.get(key) || new Set<string>()
      members.add(matricula)
      counts.set(key, members)
    }

    for (const student of students) {
      const matricula = matriculaKey(student?.matricula)
      if (!matricula) continue

      for (const direct of parseServiciosCsv(student?.servicio)) {
        ensureCount(canonicalTallerKey(direct), matricula)
      }

      for (const assignment of financialAssignments.result.get(matricula) || []) {
        ensureCount(canonicalTallerKey(assignment?.clave || assignment?.nombre), matricula)
      }
    }

    const talleres: TalleresAdminSummaryRow[] = Array.from(counts.entries())
      .map(([clave, members]) => {
        const item = catalog.get(clave)
        const seed = finalTallerSeed(clave)
        return {
          clave,
          nombre: text(item?.servicio_nombre || seed?.nombre || clave, 160),
          imagen: text(item?.imagen_url || seed?.imagen || `/talleres-servicios/${clave}.svg`, 500),
          alumnos: members.size,
          orden: Number(item?.orden || seed?.orden || 9999),
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
