import test from 'node:test'
import assert from 'node:assert/strict'
import { amountToCents, centsToAmount, canCorrectDocumentAmount, paymentFloorCents } from '../shared/utils/documentAmountCorrection.ts'

test('corrects $1.17 residual without rewriting the $1635 payment', () => {
 const payments=[{paidCents:163500}]
 assert.equal(amountToCents('1636.17'),163617)
 assert.deepEqual(canCorrectDocumentAmount('1635.00',payments),{valid:true,allowed:true,nextCents:163500,minimumCents:163500})
 assert.equal(centsToAmount(163617-163500),1.17)
})
test('partial payments on multiple months must be checked per month',()=>{
 const months=[{paidCents:11050},{paidCents:12575},{paidCents:0}]
 assert.equal(paymentFloorCents(months),12575)
 assert.equal(canCorrectDocumentAmount('125.74',months).allowed,false)
 assert.equal(canCorrectDocumentAmount('125.75',months).allowed,true)
})
test('rejects more than two decimal places, negatives, zero and unbounded numbers',()=>{
 for(const invalid of ['0.00','4.001','-1.00','abc','Infinity','1000000000',null]) {
   assert.equal(canCorrectDocumentAmount(invalid,[]).allowed,false, String(invalid))
 }
 assert.equal(amountToCents('0.01'),1)
})

import { readFile } from 'node:fs/promises'

test('the correction modifies only the requested document and writes an atomic audit', async () => {
  const api = await readFile('server/api/documentos/[id]/monto.put.ts', 'utf8')
  assert.match(api, /SELECT documento FROM documentos WHERE documento = \? FOR UPDATE/)
  assert.match(api, /UPDATE documentos SET montoFinal = \?/)
  assert.match(api, /GROUP BY payment_month/)
  assert.match(api, /LOWER\(TRIM\(CAST\(estatus AS CHAR\)\)\) = 'vigente'/)
  assert.match(api, /INSERT INTO documento_monto_correcciones/)
  assert.match(api, /notifyDocumentAmountCorrection\(message\)/)
  assert.doesNotMatch(api, /UPDATE documento_concepto_periodos/)
  assert.doesNotMatch(api, /UPDATE referenciasdepago/)
  assert.doesNotMatch(api, /detalle\.length < 8|Selecciona el motivo de la corrección/)
})

test('existing concept-period overrides are excluded from the document amount floor', async () => {
  const source = await readFile('server/utils/document-amount-correction.ts', 'utf8')
  assert.match(source, /const editable = !period \|\| String\(period\.accion/)
  assert.match(source, /const editableMonths = months\.filter\(month => month\.editable\)/)
  assert.match(source, /paymentFloorCents\(editableMonths\)/)
  assert.match(source, /affectedMonths: editableMonths\.length/)
  assert.match(source, /getDocumentoPeriodoSchema\(\)/)
})

test('Ajustar concepto gives visible payment guidance without a mandatory explanation or batch action', async () => {
  const ui = await readFile('components/ConceptChangeModal.vue', 'utf8')
  assert.match(ui, /v-if="mode === 'amount'"/)
  assert.match(ui, /amount-minimum-guidance/)
  assert.match(ui, /Usar \{\{ money\(amountPreview\.minimumAllowed\) \}\}/)
  assert.match(ui, /#\{\{ amountPreview\.documento \}\}/)
  assert.doesNotMatch(ui, /amountDetail|amountAcknowledged|amount-months/)
})

test('payment registration guards against stale document amounts without breaking first-time initialization', async () => {
  const payment = await readFile('server/api/payments/pay.post.ts', 'utf8')
  assert.match(payment, /montoFinal <=> \? AND estatus = 'Activo' FOR UPDATE/)
  assert.match(payment, /doc\.montoFinal == null && !periodIsChangedConcept \? finalAmount : doc\.montoFinal/)
})
