import { normalizeCicloKey } from '../../shared/utils/ciclo'
import { controlEscolarCentralQuery, getCentralTableColumns } from './control-escolar-central'
import { query } from './db'

type CatalogConceptRow = {
  id?: unknown
  concepto?: unknown
  costo?: unknown
  ciclo?: unknown
}

export type FinancialConcept = {
  id: number
  concepto: string
  costo: number
  ciclo: string
  source: 'central' | 'bridge'
}

const normalizeText = (value: unknown) => String(value || '').trim()

const normalizeConceptLabel = (value: unknown) => normalizeText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[·:._-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const PLACEHOLDER_CONCEPT_NAMES = new Set([
  'cargo',
  'cargo unico',
  'concepto',
  'concepto financiero',
  'concepto escolar',
  'sin concepto',
  'pago registrado',
])

const toConceptId = (value: unknown) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
}

const toMoney = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const cicloCandidatesFor = (value: unknown) => {
  const key = normalizeCicloKey(value)
  const candidates = new Set<string>()

  if (key) {
    candidates.add(key)
    const numeric = Number(key)
    if (Number.isFinite(numeric) && numeric > 1900 && numeric < 2200) {
      candidates.add(`${numeric}-${numeric + 1}`)
    }
  }

  const raw = normalizeText(value)
  if (raw) candidates.add(raw)
  return [...candidates]
}

const mapRows = (rows: CatalogConceptRow[], source: FinancialConcept['source']) => rows.reduce((map, row) => {
  const id = toConceptId(row?.id)
  const concepto = normalizeText(row?.concepto)
  if (!id || !concepto || isPlaceholderConceptName(concepto)) return map

  map.set(id, {
    id,
    concepto,
    costo: toMoney(row?.costo),
    ciclo: normalizeText(row?.ciclo),
    source,
  })
  return map
}, new Map<number, FinancialConcept>())

const readCentralConcepts = async (ids: number[], ciclo: unknown) => {
  if (!ids.length) return new Map<number, FinancialConcept>()

  const columns = await getCentralTableColumns('conceptos')
  const select = [
    'id',
    'concepto',
    columns.has('costo') ? 'costo' : '0 AS costo',
    columns.has('ciclo') ? 'ciclo' : "'' AS ciclo",
  ]
  const cicloCandidates = cicloCandidatesFor(ciclo)
  const params: any[] = [ids]
  let cycleWhere = ''

  if (columns.has('ciclo') && cicloCandidates.length) {
    cycleWhere = ` AND CAST(ciclo AS CHAR) IN (${cicloCandidates.map(() => '?').join(', ')})`
    params.push(...cicloCandidates)
  }

  let rows = await controlEscolarCentralQuery<CatalogConceptRow[]>(`
    SELECT ${select.join(', ')}
    FROM conceptos
    WHERE id IN (?)
      AND concepto IS NOT NULL
      AND TRIM(concepto) <> ''
      ${cycleWhere}
  `, params)

  const foundIds = new Set(rows.map((row) => toConceptId(row?.id)).filter(Boolean))
  const missingIds = ids.filter((id) => !foundIds.has(id))

  // IDs are the stable financial identity. This second lookup covers legacy rows whose
  // cycle was saved as 2025 while the catalog uses 2025-2026 (or vice versa).
  if (missingIds.length && columns.has('ciclo')) {
    const fallbackRows = await controlEscolarCentralQuery<CatalogConceptRow[]>(`
      SELECT ${select.join(', ')}
      FROM conceptos
      WHERE id IN (?)
        AND concepto IS NOT NULL
        AND TRIM(concepto) <> ''
    `, [missingIds])
    rows = [...rows, ...fallbackRows]
  }

  return mapRows(rows, 'central')
}

const readBridgeConcepts = async (ids: number[], ciclo: unknown) => {
  if (!ids.length) return new Map<number, FinancialConcept>()

  const cicloCandidates = cicloCandidatesFor(ciclo)
  const params: any[] = [ids]
  let cycleWhere = ''

  if (cicloCandidates.length) {
    cycleWhere = ` AND CAST(ciclo AS CHAR) IN (${cicloCandidates.map(() => '?').join(', ')})`
    params.push(...cicloCandidates)
  }

  let rows = await query<CatalogConceptRow[]>(`
    SELECT id, concepto, costo, ciclo
    FROM conceptos
    WHERE id IN (?)
      AND concepto IS NOT NULL
      AND TRIM(concepto) <> ''
      ${cycleWhere}
  `, params)

  const foundIds = new Set(rows.map((row) => toConceptId(row?.id)).filter(Boolean))
  const missingIds = ids.filter((id) => !foundIds.has(id))

  if (missingIds.length) {
    const fallbackRows = await query<CatalogConceptRow[]>(`
      SELECT id, concepto, costo, ciclo
      FROM conceptos
      WHERE id IN (?)
        AND concepto IS NOT NULL
        AND TRIM(concepto) <> ''
    `, [missingIds])
    rows = [...rows, ...fallbackRows]
  }

  return mapRows(rows, 'bridge')
}

export const isPlaceholderConceptName = (value: unknown) => {
  const normalized = normalizeConceptLabel(value)
  if (!normalized) return true
  if (PLACEHOLDER_CONCEPT_NAMES.has(normalized)) return true

  const differentialMatch = normalized.match(/^diferencia\s+(.+)$/)
  return Boolean(differentialMatch && PLACEHOLDER_CONCEPT_NAMES.has(differentialMatch[1]))
}

export const loadFinancialConceptMap = async (conceptIds: unknown[], ciclo?: unknown) => {
  const ids = Array.from(new Set(conceptIds.map(toConceptId).filter(Boolean)))
  const concepts = new Map<number, FinancialConcept>()
  if (!ids.length) return concepts

  try {
    const central = await readCentralConcepts(ids, ciclo)
    central.forEach((value, id) => concepts.set(id, value))
  } catch (error: any) {
    console.warn('[FinancialConcept] Central catalog unavailable; using bridge catalog.', {
      ids,
      ciclo: normalizeText(ciclo),
      message: error?.message || error,
    })
  }

  const missingIds = ids.filter((id) => !concepts.has(id))
  if (missingIds.length) {
    try {
      const bridge = await readBridgeConcepts(missingIds, ciclo)
      bridge.forEach((value, id) => concepts.set(id, value))
    } catch (error: any) {
      console.warn('[FinancialConcept] Bridge catalog lookup failed.', {
        ids: missingIds,
        ciclo: normalizeText(ciclo),
        message: error?.message || error,
      })
    }
  }

  return concepts
}

export const resolveFinancialConcept = async ({
  conceptoId,
  ciclo,
}: {
  conceptoId: unknown
  ciclo?: unknown
}): Promise<FinancialConcept> => {
  const id = toConceptId(conceptoId)
  if (!id) {
    throw createError({ statusCode: 400, message: 'Seleccione un concepto financiero válido.' })
  }

  const concepts = await loadFinancialConceptMap([id], ciclo)
  const catalogConcept = concepts.get(id)
  if (catalogConcept) return catalogConcept

  throw createError({
    statusCode: 404,
    message: 'No se pudo resolver el nombre real del concepto seleccionado. Actualiza el catálogo e inténtalo de nuevo.',
  })
}

export const resolveConceptDisplayName = (
  storedName: unknown,
  conceptoId: unknown,
  concepts: Map<number, FinancialConcept>,
) => {
  const currentName = normalizeText(storedName)
  if (currentName && !isPlaceholderConceptName(currentName)) return currentName

  const id = toConceptId(conceptoId)
  const canonicalName = concepts.get(id)?.concepto
  if (canonicalName) {
    const normalized = normalizeConceptLabel(currentName)
    if (normalized.startsWith('diferencia ')) return `Diferencia · ${canonicalName}`
    return canonicalName
  }

  return id ? `Concepto financiero #${id}` : 'Concepto financiero no identificado'
}

export const hydrateFinancialConceptNames = async <T extends Record<string, any>>(
  rows: T[],
  {
    ciclo,
    idField = 'concepto',
    nameField = 'conceptoNombre',
  }: {
    ciclo?: unknown
    idField?: string
    nameField?: string
  } = {},
) => {
  if (!rows.length) return rows
  const concepts = await loadFinancialConceptMap(rows.map((row) => row?.[idField]), ciclo)

  rows.forEach((row) => {
    row[nameField] = resolveConceptDisplayName(row?.[nameField], row?.[idField], concepts)
  })

  return rows
}
