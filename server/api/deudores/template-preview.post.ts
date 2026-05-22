import { runWithBridgeAgentId, query } from '../../utils/db'
import { getDeudoresGlobal } from '../../utils/deudores'
import {
  DEFAULT_COBRANZA_EMAIL_SUBJECT,
  DEFAULT_COBRANZA_EMAIL_TEMPLATE,
  renderCobranzaEmail
} from '../../utils/cobranza-email'

const getScopedPlantel = (user: any) => {
  return !user?.isSuperAdmin || (user?.isSuperAdmin && user?.active_plantel !== 'GLOBAL')
    ? user?.active_plantel
    : undefined
}

const normalizeBreakdown = (deudor: any) => (deudor?.desglose || [])
  .filter((item: any) => Number(item.saldo || 0) > 0)
  .map((item: any) => ({
    conceptoNombre: String(item.conceptoNombre || 'Concepto'),
    mesLabel: String(item.mesLabel || item.mesCargo || ''),
    saldo: Number(item.saldo || 0)
  }))

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const body = await readBody(event)
  const user = event.context.user
  const ciclo = String(body?.ciclo || '').trim()
  const matricula = String(body?.matricula || '').trim()
  const mes = Number(body?.mes || 0)
  const subject = String(body?.subject || DEFAULT_COBRANZA_EMAIL_SUBJECT)
  const htmlTemplate = String(body?.htmlTemplate || DEFAULT_COBRANZA_EMAIL_TEMPLATE)

  let student: any = null
  let deudor: any = null

  if (ciclo && matricula) {
    const [row] = await query<any[]>(
      `SELECT matricula, nombreCompleto, correo, \`Nombre del padre o tutor\` AS padre, plantel FROM base WHERE matricula = ? LIMIT 1`,
      [matricula]
    )
    student = row || null

    const rows = await getDeudoresGlobal({
      ciclo,
      plantel: getScopedPlantel(user),
      userEmail: user?.email,
      matricula
    })
    deudor = rows.find(row => row.matricula === matricula && (!mes || Number(row.mes) === mes)) || rows[0] || null
  }

  const rendered = renderCobranzaEmail({
    subject,
    htmlTemplate,
    context: {
      nombreAlumno: student?.nombreCompleto || 'Nombre del alumno',
      tutor: student?.padre || 'Padre, madre o tutor',
      matricula: student?.matricula || matricula || 'ST0000',
      mes: deudor?.mes || mes || new Date().getMonth() + 1,
      ciclo: ciclo || '2026',
      deuda: Number(deudor?.saldoPendiente || deudor?.saldoColegiatura || 0),
      plantel: student?.plantel || user?.active_plantel || '',
      desglose: normalizeBreakdown(deudor)
    }
  })

  return rendered
}))
