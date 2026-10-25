import { listControlEscolarPlanteles } from '../../../utils/control-escolar'
import { automaticSchoolCycleKey, normalizeCicloKey } from '../../../../shared/utils/ciclo'
import { integrationDiscovery, readIntegrationRoutes } from '../../../utils/dx-discovery'
import { summarizeIntegrationData } from '../../../utils/dx-data'
import { readIntegrationUse } from '../../../utils/dx-usage'
import { canInspectRosterRoute, integrationAuthorizedPlanteles, integrationPlantelAliases } from '../../../utils/dx-inspection'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const { user, planteles: authorized } = await listControlEscolarPlanteles(event)
  const input = await readBody(event)
  const rawCycle = String(input?.ciclo || automaticSchoolCycleKey())
  if (!/^\d{4}(?:-\d{4})?$/.test(rawCycle)) throw createError({ statusCode: 400, message: 'Ciclo inválido.' })
  const ciclo = normalizeCicloKey(rawCycle)
  const planteles = integrationAuthorizedPlanteles(authorized.map(item => item.plantel))
  const discovery = integrationDiscovery()
  const routes = await readIntegrationRoutes()
  const [data, usage] = await Promise.all([
    summarizeIntegrationData(ciclo, planteles, discovery.consumers, routes, input?.force === true),
    readIntegrationUse(user.isSuperAdmin ? [...planteles, 'GLOBAL'] : planteles)
  ])
  for (const route of routes) {
    const records = usage.records.filter(record => record.routeId === route.id && !record.probe && (!record.ciclo || normalizeCicloKey(record.ciclo) === ciclo))
    const readable = canInspectRosterRoute(route)
    if (!records.length && !readable) continue
    const campuses: Record<string, any> = {}
    for (const record of records.sort((a, b) => b.at.localeCompare(a.at))) {
      if (record.status >= 200 && record.status < 300 && record.stats && !campuses[record.plantel]) campuses[record.plantel] = { ...record.stats, observedAt: record.at, source: record.source, generatedAt: record.snapshotAt, partial: record.partial }
    }
    data.sources.push({ id: 'http:' + route.id, kind: records.length ? 'http-response' : 'http-live', readable, label: route.path, routeIds: [route.id], owners: [], cycle: ciclo, campuses, records })
  }
  return { ciclo, planteles, plantelAliases: integrationPlantelAliases(planteles), measuredAt: data.measuredAt, discovery, routes, sources: data.sources, dataErrors: data.errors, usage }
})
