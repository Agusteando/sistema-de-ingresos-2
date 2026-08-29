import { getTrustedAuthUser } from '../../../utils/auth-session'
import { readTalleresContract } from '../../../utils/talleres-contracts'

export default defineEventHandler(async (event) => {
  await getTrustedAuthUser(event)
  return await readTalleresContract(getRouterParam(event, 'matricula'))
})
