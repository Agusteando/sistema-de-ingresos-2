import { isLocalSystemRuntime } from '../utils/local-system-manager'
import { getControlEscolarCentralDb } from '../utils/control-escolar-central'
import { startActivitySnapshots } from '../observatory/runtime.mjs'
import { app, source, kinds, activityQuery } from '../observatory/source.mjs'
import { source as financeSource, kinds as financeKinds, activityQuery as financeQuery } from '../observatory/financial-last-login.mjs'

export default defineNitroPlugin(nitro => {
  // Remote observatory data belongs to Aurora central, not the offline workstation.
  if (isLocalSystemRuntime()) return
  const stop = startActivitySnapshots({
    app, source, kinds,
    read: async window => {
      const [rows] = await getControlEscolarCentralDb().query(activityQuery(window))
      return rows
    }
  })
  const stopFinance = startActivitySnapshots({
    app, source: financeSource, kinds: financeKinds,
    read: async window => {
      const [rows] = await getControlEscolarCentralDb().query(financeQuery(window))
      return rows
    }
  })
  nitro.hooks.hook('close', () => { stop(); stopFinance() })
})

