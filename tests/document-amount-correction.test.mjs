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
