import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { openSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.VISUAL_PLAYWRIGHT_MODULE || 'playwright');
const repo = process.cwd(), label = 'verified';
const output = process.env.VISUAL_EVIDENCE_DIR || '/tmp/aurora-ui-evidence';
mkdirSync(output,{recursive:true});
const log = openSync(`${output}/dev.log`,'w');
const server = spawn(process.execPath,['node_modules/nuxt/bin/nuxt.mjs','dev','--host','127.0.0.1','--port','3004'],{cwd:repo,detached:true,env:{...process.env,NITRO_NO_UNIX_SOCKET:'1',NODE_USE_ENV_PROXY:'0',DB_TRANSPORT:'bridge'},stdio:['ignore',log,log]});
let b;
const deadline=setTimeout(()=>{console.error('UI verification exceeded eight minutes');try{process.kill(-server.pid,'SIGTERM')}catch{}process.exit(1)},480000);
try {
 b=await chromium.launch({headless:true,...(process.env.VISUAL_BROWSER_EXECUTABLE ? {executablePath:process.env.VISUAL_BROWSER_EXECUTABLE,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader']} : {})});
 const p=await b.newPage();
 const fontCss=['montserrat','fredoka'].flatMap(family=>[500,600,700].map(weight=>{
 const file=`${family}/files/${family}-latin-${weight}-normal.woff2`;
 const path=process.env.VISUAL_FONT_MODULES ? `${process.env.VISUAL_FONT_MODULES}/@fontsource/${file}` : require.resolve(`@fontsource/${file}`);
 return `@font-face{font-family:'${family==='montserrat'?'Montserrat':'Fredoka'}';font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${readFileSync(path).toString('base64')}) format('woff2');}`;
 })).join('');
 await p.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:fontCss}));
 const data=Array.from({length:48},(_,i)=>({matricula:`VIS${String(i).padStart(3,'0')}`,fullName:i===0?'Alumno Prueba Apellido Largo Completo':`Alumno Prueba ${i+1} Apellido`,nombreCompleto:`Alumno Prueba ${i+1} Apellido`,nombreCompletoAlumno:`Alumno Prueba ${i+1} Apellido`,nombres:'Alumno Prueba',apellidoPaterno:'Apellido',apellidoMaterno:'Completo',status:'Activo',estatus:'Activo',enrollmentState:'inscrito',tipoIngresoValue:i%3?'interno':'externo',overlayExists:true,nivel:'primaria',grado:['primero','segundo','tercero','cuarto','quinto','sexto'][i%6],group:['AFRICA','AMERICA','ASIA','EUROPA'][i%4],grupo:['AFRICA','AMERICA','ASIA','EUROPA'][i%4],sexo:'Masculino',curp:'VISUAL000000HMCXXX00',nombrePadre:i<2?'Padre Prueba':`Padre Prueba ${i}`,telefonoPadre:String(7220000000+(i<2?0:i)),emailPadre:'visual@example.invalid',nombreMadre:i<2?'Madre Prueba':`Madre Prueba ${i}`,telefonoMadre:String(7230000000+(i<2?0:i)),emailMadre:'visual2@example.invalid',missingFields:[],missingBasicFields:[],recordCompleteness:100}));
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
 await p.goto('http://127.0.0.1:3004/__visual-lab/students-account?chrome=0&workspace=1&dense=1',{waitUntil:'domcontentloaded',timeout:90000});
 await p.locator('.account-table-wrap tbody tr').first().waitFor();await p.evaluate(()=>document.fonts.load('600 20px Montserrat'));await p.waitForTimeout(500);
 const financial=await p.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,tableHeight:document.querySelector('.account-table-wrap').clientHeight,rowHeight:document.querySelector('.student-row').getBoundingClientRect().height,photos:document.querySelectorAll('.student-grade-photo-card.has-photo').length,listRows:(()=>{const box=document.querySelector('.student-list-scroll').getBoundingClientRect();return [...document.querySelectorAll('.student-row')].filter(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.top>=box.top&&r.bottom<=box.bottom}).length})()}));
 if(financial.overflow||financial.tableHeight<100||financial.rowHeight>120||financial.photos<2)throw Error(`Financial layout/photo gate: ${JSON.stringify(financial)}`);
 if([1366,1920,1024].includes(w)&&financial.listRows<({1366:8,1920:13,1024:5})[w])throw Error(`List capacity regressed: ${JSON.stringify(financial)}`);
 console.log('FINANCIAL',JSON.stringify(financial));results.push(financial);await p.screenshot({path:`${output}/${label}-financial-${w}.png`,timeout:10000});
 }
 // Original grade/group/debt pills must remain interactive at every breakpoint.
 for(const [w,h] of [[1920,1080],[1366,768],[1024,768],[900,640],[390,844]]) {
   await p.setViewportSize({width:w,height:h});
   await p.goto('http://127.0.0.1:3004/__visual-lab/students-account?chrome=0&workspace=1&dense=1',{waitUntil:'domcontentloaded'});
   await p.locator('.grade-tabs button').last().waitFor({state:'attached'});
   await p.locator('.students-back-button').evaluate(e=>e.click());
   await p.locator('.grade-filter').waitFor({state:'visible'});
   const pills=p.locator('.grade-tabs button');
   if(await pills.count()!==8||await p.locator('.filter-bar select').count()||!await p.locator('.grade-filter').isVisible())throw Error(`Original pills unavailable at ${w}`);
   await pills.filter({hasText:/^Primero$/}).click();
   if(await pills.filter({hasText:/^Primero$/}).getAttribute('aria-pressed')!=='true')throw Error('Grade pill does not activate');
   const group=p.locator('.group-tabs button').filter({hasText:'Grupo ASIA'});await group.click();
   if(await group.getAttribute('aria-pressed')!=='true'||await p.locator('.student-row').count()<1)throw Error('Group pill does not filter');
   await pills.filter({hasText:/^Todos$/}).click();
   await p.locator('.group-tabs').waitFor({state:'detached'});
   await pills.filter({hasText:'Con adeudo'}).click();
   if(await pills.filter({hasText:'Con adeudo'}).getAttribute('aria-pressed')!=='true')throw Error('Debt pill does not activate');
   await pills.filter({hasText:/^Todos$/}).click();
   console.log('ORIGINAL FILTER PILLS',w,'passed');
 }
 await p.setViewportSize({width:1366,height:768});
 await p.goto('http://127.0.0.1:3004/__visual-lab/students-account?chrome=0&workspace=1&appchrome=1',{waitUntil:'domcontentloaded'});
 await p.locator('.student-account-photo-card.has-photo').waitFor();await p.locator('.student-account-photo-card').hover();await p.locator('.student-account-photo-preview').waitFor({state:'visible'});await p.mouse.move(1000,500);await p.locator('.student-account-photo-preview').waitFor({state:'hidden'});
 const photo = p.locator('.student-grade-photo-card.has-photo .student-grade-photo-card__photo').first();
 if(!await photo.evaluate(e=>getComputedStyle(e).animationName.includes('photo-slide')))throw Error('Original grade/photo animation missing');
 await p.emulateMedia({reducedMotion:'reduce'});
 const reduced=await p.evaluate(()=>({photo:getComputedStyle(document.querySelector('.student-grade-photo-card.has-photo .student-grade-photo-card__photo')).opacity,animation:getComputedStyle(document.querySelector('.income-sidebar')).animationName}));
 if(reduced.photo!=='1'||reduced.animation!=='none')throw Error('Reduced-motion gate failed');await p.emulateMedia({reducedMotion:'no-preference'});
 const identity=await p.evaluate(()=>({logo:document.querySelector('.sidebar-logo').getAttribute('src'),aurora:document.querySelector('.sidebar-system-logo').getAttribute('src'),pattern:getComputedStyle(document.querySelector('.sidebar-sheen')).backgroundImage,animation:getComputedStyle(document.querySelector('.income-sidebar')).animationDuration}));
 if(identity.logo!=='/brand/institutional-emblem.webp'||identity.aurora!=='/brand/aurora-logo-institutional.svg'||!identity.pattern.includes('institutional-fingerprint')||identity.animation!=='0s')throw Error('Institutional identity gate failed');console.log('IDENTITY',identity);
 const fills=await p.evaluate(()=>[document.querySelector('.new-student-button'),document.querySelector('.profile-action-button--document-primary')].map(e=>({background:getComputedStyle(e).backgroundColor,image:getComputedStyle(e).backgroundImage})));
 if(fills[0].background!==fills[1].background||fills.some(x=>x.image!=='none'))throw Error(`Inconsistent filled CTA colors: ${JSON.stringify(fills)}`);
 console.log('CTA FILLS',fills);
 const primaryButtons=[p.locator('.new-student-button'),p.locator('.profile-action-button--document-primary')];
 const hoverFills=[];
 for(const button of primaryButtons){await button.hover();await p.waitForTimeout(250);hoverFills.push(await button.evaluate(e=>({background:getComputedStyle(e).backgroundColor,shadow:getComputedStyle(e).boxShadow,image:getComputedStyle(e).backgroundImage})));}
 if(hoverFills[0].background!==hoverFills[1].background||hoverFills.some(x=>x.shadow!=='none'||x.image!=='none'))throw Error(`CTA hover mismatch: ${JSON.stringify(hoverFills)}`);
 await p.mouse.move(1000,700);
 if(await p.locator('.student-plantel-warning').count())throw Error('Student name flags were not removed');
 console.log('CTA HOVER AND NAME FLAGS PASSED',hoverFills);

 const logoPalette=await p.locator('.sidebar-system-logo').evaluate(async img=>{
   await img.decode();const canvas=document.createElement('canvas');canvas.width=600;canvas.height=200;
   const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,600,200);const pixels=ctx.getImageData(0,0,600,200).data;
   const counts={};for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]!==255)continue;const key=[pixels[i],pixels[i+1],pixels[i+2]].join(',');counts[key]=(counts[key]||0)+1;}
   return counts;
 });
 if((logoPalette['97,139,47']||0)<100||(logoPalette['0,127,146']||0)<100)throw Error(`Logo does not render the institutional palette: ${JSON.stringify(logoPalette)}`);
 console.log('EXACT RENDERED LOGO COLORS',logoPalette);

 await p.screenshot({path:`${output}/identity-restored.png`,timeout:10000});
 // Fresh session exercises production loading, not seeded photo-cache entries.
 await p.evaluate(()=>sessionStorage.clear());
 transientPhotoAttempts=0;selectedPhotoAttempts=0;emptyPhotoAttempts=0;
 await p.evaluate(()=>{sessionStorage.setItem('foto_PTO696','none');sessionStorage.setItem('foto_PTO696_checked',String(Date.now()));});
 const startRequests=requests.length;
 await p.goto('http://127.0.0.1:3004/__visual-lab/students-account?chrome=0&workspace=1&dense=1&photos=uncached',{waitUntil:'domcontentloaded'});
 await p.locator('.student-account-photo-card.has-photo').waitFor({timeout:20000});
 await p.locator('.student-row[data-matricula="PTO696"] .has-photo').waitFor({timeout:20000});
 if(selectedPhotoAttempts!==2||emptyPhotoAttempts!==2)throw Error(`Selected/empty-response photo recovery failed: ${JSON.stringify({selectedPhotoAttempts,emptyPhotoAttempts})}`);
 const permanent=await p.locator('.student-account-photo-card .vision-face-image').evaluate(e=>({opacity:getComputedStyle(e).opacity,animations:e.getAnimations({subtree:true}).length}));
 if(permanent.opacity!=='1'||permanent.animations!==0)throw Error('Detail portrait is not permanently visible');
 console.log('LEGACY CACHE, EMPTY RESPONSE AND SELECTED PHOTO RECOVERY PASSED',permanent);
 await p.locator('.student-row[data-matricula="LAB0000"] .has-photo').waitFor();
 const visibleRequests=requests.slice(startRequests).filter(x=>x.endsWith('/photo'));
 if(!visibleRequests.includes('/api/students/PTO696/photo')||visibleRequests.includes('/api/students/LAB0047/photo'))throw Error(`Visible-row loading gate failed: ${JSON.stringify(visibleRequests)}`);
 await p.waitForFunction(()=>document.querySelector('.student-row[data-matricula="PTO696"] .vision-face-image img')?.src.startsWith('data:image/png'));
 const phases=[];
 for(const time of [0,5500,8750]) {
   phases.push(await p.locator('.student-row[data-matricula="PTO696"] .student-grade-photo-card').evaluate((e,time)=>{
     for(const animation of e.getAnimations({subtree:true})){animation.pause();animation.currentTime=time;}
     return {grade:getComputedStyle(e.querySelector('.student-grade-photo-card__grade')).opacity,photo:getComputedStyle(e.querySelector('.student-grade-photo-card__photo')).opacity};
   },time));
 }
 if(phases[0].grade!=='1'||phases[1].photo!=='1'||phases[2].grade!=='1')throw Error(`Grade/photo cycle failed: ${JSON.stringify(phases)}`);
 const photoCache=await p.evaluate(()=>({failed:sessionStorage.getItem('foto_PTO161'),missing:sessionStorage.getItem('foto_PTO799'),missingChecked:sessionStorage.getItem('foto_PTO799_checked')}));
 if(photoCache.failed==='none'||photoCache.missing!=='none'||!photoCache.missingChecked||maxActivePhotos<1||maxActivePhotos>3||visibleRequests.filter(x=>x==='/api/students/PTO574/photo').length!==2)throw Error(`Photo cache/concurrency gate failed: ${JSON.stringify({photoCache,maxActivePhotos,visibleRequests})}`);
 console.log('FRESH PHOTO CYCLE',JSON.stringify({visibleRequests,phases,photoCache,maxActivePhotos}));
 await p.locator('.student-row[data-matricula="PTO161"] .has-photo').waitFor({timeout:15000});
 if(transientPhotoAttempts!==2)throw Error(`Visible transient photo retry failed: ${transientPhotoAttempts}`);
 console.log('VISIBLE PHOTO RECOVERED WITHOUT SCROLL');
 await p.locator('.student-row[data-matricula="PTO696"] .student-grade-photo-card').evaluate(e=>{for(const animation of e.getAnimations({subtree:true}))animation.currentTime=5500;});
 await p.screenshot({path:`${output}/fresh-row-photos.png`,timeout:10000});
 await p.locator('.student-list-scroll').evaluate(e=>e.scrollTop=e.scrollHeight);
 await p.locator('.student-row[data-matricula="LAB0047"] .has-photo').waitFor();
 if(!requests.includes('/api/students/LAB0047/photo'))throw Error('Scrolling did not load newly visible photos');
 console.log('SCROLLED PHOTO LOADED');

 await p.setViewportSize({width:1920,height:941});
 await p.goto('http://127.0.0.1:3004/__visual-lab/students-account?chrome=0&workspace=1&appchrome=1',{waitUntil:'domcontentloaded',timeout:60000});await p.locator('.sidebar-nav').waitFor();
 await p.goto('http://127.0.0.1:3004/__visual-lab/control-escolar',{waitUntil:'domcontentloaded',timeout:60000});await p.locator('.ce-student-row').first().waitFor({timeout:60000});await p.waitForTimeout(1500);
 for(const [w,h] of [[1920,941],[1366,768],[1024,768],[900,640],[390,844],[1150,410]]) {
 await p.setViewportSize({width:w,height:h});await p.waitForTimeout(700);
 const m=await p.evaluate(()=>{const row=document.querySelector('.ce-student-row'),copy=row.querySelector('.student-copy'),r=copy.getBoundingClientRect(),s=getComputedStyle(row.querySelector('.student-identity')),box=document.querySelector('.student-list-scroll').getBoundingClientRect();return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,copyWidth:r.width,rowHeight:row.getBoundingClientRect().height,identityColumns:s.gridTemplateColumns,visibleRows:[...document.querySelectorAll('.ce-student-row')].filter(e=>{const r=e.getBoundingClientRect();return r.top>=box.top&&r.bottom<=box.bottom}).length,sigil:getComputedStyle(row.querySelector('.student-group-sigil')).display};});results.push(m);console.log('CONTROL',JSON.stringify(m));await p.screenshot({path:`${output}/${label}-control-${w}.png`,timeout:10000});
 if(m.copyWidth<90||m.overflow||m.visibleRows<({1920:4,1366:4,1024:5,900:3,390:1,1150:1})[w])throw Error('Control Escolar row layout gate failed');
 }
 const controlPhases=[];
 await p.locator('.ce-student-row .student-grade-photo-card.has-photo').first().waitFor();
 for(const time of [0,5500,8750])controlPhases.push(await p.locator('.ce-student-row .student-grade-photo-card.has-photo').first().evaluate((e,time)=>{
   for(const a of e.getAnimations({subtree:true})){a.pause();a.currentTime=time;}
   return {grade:getComputedStyle(e.querySelector('.student-grade-photo-card__grade')).opacity,photo:getComputedStyle(e.querySelector('.student-grade-photo-card__photo')).opacity};
 },time));
 if(controlPhases[0].grade!=='1'||controlPhases[1].photo!=='1'||controlPhases[2].grade!=='1')throw Error(`Control grade/photo cycle lost: ${JSON.stringify(controlPhases)}`);
 console.log('CONTROL GRADE/PHOTO CYCLE',controlPhases);
 await p.setViewportSize({width:1366,height:768});await p.locator('.sidebar-nav a[href="/control-escolar"]').click();await p.locator('.ce-student-row').first().waitFor();await p.locator('.ce-student-row').first().click();await p.locator('.ce-detail-shell').waitFor({state:'visible'});await p.waitForTimeout(500);await p.screenshot({path:`${output}/${label}-control-detail.png`,timeout:10000});
 for(const [w,h] of [[1920,1080],[1366,768],[1024,768],[900,640],[390,844],[1150,410]]) {
   await p.setViewportSize({width:w,height:h});await p.waitForTimeout(500);
   const detail=await p.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,bodyHeight:Math.max(0,Math.min(document.querySelector('.ce-detail-body').getBoundingClientRect().bottom,document.querySelector('.ce-detail-footer').getBoundingClientRect().top)-document.querySelector('.ce-detail-body').getBoundingClientRect().top),titleWeight:getComputedStyle(document.querySelector('.ce-student-hero-copy h2')).fontWeight,nameWeight:getComputedStyle(document.querySelector('.student-name')).fontWeight,tabs:[...document.querySelectorAll('.ce-detail-tabs button')].map(e=>e.textContent.trim())}));
   if(detail.overflow||detail.bodyHeight<120||Number(detail.titleWeight)>600){await p.screenshot({path:`${output}/failure-detail-${w}.png`});console.log('DETAIL GEOMETRY',await p.evaluate(()=>['.ce-detail-shell','.ce-student-hero-main','.ce-student-hero-side','.ce-student-hero-progress','.ce-detail-tabs','.ce-detail-footer'].map(sel=>{const e=document.querySelector(sel),r=e.getBoundingClientRect(),s=getComputedStyle(e);return{sel,width:r.width,height:r.height,gridRow:s.gridRow,gridColumns:s.gridTemplateColumns,minHeight:s.minHeight}})));throw Error(`Control detail gate failed: ${JSON.stringify(detail)}`);}
   if(w===1366) {
     const identityVisible=await p.evaluate(()=>{const footer=document.querySelector('.ce-detail-footer').getBoundingClientRect();return [...document.querySelectorAll('.ce-identity-panel input')].every(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.bottom<=footer.top;});});
     if(!identityVisible)throw Error('Default record view hides identity fields below the footer');
     console.log('DEFAULT IDENTITY FIELDS VISIBLE WITHOUT SCROLL');
   }
   console.log('CONTROL DETAIL',JSON.stringify(detail));results.push(detail);await p.screenshot({path:`${output}/control-detail-${w}.png`,timeout:10000});
 }
 // The section navigation and save/discard footer remain outside the scrolling record.
 const fixedNavigation=await p.evaluate(()=>{
   const tabs=document.querySelector('.ce-detail-tabs'),body=document.querySelector('.ce-detail-body');
   const top=tabs.getBoundingClientRect().top;body.scrollTop=body.scrollHeight;
   return {insideBody:body.contains(tabs),before:top,after:tabs.getBoundingClientRect().top,count:tabs.querySelectorAll('button').length};
 });
 if(fixedNavigation.insideBody||fixedNavigation.before!==fixedNavigation.after||fixedNavigation.count!==7)throw Error(`Record navigation regressed: ${JSON.stringify(fixedNavigation)}`);
 console.log('FIXED RECORD NAVIGATION',fixedNavigation);
 await p.setViewportSize({width:1366,height:768});
 const tabs=p.locator('.ce-detail-tabs button');
 for(let i=0;i<await tabs.count();i++) {
   await tabs.nth(i).click();await p.waitForTimeout(100);
   if(await p.locator('.ce-detail-body').evaluate(e=>e.scrollTop)>1)throw Error('Section switch retained the previous scroll position');
   if(await p.locator('.ce-tab-panel:visible').count()<1)throw Error(`Control tab ${i} has no visible content`);
   const clipped=await p.evaluate(()=>{const box=document.querySelector('.ce-detail-body').getBoundingClientRect();return [...document.querySelectorAll('.ce-tab-panel input,.ce-family-readiness-card')].filter(e=>e.getBoundingClientRect().height>0).filter(e=>{const r=e.getBoundingClientRect();return r.left<box.left-1||r.right>box.right+1}).map(e=>e.className);});
   if(clipped.length)throw Error(`Control tab ${i} clipped fields: ${JSON.stringify(clipped)}`);
   await p.screenshot({path:`${output}/control-tab-${i}.png`,timeout:10000});
 }
 await p.setViewportSize({width:390,height:844});
 for(let i=0;i<await tabs.count();i++) {
   await tabs.nth(i).click();await p.waitForTimeout(100);
   const invalidFields=await p.evaluate(()=>{const box=document.querySelector('.ce-detail-body').getBoundingClientRect();return [...document.querySelectorAll('.ce-tab-panel input,.ce-tab-panel select,.ce-tab-panel textarea')].filter(e=>e.getBoundingClientRect().height>1).filter(e=>{const r=e.getBoundingClientRect();return r.left<box.left-1||r.right>box.right+1||parseFloat(getComputedStyle(e).fontSize)<16}).map(e=>({className:e.className,font:getComputedStyle(e).fontSize}));});
   if(invalidFields.length)throw Error(`Mobile Control tab ${i} has clipped or undersized fields: ${JSON.stringify(invalidFields)}`);
 }
 console.log('MOBILE CONTROL TABS AND FIELD SIZES PASSED');
 await p.setViewportSize({width:1366,height:768});
 await tabs.nth(1).click();
 const nameInput=p.locator('[data-ce-field="nombres"] input');const originalName=await nameInput.inputValue();
 await nameInput.fill('Alumno Prueba Editado');
 const save=p.locator('.ce-detail-footer-actions .btn-primary');if(!await save.isEnabled())throw Error('Editing no longer enables save');
 if(await save.evaluate(e=>getComputedStyle(e).backgroundColor)!=='rgb(0, 105, 47)')throw Error('Control Escolar save fill differs from primary CTAs');
 await p.locator('.ce-detail-footer-actions .btn-secondary').click();if(await nameInput.inputValue()!==originalName||await save.isEnabled())throw Error('Discard did not restore the record');
 await p.setViewportSize({width:900,height:640});await p.locator('.ce-mobile-detail-back').click();await p.locator('.ce-student-row').first().waitFor({state:'visible'});await p.locator('.ce-student-row').first().click();await p.locator('.ce-detail-shell').waitFor({state:'visible'});
 console.log('CONTROL EDIT, DISCARD AND RETURN PASSED');
 if(requests.some(path=>path.includes('/save')))throw Error('Visual check unexpectedly submitted a record');
 await p.context().clearCookies();await p.goto('http://127.0.0.1:3004/login',{waitUntil:'domcontentloaded'});await p.locator('.brand-system-logo').waitFor();if(await p.locator('.brand-system-logo').getAttribute('src')!=='/brand/aurora-logo-institutional.svg')throw Error('Login logo regressed');await p.screenshot({path:`${output}/login.png`,timeout:10000});
 console.log('ERRORS',errors);console.log('ENDPOINTS',[...new Set(requests)]);writeFileSync(`${output}/${label}-control-results.json`,JSON.stringify({results,errors,requests},null,2));if(errors.length)throw Error(errors.join(';'));
} catch(e) { console.error(e.stack); process.exitCode=1; }
finally { if(b)await b.close();try{process.kill(-server.pid,'SIGTERM')}catch{}setTimeout(()=>process.exit(process.exitCode||0),1500); }
