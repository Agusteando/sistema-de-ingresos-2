import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
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
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  let unavailable=false
  const categories=[['grupo','Grupo'],['nombre','Nombre'],['grado','Grado'],['estatus','Estatus'],['contacto','Contacto'],['trabajo','Lugares de trabajo'],['otros','Otros campos']].map(([key,label])=>({key,label}))
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  const make=(id,actor,source='Aurora',category='nombre')=>({id,eventId:1,date:day,recordedAt:day+' 09:42:18',matricula:'PT0123',student:'Alumno de prueba visual',field:category,fieldLabel:categories.find(c=>c.key===category).label,category,before:'Valor anterior',after:'Valor nuevo',source,actor,actorEmail:source==='Aurora'?'visual'+id+'@casitaiedis.edu.mx':'',avatar:source==='Aurora'?'https://lh3.googleusercontent.com/a/audit-fixture':'',flow:'test',quality:source==='Aurora'?'verified':'historical',plantel:'PT',ciclo:'2026'})
  const stored=[make('1','Erika Ramos'),make('2','Mónica Pérez'),make('3','Ismael García'),make('5','Erika Ramos','Aurora','trabajo')]
  const external=[make('4','Husky Pass · Familia','Husky Pass')]
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url())
   if(url.pathname==='/api/control-escolar/audit/changes')return route.fulfill({json:{events:stored,categories,allowedPlanteles:['PT','SM'],truncated:false}})
   if(url.pathname==='/api/control-escolar/audit/history')return route.fulfill({json:{events:unavailable?[]:external,available:!unavailable,truncated:false}})
   return route.fulfill({status:401,json:{message:'Synthetic unauthenticated API; visual fixture only'}})
  })
  await page.route('https://lh3.googleusercontent.com/a/audit-fixture',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#cfe7da"/><circle cx="40" cy="29" r="15" fill="#719b83"/><ellipse cx="40" cy="78" rx="29" ry="30" fill="#476f5a"/></svg>'}))
  await page.goto(base+'/__visual-lab/audit',{waitUntil:'networkidle',timeout:120000})
  await page.locator('.matrix-cell').filter({hasText:'Husky Pass'}).waitFor()
  const cell=page.locator('.matrix-cell').filter({hasText:'Husky Pass'})
  assert.match(await cell.innerText(),/Erika Ramos/)
  assert.match(await cell.innerText(),/Mónica Pérez/)
  assert.match(await cell.innerText(),/Ismael García/)
  assert.equal(await cell.locator('.cell-source.husky').count(),1)
  assert.equal(await cell.locator('.audit-avatar img').count(),3)
  assert.ok(await cell.locator('img').first().evaluate(img=>img.complete&&img.naturalWidth>0))
  assert.equal(await page.locator('.change-workspace select').count(),0)
  // Click a cell already visible in the chart; the document must not jump to the old list.
  await cell.scrollIntoViewIfNeeded()
  const before=await page.evaluate(()=>({window:window.scrollY,content:document.querySelector('.income-content')?.scrollTop||0,matrix:document.querySelector('.matrix-scroll').scrollTop}))
  await cell.click()
  const dialog=page.getByRole('dialog')
  await dialog.waitFor({state:'visible'})
  const box=await dialog.boundingBox()
  assert.ok(box.y>=0&&box.y+box.height<=height+1)
  assert.ok(await dialog.getByRole('button',{name:'Cerrar detalles'}).isVisible())
  assert.ok(await dialog.getByText('Husky Pass · Familia',{exact:true}).isVisible())
  const after=await page.evaluate(()=>({window:window.scrollY,content:document.querySelector('.income-content')?.scrollTop||0,matrix:document.querySelector('.matrix-scroll').scrollTop}))
  assert.deepEqual(after,before)
  await page.screenshot({path:output+`/audit-details-${width}x${height}.png`})
  await page.keyboard.press('Escape')
  await dialog.waitFor({state:'hidden'})
  assert.equal(await cell.evaluate(el=>el===document.activeElement),true)
  await page.getByRole('button',{name:'Filtrar plantel',exact:true}).click()
  await page.getByPlaceholder('Buscar plantel…').fill('secundaria')
  await page.getByRole('option',{name:'Secundaria Metepec'}).click()
  await page.getByRole('button',{name:'Filtrar plantel',exact:true}).click()
  await page.getByPlaceholder('Buscar plantel…').fill('toluca')
  await page.getByRole('option',{name:'Primaria Toluca'}).click()
  await page.getByRole('button',{name:'Filtrar',exact:true}).click()
  await page.getByRole('button',{name:'Sistema',exact:true}).click()
  await page.getByPlaceholder('Buscar sistema…').fill('husky')
  await page.getByRole('option',{name:'Husky Pass',exact:true}).click()
  assert.equal(await page.locator('.matrix-cell .mini-name').filter({hasText:'Erika'}).count(),0)
  await page.getByRole('button',{name:'Limpiar',exact:true}).click()
  unavailable=true
  await page.getByRole('button',{name:'Actualizar',exact:true}).click()
  await page.getByText('Historial anterior no disponible',{exact:true}).waitFor()
  assert.match(await page.locator('.source-summary>.husky').innerText(),/—/)
  assert.equal(await page.locator('.matrix-cell').filter({hasText:'Erika Ramos'}).count()>0,true)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true)
  assert.deepEqual(errors,[])
  results.push({width,height,dialogInViewport:true,scrollPositionPreserved:true,workspaceImagesRendered:true,allActorsAndHuskyVisible:true,searchableFilters:true,unavailableHistoryExplicit:true,pageErrors:errors})
  await browser.close();browser=null
 }
 await writeFile(output+'/results.json',JSON.stringify({synthetic:true,results},null,2))
 console.log(JSON.stringify(results,null,2))
}finally{await browser?.close()}
