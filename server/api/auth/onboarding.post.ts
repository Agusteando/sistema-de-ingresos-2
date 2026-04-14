import { query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = getCookie(event, 'auth_email')
  
  if (!email) throw createError({ statusCode: 401, message: 'Sesión expirada o no válida.' })
  
  const plantelesArr = Array.isArray(body.planteles) ? body.planteles : []
  const plantelesStr = plantelesArr.join(',')
  const activePlantel = plantelesArr.length > 0 ? plantelesArr[0] : ''
  
  await query('UPDATE users SET planteles = ? WHERE email = ?', [plantelesStr, email])
  
  const cookieOpts = { secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 86400 * 7 }
  setCookie(event, 'auth_planteles', plantelesStr, cookieOpts)
  setCookie(event, 'auth_active_plantel', activePlantel, cookieOpts)
  
  return { success: true }
})