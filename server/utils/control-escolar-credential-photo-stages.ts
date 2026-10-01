import { controlEscolarCentralQuery, getCentralTableColumns } from './control-escolar-central'
import { normalizeExternalControlEscolarPlantel } from './control-escolar-plantel-routing'

type CredentialPhotoStageRow = {
  stage_key: string | number | null
  stage_label?: string | null
  matricula: string | null
  photo_url?: string | null
  submitted_at?: string | Date | null
  is_current_photo?: number | string | boolean | null
}

type CredentialStagePhoto = {
  matricula:string
  photoUrl:string
  submittedAt:string | null
  isCurrentMatriculaPhoto:boolean
}

const clean = (value:unknown,max=255) => String(value ?? '').trim().slice(0,max)
const normalizeField = (value:unknown) => clean(value,255).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
const quoteIdentifier = (value:string) => `\`${String(value).replace(/\`/g,'\`\`')}\``
const isoDate = (value:unknown) => {
  if(!value)return ''
  const date=new Date(value as any)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}
const truthy = (value:unknown) => value === true || value === 1 || value === '1' || String(value || '').toLowerCase() === 'true'

const CREDENTIAL_ALIASES = {
  matricula:['matricula','matrícula'],
  foto:['foto','photo','photo_url','foto_url'],
  ciclo:['ciclo','ciclo_escolar','cicloescolar','school_year','schoolyear'],
  etapa:['etapa','fase','stage','etapa_credencializacion','etapa_credencialización'],
  etapaLabel:['etapa_nombre','stage_label','nombre_etapa'],
  fecha:['fecha','fecha_registro','created_at','updated_at','timestamp']
} as const

const MATRICULA_ALIASES = {
  matricula:['matricula','matrícula'],
  foto:['foto','photo','photo_url','foto_url'],
  plantel:['plantel','campus']
} as const

function alias(columns:Set<string>, names:readonly string[]) {
  const normalized=new Map(Array.from(columns).map((column)=>[normalizeField(column),column]))
  for(const name of names){
    const found=normalized.get(normalizeField(name))
    if(found)return found
  }
  return ''
}

function cycleCandidates(value:unknown) {
  const raw=clean(value,30)
  const year=raw.match(/(?:19|20)\d{2}/)?.[0] || ''
  const values=new Set<string>()
  if(raw)values.add(raw)
  if(year){
    const next=Number(year)+1
    values.add(year)
    values.add(`${year}-${next}`)
    values.add(`${year}/${next}`)
    values.add(`${year} - ${next}`)
    values.add(`${year}_${next}`)
  }
  return Array.from(values)
}

function academicDateWindow(value:unknown) {
  const raw=clean(value,30)
  const year=Number(raw.match(/(?:19|20)\d{2}/)?.[0] || 0)
  if(!Number.isFinite(year)||year<2000)return null
  return {
    start:`${year}-07-01 00:00:00`,
    end:`${year+1}-07-01 00:00:00`
  }
}

function plantelAliases(value:unknown) {
  const canonical=normalizeExternalControlEscolarPlantel(value)
  if(!canonical)return []
  const map:Record<string,string[]>={
    PM:['PM','PMA','PMB'],
    SM:['SM','SEM'],
    ST:['ST','SE'],
    PREEM:['PREEM','CM','ME'],
    PREET:['PREET','CT'],
    CO:['CO'],
    DM:['DM'],
    GM:['GM'],
    IS:['IS'],
    ISM:['ISM']
  }
  return map[canonical] || [canonical]
}

export async function readCredentialPhotoStages(input:{plantel:unknown;ciclo:unknown}) {
  const plantel=normalizeExternalControlEscolarPlantel(input.plantel)
  const ciclos=cycleCandidates(input.ciclo)
  if(!plantel)throw createError({statusCode:400,statusMessage:'PLANTEL_REQUIRED',message:'El plantel es obligatorio.'})
  if(!ciclos.length)throw createError({statusCode:400,statusMessage:'CICLO_REQUIRED',message:'El ciclo escolar es obligatorio.'})

  let credentialColumns:Set<string>
  let matriculaColumns:Set<string>
  try{
    ;[credentialColumns,matriculaColumns]=await Promise.all([
      getCentralTableColumns('credenciales'),
      getCentralTableColumns('matricula')
    ])
  }catch(error:any){
    console.warn('[credential-photo-stages] source unavailable',String(error?.code||error?.message||error))
    return {
      contract:'credential-photo-stages-v2',
      available:false,
      reason:'source_unavailable',
      plantel,
      ciclo:clean(input.ciclo,30),
      cycleMode:'unavailable',
      stages:[],
      defaultStageKey:'',
      currentPhotoCount:0,
      submissionCount:0,
      diagnostics:{message:String(error?.code||error?.message||error)}
    }
  }

  const cMatricula=alias(credentialColumns,CREDENTIAL_ALIASES.matricula)
  const cFoto=alias(credentialColumns,CREDENTIAL_ALIASES.foto)
  const cCiclo=alias(credentialColumns,CREDENTIAL_ALIASES.ciclo)
  const cEtapa=alias(credentialColumns,CREDENTIAL_ALIASES.etapa)
  const cEtapaLabel=alias(credentialColumns,CREDENTIAL_ALIASES.etapaLabel)
  const cFecha=alias(credentialColumns,CREDENTIAL_ALIASES.fecha)
  const mMatricula=alias(matriculaColumns,MATRICULA_ALIASES.matricula)
  const mFoto=alias(matriculaColumns,MATRICULA_ALIASES.foto)
  const mPlantel=alias(matriculaColumns,MATRICULA_ALIASES.plantel)

  const requiredColumns={
    credentialMatricula:Boolean(cMatricula),
    credentialPhoto:Boolean(cFoto),
    credentialStage:Boolean(cEtapa),
    matriculaMatricula:Boolean(mMatricula),
    matriculaPlantel:Boolean(mPlantel)
  }
  const missingRequired=Object.entries(requiredColumns).filter(([,present])=>!present).map(([name])=>name)
  if(missingRequired.length){
    return {
      contract:'credential-photo-stages-v2',
      available:false,
      reason:'missing_required_columns',
      plantel,
      ciclo:clean(input.ciclo,30),
      cycleMode:'unavailable',
      stages:[],
      defaultStageKey:'',
      currentPhotoCount:0,
      submissionCount:0,
      diagnostics:{
        missingRequired,
        hasCycleColumn:Boolean(cCiclo),
        hasDateColumn:Boolean(cFecha),
        hasMatriculaPhotoColumn:Boolean(mFoto)
      }
    }
  }

  const aliases=plantelAliases(plantel)
  const plantelSql=aliases.map(()=>'?').join(',')
  const labelSql=cEtapaLabel
    ? `CAST(c.${quoteIdentifier(cEtapaLabel)} AS CHAR)`
    : `CONCAT('ETAPA ', CAST(c.${quoteIdentifier(cEtapa)} AS CHAR))`
  const dateSql=cFecha ? `c.${quoteIdentifier(cFecha)}` : 'NULL'
  const currentSql=mFoto
    ? `
      CASE WHEN TRIM(COALESCE(CAST(m.${quoteIdentifier(mFoto)} AS CHAR),''))
        = TRIM(COALESCE(CAST(c.${quoteIdentifier(cFoto)} AS CHAR),'')) THEN 1 ELSE 0 END
    `
    : 'NULL'

  const cycleWindow=academicDateWindow(input.ciclo)
  let cycleMode:'column'|'date'|'unavailable'='unavailable'
  let cycleWhere=''
  const params:any[]=[]
  if(cCiclo){
    const cycleSql=ciclos.map(()=>'?').join(',')
    cycleWhere=`CAST(c.${quoteIdentifier(cCiclo)} AS CHAR) IN (${cycleSql})`
    params.push(...ciclos)
    cycleMode='column'
  }else if(cFecha&&cycleWindow){
    cycleWhere=`c.${quoteIdentifier(cFecha)} >= ? AND c.${quoteIdentifier(cFecha)} < ?`
    params.push(cycleWindow.start,cycleWindow.end)
    cycleMode='date'
  }else{
    return {
      contract:'credential-photo-stages-v2',
      available:false,
      reason:'cycle_scope_unavailable',
      plantel,
      ciclo:clean(input.ciclo,30),
      cycleMode:'unavailable',
      stages:[],
      defaultStageKey:'',
      currentPhotoCount:0,
      submissionCount:0,
      diagnostics:{
        hasCycleColumn:Boolean(cCiclo),
        hasDateColumn:Boolean(cFecha),
        hasMatriculaPhotoColumn:Boolean(mFoto)
      }
    }
  }

  params.push(...aliases)

  // IMPORTANT: stage history is sourced from credenciales, not matricula.foto.
  // matricula.foto is only the latest global picture and must never erase or
  // redefine which photograph belonged to a previous credentialization stage.
  const rows=await controlEscolarCentralQuery<CredentialPhotoStageRow[]>(`
    SELECT
      CAST(c.${quoteIdentifier(cEtapa)} AS CHAR) AS stage_key,
      ${labelSql} AS stage_label,
      UPPER(CAST(c.${quoteIdentifier(cMatricula)} AS CHAR)) AS matricula,
      CAST(c.${quoteIdentifier(cFoto)} AS CHAR) AS photo_url,
      ${dateSql} AS submitted_at,
      ${currentSql} AS is_current_photo
    FROM credenciales c
    INNER JOIN matricula m
      ON UPPER(CAST(m.${quoteIdentifier(mMatricula)} AS CHAR))
       = UPPER(CAST(c.${quoteIdentifier(cMatricula)} AS CHAR))
    WHERE ${cycleWhere}
      AND UPPER(CAST(m.${quoteIdentifier(mPlantel)} AS CHAR)) IN (${plantelSql})
      AND TRIM(COALESCE(CAST(c.${quoteIdentifier(cFoto)} AS CHAR),'')) <> ''
    ORDER BY ${cFecha ? `c.${quoteIdentifier(cFecha)} DESC` : `CAST(c.${quoteIdentifier(cEtapa)} AS CHAR) DESC`}
  `,params)

  const stages=new Map<string,{
    key:string
    label:string
    photos:Map<string,CredentialStagePhoto>
    submittedAt:string
  }>()
  const allCurrent=new Set<string>()

  for(const row of rows){
    const key=clean(row.stage_key,80)
    const matricula=clean(row.matricula,64).toUpperCase().replace(/\s+/g,'')
    const photoUrl=clean(row.photo_url,2048)
    if(!key||!matricula||!photoUrl)continue

    const submitted=isoDate(row.submitted_at)
    const isCurrentMatriculaPhoto=truthy(row.is_current_photo)
    if(isCurrentMatriculaPhoto)allCurrent.add(matricula)

    const current=stages.get(key) || {
      key,
      label:clean(row.stage_label,120) || `ETAPA ${key}`,
      photos:new Map<string,CredentialStagePhoto>(),
      submittedAt:submitted
    }

    // Query is newest-first. Keep the latest submission for a student inside
    // each stage while preserving older stages independently.
    if(!current.photos.has(matricula)){
      current.photos.set(matricula,{
        matricula,
        photoUrl,
        submittedAt:submitted || null,
        isCurrentMatriculaPhoto
      })
    }
    if(!current.submittedAt&&submitted)current.submittedAt=submitted
    stages.set(key,current)
  }

  const stageList=Array.from(stages.values())
    .map((stage)=>({
      key:stage.key,
      label:stage.label,
      count:stage.photos.size,
      submittedAt:stage.submittedAt || null,
      matriculas:Array.from(stage.photos.keys()),
      photos:Array.from(stage.photos.values())
    }))
    .sort((left,right)=>{
      const leftTime=Date.parse(left.submittedAt || '') || 0
      const rightTime=Date.parse(right.submittedAt || '') || 0
      if(rightTime!==leftTime)return rightTime-leftTime
      return right.key.localeCompare(left.key,'es',{numeric:true,sensitivity:'base'})
    })

  return {
    contract:'credential-photo-stages-v2',
    available:true,
    reason:'',
    plantel,
    ciclo:clean(input.ciclo,30),
    cycleMode,
    defaultStageKey:stageList[0]?.key || '',
    currentPhotoCount:allCurrent.size,
    submissionCount:stageList.reduce((sum,stage)=>sum+stage.count,0),
    diagnostics:{
      matchedRows:rows.length,
      hasCycleColumn:Boolean(cCiclo),
      hasDateColumn:Boolean(cFecha),
      hasMatriculaPhotoColumn:Boolean(mFoto)
    },
    stages:stageList
  }
}
