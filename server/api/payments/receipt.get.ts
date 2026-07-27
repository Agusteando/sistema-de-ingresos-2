import { runWithBridgeAgentId, query } from '../../utils/db'
import { loadActiveReceiptPayments } from '../../utils/paymentReceipt'
import { resolveNivelEscolar } from '../../../shared/utils/grado'

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const { folios } = getQuery(event)
  const { items, matricula } = await loadActiveReceiptPayments(folios)

  if (!items.length) return []

  const [studentData] = await query<any[]>(
    `SELECT grado, grupo, plantel, nivel FROM base WHERE matricula = ? LIMIT 1`,
    [matricula]
  )

  return items.map(ref => ({
    folio: ref.folio,
    folio_plantel: ref.folio_plantel,
    documento: ref.documento,
    monto: Number(ref.monto),
    importeTotal: Number(ref.importeTotal),
    saldoAntes: Number(ref.saldoAntes),
    saldoDespues: Number(ref.saldoDespues),
    pagos: Number(ref.pagos),
    pagosDespues: Number(ref.pagosDespues),
    fecha: ref.fecha,
    formaDePago: ref.formaDePago,
    depurado: Number(ref.depurado || 0) === 1,
    pago_otro_plantel: Number(ref.pago_otro_plantel || 0) === 1,
    plantel_pago: ref.plantel_pago || null,
    conceptoNombre: ref.conceptoNombre,
    mes: ref.mes,
    mesReal: ref.mesReal,
    usuario: ref.usuario,
    nombreCompleto: ref.nombreCompleto,
    matricula: ref.matricula,
    montoLetra: ref.montoLetra,
    instituto: ref.instituto,
    ciclo: ref.ciclo,
    grado: studentData?.grado || '',
    grupo: studentData?.grupo || '',
    nivel: studentData ? resolveNivelEscolar(studentData) : ''
  }))
}))
