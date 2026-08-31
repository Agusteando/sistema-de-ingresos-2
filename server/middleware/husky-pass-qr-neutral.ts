import { defineEventHandler, getRequestURL, sendRedirect, setHeader } from 'h3'

const HUSKY_PASS_QR_PATHS = [
  /^\/validar\/persona-autorizada\/[1-9]\d{0,10}\/?$/i,
  /^\/validar\/[1-9]\d{0,10}\/?$/i,
  /^\/persona-autorizada\/[1-9]\d{0,10}\/?$/i,
  /^\/(?:pa|pase)\/[1-9]\d{0,10}\/?$/i
]

const isHuskyPassQrPath = (pathname: string) =>
  HUSKY_PASS_QR_PATHS.some((pattern) => pattern.test(pathname))

export default defineEventHandler((event) => {
  const method = String(event.node.req.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return

  const pathname = getRequestURL(event).pathname
  if (!isHuskyPassQrPath(pathname)) return

  // The QR payload is an identifier consumed by the institutional scanner only.
  // A normal browser must never resolve that identifier into student or family data.
  setHeader(event, 'Cache-Control', 'private, no-store, max-age=0')
  setHeader(event, 'Pragma', 'no-cache')
  setHeader(event, 'Referrer-Policy', 'no-referrer')
  setHeader(event, 'X-Robots-Tag', 'noindex, nofollow, noarchive')

  return sendRedirect(event, '/husky-pass', 302)
})
