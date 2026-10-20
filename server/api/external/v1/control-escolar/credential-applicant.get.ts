import { normalizeCicloKey } from '../../../../../shared/utils/ciclo'
import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../utils/external-api-auth'
import { controlEscolarCentralQuery } from '../../../../utils/control-escolar-central'
import { readCredentialPhotoStages } from '../../../../utils/control-escolar-credential-photo-stages'
import { ensureControlEscolarExternalViewSchema, EXTERNAL_CONTROL_ESCOLAR_COMPATIBLE_VIEW_VERSIONS } from '../../../../utils/control-escolar-external-view'
import { normalizeExternalControlEscolarPlantel } from '../../../../utils/control-escolar-plantel-routing'

const clean=(value:unknown,max=255)=>String(value??'').trim().slice(0,max)
const matriculaKey=(value:unknown)=>clean(value,64).toUpperCase().replace(/\s+/g,'')
const versions=[...EXTERNAL_CONTROL_ESCOLAR_COMPATIBLE_VIEW_VERSIONS]

/** Academic history for a PROVEN credential campaign submission, not an enrollment roster. */
export default defineEventHandler(async(event)=>{
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event,0)
  const query=getQuery(event)
  const matricula=matriculaKey(query.matricula)
  const plantel=normalizeExternalControlEscolarPlantel(query.plantel)
  const ciclo=normalizeCicloKey(query.ciclo || query.cicloKey)
  const stage=clean(query.stage || query.stageKey,80)
  if(!/^[A-Z0-9-]{3,30}$/.test(matricula)||!plantel||!ciclo||!stage)
    throw createError({statusCode:400,statusMessage:'CREDENTIAL_APPLICANT_SCOPE_REQUIRED'})

  // A valid submitted photo/receipt in the requested campaign is mandatory.
  const campaign=await readCredentialPhotoStages({plantel,ciclo,stage})
  if(campaign.available===false)
    throw createError({statusCode:503,statusMessage:'CREDENTIAL_APPLICANT_PHOTOS_UNAVAILABLE'})
  const photo=campaign.stages.find(s=>s.key===stage)?.photos
    ?.find(p=>matriculaKey(p.matricula)===matricula&&(p.photoUrl||p.receiptUrl))
  if(!photo)throw createError({statusCode:404,statusMessage:'CREDENTIAL_APPLICANT_NOT_FOUND'})
  const photoCampus=normalizeExternalControlEscolarPlantel(photo.plantel)
  const prefix=normalizeExternalControlEscolarPlantel(matricula.match(/^[A-Z]+/)?.[0])
  if(photoCampus!==plantel && (photoCampus||!prefix||prefix!==plantel))
    throw createError({statusCode:404,statusMessage:'CREDENTIAL_APPLICANT_CAMPUS_MISMATCH'})

  await ensureControlEscolarExternalViewSchema()
  const placeholders=versions.map(()=>'?').join(',')
  const rows=await controlEscolarCentralQuery<any[]>(`
    SELECT matricula,plantel,ciclo_key,view_version,nombre_completo,
           nivel,grado,grupo,status,enrollment_state,payload_json,generated_at
      FROM control_external_student_view
     WHERE UPPER(TRIM(matricula))=? AND plantel=? AND ciclo_key=?
       AND view_version IN (${placeholders})
     ORDER BY FIELD(view_version,${placeholders}),generated_at DESC LIMIT 1
  `,[matricula,plantel,ciclo,...versions,...versions])
  const row=rows[0]
  if(!row)throw createError({statusCode:404,statusMessage:'CREDENTIAL_APPLICANT_ACADEMIC_NOT_FOUND'})

  const profile=(await controlEscolarCentralQuery<any[]>(`
    SELECT nombres,apellido_paterno,apellido_materno,baja
      FROM matricula WHERE UPPER(TRIM(matricula))=? LIMIT 1
  `,[matricula]))[0]||{}
  let snapshot:any={}
  try{snapshot=typeof row.payload_json==='string'?JSON.parse(row.payload_json):row.payload_json||{}}
  catch{console.warn('[credential-applicant] malformed historical snapshot',JSON.stringify({matricula,plantel,ciclo}))}
  const nombres=clean(profile.nombres||snapshot.nombres,120)
  const apellidoPaterno=clean(profile.apellido_paterno||snapshot.apellidoPaterno,100)
  const apellidoMaterno=clean(profile.apellido_materno||snapshot.apellidoMaterno,100)
  const fullName=[nombres,apellidoPaterno,apellidoMaterno].filter(Boolean).join(' ')
    ||clean(snapshot.fullName||row.nombre_completo,255)
  const withdrawn=Number(profile.baja||0)===1||
    ['baja','withdrawn'].includes(clean(row.status).toLowerCase())||
    ['baja','baja_inscrita','withdrawn'].includes(clean(row.enrollment_state).toLowerCase())
  console.info('[credential-applicant] historical-academic-lookup',JSON.stringify({
    matricula,plantel,ciclo,stage,version:row.view_version,withdrawn,
    complete:Boolean(row.grado&&row.grupo)
  }))
  return {
    contract:'credential-applicant-academic-v1',
    data:{
      matricula,plantel,ciclo,fullName,nombres,apellidoPaterno,apellidoMaterno,
      nivel:clean(row.nivel||snapshot.nivel,80),
      grado:clean(row.grado||snapshot.grado,80),
      grupo:clean(row.grupo||snapshot.group||snapshot.grupo,80),
      status:clean(row.status,80),enrollmentState:clean(row.enrollment_state,80),
      academicHistorical:true,academicWithdrawn:withdrawn,credentialEligible:false
    },
    meta:{
      source:'aurora-canonical-historical-snapshot',
      viewVersion:row.view_version,generatedAt:row.generated_at,
      placementCurrent:false,credentialEligible:false
    }
  }
})
