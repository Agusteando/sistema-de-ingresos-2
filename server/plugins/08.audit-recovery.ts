import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'

export default defineNitroPlugin(nitro=>{
  if(process.env.NODE_ENV!=='production')return
  let worker:any
  let closed=false
  // Keep the trusted reader/worker outside the web bundle, owned and packaged
  // by Aurora itself. Missing capability never prevents ordinary app startup.
  const moduleUrl=pathToFileURL(resolve('scripts/audit-recovery-worker.mjs')).href
  void import(/* @vite-ignore */ moduleUrl).then(async module=>{
    if(closed)return
    worker=module.startAuditRecovery()
  }).catch(error=>console.warn('[audit-recovery]',{code:'AUDIT_WORKER_START_FAILED',cause:String(error?.code||'')}))
  nitro.hooks.hook('close',async()=>{closed=true;await worker?.stop()})
})
