import { isLocalSystemRuntime } from '../../utils/local-system-manager'

// Older versions redirected to Aurora cloud. Preserve the route without making
// a central server or Google account a prerequisite for local authentication.
export default defineEventHandler((event) => {
  if (!isLocalSystemRuntime()) throw createError({ statusCode: 404, message: 'Solo Aurora Local.' })
  setHeader(event, 'Cache-Control', 'no-store')
  return sendRedirect(event, '/login', 302)
})
