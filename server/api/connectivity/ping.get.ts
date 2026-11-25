// Public, read-only origin probe. It deliberately touches no databases or agents.
export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  setResponseHeader(event, 'Pragma', 'no-cache')
  // Local Aurora must verify the real central response across origins, without credentials.
  setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
  return { ok: true }
})
