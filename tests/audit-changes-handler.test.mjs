import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createContext,runInContext} from 'node:vm'
import ts from 'typescript'
const source=readFileSync(new URL('../server/api/control-escolar/audit/changes.get.ts',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace('export default defineEventHandler','globalThis.handler=defineEventHandler')
function setup(user,query){
 const calls=[]
 const ctx=createContext({Intl,Date,PLANTELES_LIST:['PT','SM'],getTrustedAuthUser:async()=>user,normalizePlantel:v=>String(v||'').toUpperCase(),getQuery:()=>query,setResponseHeader(){},defineEventHandler:fn=>fn,createError:v=>Object.assign(new Error(v.message),v),loadAuditStaffProfiles:async()=>new Map(),controlEscolarCentralQuery:async(sql,params)=>{calls.push({sql,params});return []}})
 runInContext(ts.transpile(source,{target:ts.ScriptTarget.ES2022}),ctx)
 return {invoke:()=>ctx.handler({}),calls}
}
const user={isSuperAdmin:false,hasControlEscolarRole:true,plantelesList:['PT','SM']}
test('selecting one campus scopes SQL while retaining all authorized searchable campus options',async()=>{
 const s=setup(user,{plantel:'PT',from:'2026-10-09',to:'2026-10-15'}),r=await s.invoke()
 assert.deepEqual(Array.from(r.allowedPlanteles),['PT','SM'])
 assert.deepEqual(Array.from(s.calls[0].params).slice(0,1),['PT'])
 assert.equal(s.calls[0].sql.includes('IN (?)'),true)
})
test('denies an unauthorized campus before querying audit data',async()=>{
 const s=setup(user,{plantel:'CT'})
 await assert.rejects(s.invoke(),e=>e.statusCode===403)
 assert.equal(s.calls.length,0)
})
test('denies financial-only users before querying audit data',async()=>{
 const s=setup({...user,hasControlEscolarRole:false},{plantel:'PT'})
 await assert.rejects(s.invoke(),e=>e.statusCode===403)
 assert.equal(s.calls.length,0)
})
