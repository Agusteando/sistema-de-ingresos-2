import { randomUUID } from 'node:crypto'

const cleanRequestId = (value: unknown) => String(value || '')
  .trim()
  .replace(/[^a-zA-Z0-9._-]/g, '')
  .slice(0, 80)

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  if (!url.pathname.startsWith('/api/')) return

  const requestId = cleanRequestId(getHeader(event, 'x-aurora-request-id')) || randomUUID()
  event.context.auroraRequestId = requestId
  event.context.auroraRequestStartedAt = Date.now()
  setResponseHeader(event, 'X-Aurora-Request-Id', requestId)
})
