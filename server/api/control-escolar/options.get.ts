import { listControlEscolarPlanteles } from '../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  const { activePlantel, planteles, user } = await listControlEscolarPlanteles(event)
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')
  setResponseHeader(event, 'Pragma', 'no-cache')
  setResponseHeader(event, 'Expires', '0')
  setResponseHeader(event, 'Vary', 'Cookie')
  return {
    activePlantel,
    planteles,
    access: {
      controlEscolar: true,
      financial: user.hasFinancialAccess,
      superAdmin: user.isSuperAdmin
    }
  }
})
