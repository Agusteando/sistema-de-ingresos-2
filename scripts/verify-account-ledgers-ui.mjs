import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { openSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.VISUAL_PLAYWRIGHT_MODULE || 'playwright');
const repo = process.cwd(), label = process.env.LEDGER_QA_LABEL || 'ledger';
const output = process.env.VISUAL_EVIDENCE_DIR || '/tmp/aurora-ui-evidence';
mkdirSync(output,{recursive:true});
const log = openSync(`${output}/dev.log`,'w');
const server = spawn(process.execPath,['node_modules/nuxt/bin/nuxt.mjs','dev','--host','127.0.0.1','--port','3004'],{cwd:repo,detached:true,env:{...process.env,NITRO_NO_UNIX_SOCKET:'1',NODE_USE_ENV_PROXY:'0',DB_TRANSPORT:'bridge'},stdio:['ignore',log,log]});
let b, p;
const deadline=setTimeout(()=>{console.error('UI verification exceeded eight minutes');try{process.kill(-server.pid,'SIGTERM')}catch{}process.exit(1)},480000);
try {
 b=await chromium.launch({headless:true,...(process.env.VISUAL_BROWSER_EXECUTABLE ? {executablePath:process.env.VISUAL_BROWSER_EXECUTABLE,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader']} : {})});
 p=await b.newPage();
 const fontCss=['montserrat','fredoka'].flatMap(family=>[500,600,700].map(weight=>{
 const file=`${family}/files/${family}-latin-${weight}-normal.woff2`;
 const path=process.env.VISUAL_FONT_MODULES ? `${process.env.VISUAL_FONT_MODULES}/@fontsource/${file}` : require.resolve(`@fontsource/${file}`);
 return `@font-face{font-family:'${family==='montserrat'?'Montserrat':'Fredoka'}';font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${readFileSync(path).toString('base64')}) format('woff2');}`;
 })).join('');
 await p.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:fontCss}));
 const data=Array.from({length:48},(_,i)=>({matricula:`VIS${String(i).padStart(3,'0')}`,fullName:i===0?'Alumno Prueba Apellido Largo Completo':`Alumno Prueba ${i+1} Apellido`,nombreCompleto:`Alumno Prueba ${i+1} Apellido`,nombreCompletoAlumno:`Alumno Prueba ${i+1} Apellido`,nombres:'Alumno Prueba',apellidoPaterno:'Apellido',apellidoMaterno:'Completo',status:'Activo',estatus:'Activo',enrollmentState:'inscrito',tipoIngresoValue:i%3?'interno':'externo',overlayExists:true,nivel:'primaria',grado:['primero','segundo','tercero','cuarto','quinto','sexto'][i%6],group:['AFRICA','AMERICA','ASIA','EUROPA'][i%4],grupo:['AFRICA','AMERICA','ASIA','EUROPA'][i%4],sexo:'Masculino',curp:'VISUAL000000HMCXXX00',nombrePadre:i<2?'Padre Prueba':`Padre Prueba ${i}`,telefonoPadre:String(7220000000+(i<2?0:i)),emailPadre:'visual@example.invalid',nombreMadre:i<2?'Madre Prueba':`Madre Prueba ${i}`,telefonoMadre:String(7230000000+(i<2?0:i)),emailMadre:'visual2@example.invalid',huskyPassUsername:`fixture-${i}`,huskyPassPlaintext:i%2?'fixture-password':'',huskyPassAvailable:Boolean(i%2),missingFields:[],missingBasicFields:[],recordCompleteness:100}));
 const kpis={inscritos:48,internos:32,externos:16,noInscritos:0,bajas:0};
 const photoFixture = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="200"><rect width="160" height="200" fill="#eef3e8"/><circle cx="80" cy="70" r="38" fill="#c89775"/><path d="M18 200V155Q80 95 142 155V200" fill="#507728"/></svg>');
 // Exercise the real face-image processor with synthetic geometry and pixels.
 await p.route('https://vision.casitaapps.com/**',route=>route.fulfill({
   contentType:route.request().url().includes('/image/') ? 'image/svg+xml' : 'application/json',
   headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS'},
   body:route.request().url().includes('/image/') ? decodeURIComponent(photoFixture.split(',')[1]) : JSON.stringify({ok:true,imageKey:'visual-fixture',maskAvailable:false})
 }));
 let activePhotos=0,maxActivePhotos=0, transientPhotoAttempts=0,selectedPhotoAttempts=0,emptyPhotoAttempts=0;
 const requests=[];
 await p.route('http://127.0.0.1:3004/api/**',async route=>{const u=new URL(route.request().url());requests.push(u.pathname);let body={};let status=200;
 if(u.pathname==='/api/control-escolar/options')body={activePlantel:'PT',planteles:[{id:'PT',nombre:'Primaria Toluca'}],access:{controlEscolar:true,financial:true,superAdmin:true}};
 else if(u.pathname==='/api/control-escolar/students')body={data,kpis,catalogs:{niveles:['primaria'],grados:['primero','segundo','tercero','cuarto','quinto','sexto'],grupos:['AFRICA','AMERICA','ASIA','EUROPA'],gruposPorGrado:{}},source:{base:'synthetic-visual-fixture',overlayRows:48}};
 else if(u.pathname==='/api/control-escolar/kpis')body={kpis};
 else if(u.pathname==='/api/control-escolar/enrollment-config')body={};
 else if(u.pathname==='/api/auth/session')body={email:'visual@example.invalid',role:'superadmin,role_ctrl',planteles:['PT','SM'],activePlantel:'PT',hasFinancialAccess:true,hasControlEscolarRole:true,isSuperAdmin:true};
 else if(u.pathname==='/api/login/updates')body={ok:true,versionLabel:'visual',totalCount:48,lastUpdatedLabel:'Synthetic fixture',updates:[]};
 else if(u.pathname.endsWith('/photo')) {
   const measure = /PTO|LAB/.test(u.pathname) && (route.request().headers().referer || '').includes('photos=uncached');
   if(measure) {
     activePhotos++;maxActivePhotos=Math.max(maxActivePhotos,activePhotos);
     await new Promise(resolve=>setTimeout(resolve,150));
     activePhotos--;
   }
   if(measure && u.pathname.includes('/PTO574/') && ++selectedPhotoAttempts===1) { status=503;body={message:'Synthetic selected portrait failure'}; }
   else if(measure && u.pathname.includes('/PTO696/') && ++emptyPhotoAttempts===1) { body={}; }
   else if(u.pathname.includes('/PTO161/') && (!measure || ++transientPhotoAttempts===1)) { status=503;body={message:'Synthetic transient photo failure'}; }
   else if(u.pathname.includes('/PTO799/')) { status=404;body={message:'Synthetic missing photo'}; }
   else body={photoUrl: photoFixture};
 }

 else {status=401;body={statusCode:401,message:'Synthetic fixture: no backend session'};}
 return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});});
 await p.context().addCookies([{name:'auth_role',value:'superadmin',url:'http://127.0.0.1:3004'},{name:'auth_planteles',value:'PT%2CSM',url:'http://127.0.0.1:3004'}]);
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await new Promise(r=>setTimeout(r,15000));



 // The API fixture is browser-only; no transaction or backend access is authorized by this check.

 const results=[];
 for(const [w,h] of [[1366,768],[1920,1080],[1024,768],[900,640],[390,844],[1150,410]]) {
   await p.setViewportSize({width:w,height:h});
   await p.goto('http://127.0.0.1:3004/__visual-lab/students-account?chrome=0&workspace=1&dense=1&ledgerdense=1',{waitUntil:'domcontentloaded',timeout:90000});
   await p.locator('.account-table-wrap tbody tr').first().waitFor();await p.evaluate(()=>document.fonts.load('500 13px Montserrat'));
   for(const [tab,row,wrap] of [['Pagos','.payment-ledger-row','.account-timeline-wrap'],['Facturas','.student-invoice-row','.account-invoices-wrap']]) {
     await p.locator('.account-view-tabs:visible button').filter({hasText:tab}).click();await p.locator(row).first().waitFor();await p.waitForTimeout(300);
     const metrics=await p.evaluate(({row,wrap})=>{
       const rows=[...document.querySelectorAll(row)],area=document.querySelector(wrap).getBoundingClientRect();
       const e=rows[0],r=e.getBoundingClientRect(),title=e.querySelector('strong'),meta=e.querySelector('[class*="__subline"],[class*="__meta"]'),actions=e.querySelector('[class*="__actions"]');
       return {viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,width:r.width,height:r.height,font:getComputedStyle(title).fontSize,weight:getComputedStyle(title).fontWeight,metadataFont:getComputedStyle(meta).fontSize,actionsOpacity:getComputedStyle(actions).opacity,visibleRows:rows.filter(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.top>=area.top&&r.bottom<=area.bottom}).length,clippedActions:[...document.querySelectorAll(row+' button')].filter(b=>{const r=b.getBoundingClientRect();return r.left<area.left-1||r.right>area.right+1;}).length};
     },{row,wrap});results.push({tab,...metrics});console.log(tab,JSON.stringify(metrics));
     if(!process.env.LEDGER_BASELINE && (metrics.overflow||metrics.clippedActions||Number(metrics.weight)>600||parseFloat(metrics.metadataFont)<11||metrics.actionsOpacity!=='1'||metrics.visibleRows<1))throw Error(`Ledger visual gate failed ${tab} at ${w}`);
     if(!process.env.LEDGER_BASELINE) {
       const capacity = {1366:[4,5],1920:[4,11],1024:[4,5],900:[4,6],390:[4,4],1150:[3,2]};
       const baseline={visibleRows:capacity[w][tab==='Pagos'?0:1]};
       if(metrics.visibleRows<baseline.visibleRows)throw Error(`Ledger capacity regressed ${tab} at ${w}: ${metrics.visibleRows} vs ${baseline.visibleRows}`);
     }
     await p.screenshot({path:`${output}/${label}-${tab}-${w}.png`,timeout:30000});
   }
 }
 if(!process.env.LEDGER_BASELINE) {
   await p.setViewportSize({width:1366,height:768});
   await p.goto('http://127.0.0.1:3004/__visual-lab/students-account?chrome=0&workspace=1&dense=1&ledgerdense=1',{waitUntil:'domcontentloaded',timeout:90000});
   await p.locator('.account-table-wrap tbody tr').first().waitFor();
   await p.locator('.account-view-tabs:visible button').filter({hasText:'Pagos'}).click();await p.locator('.payment-ledger-row').first().waitFor();
   const checkbox=p.locator('.payment-ledger-row input[type=checkbox]').first();await checkbox.check({force:true});
   await p.locator('.account-footer-receipts').waitFor();if(!await checkbox.isChecked())throw Error('Payment selection broken');
   await checkbox.uncheck({force:true});if(await p.locator('.account-footer-receipts').count())throw Error('Payment deselection broken');
   const payment=p.locator('.payment-ledger-row').first();
   if(await payment.locator('button[aria-label="Descargar recibo"]').count()!==1)throw Error('Receipt action disappeared');
   // Existing invoice link opens its existing invoice row rather than another billing flow.
   const linked=p.locator('.payment-ledger-action--invoiced').first();if(await linked.count()) {await linked.click();await p.locator('.student-invoice-row.is-highlighted').waitFor();}
   await p.locator('.account-view-tabs:visible button').filter({hasText:'Facturas'}).click();await p.locator('.student-invoice-row').first().waitFor();await p.locator('.account-search-control:visible input').fill('');await p.waitForTimeout(200);
   for(const name of ['Descargar PDF','Descargar XML','Descargar ZIP','Enviar por correo','Cancelar factura'])if(await p.locator(`.student-invoice-row button[aria-label="${name}"]`).count()!==18)throw Error(`Invoice action lost ${name}`);
   const invoices=p.locator('.student-invoice-row');
   await invoices.first().locator('summary').click();if(!await invoices.first().locator('.student-invoice-row__uuid').isVisible()||!await invoices.first().locator('.student-invoice-row__sources').isVisible())throw Error('Fiscal references unavailable');await invoices.first().locator('summary').click();
   if(!await invoices.nth(1).locator('[aria-label="Cancelar factura"]').isDisabled()||!await invoices.nth(3).locator('[aria-label="Cancelar factura"]').isDisabled())throw Error('Pending/cancelled invoice cancellation guard changed');
   if(!await invoices.nth(4).locator('[aria-label="Descargar PDF"]').isDisabled())throw Error('Non-actionable invoice guard changed');
   if(!await invoices.nth(2).locator('[aria-label="Cancelar factura"]').isEnabled())throw Error('Rejected cancellation cannot be retried');
   // Email and cancellation remain their existing dialogs; do not submit financial mutations.
   const prompts=[];p.on('dialog',async dialog=>{prompts.push(dialog.message());await dialog.dismiss();});
   await invoices.first().locator('[aria-label="Enviar por correo"]').click();
   await invoices.first().locator('[aria-label="Cancelar factura"]').click();
   if(!prompts.some(value=>value.includes('Correo'))||!prompts.some(value=>value.includes('Motivo')))throw Error('Existing email/cancellation prompts no longer open');
   await p.evaluate(()=>{window.__ledgerDownloads=[];window.__ledgerOpen=window.open;window.open=url=>window.__ledgerDownloads.push(url);});
   for(const format of ['PDF','XML','ZIP'])await invoices.first().locator(`[aria-label="Descargar ${format}"]`).click();
   const downloads=await p.evaluate(()=>{const urls=window.__ledgerDownloads;window.open=window.__ledgerOpen;return urls;});
   for(const format of ['pdf','xml','zip'])if(!downloads.some(url=>url.includes(`/visual-invoice-pt-1842/${format}?matricula=PTO574`)))throw Error(`Download route changed for ${format}`);
   // Searching retains fiscal metadata and original matching behavior.
   const search=p.locator('.account-search-control:visible input');await search.fill('PT1843');await p.waitForTimeout(200);if(await p.locator('.student-invoice-row').count()!==1)throw Error('Invoice search regressed');await search.fill('');
   await p.locator('button[aria-label="Más acciones"]').click();await p.getByRole('button',{name:'Ampliar estado de cuenta',exact:true}).click();await p.waitForTimeout(1000);await p.waitForFunction(()=>{const row=document.querySelector('.student-invoice-row');if(!row||row.getBoundingClientRect().height<40)return false;for(let e=row;e;e=e.parentElement)if(Number(getComputedStyle(e).opacity)<.99)return false;return true;});await p.screenshot({path:`${output}/${label}-expanded-invoices.png`,timeout:30000});
   if(await p.locator('.student-invoice-row').count()!==18)throw Error('Expanded invoice list lost records');
   const expanded=await p.evaluate(()=>{const area=document.querySelector('.account-invoices-wrap').getBoundingClientRect();return {height:area.height,visible:[...document.querySelectorAll('.student-invoice-row')].filter(e=>{const r=e.getBoundingClientRect();return r.top>=area.top&&r.bottom<=area.bottom}).length};});
   if(expanded.height<200||expanded.visible<3)throw Error(`Expanded invoices clipped: ${JSON.stringify(expanded)}`);console.log('EXPANDED INVOICES',expanded);
   await p.locator('.account-view-tabs:visible button').filter({hasText:'Pagos'}).click();await p.locator('.payment-ledger-row').first().waitFor();await p.waitForTimeout(1000);await p.waitForFunction(()=>{const row=document.querySelector('.payment-ledger-row');if(!row||row.getBoundingClientRect().height<40)return false;for(let e=row;e;e=e.parentElement)if(Number(getComputedStyle(e).opacity)<.99)return false;return true;});await p.screenshot({path:`${output}/${label}-expanded-payments.png`,timeout:30000});
   console.log('PAYMENT SELECTION, LINKED INVOICE, ALL FISCAL ACTIONS, STATUS GUARDS, SEARCH AND EXPANDED VIEWS PASSED');
 }
 if(errors.length)throw Error(errors.join(';'));console.log('ERRORS',errors);
 writeFileSync(`${output}/${label}-results.json`,JSON.stringify({results,errors,requests},null,2));
} catch(e) { console.error(e.stack); if(p){console.error('PAGE',p.url());console.error((await p.locator('body').innerText()).slice(0,2000));await p.screenshot({path:`${output}/failure.png`});} process.exitCode=1; }
finally { if(b)await b.close();try{process.kill(-server.pid,'SIGTERM')}catch{}setTimeout(()=>process.exit(process.exitCode||0),1500); }
