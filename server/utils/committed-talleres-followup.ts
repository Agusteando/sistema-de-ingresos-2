/** Complete a committed central-catalog mutation without confusing a failed
 * downstream roster refresh with a failed business write. Invalidation of all
 * scopes precedes refresh, so a partial refresh never certifies stale campuses.
 */
type FollowupOperation = 'invalidate' | 'refresh'
export type TalleresFollowupFailure = { plantel: string; operation: FollowupOperation; code: string }

type FollowupActions<T> = {
  invalidate: (plantel: string) => Promise<unknown>
  refresh: (plantel: string) => Promise<T>
}

const errorCode = (error: unknown) => String(
  (error as { statusMessage?: string; code?: string })?.statusMessage
  || (error as { code?: string })?.code
  || 'TALLERES_REFRESH_FAILED'
).slice(0, 100)

export async function settleCommittedTalleresFollowup<T>(
  planteles: string[],
  actions: FollowupActions<T>,
  options: { queued?: boolean; onComplete?: (result: { failures: TalleresFollowupFailure[]; refreshed: number }) => void } = {},
) {
  const targets = Array.from(new Set(planteles.filter(Boolean)))
  const failures: TalleresFollowupFailure[] = []
  const invalidated = new Set<string>()
  const results: Array<{ plantel: string; result: T }> = []

  // Invalidate every target before any rebuild, even when one source fails.
  for (const plantel of targets) {
    try {
      await actions.invalidate(plantel)
      invalidated.add(plantel)
    } catch (error) {
      failures.push({ plantel, operation: 'invalidate', code: errorCode(error) })
    }
  }

  const refreshAll = async () => {
    for (const plantel of targets) {
      if (!invalidated.has(plantel)) continue
      try {
        results.push({ plantel, result: await actions.refresh(plantel) })
      } catch (error) {
        failures.push({ plantel, operation: 'refresh', code: errorCode(error) })
      }
    }
    return { failures: [...failures], refreshed: results.length }
  }

  if (options.queued) {
    // Existing Nitro periodic refresh is the durable safety net if this process
    // restarts before the in-process best-effort job finishes.
    void refreshAll().then((summary) => options.onComplete?.(summary))
      .catch((error) => options.onComplete?.({ failures: [{ plantel: 'GLOBAL', operation: 'refresh', code: errorCode(error) }], refreshed: results.length }))
    return {
      success: failures.length === 0,
      current: false,
      pending: true,
      queued: true,
      reason: failures.length ? 'talleres_snapshot_invalidation_failed' : 'talleres_snapshot_refresh_queued',
      refreshed: 0,
      results: [],
      failures: [...failures],
    }
  }

  await refreshAll()
  const current = failures.length === 0
  return {
    success: current,
    current,
    pending: !current,
    queued: false,
    reason: current ? null : 'talleres_snapshot_refresh_pending',
    refreshed: results.length,
    results,
    failures,
  }
}
