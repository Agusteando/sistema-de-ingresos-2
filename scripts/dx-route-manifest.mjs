import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, relative, dirname, resolve } from 'node:path'
import { parse } from '@babel/parser'

// Follow referenced symbols, not every import in a module: importing db.ts must
// not make every API look like a consumer of every database-backed service.
export const buildDxRouteManifest = (root) => {
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)])
  const cache = new Map()
  const inspect = file => {
    if (cache.has(file)) return cache.get(file)
    const text = readFileSync(file, 'utf8')
    const ast = parse(text, { sourceType: 'module', plugins: ['typescript'] })
    const symbols = new Map(), imports = new Map()
    let entry = null
    for (let node of ast.program.body) {
      if (node.type === 'ImportDeclaration') {
        if (!node.source.value.startsWith('.')) continue
        const base = resolve(dirname(file), node.source.value)
        const target = [base, base + '.ts', base + '.mjs', base + '.js', join(base, 'index.ts')].find(path => existsSync(path) && /\.(?:ts|mjs|js)$/.test(path))
        if (!target) continue
        for (const specifier of node.specifiers) imports.set(specifier.local.name, { file: target, name: specifier.imported?.name || 'default' })
      }
      if (node.type === 'ExportDefaultDeclaration') { entry = node.declaration; continue }
      if (node.type === 'ExportNamedDeclaration') node = node.declaration
      if (!node) continue
      if (node.type === 'FunctionDeclaration' && node.id) symbols.set(node.id.name, node)
      if (node.type === 'VariableDeclaration') for (const declaration of node.declarations) if (declaration.id.type === 'Identifier') symbols.set(declaration.id.name, declaration.init)
    }
    const result = { text, symbols, imports, entry }; cache.set(file, result); return result
  }
  const identifiers = node => {
    const names = new Set()
    const visit = value => {
      if (!value || typeof value !== 'object') return
      if (value.type === 'Identifier') names.add(value.name)
      for (const [key, child] of Object.entries(value)) {
        if (['loc', 'start', 'end', 'comments', 'leadingComments', 'trailingComments', 'typeAnnotation'].includes(key)) continue
        if (Array.isArray(child)) child.forEach(visit)
        else if (child && typeof child === 'object') visit(child)
      }
    }
    visit(node); return names
  }
  return walk(join(root, 'server/api/external')).filter(file => /\.[a-z]+\.(?:ts|js)$/.test(file)).map(file => {
    const rel = relative(join(root, 'server/api'), file).replaceAll('\\', '/')
    const method = rel.match(/\.([a-z]+)\.(?:ts|js)$/)[1].toUpperCase()
    const path = '/api/' + rel.replace(/\.[a-z]+\.(?:ts|js)$/, '').replace(/(?:^|\/)index$/, '').replace(/\[\.\.\.[^\]]+\]/g, '*').replace(/\[([^\]]+)\]/g, ':$1')
    const visited = new Set(), queue = [[file, 'default', 0]], lineage = new Set(), tables = new Set(), versions = new Set()
    while (queue.length) {
      const [current, symbol, depth] = queue.shift()
      const key = current + ':' + symbol
      if (visited.has(key) || depth > 12) continue
      visited.add(key)
      if (/\/(?:db|control-escolar-central|external-api-auth|auth-session)\.[tj]s$/.test(current)) continue
      const module = inspect(current), node = symbol === 'default' ? module.entry : module.symbols.get(symbol)
      if (!node) continue
      lineage.add(relative(root, current).replaceAll('\\', '/'))
      const text = module.text.slice(node.start, node.end)
      for (const match of text.matchAll(/['"`]((?:control_external_)[a-z0-9_]+)['"`]/g)) tables.add(match[1])
      for (const match of text.matchAll(/['"]((?:control-escolar-student-view|talleres-roster)-[^'"]+)['"]/g)) versions.add(match[1])
      for (const name of identifiers(node)) {
        if (module.symbols.has(name)) queue.push([current, name, depth + 1])
        else if (module.imports.has(name)) { const target = module.imports.get(name); queue.push([target.file, target.name, depth + 1]) }
      }
    }
    return { id: method + ':' + path, path, method, file: relative(root, file).replaceAll('\\', '/'), lineage: [...lineage], tables: [...tables], versions: [...versions] }
  }).sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
}
