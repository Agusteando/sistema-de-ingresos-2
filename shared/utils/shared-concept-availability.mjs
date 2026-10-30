/** Query each campus independently; no failure is ever interpreted as zero students. */
export async function collectAvailableConceptReports(planteles, load, concurrency = 3) {
  const outcomes = new Array(planteles.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), planteles.length) }, async () => {
    while (nextIndex < planteles.length) {
      const index = nextIndex++
      const plantel = planteles[index]
      try { outcomes[index] = { plantel, report: await load(plantel) } }
      catch (error) { outcomes[index] = { plantel, error } }
    }
  })
  await Promise.all(workers)
  return {
    available: outcomes.filter(item => !('error' in item)),
    failures: outcomes.filter(item => 'error' in item),
  }
}
