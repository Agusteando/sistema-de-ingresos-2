import assert from 'node:assert/strict'
import { createHash, randomBytes, createCipheriv, publicEncrypt, constants } from 'node:crypto'

const origin = 'https://aurora.casitaiedis.edu.mx'
const headers = { Accept: 'application/json', 'x-aurora-token': process.env.AURORA_API_TOKEN }
if (!headers['x-aurora-token']) throw new Error('AURORA_API_TOKEN missing')
const evidence = { receivedAt: new Date().toISOString(), mode: process.env.INCIDENT_MODE || 'read' }
const ids = [57189,57190,57191]
const request = async (path, options = {}) => {
  const response = await fetch(origin + path, { headers, signal: AbortSignal.timeout(90000), ...options })
  const body = await response.json().catch(() => ({}))
  return { status: response.status, requestId: response.headers.get('x-aurora-request-id'), body }
}
const fingerprint = ledger => createHash('sha256').update(JSON.stringify({ documents: ledger.documents, periods: ledger.periods, payments: ledger.payments })).digest('hex')
const accountPath = '/api/external/v1/husky-pass/account?matricula=PM1152&ciclo=2026'
try {
  for (let attempt = 1; attempt <= 24; attempt++) {
    evidence.before = await request('/api/external/v1/incidents/pm1152')
    const ledger = evidence.before.body
    if (evidence.before.status === 200 && ledger.ok === true && ledger.version === 'pm1152-ledger-v1' &&
      (evidence.mode !== 'apply' || ledger.schema?.engines)) break
    if (![200,404,502,503,504].includes(evidence.before.status)) break
    console.log('PM1152_DEPLOYMENT_WAIT=' + attempt + ' HTTP ' + evidence.before.status)
    await new Promise(resolve => setTimeout(resolve,15000))
  }
  assert.equal(evidence.before.status,200)
  const before = evidence.before.body
  assert.equal(before.ok,true)
  assert.equal(before.version,'pm1152-ledger-v1')
  assert.deepEqual(before.source,{transport:'bridge',agentId:'PM'})
  assert.equal(before.matricula,'PM1152')
  console.log('PM1152_PRODUCTION_READ_OK requestId=' + evidence.before.requestId)
  if (evidence.mode === 'apply') {
    evidence.accountBefore = await request(accountPath)
    assert.equal(evidence.accountBefore.status,200)
    assert.equal(evidence.accountBefore.body.ok,true)
    evidence.reconciliation = await request('/api/external/v1/incidents/pm1152/reconcile', {
      method: 'POST', headers: {...headers,'Content-Type':'application/json'},
      body: JSON.stringify({ action:'apply', expectedFingerprint:fingerprint(before) }),
    })
    assert.equal(evidence.reconciliation.status,200)
    assert.equal(evidence.reconciliation.body.ok,true)
    assert.equal(evidence.reconciliation.body.version,'pm1152-reconciled-v1')
    assert.ok(evidence.reconciliation.body.applied || evidence.reconciliation.body.alreadyApplied)
    evidence.after = await request('/api/external/v1/incidents/pm1152')
    assert.equal(evidence.after.status,200)
    const after = evidence.after.body
    assert.equal(after.ok,true)
    assert.equal(after.documents.find(row=>Number(row.documento)===57186)?.estatus,'Activo')
    for (const id of ids) assert.equal(after.documents.find(row=>Number(row.documento)===id)?.estatus,'Cancelado')
    const unaffected = ledger => ledger.documents.filter(row=>!ids.includes(Number(row.documento)))
    assert.deepEqual(unaffected(after),unaffected(before),'unrelated documents must retain every field')
    for (const key of ['periods','payments','corrections']) assert.deepEqual(after[key],before[key],key+' must remain unchanged')
    for (const id of ids) {
      const expected = {...before.documents.find(row=>Number(row.documento)===id),estatus:'Cancelado'}
      assert.deepEqual(after.documents.find(row=>Number(row.documento)===id),expected,'only cancellation status may change')
    }
    evidence.accountAfter = await request(accountPath)
    assert.equal(evidence.accountAfter.status,200)
    const account = evidence.accountAfter.body
    assert.equal(account.ok,true)
    assert.deepEqual([...new Set(account.conceptos.filter(row=>Number(row.concepto)===1028).map(row=>Number(row.documento)))],[57186])
    assert.equal(account.conceptos.filter(row=>Number(row.documento)===57186).length,11,'the original eleven monthly entries remain')
    assert.deepEqual(account.conceptos.filter(row=>!ids.includes(Number(row.documento))),evidence.accountBefore.body.conceptos.filter(row=>!ids.includes(Number(row.documento))))
    assert.deepEqual(account.recibos,evidence.accountBefore.body.recibos,'receipts must remain unchanged')
    console.log('PM1152_RECONCILIATION_OK requestId='+evidence.reconciliation.requestId+' canonical=57186 cancelled=57189,57190,57191')
    console.log('PM1152_RUNTIME_PARITY_OK canonical_months=11 receipts_unchanged=true unrelated_documents_unchanged=true')
  }
} catch (error) {
  evidence.error = { name: error.name, message: error.message, stack: error.stack }
  console.error('PM1152 validation failed; diagnostic details are encrypted below')
  process.exitCode = 1
} finally {
  // Financial evidence is never published as plaintext in the public repository.
  const key=randomBytes(32), iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv)
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(evidence)),cipher.final()])
  const encryptedKey=publicEncrypt({key:Buffer.from(process.env.AUDIT_PUBLIC_KEY,'base64'),padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key)
  const envelope=Buffer.from(JSON.stringify({key:encryptedKey.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:ciphertext.toString('base64')})).toString('base64')
  for(let offset=0,index=0;offset<envelope.length;offset+=6000,index++) console.log('PM1152_ENCRYPTED_'+index+'='+envelope.slice(offset,offset+6000))
}
