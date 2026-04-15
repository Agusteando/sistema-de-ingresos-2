import { prisma } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { folios } = getQuery(event)
  if (!folios) return []

  const folioList = Array.isArray(folios) 
    ? folios.map(Number) 
    : String(folios).split(',').map(Number)
  
  const refs = await prisma.referenciasDePago.findMany({
    where: {
      folio: { in: folioList },
      estatus: 'Vigente'
    }
  })

  if (refs.length === 0) return []

  const studentData = await prisma.base.findFirst({
    where: { matricula: refs[0].matricula }
  })

  return refs.map(ref => ({
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
    nivel: studentData?.nivel || ''
  }))
})