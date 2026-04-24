export default defineEventHandler((event) => {
  deleteCookie(event, 'auth_email', { path: '/' })
  deleteCookie(event, 'auth_name', { path: '/' })
  deleteCookie(event, 'auth_role', { path: '/' })
  deleteCookie(event, 'auth_planteles', { path: '/' })
  deleteCookie(event, 'auth_active_plantel', { path: '/' })
  deleteCookie(event, 'db_bridge_agent_id', { path: '/' })

  return { success: true }
})