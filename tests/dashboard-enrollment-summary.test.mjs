import assert from 'node:assert/strict'
import test from 'node:test'
import { buildInstitutionalEnrollmentSummary } from '../server/utils/dashboard-enrollment-summary.mjs'

const student = (grado, enrollmentState = 'inscrito', tipoIngresoValue = 'interno', status = 'Activo', nivel = 'Primaria') => ({ grado, nivel, enrollmentState, tipoIngresoValue, status })

test('all campuses are present; campus, grade and institution totals reconcile with Control Escolar status', () => {
  const result = buildInstitutionalEnrollmentSummary({ ciclo: '2026', scopes: [
    { plantel: 'PM', dataStatus: 'live', rows: [student('Primero'), student('primero', 'inscrito', 'externo'), student('Segundo', 'no_inscrito'), student('Tercero', 'inscrito', 'interno', 'Baja'), student('', 'inscrito', 'externo')] },
    { plantel: 'PT', dataStatus: 'live', rows: [student('Sexto', 'inscrito', 'interno'), student('Sexto', 'baja_inscrita', 'interno')] },
    { plantel: 'GM', dataStatus: 'live', rows: [] },
  ] })
  assert.deepEqual(result.rows.map(row => row.plantel), ['PM', 'PT', 'GM'])
  assert.deepEqual([result.total.inscritos, result.total.internos, result.total.externos, result.total.noInscritos, result.total.bajas, result.total.registros], [4, 2, 2, 1, 2, 7])
  assert.equal(result.rows[0].grados.filter(g => g.grado === 'Primero').length, 1)
  assert.ok(result.rows[0].grados.some(g => g.grado === 'Sin grado'))
  for (const row of result.rows) {
    for (const key of ['inscritos', 'internos', 'externos', 'noInscritos', 'bajas', 'registros']) {
      assert.equal(row.grados.reduce((total, grade) => total + grade[key], 0), row[key])
    }
    assert.equal(row.inscritos, row.internos + row.externos)
    assert.equal(row.registros, row.inscritos + row.noInscritos + row.bajas)
  }
  assert.equal(result.coverage.complete, true)
  assert.equal(result.total.partial, false)
})

test('offline is null not zero, backups count but are labeled, and institution total is partial', () => {
  const result = buildInstitutionalEnrollmentSummary({ ciclo: '2026', scopes: [
    { plantel: 'PM', rows: null, dataStatus: 'unavailable' },
    { plantel: 'PT', rows: [student('Segundo', 'inscrito', 'externo')], dataStatus: 'backup-stale', snapshotAt: '2026-10-30T12:00:00Z' },
    { plantel: 'SM', rows: [] },
  ] })
  assert.equal(result.rows[0].inscritos, null)
  assert.deepEqual(result.rows[0].grados, [])
  assert.equal(result.rows[1].source, 'backup-stale')
  assert.equal(result.rows[1].snapshotAt, '2026-10-30T12:00:00Z')
  assert.equal(result.rows[2].inscritos, 0)
  assert.deepEqual(result.coverage.unavailable, ['PM'])
  assert.equal(result.coverage.complete, false)
  assert.equal(result.total.partial, true)
  assert.equal(result.total.inscritos, 1)
})

test('never fabricate totals when every campus is unavailable', () => {
  const result = buildInstitutionalEnrollmentSummary({ ciclo: '2026', scopes: [
    { plantel: 'PM', rows: null }, { plantel: 'PT', rows: null },
  ] })
  assert.equal(result.total.inscritos, null)
  assert.equal(result.total.registros, null)
  assert.equal(result.coverage.available, 0)
})
