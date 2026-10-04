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
const deadline=setTimeout(()=>{console.error('UI verification exceeded eight minutes');try{process.kill(-server.pid,'SIGTERM')}catch{}process.exit(1)},480000);deadline.unref();
try {
 b=await chromium.launch({headless:true,...(process.env.VISUAL_BROWSER_EXECUTABLE ? {executablePath:process.env.VISUAL_BROWSER_EXECUTABLE,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader']} : {})});
 const p=await b.newPage();
 const fontCss=['montserrat','fredoka'].flatMap(family=>[500,600,700].map(weight=>{
 const file=`${family}/files/${family}-latin-${weight}-normal.woff2`;
 const path=process.env.VISUAL_FONT_MODULES ? `${process.env.VISUAL_FONT_MODULES}/@fontsource/${file}` : require.resolve(`@fontsource/${file}`);
 return `@font-face{font-family:'${family==='montserrat'?'Montserrat':'Fredoka'}';font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${readFileSync(path).toString('base64')}) format('woff2');}`;
 })).join('');
 await p.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:fontCss}));
 const data=Array.from({length:48},(_,i)=>({matricula:`VIS${String(i).padStart(3,'0')}`,fullName:i===0?'Alumno Prueba Apellido Largo Completo':`Alumno Prueba ${i+1} Apellido`,nombreCompleto:`Alumno Prueba ${i+1} Apellido`,nombreCompletoAlumno:`Alumno Prueba ${i+1} Apellido`,nombres:'Alumno Prueba',apellidoPaterno:'Apellido',apellidoMaterno:'Completo',status:'Activo',estatus:'Activo',enrollmentState:'inscrito',tipoIngresoValue:i%3?'interno':'externo',overlayExists:true,nivel:'primaria',grado:['primero','segundo','tercero','cuarto','quinto','sexto'][i%6],group:['AFRICA','AMERICA','ASIA','EUROPA'][i%4],grupo:['AFRICA','AMERICA','ASIA','EUROPA'][i%4],sexo:'Masculino',curp:'VISUAL000000HMCXXX00',nombrePadre:'Padre Prueba',telefonoPadre:'7220000000',emailPadre:'visual@example.invalid',nombreMadre:'Madre Prueba',telefonoMadre:'7220000001',emailMadre:'visual2@example.invalid',missingFields:[],missingBasicFields:[],recordCompleteness:100}));
 const kpis={inscritos:48,internos:32,externos:16,noInscritos:0,bajas:0};
 const requests=[];
 await p.route('http://127.0.0.1:3004/api/**',route=>{const u=new URL(route.request().url());requests.push(u.pathname);let body={};let status=200;
 if(u.pathname==='/api/control-escolar/options')body={activePlantel:'PT',planteles:[{id:'PT',nombre:'Primaria Toluca'}],access:{controlEscolar:true,financial:true,superAdmin:true}};
 else if(u.pathname==='/api/control-escolar/students')body={data,kpis,catalogs:{niveles:['primaria'],grados:['primero','segundo','tercero','cuarto','quinto','sexto'],grupos:['AFRICA','AMERICA','ASIA','EUROPA'],gruposPorGrado:{}},source:{base:'synthetic-visual-fixture',overlayRows:48}};
 else if(u.pathname==='/api/control-escolar/kpis')body={kpis};
 else if(u.pathname==='/api/control-escolar/enrollment-config')body={};
 else if(u.pathname==='/api/auth/session')body={email:'visual@example.invalid',role:'superadmin,role_ctrl',planteles:['PT','SM'],activePlantel:'PT',hasFinancialAccess:true,hasControlEscolarRole:true,isSuperAdmin:true};
 else if(u.pathname==='/api/login/updates')body={ok:true,versionLabel:'visual',totalCount:48,lastUpdatedLabel:'Synthetic fixture',updates:[]};
 else if(u.pathname.endsWith('/photo'))body={photoUrl:''};
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
 await p.setViewportSize({width:1366,height:768});
 await p.goto('http://127.0.0.1:3004/__visual-lab/students-account?chrome=0&workspace=1&appchrome=1',{waitUntil:'domcontentloaded'});
 await p.locator('.student-account-photo-card.has-photo').waitFor();await p.locator('.student-account-photo-card').hover();await p.locator('.student-account-photo-preview').waitFor({state:'visible'});await p.mouse.move(1000,500);await p.locator('.student-account-photo-preview').waitFor({state:'hidden'});
 const photo = p.locator('.student-grade-photo-card.has-photo .student-grade-photo-card__photo').first();
 if(!await photo.evaluate(e=>getComputedStyle(e).animationName.includes('photo-slide')))throw Error('Original grade/photo animation missing');
 await p.emulateMedia({reducedMotion:'reduce'});
 const reduced=await p.evaluate(()=>({photo:getComputedStyle(document.querySelector('.student-grade-photo-card.has-photo .student-grade-photo-card__photo')).opacity,animation:getComputedStyle(document.querySelector('.income-sidebar')).animationName}));
 if(reduced.photo!=='1'||reduced.animation!=='none')throw Error('Reduced-motion gate failed');await p.emulateMedia({reducedMotion:'no-preference'});
 const identity=await p.evaluate(()=>({logo:document.querySelector('.sidebar-logo').getAttribute('src'),aurora:document.querySelector('.sidebar-system-logo').getAttribute('src'),pattern:getComputedStyle(document.querySelector('.sidebar-sheen')).backgroundImage,animation:getComputedStyle(document.querySelector('.income-sidebar')).animationDuration}));
 if(identity.logo!=='/brand/institutional-logo.webp'||identity.aurora!=='/brand/aurora-logo-v2.webp'||!identity.pattern.includes('institutional-pattern')||identity.animation!=='72s')throw Error('Institutional identity gate failed');console.log('IDENTITY',identity);
 const positions=[];
 for(const [phase,time] of [['green',0],['blue',72000]]) {
 await p.evaluate(time=>{for(const animation of document.querySelector('.income-sidebar').getAnimations()){animation.pause();animation.currentTime=time;}for(const e of document.querySelectorAll('.student-grade-photo-card.has-photo'))for(const animation of e.getAnimations({subtree:true})){animation.pause();animation.currentTime=5500;}},time);
 positions.push(await p.locator('.income-sidebar').evaluate(e=>getComputedStyle(e).backgroundPosition));await p.screenshot({path:`${output}/identity-${phase}.png`,timeout:10000});
 }
 if(positions[0]===positions[1])throw Error('Aurora color drift did not advance');console.log('AURORA PHASES',positions);


 await p.setViewportSize({width:1920,height:941});
 await p.goto('http://127.0.0.1:3004/__visual-lab/students-account?chrome=0&workspace=1&appchrome=1',{waitUntil:'domcontentloaded',timeout:60000});await p.locator('.sidebar-nav').waitFor();
 await p.goto('http://127.0.0.1:3004/__visual-lab/control-escolar',{waitUntil:'domcontentloaded',timeout:60000});await p.locator('.ce-student-row').first().waitFor({timeout:60000});await p.waitForTimeout(1500);
 for(const [w,h] of [[1920,941],[1366,768],[1024,768],[900,640],[390,844],[1150,410]]) {
 await p.setViewportSize({width:w,height:h});await p.waitForTimeout(700);
 const m=await p.evaluate(()=>{const row=document.querySelector('.ce-student-row'),copy=row.querySelector('.student-copy'),r=copy.getBoundingClientRect(),s=getComputedStyle(row.querySelector('.student-identity')),box=document.querySelector('.student-list-scroll').getBoundingClientRect();return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,copyWidth:r.width,rowHeight:row.getBoundingClientRect().height,identityColumns:s.gridTemplateColumns,visibleRows:[...document.querySelectorAll('.ce-student-row')].filter(e=>{const r=e.getBoundingClientRect();return r.top>=box.top&&r.bottom<=box.bottom}).length,sigil:getComputedStyle(row.querySelector('.student-group-sigil')).display};});results.push(m);console.log('CONTROL',JSON.stringify(m));await p.screenshot({path:`${output}/${label}-control-${w}.png`,timeout:10000});
 if(m.copyWidth<90||m.overflow||(h===410&&m.visibleRows<1))throw Error('Control Escolar row layout gate failed');
 }
 await p.setViewportSize({width:1366,height:768});await p.locator('.sidebar-nav a[href="/control-escolar"]').click();await p.locator('.ce-student-row').first().waitFor();await p.locator('.ce-student-row').first().click();await p.locator('.ce-detail-shell').waitFor({state:'visible'});await p.waitForTimeout(500);await p.screenshot({path:`${output}/${label}-control-detail.png`,timeout:10000});
 console.log('CONTROL DETAIL',await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,header:document.querySelector('.ce-student-hero-copy h2')?.innerText})));
 await p.context().clearCookies();await p.goto('http://127.0.0.1:3004/login',{waitUntil:'domcontentloaded'});await p.locator('.brand-system-logo').waitFor();if(await p.locator('.brand-system-logo').getAttribute('src')!=='/brand/aurora-logo-v2.webp')throw Error('Login logo regressed');await p.screenshot({path:`${output}/login.png`,timeout:10000});
 console.log('ERRORS',errors);console.log('ENDPOINTS',[...new Set(requests)]);writeFileSync(`${output}/${label}-control-results.json`,JSON.stringify({results,errors,requests},null,2));if(errors.length)throw Error(errors.join(';'));
} catch(e) { console.error(e.stack); process.exitCode=1; }
finally { if(b)await b.close();try{process.kill(-server.pid,'SIGTERM')}catch{}setTimeout(()=>process.exit(process.exitCode||0),1500); }
