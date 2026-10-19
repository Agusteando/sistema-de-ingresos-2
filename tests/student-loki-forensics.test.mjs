import test from 'node:test'
import assert from 'node:assert/strict'
import {identityTokens,redactEvidence,inspectStudentLoki,contextSelector} from '../scripts/inspect-student-loki.mjs'
test('forensic query includes all matching actions and exact-stream neighboring console lines',async()=>{
 const calls=[],ns=String(BigInt(Date.parse('2026-10-14T13:59:53-06:00'))*1000000n)
 const fetcher=async url=>{calls.push(url);return {ok:true,json:async()=>({status:'success',data:{result:calls.length===1?[{stream:{container_name:'app-sistema-de-ingresos-2'},values:[[ns,"  matricula: 'PM1626',"]]}]:calls.length===4?[{stream:{container_name:'app-sistema-de-ingresos-2'},values:[[ns,"[Control Escolar] centralized matricula overlay updated {"],[String(BigInt(ns)+1n)," fields: [ 'grupo' ]"]]}]:[]}})}}
 const result=await inspectStudentLoki({matricula:'PM1626',from:'2026-10-14',to:'2026-10-14',endpoint:'http://loki:3100',fetcher})
 assert.equal(result.complete,true);assert.equal(result.records.length,3)
 assert.ok(calls[0].searchParams.get('query').includes(identityTokens('PM1626')[1]))
 assert.ok(!calls[0].searchParams.get('query').includes('database-committed'))
 assert.equal(calls[3].searchParams.get('query'),'{container_name="app-sistema-de-ingresos-2"}')
 assert.ok(result.records.every(r=>r.evidenceHash.length===64))
})
test('failed sources remain incomplete and cannot appear as an empty successful history',async()=>{
 const result=await inspectStudentLoki({matricula:'PM1626',from:'2026-10-14',to:'2026-10-14',endpoint:'http://loki:3100',fetcher:async()=>({ok:false,status:503})})
 assert.equal(result.complete,false);assert.equal(result.failures.length,3)
})
test('diagnostic masks credentials and photo URLs, and rejects invalid student/date scopes',async()=>{
 const text=redactEvidence('password: "sensitive", token: abc, foto: https://example.com/a.jpg')
 assert.ok(!text.includes('sensitive'));assert.ok(!text.includes('abc'));assert.ok(!text.includes('example.com'))
 await assert.rejects(inspectStudentLoki({matricula:'PM1626|.*',from:'2026-10-14',to:'2026-10-14',endpoint:'http://loki:3100'}))
 await assert.rejects(inspectStudentLoki({matricula:'PM1626',from:'2026-09-01',to:'2026-10-19',endpoint:'http://loki:3100'}))
})

test('context uses container identity and never restricts continuation/header lines by detected level',()=>{
 assert.equal(contextSelector({container:'immutable-id',container_name:'app-sistema-de-ingresos-2',node:'casita01',detected_level:'unknown',service_name:'derived'}),'{container="immutable-id",node="casita01"}')
 assert.equal(contextSelector({container_name:'app-sistema-de-ingresos-2',detected_level:'unknown'}),'{container_name="app-sistema-de-ingresos-2"}')
})
