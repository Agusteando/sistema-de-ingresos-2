import { automaticSchoolCycleKey } from '../../shared/utils/ciclo'
import {
  calculatePromotedGrado,
  displayGrado,
  normalizePlantel,
  plantelCandidatesForProjectedScope
} from '../../shared/utils/grado'
import type { AuthSessionUser } from './auth-session'
import { query } from './db'
import { controlEscolarCentralQuery, getCentralTableColumns } from './control-escolar-central'
import {
  fetchControlEscolarCalculatedAcademicPlacement,
  fetchControlEscolarStudentDetail
} from './control-escolar'
import { buildExternalHeaders, getExternalSyncConfig } from './externalBaseSync'

const HUSKY_MEDIA_ORIGIN = 'https://admin.casitaiedis.edu.mx'
const MAX_SEARCH_ROWS = 120
const SEARCH_COLUMNS = [
  'matricula',
  'nombres',
  'apellido_paterno',
  'apellido_materno',
  'nombre_completo_alumno',
  'nombre_verificado',
  'nombre_padre',
  'apellido_paterno_padre',
  'apellido_materno_padre',
  'nombre_padre_completo',
  'padre',
  'tutor',
  'padre_tutor',
  'nombre_madre',
  'apellido_paterno_madre',
  'apellido_materno_madre',
  'nombre_madre_completo',
  'madre',
  'plantel',
  'grupo',
  'foto'
] as const

const SECRET_KEY_PATTERN = /(password|passwd|plaintext|token|secret|private[_-]?key|api[_-]?key|cookie|session|hash)/i

const text = (value: unknown, max = 2000) => String(value ?? '').trim().slice(0, max)
const upper = (value: unknown, max = 255) => text(value, max).toUpperCase()
const normalizeSearchText = (value: unknown) => text(value, 1000)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const escapeIdentifier = (value: string) => '`' + String(value).replace(/`/g, '``') + '`'
const sqlPlaceholders = (values: unknown[]) => values.map(() => '?').join(', ')
const nonEmpty = (value: unknown) => {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  return true
}

const joinName = (...values: unknown[]) => values.map((value) => text(value, 255)).filter(Boolean).join(' ')

const candidateScope = (plantel: string) => {
  const candidates = plantelCandidatesForProjectedScope(plantel)
  return candidates.length ? candidates : [normalizePlantel(plantel)].filter(Boolean)
}

const projectedAcademic = (row: any, targetPlantel: string) => {
  const sourcePlantel = normalizePlantel(row?.plantel || row?.basePlantel || targetPlantel)
  const grado = text(row?.grado || row?.baseGrado, 80)
  const ciclo = text(row?.ciclo || row?.baseCiclo, 40)
  const nivel = text(row?.nivel || row?.baseNivel, 80)

  if (!grado || !ciclo) {
    return {
      inScope: sourcePlantel === targetPlantel,
      plantel: sourcePlantel,
      nivel,
      grado: grado ? displayGrado(grado) : ''
    }
  }

  const projected = calculatePromotedGrado(
    grado,
    sourcePlantel,
    ciclo,
    automaticSchoolCycleKey(),
    nivel
  )
  return {
    inScope: !projected.outOfScope && normalizePlantel(projected.plantel) === targetPlantel,
    plantel: normalizePlantel(projected.plantel || sourcePlantel),
    nivel: text(projected.nivel || nivel, 80),
    grado: projected.grado ? displayGrado(projected.grado) : (grado ? displayGrado(grado) : '')
  }
}

const projectedIntoPlantel = (row: any, targetPlantel: string) =>
  projectedAcademic(row, targetPlantel).inScope

const localStudentSelect = [
  'b.matricula',
  'b.nombreCompleto',
  'b.apellidoPaterno',
  'b.apellidoMaterno',
  'b.nombres',
  'b.plantel',
  'b.nivel',
  'b.grado',
  'b.grupo',
  'b.estatus',
  'b.ciclo',
  'b.`Nombre del padre o tutor` AS legacyTutor',
  'b.telefono',
  'b.correo'
].join(', ')

const localRowsForMatriculas = async (plantel: string, matriculas: string[]) => {
  const unique = Array.from(new Set(matriculas.map((value) => upper(value, 64)).filter(Boolean)))
  if (!unique.length) return new Map<string, any>()

  const rows = await query<any[]>(
    'SELECT ' + localStudentSelect +
      ' FROM base b WHERE UPPER(TRIM(b.matricula)) IN (' + sqlPlaceholders(unique) + ')' +
      ' AND UPPER(TRIM(b.plantel)) IN (' + sqlPlaceholders(candidateScope(plantel)) + ')',
    [...unique, ...candidateScope(plantel)]
  )

  return new Map(
    rows
      .filter((row) => projectedIntoPlantel(row, plantel))
      .map((row) => [upper(row.matricula, 64), row])
  )
}

const searchLocalBase = async (plantel: string, search: string) => {
  const like = '%' + search + '%'
  const scopes = candidateScope(plantel)
  const rows = await query<any[]>(
    'SELECT ' + localStudentSelect +
      ' FROM base b' +
      ' WHERE UPPER(TRIM(b.plantel)) IN (' + sqlPlaceholders(scopes) + ')' +
      ' AND (' +
      ' b.matricula LIKE ? OR b.nombreCompleto LIKE ? OR b.apellidoPaterno LIKE ? OR' +
      ' b.apellidoMaterno LIKE ? OR b.nombres LIKE ? OR b.`Nombre del padre o tutor` LIKE ?' +
      ' ) ORDER BY b.estatus = \'Activo\' DESC, b.nombreCompleto ASC LIMIT ' + MAX_SEARCH_ROWS,
    [...scopes, like, like, like, like, like, like]
  )
  return rows.filter((row) => projectedIntoPlantel(row, plantel))
}

const searchCentralMatricula = async (plantel: string, search: string) => {
  try {
    const columns = await getCentralTableColumns('matricula')
    if (!columns.has('matricula')) return []

    const selected = SEARCH_COLUMNS.filter((column) => columns.has(column))
    const searchable = selected.filter((column) => !['plantel', 'grupo', 'foto'].includes(column))
    if (!searchable.length) return []

    const concat = searchable
      .map((column) => 'COALESCE(CAST(' + escapeIdentifier(column) + ' AS CHAR), \'\')')
      .join(', ')
    const scopes = candidateScope(plantel)
    const params: any[] = ['%' + search + '%']
    let scopeSql = ''

    if (columns.has('plantel')) {
      scopeSql = ' AND UPPER(TRIM(' + escapeIdentifier('plantel') + ')) IN (' + sqlPlaceholders(scopes) + ')'
      params.push(...scopes)
    }

    return await controlEscolarCentralQuery<any[]>(
      'SELECT ' + selected.map(escapeIdentifier).join(', ') +
        ' FROM `matricula` WHERE LOWER(CONCAT_WS(\' \', ' + concat + ')) LIKE ?' +
        scopeSql +
        ' ORDER BY ' + escapeIdentifier('matricula') + ' ASC LIMIT ' + MAX_SEARCH_ROWS,
      params
    )
  } catch (error: any) {
    console.warn('[Buscador] central matricula search unavailable', {
      plantel,
      message: error?.message || String(error)
    })
    return []
  }
}

const findMatch = (row: any, queryValue: string) => {
  const query = normalizeSearchText(queryValue)
  const matricula = normalizeSearchText(row?.matricula)
  const studentName = normalizeSearchText(joinName(
    row?.nombreCompleto,
    row?.nombre_completo_alumno,
    row?.apellido_paterno,
    row?.apellidoPaterno,
    row?.apellido_materno,
    row?.apellidoMaterno,
    row?.nombres
  ))
  const fatherName = normalizeSearchText(joinName(
    row?.nombre_padre,
    row?.nombrePadre,
    row?.apellido_paterno_padre,
    row?.apellidoPaternoPadre,
    row?.apellido_materno_padre,
    row?.apellidoMaternoPadre,
    row?.nombre_padre_completo,
    row?.padre,
    row?.tutor,
    row?.padre_tutor,
    row?.legacyTutor
  ))
  const motherName = normalizeSearchText(joinName(
    row?.nombre_madre,
    row?.nombreMadre,
    row?.apellido_paterno_madre,
    row?.apellidoPaternoMadre,
    row?.apellido_materno_madre,
    row?.apellidoMaternoMadre,
    row?.nombre_madre_completo,
    row?.madre
  ))

  if (matricula && matricula === query) return { type: 'matricula', label: 'Matrícula', value: text(row?.matricula, 64), score: 100 }
  if (studentName && studentName.includes(query)) return { type: 'student', label: 'Alumno', value: text(row?.nombreCompleto || row?.nombre_completo_alumno || joinName(row?.apellido_paterno, row?.apellido_materno, row?.nombres), 255), score: studentName.startsWith(query) ? 94 : 88 }
  if (fatherName && fatherName.includes(query)) return { type: 'father', label: 'Papá / tutor', value: text(joinName(row?.nombre_padre, row?.apellido_paterno_padre, row?.apellido_materno_padre) || row?.nombre_padre_completo || row?.padre || row?.tutor || row?.padre_tutor || row?.legacyTutor, 255), score: fatherName.startsWith(query) ? 93 : 90 }
  if (motherName && motherName.includes(query)) return { type: 'mother', label: 'Mamá', value: text(joinName(row?.nombre_madre, row?.apellido_paterno_madre, row?.apellido_materno_madre) || row?.nombre_madre_completo || row?.madre, 255), score: motherName.startsWith(query) ? 93 : 90 }
  return { type: 'other', label: 'Coincidencia', value: queryValue, score: 70 }
}

const resolveStudentPhoto = (value: unknown) => {
  const raw = text(value, 2048)
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw
  if (raw.startsWith('//')) return 'https:' + raw
  const config = useRuntimeConfig() as any
  const origin = String(config.studentPhotoBaseUrl || 'https://matricula.casitaapps.com').replace(/\/+$/, '')
  const normalized = raw.replace(/\\/g, '/').replace(/^\.\//, '')
  const path = normalized.startsWith('/') ? normalized : normalized.includes('/') ? '/' + normalized : '/uploads/' + normalized
  return origin + path
}

const resolveHuskyPhoto = (value: unknown) => {
  const raw = text(value, 10000)
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw
  if (raw.startsWith('//')) return 'https:' + raw
  if (/^\/?virtual\//i.test(raw)) return HUSKY_MEDIA_ORIGIN + '/virtual/' + raw.replace(/^\/?virtual\//i, '')
  if (raw.startsWith('/')) return HUSKY_MEDIA_ORIGIN + raw
  return HUSKY_MEDIA_ORIGIN + '/virtual/' + raw
}

const canonicalPhotoFallback = async (matricula: string, existing = '') => {
  if (existing) return existing

  try {
    const syncConfig = getExternalSyncConfig()
    if (!syncConfig.apiKey) return ''
    const config = useRuntimeConfig() as any
    const origin = String(config.studentPhotoBaseUrl || 'https://matricula.casitaapps.com').replace(/\/+$/, '')
    const url = new URL('/api/students/' + encodeURIComponent(matricula) + '/photo', origin)
    url.searchParams.set('format', 'json')
    const response = await fetch(url, {
      headers: buildExternalHeaders(syncConfig),
      signal: AbortSignal.timeout(7000),
      cache: 'no-store'
    })
    if (!response.ok) return ''
    const payload: any = await response.json().catch(() => null)
    return resolveStudentPhoto(payload?.photoUrl || payload?.url || payload?.foto || payload?.data?.photoUrl || payload?.data?.foto)
  } catch {
    return ''
  }
}

const authorizedPeopleForStudent = async (matricula: string) => {
  try {
    const [peopleColumns, userColumns] = await Promise.all([
      getCentralTableColumns('personas_autorizadas'),
      getCentralTableColumns('users')
    ])
    const requiredPeople = ['id', 'user_id', 'nombreP', 'paternoP', 'maternoP']
    if (!requiredPeople.every((column) => peopleColumns.has(column)) || !userColumns.has('id') || !userColumns.has('username')) return []

    const optional = ['indice', 'parenP', 'foto', 'compressed_foto', 'fechaP'].filter((column) => peopleColumns.has(column))
    const fields = [
      'p.id',
      'p.user_id',
      'p.nombreP',
      'p.paternoP',
      'p.maternoP',
      ...optional.map((column) => 'p.' + escapeIdentifier(column))
    ]
    const rows = await controlEscolarCentralQuery<any[]>(
      'SELECT ' + fields.join(', ') +
        ' FROM `personas_autorizadas` p INNER JOIN `users` u ON u.id = p.user_id' +
        ' WHERE UPPER(TRIM(u.username)) = ? ORDER BY ' +
        (peopleColumns.has('indice') ? 'p.indice ASC, ' : '') + 'p.id ASC',
      [upper(matricula, 64)]
    )

    return rows.map((row) => ({
      id: row.id,
      indice: row.indice ?? null,
      name: joinName(row.nombreP, row.paternoP, row.maternoP),
      relationship: text(row.parenP, 120),
      date: row.fechaP || null,
      photoUrl: resolveHuskyPhoto(row.foto || row.compressed_foto)
    }))
  } catch (error: any) {
    console.warn('[Buscador] authorized people unavailable', {
      matricula,
      message: error?.message || String(error)
    })
    return []
  }
}

const safeScalar = (value: unknown) => {
  if (!nonEmpty(value)) return null
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value as any)) return 'Archivo disponible'
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value).slice(0, 4000)
    } catch {
      return String(value).slice(0, 4000)
    }
  }
  return typeof value === 'string' ? value.trim().slice(0, 4000) : value
}

const sanitizeRecord = (record: Record<string, any> = {}) => Object.fromEntries(
  Object.entries(record)
    .filter(([key, value]) => !SECRET_KEY_PATTERN.test(key) && nonEmpty(value))
    .map(([key, value]) => [key, safeScalar(value)])
    .filter(([, value]) => nonEmpty(value))
)

const field = (...values: unknown[]) => values.find(nonEmpty) ?? ''

const detailSections = (detail: any) => ({
  escolar: {
    nivel: detail.nivel,
    grado: displayGrado(detail.grado),
    grupo: detail.grupo || detail.group,
    plantel: detail.plantel || detail.agentId,
    ciclo: detail.cicloBase,
    tipoIngreso: detail.tipoIngreso,
    servicio: detail.servicio,
    estado: detail.status
  },
  identidad: {
    curp: detail.curp,
    fechaNacimiento: detail.fechaNacimiento,
    sexo: detail.sexo,
    lugarNacimiento: detail.lugarNacimiento,
    talla: detail.talla,
    peso: detail.peso,
    tipoSangre: detail.tipoSangre,
    alergias: detail.alergias
  },
  padre: {
    nombre: field(detail.fatherName, joinName(detail.nombrePadre, detail.apellidoPaternoPadre, detail.apellidoMaternoPadre), detail.guardianName),
    telefono: detail.telefonoPadre,
    correo: detail.emailPadre,
    lugarTrabajo: detail.lugarTrabajoPadre,
    puesto: detail.puestoPadre,
    estadoCivil: detail.estadoCivilPadre,
    fechaNacimiento: detail.fechaNacimientoPadre,
    curp: detail.curpPadre,
    ine: detail.inePadre
  },
  madre: {
    nombre: field(detail.motherName, joinName(detail.nombreMadre, detail.apellidoPaternoMadre, detail.apellidoMaternoMadre)),
    telefono: detail.telefonoMadre,
    correo: detail.emailMadre,
    lugarTrabajo: detail.lugarTrabajoMadre,
    puesto: detail.puestoMadre,
    estadoCivil: detail.estadoCivilMadre,
    fechaNacimiento: detail.fechaNacimientoMadre,
    curp: detail.curpMadre,
    ine: detail.ineMadre
  },
  domicilio: {
    direccion: field(detail.direccion, detail.address),
    calle: detail.domicilioCalle,
    numero: field(detail.domicilioNumero, detail.domicilioNum, detail.domicioNum),
    colonia: detail.domicilioColonia,
    codigoPostal: detail.domicilioCp,
    municipio: detail.domicilioMunicipio
  },
  documentos: {
    certificadoMedico: detail.certificadoMedicoAdjunto,
    certificadoVacunacionCovid19: detail.certificadoVacunacionCovid19Adjunto,
    actaNacimiento: detail.actaNacimientoAdjunta,
    curpAlumno: detail.curpAlumnoAdjunto,
    certificadoPrimaria: detail.certificadoPrimariaAdjunto,
    boletaSextoPrimaria: detail.boletaSextoPrimariaAdjunta,
    boletaPrimeroSecundaria: detail.boletaPrimeroSecundariaAdjunta,
    boletaSegundoSecundaria: detail.boletaSegundoSecundariaAdjunta
  }
})

export const resolveBuscadorPlantel = (user: AuthSessionUser, requestedPlantel: unknown) => {
  const requested = normalizePlantel(requestedPlantel)
  const active = normalizePlantel(user.active_plantel)
  const allowed = user.plantelesList.map(normalizePlantel).filter(Boolean)
  const resolved = requested && requested !== 'GLOBAL'
    ? requested
    : active && active !== 'GLOBAL'
      ? active
      : allowed[0]

  if (!resolved) throw createError({ statusCode: 400, message: 'Selecciona un plantel para buscar alumnos.' })
  if (!allowed.includes(resolved)) {
    throw createError({ statusCode: 403, message: 'El plantel solicitado no está asignado a tu cuenta.' })
  }
  return resolved
}

export const searchBuscadorStudents = async (plantel: string, queryValue: unknown, limitValue: unknown = 30) => {
  const search = text(queryValue, 120)
  if (search.length < 2) return { data: [], total: 0, plantel, query: search, sources: [] }

  const limit = Math.min(50, Math.max(8, Number(limitValue || 30) || 30))
  const [localRows, centralRows] = await Promise.all([
    searchLocalBase(plantel, search),
    searchCentralMatricula(plantel, search)
  ])

  const externalMatriculas = centralRows.map((row) => upper(row.matricula, 64)).filter(Boolean)
  const scopedExternalRows = await localRowsForMatriculas(plantel, externalMatriculas)
  const localByMatricula = new Map(localRows.map((row) => [upper(row.matricula, 64), row]))
  const centralByMatricula = new Map(centralRows.map((row) => [upper(row.matricula, 64), row]))
  const matriculas = new Set([...localByMatricula.keys(), ...scopedExternalRows.keys()])
  const results: any[] = []

  for (const matricula of matriculas) {
    const local = localByMatricula.get(matricula) || scopedExternalRows.get(matricula)
    const central = centralByMatricula.get(matricula)
    if (!local) continue

    const merged = { ...local, ...(central || {}) }
    const academic = projectedAcademic(local, plantel)
    const match = findMatch(merged, search)
    const parentSummary = [
      joinName(central?.nombre_padre, central?.apellido_paterno_padre, central?.apellido_materno_padre) || text(central?.nombre_padre_completo || central?.padre || central?.tutor || local?.legacyTutor, 255),
      joinName(central?.nombre_madre, central?.apellido_paterno_madre, central?.apellido_materno_madre) || text(central?.nombre_madre_completo || central?.madre, 255)
    ].filter(Boolean)

    results.push({
      matricula,
      nombreCompleto: text(local.nombreCompleto || central?.nombre_completo_alumno || joinName(central?.apellido_paterno, central?.apellido_materno, central?.nombres), 255),
      plantel: academic.plantel || plantel,
      nivel: academic.nivel || text(local.nivel, 80),
      grado: academic.grado || displayGrado(local.grado),
      grupo: text(central?.grupo || local.grupo, 80),
      estatus: text(local.estatus || 'Activo', 40),
      photoUrl: resolveStudentPhoto(central?.foto),
      parents: parentSummary,
      matchedBy: match,
      score: match.score,
      sources: central ? ['Aurora', 'Matrícula'] : ['Aurora']
    })
  }

  results.sort((left, right) =>
    Number(right.score || 0) - Number(left.score || 0) ||
    String(left.nombreCompleto || '').localeCompare(String(right.nombreCompleto || ''), 'es', { sensitivity: 'base' })
  )

  return {
    data: results.slice(0, limit),
    total: results.length,
    plantel,
    query: search,
    sources: ['Aurora base', centralRows.length ? 'Matrícula central' : ''].filter(Boolean)
  }
}

export const getBuscadorStudentProfile = async (plantel: string, matriculaValue: unknown) => {
  const matricula = upper(matriculaValue, 64)
  if (!matricula) throw createError({ statusCode: 400, message: 'Matrícula requerida.' })

  const scopeRows = await localRowsForMatriculas(plantel, [matricula])
  if (!scopeRows.has(matricula)) {
    throw createError({ statusCode: 404, message: 'Alumno no encontrado dentro del plantel seleccionado.' })
  }

  const [detail, authorizedPeople, academicPlacement] = await Promise.all([
    fetchControlEscolarStudentDetail(plantel, matricula),
    authorizedPeopleForStudent(matricula),
    fetchControlEscolarCalculatedAcademicPlacement(plantel, matricula, automaticSchoolCycleKey())
  ])

  const resolvedDetail = academicPlacement
    ? {
        ...detail,
        plantel: academicPlacement.plantel,
        nivel: academicPlacement.nivel,
        grado: academicPlacement.grado,
        grupo: academicPlacement.grupo || detail?.grupo || detail?.group,
        group: academicPlacement.grupo || detail?.group || detail?.grupo,
        cicloBase: academicPlacement.ciclo
      }
    : detail

  const safeDetail = sanitizeRecord(resolvedDetail)
  const rawBase = sanitizeRecord(detail?.rawBase || {})
  const rawMatricula = sanitizeRecord(detail?.rawMatricula || {})
  delete safeDetail.rawBase
  delete safeDetail.rawMatricula
  delete safeDetail.rawUsers
  delete safeDetail.huskyPassPlaintext

  const photoUrl = await canonicalPhotoFallback(
    matricula,
    resolveStudentPhoto(resolvedDetail?.photoUrl || detail?.rawMatricula?.foto)
  )

  const allData = sanitizeRecord({
    ...rawBase,
    ...rawMatricula,
    ...safeDetail
  })

  return {
    matricula,
    plantel: academicPlacement?.plantel || plantel,
    nombreCompleto: text(resolvedDetail?.nombreCompleto || resolvedDetail?.fullName || matricula, 255),
    photoUrl,
    status: text(resolvedDetail?.status || 'Activo', 40),
    sections: Object.fromEntries(
      Object.entries(detailSections(resolvedDetail)).map(([key, value]) => [key, sanitizeRecord(value as Record<string, any>)])
    ),
    authorizedPeople,
    huskyPass: {
      available: Boolean(detail?.huskyPassAvailable),
      username: text(detail?.huskyPassUsername, 80),
      email: text(detail?.huskyPassEmail, 255)
    },
    notes: {
      servicio: text(resolvedDetail?.servicioNotas, 1500),
      motivoBaja: text(resolvedDetail?.motivoBaja, 1000),
      categoriaBaja: text(resolvedDetail?.categoriaBaja, 255),
      seguimientoBaja: text(resolvedDetail?.seguimientoBaja, 1000)
    },
    allData,
    meta: {
      detailSource: text(detail?.detailSource, 80),
      updatedAt: detail?.updatedAt || null,
      authorizedPeople: authorizedPeople.length,
      sources: ['Aurora base', detail?.rawMatricula && Object.keys(detail.rawMatricula).length ? 'Matrícula central' : '', authorizedPeople.length ? 'Husky Pass' : ''].filter(Boolean)
    }
  }
}
