import { runWithBridgeAgentId, query } from '../../../utils/db'
import { controlEscolarCentralQuery, getCentralTableColumns } from '../../../utils/control-escolar-central'
import { normalizeCicloKey } from '../../../../shared/utils/ciclo'
import { isInProjectedPlantelScopeForCiclo } from '../../../../shared/utils/grado'
import { buildFamilyLinkKey, normalizeFamilyId } from '../../../../shared/utils/familyIdentity'

const normalizeMatricula = (value: unknown) => String(value || '').trim().toUpperCase()
const isScopedToActivePlantel = (user: any) => !user?.isSuperAdmin || (user?.isSuperAdmin && user?.active_plantel !== 'GLOBAL')
const escapeIdentifier = (value: string) => `\`${String(value).replace(/`/g, '``')}\``

const MATRICULA_FAMILY_COLUMN_CANDIDATES = [
  'family_id',
  'familia_id',
  'familiaId',
  'familyId',
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

const resolveMatriculaFamilyColumn = async () => {
  const columns = await getCentralTableColumns('matricula')
  for (const column of MATRICULA_FAMILY_COLUMN_CANDIDATES) {
    if (columns.has(column)) return column
  }
  return ''
}

const loadControlEscolarFamilySiblings = async (matricula: string, cicloKey: string, user: any) => {
  const normalizedMatricula = normalizeMatricula(matricula)
  if (!normalizedMatricula) {
    return { siblings: [], source: 'none', familyKey: null }
  }

  try {
    const familyColumn = await resolveMatriculaFamilyColumn()

    if (!familyColumn) {
      return {
        siblings: [],
        source: 'control-escolar-no-family-field',
        familyKey: null
      }
    }

    const familyColumnSql = escapeIdentifier(familyColumn)
    const [centralStudent] = await controlEscolarCentralQuery<any[]>(`
      SELECT ${familyColumnSql} AS familyId
      FROM \`matricula\`
      WHERE UPPER(TRIM(\`matricula\`)) = ?
      LIMIT 1
    `, [normalizedMatricula])

    if (!centralStudent) {
      return {
        siblings: [],
        source: 'control-escolar-missing',
        familyKey: null
      }
    }

    const familyId = normalizeFamilyId(centralStudent.familyId)

    if (!familyId) {
      return {
        siblings: [],
        source: 'control-escolar-empty',
        familyKey: null
      }
    }

    const centralRows = await controlEscolarCentralQuery<any[]>(`
      SELECT \`matricula\`
      FROM \`matricula\`
      WHERE ${familyColumnSql} IS NOT NULL
        AND TRIM(CAST(${familyColumnSql} AS CHAR)) = ?
        AND UPPER(TRIM(\`matricula\`)) <> ?
    `, [familyId, normalizedMatricula])

    const baseSiblings = await loadBaseSiblingsByMatriculas(
      centralRows.map((row) => row.matricula),
      matricula
    )

    return {
      siblings: filterProjectedSiblings(baseSiblings, cicloKey, user),
      source: 'control-escolar',
      familyKey: buildFamilyLinkKey('control-escolar', familyId)
    }
  } catch (error: any) {
    const code = String(error?.code || error?.data?.code || '').toUpperCase()
    const message = String(error?.message || '')
    if (code && !['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE'].includes(code)) {
      console.warn('[students:siblings] Control Escolar family lookup unavailable', { code, message })
    }
    return {
      siblings: [],
      source: 'control-escolar-unavailable',
      familyKey: null
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

  if (!student) return { siblings: [], source: 'none', familyKey: null }

  // Familia / hermanos is now read-only in Alumnos-Financiero and comes only
  // from the Control Escolar matricula family field. student_family_links and
  // email inference are intentionally not used anymore.
  return loadControlEscolarFamilySiblings(String(matricula || ''), cicloKey, user)
}))
