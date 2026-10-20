import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const code=await readFile('server/api/external/v1/control-escolar/credential-applicant.get.ts','utf8')
for(const rule of [
  /assertAuroraExternalApiToken\(event\)/,
  /readCredentialPhotoStages\(\{plantel,ciclo,stage\}\)/,
  /CREDENTIAL_APPLICANT_NOT_FOUND/,
  /CREDENTIAL_APPLICANT_CAMPUS_MISMATCH/,
  /EXTERNAL_CONTROL_ESCOLAR_COMPATIBLE_VIEW_VERSIONS/,
  /FIELD\(view_version/,
  /AND plantel=\? AND ciclo_key=\?/,
  /SELECT nombres,apellido_paterno,apellido_materno,baja/,
  /calculatePromotedGrado\(base\.grado,base\.plantel,base\.ciclo,ciclo,base\.nivel\)/,
  /SELECT grado,ciclo,nivel,plantel FROM base/,
  /gradeSource:useProjectedGrade\?'aurora-base-canonical-cycle-projection'/,
  /academicHistorical:true,academicWithdrawn:withdrawn,credentialEligible:false/,
  /placementCurrent:false,credentialEligible:false/
])assert.match(code,rule)
assert.doesNotMatch(code,/\b(?:UPDATE|DELETE|INSERT|ALTER)\s+(?:TABLE|FROM|INTO|[a-z_]+)\b/i)
console.log('[credential-applicant-academic] OK: protected historical lookup, campus and inscription safeguards')
