const METRICS = ['inscritos', 'internos', 'externos', 'noInscritos', 'bajas', 'registros']
const emptyCounts = () => Object.fromEntries(METRICS.map(key => [key, 0]))
const normalize = (value) => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const GRADE_LABELS = ['Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto', 'Sexto']
const gradeName = (value) => {
  const raw = String(value ?? '').trim()
  const key = normalize(raw)
  if (!key) return { key: 'sin-grado', label: 'Sin grado', order: 90 }
  const n = Number(key.replace(/[^0-9]/g, ''))
  const names = ['primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto']
  const index = names.findIndex(name => key === name || (name === 'primero' && key === 'primer'))
  const number = index >= 0 ? index + 1 : n > 0 && n <= 6 ? n : 0
  if (number) return { key: 'grado-' + number, label: GRADE_LABELS[number - 1], order: number }
  if (key === 'egresado') return { key, label: 'Egresado', order: 99 }
  return { key, label: raw, order: 80 }
}
const metricType = (student) => {
  const enrollment = normalize(student.enrollmentState)
  if (normalize(student.status) === 'baja' || enrollment === 'baja' || enrollment === 'baja_inscrita') return 'bajas'
  if (enrollment === 'inscrito') return normalize(student.tipoIngresoValue || student.tipoIngreso) === 'interno' ? 'internos' : 'externos'
  return 'noInscritos'
}
const increment = (counts, type) => {
  counts.registros++
  if (type === 'internos' || type === 'externos') counts.inscritos++
  counts[type]++
}

/** Pure aggregation of projected Control Escolar rows. No source lookups or grade inference. */
export const buildInstitutionalEnrollmentSummary = ({ ciclo, scopes }) => {
  const unavailable = []
  const backups = []
  const total = emptyCounts()
  let available = 0
  const rows = scopes.map(scope => {
    const plantel = String(scope.plantel || '').trim().toUpperCase()
    if (!Array.isArray(scope.rows)) {
      unavailable.push(plantel)
      return { plantel, source: 'unavailable', snapshotAt: null,
        ...Object.fromEntries(METRICS.map(key => [key, null])), grados: [] }
    }
    available++
    const source = ['backup', 'backup-stale'].includes(scope.dataStatus) ? scope.dataStatus : 'live'
    if (source !== 'live') backups.push(plantel)
    const counts = emptyCounts()
    const grades = new Map()
    for (const student of scope.rows) {
      const type = metricType(student)
      increment(counts, type)
      const grade = gradeName(student.grado)
      const nivel = String(student.nivel || '').trim()
      const key = normalize(nivel) + '|' + grade.key
      if (!grades.has(key)) grades.set(key, {
        key, grado: grade.label, nivel, order: grade.order, ...emptyCounts(),
      })
      increment(grades.get(key), type)
    }
    for (const metric of METRICS) total[metric] += counts[metric]
    const grados = Array.from(grades.values())
      .sort((a, b) => normalize(a.nivel).localeCompare(normalize(b.nivel), 'es') || a.order - b.order || a.grado.localeCompare(b.grado, 'es'))
      .map(({ order, ...grade }) => grade)
    return { plantel, source, snapshotAt: source === 'live' ? null : String(scope.snapshotAt || '') || null,
      ...counts, grados }
  })
  const complete = unavailable.length === 0
  return {
    ciclo,
    rows,
    coverage: { available, total: scopes.length, unavailable, backups, complete },
    total: { ...Object.fromEntries(METRICS.map(metric => [metric, available ? total[metric] : null])), partial: !complete },
  }
}
