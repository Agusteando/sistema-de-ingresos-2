import { checkBridgeAgentAvailability } from '../../utils/db'
import { PLANTELES_LIST } from '../../../utils/constants'
import { normalizePlantel } from '../../utils/auth-session'

const STATUS_TIMEOUT_MS = 3500
const STATUS_CONCURRENCY = 8

const runLimited = async <T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) => {
  const results: R[] = []
  let index = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const currentIndex = index
      index += 1
      results[currentIndex] = await worker(items[currentIndex])
    }
  })

  await Promise.all(workers)
  return results
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedPlantel = normalizePlantel(query.plantel)
  const planteles = requestedPlantel && PLANTELES_LIST.includes(requestedPlantel)
    ? [requestedPlantel]
    : PLANTELES_LIST

  const statuses = await runLimited(planteles, STATUS_CONCURRENCY, async (plantel) => {
    const availability = await checkBridgeAgentAvailability(plantel, { timeoutMs: STATUS_TIMEOUT_MS })

    return {
      plantel,
      online: availability.online,
      status: availability.status,
      message: availability.message,
      action: availability.action || '',
      code: availability.code || null,
      httpStatus: availability.httpStatus || null,
      checkedAt: new Date().toISOString()
    }
  })

  return {
    statuses,
    checkedAt: new Date().toISOString()
  }
})
