import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../utils/external-api-auth'
import { withControlEscolarCentralConnection } from '../../../../utils/control-escolar-central'

const columnOrder = [
  'id', 'concepto', 'costo', 'description', 'plantel', 'eventual', 'plazo', 'ciclo'
]

const placeholders = columnOrder.map(() => '?').join(', ')
const upsertSql = `INSERT INTO conceptos (${columnOrder.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${columnOrder.map((col) => `\`${col}\`=VALUES(\`${col}\`)`).join(', ')}`

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

  try {
    await withControlEscolarCentralConnection(async (connection) => {
      for (const row of data) {
        const values = row.map((value: any, index: number) => {
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
