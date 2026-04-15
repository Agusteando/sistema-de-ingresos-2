import { prisma } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const user = event.context.user

  const pago = await prisma.referenciasDePago.findUnique({
    where: { folio: Number(body.folio) }
  })

  if (!pago) {
    throw createError({ statusCode: 404, message: 'Pago no encontrado en el sistema.' })
  }

  // Lógica de cancelación fiel al legacy: Operadores solicitan, Global Admin ejecuta
  if (user.role === 'global') {
    await prisma.referenciasDePago.update({
      where: { folio: pago.folio },
      data: { estatus: 'Cancelada', cancelada_por: user.name }
    })
    return { success: true, status: 'canceled' }
  } else {
    await prisma.solicitudesCancelaciones.create({
      data: {
        folio: pago.folio,
        motivo: body.motivo || 'Solicitud generada por operador',
        monto: Number(pago.monto),
        nombreCompleto: pago.nombreCompleto,
        conceptoNombre: pago.conceptoNombre,
        usuario: user.name,
        usuarioId: 0, // Identificador de paso
        status: 'pendiente'
      }
    })
    return { success: true, status: 'pending' }
  }
})