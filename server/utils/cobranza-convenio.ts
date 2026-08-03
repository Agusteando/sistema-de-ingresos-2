import { query } from './db'
import { getSchoolMonthForDateKey, normalizeDateKey } from './cobranza-period'

export type ActiveCobranzaConvention = {
  mes: number
  fechaLimiteEspecial: string
  motivo: string
}

export const loadActiveCobranzaConvention = async ({
  matricula,
  ciclo,
  currentDate
}: {
  matricula: unknown
  ciclo: string
  currentDate: unknown
}): Promise<ActiveCobranzaConvention | null> => {
  const normalizedMatricula = String(matricula || '').trim()
  const currentDateKey = normalizeDateKey(currentDate)
  const schoolMonth = getSchoolMonthForDateKey(ciclo, currentDateKey)

  if (!normalizedMatricula || !ciclo || !currentDateKey || schoolMonth < 1) return null

  const [row] = await query<any[]>(`
    SELECT mes, fecha_limite_especial, motivo
    FROM cobranza_excepciones
    WHERE matricula = ?
      AND ciclo = ?
      AND mes = ?
      AND activa = 1
      AND DATE(fecha_limite_especial) >= ?
    ORDER BY fecha_limite_especial DESC, id DESC
    LIMIT 1
  `, [normalizedMatricula, ciclo, schoolMonth, currentDateKey])

  if (!row) return null

  return {
    mes: Number(row.mes || schoolMonth),
    fechaLimiteEspecial: normalizeDateKey(row.fecha_limite_especial),
    motivo: String(row.motivo || '').trim()
  }
}
