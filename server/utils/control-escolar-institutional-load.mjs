/**
 * Campus failures are isolated: a missing bridge or verified snapshot must not
 * block an institution-wide report. Keep catalog order and bounded concurrency.
 * An unavailable campus always has rows=null, never an empty array.
 */
export const loadInstitutionalControlEscolarScopes = async ({
  planteles, read, onUnavailable = () => {}, batchSize = 3,
}) => {
  const scopes = []
  for (let offset = 0; offset < planteles.length; offset += batchSize) {
    const batch = planteles.slice(offset, offset + batchSize)
    const loaded = await Promise.all(batch.map(async (plantel) => {
      try {
        const result = await read(plantel)
        if (!result || !Array.isArray(result.rows)) throw new Error('Invalid campus rows')
        return { ...result, plantel }
      } catch (error) {
        onUnavailable(plantel, error)
        return { plantel, rows: null, dataStatus: 'unavailable', snapshotAt: null }
      }
    }))
    scopes.push(...loaded)
  }
  return scopes
}
