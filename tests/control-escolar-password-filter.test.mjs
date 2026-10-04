import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

const serverSource = readFileSync(new URL('../server/utils/control-escolar.ts', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../pages/control-escolar.vue', import.meta.url), 'utf8');
const serverFilter = serverSource.slice(serverSource.indexOf('const applyFilters ='), serverSource.indexOf('const buildCatalogs ='));
const clientFilter = pageSource.slice(pageSource.indexOf('const localStudentMatchesQuality ='), pageSource.indexOf('const localStudentMatchesRecent ='));
const context = createContext({
  normalizeText: value => String(value ?? '').trim(),
  normalizeUpper: value => String(value ?? '').trim().toUpperCase(),
  normalizeClientText: value => String(value ?? '').trim().toLowerCase(),
  isInscritoForControlProgress: student => student.enrollmentState === 'inscrito',
});
runInContext(ts.transpile(`${serverFilter}\n${clientFilter}\nglobalThis.serverFilter = applyFilters; globalThis.clientFilter = localStudentMatchesQuality;`, { target: ts.ScriptTarget.ES2022 }), context);
const rows = [
  { matricula: 'A', enrollmentState: 'inscrito', grado: 'primero', group: 'ASIA', huskyPassPlaintext: '' },
  { matricula: 'B', enrollmentState: 'inscrito', grado: 'primero', group: 'ASIA', huskyPassPlaintext: 'fixture-only' },
  { matricula: 'C', enrollmentState: 'no_inscrito', grado: 'cuarto', group: 'EUROPA', huskyPassPlaintext: '  ' },
  { matricula: 'D', enrollmentState: 'baja', grado: 'cuarto', group: 'EUROPA' },
];
const ids = result => Array.from(result, row => row.matricula);
test('missing-password filter agrees on the server and cached client, including empty and absent passwords', () => {
  assert.deepEqual(ids(context.serverFilter(rows, { quality: 'husky_password' })), ['A', 'C', 'D']);
  assert.deepEqual(ids(rows.filter(row => context.clientFilter(row, 'husky_password'))), ['A', 'C', 'D']);
});
test('missing-password filter composes with enrollment, grade and group; clearing restores every row', () => {
  assert.deepEqual(ids(context.serverFilter(rows, { quality: 'husky_password', status: 'inscritos', grado: 'primero', group: 'ASIA' })), ['A']);
  assert.deepEqual(ids(context.serverFilter(rows, { quality: 'husky_password', grado: 'cuarto', group: 'EUROPA' })), ['C', 'D']);
  assert.deepEqual(ids(context.serverFilter(rows, { quality: '' })), ['A', 'B', 'C', 'D']);
});
