import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  controlEscolarRosterIdentityKeys,
  duplicateControlEscolarRosterIdentities,
  selectControlEscolarUiInscritos
} from '../shared/utils/controlEscolarRosterParity.ts'

test('operator roster matches the exact UI enrolled rule and does not invent baja filtering', () => {
  const rows = [
    { matricula: 'PM1001', status: 'Activo', enrollmentState: 'inscrito' },
    { matricula: 'PM1002', status: 'Baja', enrollmentState: 'inscrito' },
    { matricula: 'PM1003', status: 'Activo', enrollmentState: 'no_inscrito' },
    { matricula: 'PM1004', status: 'Baja', enrollmentState: 'baja_inscrita' }
  ]

  const inscritos = selectControlEscolarUiInscritos(rows)
  assert.deepEqual(inscritos.map((row) => row.matricula), ['PM1001', 'PM1002'])
  assert.deepEqual(controlEscolarRosterIdentityKeys(inscritos), ['PM1001', 'PM1002'])
})

test('operator roster detects duplicate matriculas before publishing parity data', () => {
  const rows = [
    { matricula: 'pm1001', enrollmentState: 'inscrito' },
    { matricula: 'PM1001', enrollmentState: 'inscrito' }
  ]
  assert.deepEqual(duplicateControlEscolarRosterIdentities(rows), ['PM1001'])
})

test('external endpoint is pinned to the same all=1 operator index contract as the UI', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'server/api/external/v1/control-escolar/operator-roster.get.ts'),
    'utf8'
  )

  assert.match(source, /fetchControlEscolarStudentsWithCanonicalGroups/)
  assert.match(source, /all:\s*'1'/)
  assert.match(source, /limit:\s*500/)
  assert.match(source, /selectControlEscolarUiInscritos\(operatorRows\)/)
  assert.doesNotMatch(source, /externalApi\s*:\s*true/)
  assert.doesNotMatch(source, /isBajaStudent/)
  assert.match(source, /fingerprint/)
})


test('external operator roster emits safe parity diagnostics for UI snapshot and baja-state conflicts', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'server/api/external/v1/control-escolar/operator-roster.get.ts'),
    'utf8'
  )

  assert.match(source, /readLatestUiSnapshotTrace/)
  assert.match(source, /event_type = 'page_snapshot'/)
  assert.match(source, /enrolledStatusBajaCount/)
  assert.match(source, /enrolledStatusBaja/)
  assert.match(source, /latestUiSnapshot/)
  assert.doesNotMatch(source, /actor_email/)
  assert.doesNotMatch(source, /actor_name/)
})
