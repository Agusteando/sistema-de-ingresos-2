export default defineEventHandler((event) => {
  deleteCookie(event, 'auth_username', { path: '/' })
  deleteCookie(event, 'auth_id', { path: '/' })
  deleteCookie(event, 'auth_name', { path: '/' })
  return { success: true }
})