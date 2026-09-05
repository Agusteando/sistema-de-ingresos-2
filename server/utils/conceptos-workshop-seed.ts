import { formatCicloLabel, normalizeCicloKey } from '../../shared/utils/ciclo'
import {
  DEFAULT_TALLERES_SERVICIOS,
  FINAL_TALLERES,
  canonicalTallerKey,
  financialConceptTallerSeed,
  normalizeServicioClave,
  normalizeServicioNombre,
  serviceSeedByKey,
  type TallerServicioSeed,
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
export const GLOBAL_TALLERES_SERVICIOS_PLANTEL = 'GLOBAL'

const CRITICAL_SERVICE_KEYS = new Set([
  'DESAYUNO',
  'COMIDA',
  'CENA',
  'CLUB_DE_TAREAS',
])

const SAFE_SERVICE_SUFFIX_TOKENS = new Set([
  'PRIMARIA', 'SECUNDARIA', 'PREESCOLAR', 'KINDER', 'GUARDERIA', 'MATERNAL',
  'IECS', 'IEDIS', 'TOLUCA', 'METEPEC', 'Y', 'DE', 'DEL',
])

type FinancialConcept = {
  id?: unknown
  concepto?: unknown
  ciclo_escolar?: unknown
  ciclo?: unknown
  costo?: unknown
}

export type TallerServicioSeedCandidate = {
  concepto_id: number
  concepto_nombre: string
  servicio_clave: string
  servicio_nombre: string
  tipo: 'taller' | 'servicio'
}

export type WorkshopSeedPreview = {
  ciclo: string
  planteles: string[]
  plantelesCount: number
  conceptos: TallerServicioSeedCandidate[]
  conceptosCount: number
  expectedMappings: number
  completeMappings: number
  pendingMappings: number
  missingWorkshops: string[]
  ready: boolean
  complete: boolean
  global: true
}

const compact = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max)
const active = (value: unknown) => value === undefined || value === null || Number(value) !== 0
const conceptKey = (conceptoId: unknown) => Number(conceptoId || 0)

const stripFinancialDecorators = (value: unknown) => normalizeServicioClave(value)
  .replace(/_(?:CICLO_)?20\d{2}_20\d{2}$/, '')
  .replace(/_(?:CICLO_)?20\d{2}$/, '')
  .replace(/^SERVICIO_DE_/, '')
  .replace(/^SERVICIO_/, '')
  .replace(/^TALLER_DE_/, '')
  .replace(/^TALLER_/, '')
  .replace(/^_+|_+$/g, '')

const isSafeInstitutionalSuffix = (suffix: string) => {
  if (!suffix) return true
  const tokens = suffix.split('_').filter(Boolean)
  return tokens.every((token) => SAFE_SERVICE_SUFFIX_TOKENS.has(token) || /^20\d{2}$/.test(token))
}

const serviceCandidateFromSeed = (seed: TallerServicioSeed | null, taller = false) => seed ? {
  servicio_clave: normalizeServicioClave(seed.clave),
  servicio_nombre: normalizeServicioNombre(seed.nombre),
  tipo: (taller ? 'taller' : 'servicio') as 'taller' | 'servicio',
} : null

/**
 * Resolves only safe, institutional financial-concept names.
 * Workshops keep the existing conservative resolver. The four critical services
 * additionally accept level/campus suffixes such as "DESAYUNO PRIMARIA Y SECUNDARIA".
 */
export const resolveFinancialConceptTallerServicio = (value: unknown) => {
  const taller = financialConceptTallerSeed(value)
  if (taller) return serviceCandidateFromSeed(taller, true)

  const stripped = stripFinancialDecorators(value)
  if (!stripped) return null

  const canonical = canonicalTallerKey(stripped)
  const canonicalTaller = FINAL_TALLERES.find((item) => item.clave === canonical)
  if (canonicalTaller) return serviceCandidateFromSeed(canonicalTaller, true)

  // Explicit AJEDREZ variants remain one canonical workshop.
  if (stripped === 'AJEDREZ_4_DIAS' || stripped === 'AJEDREZ_CUATRO_DIAS') {
    return serviceCandidateFromSeed(serviceSeedByKey('AJEDREZ'), true)
  }
  if (stripped.startsWith('AJEDREZ_4_DIAS_') && isSafeInstitutionalSuffix(stripped.slice('AJEDREZ_4_DIAS_'.length))) {
    return serviceCandidateFromSeed(serviceSeedByKey('AJEDREZ'), true)
  }
  if (stripped.startsWith('AJEDREZ_') && isSafeInstitutionalSuffix(stripped.slice('AJEDREZ_'.length))) {
    return serviceCandidateFromSeed(serviceSeedByKey('AJEDREZ'), true)
  }

  for (const key of CRITICAL_SERVICE_KEYS) {
    if (stripped === key) return serviceCandidateFromSeed(serviceSeedByKey(key), false)
    if (stripped.startsWith(`${key}_`) && isSafeInstitutionalSuffix(stripped.slice(key.length + 1))) {
      return serviceCandidateFromSeed(serviceSeedByKey(key), false)
    }
  }

  return null
}

export const discoverWorkshopFinancialConcepts = (
  conceptos: FinancialConcept[] = [],
  cicloInput: unknown = TEMPORARY_WORKSHOP_SEED_CYCLE,
) => {
  const ciclo = normalizeCicloKey(cicloInput)
  const found = new Map<number, TallerServicioSeedCandidate>()

  for (const concepto of conceptos) {
    const id = Number(concepto?.id || 0)
    const nombre = compact(concepto?.concepto)
    const rawCycle = compact(concepto?.ciclo_escolar || concepto?.ciclo, 40)
    if (!id || !nombre || !rawCycle || normalizeCicloKey(rawCycle) !== ciclo) continue

    const match = resolveFinancialConceptTallerServicio(nombre)
    if (!match) continue

    found.set(id, {
      concepto_id: id,
      concepto_nombre: nombre,
      ...match,
    })
  }

  return Array.from(found.values()).sort((left, right) =>
    left.tipo.localeCompare(right.tipo, 'es')
      || left.servicio_nombre.localeCompare(right.servicio_nombre, 'es')
      || left.concepto_nombre.localeCompare(right.concepto_nombre, 'es')
      || left.concepto_id - right.concepto_id
  )
}

const mappingIsComplete = (row: ConceptosConfigRow, candidate: TallerServicioSeedCandidate) =>
  active(row.activo)
  && compact(row.plantel, 40).toUpperCase() === GLOBAL_TALLERES_SERVICIOS_PLANTEL
  && normalizeServicioClave(row.servicio_clave || row.servicio_nombre) === candidate.servicio_clave
  && normalizeServicioNombre(row.servicio_nombre) === candidate.servicio_nombre
  && compact(row.concepto_nombre) === candidate.concepto_nombre

export const buildWorkshopSeedPreview = ({
  conceptos = [],
  mappings = [],
  ciclo: cicloInput = TEMPORARY_WORKSHOP_SEED_CYCLE,
  planteles = CONCEPTOS_PLANTELES_LIST,
}: {
  conceptos?: FinancialConcept[]
  mappings?: ConceptosConfigRow[]
  ciclo?: unknown
  planteles?: string[]
}): WorkshopSeedPreview => {
  const ciclo = normalizeCicloKey(cicloInput)
  const candidates = discoverWorkshopFinancialConcepts(conceptos, ciclo)
  const globalMappings = mappings.filter((row) =>
    normalizeCicloKey(row.cycle_name) === ciclo
      && compact(row.enrollment_type).toLowerCase() === 'talleres_servicios'
      && compact(row.plantel, 40).toUpperCase() === GLOBAL_TALLERES_SERVICIOS_PLANTEL
  )

  const byConcept = new Map<number, ConceptosConfigRow[]>()
  for (const row of globalMappings) {
    const id = conceptKey(row.concepto_id)
    const current = byConcept.get(id) || []
    current.push(row)
    byConcept.set(id, current)
  }

  const completeMappings = candidates.filter((candidate) =>
    (byConcept.get(candidate.concepto_id) || []).some((row) => mappingIsComplete(row, candidate))
  ).length

  const expectedMappings = candidates.length
  const mappedWorkshopKeys = new Set(candidates.filter((candidate) => candidate.tipo === 'taller').map((candidate) => candidate.servicio_clave))
  const missingWorkshops = FINAL_TALLERES
    .filter((taller) => !mappedWorkshopKeys.has(taller.clave))
    .map((taller) => taller.nombre)

  return {
    ciclo,
    planteles: Array.from(new Set(planteles.map((plantel) => compact(plantel, 40).toUpperCase()).filter(Boolean))),
    plantelesCount: Array.from(new Set(planteles.map((plantel) => compact(plantel, 40).toUpperCase()).filter(Boolean))).length,
    conceptos: candidates,
    conceptosCount: candidates.length,
    expectedMappings,
    completeMappings,
    pendingMappings: Math.max(0, expectedMappings - completeMappings),
    missingWorkshops,
    ready: candidates.length > 0,
    complete: expectedMappings > 0 && completeMappings === expectedMappings,
    global: true,
  }
}

const sameStoredMapping = (row: any, candidate: TallerServicioSeedCandidate) =>
  active(row?.activo)
  && compact(row?.concepto_nombre) === candidate.concepto_nombre
  && normalizeServicioClave(row?.servicio_clave || row?.servicio_nombre) === candidate.servicio_clave
  && normalizeServicioNombre(row?.servicio_nombre) === candidate.servicio_nombre

const syncMappingsToBridges = async (
  central: Awaited<ReturnType<typeof readCentralConceptosConfig>>,
) => {
  const results = await Promise.all(CONCEPTOS_PLANTELES_LIST.map(async (plantel) => {
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

/**
 * One-click migration to the global Talleres y Servicios mapping model.
 * It creates or corrects one GLOBAL row per unambiguous financial concept.
 * Existing plantel-specific rows are preserved as explicit exceptions.
 */
export const seedWorkshopFinancialMappings = async (
  user: { email?: string | null },
  cicloInput: unknown = TEMPORARY_WORKSHOP_SEED_CYCLE,
) => {
  const ciclo = normalizeCicloKey(cicloInput)
  const [conceptos, config] = await Promise.all([
    readCentralConceptos(),
    readCentralConceptosConfig(),
  ])
  const preview = buildWorkshopSeedPreview({ conceptos, mappings: config.mappings, ciclo })

  if (!preview.ready) {
    throw createError({
      statusCode: 409,
      message: `No hay conceptos financieros ${formatCicloLabel(ciclo)} con nombres de talleres o servicios reconocibles.`,
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
          AND UPPER(TRIM(plantel)) = 'GLOBAL'
          AND IFNULL(enrollment_type, 'regular') = 'talleres_servicios'
        ORDER BY id DESC`,
      [ciclo],
    )

    const existingByConcept = new Map<number, any[]>()
    for (const row of mappingRows as any[]) {
      const id = conceptKey(row.concepto_id)
      const existing = existingByConcept.get(id) || []
      existing.push(row)
      existingByConcept.set(id, existing)
    }

    for (const candidate of preview.conceptos) {
      const existing = existingByConcept.get(candidate.concepto_id) || []
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
         VALUES (?, 'GLOBAL', ?, ?, 'talleres_servicios', '[]', ?, ?, 1, ?, ?)`,
        [ciclo, candidate.concepto_id, candidate.concepto_nombre,
          candidate.servicio_clave, candidate.servicio_nombre, syncVersion, updatedBy],
      )
      inserted += 1
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
  const bridges = await syncMappingsToBridges(central)

  return {
    ok: true,
    ciclo,
    scope: GLOBAL_TALLERES_SERVICIOS_PLANTEL,
    inserted,
    updated,
    unchanged,
    after,
    bridges,
  }
}

export const tallerServicioCatalogForAssociation = () => DEFAULT_TALLERES_SERVICIOS.map((item) => ({
  clave: normalizeServicioClave(item.clave),
  nombre: normalizeServicioNombre(item.nombre),
  tipo: FINAL_TALLERES.some((taller) => taller.clave === normalizeServicioClave(item.clave)) ? 'taller' : 'servicio',
  orden: Number(item.orden || 9999),
  imagen: item.imagen,
}))
