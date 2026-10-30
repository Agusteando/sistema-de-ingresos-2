const text = value => String(value ?? '').trim()

// Include only a complete student CURP from an authoritative student record.
const studentCurp = value => {
  const normalized = text(value).replace(/\s+/g, '').toUpperCase()
  return /^[A-ZÑ]{4}\d{6}[HM][A-Z]{2}[A-ZÑ]{3}[A-Z0-9]\d$/.test(normalized) ? normalized : ''
}

/** Only copy the student CURP when enriching a public report. */
export function enrichPublicStudentCurps(rows, overlays) {
  for (const student of rows) {
    if (student.curp) continue
    const matricula = text(student.matricula).toUpperCase()
    student.curp = studentCurp(overlays.get(matricula)?.student?.curp)
  }
  return rows
}

/** Summarize the exact output of the existing report; do not invent enrollment/payment eligibility. */
export function rollupConceptReports(reports) {
  const students = new Map()
  const totals = []
  const names = new Set()
  for (const { plantel, report } of reports) {
    const local = new Set()
    const rows = Array.isArray(report?.rows) ? report.rows : []
    for (const row of rows) {
      const matricula = text(row.matricula)
      if (!matricula) continue
      const key = plantel + ':' + matricula.toUpperCase()
      local.add(key)
      const curp = studentCurp(row.curp)
      const existing = students.get(key)
      if (!existing) {
        students.set(key, {
          matricula,
          curp,
          nombreCompleto: text(row.nombreCompleto || [row.nombres,row.apellidoPaterno,row.apellidoMaterno].filter(Boolean).join(' ')),
          nivel: text(row.nivel),
          grado: text(row.grado),
          grupo: text(row.grupo),
          seccion: text(row.seccion),
          plantel,
        })
      } else if (!existing.curp && curp) {
        existing.curp = curp
      }
    }
    for (const concept of report?.conceptos || []) {
      if (concept?.concepto) names.add(text(concept.concepto))
    }
    totals.push({
      plantel,
      alumnos: local.size,
      movimientos: report?.modo === 'movements' ? rows.length : undefined,
      inscritos: report?.modo === 'missing' ? Number(report?.resumen?.inscritos || 0) : undefined,
    })
  }
  const collator = new Intl.Collator('es-MX', { sensitivity: 'base', numeric: true })
  const resultRows = Array.from(students.values()).sort((a,b) =>
    collator.compare(a.plantel,b.plantel) ||
    collator.compare(a.nombreCompleto,b.nombreCompleto) ||
    collator.compare(a.matricula,b.matricula)
  )
  return { resumen: { alumnos: resultRows.length, planteles: totals, movimientos: totals.reduce((n,v)=>n+(v.movimientos||0),0), inscritos: totals.reduce((n,v)=>n+(v.inscritos||0),0) }, rows: resultRows, conceptos: Array.from(names) }
}
