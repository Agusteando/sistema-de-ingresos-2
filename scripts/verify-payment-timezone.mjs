import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  formatMexicoCityDateKeyFromUnix,
  formatMexicoCityDateTimeFromUnix,
  mexicoCityDateRangeToUnix,
  mexicoCityDateTimeToUnix,
} from '../server/utils/payment-time.ts'

const eveningUnix = mexicoCityDateTimeToUnix('2026-09-18', '19:30:00')
assert.equal(new Date(eveningUnix * 1000).toISOString(), '2026-09-19T01:30:00.000Z')
assert.equal(formatMexicoCityDateTimeFromUnix(eveningUnix), '2026-09-18 19:30:00')
assert.equal(formatMexicoCityDateKeyFromUnix(eveningUnix), '2026-09-18')

const legacyBridgeUnix = Date.parse('2026-09-19T01:30:00.000Z') / 1000
assert.equal(formatMexicoCityDateKeyFromUnix(legacyBridgeUnix), '2026-09-18')

const range = mexicoCityDateRangeToUnix('2026-09-18', '2026-09-18')
assert.equal(new Date(range.startUnix * 1000).toISOString(), '2026-09-18T06:00:00.000Z')
assert.equal(new Date(range.endExclusiveUnix * 1000).toISOString(), '2026-09-19T06:00:00.000Z')
assert.ok(legacyBridgeUnix >= range.startUnix && legacyBridgeUnix < range.endExclusiveUnix)

const backdatedUnix = mexicoCityDateTimeToUnix('2026-09-17', '20:15:00')
assert.equal(new Date(backdatedUnix * 1000).toISOString(), '2026-09-18T02:15:00.000Z')
assert.equal(formatMexicoCityDateTimeFromUnix(backdatedUnix), '2026-09-17 20:15:00')

const corteSource = fs.readFileSync(new URL('../server/utils/corte-caja.ts', import.meta.url), 'utf8')
const paySource = fs.readFileSync(new URL('../server/api/payments/pay.post.ts', import.meta.url), 'utf8')
assert.match(corteSource, /PAYMENT_EFFECTIVE_UNIX_SQL/)
assert.doesNotMatch(corteSource, /DATE\(\$\{PAYMENT_EFFECTIVE_AT_SQL\}\) BETWEEN/)
assert.match(paySource, /SELECT UNIX_TIMESTAMP\(\) AS currentUnix/)
assert.match(paySource, /FROM_UNIXTIME\(\?\)/)
assert.match(paySource, /UNIX_TIMESTAMP\(fecha\) = \?/)

console.log('Payment timezone regression checks passed.')
