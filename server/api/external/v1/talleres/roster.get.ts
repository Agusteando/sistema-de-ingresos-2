import { assertTalleresPortalAccess } from '../../../../utils/talleres-portal-auth'
import { readTalleresSnapshotRoster } from '../../../../utils/talleres-snapshot'
import { readCompleteTalleresExternalCatalog } from '../../../../utils/talleres-external-catalog'

export default defineEventHandler(async (event) => {
  await assertTalleresPortalAccess(event)
  const [snapshot, completeCatalog] = await Promise.all([
    readTalleresSnapshotRoster(getQuery(event)),
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
