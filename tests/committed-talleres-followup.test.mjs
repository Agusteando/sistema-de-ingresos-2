import { test } from 'node:test'
import assert from 'node:assert/strict'
import { settleCommittedTalleresFollowup } from '../server/utils/committed-talleres-followup.ts'

test('a failed DC source does not mask committed catalog write or skip healthy campus', async () => {
 const order=[]
 const result=await settleCommittedTalleresFollowup(['DC','PT'],{
  invalidate: async p=>{order.push('invalidate:'+p)},
  refresh: async p=>{order.push('refresh:'+p);if(p==='DC')throw Object.assign(Error('failed'),{statusMessage:'TALLERES_SNAPSHOT_SOURCE_NOT_CURRENT'});return {current:true}}
 })
 assert.deepEqual(order,['invalidate:DC','invalidate:PT','refresh:DC','refresh:PT'])
 assert.equal(result.pending,true)
 assert.equal(result.current,false)
 assert.equal(result.refreshed,1)
 assert.deepEqual(result.failures,[{plantel:'DC',operation:'refresh',code:'TALLERES_SNAPSHOT_SOURCE_NOT_CURRENT'}])
})
test('failed invalidation does not silently mark the campus ready or prevent other refreshes',async()=>{
 const refreshed=[]
 const result=await settleCommittedTalleresFollowup(['DC','PT'],{
  invalidate:async p=>{if(p==='DC')throw Object.assign(Error('outage'),{code:'ECONNRESET'})},
  refresh:async p=>{refreshed.push(p);return true}
 })
 assert.deepEqual(refreshed,['PT'])
 assert.equal(result.pending,true)
 assert.deepEqual(result.failures,[{plantel:'DC',operation:'invalidate',code:'ECONNRESET'}])
})
test('successful current refresh completes cleanly and targets are deduplicated',async()=>{
 const order=[]
 const result=await settleCommittedTalleresFollowup(['PT','PT','SM'],{
  invalidate:async p=>{order.push('invalidate:'+p)},
  refresh:async p=>{order.push('refresh:'+p);return {rows:3}}
 })
 assert.equal(result.success,true)
 assert.equal(result.pending,false)
 assert.equal(result.refreshed,2)
 assert.deepEqual(order,['invalidate:PT','invalidate:SM','refresh:PT','refresh:SM'])
})

test('queued refresh returns after invalidation without waiting on campus source', async () => {
 let unblock
 const gate = new Promise(resolve => { unblock = resolve })
 let complete
 const done = new Promise(resolve => { complete = resolve })
 const steps=[]
 const result=await settleCommittedTalleresFollowup(['DC','PT'], {
  invalidate: async p => { steps.push('invalidate:'+p) },
  refresh: async p => { steps.push('refresh:'+p); if(p==='DC') await gate; return p },
 }, { queued:true, onComplete:complete })
 assert.equal(result.queued, true)
 assert.equal(result.pending, true)
 assert.deepEqual(steps.slice(0,2),['invalidate:DC','invalidate:PT'])
 unblock()
 const final=await done
 assert.deepEqual(final,{failures:[],refreshed:2})
 assert.deepEqual(steps,['invalidate:DC','invalidate:PT','refresh:DC','refresh:PT'])
})
