import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createContext,runInContext} from 'node:vm'
import ts from 'typescript'
const source=readFileSync(new URL('../server/utils/audit-actor-profile.ts',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace(/export /g,'')
function setup(){
 const ctx=createContext({URL,console,controlEscolarCentralQuery:async sql=>sql.startsWith('SHOW')?['email','displayName','picture','avatar'].map(Field=>({Field})):[{email:'erika@casitaiedis.edu.mx',person_name:'Erika Ramos',photo_0:'https://lh3.googleusercontent.com/a/profile',photo_1:''}],
 isCasitaWorkspaceEmail:v=>v.endsWith('@casitaiedis.edu.mx'),buildWorkspacePhotoUrl:email=>'/api/directory/photo?email='+encodeURIComponent(email)})
 runInContext(ts.transpile(source,{target:ts.ScriptTarget.ES2022})+'\nglobalThis.api={cleanAuditAvatar,loadAuditStaffProfiles}',ctx)
 return ctx.api
}
test('retains the same stored Google portrait as Usuarios, rather than rejecting or replacing it',async()=>{
 const s=setup(),profiles=await s.loadAuditStaffProfiles(['ERIKA@casitaiedis.edu.mx'])
 assert.equal(profiles.get('erika@casitaiedis.edu.mx').avatar,'https://lh3.googleusercontent.com/a/profile')
 assert.equal(profiles.get('erika@casitaiedis.edu.mx').name,'Erika Ramos')
})
test('unknown staff photo uses existing authenticated directory endpoint; family accounts are not looked up',async()=>{
 const profiles=await setup().loadAuditStaffProfiles(['other@casitaiedis.edu.mx','PM0637'])
 assert.equal(profiles.get('other@casitaiedis.edu.mx').avatar,'/api/directory/photo?email=other%40casitaiedis.edu.mx')
 assert.equal(profiles.has('PM0637'),false)
})
test('rejects untrusted, insecure and disguised image hosts',()=>{
 const {cleanAuditAvatar}=setup()
 for(const v of ['http://lh3.googleusercontent.com/a','https://googleusercontent.com.attacker.invalid/a','javascript:alert(1)','//attacker.invalid/a'])assert.equal(cleanAuditAvatar(v),'')
})
