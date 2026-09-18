/**
 * Reading two or more rankings of the same album against each other.
 *
 * The consensus alone is the boring half: what people actually want to know is
 * where they agree, where they do not, and who has the strange opinion. All of
 * it comes from the orderings themselves — no extra data, no server.
 */

export interface Entry {
  label: string
  /** Album track indices, best first. */
  order: number[]
}

export interface TrackVerdict {
  trackIndex: number
  /** Position per person, in the order they were given. */
  positions: (number | null)[]
  /** Mean position across everyone who ranked it. */
  mean: number
  /** Widest gap in position between any two people. */
  spread: number
}

export interface Comparison {
  rows: TrackVerdict[]
  /** Kendall tau over the tracks both ranked, in [-1, 1]. Only for pairs. */
  agreement: number | null
  /** Tracks everyone put within one place of each other. */
  unanimous: TrackVerdict[]
  /** Tracks people most disagree about, worst first. */
  contested: TrackVerdict[]
}

/**
 * Kendall's tau: over every pair of tracks, do the two orderings put them the
 * same way round? +1 is identical taste, 0 is unrelated, -1 is exact opposites.
 * It is the honest measure here because it asks only about relative order,
 * which is all a ranking claims to know.
 */
export function kendallTau(a: number[], b: number[]): number | null {
  const positionInB = new Map(b.map((track, index) => [track, index]))
  const shared = a.filter((track) => positionInB.has(track))
  if (shared.length < 2) return null

  let concordant = 0
  let discordant = 0
  for (let i = 0; i < shared.length; i++) {
    for (let j = i + 1; j < shared.length; j++) {
      const left = positionInB.get(shared[i]!)! - positionInB.get(shared[j]!)!
      // i comes before j in `a` by construction, so agreement means b agrees.
      if (left < 0) concordant++
      else discordant++
    }
  }
  const total = concordant + discordant
  return total === 0 ? null : (concordant - discordant) / total
}

export function compareRankings(entries: Entry[]): Comparison {
  const positions = new Map<number, (number | null)[]>()
  const tracks = new Set<number>()
  for (const entry of entries) for (const track of entry.order) tracks.add(track)

  for (const track of tracks) {
    positions.set(
      track,
      entries.map((entry) => {
        const at = entry.order.indexOf(track)
        return at === -1 ? null : at
      }),
    )
  }

  const rows: TrackVerdict[] = [...tracks].map((trackIndex) => {
    const seen = positions.get(trackIndex)!
    const known = seen.filter((value): value is number => value !== null)
    const mean = known.reduce((sum, value) => sum + value, 0) / (known.length || 1)
    const spread = known.length > 1 ? Math.max(...known) - Math.min(...known) : 0
    return { trackIndex, positions: seen, mean, spread }
  })
  rows.sort((x, y) => x.mean - y.mean)

  const agreement =
    entries.length === 2 ? kendallTau(entries[0]!.order, entries[1]!.order) : null

  return {
    rows,
    agreement,
    unanimous: rows.filter((row) => row.spread <= 1 && row.positions.every((p) => p !== null)),
    contested: [...rows].sort((x, y) => y.spread - x.spread).filter((row) => row.spread > 1),
  }
}
