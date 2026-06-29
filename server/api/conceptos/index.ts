import { runWithBridgeAgentId, query } from '../../utils/db'
import { controlEscolarCentralQuery, getCentralTableColumns } from '../../utils/control-escolar-central'
import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { enrichConceptosWithStock } from '../../utils/conceptos-stock'
import { createCentralConcepto, readCentralConceptMediaForIds, requireConceptosAdmin } from '../../utils/conceptos-config'

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
    optionalConceptColumn(columns, 'ciclo', "''"),
    columns.has('image_url') ? '`image_url` AS `image_url`' : columns.has('imagen_url') ? '`imagen_url` AS `image_url`' : columns.has('imagen') ? '`imagen` AS `image_url`' : 'NULL AS `image_url`'
  ]

  const params: any[] = []
  let where = `WHERE concepto IS NOT NULL AND TRIM(concepto) <> ''`

  if (columns.has('ciclo') && cicloCandidates.length) {
    where += ` AND CAST(ciclo AS CHAR) IN (${cicloCandidates.map(() => '?').join(', ')})`
    params.push(...cicloCandidates)
  }

  where += buildConceptSearchWhere(search, params, columns)

  const rows = await controlEscolarCentralQuery<any[]>(`
    SELECT ${selectParts.join(', ')}
      FROM conceptos
      ${where}
     ORDER BY concepto ASC
  `, params)
  const media = await readCentralConceptMediaForIds(rows.map((row) => Number(row?.id || 0)))
  return rows.map((row) => ({ ...row, image_url: row.image_url || media.get(Number(row?.id || 0)) || null }))
}

const readBridgeConceptosForCycle = async (event: any, ciclo: unknown, search: string) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const cicloKey = normalizeCicloKey(ciclo)
  const params: any[] = [cicloKey]
  let where = 'ciclo = ?'

  if (search) {
    where += ' AND (concepto LIKE ? OR description LIKE ? OR CAST(id AS CHAR) = ?)'
    params.push(`%${search}%`, `%${search}%`, search)
  }

  const mediaTables = await query<any[]>(`SHOW TABLES LIKE 'concepto_media'`).catch(() => [])
  if (mediaTables.length) {
    const aliasedParams: any[] = [cicloKey]
    let aliasedWhere = 'c.ciclo = ?'
    if (search) {
      aliasedWhere += ' AND (c.concepto LIKE ? OR c.description LIKE ? OR CAST(c.id AS CHAR) = ?)'
      aliasedParams.push(`%${search}%`, `%${search}%`, search)
    }
    return await query(`
      SELECT c.id, c.concepto, c.costo, c.description, c.plantel, c.eventual, c.plazo, c.ciclo, m.image_url
      FROM conceptos c
      LEFT JOIN concepto_media m ON m.concepto_id = c.id AND IFNULL(m.activo, 1) = 1
      WHERE ${aliasedWhere}
      ORDER BY c.concepto ASC
    `, aliasedParams)
  }

  return await query(`
    SELECT id, concepto, costo, description, plantel, eventual, plazo, ciclo, NULL AS image_url
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

    const plantel = String(getQuery(event).plantel || event.context.user?.active_plantel || event.context.dbBridgeAgentId || '').trim().toUpperCase()
    const stockPlantel = plantel && plantel !== 'GLOBAL' ? plantel : String(event.context.dbBridgeAgentId || event.context.user?.auth_home_plantel || 'PT').trim().toUpperCase()

    try {
      const rows = await readCentralConceptosForCycle(ciclo, search)
      const enriched = await enrichConceptosWithStock(rows, stockPlantel)
      return enriched.conceptos
    } catch (error) {
      console.warn('[conceptos] central unavailable; falling back to Bridge conceptos.', error)
      const rows = await readBridgeConceptosForCycle(event, ciclo, search)
      const enriched = await enrichConceptosWithStock(rows as any[], stockPlantel)
      return enriched.conceptos
    }
  }

  if (method === 'POST') {
    const user = await requireConceptosAdmin(event)
    const body = await readBody(event)
    return await createCentralConcepto(body, user)
  }

  throw createError({ statusCode: 405, message: 'Metodo no permitido.' })
})
