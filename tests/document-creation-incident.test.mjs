import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import mysql from 'mysql2/promise'

const load = async (path, exports) => {
  const context = vm.createContext({ console, createError: data => Object.assign(new Error(data.message), data) })
  const dependency = new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [name, value] of Object.entries(exports)) this.setExport(name, value)
  }, { context })
  const source = await readFile(path, 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  const module = new vm.SourceTextModule(code, { context })
  await module.link(() => dependency)
  await module.evaluate()
  return module.namespace
}


test('HTTP LAN document request keys remain UUID v4 without crypto.randomUUID', async () => {
  const { createRequestUuid } = await load('shared/utils/requestUuid.ts', {})
  let sequence = 0
  const insecureOriginCrypto = {
    getRandomValues(bytes) {
      for (let i = 0; i < bytes.length; i++) bytes[i] = (sequence++ * 13 + 7) & 255
      return bytes
    },
  }
  const keys = Array.from({ length: 12 }, () => createRequestUuid(insecureOriginCrypto))
  assert.equal(new Set(keys).size, 12, 'retries and distinct submissions must receive independent keys')
  for (const key of keys) {
    assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  }
  assert.equal(createRequestUuid({ randomUUID: () => 'secure-uuid' }), 'secure-uuid')
  assert.throws(() => createRequestUuid(null), /identificador seguro/)
})

test('free scholarship is distinguished from an actual payment', async () => {
  const helpers = await load('shared/utils/debtSettlement.ts', {})
  assert.equal(helpers.zeroChargeLabel({ subtotal: 0, pagos: 0, beca: 100 }), 'Beca 100%')
  assert.equal(helpers.zeroChargeLabel({ subtotal: 0, pagos: 0, beca: 0 }), 'Sin cargo')
  assert.equal(helpers.zeroChargeLabel({ subtotal: 800, pagos: 800, beca: 0 }), '')
  assert.equal(helpers.zeroChargeLabel({ subtotal: 0, pagos: 10, beca: 100 }), '')
  assert.equal(helpers.zeroChargeLabel({ subtotal: 0, pagosDepurados: 20 }), '')
})
test('failed Talleres refresh preserves committed financial result and reports pending follow-up', async () => {
  const helper = await load('server/utils/financial-write-followup.ts', {
    ensureCurrentTalleresSnapshotPlantel: async () => { throw new Error('fixture refresh failure') },
  })
  const result = await helper.refreshTalleresAfterCommittedWrite({ plantel: 'PM', ciclo: '2026', shouldRefresh: true, documento: 100, requestId: 'test-trace' })
  assert.equal(result.pending, true)
  assert.equal(result.success, false)
  assert.equal(result.requestId, 'test-trace')
})
test('targeted reconciliation rejects payment history, changed financial data and wrong scope', async () => {
  const helper = await load('server/utils/pm1152-reconciliation.ts', { createHash, executeStatementTransaction: () => {}, runRawSqlStatement: () => {} })
  const ledger = {
    matricula: 'PM1152', cycle: '2026', periods: [], payments: [],
    documents: [57186,57189,57190,57191].map(documento => ({ documento, matricula: 'PM1152', ciclo: '2026', concepto: '1028', costo: 800, montoFinal: '0.00', beca: '100', eventual: 0, plazo: '1,2,3,4,5,6,7,8,9,10,11', meses: '11', becaNombre: 'Mercadotecnia', becaTipos: 'Mercadotecnia', estatus: 'Activo' })),
  }
  assert.equal(helper.assertPm1152Reconciliation(ledger).alreadyApplied, false)
  assert.throws(() => helper.assertPm1152Reconciliation({ ...ledger, matricula: 'PM9999' }), /scope/)
  assert.throws(() => helper.assertPm1152Reconciliation({ ...ledger, payments: [{documento:57189,monto:0}] }), /payment history/)
  assert.throws(() => helper.assertPm1152Reconciliation({ ...ledger, periods: [{documento:57189}] }), /period history/)
  const changed = structuredClone(ledger); changed.documents[1].montoFinal = '1.00'
  assert.throws(() => helper.assertPm1152Reconciliation(changed), /signature/)
})

test('real MySQL transactions prevent duplicate retries and reconcile only the authorized records', { skip: !process.env.MYSQL_TEST_URL }, async t => {
  const pool = mysql.createPool({ uri: process.env.MYSQL_TEST_URL, connectionLimit: 16 })
  t.after(() => pool.end())
  const query = async (sql, params=[]) => (await pool.query(sql,params))[0]
  const transaction = async statements => {
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      const results = []
      for (const statement of statements) results.push((await connection.query(statement.sql,statement.params||[]))[0])
      await connection.commit()
      return results
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }
  const dbExports = { createHash, executeStatementTransaction: transaction, query, runRawSqlStatement: query }
  const creation = await load('server/utils/document-creation.ts',dbExports)
  const repair = await load('server/utils/pm1152-reconciliation.ts',dbExports)
  await query(`CREATE TABLE documentos (documento INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, matricula VARCHAR(255), ciclo VARCHAR(50), concepto VARCHAR(255), costo INT DEFAULT 0, montoFinal DECIMAL(65,2), estatus VARCHAR(30), beca VARCHAR(255), eventual TINYINT, plazo TEXT, meses VARCHAR(11), becaNombre VARCHAR(255), becaTipos TEXT) ENGINE=InnoDB`)
  await query('CREATE TABLE referenciasdepago (folio INT PRIMARY KEY, documento INT, monto DECIMAL(65,2), INDEX(documento)) ENGINE=InnoDB')
  await query('CREATE TABLE documento_concepto_periodos (id INT PRIMARY KEY, documento INT, INDEX(documento)) ENGINE=InnoDB')
  const input = {
    statement: { sql: `INSERT INTO documentos (matricula,ciclo,concepto,montoFinal,estatus) VALUES (?, ?, ?, ?, 'Activo')`, params: ['FIXTURE','2026','1028',0] },
    requestKey: randomUUID(), payload: {matricula:'FIXTURE',concepto:'1028',montoFinal:0}, matricula:'FIXTURE',ciclo:'2026',actor:'fixture',requestId:'test-trace',beforeCreate:async()=>{},
  }
  const created = await Promise.all(Array.from({length:12},()=>creation.createDocumentWithRequest(input)))
  assert.equal(new Set(created.map(row=>row.documento)).size,1)
  assert.equal(created.filter(row=>!row.replayed).length,1)
  assert.equal((await query('SELECT COUNT(*) AS n FROM documentos'))[0].n,1)
  await assert.rejects(creation.createDocumentWithRequest({...input,payload:{...input.payload,montoFinal:1}}),error=>error.statusCode===409)
  const independent = await creation.createDocumentWithRequest({...input,requestKey:randomUUID()})
  assert.notEqual(independent.documento,created[0].documento,'intentional repeated purchase has a different request identity')
  await query("UPDATE documentos SET estatus='Cancelado' WHERE documento=?",[created[0].documento])
  await assert.rejects(creation.createDocumentWithRequest(input),error=>error.statusCode===409)
  const badKey = randomUUID()
  await assert.rejects(creation.createDocumentWithRequest({...input,requestKey:badKey,statement:{sql:'INSERT INTO documentos (missing_column) VALUES (?)',params:[1]}}))
  assert.equal((await query('SELECT COUNT(*) AS n FROM documento_creacion_solicitudes WHERE request_key=?',[badKey]))[0].n,0,'failed insert rolls back request marker')
  const legacyA=await creation.createDocumentWithRequest({...input,requestKey:undefined})
  const legacyB=await creation.createDocumentWithRequest({...input,requestKey:undefined})
  assert.notEqual(legacyA.documento,legacyB.documento)

  await query('DELETE FROM documentos')
  for (const documento of [57186,57189,57190,57191]) await query(`INSERT INTO documentos (documento,matricula,ciclo,concepto,costo,montoFinal,estatus,beca,eventual,plazo,meses,becaNombre,becaTipos) VALUES (?,'PM1152','2026','1028',800,0,'Activo','100',0,'1,2,3,4,5,6,7,8,9,10,11','11','Mercadotecnia','Mercadotecnia')`,[documento])
  await query("INSERT INTO documentos (documento,matricula,ciclo,concepto,montoFinal,estatus) VALUES (90000,'OTHER','2026','1028',800,'Activo')")
  const ledger=()=>query('SELECT * FROM documentos ORDER BY documento')
  const before={matricula:'PM1152',cycle:'2026',documents:await ledger(),periods:[],payments:[],schema:{engines:{documentos:'InnoDB',referenciasdepago:'InnoDB',documento_concepto_periodos:'InnoDB'}}}
  // A payment inserted after the read must make the SQL guards decline the write.
  await query('INSERT INTO referenciasdepago VALUES (1,57189,0)')
  await assert.rejects(repair.reconcilePm1152(before,repair.pm1152LedgerFingerprint(before),'race-trace'),error=>error.statusCode===409)
  assert.equal((await query("SELECT COUNT(*) AS n FROM documentos WHERE matricula='PM1152' AND estatus='Activo'"))[0].n,4)
  await query('DELETE FROM referenciasdepago')
  const result=await repair.reconcilePm1152(before,repair.pm1152LedgerFingerprint(before),'apply-trace')
  assert.equal(result.applied,true)
  const after=await ledger()
  assert.equal(after.find(row=>row.documento===57186).estatus,'Activo')
  assert.equal(after.filter(row=>[57189,57190,57191].includes(row.documento)&&row.estatus==='Cancelado').length,3)
  assert.equal(after.find(row=>row.documento===90000).estatus,'Activo')
  const replay={...before,documents:after}
  assert.equal((await repair.reconcilePm1152(replay,repair.pm1152LedgerFingerprint(replay),'replay-trace')).alreadyApplied,true)
  assert.equal((await query('SELECT COUNT(*) AS n FROM financial_incident_reconciliations'))[0].n,1)
})
