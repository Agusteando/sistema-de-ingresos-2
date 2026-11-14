import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { queueLocalStudentRestore, readQueuedStudentRestores, clearQueuedStudentRestore, isCentralTransportFailure } from '../server/utils/local-student-restore-outbox.ts'

test('central connectivity errors, not MySQL/data errors, enable local fallback', () => {
  assert.equal(isCentralTransportFailure(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })), true)
  assert.equal(isCentralTransportFailure(Object.assign(new Error('socket connection lost'), { code: 'PROTOCOL_CONNECTION_LOST' })), true)
  assert.equal(isCentralTransportFailure(Object.assign(new Error('Unknown column'), { code: 'ER_BAD_FIELD_ERROR' })), false)
  assert.equal(isCentralTransportFailure({ statusCode: 403, message: 'No permission' }), false)
  assert.equal(isCentralTransportFailure(Object.assign(new Error('Bad field'), {code:'ER_BAD_FIELD_ERROR',statusCode:503})),false)
})

test('offline restore requests persist once and remain retryable across reads', async () => {
  const previous = process.env.LOCAL_SYSTEM_ROOT
  const root = mkdtempSync(path.join(tmpdir(), 'aurora-restores-'))
  process.env.LOCAL_SYSTEM_ROOT = root
  try {
    const first = await queueLocalStudentRestore({ matricula: 'PM100', plantel: 'PMA', actor: 'admin@example.com' })
    const duplicate = await queueLocalStudentRestore({ matricula: 'PM100', plantel: 'PMA', actor: 'admin@example.com' })
    assert.equal(first.created, true)
    assert.equal(duplicate.created, false)
    const entries = await readQueuedStudentRestores()
    assert.equal(entries.length, 1)
    assert.equal(entries[0].requestedAt, first.entry.requestedAt)
    await clearQueuedStudentRestore('PM100', 'PMA')
    assert.deepEqual(await readQueuedStudentRestores(), [])
  } finally {
    if (previous === undefined) delete process.env.LOCAL_SYSTEM_ROOT
    else process.env.LOCAL_SYSTEM_ROOT = previous
    rmSync(root, { recursive: true, force: true })
  }
})
