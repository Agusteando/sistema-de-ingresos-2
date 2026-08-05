import { runWithBridgeAgentId, query } from '../../../../utils/db'
import { listStudentInvoices, syncStudentInvoices } from '../../../../utils/student-invoices'
import { normalizeCicloKey } from '../../../../../shared/utils/ciclo'
import {
  isInProjectedPlantelScopeForCiclo,
  normalizePlantel,
} from '../../../../../shared/utils/grado'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const matricula = String(event.context.params?.matricula || '').trim()
  if (!matricula) throw createError({ statusCode: 400, message: 'Matrícula requerida.' })

  const user = event.context.user || {}
  const queryParams = getQuery(event)
  const ciclo = normalizeCicloKey(queryParams.ciclo || '')
  const scope = String(queryParams.scope || 'current') === 'all' ? 'all' : 'current'
  const shouldSync = ['1', 'true', 'yes'].includes(String(queryParams.sync || '').toLowerCase())

  const [student] = await query<any[]>(
    `SELECT matricula, plantel, nivel, grado, ciclo FROM base WHERE matricula = ? LIMIT 1`,
    [matricula],
  )
  const [invoiceEvidence] = await query<any[]>(
    `SELECT COUNT(*) AS total FROM facturas WHERE matricula = ?`,
    [matricula],
  )

  if (!student && !Number(invoiceEvidence?.total || 0)) {
    throw createError({ statusCode: 404, message: 'Alumno no encontrado.' })
  }

  const activePlantel = normalizePlantel(user?.active_plantel)
  const scoped = !user?.isSuperAdmin || (user?.isSuperAdmin && activePlantel !== 'GLOBAL')
  const hasInvoiceEvidence = Number(invoiceEvidence?.total || 0) > 0
  if (student && scoped) {
    const allowed = isInProjectedPlantelScopeForCiclo(
      student.grado,
      student.plantel,
      student.ciclo,
      ciclo || student.ciclo,
      student.nivel,
      activePlantel,
    )
    if (!allowed && !hasInvoiceEvidence) {
      throw createError({ statusCode: 403, message: 'No tienes acceso a las facturas de este plantel.' })
    }
    if (!allowed && hasInvoiceEvidence) {
      console.info('[InvoiceIndex] Se conserva acceso por evidencia financiera histórica.', {
        matricula,
        activePlantel,
        basePlantel: normalizePlantel(student.plantel),
        ciclo,
      })
    }
  } else if (!student && scoped && hasInvoiceEvidence) {
    console.info('[InvoiceIndex] Historial cargado sin registro base, usando evidencia financiera local.', {
      matricula,
      activePlantel,
      ciclo,
    })
  }

  let syncWarning = ''
  let synchronized = 0
  if (shouldSync) {
    const syncResult = await syncStudentInvoices(matricula)
    synchronized = syncResult.updated
    syncWarning = syncResult.warning
  }

  const invoices = await listStudentInvoices({ matricula, cycle: ciclo, scope })
  return {
    invoices,
    total: invoices.length,
    synchronized,
    warning: syncWarning,
    scope,
    ciclo,
    generatedAt: new Date().toISOString(),
  }
}))
