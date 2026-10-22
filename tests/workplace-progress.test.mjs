import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeParentWorkplaces } from '../shared/utils/workplaceProgress.ts'
test('mother, father, both and blank workplaces are counted independently', () => {
  const r = summarizeParentWorkplaces([
    { lugarTrabajoPadre: ' Taller ', lugarTrabajoMadre: ' Escuela ' },
    { lugarTrabajoPadre: 'Fábrica', lugarTrabajoMadre: ' ' },
    { lugarTrabajoPadre: '', lugarTrabajoMadre: 'Tienda' },
    { lugarTrabajoPadre: null, lugarTrabajoMadre: null },
  ], { padre: true, madre: true })
  assert.equal(r.total, 4)
  assert.deepEqual([r.padre.registered, r.madre.registered, r.ambos.registered], [2, 2, 1])
  assert.equal(r.padre.percent, 50)
  assert.equal(r.ambos.pending, 3)
})
test('unavailable central fields must not be displayed as missing responses', () => {
  const r = summarizeParentWorkplaces([{ lugarTrabajoPadre: 'Oficina' }], { padre: true })
  assert.equal(r.padre.available, true)
  assert.equal(r.madre.available, false)
  assert.equal(r.ambos.available, false)
})
test('zero enrolled students cannot cause NaN percentages', () => {
  const r = summarizeParentWorkplaces([], { padre: true, madre: true })
  assert.equal(r.madre.percent, 0)
  assert.equal(r.padre.pending, 0)
})
