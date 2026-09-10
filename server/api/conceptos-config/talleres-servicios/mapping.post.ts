import { normalizeCicloKey } from '../../../../shared/utils/ciclo'
import { canonicalTallerKey, normalizeServicioClave } from '../../../../shared/utils/talleresServicios'
import { resolveDataBridgeAgentId } from '../../../utils/auth-session'
import { createOrUpdateMapping, readCentralConceptos, requireConceptosAdmin } from '../../../utils/conceptos-config'
import { runWithBridgeAgentId } from '../../../utils/db'
import { readAuthoritativeTalleresCatalog } from '../../../utils/talleres-catalog-authority'

const clean = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max)

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')
  const user = await requireConceptosAdmin(event)
  const body = await readBody(event)
  const ciclo = normalizeCicloKey(body?.ciclo)
  const conceptoId = Number(body?.concepto_id || 0)
  const requestedKey = canonicalTallerKey(body?.servicio_clave || body?.servicio_nombre)

  if (!conceptoId) throw createError({ statusCode: 400, message: 'Selecciona un concepto financiero.' })
  if (!requestedKey) throw createError({ statusCode: 400, message: 'Selecciona un taller o servicio.' })

  const [conceptos, catalogResult] = await Promise.all([
    readCentralConceptos(),
    readAuthoritativeTalleresCatalog(),
  ])
  const concepto = conceptos.find((row: any) =>
    Number(row?.id || 0) === conceptoId
      && normalizeCicloKey(row?.ciclo_escolar || row?.ciclo || '') === ciclo
  )
  if (!concepto) throw createError({ statusCode: 404, message: 'El concepto no pertenece al ciclo seleccionado.' })

  const service = (catalogResult.catalog || []).find((item: any) =>
    Number(item?.activo ?? 1) !== 0
      && canonicalTallerKey(item?.servicio_clave || item?.servicio_nombre) === requestedKey
  )
  if (!service) throw createError({ statusCode: 400, message: 'El taller o servicio ya no está activo en el catálogo.' })

  const bridgeAgentId = resolveDataBridgeAgentId(event, user)
  const result = await runWithBridgeAgentId(bridgeAgentId, async () => await createOrUpdateMapping({
    ciclo,
    plantel: 'GLOBAL',
    tipo: 'talleres_servicios',
    concepto_id: conceptoId,
    concepto_nombre: clean(concepto?.concepto),
    servicio_clave: normalizeServicioClave(service?.servicio_clave || service?.servicio_nombre),
    servicio_nombre: clean(service?.servicio_nombre, 160),
    meses: [],
  }, user))

  return {
    ...result,
    scope: 'GLOBAL',
    concepto_id: conceptoId,
    servicio_clave: normalizeServicioClave(service?.servicio_clave || service?.servicio_nombre),
    servicio_nombre: clean(service?.servicio_nombre, 160),
  }
})
