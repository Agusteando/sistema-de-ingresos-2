import test from 'node:test';import assert from 'node:assert/strict';import {groupAuditStudents,groupAuditDates,auditRecordNoun} from '../shared/utils/auditStudentTimeline.ts';
const row=(id,matricula,at,extra={})=>({id:String(id),eventId:id,matricula,plantel:'PM',student:'Nombre completo '+matricula,quality:'verified',recordedAt:'2026-10-19 '+at,...extra});
test('one branch per student, quick counts and newest-first subtree preserve same-second order',()=>{const records=[row(1,'PM1626','09:15:47'),row(3,'PM0912','09:51:44.557864'),row(2,'PM1626','09:15:54')];const groups=groupAuditStudents(records);assert.equal(groups.length,2);assert.equal(groups[0].matricula,'PM0912');assert.deepEqual(groups[1].changes.map(r=>r.eventId),[2,1]);assert.equal(records[0].eventId,1)});
test('supporting records cannot replace the latest verified change or inflate change counts',()=>{const groups=groupAuditStudents([row(2,'PM0961','09:03:47',{after:'ÁFRICA'}),row(3,'PM0961','09:03:48',{quality:'historical'}),row(1,'PM0961','09:03:46',{after:''})]);assert.equal(groups[0].latest.after,'ÁFRICA');assert.equal(groups[0].changes.length,2);assert.equal(groups[0].observations.length,1)});
test('campuses remain separate and available full names replace matrícula-only historical labels',()=>{const groups=groupAuditStudents([row(1,'PM0961','09:00:01',{student:'PM0961'}),row(2,'PM0961','08:00:01',{student:'Arleth Almazan Verdugo'}),row(3,'PM0961','07:00:00',{plantel:'PT'})]);assert.equal(groups.length,2);assert.equal(groups[0].student,'Arleth Almazan Verdugo')});

test('date focus retains every date and sorts both dividers and their events without mutating input',()=>{
 const records=[row(1,'PM1626','09:00:00'),row(2,'PM1626','09:00:01',{recordedAt:'2026-10-14 09:00:01'}),row(3,'PM0961','09:00:02')]
 const days=groupAuditDates(records,'2026-10-15')
 assert.deepEqual(days.map(day=>day.date),['2026-10-19','2026-10-15','2026-10-14'])
 assert.equal(days[1].events.length,0);assert.deepEqual(days[0].events.map(event=>event.eventId),[3,1]);assert.equal(records[0].eventId,1)
})

test('mixed or historical records are not falsely labelled as verified changes',()=>{
 assert.equal(auditRecordNoun([{quality:'verified'}]),'cambio')
 assert.equal(auditRecordNoun([{quality:'historical'}]),'registro')
 assert.equal(auditRecordNoun([{quality:'verified'},{quality:'historical'}]),'registros')
})
