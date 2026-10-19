import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const source=fs.readFileSync(new URL('../server/utils/control-escolar.ts',import.meta.url),'utf8');
const code=source.slice(source.indexOf('const upsertMatriculaOverlay ='),source.indexOf('export const CONTROL_ESCOLAR_MATRICULA_IMPORT_FIELDS'));
function setup({before='OCEANÍA',after='ÁFRICA',failAudit=false}={}){
 const calls=[];let payload;const connection={beginTransaction:async()=>calls.push('begin'),commit:async()=>calls.push('commit'),rollback:async()=>calls.push('rollback'),release:()=>calls.push('release'),query:async(sql,params)=>{
 if(sql.includes('FOR UPDATE'))return [[{grupo:before}]];
 if(sql.startsWith('UPDATE')){calls.push('update');return [{affectedRows:1}]}
 if(sql.startsWith('SELECT'))return [[{grupo:after,audit_recorded_at:'2026-10-19 10:00:00.123456'}]];
 if(sql.includes('INSERT INTO control_escolar_audit_events')){calls.push('audit');payload=JSON.parse(params.at(-1));if(failAudit)throw Error('audit failed');return [{insertId:42}]}
 throw Error(sql);
 }};
 const ctx=vm.createContext({getControlEscolarCentralDb:()=>({getConnection:async()=>connection}),canonicalMatriculaKey:v=>v,escapeColumn:v=>'`'+v+'`',normalizePlantel:v=>v,normalizeUpper:v=>String(v??'').trim().toUpperCase(),createError:v=>Object.assign(Error(v.message),v),console:{info:(message,data)=>calls.push(data||JSON.parse(message)),error(){}}});
 vm.runInContext(ts.transpile(code+'\nglobalThis.run=upsertMatriculaOverlay',{target:ts.ScriptTarget.ES2022}),ctx);
 return {calls,get payload(){return payload},run:(expected=before,action='select')=>ctx.run('PM','PM0961',[{column:'grupo',field:'grupo',value:after}],{email:'actor@example.invalid'},'PM',{matricula:new Set(['grupo','updated_by'])},'aurora_control_escolar_write',{groupMutation:{action,expectedGroup:expected},auditRequestId:'request-test'})};
}
test('group write and exact before/after audit commit together with origin, action and request reference',async()=>{const s=setup();await s.run();assert.deepEqual(s.calls.slice(0,4),['begin','update','audit','commit']);assert.equal(s.payload.changes[0].before,'OCEANÍA');assert.equal(s.payload.changes[0].after,'ÁFRICA');assert.equal(s.payload.requestId,'request-test');assert.equal(s.payload.action,'select');assert.equal(s.calls.find(v=>v?.auditEventId)?.auditEventId,42)});
test('stale concurrent group overwrite is rejected before any update or audit',async()=>{const s=setup();await assert.rejects(s.run('AMÉRICA'),e=>e.statusCode===409);assert.deepEqual(s.calls,['begin','rollback','release'])});
test('audit failure rolls back the group change',async()=>{const s=setup({failAudit:true});await assert.rejects(s.run(),/audit failed/);assert.ok(s.calls.includes('rollback'));assert.equal(s.calls.includes('commit'),false)});
test('no-op saves do not create audit events or historical write log entries',async()=>{const s=setup({after:'OCEANÍA'});await s.run();assert.equal(s.calls.includes('audit'),false);assert.equal(s.calls.some(v=>v?.auditEventId),false)});
test('explicit removal still stores both values and its action',async()=>{const s=setup({after:''});await s.run('OCEANÍA','remove');assert.equal(s.payload.action,'remove');assert.equal(s.payload.changes[0].after,'')});
