import { spawn } from 'node:child_process'

const PORT = 3417
const URL = 'http://127.0.0.1:' + PORT + '/__visual-lab/buscador'
const MARKERS = [
  'Buscador',
  'Sofía Hernández García',
  'Mariana García Luna',
  'Personas autorizadas',
  'Patricia Luna Reyes',
  'Todos los datos disponibles',
  'PT20260841'
]

const child = spawn(process.execPath, [
  'node_modules/nuxt/bin/nuxt.mjs',
  'dev',
  '--host',
  '127.0.0.1',
  '--port',
  String(PORT)
], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'development' },
  stdio: ['ignore', 'pipe', 'pipe']
})

let logs = ''
child.stdout.on('data', (chunk) => { logs += chunk.toString() })
child.stderr.on('data', (chunk) => { logs += chunk.toString() })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

try {
  let html = ''
  let lastError = ''
  for (let attempt = 1; attempt <= 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error('Nuxt dev server exited early.\n' + logs.slice(-4000))
    try {
      const response = await fetch(URL, { redirect: 'manual', signal: AbortSignal.timeout(2500) })
      if (response.status === 200) {
        html = await response.text()
        break
      }
      lastError = 'HTTP ' + response.status
    } catch (error) {
      lastError = String(error?.message || error)
    }
    await sleep(500)
  }

  if (!html) throw new Error('Visual lab did not become ready: ' + lastError + '\n' + logs.slice(-4000))

  const failures = MARKERS.filter((marker) => !html.includes(marker))
  for (const marker of MARKERS) {
    console.log((html.includes(marker) ? 'PASS ' : 'FAIL ') + 'SSR contains ' + marker)
  }

  if (failures.length) {
    console.error('Missing rendered markers:', failures.join(', '))
    process.exitCode = 1
  } else {
    console.log('BUSCADOR_RENDER_OK bytes=' + Buffer.byteLength(html))
  }
} finally {
  if (child.exitCode === null) child.kill('SIGTERM')
  await sleep(300)
  if (child.exitCode === null) child.kill('SIGKILL')
}
