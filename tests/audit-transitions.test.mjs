import test from 'node:test';import assert from 'node:assert/strict';import {compactAuditTransitions,reconcileAuditMirrors} from '../shared/utils/auditTransitions.ts';
const event=(id,before,after,time='09:15:47',extra={})=>({id:String(id),eventId:id,recordedAt:'2026-10-19 '+time,matricula:'PM1626',plantel:'PM',field:'grupo',quality:'verified',source:'Aurora',actor:'Erika Ramos Escalera',actorEmail:'erika@example.invalid',before,after,...extra});
test('clear then assign is one readable transition with both original writes retained, without mutation',()=>{const a=event(1,'AMÉRICA',''),b=event(2,'','ANTÁRTIDA','09:15:54');const result=compactAuditTransitions([b,a]);assert.equal(result.length,1);assert.equal(result[0].before,'AMÉRICA');assert.equal(result[0].after,'ANTÁRTIDA');assert.deepEqual(result[0].combinedEvents,[a,b]);assert.equal(a.after,'');assert.equal(b.before,'');assert.deepEqual(compactAuditTransitions(result),result)});
test('persistent empties, different actors, sources, fields, dates and long gaps remain visible',()=>{const a=event(1,'AMÉRICA','');assert.equal(compactAuditTransitions([a]).length,1);for(const override of [{actorEmail:'other@example.invalid'},{source:'Husky Pass'},{field:'foto'},{quality:'historical'},{recordedAt:'2026-10-20 09:15:54'},{recordedAt:'2026-10-19 09:18:00'}])assert.equal(compactAuditTransitions([a,event(2,'','ANTÁRTIDA','09:15:54',override)]).length,2)});
test('intervening verified edit prevents a guessed combined action; no-op return retains raw writes',()=>{assert.equal(compactAuditTransitions([event(1,'AMÉRICA',''),event(2,'A','B','09:15:50',{field:'nombres'}),event(3,'','ANTÁRTIDA','09:15:54')]).length,3);assert.equal(compactAuditTransitions([event(1,'AMÉRICA',''),event(2,'','AMÉRICA','09:15:54')]).length,2)});
test('same-second ordered ledger ids can merge; supporting evidence is retained',()=>{const result=compactAuditTransitions([event(1,'AMÉRICA',''),event(2,null,null,'09:15:47',{quality:'historical'}),event(3,'','ÁFRICA')]);assert.equal(result.length,2);assert.ok(result.some(row=>row.quality==='historical'));assert.equal(result.find(row=>row.combinedEvents)?.after,'ÁFRICA')});

test('only an exact event-id/field/student/value mirror is suppressed; time alone or conflicts never qualify',()=>{
 const original=event(12,'AMÉRICA','ANTÁRTIDA')
 const mirror={...original,id:'log',eventId:0,relatedEventId:12}
 assert.equal(reconcileAuditMirrors([original,mirror]).length,1)
 assert.equal(reconcileAuditMirrors([original,{...mirror,after:'ÁFRICA'}]).length,2)
 assert.equal(reconcileAuditMirrors([original,{...mirror,relatedEventId:undefined}]).length,2)
})

test('explicit Loki event link fills missing values automatically without changing original account or payload',()=>{
 const stored=event(12,null,null,'09:15:47',{quality:'historical'})
 const source=event(0,'A','B','09:15:47',{id:'log-hash',relatedEventId:12,actor:'Source account'})
 const r=reconcileAuditMirrors([stored,source])
 assert.equal(r.length,1);assert.equal(r[0].before,'A');assert.equal(r[0].after,'B');assert.equal(r[0].actor,stored.actor);assert.equal(stored.before,null)
 for(const override of [{matricula:'PT0001'},{plantel:'PT'},{field:'grado'},{source:'Husky Pass'},{relatedEventId:13}])assert.equal(reconcileAuditMirrors([stored,{...source,...override}])[0].before,null)
 assert.equal(reconcileAuditMirrors([stored,source,{...source,id:'conflict',after:'C'}])[0].before,null)
})
