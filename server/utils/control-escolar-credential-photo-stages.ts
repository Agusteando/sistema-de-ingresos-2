import { controlEscolarCentralQuery, getCentralTableColumns } from './control-escolar-central'
import { normalizeExternalControlEscolarPlantel } from './control-escolar-plantel-routing'

type CredentialPhotoStageRow = {
  stage_key: string | number | null
  stage_label?: string | null
  matricula: string | null
  photo_url?: string | null
  receipt_url?: string | null
  submitted_at?: string | Date | null
  is_current_photo?: number | string | boolean | null
}

type CredentialStagePhoto = {
  matricula:string
  photoUrl:string
  receiptUrl:string
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
  recibo:['recibo','receipt','receipt_url','comprobante','comprobante_url'],
  campus:['campus','plantel'],
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

function credentialPhotoTimestamp(value:unknown) {
  const source=clean(value,2048)
  // Husky Pass stores credential photos as:
  // credencial-(original|final)-<matricula>-<Date.now()>-<uuid>.<ext>
  const match=source.match(/credencial-(?:original|final)-[^/?#]+-(\d{13})-[A-Za-z0-9]+\.(?:jpe?g|png|webp)(?:[?#].*)?$/i)
  if(!match)return 0
  const timestamp=Number(match[1])
  return Number.isFinite(timestamp) ? timestamp : 0
}

function photoBelongsToAcademicWindow(value:unknown,window:{start:string;end:string}|null) {
  if(!window)return false
  const timestamp=credentialPhotoTimestamp(value)
  if(!timestamp)return false
  const start=Date.parse(window.start.replace(' ','T')+'Z')
  const end=Date.parse(window.end.replace(' ','T')+'Z')
  return Number.isFinite(start)&&Number.isFinite(end)&&timestamp>=start&&timestamp<end
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

export async function readCredentialPhotoStages(input:{plantel:unknown;ciclo:unknown;stage?:unknown}) {
  const plantel=normalizeExternalControlEscolarPlantel(input.plantel)
  const ciclos=cycleCandidates(input.ciclo)
  const requestedStage=clean(input.stage,80)
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
  const cRecibo=alias(credentialColumns,CREDENTIAL_ALIASES.recibo)
  const cCampus=alias(credentialColumns,CREDENTIAL_ALIASES.campus)
  const cCiclo=alias(credentialColumns,CREDENTIAL_ALIASES.ciclo)
  const cEtapa=alias(credentialColumns,CREDENTIAL_ALIASES.etapa)
  const cEtapaLabel=alias(credentialColumns,CREDENTIAL_ALIASES.etapaLabel)
  const cFecha=alias(credentialColumns,CREDENTIAL_ALIASES.fecha)
  const mMatricula=alias(matriculaColumns,MATRICULA_ALIASES.matricula)
  const mFoto=alias(matriculaColumns,MATRICULA_ALIASES.foto)
  const mPlantel=alias(matriculaColumns,MATRICULA_ALIASES.plantel)

  const requiredColumns=requestedStage
    ? {
        credentialMatricula:Boolean(cMatricula),
        credentialPhoto:Boolean(cFoto),
        credentialStage:Boolean(cEtapa)
      }
    : {
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
  const currentSql=!requestedStage && mFoto
    ? `
      CASE WHEN TRIM(COALESCE(CAST(m.${quoteIdentifier(mFoto)} AS CHAR),''))
        = TRIM(COALESCE(CAST(c.${quoteIdentifier(cFoto)} AS CHAR),'')) THEN 1 ELSE 0 END
    `
    : 'NULL'
  const receiptSql=cRecibo ? `CAST(c.${quoteIdentifier(cRecibo)} AS CHAR)` : 'NULL'

  const cycleWindow=academicDateWindow(input.ciclo)
  let cycleMode:'stage'|'column'|'date'|'current-photo'|'unavailable'='unavailable'
  let cycleWhere=''
  const params:any[]=[]
  if(requestedStage){
    cycleWhere=`CAST(c.${quoteIdentifier(cEtapa)} AS CHAR) = ?`
    params.push(requestedStage)
    if(cCiclo){
      const cycleSql=ciclos.map(()=>'?').join(',')
      cycleWhere+=` AND CAST(c.${quoteIdentifier(cCiclo)} AS CHAR) IN (${cycleSql})`
      params.push(...ciclos)
    }
    cycleMode='stage'
  }else if(cCiclo){
    const cycleSql=ciclos.map(()=>'?').join(',')
    cycleWhere=`CAST(c.${quoteIdentifier(cCiclo)} AS CHAR) IN (${cycleSql})`
    params.push(...ciclos)
    cycleMode='column'
  }else if(cFecha&&cycleWindow){
    cycleWhere=`c.${quoteIdentifier(cFecha)} >= ? AND c.${quoteIdentifier(cFecha)} < ?`
    params.push(cycleWindow.start,cycleWindow.end)
    cycleMode='date'
  }else if(mFoto){
    // Some live credential tables predate a school-year column. Husky Pass still
    // persists stage and synchronizes the accepted campaign photo into matricula.foto.
    // In that schema we can identify the student's CURRENT credentialization stage
    // without inventing historical membership: only rows whose stored credential
    // photo still equals matricula.foto qualify.
    cycleWhere=`TRIM(COALESCE(CAST(c.${quoteIdentifier(cFoto)} AS CHAR),'')) = TRIM(COALESCE(CAST(m.${quoteIdentifier(mFoto)} AS CHAR),''))`
    cycleMode='current-photo'
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

  const sourceMode=requestedStage ? 'credentials-direct' : 'credentials-with-matricula'
  let fromSql='FROM credenciales c'
  let plantelWhere=''
  if(requestedStage){
    if(cCampus){
      plantelWhere=`AND UPPER(CAST(c.${quoteIdentifier(cCampus)} AS CHAR)) IN (${plantelSql})`
      params.push(...aliases)
    }
  }else{
    fromSql=`FROM credenciales c
    INNER JOIN matricula m
      ON UPPER(CAST(m.${quoteIdentifier(mMatricula)} AS CHAR))
       = UPPER(CAST(c.${quoteIdentifier(cMatricula)} AS CHAR))`
    plantelWhere=`AND UPPER(CAST(m.${quoteIdentifier(mPlantel)} AS CHAR)) IN (${plantelSql})`
    params.push(...aliases)
  }
  const artifactWhere=cRecibo
    ? `AND (
        TRIM(COALESCE(CAST(c.${quoteIdentifier(cFoto)} AS CHAR),'')) <> ''
        OR TRIM(COALESCE(CAST(c.${quoteIdentifier(cRecibo)} AS CHAR),'')) <> ''
      )`
    : `AND TRIM(COALESCE(CAST(c.${quoteIdentifier(cFoto)} AS CHAR),'')) <> ''`

  // With an explicit campaign stage the roster is already authoritative in the
  // caller. Read credenciales directly and let Identity intersect by matrícula;
  // never make a second legacy matricula row a prerequisite for a valid photo.
  const rows=await controlEscolarCentralQuery<CredentialPhotoStageRow[]>(`
    SELECT
      CAST(c.${quoteIdentifier(cEtapa)} AS CHAR) AS stage_key,
      ${labelSql} AS stage_label,
      UPPER(CAST(c.${quoteIdentifier(cMatricula)} AS CHAR)) AS matricula,
      CAST(c.${quoteIdentifier(cFoto)} AS CHAR) AS photo_url,
      ${receiptSql} AS receipt_url,
      ${dateSql} AS submitted_at,
      ${currentSql} AS is_current_photo
    ${fromSql}
    WHERE ${cycleWhere}
      ${plantelWhere}
      ${artifactWhere}
    ORDER BY ${cFecha ? `c.${quoteIdentifier(cFecha)} DESC` : `CAST(c.${quoteIdentifier(cEtapa)} AS CHAR) DESC`}
  `,params)

  const stages=new Map<string,{
    key:string
    label:string
    photos:Map<string,CredentialStagePhoto>
    submittedAt:string
  }>()
  const allCurrent=new Set<string>()
  let currentPhotoTimestampRejected=0

  for(const row of rows){
    if(cycleMode==='current-photo' && !photoBelongsToAcademicWindow(row.photo_url,cycleWindow)){
      currentPhotoTimestampRejected+=1
      continue
    }
    const key=clean(row.stage_key,80)
    const matricula=clean(row.matricula,64).toUpperCase().replace(/\s+/g,'')
    const photoUrl=clean(row.photo_url,2048)
    const receiptUrl=clean(row.receipt_url,2048)
    if(!key||!matricula||(!photoUrl&&!receiptUrl))continue

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
        receiptUrl,
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
      count:Array.from(stage.photos.values()).filter((photo)=>Boolean(photo.photoUrl)).length,
      receiptCount:Array.from(stage.photos.values()).filter((photo)=>Boolean(photo.receiptUrl)).length,
      submittedAt:stage.submittedAt || null,
      matriculas:Array.from(stage.photos.values()).filter((photo)=>Boolean(photo.photoUrl)).map((photo)=>photo.matricula),
      photos:Array.from(stage.photos.values())
    }))
    .sort((left,right)=>{
      const leftTime=Date.parse(left.submittedAt || '') || 0
      const rightTime=Date.parse(right.submittedAt || '') || 0
      if(rightTime!==leftTime)return rightTime-leftTime
      return right.key.localeCompare(left.key,'es',{numeric:true,sensitivity:'base'})
    })

  console.info('[credential-photo-stages] resolved',JSON.stringify({
    plantel,
    ciclo:clean(input.ciclo,30),
    requestedStage,
    cycleMode,
    sourceMode,
    campusScoped:Boolean(requestedStage&&cCampus),
    rawMatchedRows:rows.length,
    matchedRows:stageList.reduce((sum,stage)=>sum+stage.count,0),
    stageCount:stageList.length
  }))

  return {
    contract:'credential-photo-stages-v2',
    available:true,
    reason:'',
    historyComplete:cycleMode!=='current-photo',
    plantel,
    ciclo:clean(input.ciclo,30),
    cycleMode,
    defaultStageKey:stageList[0]?.key || '',
    currentPhotoCount:allCurrent.size,
    submissionCount:stageList.reduce((sum,stage)=>sum+stage.count,0),
    diagnostics:{
      matchedRows:stageList.reduce((sum,stage)=>sum+stage.count,0),
      rawMatchedRows:rows.length,
      requestedStage,
      explicitStageScope:cycleMode==='stage',
      sourceMode,
      campusScoped:Boolean(requestedStage&&cCampus),
      hasCredentialCampusColumn:Boolean(cCampus),
      hasReceiptColumn:Boolean(cRecibo),
      receiptRows:stageList.reduce((sum,stage)=>sum+Number((stage as any).receiptCount||0),0),
      currentPhotoFallback:cycleMode==='current-photo',
      currentPhotoTimestampRejected,
      hasCycleColumn:Boolean(cCiclo),
      hasDateColumn:Boolean(cFecha),
      hasMatriculaPhotoColumn:Boolean(mFoto)
    },
    stages:stageList
  }
}
