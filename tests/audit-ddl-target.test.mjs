import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {affectsAuditTable,auditDdlTargets} from '../scripts/audit/audit-ddl-target.mjs'
const table='central'
const unrelated=readFileSync(new URL('./fixtures/audit-unrelated-ddl.sql',import.meta.url),'utf8')
test('the production talleres DDL mentions matricula but does not change its table',()=>{
 assert.equal(affectsAuditTable(unrelated,table,table),false)
 assert.deepEqual(auditDdlTargets(unrelated,table),[{schema:table,table:'talleres_student_evaluations'}])
})
test('qualifiers, comments and quoted identifiers resolve the actual DDL target',()=>{
 for(const sql of ['ALTER TABLE `central`.`matricula` ADD x INT','/*!80000 ALTER TABLE matricula ADD x INT */','/* normal */ ALTER /* scope */ TABLE central . matricula ADD x INT','-- ignored matricula\nDROP TABLE IF EXISTS other, `central`.`matricula`','TRUNCATE central.matricula','CREATE TEMPORARY TABLE IF NOT EXISTS central.matricula (id INT)','RENAME TABLE other TO central.matricula','ALTER TABLE other RENAME TO central.matricula','ALTER TABLE other RENAME AS central.matricula'])assert.equal(affectsAuditTable(sql,'other',table),!sql.includes('/*!80000 ALTER TABLE matricula'),sql)
 assert.equal(affectsAuditTable('/*!80000 ALTER TABLE matricula ADD x INT */',table,table),true)
})
test('column names, reference names, literals, comments and other schemas never become table targets',()=>{
 for(const sql of [unrelated,'ALTER TABLE other ADD COLUMN matricula VARCHAR(64)',"CREATE TABLE other (note TEXT DEFAULT 'ALTER TABLE matricula')",'ALTER TABLE other RENAME COLUMN previous TO matricula','ALTER TABLE other RENAME INDEX previous TO matricula','CREATE TABLE other LIKE central.matricula','CREATE TABLE other AS SELECT * FROM central.matricula','ALTER TABLE another.matricula ADD x INT','ALTER TABLE `matricula_archive` ADD x INT','CREATE INDEX matricula ON other (id)','DROP INDEX matricula ON other','-- ALTER TABLE matricula\nCREATE TABLE other (id INT)'])assert.equal(affectsAuditTable(sql,table,table),false,sql)
})
test('multi-table rename sees both source and destination and malformed table DDL fails closed',()=>{
 assert.equal(affectsAuditTable('RENAME TABLE a TO b, central.matricula TO archive','other',table),true)
 for(const sql of ['ALTER TABLE','DROP TABLE IF','RENAME TABLE a','CREATE TABLE IF EXISTS a (id INT)'])assert.throws(()=>affectsAuditTable(sql,table,table),/DDL_TARGET_INVALID/)
})
export {unrelated}
