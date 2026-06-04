import { runWithBridgeAgentId, query } from '../../../utils/db'
import { controlEscolarCentralQuery } from '../../../utils/control-escolar-central'
import { normalizeCicloKey } from '../../../../shared/utils/ciclo'
import { isInProjectedPlantelScopeForCiclo } from '../../../../shared/utils/grado'
import { buildFamilyLinkKey, normalizeFamilyId, normalizeFamilyLinkKey } from '../../../../shared/utils/familyIdentity'

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()
const normalizeMatricula = (value: unknown) => String(value || '').trim().toUpperCase()
const isReliableEmail = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))
const isScopedToActivePlantel = (user: any) => !user?.isSuperAdmin || (user?.isSuperAdmin && user?.active_plantel !== 'GLOBAL')

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

const tryLoadCentralFamilySiblings = async (matricula: string, cicloKey: string, user: any) => {
  try {
    const [centralStudent] = await controlEscolarCentralQuery<any[]>(`
      SELECT family_id AS familyId
      FROM \`matricula\`
      WHERE UPPER(TRIM(\`matricula\`)) = ?
      LIMIT 1
    `, [normalizeMatricula(matricula)])

    if (!centralStudent) return null

    const familyId = normalizeFamilyId(centralStudent.familyId)

    if (!familyId) {
      return {
        siblings: [],
        source: 'control-escolar-empty',
        familyKey: null
      }
    }

    const centralRows = await controlEscolarCentralQuery<any[]>(`
      SELECT matricula
      FROM \`matricula\`
      WHERE family_id IS NOT NULL
        AND TRIM(CAST(family_id AS CHAR)) = ?
        AND UPPER(TRIM(\`matricula\`)) <> ?
    `, [familyId, normalizeMatricula(matricula)])

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
    return null
  }
}

export default defineEventHandler(async (event) => runWithBridgeAgentId(event.context.dbBridgeAgentId, async () => {
  const matricula = event.context.params?.matricula
  const { ciclo = '2025' } = getQuery(event)
  const cicloKey = normalizeCicloKey(ciclo)
  const user = event.context.user

  const [student] = await query<any[]>(`
    SELECT B.correo, F.family_key AS familyKey
    FROM base B
    LEFT JOIN student_family_links F ON F.matricula = B.matricula
    WHERE B.matricula = ?
    LIMIT 1
  `, [matricula])

  if (!student) return { siblings: [], source: 'none', familyKey: null }

  const centralFamilyResult = await tryLoadCentralFamilySiblings(String(matricula || ''), cicloKey, user)
  if (centralFamilyResult) return centralFamilyResult

  let siblings: any[] = []
  let source = 'none'
  const localFamilyKey = normalizeFamilyLinkKey(student.familyKey)

  if (localFamilyKey) {
    siblings = await query<any[]>(`
      SELECT B.matricula, B.nombreCompleto, B.plantel, B.nivel, B.grado, B.grupo, B.ciclo
      FROM student_family_links F
      JOIN base B ON B.matricula = F.matricula
      WHERE F.family_key = ? AND B.matricula != ? AND B.estatus = 'Activo'
    `, [student.familyKey, matricula])

    siblings = filterProjectedSiblings(siblings, cicloKey, user)

    source = 'local'
  } else if (isReliableEmail(student.correo)) {
    const correo = normalizeEmail(student.correo)

    siblings = await query<any[]>(`
      SELECT matricula, nombreCompleto, plantel, nivel, grado, grupo, ciclo
      FROM base
      WHERE LOWER(TRIM(correo)) = ? AND matricula != ? AND estatus = 'Activo'
    `, [correo, matricula])

    siblings = filterProjectedSiblings(siblings, cicloKey, user)

    source = siblings.length ? 'email' : 'none'
  }

  // Control Escolar family_id is authoritative when the matricula record exists.
  // Local links are used only when Control Escolar has no row or is unavailable.
  // Email fallback is exact and validated; parent/tutor names are never used to infer siblings.
  return {
    siblings,
    source,
    familyKey: localFamilyKey || null
  }
}))
