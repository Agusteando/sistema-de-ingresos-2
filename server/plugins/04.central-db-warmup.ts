import { controlEscolarCentralQuery, warmControlEscolarCentralDb } from '../utils/control-escolar-central'

export default defineNitroPlugin(async () => {
  const startedAt = Date.now()
  try {
    const warm = await warmControlEscolarCentralDb(6)
    const rows = await controlEscolarCentralQuery<any[]>(`
      SELECT COUNT(*) AS total
      FROM conceptos
      WHERE concepto IS NOT NULL AND TRIM(concepto) <> ''
    `)

    console.info('[control-escolar-central] startup ready', {
      connections: warm.connections,
      totalConceptos: Number(rows?.[0]?.total || 0),
      durationMs: Date.now() - startedAt
    })
  } catch (error: any) {
    console.error('[control-escolar-central] startup failed', {
      code: String(error?.code || ''),
      message: String(error?.message || 'No se pudo verificar la base central.').slice(0, 300),
      durationMs: Date.now() - startedAt
    })
  }
})
