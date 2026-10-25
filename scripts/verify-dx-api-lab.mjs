import { spawnSync } from 'node:child_process'
const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--test', 'tests/dx-discovery.test.mjs', 'tests/dx-integration-runtime.test.mjs'], { stdio: 'inherit' })
process.exit(result.status ?? 1)
