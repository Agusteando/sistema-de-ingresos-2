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

const timeValue = (value: unknown) => {
  if (value instanceof Date) return value.getTime()
  const parsed = new Date(String(value || '')).getTime()
  return Number.isFinite(parsed) ? parsed : 0
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
    .sort((a, b) => timeValue(a.fechaRegistro) - timeValue(b.fechaRegistro) || Number(a.folio) - Number(b.folio))

  return {
    receipts,
    total: result.total,
    totalRegistrado: result.totalRegistrado,
    totalNoAplicado: result.totalNoAplicado,
    filtros: result.filtros,
    generadoPor: result.usuario
  }
}
