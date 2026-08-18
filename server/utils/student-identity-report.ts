import { PLANTELES_LIST } from '../../utils/constants'
import { formatCicloLabel, normalizeCicloKey } from '../../shared/utils/ciclo'
import {
  GRADOS_NORMALIZADOS,
  calculatePromotedGrado,
  displayGrado,
  normalizePlantel,
  plantelCandidatesForProjectedScope
} from '../../shared/utils/grado'
import { normalizeCurp } from '../../shared/utils/curp'
import type { AuthSessionUser } from './auth-session'
import { fetchCentralMatriculaOverlays } from './central-matricula-overlay'
import { query } from './db'

type StudentIdentityReportFilters = {
  ciclo?: unknown
  plantel?: unknown
}

type StudentIdentityDbRow = {
  matricula: string
  apellidoPaterno?: string | null
  apellidoMaterno?: string | null
  nombres?: string | null
  curp?: string | null
  gradoBase?: string | null
  cicloBase?: string | null
  plantel?: string | null
  nivelBase?: string | null
}

export type StudentIdentityReportRow = {
  apellidoPaterno: string
  apellidoMaterno: string
  nombres: string
  grado: string
  curp: string
  fechaNacimiento: string
  gradoOrden: number
}

const normalizeText = (value: unknown) => String(value || '').trim()

const resolveReportPlantel = (user: AuthSessionUser, requestedPlantel: unknown) => {
  const activePlantel = normalizePlantel(user?.active_plantel)

  if (activePlantel && activePlantel !== 'GLOBAL') {
    if (!PLANTELES_LIST.includes(activePlantel)) {
      throw createError({ statusCode: 400, message: 'El plantel activo no es válido.' })
    }
    return activePlantel
  }

  if (!user?.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para consultar otro plantel.' })
  }

  const requested = normalizePlantel(requestedPlantel)
  if (!requested || requested === 'GLOBAL' || !PLANTELES_LIST.includes(requested)) {
    throw createError({ statusCode: 400, message: 'Seleccione un plantel para generar el reporte.' })
  }

  return requested
}

const isRealDate = (year: number, month: number, day: number) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

// La fecha se deriva exclusivamente de la CURP. No usa el campo de nacimiento de base.
const birthDateFromCurp = (value: unknown) => {
  const curp = normalizeCurp(value)
  if (curp.length < 17) return ''

  const yearPart = curp.slice(4, 6)
  const monthPart = curp.slice(6, 8)
  const dayPart = curp.slice(8, 10)
  const centuryMarker = curp[16]

  if (!/^\d{2}$/.test(yearPart) || !/^\d{2}$/.test(monthPart) || !/^\d{2}$/.test(dayPart)) return ''
  if (!/^[A-Z0-9]$/.test(centuryMarker || '')) return ''

  const year = (/^[A-Z]$/.test(centuryMarker) ? 2000 : 1900) + Number(yearPart)
  const month = Number(monthPart)
  const day = Number(dayPart)
  if (!isRealDate(year, month, day)) return ''

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const gradoOrder = (grado: unknown) => {
  const index = GRADOS_NORMALIZADOS.indexOf(String(grado || '').toLowerCase())
  return index >= 0 ? index : GRADOS_NORMALIZADOS.length
}

export const loadStudentIdentityReport = async (
  user: AuthSessionUser,
  filters: StudentIdentityReportFilters = {}
) => {
  if (!user?.hasFinancialAccess) {
    throw createError({ statusCode: 403, message: 'No tiene permisos financieros para acceder a este reporte.' })
  }

  const ciclo = normalizeCicloKey(filters.ciclo as any)
  const plantel = resolveReportPlantel(user, filters.plantel)
  const plantelCandidates = plantelCandidatesForProjectedScope(plantel)

  if (!plantelCandidates.length) {
    throw createError({ statusCode: 400, message: 'No se pudo resolver el plantel del reporte.' })
  }

  const rows = await query<StudentIdentityDbRow[]>(`
    SELECT
      A.matricula,
      A.apellidoPaterno,
      A.apellidoMaterno,
      A.nombres,
      A.curp,
      A.grado AS gradoBase,
      A.ciclo AS cicloBase,
      A.plantel,
      A.nivel AS nivelBase
    FROM base A
    WHERE LOWER(TRIM(CAST(A.estatus AS CHAR))) = 'activo'
      AND A.plantel IN (${plantelCandidates.map(() => '?').join(', ')})
  `, plantelCandidates)

  // CONTROL_ESCOLAR_MYSQL.matricula is the authoritative CURP source.
  // The local/Bridge base CURP remains only as an offline or missing-record fallback.
  let centralMatricula = new Map<string, any>()
  try {
    centralMatricula = await fetchCentralMatriculaOverlays(rows.map((row) => row.matricula))
  } catch {
    // Reports must remain available while a plantel is operating through Bridge offline.
  }

  const mapped: StudentIdentityReportRow[] = rows.flatMap((row) => {
    const placement = calculatePromotedGrado(
      row.gradoBase,
      row.plantel,
      row.cicloBase,
      ciclo,
      row.nivelBase
    )

    if (placement.outOfScope || normalizePlantel(placement.plantel) !== plantel) return []

    const matriculaKey = normalizeText(row.matricula).toUpperCase()
    const centralCurp = normalizeCurp(centralMatricula.get(matriculaKey)?.student?.curp)
    const resolvedCurp = centralCurp || normalizeCurp(row.curp)

    return [{
      apellidoPaterno: normalizeText(row.apellidoPaterno),
      apellidoMaterno: normalizeText(row.apellidoMaterno),
      nombres: normalizeText(row.nombres),
      grado: displayGrado(placement.grado),
      curp: resolvedCurp,
      fechaNacimiento: birthDateFromCurp(resolvedCurp),
      gradoOrden: gradoOrder(placement.grado)
    }]
  })

  const collator = new Intl.Collator('es-MX', { sensitivity: 'base', numeric: true })
  mapped.sort((left, right) => (
    left.gradoOrden - right.gradoOrden ||
    collator.compare(left.apellidoPaterno, right.apellidoPaterno) ||
    collator.compare(left.apellidoMaterno, right.apellidoMaterno) ||
    collator.compare(left.nombres, right.nombres)
  ))

  return {
    filtros: {
      ciclo,
      cicloLabel: formatCicloLabel(ciclo),
      plantel
    },
    rows: mapped,
    total: mapped.length,
    usuario: {
      nombre: normalizeText(user.name) || normalizeText(user.email),
      email: normalizeText(user.email)
    }
  }
}
