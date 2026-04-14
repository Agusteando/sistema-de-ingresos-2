export default defineEventHandler((event) => {
  deleteCookie(event, 'auth_email', { path: '/' })
  deleteCookie(event, 'auth_name', { path: '/' })
  return { success: true }
})