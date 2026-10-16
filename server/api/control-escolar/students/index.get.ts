import { refreshVerifiedControlEscolarCacheForScope, resolveControlEscolarAuth, runControlEscolar } from '../../../utils/control-escolar'
import { fetchControlEscolarStudentsWithCanonicalGroups } from '../../../utils/control-escolar-groups'
import { attachCustomSectionsToStudents } from '../../../utils/student-sections'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const queryParams = getQuery(event)
  const auth = await resolveControlEscolarAuth(event, queryParams.agentId)

  return await runControlEscolar(event, auth.agentId, async () => {
    try {
      const result = await fetchControlEscolarStudentsWithCanonicalGroups(auth.agentId, queryParams)
      const source: any = result?.source || {}
      let sectionsStatus = 'ready'
      try {
        result.data = await attachCustomSectionsToStudents(result.data || [], auth.user, { plantel: auth.agentId })
      } catch (error: any) {
        sectionsStatus = 'unavailable'
        console.warn('[Control Escolar Sections] Membership lookup failed.', {
          plantel: auth.agentId, code: error?.code || null, message: error?.message || String(error)
        })
        // Do not make the academic list unavailable if sections cannot be loaded.
        result.data = (result.data || []).map((student: any) => ({ ...student, customSections: [] }))
      }
      result.source = { ...source, sections: {
        status: sectionsStatus,
        linkedStudents: result.data.filter((student: any) => student.customSections?.length).length
      } }
      if (source.cacheRefreshDue && source.cacheRows > 0) {
        const refreshPromise = refreshVerifiedControlEscolarCacheForScope(auth.agentId, queryParams).catch((error: any) => {
          console.warn('[Control Escolar Cache] Background refresh after stale cache read failed.', {
            plantel: auth.agentId,
            message: error?.message || error
          })
        })
        const waitUntil = (event as any).waitUntil
        if (typeof waitUntil === 'function') waitUntil.call(event, refreshPromise)
        else void refreshPromise
      }
      return { agentId: auth.agentId, ...result }
    } catch (error: any) {
      const errorData = error?.data || {}
      const statusCode = error?.statusCode || error?.httpStatus || (error?.name === 'AbortError' ? 504 : 502)
      const message = errorData?.message || error?.statusMessage || error?.message || 'No se pudieron cargar alumnos de Control Escolar para este plantel.'
      const safeMessage = String(message).slice(0, 500)

      setResponseStatus(event, statusCode, safeMessage)
      return {
        error: true,
        statusCode,
        statusMessage: safeMessage,
        message: safeMessage,
        code: error?.code || errorData?.code || errorData?.data?.code || null,
        bridgeStatus: error?.httpStatus || null,
        agentId: auth.agentId
      }
    }
  })
})
