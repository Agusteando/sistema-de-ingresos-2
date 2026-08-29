import { getTrustedAuthUser } from '../../../utils/auth-session'
import { saveTalleresContract } from '../../../utils/talleres-contracts'

export default defineEventHandler(async (event) => {
  const user = await getTrustedAuthUser(event)
  const body = await readBody(event).catch(() => ({}))
  return await saveTalleresContract({
    matricula: getRouterParam(event, 'matricula'),
    hasContract: body?.hasContract,
    observations: body?.observations,
    updatedBy: user.email,
  })
})
