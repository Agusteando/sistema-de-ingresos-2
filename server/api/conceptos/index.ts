import { runWithBridgeAgentId, query } from '../../utils/db'
import { controlEscolarCentralQuery, getCentralTableColumns } from '../../utils/control-escolar-central'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'

const escapeIdentifier = (value: string) => `\`${String(value).replace(/`/g, '``')}\``

const optionalConceptColumn = (columns: Set<string>, column: string, fallbackSql: string, alias = column) => {
  return columns.has(column) ? `${escapeIdentifier(column)} AS ${escapeIdentifier(alias)}` : `${fallbackSql} AS ${escapeIdentifier(alias)}`
}

const cicloCandidatesFor = (value: unknown) => {
  const key = normalizeCicloKey(value)
  const candidates = new Set<string>()
  if (key) {
    candidates.add(key)
    const numeric = Number(key)
    if (Number.isFinite(numeric) && numeric > 1900 && numeric < 2200) {
      candidates.add(`${numeric}-${numeric + 1}`)
    }
  }
  const raw = String(value || '').trim()
  if (raw) candidates.add(raw)
  return [...candidates].filter(Boolean)
}

const buildConceptSearchWhere = (search: string, params: any[], columns: Set<string>, sourceAlias = '') => {
  const prefix = sourceAlias ? `${sourceAlias}.` : ''
  if (!search) return ''

  const fields = [`CAST(${prefix}id AS CHAR)`, `${prefix}concepto`]
  if (columns.has('description')) fields.push(`${prefix}description`)
  if (columns.has('plantel')) fields.push(`${prefix}plantel`)
  if (columns.has('costo')) fields.push(`CAST(${prefix}costo AS CHAR)`)

  params.push(...fields.map(() => `%${search}%`))
  return ` AND (${fields.map((field) => `${field} LIKE ?`).join(' OR ')})`
}

const readCentralConceptosForCycle = async (ciclo: unknown, search: string) => {
  const columns = await getCentralTableColumns('conceptos')
  const cicloCandidates = cicloCandidatesFor(ciclo)
  const selectParts = [
    'id',
    'concepto',
    optionalConceptColumn(columns, 'costo', '0'),
    optionalConceptColumn(columns, 'description', "''"),
    optionalConceptColumn(columns, 'plantel', "''"),
    optionalConceptColumn(columns, 'eventual', '0'),
    optionalConceptColumn(columns, 'plazo', "'1'"),
    optionalConceptColumn(columns, 'ciclo', "''")
  ]

  const params: any[] = []
  let where = `WHERE concepto IS NOT NULL AND TRIM(concepto) <> ''`

  if (columns.has('ciclo') && cicloCandidates.length) {
    where += ` AND CAST(ciclo AS CHAR) IN (${cicloCandidates.map(() => '?').join(', ')})`
    params.push(...cicloCandidates)
  }

  where += buildConceptSearchWhere(search, params, columns)

  return await controlEscolarCentralQuery<any[]>(`
    SELECT ${selectParts.join(', ')}
      FROM conceptos
      ${where}
     ORDER BY concepto ASC
  `, params)
}

const readBridgeConceptosForCycle = async (event: any, ciclo: unknown, search: string) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const cicloKey = normalizeCicloKey(ciclo)
  const params: any[] = [cicloKey]
  let where = 'ciclo = ?'

  if (search) {
    where += ' AND (concepto LIKE ? OR description LIKE ? OR CAST(id AS CHAR) = ?)'
    params.push(`%${search}%`, `%${search}%`, search)
  }

  return await query(`
    SELECT id, concepto, costo, description, plantel, eventual, plazo, ciclo
    FROM conceptos
    WHERE ${where}
    ORDER BY concepto ASC
  `, params)
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0, must-revalidate')

  const method = event.node.req.method

  if (method === 'GET') {
    const { ciclo = '2025', q = '' } = getQuery(event)
    const search = String(Array.isArray(q) ? q[0] : q || '').trim()

    try {
      return await readCentralConceptosForCycle(ciclo, search)
    } catch (error) {
      console.warn('[conceptos] central unavailable; falling back to Bridge conceptos.', error)
      return await readBridgeConceptosForCycle(event, ciclo, search)
    }
  }

  if (method === 'POST') {
    throw createError({
      statusCode: 405,
      message: 'Los conceptos se administran desde la fuente central.'
    })
  }

  throw createError({ statusCode: 405, message: 'Metodo no permitido.' })
})
