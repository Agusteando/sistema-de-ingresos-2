import { assertTalleresPortalAccess } from '../../../../utils/talleres-portal-auth'
import { readTalleresSnapshotMeta } from '../../../../utils/talleres-snapshot'
import { readAuthoritativeTalleresCatalog } from '../../../../utils/talleres-catalog-authority'

export default defineEventHandler(async (event) => {
  await assertTalleresPortalAccess(event)
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
    talleres: catalog.filter((item: any) => item.tipo === 'taller'),
    servicios: catalog.filter((item: any) => item.tipo === 'servicio'),
    catalogSource: 'aurora-central',
  }
})
