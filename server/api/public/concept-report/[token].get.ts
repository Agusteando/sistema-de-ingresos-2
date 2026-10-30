import { resolveSharedConceptLink, loadPublicSharedConceptReport } from '../../../utils/public-concept-links'

export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store, private')
  setHeader(event, 'Referrer-Policy', 'no-referrer')
  setHeader(event, 'X-Robots-Tag', 'noindex, nofollow, noarchive')
  const token = String(getRouterParam(event, 'token') || '')
  const link = await resolveSharedConceptLink(token)
  const data = await loadPublicSharedConceptReport(link)
  return { ...data, conceptoId: link.conceptoId, planteles: link.planteles }
})
