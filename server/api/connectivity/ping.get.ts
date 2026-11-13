// Public, read-only origin probe. It deliberately touches no databases or agents.
export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  setResponseHeader(event, 'Pragma', 'no-cache')
  return { ok: true }
})
