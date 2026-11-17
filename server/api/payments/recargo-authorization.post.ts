import { query, runWithBridgeAgentId } from '../../utils/db'
import { loadStudentDebts } from '../students/[matricula]/debts.get'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { canRemoveLateFee, hasLateFeeRemovalAccess } from '../../../shared/utils/recargo'
import { formatMexicoCityDateKeyFromUnix } from '../../utils/payment-time'
import { loadGlobalRecargoSettings } from '../../utils/recargo-config'
import { validPaymentAttemptId } from '../../utils/payment-attempt-id.mjs'
import { notifyDocumentAmountCorrection } from '../../utils/telegram-document-audit'
import { requestRecargoTelegramAuthorization, waivedTargetsFromPayload } from '../../utils/recargo-telegram-authorization.mjs'

const clean = (value: unknown) => String(value ?? '').replace(/[\r\n*_\x60\[\]]/g, ' ').trim()
const money = (value: unknown) => Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const user = event.context.user
  const actor = String(user?.email || '').trim().toLowerCase()
  const roles = user?.roles || user?.role
  const financialPlanteles = user?.financialPlantelesList || user?.financialPlanteles
  if (!actor || !user?.hasFinancialAccess || !hasLateFeeRemovalAccess({ roles, financialPlanteles })) {
    throw createError({ statusCode: 403, message: 'No tienes permisos para solicitar el retiro de recargos.' })
  }
  const body = await readBody(event)
  const payload = body?.payload
  const reference = validPaymentAttemptId(body?.reference)
  const reason = String(body?.motivo || '').trim()
  const matricula = String(payload?.matricula || '').trim()
  const ciclo = normalizeCicloKey(payload?.ciclo)
  const agent = String(event.context.dbBridgeAgentId || user?.active_plantel || '').trim().toUpperCase()
  if (!reference || !agent || !matricula || !ciclo || reason.length < 8 || reason.length > 400) {
    throw createError({ statusCode: 400, message: 'Indica un motivo de 8 a 400 caracteres y un pago válido.' })
  }
  const [clock] = await query<any[]>('SELECT UNIX_TIMESTAMP() AS currentUnix')
  const dateKey = formatMexicoCityDateKeyFromUnix(Number(clock?.currentUnix || Math.floor(Date.now() / 1000)))
  const settings = await loadGlobalRecargoSettings()
  if (canRemoveLateFee({ roles, financialPlanteles, currentDateValue: dateKey, allowAnyTime: settings.allowRemovalAnyTime })) {
    throw createError({ statusCode: 409, message: 'La política actual ya permite quitar el recargo sin código.' })
  }
  let targets
  try { targets = waivedTargetsFromPayload(payload) }
  catch (error: any) { throw createError({ statusCode: error.statusCode || 400, message: error.message }) }
  const [debts, students] = await Promise.all([
    loadStudentDebts(event, { matricula, ciclo }),
    query<any[]>('SELECT nombreCompleto, plantel FROM base WHERE matricula = ? LIMIT 1', [matricula]),
  ])
  const student = students[0]
  if (!student) throw createError({ statusCode: 404, message: 'Alumno no encontrado.' })
  const details = targets.map(target => {
    const debt = debts.find((row: any) => Number(row.documento) === target.documento && String(row.mes) === target.mes)
    if (!debt || debt.montoFinalPendiente || debt.recargoEligible === false || debt.isEventual ||
      (!debt.hasRecargo && Number(debt.recargoMonto || 0) <= 0)) {
      throw createError({ statusCode: 409, message: 'El recargo seleccionado cambió o ya no está vigente. Actualiza la cuenta.' })
    }
    return { label: clean(debt.conceptoNombre || 'Concepto'), mes: clean(debt.mesLabel || target.mes),
      documento: target.documento, recargo: Math.max(0, Number(debt.subtotal || 0) - Number(debt.costoOriginal || 0)) }
  })
  const total = details.reduce((sum, row) => sum + row.recargo, 0)
  const trace = String(event.context.auroraRequestId || '')
  try {
    const result = await requestRecargoTelegramAuthorization({
      actor, agent, reference, payload, reason,
      message: (code: string) => [
        '*Autorización de retiro de recargos*',
        'Operador: ' + clean(user.name || actor) + ' · Plantel: ' + clean(student.plantel || agent),
        'Alumno: ' + clean(student.nombreCompleto || matricula) + ' (' + clean(matricula) + ')',
        ...details.map(row => 'Documento #' + row.documento + ' · ' + row.label + ' · ' + row.mes + ' · Recargo: $' + money(row.recargo)),
        'Total a retirar: $' + money(total),
        'Motivo: ' + clean(reason),
        'Código: *' + code + '* (10 min)',
      ].join('\n'),
      notify: notifyDocumentAmountCorrection,
    })
    console.info('[RecargoTelegram] Authorization requested', { actor, agent, matricula, targets: targets.map(t => t.key), reference, trace })
    return { success: true, ...result }
  } catch (error: any) {
    console.warn('[RecargoTelegram] Authorization request denied', { actor, agent, reference, trace, statusCode: error?.statusCode || 502 })
    throw createError({ statusCode: error?.statusCode || 502, message: error?.message || 'No se pudo solicitar autorización.' })
  }
}))
