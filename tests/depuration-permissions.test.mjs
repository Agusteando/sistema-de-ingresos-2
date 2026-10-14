import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const sources = Promise.all([
  readFile('components/StudentDetails.vue', 'utf8'),
  readFile('server/api/payments/audit.post.ts', 'utf8'),
  readFile('server/api/payments/cancel.post.ts', 'utf8'),
  readFile('server/utils/auth-session.ts', 'utf8'),
])

test('depuración is offered to financial administrators and superadmins, not Control Escolar-only users', async () => {
  const [ui, , , auth] = await sources
  assert.match(ui, /const canDepurarAsAdmin = computed\(\(\) =>\s*isSuperAdmin\.value \|\| roleTokens\.value\.includes\("role_admon"\)/)
  assert.match(ui, /v-if="canDepurarAsAdmin && selectedDebts\.length === 1"/)
  assert.match(ui, /\.\.\.\(canDepurarAsAdmin\.value && selectedDebt \? \[\{/)
  assert.match(ui, /const canDepurarDebt = \(debt\) =>\s*canDepurarAsAdmin\.value && debt/)
  assert.match(auth, /export const FINANCIAL_ADMIN_ROLE = 'ROLE_ADMON'/)
  assert.match(auth, /export const CONTROL_ESCOLAR_ROLE = 'ROLE_CTRL'/)
  assert.match(auth, /const financialAccess = hasFinancialAccessForPlantel\(role, allowedPlanteles, activePlantel\)/)
})

test('backend uses signed financial access, keeps one-time Telegram approval and accounting constraints', async () => {
  const [, api] = await sources
  assert.match(api, /const user = event\.context\.user/)
  assert.match(api, /if \(!user\?\.hasFinancialAccess \|\| !actor\) throw createError\(\{ statusCode: 403/)
  assert.doesNotMatch(api, /if \(!user\?\.isSuperAdmin/)
  assert.match(api, /const TTL = 10 \* 60 \* 1000/)
  assert.match(api, /if \(info\.actor !== actor \|\| info\.agent !== agent\)/)
  assert.match(api, /info\.attempts >= 3/)
  assert.match(api, /notifyDocumentAmountCorrection\(/)
  assert.match(api, /snapshot\.pagos <= 0 \|\| snapshot\.saldo <= 0/)
  assert.match(api, /depurado_motivo: info\.motivo/)
  assert.match(api, /FOR UPDATE/)
  assert.match(api, /pending\.delete\(id\)/)
})

test('regular financial administrators can request reversal; non-financial roles remain denied', async () => {
  const [, , cancel] = await sources
  assert.match(cancel, /if \(isDepuration && !user\?\.hasFinancialAccess\)/)
  assert.match(cancel, /La reversión de una depuración requiere motivo/)
  assert.match(cancel, /\*Depuración revertida\*/)
  assert.match(cancel, /notifyDocumentAmountCorrection\(/)
  assert.doesNotMatch(cancel, /Solo superadministradores pueden revertir/)
})
