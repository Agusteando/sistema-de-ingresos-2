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
assert.ok(source.includes("if(cCiclo){"))
assert.ok(source.includes("cycleWhere+=\` AND CAST(c.\${quoteIdentifier(cCiclo)} AS CHAR) IN (\${cycleSql})\`"))
assert.match(source,/requestedStage,/)
assert.match(source,/const sourceMode=requestedStage \? 'credentials-direct' : 'credentials-with-matricula'/)
assert.match(source,/if\(requestedStage\)\{[\s\S]*if\(cCampus\)[\s\S]*plantelWhere=.*c\.\$\{quoteIdentifier\(cCampus\)\}/)
assert.match(source,/never make a second legacy matricula row a prerequisite for a valid photo/)
assert.match(source,/receiptUrl:string/)
assert.match(source,/receipt_url/)
assert.match(source,/hasReceiptColumn:Boolean\(cRecibo\)/)
assert.match(source,/if\(cycleMode==='current-photo'/)

console.log('[credential-photo-stage-scope] OK: explicit stage scope reads credenciales directly, carries receipt artifacts, and avoids legacy matricula prerequisites')
