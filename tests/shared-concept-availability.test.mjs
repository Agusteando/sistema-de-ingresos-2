import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectAvailableConceptReports } from '../shared/utils/shared-concept-availability.mjs'
import { rollupConceptReports } from '../shared/utils/shared-concept-rollup.mjs'

test('one offline campus does not block valid results or become a false zero', async () => {
  const { available, failures } = await collectAvailableConceptReports(['PM','PT','SM'], async plantel => {
    if (plantel === 'PT') throw new Error('Bridge offline')
    return { modo: 'movements', rows: [{ matricula: plantel + '001', nombreCompleto: 'Ejemplo' }] }
  })
  assert.deepEqual(available.map(item => item.plantel), ['PM','SM'])
  assert.deepEqual(failures.map(item => item.plantel), ['PT'])
  assert.equal(rollupConceptReports(available).resumen.alumnos, 2)
})
test('all unavailable differs from a valid campus with zero students', async () => {
  const down = await collectAvailableConceptReports(['PM','PT'], async () => { throw new Error('Offline') })
  assert.equal(down.available.length,0)
  assert.equal(down.failures.length,2)
  const empty = await collectAvailableConceptReports(['PM'], async () => ({ modo:'missing',rows:[] }))
  assert.equal(empty.available.length,1)
  assert.equal(rollupConceptReports(empty.available).resumen.alumnos,0)
})
test('bounded concurrency preserves campus order', async () => {
  let active=0,max=0
  const r=await collectAvailableConceptReports(['PM','PT','SM','ST','CT'], async plantel => {
    active++
    max=Math.max(max,active)
    await Promise.resolve()
    active--
    return { rows:[{matricula:plantel}] }
  },2)
  assert.ok(max<=2)
  assert.deepEqual(r.available.map(v=>v.plantel),['PM','PT','SM','ST','CT'])
})
