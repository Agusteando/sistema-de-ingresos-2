import type { AuthSessionUser } from './auth-session'
import { loadPlantelCorteCaja } from './corte-caja'
import { query } from './db'
import { resolveReceiptAcademicPlacement } from './paymentReceipt'

type CorteReceiptFilters = {
  inicio?: unknown
  fin?: unknown
  plantel?: unknown
}

type StudentPlacementRow = {
  matricula: string
  grado?: string | null
  grupo?: string | null
  plantel?: string | null
  nivel?: string | null
  ciclo?: string | null
}


export const loadPlantelCorteReceiptStrips = async (
  user: AuthSessionUser,
  filters: CorteReceiptFilters = {}
) => {
  const result = await loadPlantelCorteCaja(user, filters)
  const matriculas = Array.from(new Set(result.rows
    .map(row => String(row.matricula || '').trim())
    .filter(Boolean)))

  const students = matriculas.length
    ? await query<StudentPlacementRow[]>(
        `SELECT matricula, grado, grupo, plantel, nivel, ciclo FROM base WHERE matricula IN (?)`,
        [matriculas]
      )
    : []
  const studentsByMatricula = new Map(students.map(student => [String(student.matricula), student]))

  const receipts = result.rows
    .map(row => {
      const student = studentsByMatricula.get(String(row.matricula || ''))
      const placement = resolveReceiptAcademicPlacement(student, row.ciclo)

      return {
        receiptId: [
          result.filtros.plantel,
          row.folio,
          row.documento,
          row.fecha instanceof Date ? row.fecha.toISOString() : String(row.fecha || '')
        ].join(':'),
        folio: row.folio,
        folio_plantel: row.folio_plantel || null,
        documento: row.documento,
        monto: Number(row.monto || 0),
        montoAplicado: Number(row.montoAplicado || 0),
        importeTotal: Number(row.importeTotal || 0),
        saldoAntes: Number(row.saldoAntes || 0),
        saldoDespues: Number(row.saldoDespues || 0),
        pagos: Number(row.pagos || 0),
        pagosDespues: Number(row.pagosDespues || 0),
        fecha: row.fechaPago || row.fecha,
        fechaRegistro: row.fecha,
        formaDePago: row.formaDePago,
        depurado: Number(row.depurado || 0) === 1,
        pago_otro_plantel: Number(row.pago_otro_plantel || 0) === 1,
        plantel_pago: row.plantel_pago || null,
        plantel: row.scopePlantel || row.plantel || null,
        conceptoNombre: row.conceptoNombre,
        mes: row.mes,
        mesReal: row.mesReal,
        usuario: row.usuario || row.usuario_email || 'No identificado',
        usuario_email: row.usuario_email || null,
        nombreCompleto: row.nombreCompleto,
        matricula: row.matricula,
        montoLetra: row.montoLetra || null,
        instituto: row.instituto,
        ciclo: row.ciclo,
        grado: placement.grado,
        grupo: student?.grupo || '',
        nivel: placement.nivel,
        estatusCorte: row.estatusCorte,
        cancelada_por: row.cancelada_por || null
      }
    })

  const sourceFolios = result.rows.map(row => Number(row.folio))
  const receiptFolios = receipts.map(receipt => Number(receipt.folio))
  const preservesCorteRows = sourceFolios.length === receiptFolios.length
    && sourceFolios.every((folio, index) => folio === receiptFolios[index])

  if (!preservesCorteRows) {
    throw createError({
      statusCode: 500,
      message: 'No fue posible preparar la serie completa de recibos del corte de caja.'
    })
  }

  return {
    receipts,
    sourceCount: result.rows.length,
    sourceFolios,
    total: result.total,
    totalRegistrado: result.totalRegistrado,
    totalNoAplicado: result.totalNoAplicado,
    filtros: result.filtros,
    generadoPor: result.usuario
  }
}
