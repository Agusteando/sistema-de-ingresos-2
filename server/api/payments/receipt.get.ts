import { prisma } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { folios } = getQuery(event)
  if (!folios) return []

  const folioList = Array.isArray(folios) 
    ? folios.map(Number) 
    : String(folios).split(',').map(Number)
  
  // Utilizando Prisma para garantizar la extracción segura y tipada del recibo
  const refs = await prisma.referenciasDePago.findMany({
    where: {
      folio: { in: folioList },
      estatus: 'Vigente'
    }
  })

  if (refs.length === 0) return []

  // Obtener datos del alumno correspondientes
  const studentData = await prisma.base.findFirst({
    where: { matricula: refs[0].matricula }
  })

  // Fusión relacional para mantener estructura requerida por el frontend
  return refs.map(ref => ({
    folio: ref.folio,
    monto: Number(ref.monto),
    fecha: ref.fecha,
    formaDePago: ref.formaDePago,
    conceptoNombre: ref.conceptoNombre,
    mes: ref.mes,
    mesReal: ref.mesReal,
    usuario: ref.usuario,
    nombreCompleto: ref.nombreCompleto,
    matricula: ref.matricula,
    grado: studentData?.grado || '',
    grupo: studentData?.grupo || '',
    nivel: studentData?.nivel || ''
  }))
})