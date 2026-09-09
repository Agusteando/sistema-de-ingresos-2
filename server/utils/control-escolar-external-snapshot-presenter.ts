import { normalizeCurp } from '../../shared/utils/curp'
import { normalizeServicioClave, parseServiciosCsv } from '../../shared/utils/talleresServicios'
import { normalizeExternalControlEscolarPlantel } from './control-escolar-plantel-routing'
import { isExternalFreshReadRequested } from './external-fresh-read'

const clean = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const canonicalMatricula = (value: unknown) => clean(value, 64).toUpperCase().replace(/\s+/g, '')

const normalizeSnapshotStudentForExternalApi = (studentValue: any) => {
  const student = { ...(studentValue || {}) }
  for (const key of [
    'huskyPassPlaintext',
    'rawPhoto',
    'centralMatriculaRaw',
    'Control_Escolar_RAW_JSON',
    'raw',
    'rawBase',
    'rawMatricula',
    'rawUsers'
  ]) delete student[key]

  student.matricula = canonicalMatricula(student.matricula)
  student.curp = normalizeCurp(student.curp || student.baseCurp) || null
  student.fullName = clean(student.fullName || student.nombreCompleto, 255)
  student.plantel = normalizeExternalControlEscolarPlantel(student.plantel || student.basePlantel)
  student.display = {
    nombre: student.fullName,
    gradoGrupo: [student.grado, student.group || student.grupo].filter(Boolean).join(' '),
    plantelNivel: [student.plantel, student.nivel].filter(Boolean).join(' · '),
    estado: clean(student.status, 80),
    ciclo: clean(student.cicloBase || student.ciclo, 20)
  }
  student.padre = {
    nombreCompleto: clean(student.fatherName, 255),
    nombres: clean(student.nombrePadre, 120),
    apellidoPaterno: clean(student.apellidoPaternoPadre, 120),
    apellidoMaterno: clean(student.apellidoMaternoPadre, 120),
    telefono: clean(student.telefonoPadre, 80),
    correo: clean(student.emailPadre, 255)
  }
  student.madre = {
    nombreCompleto: clean(student.motherName, 255),
    nombres: clean(student.nombreMadre, 120),
    apellidoPaterno: clean(student.apellidoPaternoMadre, 120),
    apellidoMaterno: clean(student.apellidoMaternoMadre, 120),
    telefono: clean(student.telefonoMadre, 80),
    correo: clean(student.emailMadre, 255)
  }
  student.contactoPrincipal = {
    nombre: clean([student.fatherName, student.motherName].filter(Boolean).join(' / '), 500),
    telefono: clean(student.telefonoPadre || student.telefonoMadre || student.phone, 80),
    correo: clean(student.emailPadre || student.emailMadre || student.email, 255)
  }
  const servicios = parseServiciosCsv(student.servicio)
  student.servicios = servicios
  student.talleres = servicios.map((nombre) => ({
    clave: normalizeServicioClave(nombre),
    nombre
  }))
  return student
}

const normalizeSnapshotResponseData = (response: any) => {
  if (Array.isArray(response?.data)) {
    return { ...response, data: response.data.map(normalizeSnapshotStudentForExternalApi) }
  }
  if (response?.data) {
    return { ...response, data: normalizeSnapshotStudentForExternalApi(response.data) }
  }
  return response
}

export const withExternalSnapshotMeta = (responseValue: any, query: any = {}) => {
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
}
