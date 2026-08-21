import { setTalleresPortalCors } from '../../../../utils/talleres-portal-auth'

export default defineEventHandler((event) => {
  setTalleresPortalCors(event)
  setResponseStatus(event, 204)
  return ''
})
