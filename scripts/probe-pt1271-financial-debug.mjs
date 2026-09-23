const base = 'https://aurora.casitaiedis.edu.mx'
const token = String(process.env.AURORA_API_TOKEN || '').trim()
if (!token) throw new Error('AURORA_API_TOKEN missing')

const path = '/api/external/v1/talleres/debug-financial?matricula=PT1271&plantel=PT&ciclo=2026'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let last = null
for (let attempt = 1; attempt <= 24; attempt += 1) {
  try {
    const response = await fetch(base + path, {
      headers: { Accept: 'application/json', 'x-aurora-token': token },
      signal: AbortSignal.timeout(120000),
    })
    const payload = await response.json().catch(() => ({}))
    last = { attempt, status: response.status, payload }
    if (response.ok && payload?.ok === true) {
      console.log(JSON.stringify(payload, null, 2))
      console.log('PT1271_FINANCIAL_DEBUG_OK')
      process.exit(0)
    }
  } catch (error) {
    last = { attempt, error: String(error?.message || error) }
  }
  if (attempt < 24) await sleep(15000)
}
console.error(JSON.stringify(last, null, 2))
throw new Error('PT1271 financial diagnostic endpoint did not become available')
