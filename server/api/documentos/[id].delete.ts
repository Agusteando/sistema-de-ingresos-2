import { prisma } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const id = Number(event.context.params?.id)
  
  if (!id) {
    throw createError({ statusCode: 400, message: 'Identificador de documento no proporcionado.' })
  }

  // Protección de lógica de negocio legacy: No es posible eliminar un documento si cuenta con cobros vigentes
  const associatedPayments = await prisma.referenciasDePago.findFirst({
    where: { 
      documento: id, 
      estatus: 'Vigente' 
    }
  })

  if (associatedPayments) {
    throw createError({ statusCode: 409, message: 'Bloqueo de eliminación: Existen pagos vigentes aplicados a este concepto.' })
  }

  // Actualización de estado en vez de Hard Delete, protegiendo integridad relacional
  await prisma.documentos.update({
    where: { documento: id },
    data: { estatus: 'Cancelado' }
  })

  return { success: true }
})