// The icon reports verified central HTTP reachability, never browser network state.
export function centralPingUrl(localRuntime, cloudUrl) {
  return `${localRuntime ? String(cloudUrl).replace(/\/+$/, '') : ''}/api/connectivity/ping`
}

export async function probeCentralConnectivity(url, signal, fetchImpl = globalThis.fetch, nonce = Date.now()) {
  try {
    const response = await fetchImpl(`${url}?_=${nonce}`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal
    })
    if (!response.ok) return false
    const payload = await response.json()
    return !signal.aborted && payload?.ok === true
  } catch {
    return false
  }
}
