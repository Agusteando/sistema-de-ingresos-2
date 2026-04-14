import { executeTransaction, query } from '../../utils/db'
import { numeroALetras } from '../../utils/numberToWords'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { matricula, pagos, formaDePago, ciclo = '2024' } = body

  if (!matricula || !pagos || !pagos.length) {
    throw createError({ statusCode: 400, message: 'Faltan parámetros operativos' })
  }

  const [studentRef] = await query<any[]>(`SELECT nombreCompleto, plantel FROM base WHERE matricula = ?`, [matricula])
  const nombreCompleto = studentRef ? studentRef.nombreCompleto : ''
  const plantel = studentRef ? studentRef.plantel : 'PT'
  const instituto = (plantel === 'PT' || plantel === 'PM' || plantel === 'SM') ? 1 : 0

  const folios = await executeTransaction(async (conn) => {
    const results = []
    for (const p of pagos) {
      if (p.montoPagado <= 0) continue
      
      const letra = numeroALetras(p.montoPagado)
      
      // Strict exact column mapping (19 positional elements)
      const [insert] = await conn.execute(`
        INSERT INTO referenciasdepago (
          matricula, documento, mes, mesReal, nombreCompleto, concepto, conceptoNombre,
          monto, montoLetra, importeTotal, saldoAntes, saldoDespues, pagos, pagosDespues,
          recargo, usuario, formaDePago, plantel, instituto, ciclo, estatus
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, 'Admin', ?, ?, ?, ?, 'Vigente'
        )
      `, [
        matricula, p.documento, p.mes, p.mesLabel, nombreCompleto, p.documento, p.conceptoNombre,
        p.montoPagado, letra, p.subtotal, p.saldoAntes, p.saldoAntes - p.montoPagado, p.pagosPrevios, p.pagosPrevios + p.montoPagado,
        p.hasRecargo ? 1 : 0, formaDePago, plantel, instituto, ciclo
      ])
      results.push((insert as any).insertId)
    }
    return results
  })

  return { success: true, folios }
})