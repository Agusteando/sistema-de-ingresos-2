import { prisma } from '../../utils/db'
import { numeroALetras } from '../../utils/numberToWords'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { matricula, pagos, formaDePago, ciclo = '2024' } = body
  const user = event.context.user

  if (!matricula || !pagos || !pagos.length) {
    throw createError({ statusCode: 400, message: 'Faltan parámetros obligatorios.' })
  }

  // Leer información vital del estudiante mediante Prisma garantizando modelo estricto
  const studentRef = await prisma.base.findFirst({
    where: { matricula: matricula }
  })

  if (!studentRef) {
    throw createError({ statusCode: 404, message: 'Alumno no encontrado.' })
  }

  const nombreCompleto = studentRef.nombreCompleto
  const plantel = studentRef.plantel || 'PT'
  const instituto = (plantel === 'PT' || plantel === 'PM' || plantel === 'SM') ? 1 : 0

  // Migración a Prisma Client Transaction
  const resultFolios = await prisma.$transaction(async (tx) => {
    const folios: number[] = []

    for (const p of pagos) {
      if (p.montoPagado <= 0) continue

      const montoDecimal = Number(p.montoPagado)
      const letra = numeroALetras(montoDecimal)

      const nuevoPago = await tx.referenciasDePago.create({
        data: {
          matricula: matricula,
          documento: Number(p.documento),
          mes: p.mes,
          mesReal: p.mesLabel,
          nombreCompleto: nombreCompleto,
          concepto: String(p.documento),
          conceptoNombre: p.conceptoNombre,
          monto: montoDecimal,
          montoLetra: letra,
          importeTotal: Number(p.subtotal),
          saldoAntes: Number(p.saldoAntes),
          saldoDespues: Number(p.saldoAntes) - montoDecimal,
          pagos: Number(p.pagosPrevios),
          pagosDespues: Number(p.pagosPrevios) + montoDecimal,
          recargo: p.hasRecargo ? 1 : 0,
          usuario: user?.name || 'Sistema',
          formaDePago: formaDePago,
          plantel: plantel,
          instituto: instituto,
          ciclo: ciclo,
          estatus: 'Vigente'
        }
      })

      folios.push(nuevoPago.folio)
    }

    return folios
  })

  return { success: true, folios: resultFolios }
})