from pathlib import Path
import re

ROOT = Path('.')


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: {label}: expected 1 match, found {count}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


def regex_once(path: Path, pattern: str, replacement: str, label: str, flags: int = 0) -> None:
    text = path.read_text(encoding='utf-8')
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{path}: {label}: expected 1 match, found {count}')
    path.write_text(updated, encoding='utf-8')


snapshot = ROOT / 'server/utils/control-escolar-external-snapshot.ts'
replace_once(
    snapshot,
    "  readExternalControlEscolarStudentDetail,\n  readExternalControlEscolarStudents,\n  warmExternalControlEscolarStudentScope\n} from './control-escolar-external-view'",
    "  readExternalControlEscolarStudentDetail,\n  readExternalControlEscolarStudents\n} from './control-escolar-external-view'",
    'remove request-time bridge warm import',
)
replace_once(snapshot, "const FRESH_REQUEST_MAX_AGE_MS = 60_000\n", "", 'remove request-time freshness age')
regex_once(
    snapshot,
    r"\nconst timestamp = \(value: unknown\) => \{[\s\S]*?\n\}\n\nconst wantsFreshSnapshot = \(query: any = \{\}\) =>[\s\S]*?\n  return false\n\}\n",
    "\n",
    'remove synchronous refresh decision helpers',
)
replace_once(
    snapshot,
    "  message: `Aurora no pudo generar un snapshot canónico de ${plantel} para ciclo ${ciclo}.`,",
    "  message: `Aurora no tiene un snapshot canónico persistido de ${plantel} para ciclo ${ciclo}.`,",
    'clarify missing snapshot error',
)
regex_once(
    snapshot,
    r"export const assertExternalControlEscolarSnapshotReady = async \(query: any = \{\}\) => \{[\s\S]*?\n  return \{ scope, row \}\n\}",
    """export const assertExternalControlEscolarSnapshotReady = async (query: any = {}) => {
  const scope = buildExternalControlEscolarScope(query)
  if (!scope.plantel) throw createError({ statusCode: 400, statusMessage: 'PLANTEL_REQUIRED', message: 'El plantel es obligatorio.' })
  if (!scope.cicloKey) throw createError({ statusCode: 400, statusMessage: 'CICLO_REQUIRED', message: 'El ciclo escolar es obligatorio.' })

  await ensureControlEscolarExternalViewSchema()
  const row = await readLatestSnapshotScope(scope)
  // Consumer reads are snapshot-only by design. Refreshing belongs to the
  // background producer; stale/expired timestamps describe freshness, never
  // whether the last-known-good snapshot is allowed to be read.
  if (!row?.scope_key) throw snapshotUnavailable(scope.plantel, scope.cicloKey)
  return { scope, row }
}""",
    'make persisted snapshot availability independent from bridge',
)

view = ROOT / 'server/utils/control-escolar-external-view.ts'
replace_once(
    view,
    """  if (students.length === 0) {
    await ensureControlEscolarExternalViewSchema()
    await controlEscolarCentralQuery(
      `DELETE FROM ${EXTERNAL_VIEW_TABLE} WHERE plantel = ? AND ciclo_key = ? AND view_version = ?`,
      [scope.plantel, scope.cicloKey, VIEW_VERSION]
    )
    throw createError({
      statusCode: 503,
      statusMessage: 'AURORA_CANONICAL_SNAPSHOT_EMPTY',
      message: `Control Escolar canónico no produjo alumnos para ${scope.plantel} en ciclo ${scope.cicloKey}; Aurora no conservará un snapshot anterior.`
    })
  }""",
    """  if (students.length === 0) {
    // Never destroy the last-known-good snapshot because a refresh returned an
    // empty dataset. Availability is the reason this persisted snapshot exists.
    throw createError({
      statusCode: 503,
      statusMessage: 'AURORA_CANONICAL_SNAPSHOT_EMPTY',
      message: `Control Escolar canónico no produjo alumnos para ${scope.plantel} en ciclo ${scope.cicloKey}; Aurora conservará el último snapshot válido.`
    })
  }""",
    'preserve last-known-good snapshot on empty refresh',
)

presenter = ROOT / 'server/utils/control-escolar-external-snapshot-presenter.ts'
replace_once(
    presenter,
    "export const withExternalSnapshotMeta = (responseValue: any, query: any = {}) => {\n  const response = normalizeControlEscolarExternalResponse(responseValue)\n  return {",
    "export const withExternalSnapshotMeta = (responseValue: any, query: any = {}) => {\n  const response = normalizeControlEscolarExternalResponse(responseValue)\n  const freshness = clean(response?.meta?.freshness, 40).toLowerCase()\n  const persistedFallback = freshness === 'stale' || freshness === 'expired'\n  return {",
    'derive persisted snapshot fallback state',
)
replace_once(
    presenter,
    "      source: 'aurora-control-escolar-canonical-snapshot',\n      fallback: false,\n      freshRequested: isExternalFreshReadRequested(query),",
    "      source: 'aurora-control-escolar-canonical-snapshot',\n      fallback: persistedFallback,\n      freshRequested: isExternalFreshReadRequested(query),",
    'expose stale snapshot fallback without rejecting availability',
)

print('patched snapshot offline availability')
