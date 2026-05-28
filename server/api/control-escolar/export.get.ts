import { createXlsxWorkbook } from '../../utils/xlsx'
import { fetchControlEscolarExportRows, resolveControlEscolarAuth, runControlEscolar } from '../../utils/control-escolar'

const gradeAliases: Record<string, number> = {
  primero: 1,
  primer: 1,
  '1': 1,
  '1ro': 1,
  '1°': 1,
  segundo: 2,
  segunda: 2,
  '2': 2,
  '2do': 2,
  '2°': 2,
  tercero: 3,
  tercer: 3,
  '3': 3,
  '3ro': 3,
  '3°': 3,
  cuarto: 4,
  '4': 4,
  '4to': 4,
  '4°': 4,
  quinto: 5,
  '5': 5,
  '5to': 5,
  '5°': 5,
  sexto: 6,
  '6': 6,
  '6to': 6,
  '6°': 6,
  egresado: 99,
}

const normalize = (value: unknown) => String(value ?? '').trim()
const normalizeLower = (value: unknown) => normalize(value).toLowerCase()
const titleValue = (value: unknown, fallback = 'Sin dato') => normalize(value) || fallback

const gradeOrderIndex = (value: unknown) => {
  const normalized = normalizeLower(value)
  if (!normalized) return 1000
  if (gradeAliases[normalized] !== undefined) return gradeAliases[normalized]
  const numeric = Number(normalized.replace(/[^0-9]/g, ''))
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 900
}

const compareGrade = (a: unknown, b: unknown) => {
  const left = gradeOrderIndex(a)
  const right = gradeOrderIndex(b)
  if (left !== right) return left - right
  return normalize(a).localeCompare(normalize(b), 'es')
}

const compareGroup = (a: unknown, b: unknown) => normalize(a).localeCompare(normalize(b), 'es', { numeric: true, sensitivity: 'base' })

const safeSheetLabel = (grado: string, grupo: string) => {
  const gradeLabel = titleValue(grado, 'Sin grado')
  const groupLabel = titleValue(grupo, 'Sin grupo')
  return `${gradeLabel} ${groupLabel}`
}

const toExportValue = (value: unknown) => {
  if (Array.isArray(value)) return value.map(toExportValue).filter(Boolean).join(' / ')
  if (value && typeof value === 'object') return JSON.stringify(value)
  return value as any
}

const filterSummary = (queryParams: Record<string, any>) => {
  const entries = Object.entries(queryParams)
    .filter(([key, value]) => !['agentId', 'page', 'limit'].includes(key) && normalize(value))
    .map(([key, value]) => `${key}: ${value}`)
  return entries.length ? entries.join(' · ') : 'Sin filtros adicionales'
}

const knownColumns: Array<[string, string, number]> = [
  ['plantel', 'Plantel', 12],
  ['basePlantel', 'Plantel base', 13],
  ['matricula', 'Matrícula', 16],
  ['studentId', 'ID alumno', 14],
  ['fullName', 'Nombre completo', 34],
  ['nombreCompletoAlumno', 'Nombre completo alumno', 34],
  ['nombres', 'Nombres', 22],
  ['apellidoPaterno', 'Apellido paterno', 18],
  ['apellidoMaterno', 'Apellido materno', 18],
  ['curp', 'CURP', 20],
  ['fechaNacimiento', 'Fecha nacimiento', 18],
  ['lugarNacimiento', 'Lugar nacimiento', 22],
  ['sexo', 'Sexo', 10],
  ['status', 'Estado', 13],
  ['enrollmentState', 'Estado inscripción', 18],
  ['tipoIngreso', 'Tipo ingreso', 14],
  ['tipoIngresoValue', 'Tipo ingreso valor', 17],
  ['interno', 'Interno base', 13],
  ['nivel', 'Nivel', 16],
  ['grado', 'Grado', 12],
  ['group', 'Grupo', 10],
  ['program', 'Programa', 22],
  ['servicio', 'Servicio', 22],
  ['servicioNotas', 'Notas servicio', 28],
  ['cicloBase', 'Ciclo base', 14],
  ['lastGrade', 'Último grado', 14],
  ['lastCiclo', 'Último ciclo', 14],
  ['currentEnrollmentConceptMatch', 'Coincide concepto actual', 24],
  ['inscritoCicloActual', 'Inscrito ciclo actual', 21],
  ['baja', 'Baja', 10],
  ['motivoBaja', 'Motivo baja', 30],
  ['categoriaBaja', 'Categoría baja', 18],
  ['seguimientoBaja', 'Seguimiento baja', 30],
  ['guardianName', 'Tutor/responsable', 28],
  ['nombrePadre', 'Nombre padre', 22],
  ['apellidoPaternoPadre', 'Apellido paterno padre', 22],
  ['apellidoMaternoPadre', 'Apellido materno padre', 22],
  ['fatherName', 'Padre completo', 28],
  ['estadoCivilPadre', 'Estado civil padre', 19],
  ['fechaNacimientoPadre', 'Fecha nacimiento padre', 22],
  ['inePadre', 'INE padre', 18],
  ['curpPadre', 'CURP padre', 20],
  ['telefonoPadre', 'Teléfono padre', 18],
  ['emailPadre', 'Email padre', 26],
  ['nombreMadre', 'Nombre madre', 22],
  ['apellidoPaternoMadre', 'Apellido paterno madre', 22],
  ['apellidoMaternoMadre', 'Apellido materno madre', 22],
  ['motherName', 'Madre completo', 28],
  ['estadoCivilMadre', 'Estado civil madre', 19],
  ['fechaNacimientoMadre', 'Fecha nacimiento madre', 22],
  ['ineMadre', 'INE madre', 18],
  ['curpMadre', 'CURP madre', 20],
  ['telefonoMadre', 'Teléfono madre', 18],
  ['emailMadre', 'Email madre', 26],
  ['phone', 'Teléfono principal', 18],
  ['email', 'Email principal', 26],
  ['address', 'Domicilio consolidado', 34],
  ['direccion', 'Dirección matrícula', 34],
  ['domicilioCalle', 'Domicilio calle', 24],
  ['domicilioNumero', 'Domicilio número', 16],
  ['domicilioNum', 'Domicilio num', 16],
  ['domicilioColonia', 'Domicilio colonia', 22],
  ['domicilioCp', 'Domicilio CP', 14],
  ['domicilioMunicipio', 'Domicilio municipio', 22],
  ['talla', 'Talla', 10],
  ['peso', 'Peso', 10],
  ['tipoSangre', 'Tipo sangre', 13],
  ['alergias', 'Alergias', 30],
  ['certificadoMedicoAdjunto', 'Certificado médico', 28],
  ['certificadoVacunacionCovid19Adjunto', 'Certificado vacunación COVID-19', 34],
  ['actaNacimientoAdjunta', 'Acta nacimiento', 28],
  ['curpAlumnoAdjunto', 'CURP alumno adjunto', 28],
  ['certificadoPrimariaAdjunto', 'Certificado primaria', 28],
  ['boletaSextoPrimariaAdjunta', 'Boleta sexto primaria', 28],
  ['boletaPrimeroSecundariaAdjunta', 'Boleta primero secundaria', 30],
  ['boletaSegundoSecundariaAdjunta', 'Boleta segundo secundaria', 31],
  ['foto', 'Foto', 28],
  ['photoUrl', 'URL foto', 28],
  ['overlayExists', 'Tiene ficha matrícula', 20],
  ['missingFields', 'Campos faltantes', 34],
  ['missingLabels', 'Etiquetas faltantes', 34],
  ['completeMissingFields', 'Campos faltantes completos', 34],
  ['completeMissingLabels', 'Etiquetas faltantes completas', 34],
  ['updatedAt', 'Última actualización', 22],
  ['huskyPassUsername', 'Husky Pass usuario', 22],
  ['huskyPassPlaintext', 'Husky Pass clave', 22],
  ['huskyPassEmail', 'Husky Pass email', 26],
  ['huskyPassAvailable', 'Husky Pass disponible', 22],
]

const buildDataColumns = (rows: any[]) => {
  const knownKeys = new Set<string>(knownColumns.map(([key]) => key))
  const extraKeySet = new Set<string>()
  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (!knownKeys.has(key) && key !== 'completenessTiers') extraKeySet.add(key)
    })
  })
  const extraKeys = Array.from(extraKeySet).sort((a, b) => a.localeCompare(b, 'es'))

  return [
    ...knownColumns.map(([key, label, width]) => ({ key, label, width })),
    ...extraKeys.map((key) => ({ key, label: key, width: 22 })),
  ]
}

const normalizeRowsForSheet = (rows: any[], columns: Array<{ key: string }>) => rows.map((row) => {
  const record: Record<string, any> = {}
  columns.forEach((column) => {
    record[column.key] = toExportValue(row?.[column.key])
  })
  return record
})

export default defineEventHandler(async (event) => {
  const queryParams = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, queryParams.agentId)

  return await runControlEscolar(event, auth.agentId, async () => {
    const rows = (await fetchControlEscolarExportRows(auth.agentId, queryParams))
      .slice()
      .sort((a: any, b: any) => {
        const gradeResult = compareGrade(a.grado, b.grado)
        if (gradeResult !== 0) return gradeResult
        const groupResult = compareGroup(a.group, b.group)
        if (groupResult !== 0) return groupResult
        return normalize(a.fullName || a.matricula).localeCompare(normalize(b.fullName || b.matricula), 'es')
      })

    const generatedAt = new Date()
    const subtitle = `Plantel ${auth.agentId} · ${rows.length} alumno${rows.length === 1 ? '' : 's'} · ${filterSummary(queryParams as Record<string, any>)} · ${generatedAt.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`
    const gradeMap = new Map<string, { grado: string; interno: number; externo: number; total: number }>()

    rows.forEach((row: any) => {
      const grado = titleValue(row.grado, 'Sin grado')
      const current = gradeMap.get(grado) || { grado, interno: 0, externo: 0, total: 0 }
      if (normalizeLower(row.tipoIngresoValue || row.tipoIngreso) === 'interno') current.interno += 1
      else current.externo += 1
      current.total += 1
      gradeMap.set(grado, current)
    })

    const summaryRows = Array.from(gradeMap.values()).sort((a, b) => compareGrade(a.grado, b.grado))
    const summaryTotal = summaryRows.reduce((acc, row) => ({
      grado: 'Total',
      interno: acc.interno + row.interno,
      externo: acc.externo + row.externo,
      total: acc.total + row.total,
    }), { grado: 'Total', interno: 0, externo: 0, total: 0 })

    const dataColumns = buildDataColumns(rows)
    const groupMap = new Map<string, { grado: string; grupo: string; rows: any[] }>()
    rows.forEach((row: any) => {
      const grado = titleValue(row.grado, 'Sin grado')
      const grupo = titleValue(row.group || row.grupo, 'Sin grupo')
      const key = `${grado}|||${grupo}`
      const bucket = groupMap.get(key) || { grado, grupo, rows: [] }
      bucket.rows.push(row)
      groupMap.set(key, bucket)
    })

    const groupSheets = Array.from(groupMap.values())
      .sort((a, b) => {
        const gradeResult = compareGrade(a.grado, b.grado)
        return gradeResult !== 0 ? gradeResult : compareGroup(a.grupo, b.grupo)
      })
      .map((group) => ({
        name: safeSheetLabel(group.grado, group.grupo),
        title: `Control Escolar · ${safeSheetLabel(group.grado, group.grupo)}`,
        subtitle: `Plantel ${auth.agentId} · ${group.rows.length} alumno${group.rows.length === 1 ? '' : 's'} · exportado con los filtros activos`,
        columns: dataColumns,
        rows: normalizeRowsForSheet(group.rows, dataColumns),
      }))

    const workbook = createXlsxWorkbook([
      {
        name: 'Resumen',
        title: 'Control Escolar · Resumen por grado',
        subtitle,
        columns: [
          { key: 'grado', label: 'Grado', width: 18 },
          { key: 'interno', label: 'Internos', width: 14, type: 'number' },
          { key: 'externo', label: 'Externos', width: 14, type: 'number' },
          { key: 'total', label: 'Total', width: 14, type: 'number' },
        ],
        rows: summaryRows,
        totalRow: summaryTotal,
      },
      ...groupSheets,
    ])

    const filename = `control-escolar-${auth.agentId}-${generatedAt.toISOString().slice(0, 10)}.xlsx`
    setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setResponseHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
    setResponseHeader(event, 'Cache-Control', 'no-store')
    setResponseHeader(event, 'Content-Length', String(workbook.length))
    return workbook
  })
})
