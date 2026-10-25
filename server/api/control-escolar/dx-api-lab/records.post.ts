import { listControlEscolarPlanteles } from '../../../utils/control-escolar'
import { automaticSchoolCycleKey, normalizeCicloKey } from '../../../../shared/utils/ciclo'
import { integrationDiscovery, readIntegrationRoutes } from '../../../utils/dx-discovery'
import { summarizeIntegrationData, integrationRecords } from '../../../utils/dx-data'
import { canInspectRosterRoute, inspectIntegrationRoster, integrationAuthorizedPlanteles } from '../../../utils/dx-inspection'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const { planteles: authorized } = await listControlEscolarPlanteles(event)
  const input = await readBody(event)
  const raw = String(input?.ciclo || automaticSchoolCycleKey())
  if (!/^\d{4}(?:-\d{4})?$/.test(raw)) throw createError({ statusCode: 400, message: 'Ciclo inválido.' })
  const ciclo = normalizeCicloKey(raw)
  const allowed = integrationAuthorizedPlanteles(authorized.map(item => item.plantel))
  const requested = String(input?.plantel || '').toUpperCase()
  if (requested && !allowed.includes(requested)) throw createError({ statusCode: 403, message: 'Plantel fuera de alcance.' })
  const planteles = requested ? [requested] : allowed
  const routes = await readIntegrationRoutes()
  const route = routes.find(route => 'http:' + route.id === input?.source && canInspectRosterRoute(route))
  if (route) return { source: input.source, cycle: ciclo, ...await inspectIntegrationRoster(event, route, planteles, ciclo) }
  const { sources } = await summarizeIntegrationData(ciclo, planteles, integrationDiscovery().consumers, routes, true)
  const source = sources.find(source => source.id === input?.source)
  if (!source) throw createError({ statusCode: 404, message: 'La fuente no está disponible dentro de tu alcance.' })
  return { source: source.id, cycle: source.cycle, ...await integrationRecords(source, planteles, ciclo) }
})
