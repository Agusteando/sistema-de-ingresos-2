const gradeNumbers = { primero: 1, primer: 1, segundo: 2, tercero: 3, cuarto: 4, quinto: 5, sexto: 6, egresado: 99 }
const gradeOrder = (value) => {
  const raw = String(value || '').trim().toLowerCase()
  const number = Number(raw.replace(/[^0-9]/g, ''))
  return gradeNumbers[raw] ?? (Number.isFinite(number) && number > 0 ? number : 900)
}
const compareText = (a, b) => String(a || '').localeCompare(String(b || ''), 'es', { numeric: true, sensitivity: 'base' })
const compareStudents = (a, b) =>
  compareText(a.plantel, b.plantel) ||
  gradeOrder(a.grado) - gradeOrder(b.grado) ||
  compareText(a.grado, b.grado) ||
  compareText(a.group || a.grupo, b.group || b.grupo) ||
  compareText(a.fullName || a.matricula, b.fullName || b.matricula)

const cellValue = (value) => {
  if (Array.isArray(value)) return value.map(cellValue).filter(Boolean).join(' / ')
  if (value && typeof value === 'object') return JSON.stringify(value)
  return value
}

/**
 * Pure workbook model: accepts only the already-projected Control Escolar rows.
 * Does not infer grade from matricula, look up a second source, or adjust ciclo.
 */
export const createInstitutionalControlEscolarSheets = ({ scopes, fields, selectedFields, cicloLabel, statusLabel, generatedLabel }) => {
  const selected = new Set([...selectedFields, 'plantel'])
  const columns = fields.filter((field) => selected.has(field.key))
    .map(({ key, label, width }) => ({ key, label, width }))
  if (!columns.some((column) => column.key === 'plantel')) throw new Error('Falta la columna Plantel.')

  const all = []
  const perPlantel = []
  const summary = []

  for (const scope of scopes) {
    const plantel = String(scope.plantel).trim().toUpperCase()
    const rows = scope.rows.map((row) => ({ ...row, plantel }))
      .sort(compareStudents)
    all.push(...rows)
    let inscritos = 0
    let internos = 0
    let externos = 0
    let bajas = 0
    let noInscritos = 0
    for (const row of rows) {
      const estado = String(row.enrollmentState || '').toLowerCase()
      if (estado === 'inscrito' && String(row.status || '').toLowerCase() !== 'baja') {
        inscritos++
        if (String(row.tipoIngresoValue || row.tipoIngreso || '').toLowerCase() === 'interno') internos++
        else externos++
      } else if (estado.includes('baja') || String(row.status || '').toLowerCase() === 'baja') {
        bajas++
      } else {
        noInscritos++
      }
    }
    summary.push({ plantel, inscritos, internos, externos, noInscritos, bajas, total: rows.length })
    perPlantel.push({ plantel, rows })
  }

  const normalizedRows = (rows) => rows.map((row) => Object.fromEntries(
    columns.map((column) => [column.key, cellValue(column.key === 'cicloEscolar' ? cicloLabel : row[column.key])])
  ))
  all.sort(compareStudents)
  const total = summary.reduce((acc, row) => {
    for (const key of ['inscritos', 'internos', 'externos', 'noInscritos', 'bajas', 'total']) acc[key] += row[key]
    return acc
  }, { plantel: 'Total', inscritos: 0, internos: 0, externos: 0, noInscritos: 0, bajas: 0, total: 0 })

  const details = 'Ciclo ' + cicloLabel + ' · ' + statusLabel + ' · Generado ' + generatedLabel
  return [
    {
      name: 'Resumen',
      title: 'IECS-IEDIS · Control Escolar · Resumen institucional',
      subtitle: details + ' · ' + scopes.length + ' planteles · ' + all.length + ' registros',
      columns: [
        { key: 'plantel', label: 'Plantel', width: 17 },
        { key: 'inscritos', label: 'Inscritos', width: 14, type: 'number' },
        { key: 'internos', label: 'Internos', width: 14, type: 'number' },
        { key: 'externos', label: 'Externos', width: 14, type: 'number' },
        { key: 'noInscritos', label: 'No inscritos', width: 17, type: 'number' },
        { key: 'bajas', label: 'Bajas', width: 12, type: 'number' },
        { key: 'total', label: 'Registros', width: 15, type: 'number' },
      ],
      rows: summary,
      totalRow: total,
    },
    {
      name: 'General',
      title: 'IECS-IEDIS · Control Escolar · Todos los planteles',
      subtitle: details + ' · ' + all.length + ' registros',
      columns,
      rows: normalizedRows(all),
    },
    ...perPlantel.map(({ plantel, rows }) => ({
      name: plantel,
      title: 'IECS-IEDIS · Control Escolar · ' + plantel,
      subtitle: details + ' · ' + rows.length + ' registros',
      columns,
      rows: normalizedRows(rows),
    })),
  ]
}
