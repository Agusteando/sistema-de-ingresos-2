import assert from 'node:assert/strict'
import test from 'node:test'
import { createInstitutionalControlEscolarSheets } from '../server/utils/control-escolar-institutional-sheets.mjs'
import { loadInstitutionalControlEscolarScopes } from '../server/utils/control-escolar-institutional-load.mjs'

const fields = [
  { key: 'plantel', label: 'Plantel', width: 12 },
  { key: 'fullName', label: 'Alumno', width: 30 },
  { key: 'grado', label: 'Grado', width: 12 },
  { key: 'cicloEscolar', label: 'Ciclo escolar', width: 16 },
  { key: 'huskyPassPlaintext', label: 'Contraseña Husky Pass', width: 22 },
]
test('institutional XLSX model preserves projected grade, selected ciclo, and every campus scope', () => {
  const scopes = [
    { plantel: 'PM', rows: [
      { matricula: 'PM1', fullName: 'Alumno 1', grado: 'Segundo', enrollmentState: 'inscrito', tipoIngresoValue: 'interno', huskyPassPlaintext: 'secreto1' },
      { matricula: 'PM2', fullName: 'Alumno 2', grado: 'Primero', enrollmentState: 'no_inscrito', tipoIngresoValue: 'externo' },
    ] },
    { plantel: 'PT', rows: [
      { matricula: 'PT1', fullName: 'Alumno 3', grado: 'Tercero', enrollmentState: 'inscrito', tipoIngresoValue: 'externo' },
    ] },
    { plantel: 'GM', rows: [] },
  ]
  const sheets = createInstitutionalControlEscolarSheets({
    scopes, fields, selectedFields: ['grado', 'fullName', 'cicloEscolar'],
    cicloLabel: '2026-2027', statusLabel: 'Toda la población', generatedLabel: 'hoy',
  })
  assert.deepEqual(sheets.map((sheet) => sheet.name), ['Resumen', 'General', 'PM', 'PT', 'GM'])
  assert.deepEqual(sheets[1].columns.map((column) => column.key), ['plantel', 'fullName', 'grado', 'cicloEscolar'])
  assert.equal(sheets[1].rows.length, 3)
  assert.equal(sheets[1].rows[0].grado, 'Primero')
  assert.equal(sheets[1].rows[0].cicloEscolar, '2026-2027')
  assert.equal(sheets[1].rows[1].grado, 'Segundo')
  assert.equal(sheets[1].rows[2].plantel, 'PT')
  assert.equal('huskyPassPlaintext' in sheets[1].rows[0], false)
  assert.deepEqual(sheets[0].rows.map((row) => [row.plantel, row.total]), [['PM', 2], ['PT', 1], ['GM', 0]])
  assert.equal(sheets[0].totalRow.total, 3)
  assert.equal(sheets[0].totalRow.inscritos, 2)
  assert.equal(sheets[0].totalRow.internos, 1)
  assert.equal(sheets[0].totalRow.externos, 1)
  assert.equal(sheets[0].totalRow.noInscritos, 1)
})
test('sensitive field is exported only when explicitly selected', () => {
  const sheets = createInstitutionalControlEscolarSheets({
    scopes: [{ plantel: 'PM', rows: [{ grado: 'Cuarto', huskyPassPlaintext: 'secreto' }] }],
    fields, selectedFields: ['huskyPassPlaintext'], cicloLabel: '2026-2027', statusLabel: 'Inscritos', generatedLabel: 'hoy',
  })
  assert.deepEqual(sheets[1].columns.map((column) => column.key), ['plantel', 'huskyPassPlaintext'])
  assert.equal(sheets[1].rows[0].huskyPassPlaintext, 'secreto')
})

test('offline plantel is isolated, catalog order is preserved, and verified backups are retained', async () => {
  const failed = []
  const scopes = await loadInstitutionalControlEscolarScopes({
    planteles: ['PREEM', 'PREET', 'SM', 'GM'],
    batchSize: 2,
    read: async (plantel) => {
      if (plantel === 'PREET') throw Object.assign(new Error('Bridge offline'), { code: 'DB_BRIDGE_AGENT_OFFLINE' })
      if (plantel === 'GM') return { rows: [{ fullName: 'Alumno respaldo' }], dataStatus: 'backup-stale', snapshotAt: '2026-10-26T10:48:46Z' }
      return { rows: plantel === 'SM' ? [] : [{ fullName: 'Alumno en vivo' }], dataStatus: 'live' }
    },
    onUnavailable: (plantel, error) => failed.push([plantel, error.code]),
  })
  assert.deepEqual(scopes.map((scope) => scope.plantel), ['PREEM', 'PREET', 'SM', 'GM'])
  assert.deepEqual(failed, [['PREET', 'DB_BRIDGE_AGENT_OFFLINE']])
  assert.equal(scopes[1].rows, null)
  assert.deepEqual(scopes[2].rows, [])
  const sheets = createInstitutionalControlEscolarSheets({
    scopes, fields, selectedFields: ['fullName', 'grado'],
    cicloLabel: '2026-2027', statusLabel: 'Inscritos', generatedLabel: 'hoy',
  })
  const summary = sheets[0]
  assert.equal(summary.rows.length, 4)
  assert.equal(summary.rows[1].dataStatus, 'No disponible')
  assert.equal(summary.rows[1].total, null)
  assert.equal(summary.rows[2].total, 0)
  assert.equal(summary.rows[3].dataStatus, 'Respaldo anterior')
  assert.equal(summary.rows[3].snapshotAt, '2026-10-26T10:48:46Z')
  assert.equal(summary.totalRow.plantel, 'Subtotal disponible')
  assert.equal(summary.totalRow.total, 2)
  assert.match(summary.subtitle, /PARCIAL/)
  assert.equal(sheets[1].rows.length, 2)
  assert.deepEqual(sheets.map((sheet) => sheet.name), ['Resumen', 'General', 'PREEM', 'PREET', 'SM', 'GM'])
  assert.match(sheets[3].subtitle, /SIN DATOS/)
  assert.equal(sheets[3].rows.length, 0)
  assert.match(sheets[5].subtitle, /Respaldo anterior/)
})

test('no readable planteles remain explicitly unavailable; never become zero', async () => {
  const scopes = await loadInstitutionalControlEscolarScopes({
    planteles: ['PREET', 'CT'],
    read: async () => { throw new Error('Offline') },
  })
  assert.ok(scopes.every((scope) => scope.rows === null))
  const sheets = createInstitutionalControlEscolarSheets({
    scopes, fields, selectedFields: ['fullName'],
    cicloLabel: '2026-2027', statusLabel: 'Inscritos', generatedLabel: 'hoy',
  })
  assert.ok(sheets[0].rows.every((row) => row.total === null))
  assert.equal(sheets[0].totalRow.plantel, 'Subtotal disponible')
})

test('online campus with zero matches remains available with true zero', async () => {
  const scopes = await loadInstitutionalControlEscolarScopes({
    planteles: ['GM'],
    read: async () => ({ rows: [], dataStatus: 'live' }),
  })
  const sheets = createInstitutionalControlEscolarSheets({
    scopes, fields, selectedFields: ['fullName'],
    cicloLabel: '2026-2027', statusLabel: 'Inscritos', generatedLabel: 'hoy',
  })
  assert.equal(sheets[0].rows[0].total, 0)
  assert.equal(sheets[0].rows[0].dataStatus, 'En vivo')
  assert.equal(sheets[0].totalRow.plantel, 'Total')
})
