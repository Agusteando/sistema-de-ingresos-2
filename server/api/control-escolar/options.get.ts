import { getControlEscolarOptions } from '../../utils/control-escolar'

export default defineEventHandler(async (event) => {
  return await getControlEscolarOptions(event)
})
