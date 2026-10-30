import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rollupConceptReports } from '../shared/utils/shared-concept-rollup.mjs'

test('counts distinct students per campus across duplicate concept movements', () => {
  const output = rollupConceptReports([
    { plantel:'PM', report:{ modo:'movements', conceptos:[{ concepto:'Fútbol' }], rows:[
      { matricula:'PM001', nombreCompleto:'Ana', curp:'PRIVATE' },
      { matricula:'PM001', nombreCompleto:'Ana', monto:120 },
      { matricula:'PM002', nombreCompleto:'Luis' },
    ]}},
    { plantel:'PT', report:{ modo:'movements', rows:[{ matricula:'PT001', nombreCompleto:'Eva' }] }},
  ])
  assert.equal(output.resumen.alumnos,3)
  assert.equal(output.resumen.movimientos,4)
  assert.deepEqual(output.resumen.planteles.map(x=>x.alumnos),[2,1])
  assert.equal(output.rows.length,3)
  assert.equal('curp' in output.rows[0],false)
  assert.equal('monto' in output.rows[0],false)
})
test('missing concept report retains existing enrolled student population', () => {
  const output = rollupConceptReports([{ plantel:'CT', report:{ modo:'missing', resumen:{inscritos:12}, rows:[] } }])
  assert.equal(output.resumen.inscritos,12)
  assert.equal(output.resumen.alumnos,0)
  assert.equal(output.resumen.planteles[0].alumnos,0)
})
test('same matricula in separate campus is not silently collapsed', () => {
  const result = rollupConceptReports([
    {plantel:'PM',report:{modo:'missing',rows:[{matricula:'123',nombreCompleto:'A'}]}},
    {plantel:'PT',report:{modo:'missing',rows:[{matricula:'123',nombreCompleto:'B'}]}},
  ])
  assert.equal(result.resumen.alumnos,2)
})
