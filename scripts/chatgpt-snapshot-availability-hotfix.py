from pathlib import Path


def replace_once(text: str, old: str, new: str, path: Path) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, got {count}: {old[:140]!r}")
    return text.replace(old, new, 1)


def replace_all(text: str, old: str, new: str, path: Path, minimum: int = 1) -> str:
    count = text.count(old)
    if count < minimum:
        raise SystemExit(f"{path}: expected at least {minimum} matches, got {count}: {old[:140]!r}")
    return text.replace(old, new)


view_path = Path('server/utils/control-escolar-external-view.ts')
text = view_path.read_text()
text = replace_once(
    text,
    "const VIEW_VERSION = 'control-escolar-student-view-v1'",
    "export const EXTERNAL_CONTROL_ESCOLAR_VIEW_VERSION = 'control-escolar-student-view-v1'\n"
    "const VIEW_VERSION = EXTERNAL_CONTROL_ESCOLAR_VIEW_VERSION\n"
    "export const EXTERNAL_CONTROL_ESCOLAR_COMPATIBLE_VIEW_VERSIONS = [\n"
    "  VIEW_VERSION,\n"
    "  'control-escolar-student-view-v2-canonical'\n"
    "] as const",
    view_path,
)
text = replace_once(
    text,
    "const normalizeLower = (value: unknown, max = 255) => normalizeText(value, max).toLowerCase()",
    "const normalizeLower = (value: unknown, max = 255) => normalizeText(value, max).toLowerCase()\n"
    "const readViewVersion = (scope: any) => normalizeText(scope?.viewVersion, 80) || VIEW_VERSION",
    view_path,
)
text = replace_once(
    text,
    "const nowDate = () => new Date()",
    "const nowDate = () => new Date()\n"
    "const mysqlSecondPrecisionNow = () => {\n"
    "  const value = new Date()\n"
    "  value.setMilliseconds(0)\n"
    "  return value\n"
    "}",
    view_path,
)
# Full snapshot and single-row refresh both use timestamps compatible with MySQL DATETIME.
text = replace_all(text, "const generatedAt = nowDate()", "const generatedAt = mysqlSecondPrecisionNow()", view_path, minimum=2)

old_find = """const findLatestWarmScopeRow = async (scope: any) => {
  const latest = await controlEscolarCentralQuery<any[]>(
    `SELECT scope_key, previous_ciclo, concept_hash, concept_ids, MAX(generated_at) AS generated_at, COUNT(*) AS rows_count
     FROM ${EXTERNAL_VIEW_TABLE}
     WHERE plantel = ? AND ciclo_key = ? AND view_version = ?
     GROUP BY scope_key, previous_ciclo, concept_hash, concept_ids
     ORDER BY generated_at DESC
     LIMIT 1`,
    [scope.plantel, scope.cicloKey, VIEW_VERSION]
  )
  return latest[0] || null
}"""
new_find = """const findLatestWarmScopeRow = async (scope: any) => {
  const versionPlaceholders = EXTERNAL_CONTROL_ESCOLAR_COMPATIBLE_VIEW_VERSIONS.map(() => '?').join(',')
  const params: any[] = [scope.plantel, scope.cicloKey, ...EXTERNAL_CONTROL_ESCOLAR_COMPATIBLE_VIEW_VERSIONS]
  let scopeSql = ''
  if (scope.hasExplicitConcepts) {
    scopeSql = ' AND scope_key = ?'
    params.push(scope.descriptor.scopeKey)
  }
  const latest = await controlEscolarCentralQuery<any[]>(
    `SELECT view_version, scope_key, previous_ciclo, concept_hash, concept_ids, MAX(generated_at) AS generated_at, COUNT(*) AS rows_count
     FROM ${EXTERNAL_VIEW_TABLE}
     WHERE plantel = ? AND ciclo_key = ? AND view_version IN (${versionPlaceholders})${scopeSql}
     GROUP BY view_version, scope_key, previous_ciclo, concept_hash, concept_ids
     ORDER BY generated_at DESC
     LIMIT 1`,
    params
  )
  return latest[0] || null
}"""
text = replace_once(text, old_find, new_find, view_path)
old_resolve = """  if (scope.hasExplicitConcepts) return scope

  let row = await findLatestWarmScopeRow(scope)
  if (!row?.scope_key) {
    await warmExternalControlEscolarStudentScope(input)
    row = await findLatestWarmScopeRow(scope)
  }
"""
text = replace_once(text, old_resolve, "  const row = await findLatestWarmScopeRow(scope)\n", view_path)
text = replace_once(
    text,
    "      warmedEmptyScope: true,\n      descriptor:",
    "      warmedEmptyScope: true,\n      viewVersion: VIEW_VERSION,\n      descriptor:",
    view_path,
)
text = replace_once(
    text,
    "  return {\n    ...scope,\n    previousCiclo:",
    "  return {\n    ...scope,\n    viewVersion: normalizeText(row.view_version, 80) || VIEW_VERSION,\n    previousCiclo:",
    view_path,
)
text = replace_all(
    text,
    "[scope.plantel, scope.descriptor.scopeKey, VIEW_VERSION]",
    "[scope.plantel, scope.descriptor.scopeKey, readViewVersion(scope)]",
    view_path,
    minimum=2,
)
text = replace_once(
    text,
    "[scope.plantel, scope.descriptor.scopeKey, VIEW_VERSION, matricula]",
    "[scope.plantel, scope.descriptor.scopeKey, readViewVersion(scope), matricula]",
    view_path,
)
text = replace_once(
    text,
    "[scope.plantel, scope.descriptor.scopeKey, VIEW_VERSION, sinceDate, limit]",
    "[scope.plantel, scope.descriptor.scopeKey, readViewVersion(scope), sinceDate, limit]",
    view_path,
)
text = replace_once(
    text,
    "        viewVersion: VIEW_VERSION,\n        source: 'warm-cache',\n        freshness: freshnessRank(results.map((result) => String(result?.meta?.freshness || '')).filter(Boolean)),",
    "        viewVersion: Array.from(new Set(results.map((result) => String(result?.meta?.viewVersion || '')).filter(Boolean))).join(',') || VIEW_VERSION,\n"
    "        source: 'warm-cache',\n"
    "        freshness: freshnessRank(results.map((result) => String(result?.meta?.freshness || '')).filter(Boolean)),",
    view_path,
)
old_health = """export const readExternalControlEscolarHealth = async () => {
  await ensureControlEscolarExternalViewSchema()
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT plantel, ciclo_key, scope_key, concept_ids, view_version,
            COUNT(*) AS rows_count,
            MIN(generated_at) AS generated_at,
            MIN(stale_after) AS stale_after,
            MIN(expires_at) AS expires_at,
            MAX(updated_at) AS updated_at
     FROM ${EXTERNAL_VIEW_TABLE}
     WHERE view_version = ?
     GROUP BY plantel, ciclo_key, scope_key, concept_ids, view_version
     ORDER BY plantel ASC, ciclo_key DESC, generated_at DESC`,
    [VIEW_VERSION]
  )
  return {
    status: 'ok',
    viewVersion: VIEW_VERSION,"""
new_health = """export const readExternalControlEscolarHealth = async () => {
  await ensureControlEscolarExternalViewSchema()
  const versionPlaceholders = EXTERNAL_CONTROL_ESCOLAR_COMPATIBLE_VIEW_VERSIONS.map(() => '?').join(',')
  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT plantel, ciclo_key, scope_key, concept_ids, view_version,
            COUNT(*) AS rows_count,
            MIN(generated_at) AS generated_at,
            MIN(stale_after) AS stale_after,
            MIN(expires_at) AS expires_at,
            MAX(updated_at) AS updated_at
     FROM ${EXTERNAL_VIEW_TABLE}
     WHERE view_version IN (${versionPlaceholders})
     GROUP BY plantel, ciclo_key, scope_key, concept_ids, view_version
     ORDER BY plantel ASC, ciclo_key DESC, generated_at DESC`,
    [...EXTERNAL_CONTROL_ESCOLAR_COMPATIBLE_VIEW_VERSIONS]
  )
  return {
    status: 'ok',
    viewVersion: VIEW_VERSION,
    readableViewVersions: [...EXTERNAL_CONTROL_ESCOLAR_COMPATIBLE_VIEW_VERSIONS],"""
text = replace_once(text, old_health, new_health, view_path)
text = replace_once(
    text,
    "      plantel: normalizeText(row.plantel, 40),\n      ciclo:",
    "      plantel: normalizeText(row.plantel, 40),\n      viewVersion: normalizeText(row.view_version, 80),\n      ciclo:",
    view_path,
)
text = replace_once(
    text,
    "const buildExternalMeta = (scope: any, row: any, rows: number) => {\n  const generatedAt = row?.generated_at || null\n  const staleAfter = row?.stale_after || null\n  const expiresAt = row?.expires_at || null\n  return {\n    version: 'v1',\n    viewVersion: VIEW_VERSION,",
    "const buildExternalMeta = (scope: any, row: any, rows: number) => {\n  const generatedAt = row?.generated_at || null\n  const staleAfter = row?.stale_after || null\n  const expiresAt = row?.expires_at || null\n  return {\n    version: 'v1',\n    viewVersion: readViewVersion(scope),",
    view_path,
)
view_path.write_text(text)


snapshot_path = Path('server/utils/control-escolar-external-snapshot.ts')
text = snapshot_path.read_text()
text = replace_once(
    text,
    "  readExternalControlEscolarStudentDetail,\n  readExternalControlEscolarStudents,\n  warmExternalControlEscolarStudentScope\n} from './control-escolar-external-view'",
    "  readExternalControlEscolarStudentDetail,\n  readExternalControlEscolarStudents,\n  EXTERNAL_CONTROL_ESCOLAR_COMPATIBLE_VIEW_VERSIONS\n} from './control-escolar-external-view'",
    snapshot_path,
)
old_latest = """const readLatestSnapshotScope = async (scope: ReturnType<typeof buildExternalControlEscolarScope>) => {
  const params: any[] = [scope.plantel, scope.cicloKey, VIEW_VERSION]
  let scopeSql = ''
  if (scope.hasExplicitConcepts) {
    scopeSql = ' AND scope_key = ?'
    params.push(scope.descriptor.scopeKey)
  }

  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT scope_key, generated_at, stale_after, expires_at
     FROM ${EXTERNAL_VIEW_TABLE}
     WHERE plantel = ? AND ciclo_key = ? AND view_version = ?${scopeSql}
     ORDER BY generated_at DESC
     LIMIT 1`,
    params
  )
  return rows[0] || null
}"""
new_latest = """const readLatestSnapshotScope = async (scope: ReturnType<typeof buildExternalControlEscolarScope>) => {
  const versionPlaceholders = EXTERNAL_CONTROL_ESCOLAR_COMPATIBLE_VIEW_VERSIONS.map(() => '?').join(',')
  const params: any[] = [scope.plantel, scope.cicloKey, ...EXTERNAL_CONTROL_ESCOLAR_COMPATIBLE_VIEW_VERSIONS]
  let scopeSql = ''
  if (scope.hasExplicitConcepts) {
    scopeSql = ' AND scope_key = ?'
    params.push(scope.descriptor.scopeKey)
  }

  const rows = await controlEscolarCentralQuery<any[]>(
    `SELECT view_version, scope_key, generated_at, stale_after, expires_at
     FROM ${EXTERNAL_VIEW_TABLE}
     WHERE plantel = ? AND ciclo_key = ? AND view_version IN (${versionPlaceholders})${scopeSql}
     ORDER BY generated_at DESC
     LIMIT 1`,
    params
  )
  return rows[0] || null
}"""
text = replace_once(text, old_latest, new_latest, snapshot_path)
old_assert = """  let row = await readLatestSnapshotScope(scope)
  let refreshFailure: any = null
  if (snapshotNeedsWarm(row, query)) {
    try {
      await warmExternalControlEscolarStudentScope({
        ...query,
        plantel: scope.plantel,
        ciclo: scope.cicloKey,
        cicloKey: scope.cicloKey
      })
      row = await readLatestSnapshotScope(scope)
    } catch (error) {
      // The external API is intentionally stale-while-revalidate. A Bridge or
      // campus outage must not erase the last roster already stored in Aurora.
      if (!row?.scope_key) throw error
      refreshFailure = publicFailure(error)
    }
  }

  if (!row?.scope_key) throw snapshotUnavailable(scope.plantel, scope.cicloKey)
  if (snapshotExpired(row)) {
    if (snapshotBeyondStaleIfErrorWindow(row)) {
      throw snapshotExpiredError(scope.plantel, scope.cicloKey, row, refreshFailure)
    }
    refreshFailure ||= {
      statusCode: 503,
      code: 'AURORA_STUDENT_REFRESH_DID_NOT_ADVANCE',
      message: 'Aurora no pudo renovar el padrón; se sirve el último snapshot Aurora disponible.'
    }
  }
  return { scope, row, refreshFailure }
"""
new_assert = """  const row = await readLatestSnapshotScope(scope)
  if (!row?.scope_key) throw snapshotUnavailable(scope.plantel, scope.cicloKey)

  // Consumer reads are snapshot-only. Age is telemetry, never a permission to
  // read, and a request must never depend on a campus bridge being online.
  return { scope, row, refreshFailure: null }
"""
text = replace_once(text, old_assert, new_assert, snapshot_path)
snapshot_path.write_text(text)


presenter_path = Path('server/utils/control-escolar-external-snapshot-presenter.ts')
text = presenter_path.read_text()
old_meta = """export const withExternalSnapshotMeta = (responseValue: any, query: any = {}) => {
  const response = normalizeSnapshotResponseData(responseValue)
  return {
    ...(response || {}),
    meta: {
      ...(response?.meta || {}),
      source: 'aurora-control-escolar-central-snapshot',
      fallback: false,
      freshRequested: isExternalFreshReadRequested(query),
      cachePolicy: 'central-snapshot-only'
    }
  }
}"""
new_meta = """export const withExternalSnapshotMeta = (responseValue: any, query: any = {}) => {
  const response = normalizeSnapshotResponseData(responseValue)
  const freshness = String(response?.meta?.freshness || '').toLowerCase()
  const persistedFallback = freshness === 'stale' || freshness === 'expired'
  return {
    ...(response || {}),
    meta: {
      ...(response?.meta || {}),
      source: 'aurora-control-escolar-central-snapshot',
      fallback: persistedFallback,
      freshRequested: isExternalFreshReadRequested(query),
      cachePolicy: 'persistent-compatible-snapshot'
    }
  }
}"""
text = replace_once(text, old_meta, new_meta, presenter_path)
presenter_path.write_text(text)
