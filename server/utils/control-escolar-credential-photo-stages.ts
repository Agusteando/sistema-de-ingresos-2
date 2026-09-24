import { controlEscolarCentralQuery, getCentralTableColumns } from './control-escolar-central'
import { normalizeExternalControlEscolarPlantel } from './control-escolar-plantel-routing'

type CredentialPhotoStageRow = {
  stage_key: string | number | null
  stage_label?: string | null
  matricula: string | null
  submitted_at?: string | Date | null
}

const clean = (value:unknown,max=255) => String(value ?? '').trim().slice(0,max)
const normalizeField = (value:unknown) => clean(value,255).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
const quoteIdentifier = (value:string) => `\`${String(value).replace(/`/g,'``')}\``
const isoDate = (value:unknown) => {
  if(!value)return ''
  const date=new Date(value as any)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

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
    values.add(year)
    values.add(`${year}-${Number(year)+1}`)
  }
  return Array.from(values)
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
    return {available:false,plantel,ciclo:clean(input.ciclo,30),stages:[],currentPhotoCount:0}
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

  if(!cMatricula||!cFoto||!cCiclo||!cEtapa||!mMatricula||!mFoto||!mPlantel){
    return {available:false,plantel,ciclo:clean(input.ciclo,30),stages:[],currentPhotoCount:0}
  }

  const cycleSql=ciclos.map(()=>'?').join(',')
  const aliases=plantelAliases(plantel)
  const plantelSql=aliases.map(()=>'?').join(',')
  const labelSql=cEtapaLabel
    ? `CAST(c.${quoteIdentifier(cEtapaLabel)} AS CHAR)`
    : `CONCAT('ETAPA ', CAST(c.${quoteIdentifier(cEtapa)} AS CHAR))`
  const dateSql=cFecha ? `c.${quoteIdentifier(cFecha)}` : 'NULL'

  const rows=await controlEscolarCentralQuery<CredentialPhotoStageRow[]>(`
    SELECT
      CAST(c.${quoteIdentifier(cEtapa)} AS CHAR) AS stage_key,
      ${labelSql} AS stage_label,
      UPPER(CAST(c.${quoteIdentifier(cMatricula)} AS CHAR)) AS matricula,
      ${dateSql} AS submitted_at
    FROM credenciales c
    INNER JOIN matricula m
      ON UPPER(CAST(m.${quoteIdentifier(mMatricula)} AS CHAR))
       = UPPER(CAST(c.${quoteIdentifier(cMatricula)} AS CHAR))
    WHERE CAST(c.${quoteIdentifier(cCiclo)} AS CHAR) IN (${cycleSql})
      AND UPPER(CAST(m.${quoteIdentifier(mPlantel)} AS CHAR)) IN (${plantelSql})
      AND TRIM(COALESCE(CAST(c.${quoteIdentifier(cFoto)} AS CHAR),'')) <> ''
      AND TRIM(COALESCE(CAST(m.${quoteIdentifier(mFoto)} AS CHAR),'')) <> ''
      AND TRIM(CAST(c.${quoteIdentifier(cFoto)} AS CHAR))
        = TRIM(CAST(m.${quoteIdentifier(mFoto)} AS CHAR))
    ORDER BY ${cFecha ? `c.${quoteIdentifier(cFecha)} DESC` : `CAST(c.${quoteIdentifier(cEtapa)} AS CHAR) DESC`}
  `,[...ciclos,...aliases])

  const stages=new Map<string,{key:string;label:string;matriculas:Set<string>;submittedAt:string}>()
  const allCurrent=new Set<string>()
  for(const row of rows){
    const key=clean(row.stage_key,80)
    const matricula=clean(row.matricula,64).toUpperCase().replace(/\s+/g,'')
    if(!key||!matricula)continue
    allCurrent.add(matricula)
    const submitted=isoDate(row.submitted_at)
    const current=stages.get(key) || {
      key,
      label:clean(row.stage_label,120) || `ETAPA ${key}`,
      matriculas:new Set<string>(),
      submittedAt:submitted
    }
    current.matriculas.add(matricula)
    if(!current.submittedAt&&submitted)current.submittedAt=submitted
    stages.set(key,current)
  }

  return {
    available:true,
    plantel,
    ciclo:clean(input.ciclo,30),
    currentPhotoCount:allCurrent.size,
    stages:Array.from(stages.values()).map((stage)=>({
      key:stage.key,
      label:stage.label,
      count:stage.matriculas.size,
      submittedAt:stage.submittedAt || null,
      matriculas:Array.from(stage.matriculas)
    }))
  }
}
