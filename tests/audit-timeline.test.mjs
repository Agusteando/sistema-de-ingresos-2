import test from 'node:test';
import assert from 'node:assert/strict';
import { compareAuditNewest, auditDateLabel } from '../shared/utils/auditTimeline.ts';
test('sub-millisecond writes stay ordered, and timestamps without fractions tie by ledger id',()=>{
 const events=[{eventId:2,recordedAt:'2026-10-19 09:03:00.123000001'},{eventId:3,recordedAt:'2026-10-19 09:03:00.123000009'}];
 assert.equal(events.sort(compareAuditNewest)[0].eventId,3);
 assert.ok(compareAuditNewest({eventId:1,recordedAt:'2026-10-19 09:03:00'},{eventId:2,recordedAt:'2026-10-19 09:03:00.000000'})>0);
});
test('cards show seconds and retained fractions without inventing historical precision',()=>{
 assert.match(auditDateLabel('2026-10-19 09:03:00.123456'),/09:03:00\.123456/);
 assert.match(auditDateLabel('2026-10-19 09:03:00'),/09:03:00$/);
 assert.match(auditDateLabel('2026-10-19 09:03:00.000000'),/09:03:00$/);
});
