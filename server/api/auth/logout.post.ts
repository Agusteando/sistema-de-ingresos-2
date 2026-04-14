export default defineEventHandler((event) => {
  deleteCookie(event, 'auth_email', { path: '/' })
  deleteCookie(event, 'auth_name', { path: '/' })
  deleteCookie(event, 'auth_role', { path: '/' })
  deleteCookie(event, 'auth_plantel', { path: '/' })
  return { success: true }
})