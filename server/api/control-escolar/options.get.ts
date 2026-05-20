import { listControlEscolarPlanteles } from '../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  const { planteles } = await listControlEscolarPlanteles(event)
  setResponseHeader(event, 'Cache-Control', 'private, max-age=60')
  return { planteles }
})
