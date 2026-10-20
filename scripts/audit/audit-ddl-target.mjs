// Read DDL object positions, never table-like words in column definitions,
// indexes, foreign keys, strings or comments. No SQL is executed here.
const invalid=()=>{throw Object.assign(Error('AUDIT_SOURCE_DDL_TARGET_INVALID'),{code:'AUDIT_SOURCE_DDL_TARGET_INVALID'})}
const tokensOf=sql=>{
 const tokens=[]
 for(let i=0;i<sql.length;){
  const c=sql[i]
  if(/\s/.test(c)){i++;continue}
  if(c==='#'||(sql.slice(i,i+2)==='--'&&(/\s/.test(sql[i+2]||' ')))){const end=sql.indexOf('\n',i);i=end<0?sql.length:end+1;continue}
  if(sql.slice(i,i+2)==='/*'){
   const end=sql.indexOf('*/',i+2);if(end<0)invalid()
   if(sql[i+2]==='!')tokens.push(...tokensOf(sql.slice(i+3,end).replace(/^\d+\s*/,'')))
   i=end+2;continue
  }
  if(c==='`'||c==='"'||c==="'"){
   let value='',closed=false;i++
   while(i<sql.length){
    if(sql[i]===c){if(sql[i+1]===c){value+=c;i+=2;continue}i++;closed=true;break}
    if(sql[i]==='\\'&&c!=='`'){if(i+1>=sql.length)invalid();value+=sql[i+1];i+=2;continue}
    value+=sql[i++]
   }
   if(!closed)invalid()
   tokens.push({value,id:c!=="'",word:false});continue
  }
  const word=sql.slice(i).match(/^[\p{L}\p{N}_$]+/u)
  if(word){tokens.push({value:word[0],id:true,word:true});i+=word[0].length;continue}
  tokens.push({value:c,id:false,word:false});i++
 }
 return tokens
}
export function auditDdlTargets(sql,defaultDatabase){
 const tokens=tokensOf(sql);let at=0
 const is=word=>tokens[at]?.word&&tokens[at].value.toUpperCase()===word
 const take=word=>{if(is(word)){at++;return true}return false}
 const name=(unqualifiedSchema=defaultDatabase)=>{
  if(!tokens[at]?.id)invalid()
  const first=tokens[at++].value
  if(tokens[at]?.value!=='.')return {schema:unqualifiedSchema,table:first}
  at++;if(!tokens[at]?.id)invalid()
  return {schema:first,table:tokens[at++].value}
 }
 const command=tokens[at]?.word?tokens[at++].value.toUpperCase():''
 if(command==='CREATE'){
  take('TEMPORARY')
  if(!take('TABLE'))return []
  if(take('IF')){if(!take('NOT')||!take('EXISTS'))invalid()}
  return [name()]
 }
 if(command==='ALTER'){
  if(!take('TABLE'))return []
  const names=[name()]
  while(at<tokens.length){
   if(take('RENAME')){
    if(['COLUMN','INDEX','KEY'].some(word=>is(word)))continue
    take('TO')||take('AS');names.push(name(names[0].schema))
   }else at++
  }
  return names
 }
 if(command==='TRUNCATE'){take('TABLE');return [name()]}
 if(command==='DROP'){
  take('TEMPORARY');if(!take('TABLE'))return []
  if(take('IF')&&!take('EXISTS'))invalid()
  const names=[name()]
  while(tokens[at]?.value===','){at++;names.push(name())}
  return names
 }
 if(command==='RENAME'){
  if(!take('TABLE'))return []
  const names=[]
  do{
   if(names.length)at++
   names.push(name());if(!take('TO'))invalid();names.push(name())
  }while(tokens[at]?.value===',')
  return names
 }
 return []
}
export const affectsAuditTable=(sql,database,schema)=>auditDdlTargets(sql,database).some(target=>target.schema===schema&&target.table.toLowerCase()==='matricula')
// Previous checkpoints used a word search and may contain false boundaries.
export const AUDIT_SCHEMA_GUARD_VERSION=2
