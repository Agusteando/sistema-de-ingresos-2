import { OAuth2Client } from 'google-auth-library'
import { query, runWithBridgeAgentId } from '../../utils/db'

const getRequestedPlantel = (event: any, body: any) => {
  const fromBody = String(body?.plantel || body?.agentId || '').trim()
  if (fromBody) return fromBody

  const fromHeader = String(getHeader(event, 'x-db-agent-id') || '').trim()
  if (fromHeader) return fromHeader

  const fromBridgeCookie = String(getCookie(event, 'db_bridge_agent_id') || '').trim()
  if (fromBridgeCookie) return fromBridgeCookie

  const fromAuthCookie = String(getCookie(event, 'auth_active_plantel') || '').trim()
  if (fromAuthCookie) return fromAuthCookie

  return ''
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const config = useRuntimeConfig()
  const requestedPlantel = getRequestedPlantel(event, body)

  console.info(`[Auth Login] requestedPlantel=${requestedPlantel || 'none'}`)

  if (requestedPlantel) {
    event.context.dbBridgeAgentId = requestedPlantel
  }

  return await runWithBridgeAgentId(requestedPlantel, async () => {
    if (!config.public.googleClientId) {
      throw createError({ statusCode: 500, message: 'Configuración de Google ausente' })
    }

    if (!body || !body.credential) {
      throw createError({ statusCode: 400, message: 'Credencial ausente' })
    }

    const client = new OAuth2Client(config.public.googleClientId)

    try {
      const ticket = await client.verifyIdToken({
        idToken: body.credential,
        audience: config.public.googleClientId
      })

      const payload = ticket.getPayload()

      if (!payload || !payload.email) {
        throw new Error('Token inválido')
      }

      let [user] = await query<any[]>('SELECT * FROM users WHERE email = ?', [payload.email])

      const seedEmails = ['desarrollo.tecnologico@casitaiedis.edu.mx', 'coord.admon@casitaiedis.edu.mx']
      const isSeedAdmin = seedEmails.includes(payload.email)

      if (!user) {
        const allUsers = await query<any[]>('SELECT id FROM users LIMIT 1')
        const isFirstUser = allUsers.length === 0

        const defaultRole = (isSeedAdmin || isFirstUser) ? 'global' : 'plantel'
        const defaultPlanteles = (isSeedAdmin || isFirstUser)
          ? 'PREEM,PREET,CT,CM,DM,CO,DC,PM,PT,SM,ST,IS,ISM'
          : ''
        const fallbackPlantelLegacy = (isSeedAdmin || isFirstUser)
          ? (requestedPlantel || 'PREEM')
          : (requestedPlantel || '')

        const result: any = await query(
          'INSERT INTO users (username, password, email, planteles, role, avatar, plantel) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            payload.name || payload.email,
            'GOOGLE_AUTH',
            payload.email,
            defaultPlanteles,
            defaultRole,
            payload.picture || null,
            fallbackPlantelLegacy
          ]
        )

        user = {
          id: result.insertId,
          username: payload.name || payload.email,
          email: payload.email,
          planteles: defaultPlanteles,
          role: defaultRole,
          avatar: payload.picture || null,
          plantel: fallbackPlantelLegacy
        }
      } else {
        if (isSeedAdmin && user.role !== 'global') {
          user.role = 'global'
          await query('UPDATE users SET role = ? WHERE id = ?', ['global', user.id])
        }

        if (payload.picture && user.avatar !== payload.picture) {
          await query('UPDATE users SET avatar = ? WHERE id = ?', [payload.picture, user.id])
        }
      }

      const plantelesArr = user.planteles
        ? String(user.planteles).split(',').map((p: string) => p.trim()).filter(Boolean)
        : []

      let activePlantel = ''

      if (requestedPlantel && (user.role === 'global' || plantelesArr.includes(requestedPlantel) || plantelesArr.length === 0)) {
        activePlantel = requestedPlantel
      } else if (plantelesArr.length > 0) {
        activePlantel = plantelesArr[0]
      } else {
        activePlantel = user.plantel || requestedPlantel || ''
      }

      const cookieOpts = {
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 86400 * 7
      }

      setCookie(event, 'auth_email', user.email || payload.email, cookieOpts)
      setCookie(event, 'auth_name', user.username || payload.name || payload.email, cookieOpts)
      setCookie(event, 'auth_role', user.role || 'plantel', cookieOpts)
      setCookie(event, 'auth_planteles', user.planteles || '', cookieOpts)
      setCookie(event, 'auth_active_plantel', activePlantel, cookieOpts)

      if (activePlantel && activePlantel !== 'GLOBAL') {
        setCookie(event, 'db_bridge_agent_id', activePlantel, cookieOpts)
      }

      return { success: true, activePlantel }
    } catch (error: any) {
      console.error('[Auth Login Error]', error)

      throw createError({
        statusCode: error?.statusCode || 401,
        message: error?.message || 'Error de autenticación con Google.'
      })
    }
  })
})