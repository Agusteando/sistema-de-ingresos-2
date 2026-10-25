import { controlEscolarCentralQuery as query } from './control-escolar-central'
import type { IntegrationRoute } from './dx-discovery'

const identifier = (name: string) => {
  if (!/^[a-z][a-z0-9_]*$/i.test(name)) throw new Error('DX_INVALID_IDENTIFIER')
  return '`' + name + '`'
}
const iso = (value: any) => value ? new Date(value).toISOString() : null
const numeric = (value: any) => Number(value || 0)
const marks = (values: any[]) => values.map(() => '?').join(',')
const computeIntegrationData = async (ciclo: string, planteles: string[], consumers: any[], routes: IntegrationRoute[]) => {
  const sources: any[] = [], errors: any[] = []
  if (!planteles.length) return { sources, errors }
  const published = [...new Set(routes.flatMap(route => route.tables))]
  let existing = new Set<string>()
  try { existing = new Set((await query<any[]>('SHOW TABLES')).map(row => String(Object.values(row)[0]))) }
  catch { return { sources, errors: [{ code: 'CENTRAL_METADATA_UNAVAILABLE' }] } }
  const cacheOwners = new Map<string, any[]>()
  for (const consumer of consumers) for (const cache of consumer.caches || []) {
    const owners = cacheOwners.get(cache.table) || []; owners.push(consumer); cacheOwners.set(cache.table, owners)
  }
  for (const table of [...new Set([...published, ...cacheOwners.keys()])]) {
    if (!existing.has(table)) continue
    try {
      const columns = new Set((await query<any[]>('SHOW COLUMNS FROM ' + identifier(table))).map(row => row.Field))
      if (columns.has('scope_key') && columns.has('view_version') && columns.has('payload_json') && columns.has('matricula') && columns.has('grupo')) {
        const rows = await query<any[]>(`SELECT plantel, scope_key, view_version,
          COUNT(DISTINCT CASE WHEN COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.snapshotEmpty')), 'false') <> 'true' THEN matricula END) AS students,
          COUNT(DISTINCT CASE WHEN TRIM(grupo) <> '' THEN CONCAT_WS('|',nivel,grado,UPPER(TRIM(grupo))) END) AS groups_count,
          SUM(CASE WHEN TRIM(grupo) = '' AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.snapshotEmpty')), 'false') <> 'true' THEN 1 ELSE 0 END) AS without_group,
          MIN(generated_at) AS generated_at, MIN(stale_after) AS stale_after, MIN(expires_at) AS expires_at
          FROM ${identifier(table)} WHERE ciclo_key = ? AND plantel IN (${marks(planteles)})
          GROUP BY plantel, scope_key, view_version ORDER BY generated_at DESC`, [ciclo, ...planteles])
        const byVersion = new Map<string, any>()
        for (const row of rows) {
          const id = 'snapshot:' + table + ':' + row.view_version
          const source = byVersion.get(id) || { id, table, version: row.view_version, kind: 'snapshot', cycle: ciclo, label: row.view_version, campuses: {}, owners: [], routeIds: [] }
          // Match the snapshot reader's latest-scope selection. Alternative
          // scopes are exposed, never added together into an invented total.
          if (!source.campuses[row.plantel]) source.campuses[row.plantel] = {
            students: numeric(row.students), groups: numeric(row.groups_count), withoutGroup: numeric(row.without_group),
            generatedAt: iso(row.generated_at), staleAfter: iso(row.stale_after), expiresAt: iso(row.expires_at), scopeKey: row.scope_key, alternatives: 0
          }
          else source.campuses[row.plantel].alternatives++
          byVersion.set(id, source)
        }
        for (const source of byVersion.values()) {
          source.routeIds = routes.filter(route => route.tables.includes(table) && (!route.versions.length || route.versions.includes(source.version))).map(route => route.id)
          source.owners = consumers.filter(consumer => consumer.shared?.some((ref: any) => ref.table === table && (!ref.versions.length || ref.versions.includes(source.version)))).map(consumer => consumer.id)
          sources.push(source)
        }
      } else if (cacheOwners.has(table)) {
        const pick = (...names: string[]) => names.find(name => columns.has(name)) || ''
        const fields = {
          identity: pick('matricula', 'student_id'), campus: pick('plantel', 'plantel_code'),
          grade: pick('grado', 'grade'), group: pick('grupo', 'group'), level: pick('nivel', 'level'), name: pick('nombre_completo', 'full_name', 'nombre'),
          cycle: pick('ciclo_key', 'ciclo', 'school_year'), updated: pick('last_seen_at', 'synced_at', 'updated_at', 'generated_at')
        }
        if (!fields.identity || !fields.campus || !fields.grade || !fields.group) continue
        const params = [...planteles, ...(fields.cycle ? [ciclo, ciclo + '-' + (Number(ciclo) + 1)] : [])]
        const where = `${identifier(fields.campus)} IN (${marks(planteles)})` + (fields.cycle ? ` AND ${identifier(fields.cycle)} IN (?,?)` : '')
        const rows = await query<any[]>(`SELECT ${identifier(fields.campus)} AS plantel, COUNT(DISTINCT ${identifier(fields.identity)}) AS students,
          COUNT(DISTINCT CASE WHEN TRIM(${identifier(fields.group)}) <> '' THEN CONCAT_WS('|',${fields.level ? identifier(fields.level) + ',' : ''}${identifier(fields.grade)},UPPER(TRIM(${identifier(fields.group)}))) END) AS groups_count,
          SUM(CASE WHEN TRIM(COALESCE(${identifier(fields.group)},'')) = '' THEN 1 ELSE 0 END) AS without_group
          ${fields.updated ? ', MAX(' + identifier(fields.updated) + ') AS updated_at' : ''}
          FROM ${identifier(table)} WHERE ${where} GROUP BY ${identifier(fields.campus)}`, params)
        sources.push({ id: 'cache:' + table, table, kind: 'consumer-cache', cycle: fields.cycle ? ciclo : null, label: table, fields,
          owners: cacheOwners.get(table)!.map(consumer => consumer.id), routeIds: [],
          campuses: Object.fromEntries(rows.map(row => [row.plantel, { students: numeric(row.students), groups: numeric(row.groups_count), withoutGroup: numeric(row.without_group), updatedAt: iso(row.updated_at) }])) })
      }
    } catch (error: any) { errors.push({ table, code: String(error?.code || 'DATA_READ_FAILED') }) }
  }
  return { sources, errors }
}

const summaryCache = new Map<string, { at: number; result: Promise<any> }>()
export const summarizeIntegrationData = async (ciclo: string, planteles: string[], consumers: any[], routes: IntegrationRoute[], force = false) => {
  const key = JSON.stringify([ciclo, [...planteles].sort(), consumers.map(consumer => [consumer.id, consumer.shared, consumer.caches]), routes.map(route => [route.id, route.tables, route.versions])])
  let cached = summaryCache.get(key)
  if (force || !cached || Date.now() - cached.at > 30000) {
    cached = { at: Date.now(), result: computeIntegrationData(ciclo, planteles, consumers, routes) }
    summaryCache.set(key, cached)
    if (summaryCache.size > 20) summaryCache.delete(summaryCache.keys().next().value as string)
  }
  const result = await cached.result
  // The response can append observed HTTP datasets without altering this cache.
  return { ...result, sources: [...result.sources], measuredAt: new Date(cached.at).toISOString() }
}

export const integrationRecords = async (source: any, planteles: string[], ciclo: string) => {
  if (!planteles.length) return { rows: [], incomplete: false }
  if (source.kind === 'snapshot') {
    const scopes = planteles.flatMap(plantel => source.campuses[plantel]?.scopeKey ? [source.campuses[plantel].scopeKey] : [])
    if (!scopes.length) return { rows: [], incomplete: false }
    const rows = await query<any[]>(`SELECT matricula, nombre_completo AS nombreCompleto, plantel, nivel, grado, grupo, status, enrollment_state AS enrollmentState,
      generated_at AS generado, scope_key AS alcance FROM ${identifier(source.table)}
      WHERE ciclo_key = ? AND view_version = ? AND plantel IN (${marks(planteles)}) AND scope_key IN (${marks(scopes)})
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.snapshotEmpty')), 'false') <> 'true'
      ORDER BY plantel, matricula LIMIT 25001`, [ciclo, source.version, ...planteles, ...scopes])
    return { rows: rows.slice(0, 25000), incomplete: rows.length > 25000 }
  }
  if (source.kind === 'consumer-cache') {
    const f = source.fields
    const select = [[f.identity, 'matricula'], [f.campus, 'plantel'], [f.grade, 'grado'], [f.group, 'grupo'], [f.level, 'nivel'], [f.name, 'nombreCompleto'], [f.updated, 'actualizado']]
      .filter(([field]) => field).map(([field, alias]) => identifier(field) + ' AS ' + identifier(alias)).join(',')
    const rows = await query<any[]>(`SELECT ${select} FROM ${identifier(source.table)}
      WHERE ${identifier(f.campus)} IN (${marks(planteles)}) ${f.cycle ? 'AND ' + identifier(f.cycle) + ' IN (?,?)' : ''}
      ORDER BY ${identifier(f.campus)}, ${identifier(f.identity)} LIMIT 25001`, [...planteles, ...(f.cycle ? [ciclo, ciclo + '-' + (Number(ciclo) + 1)] : [])])
    return { rows: rows.slice(0, 25000), incomplete: rows.length > 25000 }
  }
  return { rows: [], incomplete: false }
}
