import test from 'node:test'
import assert from 'node:assert/strict'
import { restoreAuroraStudentBaja } from '../server/utils/student-baja-restore.ts'

const fixture = ({ base = { matricula:'PM100', plantel:'PMA', estatus:'Baja' }, central = {matricula:'PM100',plantel:'PMA',baja:1,motivo_baja:'Cambio',categoria_baja:'Familia',seguimiento_baja:'Nota'}, failBridge=false, failCompensation=false, campus=['PMA'] }={}) => {
  const updates = []
  let bridgeCalls=0
  const options = {
    matricula:'PM100',planteles:campus,requireBase:true,
    queryBase: async (sql, params) => {
      bridgeCalls++
      if (sql.startsWith('SELECT')) return base ? [base] : []
      if (failBridge) throw new Error('Bridge write unavailable')
      updates.push({table:'base',sql,params})
      return {affectedRows:1}
    },
    queryCentral: async (sql, params) => { updates.push({table:'central-read',sql,params}); return central ? [central] : [] },
    updateCentral: async (key, patch) => {
      updates.push({table:'central-write',key,patch})
      if (failCompensation && patch.baja===1) throw new Error('Central rollback unavailable')
    },
  }
  return {options,updates,get bridgeCalls(){return bridgeCalls}}
}

test('reverses withdrawal in both Aurora data sources and clears only withdrawal metadata',async()=>{
  const f=fixture()
  const result=await restoreAuroraStudentBaja(f.options)
  assert.equal(result.success,true)
  assert.equal(result.restoredCentral,true)
  assert.equal(result.restoredBase,true)
  assert.deepEqual(f.updates.filter(x=>x.table==='central-write').map(x=>x.patch),[{baja:0,motivoBaja:null,categoriaBaja:null,seguimientoBaja:null}])
  assert.match(f.updates.find(x=>x.table==='base').sql,/UPDATE base SET estatus = 'Activo'/)
  assert.doesNotMatch(f.updates.find(x=>x.table==='base').sql,/SET[^\n]*ciclo|documentos|pagos/)
})

test('if central baja was the only withdrawal, bridge status stays untouched',async()=>{
  const f=fixture({base:{matricula:'PM100',plantel:'PMA',estatus:'Activo'}})
  const result=await restoreAuroraStudentBaja(f.options)
  assert.equal(result.restoredBase,false)
  assert.equal(result.restoredCentral,true)
  assert.equal(f.updates.filter(x=>x.table==='base').length,0)
})

test('if Bridge baja was the only withdrawal, central data is not overwritten',async()=>{
  const f=fixture({central:{matricula:'PM100',plantel:'PMA',baja:0,motivo_baja:null,categoria_baja:null,seguimiento_baja:null}})
  const result=await restoreAuroraStudentBaja(f.options)
  assert.equal(result.restoredCentral,false)
  assert.equal(f.updates.filter(x=>x.table==='central-write').length,0)
})

test('central read failures do not cause a partial Bridge write',async()=>{
  const f=fixture()
  f.options.queryCentral=async()=>{throw new Error('Central unavailable')}
  await assert.rejects(restoreAuroraStudentBaja(f.options),/Central unavailable/)
  assert.equal(f.updates.filter(x=>x.table==='base').length,0)
})

test('central edits are compensated when the Bridge write fails',async()=>{
  const f=fixture({failBridge:true})
  await assert.rejects(restoreAuroraStudentBaja(f.options),/Bridge write unavailable/)
  assert.deepEqual(f.updates.filter(x=>x.table==='central-write').map(x=>x.patch.baja),[0,1])
})

test('failed compensation is not reported as success',async()=>{
  const f=fixture({failBridge:true,failCompensation:true})
  let logged=false
  await assert.rejects(restoreAuroraStudentBaja({...f.options,onCompensationFailure:()=>{logged=true}}),/no se pudo revertir por completo/)
  assert.equal(logged,true)
})

test('no central row is not created; legacy Alumnos base is still restored',async()=>{
  const f=fixture({central:null})
  const result=await restoreAuroraStudentBaja(f.options)
  assert.equal(result.restoredBase,true)
  assert.equal(f.updates.filter(x=>x.table==='central-write').length,0)
})

test('Control Escolar-only student can restore central withdrawal without creating a Bridge row',async()=>{
  const f=fixture({base:null})
  const result=await restoreAuroraStudentBaja({...f.options,requireBase:false})
  assert.equal(result.success,true)
  assert.equal(result.restoredBase,false)
  assert.equal(result.restoredCentral,true)
})

test('Control Escolar-only cannot restore a central record from another campus',async()=>{
  const f=fixture({base:null,central:{matricula:'PM100',plantel:'ST',baja:1}})
  await assert.rejects(restoreAuroraStudentBaja({...f.options,requireBase:false}),/no pertenece al plantel/)
  assert.equal(f.updates.filter(x=>x.table==='central-write').length,0)
})

test('no records found rejects; no mutation happens',async()=>{
  const f=fixture({base:null,central:null})
  await assert.rejects(restoreAuroraStudentBaja({...f.options,requireBase:false}),/no encontrado/)
  assert.equal(f.updates.filter(x=>x.table.includes('write')||x.table==='base').length,0)
})

test('empty campus authorization fails closed',async()=>{
  const f=fixture({campus:[]})
  await assert.rejects(restoreAuroraStudentBaja(f.options),/plantel autorizado/)
  assert.equal(f.bridgeCalls,0)
})
