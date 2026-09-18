const BASE = String(process.env.AURORA_BASE_URL || 'https://aurora.casitaiedis.edu.mx').replace(/\/+$/, '')
const TOKEN = String(
  process.env.AURORA_API_TOKEN
    || process.env.HUSKY_PASS_AURORA_API_TOKEN
    || process.env.EXTERNAL_CONTROL_ESCOLAR_API_TOKEN
    || ''
).trim()

const mode = String(process.argv[2] || 'auth').trim().toLowerCase()
const retryCount = Math.max(1, Number(process.env.AURORA_MAIL_PROBE_ATTEMPTS || 18))
const retryDelayMs = Math.max(1000, Number(process.env.AURORA_MAIL_PROBE_DELAY_MS || 10000))

if (!TOKEN) {
  console.error('AURORA_API_TOKEN is not available to this Actions run.')
  process.exit(3)
}

const request = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'x-api-key': TOKEN,
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(30000),
  })
  const raw = await response.text()
  let data = null
  try { data = raw ? JSON.parse(raw) : null } catch {}
  return { response, raw, data }
}

if (mode === 'auth') {
  const { response, data, raw } = await request('/api/external/v1/control-escolar/auth/echo')
  if (!response.ok || data?.matched !== true) {
    console.error(`AURORA_PRODUCTION_AUTH_FAILED status=${response.status} body=${String(raw).slice(0, 500)}`)
    process.exit(4)
  }
  console.log(
    `AURORA_PRODUCTION_AUTH_OK status=${response.status} source=${data?.receivedTokenSource || 'unknown'} matchedSource=${data?.matchedTokenSource || 'unknown'}`
  )
  process.exit(0)
}

if (mode !== 'mail') {
  console.error(`Unknown probe mode: ${mode}`)
  process.exit(2)
}

let lastStatus = 0
let lastBody = ''

for (let attempt = 1; attempt <= retryCount; attempt++) {
  try {
    const { response, data, raw } = await request('/api/external/v1/deudores/email-smoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

    lastStatus = response.status
    lastBody = raw

    if (response.ok && data?.success === true && data?.messageId) {
      console.log(
        `DEUDORES_PRODUCTION_GMAIL_OK status=${response.status} sender=${data.sender || 'unknown'} recipient=${data.recipient || 'unknown'} messageId=${data.messageId} marker=${data.marker || 'unknown'}`
      )
      process.exit(0)
    }

    if ([401, 403].includes(response.status)) {
      console.error(`DEUDORES_PRODUCTION_GMAIL_AUTH_FAILED status=${response.status} body=${String(raw).slice(0, 500)}`)
      process.exit(5)
    }

    const retryable = response.status === 404 || response.status === 405 || response.status >= 500
    console.log(
      `DEUDORES_PRODUCTION_GMAIL_PENDING attempt=${attempt}/${retryCount} status=${response.status} retryable=${retryable}`
    )
    if (!retryable) break
  } catch (error) {
    lastStatus = 0
    lastBody = String(error?.message || error)
    console.log(
      `DEUDORES_PRODUCTION_GMAIL_PENDING attempt=${attempt}/${retryCount} transport=${String(error?.name || 'error')}`
    )
  }

  if (attempt < retryCount) {
    await new Promise(resolve => setTimeout(resolve, retryDelayMs))
  }
}

console.error(
  `DEUDORES_PRODUCTION_GMAIL_FAILED status=${lastStatus} body=${String(lastBody).slice(0, 700)}`
)
process.exit(6)
