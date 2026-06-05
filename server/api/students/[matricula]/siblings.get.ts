import { runWithBridgeAgentId, query } from '../../../utils/db'
import { controlEscolarCentralQuery, getCentralTableColumns } from '../../../utils/control-escolar-central'
import { normalizeCicloKey } from '../../../../shared/utils/ciclo'
import { isInProjectedPlantelScopeForCiclo } from '../../../../shared/utils/grado'
import { buildParentSiblingSignature } from '../../../../shared/utils/parentSiblingMatch'

const normalizeMatricula = (value: unknown) => String(value || '').trim().toUpperCase()
const isScopedToActivePlantel = (user: any) => !user?.isSuperAdmin || (user?.isSuperAdmin && user?.active_plantel !== 'GLOBAL')
const escapeIdentifier = (value: string) => `\`${String(value).replace(/`/g, '``')}\``

const PARENT_MATCH_COLUMN_CANDIDATES = [
  'matricula',
  'nombre_padre',
  'apellido_paterno_padre',
  'apellido_materno_padre',
  'nombre_padre_completo',
  'padre',
  'nombre_madre',
  'apellido_paterno_madre',
  'apellido_materno_madre',
  'nombre_madre_completo',
  'madre',
]

const filterProjectedSiblings = (siblings: any[], cicloKey: string, user: any) => {
  const plantelScope = isScopedToActivePlantel(user) ? user.active_plantel : 'GLOBAL'
  return siblings.filter((sibling) => isInProjectedPlantelScopeForCiclo(
    sibling.grado,
    sibling.plantel,
    sibling.ciclo,
    cicloKey,
    sibling.nivel,
    plantelScope
  ))
}

const loadBaseSiblingsByMatriculas = async (matriculas: string[], currentMatricula: string) => {
  const normalizedCurrent = normalizeMatricula(currentMatricula)
  const normalizedMatriculas = Array.from(new Set(
    matriculas
      .map(normalizeMatricula)
      .filter((candidate) => candidate && candidate !== normalizedCurrent)
  ))

  if (!normalizedMatriculas.length) return []

  const placeholders = normalizedMatriculas.map(() => '?').join(',')
  return query<any[]>(`
    SELECT matricula, nombreCompleto, plantel, nivel, grado, grupo, ciclo
    FROM base
    WHERE UPPER(TRIM(matricula)) IN (${placeholders}) AND estatus = 'Activo'
  `, normalizedMatriculas)
}

const resolveParentMatchColumns = async () => {
  const columns = await getCentralTableColumns('matricula')
  if (!columns.has('matricula')) return []
  return PARENT_MATCH_COLUMN_CANDIDATES.filter((column) => columns.has(column))
}

const loadControlEscolarParentNameSiblings = async (matricula: string, cicloKey: string, user: any) => {
  const normalizedMatricula = normalizeMatricula(matricula)
  if (!normalizedMatricula) {
    return { siblings: [], source: 'none', familyKey: null, match: null }
  }

  try {
    const columns = await resolveParentMatchColumns()
    if (!columns.includes('matricula')) {
      return {
        siblings: [],
        source: 'control-escolar-no-matricula-field',
        familyKey: null,
        match: null,
      }
    }

    const selectSql = columns.map(escapeIdentifier).join(', ')
    const rows = await controlEscolarCentralQuery<any[]>(`
      SELECT ${selectSql}
      FROM \`matricula\`
    `)

    const centralStudent = rows.find((row) => normalizeMatricula(row.matricula) === normalizedMatricula)
    if (!centralStudent) {
      return {
        siblings: [],
        source: 'control-escolar-missing',
        familyKey: null,
        match: null,
      }
    }

    const signature = buildParentSiblingSignature(centralStudent)
    if (!signature.complete) {
      return {
        siblings: [],
        source: 'control-escolar-parent-names-incomplete',
        familyKey: null,
        match: {
          fatherName: signature.fatherName,
          motherName: signature.motherName,
          normalizedFatherName: signature.normalizedFatherName,
          normalizedMotherName: signature.normalizedMotherName,
        },
      }
    }

    const matchedMatriculas = rows
      .filter((row) => normalizeMatricula(row.matricula) !== normalizedMatricula)
      .filter((row) => buildParentSiblingSignature(row).key === signature.key)
      .map((row) => row.matricula)

    const baseSiblings = await loadBaseSiblingsByMatriculas(matchedMatriculas, matricula)

    return {
      siblings: filterProjectedSiblings(baseSiblings, cicloKey, user).map((sibling) => ({
        ...sibling,
        siblingMatchSource: 'control-escolar-parent-names',
        siblingMatchReason: 'Mismo padre y misma madre registrados',
      })),
      source: 'control-escolar-parent-names',
      familyKey: null,
      match: {
        fatherName: signature.fatherName,
        motherName: signature.motherName,
        normalizedFatherName: signature.normalizedFatherName,
        normalizedMotherName: signature.normalizedMotherName,
      },
    }
  } catch (error: any) {
    const code = String(error?.code || error?.data?.code || '').toUpperCase()
    const message = String(error?.message || '')
    if (code && !['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE'].includes(code)) {
      console.warn('[students:siblings] Control Escolar parent-name lookup unavailable', { code, message })
    }
    return {
      siblings: [],
      source: 'control-escolar-unavailable',
      familyKey: null,
      match: null,
    }
  }
}

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const matricula = event.context.params?.matricula
  const { ciclo = '2025' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const user = event.context.user

  const [student] = await query<any[]>(`
    SELECT matricula
    FROM base
    WHERE matricula = ?
    LIMIT 1
  `, [matricula])

  if (!student) return { siblings: [], source: 'none', familyKey: null, match: null }

  // Familia / hermanos is read-only in Alumnos-Financiero. It is derived only
  // from Control Escolar matricula parent names: same normalized father full
  // name AND same normalized mother full name.
  return loadControlEscolarParentNameSiblings(String(matricula || ''), cicloKey, user)
}))
