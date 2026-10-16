import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createContext,runInContext} from 'node:vm'
import ts from 'typescript'
const source=readFileSync(new URL('../server/utils/control-escolar-audit.ts',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace(/export /g,'')+'\nglobalThis.getSummary=getControlEscolarAuditSummary'
test('activity and updated students resolve complete names; missing names do not fall back to matrícula',async()=>{
 const calls=[]
 const ctx=createContext({Date,console,PLANTELES_LIST:['PT','PM'],normalizePlantel:v=>String(v||'').toUpperCase(),getTrustedAuthUser:async()=>({isSuperAdmin:false,plantelesList:['PT'],auth_home_plantel:'PT'}),getQuery:()=>({}),createError:v=>Object.assign(new Error(v.message),v),controlEscolarCentralQuery:async(sql,params)=>{
  calls.push({sql,params})
  if(sql.includes('FROM matricula'))return [{matricula:'PT0123',nombres:'Ana María',apellido_paterno:'García',apellido_materno:'López'}]
  if(sql.includes('GROUP BY matricula'))return [{matricula:'PT0123',total:1},{matricula:'PT9999',total:1}]
  if(sql.includes('GROUP BY event_type'))return [{event_type:'student_update',total:2}]
  if(sql.includes("event_type = 'page_snapshot'"))return []
  return [{id:1,event_type:'student_update',matricula:'PT0123',created_at:'2026-10-16T12:00:00Z',summary:'student_patch_matricula_overlay',source_flow:'live-bridge-enriched'}]
 }})
 runInContext(ts.transpile(source,{target:ts.ScriptTarget.ES2022}),ctx)
 const result=await ctx.getSummary({}, {plantel:'PT'})
 assert.equal(result.timeline[0].student,'Ana María García López')
 assert.equal(result.updatedStudents[0].student,'Ana María García López')
 assert.equal(result.updatedStudents[1].student,'')
 const lookups=calls.filter(c=>c.sql.includes('FROM matricula'))
 assert.equal(lookups.length,1)
 assert.deepEqual(Array.from(lookups[0].params),['PT0123','PT9999'])
 assert.ok(calls.filter(c=>c.sql.includes('control_escolar_audit_events')).every(c=>c.params[0]==='PT'))
})
