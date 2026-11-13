// UI-only signal. It never changes student, financial or bridge state.
export const OUTAGE_TEXT = 'La conectividad de Totalplay del Servidor se ha desconectado'
export const INTERMITTENT_TEXT = 'Estamos presentando intermitencias con el Internet de Totalplay en la ubicación del Servidor'
export const REQUIRED_FAILURES = 3

export function createConnectivitySignal(day, stored = {}) {
  const validEpisodes = stored.day === day && Number.isSafeInteger(stored.episodes)
    && stored.episodes >= 0 && stored.episodes <= 100
  const episodes = validEpisodes ? stored.episodes : 0
  return {
    day,
    failures: 0,
    episodes,
    active: false,
    continuingEpisode: episodes > 0 && stored.active === true
  }
}

export function advanceConnectivitySignal(previous, observation, day) {
  let signal = previous
  if (signal.day !== day) {
    // A continuous overnight outage remains visible, but the day's history resets.
    signal = {
      day,
      failures: signal.active ? REQUIRED_FAILURES : 0,
      episodes: signal.active ? 1 : 0,
      active: signal.active,
      continuingEpisode: signal.active
    }
  }

  if (observation === 'up') {
    return { ...signal, failures: 0, active: false, continuingEpisode: false }
  }
  if (observation !== 'down' || signal.active) return signal

  const failures = Math.min(REQUIRED_FAILURES, signal.failures + 1)
  if (failures < REQUIRED_FAILURES) return { ...signal, failures }

  return {
    ...signal,
    failures,
    episodes: signal.continuingEpisode ? Math.max(1, signal.episodes) : signal.episodes + 1,
    active: true,
    continuingEpisode: true
  }
}

export function connectivityNoticeText(signal) {
  if (!signal.active) return ''
  return signal.episodes > 1 ? INTERMITTENT_TEXT : OUTAGE_TEXT
}

// An unavailable Aurora route alone is not evidence of a Totalplay incident.
export function classifyConnectivityProbes({ auroraReachable, relayReachable, independentInternetReachable }) {
  if (auroraReachable) return 'up'
  if (relayReachable === false && independentInternetReachable === true) return 'down'
  return 'unknown'
}
