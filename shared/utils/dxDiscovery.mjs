// Evidence extraction only. A source reference is never a claim of runtime use.
const codeFile = /\.(?:[cm]?[jt]sx?|vue|php|py|json)$/i
export const isDiscoverySource = (path) => codeFile.test(path)
  && !/(?:^|\/)(?:node_modules|vendor|dist|build|coverage|\.output|\.nuxt|\.git|tests?|__tests__|fixtures?|docs?|public|assets)(?:\/|$)/i.test(path)
  && !/(?:lock|\.min)\.(?:json|js)$|(?:package-lock|composer\.lock)|\.test\.|\.spec\./i.test(path)
  && !/(?:^|\/)\.env(?:\.|$)/i.test(path)

export const stringLiterals = (source) => {
  const values = []
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '/' && source[i + 1] === '/') { i = source.indexOf('\n', i + 2); if (i < 0) break; continue }
    if (source[i] === '/' && source[i + 1] === '*') { const end = source.indexOf('*/', i + 2); if (end < 0) break; i = end + 1; continue }
    if (!['\'', '"', '`'].includes(source[i])) continue
    const quote = source[i], start = i++
    for (; i < source.length; i++) {
      if (source[i] === '\\') { i++; continue }
      if (source[i] === quote) { values.push({ value: source.slice(start + 1, i), index: start }); break }
    }
  }
  return values
}
const normalizePath = (value) => {
  let path = String(value).replace(/\\\//g, '/').replace(/^\$\{[^}]+\}(?=\/api\/)/, '')
  if (/^https?:\/\//.test(path)) { try { path = new URL(path).pathname } catch { return '' } }
  return path.split('?')[0].split('#')[0].replace(/\$\{[^}]*\}/g, ':value').replace(/\/+$/, '') || '/'
}
export const routeMatches = (pattern, path) => {
  const a = normalizePath(pattern).split('/'), b = normalizePath(path).split('/')
  if (a.at(-1) === '*') return b.length >= a.length - 1 && a.slice(0, -1).every((part, i) => part.startsWith(':') || part === b[i])
  return a.length === b.length && a.every((part, i) => part.startsWith(':') || part === '*' || part === b[i])
}
export const findIntegrationRoute = (routes, path, method) => {
  const matches = routes.filter(route => route.method === method && routeMatches(route.path, path))
  return matches.find(route => normalizePath(route.path) === normalizePath(path))
    || matches.sort((a, b) => (a.path.match(/[:*]/g)?.length || 0) - (b.path.match(/[:*]/g)?.length || 0))[0]
}
export const studentStats = (rows) => {
  const ids = new Set(), groups = new Set()
  let withoutGroup = 0
  for (const row of rows) {
    const id = String(row?.matricula || row?.studentId || '').trim().toUpperCase()
    if (!id || row?.snapshotEmpty === true) continue
    const plantel = String(row.plantel || row.plantel_code || '').trim().toUpperCase()
    const key = plantel + ':' + id
    if (ids.has(key)) continue
    ids.add(key)
    const grade = String(row.grado || row.grade || '').trim().toLocaleUpperCase('es')
    const group = String(row.grupo || row.group || '').trim().toLocaleUpperCase('es')
    if (group) groups.add([plantel, row.nivel || '', grade, group].join('|'))
    else withoutGroup++
  }
  return { students: ids.size, groups: groups.size, withoutGroup }
}

export const compareStudentRecords = (first, second, aliases = {}) => {
  const text = value => String(value ?? '').trim().toLocaleUpperCase('es')
  const index = rows => {
    const result = new Map()
    for (const row of rows) {
      const id = text(row.matricula || row.studentId)
      if (!id) continue
      const matches = result.get(id) || []; matches.push(row); result.set(id, matches)
    }
    return result
  }
  const a = index(first), b = index(second)
  return [...new Set([...a.keys(), ...b.keys()])].sort().map(id => {
    const left = a.get(id) || [], right = b.get(id) || []
    const values = (rows, field) => [...new Set(rows.map(row => String(row[field] ?? '').trim()))].join(' | ')
    const campus = rows => rows.map(row => aliases[row.plantel] || row.plantel).map(text).sort().join('|')
    const differences = []
    if (left.length > 1) differences.push('Duplicada A')
    if (right.length > 1) differences.push('Duplicada B')
    if (!left.length) differences.push('Solo B')
    else if (!right.length) differences.push('Solo A')
    else {
      if (campus(left) !== campus(right)) differences.push('plantel')
      for (const field of ['grado', 'grupo', 'enrollmentState', 'status']) {
        if (left.some(row => row[field] != null) && right.some(row => row[field] != null) && text(values(left, field)) !== text(values(right, field))) differences.push(field)
      }
    }
    const campuses = [...new Set([...left, ...right].map(row => row.plantel).filter(Boolean))].join(' / ')
    return { plantel: campuses, matricula: id, nombre: values(left.length ? left : right, 'nombreCompleto'), grado_A: values(left, 'grado'), grupo_A: values(left, 'grupo'),
      grado_B: values(right, 'grado'), grupo_B: values(right, 'grupo'), diferencia: differences.join(', ') }
  })
}

export const discoverConsumer = (repository, files, routes) => {
  const entries = Object.entries(files).filter(([path]) => isDiscoverySource(path))
  const bases = new Set()
  for (const [, source] of entries) for (const { value } of stringLiterals(source)) {
    const base = value.match(/(?:https?:\/\/[^/\s'"`]+)?(\/api\/external\/v\d+(?:\/[a-z0-9-]+)*)\/?$/i)?.[1]
    if (base) bases.add(base)
  }
  const contracts = new Map(), shared = new Map(), caches = new Map()
  const versions = new Set(), domains = new Set()
  let name = repository.name || repository.full_name?.split('/').pop() || repository.fullName?.split('/').pop()
  try {
    const config = JSON.parse(files['migration.config.json'] || '{}')
    name = config.app || name
    for (const item of config.domains || []) if (item.hostname) domains.add(item.hostname.toLowerCase())
  } catch {}
  const evidence = (path, source, index) => ({ path, line: source.slice(0, index).split('\n').length })
  const publishedTables = new Set(routes.flatMap(r => r.tables || []).filter(t => /^control_external_/.test(t)))
  for (const [path, source] of entries) {
    if (!/aurora|control_external_/i.test(source + '\n' + path)) continue
    const literals = stringLiterals(source)
    for (const { value } of literals) if (/^(?:control-escolar-student-view|talleres-roster)-/.test(value)) versions.add(value)
    for (const { value, index } of literals) {
      if (!value.startsWith('/') && !/^https?:\/\//.test(value) && !/^\$\{[^}]+\}\/api\//.test(value)) continue
      const direct = normalizePath(value)
      const candidates = [direct]
      if (!direct.startsWith('/api/')) for (const base of bases) candidates.push(base + (direct === '/' ? '' : direct))
      const callOptions = source.slice(index, index + 1000).split(/\n\s*(?:export|function)\b/)[0]
      const explicitMethod = callOptions.match(/\bmethod\s*:\s*['"](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)['"]/i)?.[1]?.toUpperCase()
      const matched = new Map(candidates.flatMap(candidate => {
        const route = findIntegrationRoute(routes, candidate, explicitMethod || 'GET')
        return route ? [[route.id, route]] : []
      }))
      for (const route of matched.values()) {
        const refs = contracts.get(route.id) || []
        if (!refs.some(ref => ref.path === path && ref.line === evidence(path, source, index).line)) refs.push(evidence(path, source, index))
        contracts.set(route.id, refs)
      }
    }
    for (const table of publishedTables) {
      const index = source.indexOf(table)
      if (index >= 0 && /SELECT|dbQuery|query\s*\(/i.test(source)) {
        const refs = shared.get(table) || []
        refs.push(evidence(path, source, index)); shared.set(table, refs)
      }
    }
    // Actual materialized consumer storage, rather than a fabricated per-app count.
    for (const m of source.matchAll(/(?:INSERT\s+INTO|UPDATE)\s+[`"]?([a-z][a-z0-9_]*)(?:[`"\s(])/gi)) {
      const refs = caches.get(m[1]) || []; refs.push(evidence(path, source, m.index)); caches.set(m[1], refs)
    }
  }
  if (!contracts.size && !shared.size) return null
  return {
    id: repository.full_name || repository.fullName, name, branch: repository.default_branch || repository.defaultBranch || 'main',
    revision: repository.revision || repository.pushed_at || null, domains: [...domains],
    contracts: [...contracts].map(([routeId, evidence]) => ({ routeId, evidence })),
    shared: [...shared].map(([table, evidence]) => ({ table, versions: [...versions], evidence })),
    caches: [...caches].map(([table, evidence]) => ({ table, evidence })),
    patterns: [shared.size ? 'MySQL compartido' : '', contracts.size ? 'HTTP' : '', caches.size ? 'Guarda datos' : ''].filter(Boolean)
  }
}
