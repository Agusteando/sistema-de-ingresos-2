import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const financial = source('../server/api/students/index.get.ts');
const control = source('../server/utils/control-escolar.ts');
const ciclo = source('../shared/utils/ciclo.ts');
const tipo = source('../shared/utils/tipoIngreso.ts').replace(/^import .*?;\s*/m, '');
const projection = control.slice(control.indexOf('const rowHasCurrentEnrollmentEvidence ='), control.indexOf('type CycleConceptEvidence ='));
const context = createContext({
  normalizeText: value => String(value ?? '').trim(),
  firstText: (...values) => values.find(value => String(value ?? '').trim()) || '',
  normalizePlantel: value => String(value ?? '').trim().toUpperCase(),
  calculatePromotedGrado: () => ({ plantel: 'PT', grado: 'primero', nivel: 'primaria', outOfScope: false }),
  displayGrado: value => value,
  parseEnrollmentConceptIds: values => [...new Set((Array.isArray(values) ? values.flat(Infinity) : [values]).flatMap(value => String(value ?? '').split(/[|,;]/)).filter(Boolean))],
  getHistoricalEnrollmentConceptEvidence: async () => new Map(),
});
const stripExports = text => text.replace(/\bexport\s+/g, '');
runInContext(ts.transpile(stripExports(ciclo) + '\n' + stripExports(tipo) + '\n' + projection + '\nglobalThis.project = applyOperatorProjection; globalThis.resolve = resolveTipoIngreso;', { target: ts.ScriptTarget.ES2022 }), context);

test('both live roster queries share financial evidence joins and manual override fields; CE never requests financial amounts', () => {
  assert.match(financial, /financialEnrollmentEvidenceJoins\('A'\)/);
  assert.match(control, /financialEnrollmentEvidenceJoins\("b", false\)/);
  assert.match(financial, /financialTipoIngresoOverrideFields\.join/);
  assert.match(control, /fields\.push\(\.\.\.financialTipoIngresoOverrideFields\)/);
  const sql = source('../server/utils/financial-enrollment-evidence-sql.ts');
  const sqlContext = createContext({});
  runInContext(ts.transpile(stripExports(sql) + '\nglobalThis.joins = financialEnrollmentEvidenceJoins;', { target: ts.ScriptTarget.ES2022 }), sqlContext);
  const detailed = sqlContext.joins('A');
  const ids = sqlContext.joins('b', false);
  assert.equal((ids.match(/\?/g) || []).length, 4);
  assert.match(detailed, /SUM\(R\.monto\)/);
  assert.doesNotMatch(ids, /SUM\(|montoFinal|conceptoNombre/);
  assert.match(ids, /M\.mes >= P\.start_mes/);
  assert.match(ids, /GROUP_CONCAT\(DISTINCT concepto SEPARATOR '\|'\) AS conceptoIdsCargadosPrevios/);
});

const cases = [
  { label: 'manual interno overrides same-cycle anchor', baseCiclo: '2027', tipoIngresoOverrideActivo: 1, tipoIngresoOverride: 'interno', expected: 'interno' },
  { label: 'manual externo overrides earlier anchor', baseCiclo: '2025', tipoIngresoOverrideActivo: 1, tipoIngresoOverride: 'externo', expected: 'externo' },
  { label: 'raw previous concept establishes a confirmed pair for future entrant', baseCiclo: '2027', financialPreviousChargedConceptIds: '10', expected: 'interno' },
  { label: 'legacy CE-only charge must not change the type', baseCiclo: '2027', conceptoIdsCargados: '10|20', expected: 'externo' },
  { label: 'earlier anchor remains internal', baseCiclo: '2026', expected: 'interno' },
  { label: 'historical pair retains priority', baseCiclo: '2027', conceptoIdsHistoricos: '10|20', expected: 'interno' },
];
for (const fixture of cases) {
  test(fixture.label, async () => {
    const row = { matricula: 'PT-TEST', basePlantel: 'PT', baseEstatus: 'Activo', conceptoIdsPagados: '20', financialPaidConceptIds: '20', conceptoIdsHistoricos: '', ...fixture };
    const scope = { cicloKey: '2027', previousCiclo: '2026', enrollmentConceptIds: ['20'], tipoIngresoConceptIds: ['10', '20'] };
    const [projected] = await context.project('PT', [row], scope);
    const expected = context.resolve({
      cicloBase: row.baseCiclo,
      tipoIngresoOverrideActivo: row.tipoIngresoOverrideActivo,
      tipoIngresoOverride: row.tipoIngresoOverride,
      conceptoIdsPagados: row.financialPaidConceptIds,
      conceptoIdsCargados: row.financialChargedConceptIds,
      conceptoIdsPagadosPrevios: row.financialPreviousPaidConceptIds,
      conceptoIdsCargadosPrevios: row.financialPreviousChargedConceptIds,
      conceptoIdsHistoricos: row.conceptoIdsHistoricos,
    }, scope.cicloKey, { enrollmentConcepts: scope.tipoIngresoConceptIds });
    assert.equal(expected.value, fixture.expected);
    assert.equal(projected.operatorTipoIngreso, expected.value);
    assert.equal(projected.operatorTipoIngresoSource, expected.source);
    assert.equal(projected.operatorEnrollmentState, 'inscrito');
  });
}

test('2026 and 2027 each use their selected cycle; no-inscrito and baja semantics are preserved', async () => {
  for (const cicloKey of ['2026', '2027']) {
    const scope = { cicloKey, previousCiclo: String(Number(cicloKey) - 1), enrollmentConceptIds: ['20'], tipoIngresoConceptIds: ['10', '20'] };
    const base = { basePlantel: 'PT', baseCiclo: '2026', baseEstatus: 'Activo', conceptoIdsHistoricos: '' };
    const rows = [
      { ...base, matricula: 'active', conceptoIdsPagados: '20', financialPaidConceptIds: '20' },
      { ...base, matricula: 'pending' },
      { ...base, matricula: 'withdrawn', baseEstatus: 'Baja', conceptoIdsPagados: '20', financialPaidConceptIds: '20' },
    ];
    const result = await context.project('PT', rows, scope);
    assert.deepEqual(Array.from(result, row => row.operatorEnrollmentState), ['inscrito', 'no_inscrito', 'baja_inscrita']);
    assert.equal(result[0].operatorTipoIngreso, cicloKey === '2026' ? 'externo' : 'interno');
  }
});
