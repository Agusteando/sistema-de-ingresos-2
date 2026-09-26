import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const root = resolve('.')

async function loadRecargo() {
  const source = await readFile(resolve(root, 'shared/utils/recargo.ts'), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText
  const context = vm.createContext({ console, Date })
  const module = new vm.SourceTextModule(js, { context, identifier: 'recargo.ts' })
  await module.link(() => { throw new Error('shared recargo must remain dependency-free') })
  await module.evaluate()
  return module.namespace
}

test('deudores and payment use the same canonical late-fee balance rules', async () => {
  const recargo = await loadRecargo()

  const afterDeadline = recargo.resolveLateFeeBalance({
    baseAmount: 1000,
    paidAmount: 0,
    enabled: true,
    hasManualLateFee: false,
    hasPayment: false,
    hasActiveConvention: false,
    ciclo: '2026-2027',
    schoolMonth: 1,
    currentDateValue: '2026-09-19',
    cutoffDay: 12,
    percentage: 10,
  })
  assert.equal(afterDeadline.appliesLateFee, true)
  assert.equal(afterDeadline.subtotal, 1100)
  assert.equal(afterDeadline.lateFeeAmount, 100)
  assert.equal(afterDeadline.balance, 1100)

  const priorPayment = recargo.resolveLateFeeBalance({
    baseAmount: 1000,
    paidAmount: 100,
    enabled: true,
    hasManualLateFee: false,
    hasPayment: true,
    hasActiveConvention: false,
    ciclo: '2026-2027',
    schoolMonth: 1,
    currentDateValue: '2026-09-19',
    cutoffDay: 12,
    percentage: 10,
  })
  assert.equal(priorPayment.appliesLateFee, false)
  assert.equal(priorPayment.balance, 900)

  const manualLateFee = recargo.resolveLateFeeBalance({
    baseAmount: 1000,
    paidAmount: 100,
    enabled: true,
    hasManualLateFee: true,
    hasPayment: true,
    hasActiveConvention: false,
    ciclo: '2026-2027',
    schoolMonth: 1,
    currentDateValue: '2026-09-19',
    cutoffDay: 12,
    percentage: 10,
  })
  assert.equal(manualLateFee.appliesLateFee, true)
  assert.equal(manualLateFee.balance, 1000)

  const convention = recargo.resolveLateFeeBalance({
    baseAmount: 1000,
    paidAmount: 0,
    enabled: true,
    hasManualLateFee: false,
    hasPayment: false,
    hasActiveConvention: true,
    ciclo: '2026-2027',
    schoolMonth: 1,
    currentDateValue: '2026-09-19',
    cutoffDay: 12,
    percentage: 10,
  })
  assert.equal(convention.appliesLateFee, false)
  assert.equal(convention.balance, 1000)
})

test('/deudores propagates recargos to UI, email, WhatsApp and external contract', async () => {
  const [deudores, pay, email, actions, page, external] = await Promise.all([
    readFile(resolve(root, 'server/utils/deudores.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/payments/pay.post.ts'), 'utf8'),
    readFile(resolve(root, 'server/utils/cobranzaEmail.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/deudores/actions.post.ts'), 'utf8'),
    readFile(resolve(root, 'pages/deudores.vue'), 'utf8'),
    readFile(resolve(root, 'server/utils/external-deudores.ts'), 'utf8'),
  ])

  assert.match(deudores, /loadRecargoPolicies/)
  assert.match(deudores, /resolveLateFeeBalance/)
  assert.match(deudores, /SELECT matricula, documento, mes, monto, recargo, estatus/)
  assert.match(deudores, /recargoMonto/)
  assert.match(deudores, /totalRecargos/)

  assert.match(pay, /resolveLateFeeBalance/)
  assert.match(email, /recargos_total_formateado/)
  assert.match(email, /Recargo/)
  assert.match(actions, /incluye .*recargos/)
  assert.match(actions, /totalRecargos/)
  assert.match(page, /Incluye .* de recargos/)
  assert.match(page, /Recargo_Concepto_MXN/)
  assert.match(external, /recargos: totalRecargos/)
})


test('ROLE_ADMON can remove recargos regardless of plantel scope, subject to day-15 rule unless global override is active', async () => {
  const recargo = await loadRecargo()
  assert.equal(recargo.canRemoveLateFee({
    roles: 'ROLE_ADMON',
    financialPlanteles: 'PT,ST',
    currentDateValue: '2026-09-14',
  }), true)
  assert.equal(recargo.canRemoveLateFee({
    roles: 'ROLE_ADMON',
    financialPlanteles: 'PT,ST',
    currentDateValue: '2026-09-15',
  }), false)
  assert.equal(recargo.canRemoveLateFee({
    roles: 'ROLE_ADMON',
    financialPlanteles: 'PT,ST',
    currentDateValue: '2026-09-16',
  }), false)
  assert.equal(recargo.canRemoveLateFee({
    roles: 'ROLE_ADMON',
    financialPlanteles: 'PT,ST',
    currentDateValue: '2026-09-26',
    allowAnyTime: true,
  }), true)
  assert.equal(recargo.canRemoveLateFee({
    roles: 'ROLE_CTRL',
    financialPlanteles: 'PT,ST',
    currentDateValue: '2026-09-26',
    allowAnyTime: true,
  }), false)
  assert.equal(recargo.canRemoveLateFee({
    roles: 'ROLE_ADMON',
    financialPlanteles: 'PT',
    currentDateValue: '2026-09-14',
  }), true)
  assert.equal(recargo.canRemoveLateFee({
    roles: 'ROLE_ADMON',
    financialPlanteles: 'PT',
    currentDateValue: '2026-09-15',
  }), false)
  assert.equal(recargo.canRemoveLateFee({
    roles: 'ROLE_ADMON',
    financialPlanteles: 'PT',
    currentDateValue: '2026-09-26',
    allowAnyTime: true,
  }), true)
  assert.equal(recargo.canRemoveLateFee({
    roles: 'ROLE_ADMON',
    financialPlanteles: '',
    currentDateValue: '2026-09-14',
  }), true)
  assert.equal(recargo.canRemoveLateFee({
    roles: 'ROLE_ADMON',
    financialPlanteles: null,
    currentDateValue: '2026-09-26',
    allowAnyTime: true,
  }), true)
  assert.equal(recargo.canRemoveLateFee({
    roles: 'ROLE_CTRL',
    financialPlanteles: 'PT,ST',
    currentDateValue: '2026-09-14',
  }), false)
  assert.equal(recargo.canRemoveLateFee({
    roles: 'superadmin',
    financialPlanteles: ['PT', 'ST'],
    currentDateValue: '2026-09-14',
  }), true)
  assert.equal(recargo.isLateFeeRemovalWindowOpen('2026-10-01'), true)
  assert.equal(recargo.isLateFeeRemovalWindowOpen('2026-10-14'), true)
  assert.equal(recargo.isLateFeeRemovalWindowOpen('2026-10-15'), false)

  const manualRecargoRemovedByAuthorizedAdmin = recargo.resolveLateFeeBalance({
    baseAmount: 1000,
    paidAmount: 100,
    eligible: true,
    enabled: true,
    suppress: true,
    hasManualLateFee: true,
    hasPayment: true,
    hasActiveConvention: false,
    ciclo: '2026-2027',
    schoolMonth: 1,
    currentDateValue: '2026-09-19',
    cutoffDay: 12,
    percentage: 10,
  })
  assert.equal(manualRecargoRemovedByAuthorizedAdmin.appliesLateFee, false)
  assert.equal(manualRecargoRemovedByAuthorizedAdmin.balance, 900)

  const [modal, pay, recargoApi, recargoPoliciesApi, globalRecargoApi, recargoConfig] = await Promise.all([
    readFile(resolve(root, 'components/PaymentModal.vue'), 'utf8'),
    readFile(resolve(root, 'server/api/payments/pay.post.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/recargos/concepto.put.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/recargos/conceptos.get.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/recargos/global.put.ts'), 'utf8'),
    readFile(resolve(root, 'server/utils/recargo-config.ts'), 'utf8'),
  ])

  assert.doesNotMatch(modal, /canRemoveLateFee/)
  assert.match(modal, /capabilities\?\.canRemoveRecargo/)
  assert.match(modal, /Quitar recargos en cualquier fecha/)
  assert.match(modal, /\/api\/recargos\/global/)
  assert.match(modal, /Quitar recargo de este pago/)
  assert.match(modal, /omitirRecargo: debtRecargoOmitted/)
  assert.doesNotMatch(modal, /isRecargoEligibleDebt\(debt\)\s*&&\s*!Boolean\(debt\?\.recargoManual\)/)
  assert.match(pay, /canRemoveLateFee/)
  assert.match(pay, /const globalRecargoSettings = await loadGlobalRecargoSettings\(\)/)
  assert.match(pay, /const canRemoveRecargo = canRemoveLateFee\(\{[\s\S]*?currentDateValue: originalDateKey,[\s\S]*?allowAnyTime: globalRecargoSettings\.allowRemovalAnyTime,[\s\S]*?\}\)/)
  assert.match(pay, /currentDateValue: effectiveDateKey/)
  assert.match(recargoPoliciesApi, /SELECT UNIX_TIMESTAMP\(\) AS currentUnix/)
  assert.match(recargoPoliciesApi, /globalRemovalOverride: globalSettings\.allowRemovalAnyTime/)
  assert.match(recargoPoliciesApi, /canManageGlobalRemovalOverride: hasLateFeeRemovalAccess/)
  assert.match(recargoPoliciesApi, /removalLockDay: LATE_FEE_REMOVAL_LOCK_DAY/)
  assert.match(globalRecargoApi, /setGlobalRecargoRemovalOverride/)
  assert.match(globalRecargoApi, /hasLateFeeRemovalAccess/)
  assert.doesNotMatch(globalRecargoApi, /múltiples planteles/)
  assert.doesNotMatch(await readFile(resolve(root, 'shared/utils/recargo.ts'), 'utf8'), /new Set\(plantelTokens\)/)
  assert.match(recargoConfig, /GLOBAL_RECARGO_OVERRIDE_ID = 0/)
  assert.match(recargoConfig, /loadGlobalRecargoSettings/)
  assert.match(recargoConfig, /setGlobalRecargoRemovalOverride/)
  assert.match(pay, /suppress: omitLateFeeNow/)
  assert.match(pay, /omitLateFeeNow = !isEventual && omitLateFeeRequested && canRemoveRecargo/)
  assert.doesNotMatch(pay, /omitLateFeeNow = .*hasRecargoManual/)
  assert.match(recargoApi, /Los recargos no se pueden desactivar\./)
  assert.match(recargoConfig, /Los recargos no se pueden desactivar\./)
  assert.match(recargoConfig, /activo: true/)
})

test('eventual financial concepts never receive automatic or manual recargos', async () => {
  const recargo = await loadRecargo()

  const forcedEventual = recargo.resolveLateFeeBalance({
    baseAmount: 1000,
    paidAmount: 0,
    eligible: false,
    enabled: true,
    force: true,
    hasManualLateFee: true,
    hasPayment: false,
    hasActiveConvention: false,
    ciclo: '2026-2027',
    schoolMonth: 1,
    currentDateValue: '2026-09-19',
    cutoffDay: 12,
    percentage: 10,
  })
  assert.equal(forcedEventual.appliesLateFee, false)
  assert.equal(forcedEventual.subtotal, 1000)
  assert.equal(forcedEventual.lateFeeAmount, 0)
  assert.equal(forcedEventual.balance, 1000)

  const [debts, deudores, noAdeudo, tuitionModal, pay, modal, documentCreate, financialConcept, recargoApi] = await Promise.all([
    readFile(resolve(root, 'server/api/students/[matricula]/debts.get.ts'), 'utf8'),
    readFile(resolve(root, 'server/utils/deudores.ts'), 'utf8'),
    readFile(resolve(root, 'server/utils/noAdeudo.ts'), 'utf8'),
    readFile(resolve(root, 'components/TuitionAmountModal.vue'), 'utf8'),
    readFile(resolve(root, 'server/api/payments/pay.post.ts'), 'utf8'),
    readFile(resolve(root, 'components/PaymentModal.vue'), 'utf8'),
    readFile(resolve(root, 'server/api/documentos/index.post.ts'), 'utf8'),
    readFile(resolve(root, 'server/utils/financial-concept.ts'), 'utf8'),
    readFile(resolve(root, 'server/api/recargos/concepto.put.ts'), 'utf8'),
  ])

  assert.match(debts, /eligible: recargoEligible/)
  assert.match(debts, /recargoEligible,/)
  assert.match(deudores, /eligible: recargoEligible/)
  assert.match(noAdeudo, /loadFinancialConceptMap/)
  assert.match(noAdeudo, /const recargoEligible = !isEventual && !Boolean\(financialConcepts\.get\(conceptoId\)\?\.eventual\)/)
  assert.match(noAdeudo, /eligible: recargoEligible/)
  assert.match(tuitionModal, /eligible: recargoEligible/)
  assert.match(pay, /eligible: !isEventual/)
  assert.match(pay, /Los conceptos eventuales no admiten recargos\./)
  assert.match(modal, /isRecargoEligibleDebt/)
  assert.match(modal, /Los conceptos financieros eventuales no generan recargos/)
  assert.match(documentCreate, /const eventual = Boolean\(conceptoRef\.eventual\)/)
  assert.match(financialConcept, /eventual: boolean/)
  assert.match(recargoApi, /Los conceptos eventuales no admiten recargos\./)
})
