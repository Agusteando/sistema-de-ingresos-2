import { query } from './db'

export const NO_ADEUDO_MARK_TABLE = 'no_adeudo_deudor_cartas'
export const NO_ADEUDO_HISTORY_TABLE = 'no_adeudo_cartas_envios'

const quoteIdentifier = (value: string) => `\`${String(value).replace(/`/g, '``')}\``

export const isMissingNoAdeudoBridgeTableError = (error: any) => {
  const code = String(error?.code || error?.data?.diagnostic?.code || error?.diagnostic?.code || '').toUpperCase()
  const message = String(error?.message || error?.sqlMessage || error?.data?.message || '')
  return code === 'ER_NO_SUCH_TABLE' || (
    /no_adeudo_deudor_cartas|no_adeudo_cartas_envios/i.test(message) &&
    /doesn.?t exist|no existe/i.test(message)
  )
}

export const assertNoAdeudoBridgeTablesAvailable = async () => {
  try {
    await Promise.all([
      query<any[]>(`SELECT 1 FROM ${quoteIdentifier(NO_ADEUDO_MARK_TABLE)} LIMIT 1`),
      query<any[]>(`SELECT 1 FROM ${quoteIdentifier(NO_ADEUDO_HISTORY_TABLE)} LIMIT 1`)
    ])
  } catch (error: any) {
    if (isMissingNoAdeudoBridgeTableError(error)) {
      throw createError({
        statusCode: 500,
        message: 'El bridge del plantel no tiene preparado el historial de cartas de no adeudo.'
      })
    }
    throw error
  }
}
