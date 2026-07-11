import { getHeader, getQuery, readBody } from 'h3'
import { assertAuroraExternalApiToken, setExternalApiResponseHeaders } from '../../../../../utils/external-api-auth'
import { logControlEscolarAuditEvent } from '../../../../../utils/control-escolar-audit'
import { readExternalControlEscolarStudentDetail, refreshExternalControlEscolarStudentViewRow } from '../../../../../utils/control-escolar-external-view'
import { runControlEscolar, updateControlEscolarStudent } from '../../../../../utils/control-escolar'
import type { AuthSessionUser } from '../../../../../utils/auth-session'

const ALLOWED_MARKETING_FIELDS = new Set([
  'nombrePadre',
  'apellidoPaternoPadre',
  'apellidoMaternoPadre',
  'telefonoPadre',
  'emailPadre',
  'nombreMadre',
  'apellidoPaternoMadre',
  'apellidoMaternoMadre',
  'telefonoMadre',
  'emailMadre',
  'direccion',
  'domicilioCalle',
  'domicilioNumero',
  'domicilioColonia',
  'domicilioCp',
  'domicilioMunicipio'
])

const clean = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max)
const normalizePlantel = (value: unknown) => clean(value, 40).toUpperCase()
const normalizeCiclo = (value: unknown) => clean(value, 20).match(/\d{4}/)?.[0] || ''

const actorFromRequest = (event: any, plantel: string): AuthSessionUser => {
  const email = clean(getHeader(event, 'x-aurora-actor-email') || 'marketing@husky-pass.internal', 255).toLowerCase()
  const name = clean(getHeader(event, 'x-aurora-actor-name') || 'Mercadotecnia · Husky Pass', 255)
  return {
    email,
    name,
    role: 'ROLE_MKT',
    roles: ['ROLE_MKT'],
    planteles: plantel,
    plantelesList: [plantel],
    financialPlanteles: '',
    financialPlantelesList: [],
    active_plantel: plantel,
    auth_home_plantel: plantel,
    isSuperAdmin: false,
    hasControlEscolarRole: true,
    isControlEscolarOnly: true,
    hasFinancialAccess: false
  }
}

const sanitizePatch = (body: any) => Object.fromEntries(
  Object.entries(body || {})
    .filter(([key]) => ALLOWED_MARKETING_FIELDS.has(key))
    .map(([key, value]) => [key, clean(value, key === 'direccion' ? 500 : 255)])
)

export default defineEventHandler(async (event) => {
  assertAuroraExternalApiToken(event)
  setExternalApiResponseHeaders(event, 0)
  setResponseHeader(event, 'Cache-Control', 'no-store')

  const query = getQuery(event)
  const plantel = normalizePlantel(query.plantel || query.agentId)
  const ciclo = normalizeCiclo(query.ciclo || query.cicloKey)
  const matricula = clean(getRouterParam(event, 'matricula'), 64).toUpperCase()
  const patch = sanitizePatch(await readBody(event))

  if (!plantel) throw createError({ statusCode: 400, statusMessage: 'PLANTEL_REQUIRED', message: 'El plantel es obligatorio.' })
  if (!ciclo) throw createError({ statusCode: 400, statusMessage: 'CICLO_REQUIRED', message: 'El ciclo escolar es obligatorio.' })
  if (!matricula) throw createError({ statusCode: 400, statusMessage: 'MATRICULA_REQUIRED', message: 'La matrícula es obligatoria.' })
  if (!Object.keys(patch).length) throw createError({ statusCode: 400, statusMessage: 'NO_EDITABLE_FIELDS', message: 'No hay datos familiares para actualizar.' })

  const actor = actorFromRequest(event, plantel)
  return await runControlEscolar(event, plantel, async () => {
    const result = await updateControlEscolarStudent(plantel, matricula, patch, actor, { ...query, ciclo, cicloKey: ciclo })
    const student = result?.student || null
    let responseData = student
    let responseMeta: Record<string, any> = { plantel, ciclo }
    if (student) {
      await refreshExternalControlEscolarStudentViewRow({ ...query, plantel, ciclo, cicloKey: ciclo }, student)
      const refreshed = await readExternalControlEscolarStudentDetail({ ...query, plantel, ciclo, cicloKey: ciclo }, matricula)
      responseData = refreshed?.data || student
      responseMeta = refreshed?.meta || responseMeta
    }
    logControlEscolarAuditEvent({
      eventType: 'student_update',
      plantel,
      ciclo,
      matricula,
      user: actor,
      summary: `Mercadotecnia actualizó información familiar de ${matricula}`,
      source: { base: (student as any)?.sourceBase || (student as any)?.baseSource || '', flow: 'husky_pass_marketing_parent_update' },
      payload: { fields: Object.keys(patch), client: 'husky-pass-marketing' }
    }).catch(() => null)

    return { success: true, data: responseData, meta: responseMeta }
  })
})
