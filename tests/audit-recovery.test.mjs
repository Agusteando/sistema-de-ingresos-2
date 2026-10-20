import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {validateBinlogRecovery,parseBinlogLiteral,selectRecoveryTarget,indexAuditRecoveries,canonicalRecoveryField} from '../shared/utils/auditRecovery.mjs'
const bundle=JSON.parse(readFileSync(new URL('./fixtures/audit-recovery-pm1626.json',import.meta.url),'utf8'))
const input=bundle.records[0],item=validateBinlogRecovery(input)
const anchor=(id=5629,extra={})=>({id,event_type:'student_update',matricula:'PM1626',plantel:'PM',recorded_at:'2026-10-14 13:59:53.000000',payload:{fields:['grupo']},...extra})
const evidence=(sourceRecord=input,extra={})=>({id:9000,event_type:'student_update_recovery',matricula:'PM1626',plantel:'PM',payload:{originalEventId:'5629',sourceRecord},...extra})
test('real PM1626 committed before/after images decode without a special-case implementation',()=>{
 assert.equal(item.before,'ANTÁRTIDA');assert.equal(item.after,'AMÉRICA')
 assert.equal(item.evidence.position,'500848402');assert.equal(item.evidence.xid,'50484068')
 const other=validateBinlogRecovery({...input,matricula:'PT0123',field:'apellido_paterno',beforeSql:"'O\\'Brien'",afterSql:"'García'",rowId:'21'})
 assert.equal(other.before,"O'Brien");assert.equal(other.after,'García')
 assert.equal(canonicalRecoveryField('lugar_trabajo_padre'),canonicalRecoveryField('lugarTrabajoPadre'))
})
test('absent, unchanged, uncommitted, unchecked or malformed evidence never becomes a verified change',()=>{
 for(const value of [
  {...input,afterSql:input.beforeSql},{...input,beforeSql:undefined},
  {...input,matricula:'PM1626|.*'},{...input,field:'grupo;DELETE'},
  {...input,evidence:{...input.evidence,committed:false}},
  {...input,evidence:{...input.evidence,checksumVerified:false}},
  {...input,evidence:{...input.evidence,fullImages:false}},
  {...input,evidence:{...input.evidence,commitPosition:input.evidence.position}},
  {...input,evidence:{...input.evidence,decodedRowSha256:''}},
  {...input,evidence:{...input.evidence,identityOrdinal:12}}
 ])assert.throws(()=>validateBinlogRecovery(value))
 assert.equal(parseBinlogLiteral("''"),'');assert.equal(parseBinlogLiteral('NULL'),null)
 assert.equal(parseBinlogLiteral("'a\\\\b'"),'a\\b')
 assert.throws(()=>parseBinlogLiteral("'bad\\xFF'"))
})
test('unique student/field/second anchor retains its recorded actor; multiple candidates never choose an actor',()=>{
 const original=anchor(),snapshot=JSON.stringify(original),target=selectRecoveryTarget(item,[original])
 assert.equal(target.kind,'linked');assert.equal(target.row.id,5629);assert.equal(JSON.stringify(original),snapshot)
 assert.equal(selectRecoveryTarget(item,[original,anchor(5630)]).kind,'ambiguous')
 assert.equal(selectRecoveryTarget(item,[anchor(1,{matricula:'PM9999'})]).kind,'unattributed')
 assert.equal(selectRecoveryTarget(item,[anchor(1,{payload:{fields:['foto']}})]).kind,'unattributed')
 assert.equal(selectRecoveryTarget(item,[anchor(1,{recorded_at:'2026-10-14 13:59:54.000000'})]).kind,'unattributed')
})
test('already-detailed matching changes are not duplicated and conflicting values block recovery',()=>{
 assert.equal(selectRecoveryTarget(item,[anchor(1,{payload:{changes:[{field:'grupo',before:item.before,after:item.after}]}})]).kind,'already-verified')
 assert.equal(selectRecoveryTarget(item,[anchor(1,{payload:{changes:[{field:'grupo',before:'ÁFRICA',after:item.after}]}})]).kind,'conflict')
})
test('projection binds source values to an original ID, campus, student and field without overwriting originals',()=>{
 const original=anchor(),copy=JSON.stringify(original),index=indexAuditRecoveries([original],[evidence()])
 assert.equal(index.get('5629|grupo').before,'ANTÁRTIDA');assert.equal(index.get('5629|grupo').after,'AMÉRICA')
 assert.equal(JSON.stringify(original),copy)
 for(const bad of [evidence(input,{matricula:'PM9999'}),evidence(input,{plantel:'PT'}),evidence({...input,recordedAt:'2026-10-14 13:59:54'})])assert.throws(()=>indexAuditRecoveries([original],[bad]))
 assert.equal(indexAuditRecoveries([anchor(1)],[evidence()]).size,0)
 assert.throws(()=>indexAuditRecoveries([original],[evidence(),evidence({...input,afterSql:"'ÁFRICA'"})]))
})


test('separate detailed transitions in one second can each be verified exactly',()=>{
 const one=anchor(1,{payload:{changes:[{field:'grupo',before:item.before,after:item.after}]}})
 const two=anchor(2,{payload:{changes:[{field:'grupo',before:item.after,after:'ÁFRICA'}]}})
 assert.equal(selectRecoveryTarget(item,[one,two]).row.id,1)
 assert.equal(selectRecoveryTarget(item,[one,{...one,id:3}]).kind,'conflict')
})
