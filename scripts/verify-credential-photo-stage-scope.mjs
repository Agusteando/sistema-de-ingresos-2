import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8')

const route=read('server/api/external/v1/control-escolar/credential-photos.get.ts')
const source=read('server/utils/control-escolar-credential-photo-stages.ts')

assert.match(route,/stage:query\.stage \|\| query\.etapa \|\| query\.stageKey/)
assert.match(source,/input:\{plantel:unknown;ciclo:unknown;stage\?:unknown\}/)
assert.match(source,/const requestedStage=clean\(input\.stage,80\)/)
assert.match(source,/if\(requestedStage\)\{[\s\S]*CAST\(c\.\$\{quoteIdentifier\(cEtapa\)\} AS CHAR\) = \?[\s\S]*cycleMode='stage'/)
assert.match(source,/explicitStageScope:cycleMode==='stage'/)
assert.match(source,/requestedStage,/)
assert.match(source,/INNER JOIN matricula m[\s\S]*UPPER\(CAST\(m\.\$\{quoteIdentifier\(mMatricula\)\} AS CHAR\)\)[\s\S]*UPPER\(CAST\(c\.\$\{quoteIdentifier\(cMatricula\)\} AS CHAR\)\)/)
assert.match(source,/UPPER\(CAST\(m\.\$\{quoteIdentifier\(mPlantel\)\} AS CHAR\)\) IN/)
assert.match(source,/if\(cycleMode==='current-photo'/)

console.log('[credential-photo-stage-scope] OK: explicit stage scope joins credenciales to matricula without current-photo or timestamp inference')
