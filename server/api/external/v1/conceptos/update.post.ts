import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../utils/external-api-auth'
import { withControlEscolarCentralConnection } from '../../../../utils/control-escolar-central'

const COLUMN_COUNT = 8
const COLUMN_ORDER = ['id', 'concepto', 'costo', 'description', 'plantel', 'eventual', 'plazo', 'ciclo'] as const

const UPSERT_SQL = `
  INSERT INTO conceptos (${COLUMN_ORDER.map((column) => `\`${column}\``).join(', ')})
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    id = VALUES(id),
    concepto = VALUES(concepto),
    costo = VALUES(costo),
    description = VALUES(description),
    plantel = VALUES(plantel),
    eventual = VALUES(eventual),
    plazo = VALUES(plazo),
    ciclo = VALUES(ciclo)
`

const normalizeLegacyRow = (row: unknown, rowNumber: number) => {
  if (!Array.isArray(row)) {
    throw createError({
      statusCode: 400,
      message: `La fila ${rowNumber} no es un arreglo.`
    })
  }

  if (row.length < COLUMN_COUNT) {
    throw createError({
      statusCode: 400,
      message: `La fila ${rowNumber} tiene ${row.length} columnas; se esperaban al menos ${COLUMN_COUNT}.`
    })
  }

  const values = row.slice(0, COLUMN_COUNT)
  const parsedCost = Number.parseFloat(String(values[2] ?? ''))
  const parsedEventual = Number.parseInt(String(values[5] ?? ''), 10)

  values[2] = Number.isNaN(parsedCost) ? 0 : parsedCost
  values[5] = Number.isNaN(parsedEventual) ? 0 : parsedEventual

  return values
}

export default defineEventHandler(async (event) => {
  setExternalApiResponseHeaders(event, 0)
  setResponseHeader(event, 'Cache-Control', 'no-store')

  const auth = assertAuroraExternalApiToken(event)
  if (auth.source !== 'AURORA_API_TOKEN') {
    throw createError({
      statusCode: 401,
      statusMessage: 'AURORA_API_UNAUTHORIZED',
      message: 'Este endpoint requiere AURORA_API_TOKEN.'
    })
  }

  const body = await readBody(event)
  const rawRows = Array.isArray(body) ? body : body?.rows

  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'Envía un arreglo no vacío de filas de conceptos.'
    })
  }

  const rows = rawRows.map((row, index) => normalizeLegacyRow(row, index + 1))
  const errors: Array<{ row: number; id: unknown; error: string }> = []
  let processed = 0

  await withControlEscolarCentralConnection(async (connection) => {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      try {
        await connection.query(UPSERT_SQL, row)
        processed += 1
      } catch (error: any) {
        errors.push({
          row: index + 1,
          id: row[0] ?? null,
          error: String(error?.message || 'Error desconocido al actualizar el concepto.')
        })
      }
    }
  })

  if (errors.length > 0) {
    setResponseStatus(event, 500)
    return {
      ok: false,
      message: 'Algunas filas no pudieron procesarse.',
      processed,
      failed: errors.length,
      errors
    }
  }

  return {
    ok: true,
    message: 'Todos los conceptos fueron procesados correctamente.',
    processed
  }
})
