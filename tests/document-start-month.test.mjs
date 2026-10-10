import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import mysql from 'mysql2/promise'

const load = async (path, deps = {}) => {
  const context = vm.createContext({ console, createError: data => Object.assign(new Error(data.message), data) })
  const module = new vm.SourceTextModule(ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText, { context })
  const dependency = new vm.SyntheticModule(Object.keys(deps), function () {
    for (const [name, value] of Object.entries(deps)) this.setExport(name, value)
  }, { context })
  await module.link(() => dependency)
  await module.evaluate()
  return module.namespace
}
const monthHelpers = await load('shared/utils/documentMonths.ts')
const helpers = await load('server/utils/document-start-month.ts', { ...monthHelpers, query() {}, executeStatementTransaction() {} })

test('start adjustment removes only a prefix and always retains existing months', () => {
  for (const plazo of ['11', '1,2,3,4,5,6,7,8,9,10,11', '[1,2,3,4,5,6,7,8,9,10,11]']) {
    const plan = helpers.planDocumentStart({ plazo, meses: '11', eventual: 0 }, 2)
    assert.deepEqual(Array.from(plan.removedMonths), [1])
    assert.deepEqual(Array.from(plan.keptMonths), [2,3,4,5,6,7,8,9,10,11])
  }
  assert.deepEqual(Array.from(helpers.planDocumentStart({ plazo: '2,4,5' }, 4).keptMonths), [4,5])
  for (const start of [0,1,12,2.5,'2oops']) assert.throws(() => helpers.planDocumentStart({ plazo: '11' }, start))
  assert.throws(() => helpers.planDocumentStart({ plazo: '11', eventual: 1 }, 2))
  assert.throws(() => helpers.planDocumentStart({ plazo: '[1]' }, 2))
})

test('real MySQL: audit, rollback, stale dialogs and simultaneous payments', { skip: !process.env.MYSQL_TEST_URL }, async t => {
  const setup = await mysql.createConnection(process.env.MYSQL_TEST_URL)
  const database = `tkt18_${Date.now()}`
  await setup.query(`CREATE DATABASE ${database}`)
  const pool = mysql.createPool({ uri: process.env.MYSQL_TEST_URL, database, connectionLimit: 8 })
  t.after(async () => { await pool.end(); await setup.query(`DROP DATABASE ${database}`); await setup.end() })
  const query = async (sql, params = []) => (await pool.query(sql, params))[0]
  const transaction = async statements => {
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      const results = []
      for (const statement of statements) results.push((await connection.query(statement.sql, statement.params || []))[0])
      await connection.commit()
      return results
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }
  await query(`CREATE TABLE documentos (documento INT PRIMARY KEY, plazo TEXT NOT NULL, meses VARCHAR(11), estatus VARCHAR(30), matricula VARCHAR(50), ciclo VARCHAR(20), eventual INT) ENGINE=InnoDB`)
  await query(`CREATE TABLE referenciasdepago (folio INT AUTO_INCREMENT PRIMARY KEY, documento INT NOT NULL, mes VARCHAR(20), monto DECIMAL(10,2), estatus VARCHAR(30), INDEX(documento)) ENGINE=InnoDB`)
  await query(`CREATE TABLE documento_concepto_periodos (id INT PRIMARY KEY, documento INT, start_mes INT, end_mes INT, accion VARCHAR(30), estatus VARCHAR(30)) ENGINE=InnoDB`)
  await query(`CREATE TABLE solicitudescancelaciones (id INT AUTO_INCREMENT PRIMARY KEY, folio INT NOT NULL, motivo TEXT, monto INT, nombreCompleto VARCHAR(255), conceptoNombre VARCHAR(255), usuario VARCHAR(255), usuarioId INT, revisado_por VARCHAR(255), status VARCHAR(30)) ENGINE=InnoDB`)
  const fresh = async (id=18) => (await query('SELECT * FROM documentos WHERE documento = ?', [id]))[0]
  const seed = async (id=18) => query(`INSERT INTO documentos VALUES (?, '1,2,3,4', '4', 'Activo', 'CT0287', '2026', 0)`, [id])
  const body = { startMes: 2, motivo: 'Inicia colegiatura en octubre', coverage: '1,2,3,4' }
  const user = { name: 'Operadora' }
  const api = await load('server/utils/document-start-month.ts', { ...monthHelpers, query, executeStatementTransaction: transaction })
  await seed()
  await query(`INSERT INTO referenciasdepago(documento, mes, monto, estatus) VALUES(18, '2', 850, 'Vigente')`)
  await query(`INSERT INTO documento_concepto_periodos VALUES(1,18,3,NULL,'cambio','Activo')`)
  const beforePayments = await query('SELECT * FROM referenciasdepago')
  const beforePeriods = await query('SELECT * FROM documento_concepto_periodos')
  const preview = await api.previewDocumentStart(await fresh())
  assert.equal(preview.months[0].paymentCount, 0)
  assert.equal(preview.months[1].paymentCount, 1)
  const result = await api.updateDocumentStart(await fresh(), body, user, 'test-trace')
  assert(result.auditId > 0)
  assert.equal((await fresh()).plazo, '2,3,4')
  assert.equal((await fresh()).meses, '3')
  assert.deepEqual(await query('SELECT * FROM referenciasdepago'), beforePayments)
  assert.deepEqual(await query('SELECT * FROM documento_concepto_periodos'), beforePeriods)
  const [audit] = await query('SELECT * FROM solicitudescancelaciones')
  assert.equal(audit.folio, 0)
  assert.equal(audit.status, 'aceptada')
  assert.equal(audit.usuario, 'Operadora')
  assert.match(audit.motivo, /Inicia colegiatura en octubre/)
  assert.match(audit.motivo, /Septiembre → Octubre/)
  assert.match(audit.motivo, /test-trace/)
  await assert.rejects(api.updateDocumentStart(await fresh(), { ...body, startMes: 3, coverage: '2,3,4' }, user, 'blocked'), /pagos vigentes/)
  await assert.rejects(api.updateDocumentStart(await fresh(), { ...body, startMes: 3, motivo: '  ' }, user, 'reason'), /motivo/)
  await assert.rejects(api.updateDocumentStart(await fresh(), { ...body, startMes: 3 }, user, 'stale'), /tira cambió/)
  assert.equal((await query('SELECT COUNT(*) n FROM solicitudescancelaciones'))[0].n, 1)

  // Audit failure must roll back the coverage change in the same transaction.
  await seed(19)
  await query(`CREATE TRIGGER audit_failure BEFORE INSERT ON solicitudescancelaciones FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit fixture failure'`)
  await assert.rejects(api.updateDocumentStart(await fresh(19), body, user, 'rollback'), /audit fixture failure/)
  assert.equal((await fresh(19)).plazo, '1,2,3,4')
  await query('DROP TRIGGER audit_failure')

  // Use the same guarded scalar subquery as pay.post.ts. It acquires the document lock
  // before inserting a payment and rejects a stale coverage snapshot atomically.
  const paymentSql = `INSERT INTO referenciasdepago(documento, mes, monto, estatus) VALUES
    ((SELECT documento FROM documentos WHERE documento = ? AND plazo <=> ? AND meses <=> ? AND estatus = 'Activo' FOR UPDATE), '1', 100, 'Vigente')`
  await assert.rejects(transaction([{ sql: paymentSql, params: [18,'1,2,3,4','4'] }]), /cannot be null/)
  await seed(20)
  const original = await fresh(20)
  const paid = await pool.getConnection()
  await paid.beginTransaction()
  await paid.query(paymentSql, [20, original.plazo, original.meses])
  const duringPayment = api.updateDocumentStart(original, body, user, 'payment-first')
  await paid.commit(); paid.release()
  await assert.rejects(duringPayment, /pagos vigentes|pagos cambiaron/)
  assert.equal((await fresh(20)).plazo, '1,2,3,4')

  await seed(21)
  const old = await fresh(21)
  const concurrent = await Promise.allSettled([
    api.updateDocumentStart(old, body, user, 'start-race'),
    transaction([{ sql: paymentSql, params: [21,old.plazo,old.meses] }]),
  ])
  const after = await fresh(21)
  const [payments] = await query('SELECT COUNT(*) n FROM referenciasdepago WHERE documento = 21')
  assert.equal(after.plazo === '2,3,4' && payments.n > 0, false, 'retired September must never have a new payment')
  assert(concurrent.some(result => result.status === 'fulfilled'))
  console.log('MySQL 8: October payment preserved; prefix only; reasons/audit; audit rollback; stale coverage; payment/start races passed')
})
