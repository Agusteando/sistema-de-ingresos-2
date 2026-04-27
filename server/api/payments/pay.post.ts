import { executeStatementTransaction, query, type SqlStatement } from '../../utils/db'
import { numeroALetras } from '../../utils/numberToWords'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'

const normalizePaymentMethod = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { matricula, pagos, formaDePago, ciclo = '2025' } = body
  const cicloKey = normalizeCicloKey(ciclo)
  const user = event.context.user

  if (!matricula || !pagos || !pagos.length) {
    throw createError({ statusCode: 400, message: 'Faltan parámetros obligatorios.' })
  }

  if (normalizePaymentMethod(formaDePago) === 'depuracion') {
    throw createError({ statusCode: 400, message: 'La depuración requiere autorización por código.' })
  }

  const [studentRef] = await query<any[]>(
    `SELECT * FROM base WHERE matricula = ? LIMIT 1`,
    [matricula]
  )

  if (!studentRef) {
    throw createError({ statusCode: 404, message: 'Alumno no encontrado.' })
  }

  const nombreCompleto = studentRef.nombreCompleto
  const plantel = studentRef.plantel || 'PT'
  const instituto = (plantel === 'PT' || plantel === 'PM' || plantel === 'SM') ? 1 : 0

  const statements: SqlStatement[] = []

  for (const p of pagos) {
    if (p.montoPagado <= 0) continue

    const montoDecimal = Number(p.montoPagado)
    const letra = numeroALetras(montoDecimal)

    statements.push({
      sql: `
        INSERT INTO referenciasdepago (
          matricula,
          documento,
          mes,
          mesReal,
          nombreCompleto,
          concepto,
          conceptoNombre,
          monto,
          montoLetra,
          importeTotal,
          saldoAntes,
          saldoDespues,
          pagos,
          pagosDespues,
          recargo,
          usuario,
          formaDePago,
          plantel,
          instituto,
          ciclo,
          estatus
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        matricula,
        Number(p.documento),
        p.mes,
        p.mesLabel,
        nombreCompleto,
        String(p.documento),
        p.conceptoNombre,
        montoDecimal,
        letra,
        Number(p.subtotal),
        Number(p.saldoAntes),
        Number(p.saldoAntes) - montoDecimal,
        Number(p.pagosPrevios),
        Number(p.pagosPrevios) + montoDecimal,
        p.hasRecargo ? 1 : 0,
        user?.name || 'Sistema',
        formaDePago,
        plantel,
        instituto,
        cicloKey,
        'Vigente'
      ]
    })
  }

  const results = await executeStatementTransaction<any>(statements)
  const resultFolios = results.map(result => Number(result.insertId)).filter(Boolean)

  return { success: true, folios: resultFolios }
})
