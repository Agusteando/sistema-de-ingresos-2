from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


# MySQL DATETIME stores whole seconds in the deployed schema. Generate the
# snapshot marker at that same precision so post-write cleanup cannot delete
# rows just inserted in the same second.
replace_once(
    'server/utils/control-escolar-external-view.ts',
    "const nowDate = () => new Date()\n",
    "const mysqlSecondPrecisionNow = () => new Date(Math.floor(Date.now() / 1000) * 1000)\n",
)
replace_once(
    'server/utils/control-escolar-external-view.ts',
    '  const generatedAt = nowDate()\n',
    '  const generatedAt = mysqlSecondPrecisionNow()\n',
)

replace_once(
    'server/utils/talleres-snapshot.ts',
    "const dateHoursFromNow = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000)\nconst refreshMinutes = () => {\n",
    "const dateHoursFromNow = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000)\nconst mysqlSecondPrecisionNow = () => new Date(Math.floor(Date.now() / 1000) * 1000)\nconst refreshMinutes = () => {\n",
)
replace_once(
    'server/utils/talleres-snapshot.ts',
    "    ...mergeDefined(current, incoming),\n    plantel: incoming.plantel || current.plantel,\n",
    "    // A preserved workshop row may contribute stale assignments, never stale\n    // academic placement. Fresh canonical Control Escolar fields always win.\n    ...mergeDefined(incoming, current),\n    plantel: current.plantel || incoming.plantel,\n",
)
replace_once(
    'server/utils/talleres-snapshot.ts',
    "const buildFreshStudents = async (plantel: string, ciclo: string, loads: SourceLoad[], catalog: any[]) => {\n  const resolve = assignmentResolver(catalog)\n  const aggregate = new Map<string, { base: any, direct: unknown[], financial: ConceptMappedServicioAssignment[], sources: Set<string> }>()\n\n  for (const load of loads) {\n    for (const raw of load.students) {\n      const mat = matriculaKey(raw?.matricula)\n      if (!mat) continue\n      const current = aggregate.get(mat) || { base: {}, direct: [], financial: [], sources: new Set<string>() }\n      current.base = mergeDefined(current.base, raw)\n      current.direct.push(raw?.servicio, raw?.servicios)\n      current.financial.push(...(load.financialAssignments.get(mat) || []))\n      current.sources.add(load.sourcePlantel)\n      aggregate.set(mat, current)\n    }\n  }\n\n  const matriculas = Array.from(aggregate.keys())\n",
    "const buildFreshStudents = async (plantel: string, ciclo: string, canonicalStudents: any[], loads: SourceLoad[], catalog: any[]) => {\n  const resolve = assignmentResolver(catalog)\n  const aggregate = new Map<string, { base: any, direct: unknown[], financial: ConceptMappedServicioAssignment[], sources: Set<string> }>()\n\n  // The roster and every academic field start from the exact same canonical\n  // Control Escolar projection exposed by the public student API. Source/Bridge\n  // reads below are enrichment-only and cannot replace grado/grupo/nivel/status.\n  for (const raw of canonicalStudents) {\n    const mat = matriculaKey(raw?.matricula)\n    if (!mat) continue\n    aggregate.set(mat, {\n      base: raw,\n      direct: [raw?.servicio, raw?.servicios],\n      financial: [],\n      sources: new Set<string>(),\n    })\n  }\n\n  for (const load of loads) {\n    const sourceByMatricula = new Map<string, any>()\n    for (const raw of load.students) {\n      const mat = matriculaKey(raw?.matricula)\n      if (mat) sourceByMatricula.set(mat, raw)\n    }\n    for (const [mat, current] of aggregate) {\n      const sourceRow = sourceByMatricula.get(mat)\n      if (sourceRow) current.direct.push(sourceRow?.servicio, sourceRow?.servicios)\n      const financial = load.financialAssignments.get(mat) || []\n      if (financial.length) current.financial.push(...financial)\n      if (sourceRow || financial.length) current.sources.add(load.sourcePlantel)\n    }\n  }\n\n  const matriculas = Array.from(aggregate.keys())\n",
)
replace_once(
    'server/utils/talleres-snapshot.ts',
    '  const generatedAt = new Date()\n',
    '  const generatedAt = mysqlSecondPrecisionNow()\n',
)
replace_once(
    'server/utils/talleres-snapshot.ts',
    "      const catalog = await readCatalog()\n      const loads: SourceLoad[] = []\n",
    "      const { readCanonicalExternalControlEscolarAllStudents } = await import('./control-escolar-external-canonical')\n      const canonical = await readCanonicalExternalControlEscolarAllStudents({\n        plantel,\n        ciclo,\n        cicloKey: ciclo,\n      })\n      const canonicalStudents = Array.isArray(canonical?.data) ? canonical.data : []\n      if (!canonicalStudents.length) {\n        throw createError({\n          statusCode: 503,\n          statusMessage: 'TALLERES_CANONICAL_ROSTER_EMPTY',\n          message: `Control Escolar canónico no produjo alumnos para ${plantel} en ciclo ${ciclo}; Talleres no generará una verdad académica alternativa.`,\n          data: { plantel, ciclo, source: canonical?.meta?.source || 'aurora-control-escolar-canonical' },\n        })\n      }\n\n      const catalog = await readCatalog()\n      const loads: SourceLoad[] = []\n",
)
replace_once(
    'server/utils/talleres-snapshot.ts',
    "      if (!loads.length && previous.students.length) {\n        return { success: true, skipped: true, reason: 'all_sources_failed_preserved', plantel, ciclo, rows: previous.students.length, failedSources }\n      }\n      if (!loads.length && !previous.students.length) {\n        throw createError({ statusCode: 502, statusMessage: 'TALLERES_SNAPSHOT_SOURCE_UNAVAILABLE', message: `No se pudo crear el snapshot de ${plantel}.`, data: { plantel, ciclo, failedSources } })\n      }\n\n      const fresh = await buildFreshStudents(plantel, ciclo, loads, catalog.catalog)\n",
    "      // Enrichment sources may all be unavailable; the academic roster still\n      // comes from canonical Control Escolar. Previous rows can contribute only\n      // workshop assignments through mergeFinalStudent below.\n      const fresh = await buildFreshStudents(plantel, ciclo, canonicalStudents, loads, catalog.catalog)\n",
)
replace_once(
    'server/utils/talleres-snapshot.ts',
    "      const sourceMeta = {\n        canonicalPlantel: plantel,\n",
    "      const sourceMeta = {\n        canonicalPlantel: plantel,\n        academicSource: canonical?.meta?.source || 'aurora-control-escolar-canonical',\n        canonicalRows: canonicalStudents.length,\n",
)

# Build-time regression guards.
verifier = Path('scripts/verify-academic-source.mjs')
text = verifier.read_text(encoding='utf-8')
text = text.replace(
    "const externalSnapshotPath = join(root, 'server/utils/control-escolar-external-snapshot.ts')\nconst [text, externalCanonicalText, externalViewText, externalSnapshotText] = await Promise.all([\n",
    "const externalSnapshotPath = join(root, 'server/utils/control-escolar-external-snapshot.ts')\nconst talleresSnapshotPath = join(root, 'server/utils/talleres-snapshot.ts')\nconst [text, externalCanonicalText, externalViewText, externalSnapshotText, talleresSnapshotText] = await Promise.all([\n",
    1,
)
text = text.replace(
    "  readFile(externalViewPath, 'utf8'),\n  readFile(externalSnapshotPath, 'utf8')\n])\n",
    "  readFile(externalViewPath, 'utf8'),\n  readFile(externalSnapshotPath, 'utf8'),\n  readFile(talleresSnapshotPath, 'utf8')\n])\n",
    1,
)
needle = "if (externalSnapshotText.includes('withCanonicalFallbackMeta') || externalSnapshotText.includes('overlayCanonicalMatriculaGroups')) failures.push('server/utils/control-escolar-external-snapshot.ts: no se permite rescatar snapshots viejos ni superponer una segunda interpretación')\n"
if text.count(needle) != 1:
    raise SystemExit('scripts/verify-academic-source.mjs: guard insertion point not found')
extra = needle + "if (!externalViewText.includes('mysqlSecondPrecisionNow') || !externalViewText.includes('const generatedAt = mysqlSecondPrecisionNow()')) failures.push('server/utils/control-escolar-external-view.ts: el marcador de generación debe respetar la precisión DATETIME de MySQL para no borrar filas recién escritas')\nif (!talleresSnapshotText.includes('readCanonicalExternalControlEscolarAllStudents') || !talleresSnapshotText.includes('canonicalStudents: any[]')) failures.push('server/utils/talleres-snapshot.ts: Talleres debe sembrar su roster desde Control Escolar canónico')\nif (talleresSnapshotText.includes('current.base = mergeDefined(current.base, raw)')) failures.push('server/utils/talleres-snapshot.ts: una fuente de enriquecimiento no puede reemplazar la base académica canónica')\nif (talleresSnapshotText.includes('...mergeDefined(current, incoming)')) failures.push('server/utils/talleres-snapshot.ts: una fila preservada no puede sobrescribir grado/grupo canónicos frescos')\nif (!talleresSnapshotText.includes('mysqlSecondPrecisionNow') || !talleresSnapshotText.includes('const generatedAt = mysqlSecondPrecisionNow()')) failures.push('server/utils/talleres-snapshot.ts: el snapshot de Talleres debe usar un marcador compatible con DATETIME')\n"
text = text.replace(needle, extra, 1)
verifier.write_text(text, encoding='utf-8')

print('Canonical consumer pipeline patch applied.')
