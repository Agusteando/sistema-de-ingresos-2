import { query } from './db'
import { normalizePlantel } from './auth-session'

const CONFIG_MATRICULA = '__COBRANZA_CONFIG__'
const CONFIG_CICLO = 'GLOBAL'
const CONFIG_MES = 0
const ACTION_PREFIX = 'saldo_tolerancia_'

export const normalizeDeudoresSaldoMargin = (value: unknown) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return 0
  return Math.trunc(numeric)
}

const actionForPlantel = (plantel: string) => `${ACTION_PREFIX}${normalizePlantel(plantel)}`

const parseMetadata = (value: unknown) => {
  if (value && typeof value === 'object') return value as Record<string, any>
  try {
    return JSON.parse(String(value || '{}'))
  } catch {
    return {}
  }
}

export const loadDeudoresSaldoMargins = async (planteles: unknown[] = []) => {
  const normalized = Array.from(new Set(
    planteles.map(normalizePlantel).filter(Boolean)
  ))
  const result = new Map<string, number>(normalized.map((plantel) => [plantel, 0]))
  if (!normalized.length) return result

  const actions = normalized.map(actionForPlantel)
  const rows = await query<any[]>(
    `SELECT accion, metadata
       FROM cobranza_eventos
      WHERE matricula = ? AND ciclo = ? AND mes = ?
        AND accion IN (${actions.map(() => '?').join(',')})`,
    [CONFIG_MATRICULA, CONFIG_CICLO, CONFIG_MES, ...actions]
  )

  for (const row of rows) {
    const action = String(row?.accion || '')
    if (!action.startsWith(ACTION_PREFIX)) continue
    const plantel = normalizePlantel(action.slice(ACTION_PREFIX.length))
    if (!result.has(plantel)) continue
    const metadata = parseMetadata(row?.metadata)
    result.set(plantel, normalizeDeudoresSaldoMargin(metadata?.saldoMargin))
  }

  return result
}

export const saveDeudoresSaldoMargin = async ({
  plantel,
  saldoMargin,
  updatedBy,
}: {
  plantel: unknown
  saldoMargin: unknown
  updatedBy: unknown
}) => {
  const normalizedPlantel = normalizePlantel(plantel)
  if (!normalizedPlantel) {
    throw createError({ statusCode: 400, message: 'Plantel requerido.' })
  }

  const margin = normalizeDeudoresSaldoMargin(saldoMargin)
  const metadata = JSON.stringify({
    kind: 'deudores_saldo_margin',
    plantel: normalizedPlantel,
    saldoMargin: margin,
    version: 1,
  })

  await query(
    `INSERT INTO cobranza_eventos (matricula, ciclo, mes, accion, fecha, usuario, metadata)
     VALUES (?, ?, ?, ?, NOW(), ?, ?)
     ON DUPLICATE KEY UPDATE fecha = NOW(), usuario = VALUES(usuario), metadata = VALUES(metadata)`,
    [
      CONFIG_MATRICULA,
      CONFIG_CICLO,
      CONFIG_MES,
      actionForPlantel(normalizedPlantel),
      String(updatedBy || 'sistema'),
      metadata,
    ]
  )

  return { plantel: normalizedPlantel, saldoMargin: margin }
}
