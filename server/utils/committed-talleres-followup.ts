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

export async function settleCommittedTalleresFollowup<T>(planteles: string[], actions: FollowupActions<T>) {
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

  for (const plantel of targets) {
    if (!invalidated.has(plantel)) continue
    try {
      results.push({ plantel, result: await actions.refresh(plantel) })
    } catch (error) {
      failures.push({ plantel, operation: 'refresh', code: errorCode(error) })
    }
  }

  const current = failures.length === 0
  return {
    success: current,
    current,
    pending: !current,
    reason: current ? null : 'talleres_snapshot_refresh_pending',
    refreshed: results.length,
    results,
    failures,
  }
}
