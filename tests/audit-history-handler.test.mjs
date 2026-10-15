import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createContext,runInContext} from 'node:vm'
import ts from 'typescript'
const source=readFileSync(new URL('../server/api/control-escolar/audit/history.get.ts',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace('export default defineEventHandler','globalThis.handler=defineEventHandler')
function setup(load){
 const ctx=createContext({Intl,Date,console:{warn(){}},PLANTELES_LIST:['PM'],getTrustedAuthUser:async()=>({isSuperAdmin:true}),normalizePlantel:v=>String(v||'').toUpperCase(),getQuery:()=>({plantel:'ALL',from:'2026-09-29',to:'2026-09-29'}),setResponseHeader(){},defineEventHandler:fn=>fn,createError:value=>Object.assign(new Error(value.message),value),loadHistoricalActions:load,controlEscolarCentralQuery:async()=>[],loadAuditStaffProfiles:async()=>new Map(),isCasitaWorkspaceEmail:()=>false})
 runInContext(ts.transpile(source,{target:ts.ScriptTarget.ES2022}),ctx)
 return ()=>ctx.handler({context:{auroraRequestId:'runtime-test-reference'}})
}
test('source failure returns retryable HTTP 503 with request reference, never successful empty history',async()=>{
 const invoke=setup(async()=>{throw Object.assign(new Error('fetch failed'),{cause:{code:'ENOTFOUND'}})})
 await assert.rejects(invoke(),error=>error.statusCode===503&&error.data.code==='AUDIT_HISTORY_UNAVAILABLE'&&error.data.requestId==='runtime-test-reference'&&error.data.retryable===true)
})
test('available historical source forwards its resolved events and coverage state',async()=>{
 const invoke=setup(async()=>({events:[{matricula:'PM0637',source:'Husky Pass',actor:'Husky Pass · Familia'}],available:true,partial:false,truncated:false,checked:1,unmatched:0}))
 const result=await invoke()
 assert.equal(result.events[0].source,'Husky Pass')
 assert.equal(result.available,true)
 assert.equal(result.checked,1)
})
