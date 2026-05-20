import { PLANTELES_LIST } from '../../../utils/constants'
import { normalizePlantel } from '../../utils/auth-session'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = getCookie(event, 'auth_email')

  if (!email) {
    throw createError({ statusCode: 401, message: 'Sesión expirada o no válida.' })
  }

  const plantelesArr = Array.isArray(body.planteles)
    ? body.planteles.map(normalizePlantel).filter((plantel: string) => PLANTELES_LIST.includes(plantel))
    : []
  const allowed = plantelesArr.length ? plantelesArr : [...PLANTELES_LIST]
  const plantelesStr = allowed.join(',')
  const activePlantel = allowed[0] || PLANTELES_LIST[0]

  const cookieOpts = {
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 86400 * 7
  }

  setCookie(event, 'auth_planteles', plantelesStr, cookieOpts)
  setCookie(event, 'auth_active_plantel', activePlantel, cookieOpts)
  setCookie(event, 'auth_home_plantel', activePlantel, cookieOpts)
  setCookie(event, 'auth_has_financial_access', 'true', cookieOpts)
  setCookie(event, 'auth_has_control_escolar', 'false', cookieOpts)
  deleteCookie(event, 'auth_nav_mode', { path: '/' })

  if (activePlantel && activePlantel !== 'GLOBAL') {
    setCookie(event, 'db_bridge_agent_id', activePlantel, cookieOpts)
  }

  return { success: true }
})
