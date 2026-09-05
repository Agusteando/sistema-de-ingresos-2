import { normalizeCicloKey } from '../../../shared/utils/ciclo'
import { canonicalTallerKey, isFinalTaller, normalizeServicioClave } from '../../../shared/utils/talleresServicios'
import { readCentralConceptos, readCentralConceptosConfig, requireConceptosAdmin } from '../../utils/conceptos-config'
import { buildWorkshopSeedPreview, resolveFinancialConceptTallerServicio } from '../../utils/conceptos-workshop-seed'
import { readBestTalleresServiciosCatalog } from '../../utils/talleres-servicios'

const clean = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max)
const active = (value: unknown) => value === undefined || value === null || Number(value) !== 0

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  await requireConceptosAdmin(event)

  const query = getQuery(event)
  const ciclo = normalizeCicloKey(query.ciclo)
  const [conceptos, config, catalogResult] = await Promise.all([
    readCentralConceptos(),
    readCentralConceptosConfig(),
    readBestTalleresServiciosCatalog(),
  ])

  const cycleConcepts = conceptos
    .filter((concepto: any) => normalizeCicloKey(concepto?.ciclo_escolar || concepto?.ciclo || '') === ciclo)
    .sort((left: any, right: any) => clean(left?.concepto).localeCompare(clean(right?.concepto), 'es', { sensitivity: 'base' }))

  const cycleMappings = config.mappings.filter((row: any) =>
    normalizeCicloKey(row?.cycle_name) === ciclo
      && clean(row?.enrollment_type, 80).toLowerCase() === 'talleres_servicios'
      && active(row?.activo)
  )

  const byConcept = new Map<number, any[]>()
  for (const row of cycleMappings) {
    const id = Number(row?.concepto_id || 0)
    if (!id) continue
    const current = byConcept.get(id) || []
    current.push(row)
    current.sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))
    byConcept.set(id, current)
  }

  const rows = cycleConcepts.map((concepto: any) => {
    const conceptoId = Number(concepto?.id || 0)
    const mappings = byConcept.get(conceptoId) || []
    const global = mappings.find((row: any) => clean(row?.plantel, 40).toUpperCase() === 'GLOBAL') || null
    const overrides = mappings.filter((row: any) => clean(row?.plantel, 40).toUpperCase() !== 'GLOBAL')
    const suggestion = resolveFinancialConceptTallerServicio(concepto?.concepto)

    return {
      concepto_id: conceptoId,
      concepto_nombre: clean(concepto?.concepto),
      costo: Number(concepto?.costo ?? concepto?.montoFinal ?? 0),
      suggestion,
      global: global ? {
        id: Number(global.id || 0),
        servicio_clave: normalizeServicioClave(global.servicio_clave || global.servicio_nombre),
        servicio_nombre: clean(global.servicio_nombre),
      } : null,
      overrides: overrides.map((row: any) => ({
        id: Number(row.id || 0),
        plantel: clean(row.plantel, 40).toUpperCase(),
        servicio_clave: normalizeServicioClave(row.servicio_clave || row.servicio_nombre),
        servicio_nombre: clean(row.servicio_nombre),
      })),
      relevant: Boolean(suggestion || global || overrides.length),
    }
  })

  const catalog = (catalogResult.catalog || [])
    .filter((item: any) => active(item?.activo))
    .map((item: any) => {
      const clave = canonicalTallerKey(item?.servicio_clave || item?.servicio_nombre)
      return {
        clave,
        nombre: clean(item?.servicio_nombre),
        imagen: clean(item?.imagen_url, 500),
        orden: Number(item?.orden || 9999),
        tipo: isFinalTaller(clave) ? 'taller' : 'servicio',
      }
    })
    .filter((item: any, index: number, items: any[]) => item.clave && items.findIndex((candidate: any) => candidate.clave === item.clave) === index)
    .sort((left: any, right: any) => left.tipo.localeCompare(right.tipo) || left.orden - right.orden || left.nombre.localeCompare(right.nombre, 'es'))

  return {
    ok: true,
    ciclo,
    cycles: config.cycles,
    catalog,
    rows,
    preview: buildWorkshopSeedPreview({ conceptos, mappings: config.mappings, ciclo }),
    totals: {
      conceptos: rows.length,
      relevantes: rows.filter((row: any) => row.relevant).length,
      asociadosGlobalmente: rows.filter((row: any) => row.global).length,
      pendientesSugeridos: rows.filter((row: any) => row.suggestion && !row.global).length,
      excepcionesPlantel: rows.reduce((sum: number, row: any) => sum + row.overrides.length, 0),
    },
  }
})
