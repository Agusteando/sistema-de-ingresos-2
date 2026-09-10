import { assertTalleresPortalAccess } from '../../../../utils/talleres-portal-auth'
import { readTalleresSnapshotMeta } from '../../../../utils/talleres-snapshot'
import { readCompleteTalleresExternalCatalog } from '../../../../utils/talleres-external-catalog'

export default defineEventHandler(async (event) => {
  await assertTalleresPortalAccess(event)
  const query = getQuery(event)
  const [snapshot, completeCatalog] = await Promise.all([
    readTalleresSnapshotMeta(query.ciclo),
    readCompleteTalleresExternalCatalog(),
  ])
  return {
    ...snapshot,
    catalog: completeCatalog.catalog,
    talleres: completeCatalog.talleres,
    servicios: completeCatalog.servicios,
    catalogSource: completeCatalog.source,
  }
})
