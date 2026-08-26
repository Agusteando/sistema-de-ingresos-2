import { resolveControlEscolarAuth } from '../../../../utils/control-escolar'
import { sendControlEscolarHuskyPassEmail } from '../../../../utils/control-escolar-husky-pass-email'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const queryParams = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, queryParams.agentId)
  const matricula = String(event.context.params?.id || '').trim()
  const body = await readBody(event).catch(() => ({}))

  const result = await sendControlEscolarHuskyPassEmail({
    agentId: auth.agentId,
    matricula,
    requestedTo: body?.to,
    senderEmail: auth.user.email,
  })
  return { success: true, sentTo: result.sentTo }
})
