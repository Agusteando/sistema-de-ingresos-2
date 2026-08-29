import { normalizeCicloKey } from '../../shared/utils/ciclo'
import {
  FINAL_TALLERES,
  financialConceptTallerSeed,
  normalizeServicioClave,
  normalizeServicioNombre,
} from '../../shared/utils/talleresServicios'
import { CONCEPTOS_PLANTELES_LIST } from '../../utils/constants'
import { getControlEscolarCentralDb } from './control-escolar-central'
import {
  readCentralConceptos,
  readCentralConceptosConfig,
  syncCentralConceptosConfigToBridge,
  type ConceptosConfigRow,
} from './conceptos-config'
import { runWithBridgeAgentId } from './db'

export const TEMPORARY_WORKSHOP_SEED_CYCLE = '2026'

type WorkshopFinancialConcept = {
  id?: unknown
  concepto?: unknown
  ciclo_escolar?: unknown
  ciclo?: unknown
}

export type WorkshopSeedCandidate = {
  concepto_id: number
  concepto_nombre: string
  servicio_clave: string
  servicio_nombre: string
}

export type WorkshopSeedPreview = {
  ciclo: string
  planteles: string[]
  plantelesCount: number
  conceptos: WorkshopSeedCandidate[]
  conceptosCount: number
  expectedMappings: number
  completeMappings: number
  pendingMappings: number
  missingWorkshops: string[]
  ready: boolean
  complete: boolean
}

const compact = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max)
const active = (value: unknown) => value === undefined || value === null || Number(value) !== 0
const mappingKey = (plantel: unknown, conceptoId: unknown) => `${compact(plantel, 40).toUpperCase()}:${Number(conceptoId || 0)}`

export const discoverWorkshopFinancialConcepts = (
  conceptos: WorkshopFinancialConcept[] = [],
  cicloInput: unknown = TEMPORARY_WORKSHOP_SEED_CYCLE,
) => {
  const ciclo = normalizeCicloKey(cicloInput)
  const found = new Map<number, WorkshopSeedCandidate>()

  for (const concepto of conceptos) {
    const id = Number(concepto?.id || 0)
    const nombre = compact(concepto?.concepto)
    const rawCycle = compact(concepto?.ciclo_escolar || concepto?.ciclo, 40)
    if (!id || !nombre || !rawCycle || normalizeCicloKey(rawCycle) !== ciclo) continue

    const taller = financialConceptTallerSeed(nombre)
    if (!taller) continue

    found.set(id, {
      concepto_id: id,
      concepto_nombre: nombre,
      servicio_clave: normalizeServicioClave(taller.clave),
      servicio_nombre: normalizeServicioNombre(taller.nombre),
    })
  }

  return Array.from(found.values()).sort((left, right) =>
    left.servicio_nombre.localeCompare(right.servicio_nombre, 'es')
      || left.concepto_nombre.localeCompare(right.concepto_nombre, 'es')
      || left.concepto_id - right.concepto_id
  )
}

const mappingIsComplete = (row: ConceptosConfigRow, candidate: WorkshopSeedCandidate) =>
  active(row.activo)
  && normalizeServicioClave(row.servicio_clave || row.servicio_nombre) === candidate.servicio_clave
  && normalizeServicioNombre(row.servicio_nombre) === candidate.servicio_nombre
  && compact(row.concepto_nombre) === candidate.concepto_nombre

export const buildWorkshopSeedPreview = ({
  conceptos = [],
  mappings = [],
  ciclo: cicloInput = TEMPORARY_WORKSHOP_SEED_CYCLE,
  planteles = CONCEPTOS_PLANTELES_LIST,
}: {
  conceptos?: WorkshopFinancialConcept[]
  mappings?: ConceptosConfigRow[]
  ciclo?: unknown
  planteles?: string[]
}): WorkshopSeedPreview => {
  const ciclo = normalizeCicloKey(cicloInput)
  const normalizedPlanteles = Array.from(new Set(
    planteles.map((plantel) => compact(plantel, 40).toUpperCase()).filter(Boolean)
  ))
  const candidates = discoverWorkshopFinancialConcepts(conceptos, ciclo)
  const scopedMappings = mappings.filter((row) =>
    normalizeCicloKey(row.cycle_name) === ciclo
      && compact(row.enrollment_type).toLowerCase() === 'talleres_servicios'
      && normalizedPlanteles.includes(compact(row.plantel, 40).toUpperCase())
  )
  const mappingsByKey = new Map<string, ConceptosConfigRow[]>()

  for (const row of scopedMappings) {
    const key = mappingKey(row.plantel, row.concepto_id)
    const rows = mappingsByKey.get(key) || []
    rows.push(row)
    mappingsByKey.set(key, rows)
  }

  let completeMappings = 0
  for (const candidate of candidates) {
    for (const plantel of normalizedPlanteles) {
      if ((mappingsByKey.get(mappingKey(plantel, candidate.concepto_id)) || [])
        .some((row) => mappingIsComplete(row, candidate))) {
        completeMappings += 1
      }
    }
  }

  const expectedMappings = candidates.length * normalizedPlanteles.length
  const mappedWorkshopKeys = new Set(candidates.map((candidate) => candidate.servicio_clave))
  const missingWorkshops = FINAL_TALLERES
    .filter((taller) => !mappedWorkshopKeys.has(taller.clave))
    .map((taller) => taller.nombre)

  return {
    ciclo,
    planteles: normalizedPlanteles,
    plantelesCount: normalizedPlanteles.length,
    conceptos: candidates,
    conceptosCount: candidates.length,
    expectedMappings,
    completeMappings,
    pendingMappings: Math.max(0, expectedMappings - completeMappings),
    missingWorkshops,
    ready: candidates.length > 0 && normalizedPlanteles.length > 0,
    complete: expectedMappings > 0 && completeMappings === expectedMappings,
  }
}

const sameStoredMapping = (row: any, candidate: WorkshopSeedCandidate) =>
  active(row?.activo)
  && compact(row?.concepto_nombre) === candidate.concepto_nombre
  && normalizeServicioClave(row?.servicio_clave || row?.servicio_nombre) === candidate.servicio_clave
  && normalizeServicioNombre(row?.servicio_nombre) === candidate.servicio_nombre

const syncWorkshopMappingsToBridges = async (
  planteles: string[],
  central: Awaited<ReturnType<typeof readCentralConceptosConfig>>,
) => {
  const results = await Promise.all(planteles.map(async (plantel) => {
    try {
      await runWithBridgeAgentId(plantel, async () => await syncCentralConceptosConfigToBridge(central))
      return { plantel, ok: true }
    } catch (error: any) {
      return {
        plantel,
        ok: false,
        message: compact(error?.data?.message || error?.message || 'Bridge no disponible.', 240),
      }
    }
  }))

  return {
    synced: results.filter((result) => result.ok).map((result) => result.plantel),
    pending: results.filter((result) => !result.ok),
  }
}

export const seedWorkshopFinancialMappings = async (user: { email?: string | null }) => {
  const ciclo = TEMPORARY_WORKSHOP_SEED_CYCLE
  const [conceptos, config] = await Promise.all([
    readCentralConceptos(),
    readCentralConceptosConfig(),
  ])
  const preview = buildWorkshopSeedPreview({ conceptos, mappings: config.mappings, ciclo })

  if (!preview.ready) {
    throw createError({
      statusCode: 409,
      message: 'No hay conceptos financieros 2026-2027 con nombres de talleres reconocibles. Actualiza el catálogo central antes de ejecutar el sembrado.',
      data: { preview },
    })
  }

  const db = getControlEscolarCentralDb()
  const connection = await db.getConnection()
  const syncVersion = Date.now()
  const updatedBy = compact(user?.email, 255) || 'sistema'
  let inserted = 0
  let updated = 0
  let unchanged = 0

  try {
    await connection.beginTransaction()
    await connection.query(
      `INSERT IGNORE INTO config_school_cycles (cycle_name, is_current, sync_version, updated_by)
       VALUES (?, 0, ?, ?)`,
      [ciclo, syncVersion, updatedBy],
    )

    const [mappingRows] = await connection.query(
      `SELECT id, cycle_name, plantel, concepto_id, concepto_nombre, enrollment_type,
              servicio_clave, servicio_nombre, activo
         FROM config_enrollment_mappings
        WHERE cycle_name = ?
          AND IFNULL(enrollment_type, 'regular') = 'talleres_servicios'
        ORDER BY id DESC`,
      [ciclo],
    )
    const existingByKey = new Map<string, any[]>()
    for (const row of mappingRows as any[]) {
      const key = mappingKey(row.plantel, row.concepto_id)
      const existing = existingByKey.get(key) || []
      existing.push(row)
      existingByKey.set(key, existing)
    }

    for (const candidate of preview.conceptos) {
      for (const plantel of preview.planteles) {
        const existing = existingByKey.get(mappingKey(plantel, candidate.concepto_id)) || []
        if (existing.some((row) => sameStoredMapping(row, candidate))) {
          unchanged += 1
          continue
        }

        if (existing.length) {
          await connection.query(
            `UPDATE config_enrollment_mappings
                SET concepto_nombre = ?, enrollment_type = 'talleres_servicios', months_json = '[]',
                    servicio_clave = ?, servicio_nombre = ?, activo = 1,
                    sync_version = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
            [candidate.concepto_nombre, candidate.servicio_clave, candidate.servicio_nombre, syncVersion, updatedBy, existing[0].id],
          )
          updated += 1
          continue
        }

        await connection.query(
          `INSERT INTO config_enrollment_mappings
            (cycle_name, plantel, concepto_id, concepto_nombre, enrollment_type, months_json,
             servicio_clave, servicio_nombre, activo, sync_version, updated_by)
           VALUES (?, ?, ?, ?, 'talleres_servicios', '[]', ?, ?, 1, ?, ?)`,
          [ciclo, plantel, candidate.concepto_id, candidate.concepto_nombre,
            candidate.servicio_clave, candidate.servicio_nombre, syncVersion, updatedBy],
        )
        inserted += 1
      }
    }

    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }

  const central = await readCentralConceptosConfig()
  const after = buildWorkshopSeedPreview({ conceptos, mappings: central.mappings, ciclo })
  const bridges = await syncWorkshopMappingsToBridges(after.planteles, central)

  return {
    ok: true,
    ciclo,
    inserted,
    updated,
    unchanged,
    after,
    bridges,
  }
}
