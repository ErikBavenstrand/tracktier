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
  /**
   * Widest gap between any two people, in places on the longest list. Measured
   * proportionally, so a shorter ranking does not read as systematically
   * higher than a longer one.
   */
  spread: number
}

/** How two particular people got on, by their index in the entry list. */
export interface PairAgreement {
  a: number
  b: number
  /** Kendall tau over the tracks both of them ranked, in [-1, 1]. */
  tau: number
}

export interface Comparison {
  rows: TrackVerdict[]
  /**
   * Kendall tau across everyone, in [-1, 1]. For three or more people it is the
   * mean over every pair of them — the headline used to vanish at exactly the
   * group size this is for, which left a five-way comparison saying less than
   * a two-way one.
   */
  agreement: number | null
  /** Every pair, worst first, for saying who is closest to whom. */
  pairs: PairAgreement[]
  /** Tracks everyone placed close together. */
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

  // Somebody who left the skits out has a shorter list, so on a shared axis
  // every placing of theirs reads a place or two higher than the equivalent one
  // on a full list, and gaps measured raw fill up with arguments nobody had.
  //
  // Rescaling each list to the same length only inverts the bias — a track that
  // is last of eight is not the same opinion as eighth of ten. What is actually
  // comparable is the order people put the tracks they *both* ranked in, which
  // is the ground Kendall's tau already stands on. Gaps are measured there.
  // When everyone ranked the same tracks this is the raw position exactly.
  const common = [...tracks].filter((track) =>
    entries.every((entry) => entry.order.includes(track)),
  )
  const commonRank = entries.map((entry) => {
    const ranks = new Map<number, number>()
    entry.order
      .filter((track) => common.includes(track))
      .forEach((track, at) => ranks.set(track, at))
    return ranks
  })

  const rows: TrackVerdict[] = [...tracks].map((trackIndex) => {
    const seen = positions.get(trackIndex)!
    const known = seen.filter((value): value is number => value !== null)
    const mean = known.reduce((sum, value) => sum + value, 0) / (known.length || 1)
    const shared = commonRank
      .map((ranks) => ranks.get(trackIndex))
      .filter((value): value is number => value !== undefined)
    const spread =
      shared.length > 1 ? Math.max(...shared) - Math.min(...shared) : 0
    return { trackIndex, positions: seen, mean, spread }
  })
  rows.sort((x, y) => x.mean - y.mean)

  const pairs: PairAgreement[] = []
  for (let a = 0; a < entries.length; a++) {
    for (let b = a + 1; b < entries.length; b++) {
      const tau = kendallTau(entries[a]!.order, entries[b]!.order)
      if (tau !== null) pairs.push({ a, b, tau })
    }
  }
  pairs.sort((x, y) => y.tau - x.tau)
  const agreement = pairs.length
    ? pairs.reduce((sum, pair) => sum + pair.tau, 0) / pairs.length
    : null

  // "Within one place of each other" is a fair bar for two people and an
  // impossible one for five, so it scales with the album. Without this the
  // agreed-on panel simply stopped rendering once a group got big enough to
  // be interesting, leaving a comparison that could only show conflict.
  const together = Math.max(1, Math.round(rows.length * 0.12))

  return {
    rows,
    agreement,
    pairs,
    unanimous: rows.filter(
      (row) => row.spread <= together && row.positions.every((p) => p !== null),
    ),
    contested: [...rows].sort((x, y) => y.spread - x.spread).filter((row) => row.spread > 1),
  }
}
