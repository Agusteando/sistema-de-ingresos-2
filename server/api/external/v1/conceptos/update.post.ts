import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../utils/external-api-auth'
import { withControlEscolarCentralConnection } from '../../../../utils/control-escolar-central'

const columnOrder = [
  'id', 'concepto', 'costo', 'description', 'plantel', 'eventual', 'plazo', 'ciclo'
]

const placeholders = columnOrder.map(() => '?').join(', ')
const upsertSql = `INSERT INTO conceptos (${columnOrder.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${columnOrder.map((col) => `\`${col}\`=VALUES(\`${col}\`)`).join(', ')}`

const isBlank = (value: unknown) => value === null || value === undefined || String(value).trim() === ''

const isEffectivelyEmptyRow = (row: unknown) => {
  if (!Array.isArray(row)) return false

  return row.every((value, index) => {
    if (index === 2 || index === 5) {
      return isBlank(value) || Number(value) === 0
    }
    return isBlank(value)
  })
}

export default defineEventHandler(async (event) => {
  setExternalApiResponseHeaders(event, 0)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')

  const auth = assertAuroraExternalApiToken(event)
  if (auth.source !== 'AURORA_API_TOKEN') {
    throw createError({
      statusCode: 401,
      statusMessage: 'AURORA_API_UNAUTHORIZED',
      message: 'Este endpoint requiere AURORA_API_TOKEN.'
    })
  }

  const body = await readBody(event)
  const data = Array.isArray(body) ? body : body?.rows

  if (!Array.isArray(data) || data.length === 0) {
    setResponseStatus(event, 400)
    return 'Invalid data'
  }

  const errors: string[] = []
  let skippedEmptyRows = 0

  try {
    await withControlEscolarCentralConnection(async (connection) => {
      for (const row of data) {
        if (isEffectivelyEmptyRow(row)) {
          skippedEmptyRows += 1
          continue
        }

        const values = row.map((value: any, index: number) => {
          if (columnOrder[index] === 'id' && isBlank(value)) {
            return null
          }
          if (columnOrder[index] === 'costo') {
            return parseFloat(value)
          }
          if (columnOrder[index] === 'eventual') {
            return value ? parseInt(value, 10) : 0
          }
          return value
        })

        try {
          await connection.query(upsertSql, values)
        } catch (error: any) {
          const message = `Error processing row: ${JSON.stringify(row)} - ${error?.message || error}`
          console.error(message)
          errors.push(message)
        }
      }
    })

    if (skippedEmptyRows > 0) {
      console.info(`[conceptos/update] Ignored ${skippedEmptyRows} empty spreadsheet rows.`)
    }

    if (errors.length > 0) {
      setResponseStatus(event, 207)
      return `Data updated with some errors: ${errors.join('; ')}`
    }

    return 'Data updated successfully'
  } catch (error: any) {
    console.error(error)
    setResponseStatus(event, 500)
    return `Error updating data: ${error?.message || error}`
  }
})
