import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve('.')

test('QR pairing never reconnects during authenticated transition', async () => {
  const route = await readFile(resolve(root, 'server/api/whatsapp/instances/[clientId]/qr.get.ts'), 'utf8')
  assert.match(route, /runtimeState === 'ready'/)
  assert.match(route, /authenticated/)
  assert.match(route, /initializing/)
  assert.doesNotMatch(route, /if \(qr\.qrAvailable === false\) return true/)
})

test('WhatsApp onboarding follows QR rotation and pairing until ready', async () => {
  const onboarding = await readFile(resolve(root, 'components/WhatsappOnboarding.vue'), 'utf8')
  assert.match(onboarding, /startQrLinkWatch/)
  assert.match(onboarding, /syncQrLinkState/)
  assert.match(onboarding, /session\?\.authenticated/)
  assert.match(onboarding, /params: \{ refresh: '0', force: '0' \}/)
  assert.match(onboarding, /qr\.qrImage/)
  assert.match(onboarding, /WhatsApp vinculado y listo\./)
})
