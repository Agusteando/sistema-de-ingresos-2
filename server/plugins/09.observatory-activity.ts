import { getControlEscolarCentralDb } from '../utils/control-escolar-central'
import { startActivitySnapshots } from '../observatory/runtime.mjs'
import { app, source, kinds, activityQuery } from '../observatory/source.mjs'

export default defineNitroPlugin(nitro => {
  const stop = startActivitySnapshots({
    app, source, kinds,
    read: async window => {
      const [rows] = await getControlEscolarCentralDb().query(activityQuery(window))
      return rows
    }
  })
  nitro.hooks.hook('close', stop)
})

