import { readAllExternalSnapshotStudents } from './control-escolar-external-snapshot'

const MAX_PAGE_SIZE = 500
const clean = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const phoneDigits = (value: unknown) => clean(value, 80).replace(/\D/g, '')
const hasValidPhone = (value: unknown) => phoneDigits(value).length >= 10
const isUsableFamilyEmail = (value: unknown) => {
  const email = clean(value, 255).toLowerCase().replace(/\s+/g, '')
  if (!email || email.includes('@casita')) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
const firstText = (...values: unknown[]) => values.map((value) => clean(value, 500)).find(Boolean) || ''
const fatherFullName = (student: any) => firstText(
  student?.fatherName,
  [student?.nombrePadre, student?.apellidoPaternoPadre, student?.apellidoMaternoPadre].filter(Boolean).join(' ')
)
const motherFullName = (student: any) => firstText(
  student?.motherName,
  [student?.nombreMadre, student?.apellidoPaternoMadre, student?.apellidoMaternoMadre].filter(Boolean).join(' ')
)
const hasFatherComplete = (student: any) => Boolean(
  fatherFullName(student)
  && hasValidPhone(firstText(student?.telefonoPadre, student?.phone, student?.telefono))
  && isUsableFamilyEmail(firstText(student?.emailPadre, student?.email))
)
const hasMotherComplete = (student: any) => Boolean(
  motherFullName(student)
  && hasValidPhone(student?.telefonoMadre)
  && isUsableFamilyEmail(student?.emailMadre)
)
const hasNoPrimaryContact = (student: any) => !(
  hasValidPhone(student?.phone)
  || hasValidPhone(student?.telefono)
  || hasValidPhone(student?.telefonoPadre)
  || hasValidPhone(student?.telefonoMadre)
  || isUsableFamilyEmail(student?.email)
  || isUsableFamilyEmail(student?.emailPadre)
  || isUsableFamilyEmail(student?.emailMadre)
  || hasFatherComplete(student)
  || hasMotherComplete(student)
)

const summarizeExternalSnapshotKpis = (students: any[]) => {
  const byNivel = new Map<string, number>()
  const byGrupo = new Map<string, number>()

  students.forEach((student) => {
    if (student?.nivel) byNivel.set(student.nivel, (byNivel.get(student.nivel) || 0) + 1)
    const groupKey = [student?.grado, student?.group].filter(Boolean).join(' ') || student?.group
    if (groupKey) byGrupo.set(groupKey, (byGrupo.get(groupKey) || 0) + 1)
  })

  const active = students.filter((student) => student?.status === 'Activo').length
  const inscritos = students.filter((student) => student?.enrollmentState === 'inscrito').length
  const internos = students.filter(
    (student) => student?.enrollmentState === 'inscrito' && student?.tipoIngresoValue === 'interno'
  ).length
  const externos = students.filter(
    (student) => student?.enrollmentState === 'inscrito' && student?.tipoIngresoValue !== 'interno'
  ).length
  const noInscritos = students.filter((student) => student?.enrollmentState === 'no_inscrito').length
  const bajas = students.filter(
    (student) => student?.status === 'Baja'
      || student?.enrollmentState === 'baja_inscrita'
      || student?.enrollmentState === 'baja'
  ).length
  const sinFichaMatricula = students.filter((student) => !student?.overlayExists).length
  const progressStudents = students.filter(
    (student) => clean(student?.enrollmentState, 80).toLowerCase() === 'inscrito'
  )
  const missingFields = (student: any) => Array.isArray(student?.missingFields) ? student.missingFields : []
  const expedientesIncompletos = progressStudents.filter((student) => missingFields(student).length > 0).length
  const expedientesCompletos = progressStudents.filter((student) => missingFields(student).length === 0).length
  const missing = (field: string) => progressStudents.filter((student) => missingFields(student).includes(field)).length

  return {
    totalInscritos: inscritos,
    totalVisible: students.length,
    totalExpedientesEvaluados: progressStudents.length,
    expedientesCompletos,
    inscritos,
    internos,
    externos,
    noInscritos,
    activos: active,
    inactivos: students.length - active,
    bajas,
    sinFichaMatricula,
    nuevosOverlay: sinFichaMatricula,
    expedientesIncompletos,
    sinContacto: progressStudents.filter(hasNoPrimaryContact).length,
    sinCurp: missing('curp'),
    sinGrupo: progressStudents.filter((student) => {
      const group = clean(student?.group, 80).replaceAll('"', '').toLowerCase()
      return !group || group === 'null'
    }).length,
    sinPadre: progressStudents.filter((student) =>
      ['padreNombre', 'padreApellidoPaterno', 'padreTelefono', 'padreEmail']
        .some((field) => missingFields(student).includes(field))
    ).length,
    sinMadre: progressStudents.filter((student) =>
      ['madreNombre', 'madreApellidoPaterno', 'madreTelefono', 'madreEmail']
        .some((field) => missingFields(student).includes(field))
    ).length,
    sinTelefono: progressStudents.filter((student) =>
      ['padreTelefono', 'madreTelefono'].some((field) => missingFields(student).includes(field))
    ).length,
    sinTutor: progressStudents.filter((student) =>
      ['padreNombre', 'padreApellidoPaterno', 'madreNombre', 'madreApellidoPaterno']
        .some((field) => missingFields(student).includes(field))
    ).length,
    sinEmail: progressStudents.filter((student) =>
      ['padreEmail', 'madreEmail'].some((field) => missingFields(student).includes(field))
    ).length,
    porNivel: Array.from(byNivel.entries()).map(([label, total]) => ({ label, total })),
    porGrupo: Array.from(byGrupo.entries()).map(([label, total]) => ({ label, total })).slice(0, 18)
  }
}

export const readExternalSnapshotKpis = async (query: any = {}) => {
  const snapshot = await readAllExternalSnapshotStudents({
    ...query,
    search: '',
    q: '',
    status: '',
    grado: '',
    grupo: '',
    group: '',
    nivel: '',
    quality: '',
    calidad: '',
    missing: '',
    recent: '',
    limit: MAX_PAGE_SIZE
  })
  return {
    data: summarizeExternalSnapshotKpis(snapshot.data),
    meta: snapshot.meta
  }
}
