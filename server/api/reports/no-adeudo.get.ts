import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { displayGrado, normalizeNivelEscolar } from '../../../shared/utils/grado'
import { resolveFinancialFamilyContact } from '../../../shared/utils/familyContact'
import { PLANTELES_LIST } from '../../../utils/constants'
import { normalizePlantel } from '../../utils/auth-session'
import { fetchCentralMatriculaOverlays } from '../../utils/central-matricula-overlay'
import { controlEscolarCentralQuery } from '../../utils/control-escolar-central'

const NO_ADEUDO_MARK_TABLE = 'no_adeudo_deudor_cartas'
const VALID_PLANTELES = new Set(PLANTELES_LIST)

const firstQueryValue = (value: unknown) => {
  if (Array.isArray(value)) return firstQueryValue(value[0])
  return value === null || value === undefined ? '' : String(value).trim()
}

const normalizeDate = (value: unknown, label: string) => {
  const normalized = firstQueryValue(value)
  if (!normalized) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw createError({ statusCode: 400, message: `${label} debe usar el formato AAAA-MM-DD.` })
  }
  return normalized
}

const isMissingMarkTable = (error: any) => {
  const code = String(error?.code || '').toUpperCase()
  const message = String(error?.message || error?.sqlMessage || '')
  return code === 'ER_NO_SUCH_TABLE' || (
    /no_adeudo_deudor_cartas/i.test(message) && /doesn.?t exist|no existe/i.test(message)
  )
}

const displayNivel = (value: unknown) => {
  const normalized = normalizeNivelEscolar(value)
  if (normalized) return normalized
  const text = String(value || '').trim()
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : ''
}

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user?.hasFinancialAccess) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para consultar este reporte.' })
  }

  const requestQuery = getQuery(event)
  const requestedPlantel = normalizePlantel(firstQueryValue(requestQuery.plantel))
  if (requestedPlantel && requestedPlantel !== 'GLOBAL' && !VALID_PLANTELES.has(requestedPlantel)) {
    throw createError({ statusCode: 400, message: 'Plantel inválido.' })
  }

  const authorizedPlanteles = Array.from(new Set<string>(
    (user.financialPlantelesList || user.plantelesList || [])
      .map(normalizePlantel)
      .filter((plantel: string) => VALID_PLANTELES.has(plantel))
  ))
  const activePlantel = normalizePlantel(user.active_plantel)
  const canFilterPlantel = Boolean(user.isSuperAdmin && activePlantel === 'GLOBAL')
  const scopePlanteles = canFilterPlantel
    ? (requestedPlantel && requestedPlantel !== 'GLOBAL' ? [requestedPlantel] : authorizedPlanteles)
    : [activePlantel].filter((plantel) => VALID_PLANTELES.has(plantel))

  if (!scopePlanteles.length) {
    throw createError({ statusCode: 403, message: 'La sesión no tiene planteles financieros disponibles para este reporte.' })
  }
  if (scopePlanteles.some((plantel) => !authorizedPlanteles.includes(plantel))) {
    throw createError({ statusCode: 403, message: 'No tiene permisos para consultar el plantel solicitado.' })
  }

  const cicloInput = firstQueryValue(requestQuery.ciclo)
  const ciclo = cicloInput ? normalizeCicloKey(cicloInput) : ''
  const inicio = normalizeDate(requestQuery.inicio, 'La fecha inicial')
  const fin = normalizeDate(requestQuery.fin, 'La fecha final')
  const search = firstQueryValue(requestQuery.search).slice(0, 120).toLowerCase()

  if (inicio && fin && inicio > fin) {
    throw createError({ statusCode: 400, message: 'La fecha inicial no puede ser posterior a la fecha final.' })
  }

  const where = [`plantel IN (${scopePlanteles.map(() => '?').join(', ')})`]
  const params: any[] = [...scopePlanteles]
  if (ciclo) {
    where.push('ciclo = ?')
    params.push(ciclo)
  }
  if (inicio) {
    where.push('sent_at >= ?')
    params.push(`${inicio} 00:00:00`)
  }
  if (fin) {
    where.push('sent_at <= ?')
    params.push(`${fin} 23:59:59`)
  }

  let markRows: any[] = []
  const warnings: string[] = []
  try {
    markRows = await controlEscolarCentralQuery<any[]>(`
      SELECT
        plantel,
        matricula,
        ciclo,
        folio,
        DATE_FORMAT(sent_at, '%Y-%m-%d %H:%i:%s') AS sentAt,
        sent_by_name AS sentByName,
        sent_by_email AS sentByEmail
      FROM \`${NO_ADEUDO_MARK_TABLE}\`
      WHERE ${where.join(' AND ')}
      ORDER BY sent_at DESC, plantel ASC, matricula ASC
    `, params)
  } catch (error: any) {
    if (!isMissingMarkTable(error)) throw error
    warnings.push('La tabla de marcas existente no está disponible. No se creó ni modificó ninguna estructura.')
  }

  let centralOverlays = new Map<string, any>()
  if (markRows.length) {
    try {
      centralOverlays = await fetchCentralMatriculaOverlays(markRows.map((row) => String(row.matricula || '')))
    } catch (error: any) {
      console.error('[No Adeudo Report] No se pudo consultar la referencia actual de matrícula:', error?.message || error)
      warnings.push('No se pudieron cargar los datos actuales del alumno. Las marcas históricas permanecen disponibles.')
    }
  }

  let rows = markRows.map((row) => {
    const matricula = String(row.matricula || '').trim().toUpperCase()
    const student = centralOverlays.get(matricula)?.student || {}
    const familyContact = resolveFinancialFamilyContact(student)
    const gradoRaw = String(student.grado || '').trim()

    return {
      plantel: String(row.plantel || '').trim().toUpperCase(),
      matricula,
      ciclo: String(row.ciclo || '').trim(),
      folio: String(row.folio || '').trim(),
      sentAt: String(row.sentAt || '').trim(),
      sentByName: String(row.sentByName || '').trim(),
      sentByEmail: String(row.sentByEmail || '').trim().toLowerCase(),
      currentStudentName: String(
        student.nombreCompleto || student.nombreCompletoAlumno || student.fullName || ''
      ).trim(),
      currentNivel: displayNivel(student.nivel),
      currentGrado: gradoRaw ? displayGrado(gradoRaw) : '',
      currentGrupo: String(student.grupo || '').trim(),
      currentTutorName: String(familyContact.tutorName || '').trim()
    }
  })

  if (search) {
    rows = rows.filter((row) => [
      row.plantel,
      row.matricula,
      row.ciclo,
      row.folio,
      row.sentByName,
      row.sentByEmail,
      row.currentStudentName,
      row.currentNivel,
      row.currentGrado,
      row.currentGrupo,
      row.currentTutorName
    ].some((value) => String(value || '').toLowerCase().includes(search)))
  }

  const students = new Set(rows.map((row) => `${row.plantel}::${row.matricula}`))
  const senders = new Set(
    rows
      .map((row) => String(row.sentByEmail || row.sentByName || '').trim().toLowerCase())
      .filter(Boolean)
  )
  const reportPlanteles = new Set(rows.map((row) => row.plantel).filter(Boolean))

  return {
    rows,
    summary: {
      totalMarks: rows.length,
      students: students.size,
      senders: senders.size,
      planteles: reportPlanteles.size,
      lastMarkedAt: rows[0]?.sentAt || ''
    },
    warnings,
    scope: {
      plantel: scopePlanteles.length === 1 ? scopePlanteles[0] : 'GLOBAL',
      canFilterPlantel
    },
    semantics: {
      source: NO_ADEUDO_MARK_TABLE,
      readOnly: true,
      includesOnlyExistingMarks: true,
      recipientEmailAvailable: false,
      currentStudentFieldsAreHistorical: false
    }
  }
})
