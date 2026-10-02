import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const root = resolve('.')
const studentSectionsPath = resolve(root, 'server/utils/student-sections.ts')

async function loadStudentSections({ memberships = [], queryError = null } = {}) {
  const context = vm.createContext({
    console,
    Map,
    Set,
    String,
    Number,
    Array,
  })
  const modules = new Map()

  const groupModule = new vm.SyntheticModule(
    ['canonicalizeStudentGroups'],
    function () {
      this.setExport('canonicalizeStudentGroups', students => students)
    },
    { context },
  )

  const dbModule = new vm.SyntheticModule(
    ['query'],
    function () {
      this.setExport('query', async (sql, params) => {
        if (queryError) throw queryError
        assert.match(sql, /student_custom_section_memberships/)
        assert.match(sql, /JOIN student_custom_sections/)
        assert.match(sql, /S\.is_active = 1/)
        assert.match(sql, /ORDER BY S\.sort_order ASC, S\.name ASC/)
        assert.ok(params.includes('PM'))
        return memberships
      })
    },
    { context },
  )

  async function load(path) {
    if (modules.has(path)) return modules.get(path)
    const source = await readFile(path, 'utf8')
    const js = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText
    const module = new vm.SourceTextModule(js, { context, identifier: path })
    modules.set(path, module)
    await module.link(async (specifier, parent) => {
      if (specifier === '../../shared/utils/group') return groupModule
      if (specifier === './db') return dbModule
      const candidate = resolve(dirname(parent.identifier), specifier.endsWith('.ts') ? specifier : `${specifier}.ts`)
      return load(candidate)
    })
    return module
  }

  const module = await load(studentSectionsPath)
  await module.evaluate()
  return module.namespace
}

test('report sections use Aurora active section memberships and preserve canonical order', async () => {
  const sections = await loadStudentSections({
    memberships: [
      { matricula: 'PM1000', id: 2, name: 'Comedor', plantel: 'PM', color: '#222', sort_order: 10 },
      { matricula: 'PM1000', id: 9, name: 'Becados', plantel: 'PM', color: '#999', sort_order: 20 },
      { matricula: 'PM1000', id: 12, name: 'Otra sede', plantel: 'PT', color: '#aaa', sort_order: 30 },
    ],
  })

  const rows = await sections.attachSectionLabelsToRows([
    { matricula: 'pm1000', plantel: 'PM', nombreCompleto: 'Alumno Uno' },
    { matricula: 'PM2000', plantel: 'PM', nombreCompleto: 'Alumno Dos' },
  ], { plantel: 'PM' })

  assert.equal(rows[0].seccion, 'Comedor / Becados')
  assert.equal(rows[1].seccion, '')
  assert.equal(sections.studentSectionLabel([{ name: 'Uno' }, { name: 'Dos' }]), 'Uno / Dos')
})

test('section lookup failure does not break a production report row', async () => {
  const sections = await loadStudentSections({ queryError: new Error('bridge unavailable') })
  const rows = await sections.attachSectionLabelsToRows([
    { matricula: 'PM1000', plantel: 'PM', nombreCompleto: 'Alumno Uno' },
  ], { plantel: 'PM' })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].nombreCompleto, 'Alumno Uno')
  assert.equal(rows[0].seccion, '')
})

test('every student- or movement-level report surface carries the section column', async () => {
  const files = [
    ['server/api/reports/corte_excel.get.ts', /['"]Sección['"]/, /row\.seccion/],
    ['server/api/reports/concepto_excel.get.ts', /['"]Sección['"]/, /row\.seccion/],
    ['server/api/reports/alumnos_excel.get.ts', /['"]Sección['"]/, /row\.seccion/],
    ['pages/reportes.vue', />Sección</, /row\.seccion/],
    ['pages/print/concepto.vue', />Sección</, /r\.seccion/],
    ['pages/print/corte.vue', /Sección \{\{ r\.seccion \}\}/, /r\.seccion/],
    ['pages/deudores.vue', /label: ['"]Sección['"]/, /d\.seccion/],
    ['pages/cartas-no-adeudo.vue', /Sección actual/, /row\.seccion/],
    ['pages/reporte-talleres.vue', />Sección</, /student\.seccion/],
    ['server/utils/talleres-institutional-xlsx-v2.ts', /['"]SECCIÓN['"]/, /s\.seccion/],
    ['shared/constants/controlEscolarReport.ts', /key: ['"]seccion['"]/, /label: ['"]Sección['"]/],
  ]

  for (const [path, headerPattern, valuePattern] of files) {
    const source = await readFile(resolve(root, path), 'utf8')
    assert.match(source, headerPattern, `${path} must expose the section header`)
    assert.match(source, valuePattern, `${path} must render/export the section value`)
  }
})

test('cash cut grouping includes section so different sections never collapse into one aggregate row', async () => {
  const source = await readFile(resolve(root, 'server/utils/corte-caja.ts'), 'utf8')
  assert.match(source, /const seccion = String\(row\.seccion \|\| 'Sin sección'\)/)
  assert.match(source, /const key = `\$\{fecha\}\|\$\{seccion\}\|\$\{paymentMethod\}\|\$\{categoria\}\|\$\{estatus\}`/)
})

test('Excel indexes stay aligned after inserting the section column', async () => {
  const [corte, concepto, alumnos] = await Promise.all([
    readFile(resolve(root, 'server/api/reports/corte_excel.get.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/reports/concepto_excel.get.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/reports/alumnos_excel.get.ts'), 'utf8'),
  ])

  assert.match(corte, /numericColumns:\s*\[0, 7\]/)
  assert.match(corte, /currencyColumns:\s*\[15, 16\]/)

  assert.match(concepto, /currencyColumns:\s*\[8, 9, 10\]/)
  assert.match(concepto, /dateColumns:\s*\[11\]/)
  assert.match(concepto, /numericColumns:\s*\[11\]/)
  assert.match(concepto, /dateColumns:\s*\[8\]/)
  assert.match(concepto, /numericColumns:\s*\[0, 12\]/)
  assert.match(concepto, /currencyColumns:\s*\[20, 21\]/)
  assert.match(concepto, /dateColumns:\s*\[10\]/)

  assert.match(alumnos, /dateColumns:\s*\[6\]/)
})
