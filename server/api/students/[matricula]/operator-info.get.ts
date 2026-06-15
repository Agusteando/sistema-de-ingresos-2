import { runWithBridgeAgentId, query } from '../../../utils/db'
import { getTrustedAuthUser } from '../../../utils/auth-session'
import { fetchCentralMatriculaOverlay } from '../../../utils/central-matricula-overlay'
import { resolveFinancialFamilyContact } from '../../../../shared/utils/familyContact'

const text = (value: unknown) => String(value ?? '').trim()

const resolveOperatorInfoAccess = async (event: any) => {
  const user = event.context.user || await getTrustedAuthUser(event)

  if (!user.hasFinancialAccess) {
    throw createError({ statusCode: 403, message: 'La información ampliada de alumno es una vista de operadores y no está disponible para Control Escolar.' })
  }

  return user
}

const normalizeBridgeStudent = (row: any = {}) => {
  const apellidoPaterno = text(row.apellidoPaterno)
  const apellidoMaterno = text(row.apellidoMaterno)
  const nombres = text(row.nombres)
  const fullName = text(row.nombreCompleto) || [apellidoPaterno, apellidoMaterno, nombres].filter(Boolean).join(' ')

  return {
    matricula: text(row.matricula),
    nombreCompleto: fullName,
    fullName,
    apellidoPaterno,
    apellidoMaterno,
    nombres,
    curp: text(row.curp).toUpperCase(),
    plantel: text(row.plantel),
    basePlantel: text(row.plantel),
    nivel: text(row.nivel),
    grado: text(row.grado),
    grupo: text(row.grupo),
    correo: text(row.correo).toLowerCase(),
    telefono: text(row.telefono),
    padre: text(row.padre),
    birth: row.birth || null,
    estatus: text(row.estatus),
    ciclo: text(row.ciclo),
    cicloBase: text(row.ciclo)
  }
}

const fetchBridgeStudent = async (agentId: string, matricula: string) => {
  if (!agentId || agentId === 'GLOBAL') {
    return { student: null, available: false, message: 'Sin plantel específico para consultar base local.' }
  }

  try {
    const rows = await runWithBridgeAgentId(String(agentId), async () => query<any[]>(`
      SELECT
        matricula,
        nombreCompleto,
        apellidoPaterno,
        apellidoMaterno,
        nombres,
        curp,
        plantel,
        nivel,
        grado,
        grupo,
        correo,
        telefono,
        \`Nombre del padre o tutor\` AS padre,
        \`Fecha de nacimiento\` AS birth,
        estatus,
        ciclo
      FROM base
      WHERE matricula = ?
      LIMIT 1
    `, [matricula]))

    return { student: rows?.[0] ? normalizeBridgeStudent(rows[0]) : null, available: true, message: rows?.[0] ? '' : 'Alumno no localizado en base local.' }
  } catch (error: any) {
    console.warn('[Operator Info] Bridge student lookup unavailable', {
      matricula,
      agentId,
      message: error?.message || error
    })
    return { student: null, available: false, message: 'Base local no disponible.' }
  }
}

export default defineEventHandler(async (event) => {
  const user = await resolveOperatorInfoAccess(event)
  const matricula = text(event.context.params?.matricula)
  const agentId = text(event.context.dbBridgeAgentId || user.active_plantel || user.auth_home_plantel)

  if (!matricula) {
    throw createError({ statusCode: 400, message: 'Matrícula requerida.' })
  }

  const [bridge, central] = await Promise.all([
    fetchBridgeStudent(agentId, matricula),
    fetchCentralMatriculaOverlay(matricula)
      .then((overlay) => ({ overlay, available: true, message: overlay ? '' : 'Sin ficha central.' }))
      .catch((error: any) => {
        console.warn('[Operator Info] Central matricula lookup unavailable', {
          matricula,
          message: error?.message || error
        })
        return { overlay: null, available: false, message: 'Enriquecimiento no disponible.' }
      })
  ])

  const centralStudent = central.overlay?.student || null
  const merged = {
    ...(bridge.student || {}),
    ...(centralStudent || {}),
    matricula,
    centralMatricula: centralStudent || null,
    centralMatriculaRaw: central.overlay?.raw || null,
    enrichment: {
      bridgeAvailable: bridge.available,
      matriculaAvailable: central.available,
      matriculaFound: Boolean(centralStudent),
      bridgeMessage: bridge.message,
      matriculaMessage: central.message
    }
  }
  const familyContact = resolveFinancialFamilyContact(merged)

  return {
    ...merged,
    padre: familyContact.tutorName || merged.padre,
    tutor: familyContact.tutorName || merged.tutor,
    telefono: familyContact.phone || merged.telefono,
    correo: familyContact.email || merged.correo,
    controlEscolarFamilyContact: familyContact,
  }
})
