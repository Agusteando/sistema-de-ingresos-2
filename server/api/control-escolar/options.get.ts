import { listControlEscolarPlanteles } from '../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  const { activePlantel, planteles, user } = await listControlEscolarPlanteles(event)
  setResponseHeader(event, 'Cache-Control', 'private, max-age=60')
  return {
    activePlantel,
    planteles,
    access: {
      controlEscolar: true,
      financial: true,
      superAdmin: user.isSuperAdmin
    }
  }
})
