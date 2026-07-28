import { loadPlantelCollectionsDashboard } from '../../utils/dashboard-collections'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user?.isSuperAdmin) {
    throw createError({ statusCode: 403, message: 'Solo superadmin puede consultar este dashboard.' })
  }

  const { month } = getQuery(event)
  setHeader(event, 'Cache-Control', 'no-store, max-age=0')
  return await loadPlantelCollectionsDashboard(month)
})
