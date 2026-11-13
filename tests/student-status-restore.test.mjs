import test from 'node:test'
import assert from 'node:assert/strict'
import { restoreStudentActiveStatus, StudentRestoreError } from '../server/utils/student-status-restore.ts'

const mockDb = (student, affectedRows = 1) => {
  const calls = []
  const queryDb = async (sql, params) => {
    calls.push({ sql, params })
    return calls.length === 1 ? (student ? [student] : []) : { affectedRows }
  }
  return { queryDb, calls }
}

test('restores only base.estatus and preserves cycle/payment records', async () => {
  const { queryDb, calls } = mockDb({ matricula: 'PM1018', estatus: 'Cambio de domicilio' })
  assert.deepEqual(await restoreStudentActiveStatus('PM1018', ['PMA', 'PREEM'], queryDb), {
    success: true, alreadyActive: false, estatus: 'Activo',
  })
  assert.equal(calls[1].sql, "UPDATE base SET estatus = 'Activo' WHERE matricula = ? AND estatus = ? AND plantel IN (?,?)")
  assert.deepEqual(calls[1].params, ['PM1018', 'Cambio de domicilio', 'PMA', 'PREEM'])
  assert.doesNotMatch(calls[1].sql, /\bciclo\b|\bdocumentos\b|\breferenciasdepago\b|\bmatricula\./)
})

test('already active is an idempotent no-op', async () => {
  const { queryDb, calls } = mockDb({ matricula: 'PT1001', estatus: '  activo ' })
  assert.deepEqual(await restoreStudentActiveStatus('PT1001', ['PT'], queryDb), {
    success: true, alreadyActive: true, estatus: 'Activo',
  })
  assert.equal(calls.length, 1)
})

test('unknown student fails without a write', async () => {
  const { queryDb, calls } = mockDb(null)
  await assert.rejects(restoreStudentActiveStatus('PM1018', ['PMA'], queryDb),
    error => error instanceof StudentRestoreError && error.statusCode === 404)
  assert.equal(calls.length, 1)
})

test('blank status cannot silently become active', async () => {
  const { queryDb, calls } = mockDb({ matricula: 'PM1018', estatus: null })
  await assert.rejects(restoreStudentActiveStatus('PM1018', ['PMA'], queryDb),
    error => error instanceof StudentRestoreError && error.statusCode === 409)
  assert.equal(calls.length, 1)
})

test('missing matricula fails before querying', async () => {
  const { queryDb, calls } = mockDb(null)
  await assert.rejects(restoreStudentActiveStatus(' ', ['PMA'], queryDb),
    error => error instanceof StudentRestoreError && error.statusCode === 400)
  assert.equal(calls.length, 0)
})

test('empty campus authorization fails closed', async () => {
  const { queryDb, calls } = mockDb(null)
  await assert.rejects(restoreStudentActiveStatus('PM1018', [], queryDb),
    error => error instanceof StudentRestoreError && error.statusCode === 403)
  assert.equal(calls.length, 0)
})

test('concurrent change prevents restoration', async () => {
  const { queryDb } = mockDb({ matricula: 'PM1018', estatus: 'Económico' }, 0)
  await assert.rejects(restoreStudentActiveStatus('PM1018', ['PMA'], queryDb),
    error => error instanceof StudentRestoreError && error.statusCode === 409)
})

test('global superadmin scope does not apply a plantel filter', async () => {
  const { queryDb, calls } = mockDb({ matricula: 'PT1001', estatus: 'Otro' })
  await restoreStudentActiveStatus('PT1001', null, queryDb)
  assert.equal(calls[0].sql, 'SELECT matricula, estatus FROM base WHERE matricula = ? LIMIT 1')
  assert.equal(calls[1].sql, "UPDATE base SET estatus = 'Activo' WHERE matricula = ? AND estatus = ?")
  assert.deepEqual(calls[1].params, ['PT1001', 'Otro'])
})
