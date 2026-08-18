import crypto from 'node:crypto'
import { query, executeStatementTransaction, type SqlStatement } from './db'
import { controlEscolarCentralQuery, getCentralTableColumns, withControlEscolarCentralConnection } from './control-escolar-central'
import { fetchCentralMatriculaOverlays } from './central-matricula-overlay'
import { conceptBelongsToPlantel, conceptPlantelLabel } from '../../shared/utils/conceptPlantel'
import { normalizePlantel } from '../../shared/utils/grado'
import { parseServiciosCsv, serializeServiciosCsv } from '../../shared/utils/talleresServicios'

const clean = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)
const matriculaKey = (value: unknown) => clean(value, 64).toUpperCase().replace(/\s+/g, '')
const quote = (value: string) => `\`${String(value).replace(/`/g, '``')}\``
const isBlank = (value: unknown) => value === null || value === undefined || (typeof value === 'string' && !value.trim())
const comparable = (value: unknown) => {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return value.toString('base64')
  return String(value)
}

const normalizeName = (value: unknown) => clean(value, 300)
  .toUpperCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Z0-9 ]+/g, ' ')
  .replace(/\b(DE|DEL|LA|LAS|LOS|Y)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const nameTokens = (value: unknown) => normalizeName(value).split(' ').filter(Boolean)
const sortedName = (value: unknown) => nameTokens(value).sort().join(' ')

const bigrams = (value: string) => {
  const compact = value.replace(/\s+/g, ' ')
  if (compact.length < 2) return new Set([compact])
  const set = new Set<string>()
  for (let i = 0; i < compact.length - 1; i += 1) set.add(compact.slice(i, i + 2))
  return set
}

const dice = (a: string, b: string) => {
  if (!a || !b) return 0
  if (a === b) return 1
  const aa = bigrams(a)
  const bb = bigrams(b)
  let overlap = 0
  aa.forEach((token) => { if (bb.has(token)) overlap += 1 })
  return (2 * overlap) / Math.max(1, aa.size + bb.size)
}

const jaccard = (a: string[], b: string[]) => {
  const aa = new Set(a)
  const bb = new Set(b)
  if (!aa.size || !bb.size) return 0
  let intersection = 0
  aa.forEach((token) => { if (bb.has(token)) intersection += 1 })
  return intersection / (aa.size + bb.size - intersection)
}

const editSimilarity = (a: string, b: string) => {
  if (!a || !b) return 0
  if (a === b) return 1
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j]
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      diagonal = above
    }
  }
  return 1 - (previous[b.length] / Math.max(a.length, b.length, 1))
}

export const duplicateNameSimilarity = (a: unknown, b: unknown) => {
  const left = sortedName(a)
  const right = sortedName(b)
  if (!left || !right) return 0
  if (left === right) return 1
  const charScore = dice(left, right)
  const tokenScore = jaccard(left.split(' '), right.split(' '))
  const typoScore = editSimilarity(left, right)
  return Number(Math.max(
    charScore * 0.68 + tokenScore * 0.32,
    typoScore * 0.86 + tokenScore * 0.14,
  ).toFixed(4))
}

const pairKey = (a: unknown, b: unknown) => [matriculaKey(a), matriculaKey(b)].sort().join('::')
const pairParts = (a: unknown, b: unknown) => [matriculaKey(a), matriculaKey(b)].sort()

const candidateBlockKeys = (name: unknown) => {
  const tokens = Array.from(new Set(nameTokens(name).filter((token) => token.length >= 3))).sort()
  const keys = new Set<string>()
  for (let i = 0; i < tokens.length; i += 1) {
    for (let j = i + 1; j < tokens.length; j += 1) {
      keys.add(`p:${tokens[i].slice(0, 4)}:${tokens[j].slice(0, 4)}`)
    }
  }
  if (tokens.length <= 2 && tokens.length) {
    const initials = tokens.map((token) => token[0]).sort().join('')
    const lengthBucket = Math.round(tokens.join('').length / 3)
    keys.add(`i:${initials}:${lengthBucket}`)
  }
  return [...keys]
}

const activeResolutionStatus = "status IN ('completed','bridge_applied','central_pending','central_applied','recovery_required')"

const readMatriculaLinks = async () => {
  if (!await tableExists('alumno_matricula_links')) return [] as any[]
  return await query<any[]>(`SELECT id, previous_matricula, successor_matricula, created_at, updated_at FROM alumno_matricula_links`)
}

const matriculaLinkAssessment = async (aValue: unknown, bValue: unknown) => {
  const a = matriculaKey(aValue)
  const b = matriculaKey(bValue)
  if (!a || !b || a === b) return { knownChain: false, mergeConflict: false, links: [] as any[] }
  const links = await readMatriculaLinks()
  const adjacency = new Map<string, Set<string>>()
  const add = (leftValue: unknown, rightValue: unknown) => {
    const left = matriculaKey(leftValue)
    const right = matriculaKey(rightValue)
    if (!left || !right) return
    if (!adjacency.has(left)) adjacency.set(left, new Set())
    if (!adjacency.has(right)) adjacency.set(right, new Set())
    adjacency.get(left)?.add(right)
    adjacency.get(right)?.add(left)
  }
  links.forEach((row) => add(row.previous_matricula, row.successor_matricula))

  let knownChain = false
  if (adjacency.has(a) && adjacency.has(b)) {
    const queue = [a]
    const seen = new Set([a])
    while (queue.length && !knownChain) {
      const current = queue.shift() as string
      if (current === b) { knownChain = true; break }
      for (const next of adjacency.get(current) || []) {
        if (seen.has(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }
  }

  const aPrevious = links.find((row) => matriculaKey(row.previous_matricula) === a)
  const bPrevious = links.find((row) => matriculaKey(row.previous_matricula) === b)
  const aSuccessor = links.find((row) => matriculaKey(row.successor_matricula) === a)
  const bSuccessor = links.find((row) => matriculaKey(row.successor_matricula) === b)
  const mergeConflict = Boolean((aPrevious && bPrevious) || (aSuccessor && bSuccessor))
  return { knownChain, mergeConflict, links }
}

const areKnownMatriculaChain = async (aValue: unknown, bValue: unknown) => (await matriculaLinkAssessment(aValue, bValue)).knownChain

export const readDuplicateCandidates = async (limit = 100) => {
  const [rows, ignored, resolved, matriculaLinks] = await Promise.all([
    query<any[]>(`
      SELECT matricula, nombreCompleto, apellidoPaterno, apellidoMaterno, nombres, curp, plantel, grado, grupo, ciclo, estatus
      FROM base
      WHERE LOWER(TRIM(COALESCE(estatus, ''))) <> 'duplicado'
      ORDER BY nombreCompleto ASC, matricula ASC
      LIMIT 6000
    `),
    query<any[]>(`SELECT matricula_a, matricula_b FROM student_duplicate_ignored_pairs`),
    query<any[]>(`SELECT winner_matricula, loser_matricula FROM student_duplicate_resolutions WHERE ${activeResolutionStatus}`),
    tableExists('alumno_matricula_links')
      ? query<any[]>(`SELECT previous_matricula, successor_matricula FROM alumno_matricula_links`)
      : Promise.resolve([]),
  ])

  const ignoredSet = new Set(ignored.map((row) => pairKey(row.matricula_a, row.matricula_b)))
  const resolvedLosers = new Set(resolved.map((row) => matriculaKey(row.loser_matricula)))
  const liveRows = rows.filter((row) => !resolvedLosers.has(matriculaKey(row.matricula)))

  const identityParent = new Map<string, string>()
  const identityFind = (value: unknown): string => {
    const key = matriculaKey(value)
    if (!key) return ''
    if (!identityParent.has(key)) identityParent.set(key, key)
    const parent = identityParent.get(key) as string
    if (parent === key) return key
    const root = identityFind(parent)
    identityParent.set(key, root)
    return root
  }
  const identityUnion = (aValue: unknown, bValue: unknown) => {
    const a = identityFind(aValue)
    const b = identityFind(bValue)
    if (a && b && a !== b) identityParent.set(b, a)
  }
  matriculaLinks.forEach((row) => identityUnion(row.previous_matricula, row.successor_matricula))
  const isKnownMatriculaChain = (a: unknown, b: unknown) => {
    const aa = matriculaKey(a)
    const bb = matriculaKey(b)
    if (!aa || !bb || !identityParent.has(aa) || !identityParent.has(bb)) return false
    return identityFind(aa) === identityFind(bb)
  }

  const buckets = new Map<string, number[]>()

  liveRows.forEach((row, index) => {
    candidateBlockKeys(row.nombreCompleto || [row.apellidoPaterno, row.apellidoMaterno, row.nombres].filter(Boolean).join(' '))
      .forEach((key) => {
        const current = buckets.get(key) || []
        current.push(index)
        buckets.set(key, current)
      })
  })

  const pairs = new Map<string, any>()
  const consider = (left: any, right: any) => {
    const a = matriculaKey(left.matricula)
    const b = matriculaKey(right.matricula)
    if (!a || !b || a === b || isKnownMatriculaChain(a, b)) return
    const key = pairKey(a, b)
    if (ignoredSet.has(key) || pairs.has(key)) return

    const nameA = left.nombreCompleto || [left.apellidoPaterno, left.apellidoMaterno, left.nombres].filter(Boolean).join(' ')
    const nameB = right.nombreCompleto || [right.apellidoPaterno, right.apellidoMaterno, right.nombres].filter(Boolean).join(' ')
    const score = duplicateNameSimilarity(nameA, nameB)
    const curpA = clean(left.curp, 18).toUpperCase()
    const curpB = clean(right.curp, 18).toUpperCase()
    const sameCurp = Boolean(curpA && curpB && curpA === curpB)
    if (!sameCurp && score < 0.86) return

    pairs.set(key, {
      key,
      score: sameCurp ? Math.max(score, 0.99) : score,
      sameCurp,
      left: { matricula: a, nombre: clean(nameA, 255), plantel: normalizePlantel(left.plantel), grado: clean(left.grado, 40), grupo: clean(left.grupo, 20), ciclo: clean(left.ciclo, 20) },
      right: { matricula: b, nombre: clean(nameB, 255), plantel: normalizePlantel(right.plantel), grado: clean(right.grado, 40), grupo: clean(right.grupo, 20), ciclo: clean(right.ciclo, 20) },
    })
  }

  buckets.forEach((indexes) => {
    const unique = Array.from(new Set(indexes))
    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) consider(liveRows[unique[i]], liveRows[unique[j]])
    }
  })

  // CURP equality is strong enough to compare even when names do not land in the same block.
  const curpBuckets = new Map<string, any[]>()
  liveRows.forEach((row) => {
    const curp = clean(row.curp, 18).toUpperCase()
    if (!curp || curp.length < 16) return
    const list = curpBuckets.get(curp) || []
    list.push(row)
    curpBuckets.set(curp, list)
  })
  curpBuckets.forEach((items) => {
    for (let i = 0; i < items.length; i += 1) for (let j = i + 1; j < items.length; j += 1) consider(items[i], items[j])
  })

  const sorted = [...pairs.values()]
    .sort((a, b) => b.score - a.score || a.left.nombre.localeCompare(b.left.nombre, 'es'))

  if (Number(limit) <= 0) return sorted
  return sorted.slice(0, Math.max(1, Math.min(250, Number(limit || 100))))
}

const readBridgeStudentSummary = async (matricula: string) => {
  const [base] = await query<any[]>(`SELECT * FROM base WHERE UPPER(TRIM(matricula)) = ? LIMIT 1`, [matricula])
  if (!base) throw createError({ statusCode: 404, message: `No se encontró la matrícula ${matricula}.` })

  const [documents, payments] = await Promise.all([
    query<any[]>(`
      SELECT documento, concepto, conceptoNombre, costo, montoFinal, meses, ciclo, eventual, estatus
      FROM documentos
      WHERE UPPER(TRIM(matricula)) = ?
      ORDER BY documento DESC
      LIMIT 250
    `, [matricula]),
    query<any[]>(`
      SELECT folio, folio_plantel, documento, mes, mesReal, concepto, conceptoNombre, monto, fecha, formaDePago, ciclo, estatus
      FROM referenciasdepago
      WHERE UPPER(TRIM(matricula)) = ?
      ORDER BY fecha DESC, folio DESC
      LIMIT 500
    `, [matricula]),
  ])

  const activeDocuments = documents.filter((row) => String(row.estatus || '').trim().toLowerCase() === 'activo')
  const activePayments = payments.filter((row) => String(row.estatus || '').trim().toLowerCase() === 'vigente')

  return {
    rawBase: base,
    summary: {
      matricula,
      nombre: clean(base.nombreCompleto || [base.apellidoPaterno, base.apellidoMaterno, base.nombres].filter(Boolean).join(' '), 255),
      plantel: normalizePlantel(base.plantel),
      grado: clean(base.grado, 40),
      grupo: clean(base.grupo, 20),
      ciclo: clean(base.ciclo, 20),
      estatus: clean(base.estatus, 40),
      curpLocal: clean(base.curp, 18).toUpperCase(),
      correo: clean(base.correo, 255),
      telefono: clean(base.telefono, 80),
    },
    documents: documents.map((row) => ({ ...row, costo: Number(row.costo || 0), montoFinal: Number(row.montoFinal ?? row.costo ?? 0) })),
    payments: payments.map((row) => ({ ...row, monto: Number(row.monto || 0) })),
    counts: {
      documents: documents.length,
      activeDocuments: activeDocuments.length,
      payments: payments.length,
      activePayments: activePayments.length,
      paid: activePayments.reduce((sum, row) => sum + Number(row.monto || 0), 0),
    },
  }
}

export const readDuplicatePreview = async (aValue: unknown, bValue: unknown) => {
  const a = matriculaKey(aValue)
  const b = matriculaKey(bValue)
  if (!a || !b || a === b) throw createError({ statusCode: 400, message: 'Selecciona dos matrículas distintas.' })

  const [left, right, continuity] = await Promise.all([
    readBridgeStudentSummary(a),
    readBridgeStudentSummary(b),
    matriculaLinkAssessment(a, b),
  ])
  let centralAvailable = true
  let overlays = new Map<string, any>()
  try {
    overlays = await fetchCentralMatriculaOverlays([a, b])
  } catch (error) {
    centralAvailable = false
  }

  const centralSummary = (matricula: string) => {
    const student = overlays.get(matricula)?.student || null
    return student ? {
      exists: true,
      curp: clean(student.curp, 18).toUpperCase(),
      nombre: clean(student.nombreCompleto || student.fullName, 255),
      plantel: normalizePlantel(student.plantel),
      grado: clean(student.grado, 40),
      grupo: clean(student.grupo, 20),
      fechaNacimiento: clean(student.fechaNacimiento, 40),
      padre: clean(student.padre, 255),
      madre: clean(student.madre, 255),
    } : { exists: false }
  }

  const nameScore = duplicateNameSimilarity(left.summary.nombre, right.summary.nombre)
  const leftCentral = centralSummary(a)
  const rightCentral = centralSummary(b)
  const curpA = clean((leftCentral as any).curp || left.summary.curpLocal, 18).toUpperCase()
  const curpB = clean((rightCentral as any).curp || right.summary.curpLocal, 18).toUpperCase()

  return {
    pairKey: pairKey(a, b),
    similarity: {
      name: nameScore,
      sameCurp: Boolean(curpA && curpB && curpA === curpB),
      samePlantel: normalizePlantel(left.summary.plantel) === normalizePlantel(right.summary.plantel),
      sameGrade: clean(left.summary.grado).toLowerCase() === clean(right.summary.grado).toLowerCase(),
    },
    centralAvailable,
    knownMatriculaChain: continuity.knownChain,
    continuityConflict: continuity.mergeConflict,
    left: { ...left, central: leftCentral },
    right: { ...right, central: rightCentral },
  }
}

export const ignoreDuplicatePair = async (aValue: unknown, bValue: unknown, userEmail: unknown) => {
  const [a, b] = pairParts(aValue, bValue)
  if (!a || !b || a === b) throw createError({ statusCode: 400, message: 'Par de matrículas inválido.' })
  await query(`
    INSERT INTO student_duplicate_ignored_pairs (matricula_a, matricula_b, created_by)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE created_by = VALUES(created_by), created_at = CURRENT_TIMESTAMP
  `, [a, b, clean(userEmail, 255) || null])
  return { success: true }
}

const SAFE_BASE_MERGE_COLUMNS = [
  'nombreCompleto', 'apellidoPaterno', 'apellidoMaterno', 'nombres', 'curp', 'genero', 'correo', 'telefono',
  'Nombre del padre o tutor', 'Fecha de nacimiento', 'direccion', 'domicilio'
]

const CENTRAL_MERGE_COLUMNS = [
  'plantel', 'nivel', 'grado', 'grupo', 'interno',
  'curp', 'nombres', 'apellido_paterno', 'apellido_materno', 'nombre_verificado', 'nombre_completo_alumno',
  'fecha_nacimiento', 'lugar_nacimiento', 'sexo', 'talla', 'peso', 'tipo_sangre', 'alergias',
  'email_padre', 'email_madre', 'correo_padre', 'correo_madre', 'telefono_padre', 'telefono_madre',
  'celular_padre', 'celular_madre', 'nombre_padre', 'apellido_paterno_padre', 'apellido_materno_padre',
  'lugar_trabajo_padre', 'puesto_padre', 'estado_civil_padre', 'fecha_nacimiento_padre', 'ine_padre', 'curp_padre',
  'nombre_padre_completo', 'padre', 'tutor', 'padre_tutor', 'ocupacion_padre', 'ocupacion_tutor',
  'nombre_madre', 'apellido_paterno_madre', 'apellido_materno_madre', 'lugar_trabajo_madre', 'puesto_madre',
  'estado_civil_madre', 'fecha_nacimiento_madre', 'ine_madre', 'curp_madre', 'nombre_madre_completo', 'madre',
  'ocupacion_madre', 'servicio', 'servicios', 'direccion', 'domicilio', 'calle', 'domicilio_calle', 'domicilio_num',
  'domicio_num', 'domicilio_colonia', 'domicilio_cp', 'domicilio_municipio', 'servicio_notas'
]

const CENTRAL_COPY_COLUMNS = Array.from(new Set([
  ...CENTRAL_MERGE_COLUMNS,
  'baja', 'motivo_baja', 'categoria_baja', 'seguimiento_baja',
  'certificado_medico_adjunto', 'certificado_vacunacion_covid19_adjunto', 'acta_nacimiento_adjunta',
  'curp_alumno_adjunto', 'certificado_primaria_adjunto', 'boleta_sexto_primaria_adjunta',
  'boleta_primero_secundaria_adjunta', 'boleta_segundo_secundaria_adjunta', 'foto',
]))

const fingerprintRow = (row: Record<string, any>, columns: string[]) => {
  const hash = crypto.createHash('sha256')
  columns.forEach((column) => {
    hash.update(column)
    hash.update('\0')
    const value = row?.[column]
    if (Buffer.isBuffer(value)) hash.update(value)
    else hash.update(comparable(value))
    hash.update('\0')
  })
  return hash.digest('hex')
}

const FINANCIAL_TRANSFER_TABLES = [
  { table: 'documentos', key: 'documento' },
  { table: 'referenciasdepago', key: 'folio' },
  { table: 'facturas', key: 'id' },
  { table: 'factura_pagos', key: 'id' },
  { table: 'documento_monto_correcciones', key: 'id' },
  { table: 'documento_concepto_correcciones', key: 'id' },
  { table: 'concepto_stock_movements', key: 'id' },
  { table: 'cobranza_observaciones', key: 'id' },
]

const tableExists = async (table: string) => Boolean((await query<any[]>(`SHOW TABLES LIKE ?`, [table])).length)

const readTransferSnapshot = async (loser: string) => {
  const transfers: Record<string, { key: string; ids: Array<string | number> }> = {}
  for (const spec of FINANCIAL_TRANSFER_TABLES) {
    if (!await tableExists(spec.table)) continue
    const rows = await query<any[]>(`SELECT ${quote(spec.key)} AS row_key FROM ${quote(spec.table)} WHERE UPPER(TRIM(matricula)) = ?`, [loser])
    transfers[spec.table] = { key: spec.key, ids: rows.map((row) => row.row_key).filter((value) => value !== null && value !== undefined) }
  }
  return transfers
}

const readOptionalState = async (winner: string, loser: string) => {
  const state: any = {
    sections: { winner: [], loser: [] },
    family: { winner: null, loser: null },
    tipoIngreso: { winner: null, loser: null },
    cobranza: { events: { winner: [], loser: [] }, exceptions: { winner: [], loser: [] } },
    matriculaLinks: { winner: [], loser: [] },
  }
  if (await tableExists('student_custom_section_memberships')) {
    state.sections.winner = await query<any[]>(`SELECT section_id FROM student_custom_section_memberships WHERE UPPER(TRIM(matricula)) = ?`, [winner])
    state.sections.loser = await query<any[]>(`SELECT section_id FROM student_custom_section_memberships WHERE UPPER(TRIM(matricula)) = ?`, [loser])
  }
  if (await tableExists('student_family_links')) {
    ;[state.family.winner] = await query<any[]>(`SELECT id, family_key FROM student_family_links WHERE UPPER(TRIM(matricula)) = ? LIMIT 1`, [winner])
    ;[state.family.loser] = await query<any[]>(`SELECT id, family_key FROM student_family_links WHERE UPPER(TRIM(matricula)) = ? LIMIT 1`, [loser])
  }
  if (await tableExists('student_tipo_ingreso_overrides')) {
    ;[state.tipoIngreso.winner] = await query<any[]>(`SELECT * FROM student_tipo_ingreso_overrides WHERE UPPER(TRIM(matricula)) = ? LIMIT 1`, [winner])
    ;[state.tipoIngreso.loser] = await query<any[]>(`SELECT * FROM student_tipo_ingreso_overrides WHERE UPPER(TRIM(matricula)) = ? LIMIT 1`, [loser])
  }
  if (await tableExists('cobranza_eventos')) {
    state.cobranza.events.winner = await query<any[]>(`SELECT * FROM cobranza_eventos WHERE UPPER(TRIM(matricula)) = ? ORDER BY id`, [winner])
    state.cobranza.events.loser = await query<any[]>(`SELECT * FROM cobranza_eventos WHERE UPPER(TRIM(matricula)) = ? ORDER BY id`, [loser])
  }
  if (await tableExists('cobranza_excepciones')) {
    state.cobranza.exceptions.winner = await query<any[]>(`SELECT * FROM cobranza_excepciones WHERE UPPER(TRIM(matricula)) = ? ORDER BY id`, [winner])
    state.cobranza.exceptions.loser = await query<any[]>(`SELECT * FROM cobranza_excepciones WHERE UPPER(TRIM(matricula)) = ? ORDER BY id`, [loser])
  }
  if (await tableExists('alumno_matricula_links')) {
    state.matriculaLinks.winner = await query<any[]>(
      `SELECT * FROM alumno_matricula_links WHERE UPPER(TRIM(previous_matricula)) = ? OR UPPER(TRIM(successor_matricula)) = ? ORDER BY id`,
      [winner, winner],
    )
    state.matriculaLinks.loser = await query<any[]>(
      `SELECT * FROM alumno_matricula_links WHERE UPPER(TRIM(previous_matricula)) = ? OR UPPER(TRIM(successor_matricula)) = ? ORDER BY id`,
      [loser, loser],
    )
  }
  return state
}

const buildBaseMergePatch = (winnerRow: any, loserRow: any) => SAFE_BASE_MERGE_COLUMNS
  .filter((column) => Object.prototype.hasOwnProperty.call(winnerRow, column) && Object.prototype.hasOwnProperty.call(loserRow, column))
  .filter((column) => isBlank(winnerRow[column]) && !isBlank(loserRow[column]))
  .map((column) => ({ column, before: winnerRow[column] ?? null, merged: loserRow[column] }))

const applyCentralMerge = async (
  winner: string,
  loser: string,
  userEmail: string,
  onPlanned?: (patch: any) => Promise<void>,
) => {
  const columns = await getCentralTableColumns('matricula')
  return await withControlEscolarCentralConnection(async (connection) => {
    await connection.beginTransaction()
    try {
      const [winnerRows] = await connection.query<any[]>(`SELECT * FROM matricula WHERE UPPER(TRIM(matricula)) = ? LIMIT 1 FOR UPDATE`, [winner])
      const [loserRows] = await connection.query<any[]>(`SELECT * FROM matricula WHERE UPPER(TRIM(matricula)) = ? LIMIT 1 FOR UPDATE`, [loser])
      const winnerRow = winnerRows[0] || null
      const loserRow = loserRows[0] || null
      if (!winnerRow && !loserRow) {
        const patch = { winnerExisted: false, loserExisted: false, changes: [] as any[] }
        if (onPlanned) await onPlanned(patch)
        await connection.commit()
        return patch
      }

      if (!winnerRow && loserRow) {
        // Create only the known Control Escolar payload, including its attachments. The Bridge audit stores
        // a compact fingerprint instead of serializing BLOBs into LONGTEXT, while the losing central row is
        // deliberately retained as the reversible source record.
        const copiedColumns = CENTRAL_COPY_COLUMNS.filter((column) => columns.has(column))
        const patch = {
          winnerExisted: false,
          loserExisted: true,
          sourceLoser: loser,
          createdWinner: true,
          copiedColumns,
          createdFingerprint: fingerprintRow(loserRow, copiedColumns),
          changes: [] as any[],
        }
        // Persist the exact compensation plan in Bridge while the central rows are still locked and before
        // central is mutated. A process interruption can therefore be reversed without guessing whether the
        // central commit happened.
        if (onPlanned) await onPlanned(patch)
        const insertColumns = ['matricula', ...copiedColumns]
        const values = [winner, ...copiedColumns.map((column) => loserRow[column] ?? null)]
        await connection.query(`INSERT INTO matricula (${insertColumns.map(quote).join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`, values)
        await connection.commit()
        return patch
      }

      if (!winnerRow || !loserRow) {
        const patch = { winnerExisted: Boolean(winnerRow), loserExisted: Boolean(loserRow), changes: [] as any[] }
        if (onPlanned) await onPlanned(patch)
        await connection.commit()
        return patch
      }

      const serviceField = columns.has('servicio') ? 'servicio' : columns.has('servicios') ? 'servicios' : ''
      const changes = CENTRAL_MERGE_COLUMNS
        .filter((column) => columns.has(column) && column !== 'servicio' && column !== 'servicios')
        .filter((column) => isBlank(winnerRow[column]) && !isBlank(loserRow[column]))
        .map((column) => ({ column, before: winnerRow[column] ?? null, merged: loserRow[column] }))

      // Services are a set, not a scalar identity field. Preserve the canonical student's existing
      // services and add any distinct services carried only by the duplicate record.
      if (serviceField) {
        const winnerServices = parseServiciosCsv(winnerRow[serviceField])
        const loserServices = parseServiciosCsv(loserRow[serviceField])
        const mergedServices = serializeServiciosCsv([...winnerServices, ...loserServices])
        const currentServices = serializeServiciosCsv(winnerServices)
        if (mergedServices && mergedServices !== currentServices) {
          changes.push({ column: serviceField, before: winnerRow[serviceField] ?? null, merged: mergedServices })
        }
      }

      const patch = { winnerExisted: true, loserExisted: true, createdWinner: false, changes }
      if (onPlanned) await onPlanned(patch)
      if (changes.length) {
        const assignments = changes.map((change) => `${quote(change.column)} = ?`)
        const values = changes.map((change) => change.merged)
        if (columns.has('updated_by')) { assignments.push('`updated_by` = ?'); values.push(userEmail) }
        if (columns.has('updated_at')) assignments.push('`updated_at` = CURRENT_TIMESTAMP')
        values.push(winner)
        await connection.query(`UPDATE matricula SET ${assignments.join(', ')} WHERE UPPER(TRIM(matricula)) = ?`, values)
      }
      await connection.commit()
      return patch
    } catch (error) {
      await connection.rollback()
      throw error
    }
  })
}

const reverseCentralMerge = async (winner: string, centralPatch: any) => {
  if (!centralPatch) return { reverted: 0, skipped: 0 }
  const columns = await getCentralTableColumns('matricula')
  if (centralPatch.createdWinner) {
    // The winner did not exist centrally before the merge. Delete the generated record only while the
    // copied Control Escolar payload is still byte-for-byte equivalent to what was created.
    const rows = await controlEscolarCentralQuery<any[]>(`SELECT * FROM matricula WHERE UPPER(TRIM(matricula)) = ? LIMIT 1`, [winner])
    const current = rows[0]
    if (!current) return { reverted: 0, skipped: 0 }
    const copiedColumns = (Array.isArray(centralPatch.copiedColumns) ? centralPatch.copiedColumns : [])
      .filter((column: string) => columns.has(column))
    const untouched = Boolean(
      copiedColumns.length &&
      centralPatch.createdFingerprint &&
      fingerprintRow(current, copiedColumns) === String(centralPatch.createdFingerprint),
    )
    if (!untouched) return { reverted: 0, skipped: 1 }
    await controlEscolarCentralQuery(`DELETE FROM matricula WHERE UPPER(TRIM(matricula)) = ?`, [winner])
    return { reverted: 1, skipped: 0 }
  }

  const rows = await controlEscolarCentralQuery<any[]>(`SELECT * FROM matricula WHERE UPPER(TRIM(matricula)) = ? LIMIT 1`, [winner])
  const current = rows[0]
  if (!current) return { reverted: 0, skipped: (centralPatch.changes || []).length }
  const restorable = (centralPatch.changes || []).filter((change: any) => columns.has(change.column) && comparable(current[change.column]) === comparable(change.merged))
  if (!restorable.length) return { reverted: 0, skipped: (centralPatch.changes || []).length }
  await controlEscolarCentralQuery(`UPDATE matricula SET ${restorable.map((change: any) => `${quote(change.column)} = ?`).join(', ')} WHERE UPPER(TRIM(matricula)) = ?`, [...restorable.map((change: any) => change.before), winner])
  return { reverted: restorable.length, skipped: (centralPatch.changes || []).length - restorable.length }
}

const reapplyCentralMergePatch = async (winner: string, centralPatch: any) => {
  if (!centralPatch) return { reapplied: 0, skipped: 0 }
  const columns = await getCentralTableColumns('matricula')
  const changes = Array.isArray(centralPatch.changes) ? centralPatch.changes : []

  if (centralPatch.createdWinner) {
    const rows = await controlEscolarCentralQuery<any[]>(`SELECT matricula FROM matricula WHERE UPPER(TRIM(matricula)) = ? LIMIT 1`, [winner])
    if (rows[0]) return { reapplied: 0, skipped: 0 }

    const sourceLoser = matriculaKey(centralPatch.sourceLoser)
    const copiedColumns = (Array.isArray(centralPatch.copiedColumns) ? centralPatch.copiedColumns : [])
      .filter((column: string) => columns.has(column))
    if (!sourceLoser || !copiedColumns.length) throw new Error('Missing central duplicate source for compensation.')

    const loserRows = await controlEscolarCentralQuery<any[]>(`SELECT * FROM matricula WHERE UPPER(TRIM(matricula)) = ? LIMIT 1`, [sourceLoser])
    const source = loserRows[0]
    if (!source) throw new Error('Central duplicate source no longer exists for compensation.')

    const insertColumns = ['matricula', ...copiedColumns]
    await controlEscolarCentralQuery(
      `INSERT INTO matricula (${insertColumns.map(quote).join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`,
      [winner, ...copiedColumns.map((column: string) => source[column] ?? null)],
    )
    return { reapplied: copiedColumns.length, skipped: 0 }
  }

  const rows = await controlEscolarCentralQuery<any[]>(`SELECT * FROM matricula WHERE UPPER(TRIM(matricula)) = ? LIMIT 1`, [winner])
  const current = rows[0]
  if (!current) return { reapplied: 0, skipped: changes.length }
  const restorable = changes.filter((change: any) => columns.has(change.column) && comparable(current[change.column]) === comparable(change.before))
  if (!restorable.length) return { reapplied: 0, skipped: changes.length }
  await controlEscolarCentralQuery(
    `UPDATE matricula SET ${restorable.map((change: any) => `${quote(change.column)} = ?`).join(', ')} WHERE UPPER(TRIM(matricula)) = ?`,
    [...restorable.map((change: any) => change.merged), winner],
  )
  return { reapplied: restorable.length, skipped: changes.length - restorable.length }
}

export const mergeDuplicateStudents = async (winnerValue: unknown, loserValue: unknown, userEmailValue: unknown) => {
  const winner = matriculaKey(winnerValue)
  const loser = matriculaKey(loserValue)
  const userEmail = clean(userEmailValue, 255) || 'Sistema'
  if (!winner || !loser || winner === loser) throw createError({ statusCode: 400, message: 'Selecciona dos matrículas distintas.' })

  const [[winnerBase], [loserBase]] = await Promise.all([
    query<any[]>(`SELECT * FROM base WHERE UPPER(TRIM(matricula)) = ? LIMIT 1`, [winner]),
    query<any[]>(`SELECT * FROM base WHERE UPPER(TRIM(matricula)) = ? LIMIT 1`, [loser]),
  ])
  if (!winnerBase || !loserBase) throw createError({ statusCode: 404, message: 'No se encontraron ambas matrículas en el plantel activo.' })
  if (String(loserBase.estatus || '').trim().toLowerCase() === 'duplicado') throw createError({ statusCode: 409, message: 'La matrícula secundaria ya fue resuelta como duplicado.' })
  const continuity = await matriculaLinkAssessment(winner, loser)
  if (continuity.knownChain) {
    throw createError({ statusCode: 409, message: 'Estas matrículas ya están relacionadas por continuidad escolar.' })
  }
  if (continuity.mergeConflict) {
    throw createError({ statusCode: 409, message: 'Ambas matrículas tienen continuidad escolar distinta. Revísalas antes de unificar.' })
  }

  if (String(winnerBase.estatus || '').trim().toLowerCase() === 'duplicado') {
    throw createError({ statusCode: 409, message: 'La matrícula que se conservará ya pertenece a otra resolución.' })
  }

  const activeResolutions = await query<any[]>(`
    SELECT winner_matricula, loser_matricula
    FROM student_duplicate_resolutions
    WHERE ${activeResolutionStatus}
      AND (
        UPPER(TRIM(winner_matricula)) IN (?, ?)
        OR UPPER(TRIM(loser_matricula)) IN (?, ?)
      )
  `, [winner, loser, winner, loser])
  const winnerAlreadyLost = activeResolutions.some((row) => matriculaKey(row.loser_matricula) === winner)
  const loserAlreadyInvolved = activeResolutions.some((row) => {
    const activeWinner = matriculaKey(row.winner_matricula)
    const activeLoser = matriculaKey(row.loser_matricula)
    return activeWinner === loser || activeLoser === loser
  })
  if (winnerAlreadyLost) throw createError({ statusCode: 409, message: 'La matrícula que se conservará ya fue unificada en otra matrícula.' })
  if (loserAlreadyInvolved) throw createError({ statusCode: 409, message: 'La matrícula secundaria ya pertenece a una resolución activa.' })

  // A duplicate resolution is intentionally blocked when central Control Escolar is unavailable.
  // Financial operations remain offline-capable; identity merges require both sources to avoid a partial identity state.
  await controlEscolarCentralQuery<any[]>('SELECT 1 AS ok')

  const transfers = await readTransferSnapshot(loser)
  const optionalState = await readOptionalState(winner, loser)
  const basePatch = buildBaseMergePatch(winnerBase, loserBase)
  const resolutionKey = crypto.randomUUID()
  const bridgeSnapshot = {
    winnerBaseBefore: Object.fromEntries(basePatch.map((change) => [change.column, change.before])),
    basePatch,
    loserStatus: loserBase.estatus ?? null,
    transfers,
    optionalState,
  }

  const statements: SqlStatement[] = [
    {
      sql: `INSERT INTO student_duplicate_resolutions (resolution_key, winner_matricula, loser_matricula, winner_name, loser_name, status, bridge_snapshot, created_by) VALUES (?, ?, ?, ?, ?, 'preparing', ?, ?)`,
      params: [resolutionKey, winner, loser, clean(winnerBase.nombreCompleto, 255), clean(loserBase.nombreCompleto, 255), JSON.stringify(bridgeSnapshot), userEmail],
    },
  ]

  basePatch.forEach((change) => statements.push({ sql: `UPDATE base SET ${quote(change.column)} = ? WHERE UPPER(TRIM(matricula)) = ?`, params: [change.merged, winner] }))

  for (const [table, spec] of Object.entries(transfers)) {
    if (!spec.ids.length) continue
    for (let i = 0; i < spec.ids.length; i += 300) {
      const chunk = spec.ids.slice(i, i + 300)
      statements.push({
        sql: `UPDATE ${quote(table)} SET matricula = ? WHERE UPPER(TRIM(matricula)) = ? AND ${quote(spec.key)} IN (${chunk.map(() => '?').join(', ')})`,
        params: [winner, loser, ...chunk],
      })
    }
  }

  if (optionalState.sections.loser.length) {
    statements.push({
      sql: `INSERT IGNORE INTO student_custom_section_memberships (section_id, matricula, created_by) SELECT section_id, ?, ? FROM student_custom_section_memberships WHERE UPPER(TRIM(matricula)) = ?`,
      params: [winner, userEmail, loser],
    })
    statements.push({ sql: `DELETE FROM student_custom_section_memberships WHERE UPPER(TRIM(matricula)) = ?`, params: [loser] })
  }
  if (optionalState.family.loser) {
    if (!optionalState.family.winner) statements.push({ sql: `UPDATE student_family_links SET matricula = ? WHERE UPPER(TRIM(matricula)) = ?`, params: [winner, loser] })
    else statements.push({ sql: `DELETE FROM student_family_links WHERE UPPER(TRIM(matricula)) = ?`, params: [loser] })
  }
  if (optionalState.tipoIngreso.loser) {
    if (!optionalState.tipoIngreso.winner) statements.push({ sql: `UPDATE student_tipo_ingreso_overrides SET matricula = ? WHERE UPPER(TRIM(matricula)) = ?`, params: [winner, loser] })
    else statements.push({ sql: `DELETE FROM student_tipo_ingreso_overrides WHERE UPPER(TRIM(matricula)) = ?`, params: [loser] })
  }

  for (const row of optionalState.matriculaLinks?.loser || []) {
    const previous = matriculaKey(row.previous_matricula) === loser ? winner : matriculaKey(row.previous_matricula)
    const successor = matriculaKey(row.successor_matricula) === loser ? winner : matriculaKey(row.successor_matricula)
    if (!previous || !successor || previous === successor) {
      throw createError({ statusCode: 409, message: 'La continuidad escolar de las matrículas no permite una unificación segura.' })
    }
    statements.push({
      sql: `UPDATE alumno_matricula_links SET previous_matricula = ?, successor_matricula = ? WHERE id = ?`,
      params: [previous, successor, row.id],
    })
  }

  const winnerEventKeys = new Set((optionalState.cobranza?.events?.winner || []).map((row: any) => `${clean(row.ciclo, 50)}:${Number(row.mes || 0)}:${clean(row.accion, 50)}`))
  for (const row of optionalState.cobranza?.events?.loser || []) {
    const conflict = winnerEventKeys.has(`${clean(row.ciclo, 50)}:${Number(row.mes || 0)}:${clean(row.accion, 50)}`)
    statements.push(conflict
      ? { sql: `DELETE FROM cobranza_eventos WHERE id = ? AND UPPER(TRIM(matricula)) = ?`, params: [row.id, loser] }
      : { sql: `UPDATE cobranza_eventos SET matricula = ? WHERE id = ? AND UPPER(TRIM(matricula)) = ?`, params: [winner, row.id, loser] })
  }

  const winnerExceptionKeys = new Set((optionalState.cobranza?.exceptions?.winner || []).map((row: any) => `${clean(row.ciclo, 50)}:${Number(row.mes || 0)}`))
  for (const row of optionalState.cobranza?.exceptions?.loser || []) {
    const conflict = winnerExceptionKeys.has(`${clean(row.ciclo, 50)}:${Number(row.mes || 0)}`)
    statements.push(conflict
      ? { sql: `DELETE FROM cobranza_excepciones WHERE id = ? AND UPPER(TRIM(matricula)) = ?`, params: [row.id, loser] }
      : { sql: `UPDATE cobranza_excepciones SET matricula = ? WHERE id = ? AND UPPER(TRIM(matricula)) = ?`, params: [winner, row.id, loser] })
  }

  statements.push({ sql: `UPDATE base SET estatus = 'Duplicado' WHERE UPPER(TRIM(matricula)) = ?`, params: [loser] })
  statements.push({ sql: `UPDATE student_duplicate_resolutions SET status = 'bridge_applied' WHERE resolution_key = ?`, params: [resolutionKey] })

  await executeStatementTransaction(statements)

  let centralPatch: any = null
  let centralPlanPersisted = false
  try {
    centralPatch = await applyCentralMerge(winner, loser, userEmail, async (patch) => {
      centralPatch = patch
      await query(
        `UPDATE student_duplicate_resolutions SET status = 'central_pending', central_patch = ? WHERE resolution_key = ?`,
        [JSON.stringify(patch), resolutionKey],
      )
      centralPlanPersisted = true
    })
    await query(`UPDATE student_duplicate_resolutions SET status = 'completed', central_patch = ? WHERE resolution_key = ?`, [JSON.stringify(centralPatch), resolutionKey])
  } catch (error: any) {
    let compensationFailed = false
    // If the central plan reached Bridge, reversal is safe whether the central transaction committed or not:
    // reverseCentralMerge only restores values that actually match the planned merged state.
    if (centralPlanPersisted && centralPatch) {
      try {
        await reverseCentralMerge(winner, centralPatch)
      } catch (centralCompensationError: any) {
        compensationFailed = true
        console.error('[Duplicates] Central compensation failed.', { resolutionKey, message: centralCompensationError?.message || centralCompensationError })
      }
    }
    try {
      await reverseBridgeResolution(resolutionKey, userEmail, { markStatus: 'failed_reverted', skipCentral: true })
    } catch (bridgeCompensationError: any) {
      compensationFailed = true
      console.error('[Duplicates] Bridge compensation failed.', { resolutionKey, message: bridgeCompensationError?.message || bridgeCompensationError })
    }
    if (compensationFailed) {
      await query(`UPDATE student_duplicate_resolutions SET status = 'recovery_required' WHERE resolution_key = ?`, [resolutionKey]).catch(() => {})
    }
    throw createError({
      statusCode: 502,
      message: compensationFailed
        ? 'La unificación requiere revisión antes de volver a intentarla.'
        : 'No se pudo completar la unificación en Control Escolar. No se conservaron cambios parciales.',
    })
  }

  await query(`DELETE FROM student_duplicate_ignored_pairs WHERE (matricula_a = ? AND matricula_b = ?) OR (matricula_a = ? AND matricula_b = ?)`, [winner, loser, loser, winner]).catch(() => {})

  return {
    success: true,
    resolutionKey,
    winner,
    loser,
    transferred: Object.fromEntries(Object.entries(transfers).map(([table, spec]) => [table, spec.ids.length])),
    centralMergedFields: centralPatch?.createdWinner ? Number(centralPatch?.copiedColumns?.length || 0) : Number(centralPatch?.changes?.length || 0),
  }
}

const reverseBridgeResolution = async (resolutionKey: string, userEmail: string, options: { markStatus?: string; skipCentral?: boolean } = {}) => {
  const [resolution] = await query<any[]>(`SELECT * FROM student_duplicate_resolutions WHERE resolution_key = ? LIMIT 1`, [resolutionKey])
  if (!resolution) throw createError({ statusCode: 404, message: 'Resolución no encontrada.' })
  const winner = matriculaKey(resolution.winner_matricula)
  const loser = matriculaKey(resolution.loser_matricula)
  const snapshot = JSON.parse(String(resolution.bridge_snapshot || '{}'))
  const statements: SqlStatement[] = []

  for (const [table, specValue] of Object.entries(snapshot.transfers || {})) {
    const spec: any = specValue
    const ids = Array.isArray(spec.ids) ? spec.ids : []
    if (!ids.length) continue
    const chunks = []
    for (let i = 0; i < ids.length; i += 300) chunks.push(ids.slice(i, i + 300))
    for (const chunk of chunks) {
      statements.push({
        sql: `UPDATE ${quote(table)} SET matricula = ? WHERE UPPER(TRIM(matricula)) = ? AND ${quote(spec.key)} IN (${chunk.map(() => '?').join(', ')})`,
        params: [loser, winner, ...chunk],
      })
    }
  }

  const optional = snapshot.optionalState || {}
  if (optional.sections) {
    statements.push({ sql: `DELETE FROM student_custom_section_memberships WHERE UPPER(TRIM(matricula)) = ?`, params: [loser] })
    const loserSections = (optional.sections.loser || []).map((row: any) => Number(row.section_id)).filter(Boolean)
    loserSections.forEach((sectionId: number) => statements.push({ sql: `INSERT IGNORE INTO student_custom_section_memberships (section_id, matricula, created_by) VALUES (?, ?, ?)`, params: [sectionId, loser, userEmail] }))
    const winnerBefore = new Set((optional.sections.winner || []).map((row: any) => Number(row.section_id)))
    const transferredOnly = loserSections.filter((sectionId: number) => !winnerBefore.has(sectionId))
    transferredOnly.forEach((sectionId: number) => statements.push({ sql: `DELETE FROM student_custom_section_memberships WHERE section_id = ? AND UPPER(TRIM(matricula)) = ?`, params: [sectionId, winner] }))
  }

  if (optional.family?.loser?.family_key) {
    if (!optional.family.winner) {
      statements.push({
        sql: `DELETE FROM student_family_links WHERE UPPER(TRIM(matricula)) = ? AND family_key = ?`,
        params: [winner, optional.family.loser.family_key],
      })
    }
    statements.push({
      sql: `INSERT IGNORE INTO student_family_links (family_key, matricula) VALUES (?, ?)`,
      params: [optional.family.loser.family_key, loser],
    })
  }

  if (optional.tipoIngreso?.loser) {
    if (!optional.tipoIngreso.winner) {
      statements.push({
        sql: `DELETE FROM student_tipo_ingreso_overrides WHERE UPPER(TRIM(matricula)) = ? AND override_activo = ? AND tipo_forzado = ?`,
        params: [winner, optional.tipoIngreso.loser.override_activo, optional.tipoIngreso.loser.tipo_forzado],
      })
    }
    statements.push({
      sql: `INSERT IGNORE INTO student_tipo_ingreso_overrides (matricula, override_activo, tipo_forzado, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      params: [loser, optional.tipoIngreso.loser.override_activo, optional.tipoIngreso.loser.tipo_forzado, optional.tipoIngreso.loser.updated_by, optional.tipoIngreso.loser.created_at, optional.tipoIngreso.loser.updated_at],
    })
  }

  for (const row of optional.matriculaLinks?.loser || []) {
    const mergedPrevious = matriculaKey(row.previous_matricula) === loser ? winner : matriculaKey(row.previous_matricula)
    const mergedSuccessor = matriculaKey(row.successor_matricula) === loser ? winner : matriculaKey(row.successor_matricula)
    statements.push({
      sql: `UPDATE alumno_matricula_links SET previous_matricula = ?, successor_matricula = ? WHERE id = ? AND UPPER(TRIM(previous_matricula)) = ? AND UPPER(TRIM(successor_matricula)) = ?`,
      params: [row.previous_matricula, row.successor_matricula, row.id, mergedPrevious, mergedSuccessor],
    })
  }

  const winnerEventKeys = new Set((optional.cobranza?.events?.winner || []).map((row: any) => `${clean(row.ciclo, 50)}:${Number(row.mes || 0)}:${clean(row.accion, 50)}`))
  for (const row of optional.cobranza?.events?.loser || []) {
    const conflict = winnerEventKeys.has(`${clean(row.ciclo, 50)}:${Number(row.mes || 0)}:${clean(row.accion, 50)}`)
    if (conflict) {
      statements.push({
        sql: `INSERT IGNORE INTO cobranza_eventos (id, matricula, ciclo, mes, accion, fecha, usuario, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [row.id, loser, row.ciclo, row.mes, row.accion, row.fecha, row.usuario, row.metadata],
      })
    } else {
      statements.push({ sql: `UPDATE cobranza_eventos SET matricula = ? WHERE id = ? AND UPPER(TRIM(matricula)) = ?`, params: [loser, row.id, winner] })
    }
  }

  const winnerExceptionKeys = new Set((optional.cobranza?.exceptions?.winner || []).map((row: any) => `${clean(row.ciclo, 50)}:${Number(row.mes || 0)}`))
  for (const row of optional.cobranza?.exceptions?.loser || []) {
    const conflict = winnerExceptionKeys.has(`${clean(row.ciclo, 50)}:${Number(row.mes || 0)}`)
    if (conflict) {
      statements.push({
        sql: `INSERT IGNORE INTO cobranza_excepciones (id, matricula, ciclo, mes, fecha_limite_especial, motivo, activa, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [row.id, loser, row.ciclo, row.mes, row.fecha_limite_especial, row.motivo, row.activa, row.created_by, row.created_at],
      })
    } else {
      statements.push({ sql: `UPDATE cobranza_excepciones SET matricula = ? WHERE id = ? AND UPPER(TRIM(matricula)) = ?`, params: [loser, row.id, winner] })
    }
  }

  const basePatch = Array.isArray(snapshot.basePatch) ? snapshot.basePatch : []
  basePatch.forEach((change: any) => {
    statements.push({
      sql: `UPDATE base SET ${quote(change.column)} = ? WHERE UPPER(TRIM(matricula)) = ? AND (${quote(change.column)} = ? OR (${quote(change.column)} IS NULL AND ? IS NULL))`,
      params: [change.before, winner, change.merged, change.merged],
    })
  })
  statements.push({ sql: `UPDATE base SET estatus = ? WHERE UPPER(TRIM(matricula)) = ?`, params: [snapshot.loserStatus || 'Activo', loser] })
  statements.push({ sql: `UPDATE student_duplicate_resolutions SET status = ?, reverted_by = ?, reverted_at = CURRENT_TIMESTAMP WHERE resolution_key = ?`, params: [options.markStatus || 'reverted', userEmail, resolutionKey] })
  await executeStatementTransaction(statements)

  if (!options.skipCentral) {
    const centralPatch = resolution.central_patch ? JSON.parse(String(resolution.central_patch)) : null
    return { ...(await reverseCentralMerge(winner, centralPatch)), winner, loser }
  }
  return { winner, loser, reverted: 0, skipped: 0 }
}

export const reverseDuplicateResolution = async (resolutionKeyValue: unknown, userEmailValue: unknown) => {
  const resolutionKey = clean(resolutionKeyValue, 64)
  const userEmail = clean(userEmailValue, 255) || 'Sistema'
  if (!resolutionKey) throw createError({ statusCode: 400, message: 'Resolución requerida.' })
  const [resolution] = await query<any[]>(`SELECT * FROM student_duplicate_resolutions WHERE resolution_key = ? LIMIT 1`, [resolutionKey])
  if (!resolution) throw createError({ statusCode: 404, message: 'Resolución no encontrada.' })
  const status = String(resolution.status || '')
  const reversibleStatuses = new Set(['completed', 'bridge_applied', 'central_pending', 'central_applied'])
  if (!reversibleStatuses.has(status)) throw createError({ statusCode: 409, message: 'Esta resolución no puede revertirse en su estado actual.' })
  if (status !== 'completed') {
    const updatedAt = new Date(String(resolution.updated_at || resolution.created_at || '').replace(' ', 'T')).getTime()
    if (Number.isFinite(updatedAt) && Date.now() - updatedAt < 90_000) {
      throw createError({ statusCode: 409, message: 'La unificación todavía está en proceso. Intenta de nuevo en un momento.' })
    }
  }

  await controlEscolarCentralQuery<any[]>('SELECT 1 AS ok')
  const winner = matriculaKey(resolution.winner_matricula)
  const centralPatch = resolution.central_patch ? JSON.parse(String(resolution.central_patch)) : null
  const centralResult = await reverseCentralMerge(winner, centralPatch)

  try {
    const bridgeResult = await reverseBridgeResolution(resolutionKey, userEmail, { skipCentral: true })
    return { success: true, ...bridgeResult, ...centralResult }
  } catch (error: any) {
    try {
      await reapplyCentralMergePatch(winner, centralPatch)
    } catch (compensationError: any) {
      await query(`UPDATE student_duplicate_resolutions SET status = 'recovery_required' WHERE resolution_key = ?`, [resolutionKey]).catch(() => {})
      console.error('[Duplicates] Reverse compensation failed.', { resolutionKey, message: compensationError?.message || compensationError })
      throw createError({ statusCode: 502, message: 'La reversión requiere revisión antes de volver a intentarla.' })
    }
    throw createError({ statusCode: 502, message: 'No se pudo revertir la unificación. No se conservaron cambios parciales.' })
  }
}

export const readDuplicateHistory = async (limit = 50) => {
  const safeLimit = Math.max(1, Math.min(100, Number(limit || 50)))
  const rows = await query<any[]>(`
    SELECT resolution_key, winner_matricula, loser_matricula, winner_name, loser_name, status, created_by, created_at, updated_at, reverted_by, reverted_at
    FROM student_duplicate_resolutions
    ORDER BY id DESC
    LIMIT ${safeLimit}
  `)
  return rows
}

export const inspectForeignConceptAssignments = (raw: unknown, studentPlantel: unknown) => {
  const rows = clean(raw, 16000).split('||').map((entry) => {
    const [conceptoId = '', plantel = '', nombre = ''] = entry.split('~')
    return { conceptoId: Number(conceptoId || 0) || null, plantel: clean(plantel, 80), nombre: clean(nombre, 255) }
  }).filter((row) => row.conceptoId || row.nombre)

  const foreign = rows.filter((row) => !conceptBelongsToPlantel(row.plantel, studentPlantel))
  const seen = new Set<string>()
  return foreign.filter((row) => {
    const key = `${row.conceptoId}:${row.plantel}:${row.nombre}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).map((row) => ({ ...row, plantelLabel: conceptPlantelLabel(row.plantel) }))
}
