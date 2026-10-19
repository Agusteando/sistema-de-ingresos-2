import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
const require=createRequire(import.meta.url)
const {chromium}=require(process.env.VISUAL_PLAYWRIGHT_MODULE||'playwright')
const base=process.env.VISUAL_BASE_URL||'http://127.0.0.1:3012'
const output=process.env.VISUAL_EVIDENCE_DIR||'/tmp/aurora-audit-evidence'
await mkdir(output,{recursive:true})
let browser

const results=[]
try {
 for(const [width,height] of [[1920,1080],[1366,768],[1024,768],[900,640],[390,844],[1150,410]]){
  browser=await chromium.launch({headless:true,...(process.env.VISUAL_BROWSER_EXECUTABLE?{executablePath:process.env.VISUAL_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--use-gl=angle','--use-angle=swiftshader']}: {})})
  const context=await browser.newContext({viewport:{width,height}})
  await context.addCookies([
   {name:'auth_email',value:'visual@example.invalid',url:base},
   {name:'auth_role',value:'superadmin',url:base},
   {name:'auth_planteles',value:'PT%2CSM',url:base},
   {name:'auth_has_control_escolar',value:'true',url:base},
   {name:'auth_has_financial_access',value:'true',url:base},
   {name:'auth_is_super_admin',value:'true',url:base}
  ])
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('response',r=>{if(r.status()>=500)console.error('HTTP '+r.status()+' '+r.url())})
  page.on('requestfailed',r=>console.error('Request failed: '+r.url()+' '+r.failure()?.errorText))
  const warnings=[]
  page.on('console',m=>{if(['warning','error'].includes(m.type()))warnings.push(m.text())})
  if(process.env.VISUAL_FONT_MODULES){
   const fontRoot=process.env.VISUAL_FONT_MODULES
   const fonts=new Map()
   let css=''
   for(const family of ['Montserrat','Fredoka'])for(const weight of [500,600,700]){
    const file=family+'-'+weight+'.woff2'
    fonts.set('/__audit_font__/'+file,await readFile(fontRoot+'/'+family.toLowerCase()+'/files/'+family.toLowerCase()+'-latin-'+weight+'-normal.woff2'))
    css+='@font-face{font-family:'+family+';font-style:normal;font-weight:'+weight+';src:url('+base+'/__audit_font__/'+file+')}\n'
   }
   await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:css}))
   await page.route('**/__audit_font__/**',route=>route.fulfill({contentType:'font/woff2',body:fonts.get(new URL(route.request().url()).pathname)}))
  }
  let unavailable=false
  let fieldHistoryFailure=false
  const fieldRequests=[]
  const categories=[['grupo','Grupo'],['nombre','Nombre'],['grado','Grado'],['estatus','Estatus'],['contacto','Contacto'],['trabajo','Lugares de trabajo'],['otros','Otros campos']].map(([key,label])=>({key,label}))
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  const make=(id,actor,source='Aurora',category='nombre')=>({id,eventId:1,date:day,recordedAt:day+' 09:42:18',matricula:'PT0123',student:'Alumno de prueba visual',field:category,fieldLabel:categories.find(c=>c.key===category).label,category,before:'Valor anterior',after:'Valor nuevo',source,actor,actorEmail:source==='Aurora'?'visual'+id+'@casitaiedis.edu.mx':'',avatar:source==='Aurora'?'https://lh3.googleusercontent.com/a/'+(id==='2'?'expired-fixture':'audit-fixture'):'',flow:'test',quality:source==='Aurora'?'verified':'historical',plantel:'PT',ciclo:'2026'})
  const stored=[make('1','Erika Ramos'),make('2','Mónica Pérez'),make('3','Ismael García'),make('5','Erika Ramos','Aurora','trabajo')]
  const external=[{...make('4','Husky Pass · Familia','Husky Pass'),fieldLabel:'Identidad · credencialización'}]
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url())
   if(!url.pathname.startsWith('/api/'))return route.continue()
   if(url.pathname==='/api/directory/photo')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="40" fill="#9fc7b3"/></svg>'})
   if(url.pathname==='/api/control-escolar/audit')return route.fulfill({json:{summary:{completedStudents:2,totalStudents:3,pendingStudents:1,studentUpdateCount:1,loginCount:2,progressPercent:67,sourceBase:'live-bridge-enriched',sourceFlow:'student_patch_matricula_overlay'},timeline:[{id:1,type:'student_update',createdAt:day+'T12:00:00Z',student:'Ana María García López',matricula:'PT0123',plantel:'PT',summary:'student_patch_matricula_overlay',sourceFlow:'student_patch_matricula_overlay'},{id:2,type:'page_snapshot',createdAt:day+'T12:00:00Z',summary:'Snapshot de avance',payload:{counters:{sinCurp:1}}}],updatedStudents:[{student:'Ana María García López',matricula:'PT0123',plantel:'PT',total:1,lastAt:day+'T12:00:00Z'}],filters:{}}})
   if(url.pathname==='/api/control-escolar/audit/field-history'){
    fieldRequests.push(Object.fromEntries(url.searchParams))
    if(fieldHistoryFailure)return route.fulfill({status:503,json:{message:'No se pudo cargar el historial del campo.',data:{requestId:'fixture-field-failure'}}})
    const older={...make('field-2024','Mónica Pérez'),date:'2024-02-01',recordedAt:'2024-02-01 09:00:00',before:'Nombre previo',after:'Nombre corregido'}
    const oldest={...make('field-2023','Erika Ramos'),date:'2023-01-01',recordedAt:'2023-01-01 08:00:00',before:'Nombre original',after:'Nombre previo'}
    return route.fulfill({json:{events:url.searchParams.has('cursor')?[oldest]:[stored[0],older],nextCursor:url.searchParams.has('cursor')?null:'fixture-next',partial:false,requestId:'fixture-field-reference'}})
   }
   if(url.pathname==='/api/control-escolar/audit/changes')return route.fulfill({json:{events:stored,categories,allowedPlanteles:['PT','SM'],truncated:false}})
   if(url.pathname==='/api/control-escolar/audit/history')return unavailable?route.fulfill({status:503,json:{statusCode:503,message:'No se pudo completar la consulta.',data:{requestId:'fixture-history-failure',code:'AUDIT_HISTORY_UNAVAILABLE',retryable:true}}}):route.fulfill({json:{events:external,available:true,truncated:false}})
   return route.fulfill({status:401,json:{message:'Synthetic unauthenticated API; visual fixture only'}})
  })
  await page.route('https://lh3.googleusercontent.com/a/expired-fixture',route=>route.fulfill({status:404,body:''}))
  await page.route('https://lh3.googleusercontent.com/a/audit-fixture',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#cfe7da"/><circle cx="40" cy="29" r="15" fill="#719b83"/><ellipse cx="40" cy="78" rx="29" ry="30" fill="#476f5a"/></svg>'}))
  await page.goto(base+'/__visual-lab/audit',{waitUntil:'domcontentloaded',timeout:120000})
  try{await page.locator('.matrix-cell').filter({hasText:'Husky Pass'}).waitFor({timeout:60000})}catch(error){
   await page.screenshot({path:output+`/failure-${width}x${height}.png`})
   console.error(JSON.stringify({width,height,pageErrors:errors,warnings:warnings.slice(-10),html:(await page.locator('.income-content').innerHTML()).slice(0,2000),url:page.url(),body:(await page.locator('body').innerText()).slice(0,2200)}));throw error
  }
  assert.match(await page.locator('.inline-summary').innerText(),/cambios/);
  const dates=await page.locator('.day-heading').evaluateAll(items=>items.map(el=>el.dataset.date))
  assert.equal(dates[0],day);assert.deepEqual(dates,[...dates].sort().reverse());assert.equal(await page.locator('.matrix-scroll').evaluate(el=>el.scrollLeft),0)
  assert.equal(await page.getByRole('button',{name:'Más recientes',exact:true}).isDisabled(),true)
  await page.getByRole('button',{name:'30 días',exact:true}).click()
  await page.waitForFunction(()=>document.querySelectorAll('.day-heading').length===30)
  assert.equal(await page.locator('.day-heading').first().getAttribute('data-date'),day)
  await page.getByRole('button',{name:'Más antiguas',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('.matrix-scroll').scrollLeft>0)
  await page.getByRole('button',{name:'7 días',exact:true}).click()
  await page.waitForFunction(()=>document.querySelectorAll('.day-heading').length===7&&document.querySelector('.matrix-scroll').scrollLeft===0)
  await page.locator('.date-range').click();assert.equal(await page.locator('.custom-dates input').count(),2)
  await page.locator('.date-range').click();assert.equal(await page.locator('.custom-dates input').count(),0)
  await page.getByRole('button',{name:'7 días',exact:true}).click()
  await page.screenshot({path:output+`/audit-overview-${width}x${height}.png`})
  await page.locator('.day-heading').first().click()
  await page.locator('.student-branch').first().waitFor()
  assert.ok(await page.locator('.student-heading').count()>0)
  assert.ok(await page.locator('.student-count b').count()>0)
  assert.ok(await page.locator('.date-divider').count()>0)
  if(width<=760)await page.getByRole('button',{name:'Volver al historial',exact:true}).click()
  else await page.getByRole('button',{name:'Ver todos los cambios',exact:true}).click()
  const cell=page.locator('.matrix-cell').filter({hasText:'Husky Pass'})
  try{await cell.filter({hasText:'Erika Ramos'}).waitFor({timeout:30000})}catch(error){console.error((await page.locator('.change-workspace').innerText()).slice(0,2000));await page.screenshot({path:output+`/failure-${width}x${height}.png`});throw error}
  await cell.locator('img[src*="directory/photo"]').waitFor({timeout:30000})
  await page.waitForFunction(()=>[...document.querySelectorAll('.matrix-cell img')].every(img=>img.complete&&img.naturalWidth>0))
  assert.match(await cell.innerText(),/Erika Ramos/)
  assert.match(await cell.innerText(),/Mónica Pérez/)
  assert.match(await cell.innerText(),/Ismael García/)
  assert.equal(await cell.locator('.cell-source.husky').count(),1)
  assert.equal(await cell.locator('.audit-avatar img').count(),3)
  assert.ok(await cell.locator('img').first().evaluate(img=>img.complete&&img.naturalWidth>0))
  assert.equal(await cell.locator('img[src*="directory/photo"]').count(),1)
  assert.ok(await cell.locator('img[src*="directory/photo"]').evaluate(img=>img.complete&&img.naturalWidth>0))
  assert.equal(await page.locator('.change-workspace select').count(),0)
  // Non-modal inspector stays alongside the grid on desktop, below it on mobile.
  await cell.scrollIntoViewIfNeeded()
  const before=await page.evaluate(()=>({window:window.scrollY,matrix:document.querySelector('.matrix-scroll').scrollTop}))
  console.log('Checking audit viewport '+width+'x'+height)
  const point=await cell.evaluate(el=>{const r=el.getBoundingClientRect(),s=el.closest('.matrix-scroll').getBoundingClientRect();return {x:(Math.max(r.left,s.left+159)+Math.min(r.right,s.right)-2)/2,y:(Math.max(r.top,s.top+55)+Math.min(r.bottom,s.bottom)-2)/2}})
  await page.mouse.click(point.x,point.y)
  const inspector=page.getByRole('complementary',{name:'Detalle de cambios'})
  await inspector.getByRole('heading',{name:/Nombre/}).waitFor()
  assert.equal(await page.locator('dialog').count(),0)
  const box=await inspector.boundingBox(),gridBox=await page.locator('.audit-overview').boundingBox()
  assert.ok(box.y>=0&&box.y+box.height<=height+1)
  if(width>760)assert.ok(box.x>=gridBox.x+gridBox.width-1,'inspector must not overlap matrix')
  assert.ok(await inspector.getByText('Familia',{exact:true}).isVisible())
  assert.match(await inspector.locator('.timeline-change').first().locator('header').innerText(),/Erika Ramos/)
  assert.equal(await inspector.locator('.timeline-change').first().locator('header .student').count(),0)
  const after=await page.evaluate(()=>({window:window.scrollY,matrix:document.querySelector('.matrix-scroll').scrollTop}))
  if(width>760)assert.deepEqual(after,before)
  assert.equal(await page.locator('.field-heading').count(),7)
  await page.screenshot({path:output+`/audit-details-${width}x${height}.png`})
  if(width===1920){const last=await page.locator('.field-heading').last().boundingBox(),matrix=await page.locator('.matrix-scroll').boundingBox();assert.ok(last.y+last.height<=matrix.y+matrix.height+1,'all seven field rows visible at desktop size '+JSON.stringify({last,matrix}));const lastDay=await page.locator('.day-heading').last().boundingBox();assert.ok(lastDay.x+lastDay.width<=matrix.x+matrix.width+1,'all seven dates visible at desktop size')}
  assert.ok(await page.locator('.change-workspace').evaluate(el=>getComputedStyle(el).fontFamily.includes('Montserrat')))
  await page.screenshot({path:output+`/audit-details-${width}x${height}.png`})
  await inspector.locator('.timeline-change').first().getByRole('button',{name:/^Historial de /}).scrollIntoViewIfNeeded()
  const savedDetail=await page.locator('.detail-records').evaluate(el=>el.scrollTop)
  await inspector.locator('.timeline-change').first().getByRole('button',{name:/^Historial de /}).click()
  const fieldPanel=page.getByRole('region',{name:'Historial del campo',exact:true})
  await fieldPanel.getByText('Nombre corregido',{exact:true}).waitFor()
  assert.equal(fieldRequests[0].field,'nombre');assert.equal(fieldRequests[0].matricula,'PT0123');assert.equal(fieldRequests[0].plantel,'PT')
  assert.equal('from' in fieldRequests[0],false);assert.equal('source' in fieldRequests[0],false)
  assert.match(await fieldPanel.innerText(),/2024/)
  assert.equal(await fieldPanel.getByRole('button',{name:'Ver historial del campo',exact:true}).count(),0)
  await fieldPanel.getByRole('button',{name:'Cargar cambios anteriores',exact:true}).click()
  await fieldPanel.getByText('Nombre original',{exact:true}).waitFor()
  assert.equal(await fieldPanel.locator('.student-root').count(),1,'one student above every date');
  assert.equal(await fieldPanel.locator('.student-root .date-section').count(),3,'all dates stay beneath their student');
  assert.equal(await fieldPanel.locator('.student-heading').count(),0,'student identity must not repeat per date');
  assert.equal(await fieldPanel.locator('.change-tree>li').count(),3);assert.equal(await fieldPanel.locator('.date-divider').count(),3);
  const historicalDates=await fieldPanel.locator('.date-divider strong').allTextContents();assert.match(historicalDates.at(-1),/2023/)
  await page.screenshot({path:output+`/audit-field-history-${width}x${height}.png`})
  await fieldPanel.getByRole('button',{name:'Volver a cambios',exact:true}).click()
  await page.locator('.detail-records').waitFor()
  assert.equal(await page.locator('.detail-records').evaluate(el=>el.scrollTop),savedDetail)
  fieldHistoryFailure=true
  await inspector.locator('.timeline-change').first().getByRole('button',{name:/^Historial de /}).click()
  await page.getByRole('region',{name:'Historial del campo',exact:true}).getByRole('button',{name:'Copiar referencia del error'}).waitFor()
  fieldHistoryFailure=false
  await page.getByRole('region',{name:'Historial del campo',exact:true}).getByRole('button',{name:'Reintentar',exact:true}).click()
  await page.getByText('Nombre corregido',{exact:true}).waitFor()
  await page.getByRole('button',{name:'Volver a cambios',exact:true}).click()
  if(width<=760)await page.getByRole('button',{name:'Volver al historial',exact:true}).click();else await page.keyboard.press('Escape')
  if(width>760)await inspector.getByRole('heading',{name:'Cambios recientes'}).waitFor();else {await page.locator('.matrix-scroll').waitFor();assert.deepEqual(await page.evaluate(()=>({window:window.scrollY,matrix:document.querySelector('.matrix-scroll').scrollTop})),before)}
  await page.getByRole('button',{name:'Filtrar plantel',exact:true}).click()
  await page.getByPlaceholder('Buscar plantel…').fill('secundaria')
  await page.getByRole('option',{name:'Secundaria Metepec'}).click()
  await page.getByRole('button',{name:'Filtrar plantel',exact:true}).click()
  await page.getByPlaceholder('Buscar plantel…').fill('toluca')
  await page.getByRole('option',{name:'Primaria Toluca'}).click()
  await page.locator('.source-legend>.husky').click()
  assert.match(await page.locator('.source-legend>.aurora b').innerText(),/4/)
  assert.equal(await page.locator('.matrix-cell .mini-name').filter({hasText:'Erika'}).count(),0)
  await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click()
  unavailable=true
  await page.getByRole('button',{name:'Actualizar',exact:true}).click()
  await page.getByText('No se pudo cargar parte del historial.',{exact:true}).waitFor()
  await page.getByText('Ref. fixture-history-failure',{exact:true}).waitFor()
  assert.match(await page.locator('.source-legend>.husky').innerText(),/—/)
  assert.equal(await page.locator('.matrix-cell').filter({hasText:'Erika Ramos'}).count()>0,true)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true)
  assert.deepEqual(errors,[])
  assert.equal(await page.getByText('Actividad y avance',{exact:true}).count(),0)
  assert.doesNotMatch(await page.locator('.control-audit-page').innerText(),/student_patch|live-bridge|Snapshot|source_flow|Se conserva actividad|Base usada|Análisis|Avance de expedientes|expedientes completos|pendientes/i)
  results.push({width,height,inspectorInViewport:true,scrollPositionPreserved:true,workspaceImagesRendered:true,allActorsAndHuskyVisible:true,nonModalInspector:true,existingFonts:true,searchableFilters:true,unavailableHistoryExplicit:true,pageErrors:errors})
  await browser.close();browser=null
 }
 await writeFile(output+'/results.json',JSON.stringify({synthetic:true,results},null,2))
 console.log(JSON.stringify(results,null,2))
}finally{await browser?.close()}
