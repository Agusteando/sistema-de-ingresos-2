import assert from 'node:assert/strict'
import test from 'node:test'
import { createInstitutionalControlEscolarSheets } from '../server/utils/control-escolar-institutional-sheets.mjs'

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
