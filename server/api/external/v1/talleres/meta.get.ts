import { assertTalleresPortalAccess } from '../../../../utils/talleres-portal-auth'
import { readTalleresSnapshotMeta } from '../../../../utils/talleres-snapshot'
import { readAuthoritativeTalleresCatalog } from '../../../../utils/talleres-catalog-authority'

/**
 * SNAPSHOT CONTRACT — PUBLIC API STAYS v1
 *
 * A snapshot is a precomputed ready-to-serve payload whose only purpose is fast
 * reads. It is never permission to serve stale business data. Aurora-managed
 * mutations must rebuild/invalidate affected snapshots before reporting current
 * success. If current data cannot be verified, snapshot-backed readers fail
 * rather than knowingly returning old data.
 *
 * Internal snapshot/view identifiers are implementation details and MUST NOT be
 * exposed as /v2, /v3, etc. Consumers remain on /api/external/v1.
 */
export default defineEventHandler(async (event) => {
  await assertTalleresPortalAccess(event)
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')
  const query = getQuery(event)
  const [meta, authoritative] = await Promise.all([
    readTalleresSnapshotMeta(query.ciclo),
    readAuthoritativeTalleresCatalog(),
  ])
  const catalog = authoritative.catalog.map((item: any) => ({
    clave: item.clave,
    nombre: item.nombre,
    imagen: item.imagen,
    activo: true,
    orden: item.orden,
    tipo: item.tipo,
  }))
  return {
    ...meta,
    catalog,
    // Backwards-compatible v1 fields. New consumers should use catalog.
    talleres: catalog.filter((item: any) => item.tipo === 'taller'),
    servicios: catalog.filter((item: any) => item.tipo === 'servicio'),
    catalogSource: 'aurora-central',
  }
})
