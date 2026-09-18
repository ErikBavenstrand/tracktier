
export interface TierDef {
  key: string
  label: string
  /** Hue offset applied to the album's accent colour. */
  hue: number
}

export const DEFAULT_TIERS: TierDef[] = [
  { key: 'S', label: 'S', hue: 0 },
  { key: 'A', label: 'A', hue: 28 },
  { key: 'B', label: 'B', hue: 52 },
  { key: 'C', label: 'C', hue: 96 },
  { key: 'D', label: 'D', hue: 200 },
]

/** Short albums do not have room for five meaningful bands. */
export function tierCountFor(trackCount: number): number {
  if (trackCount <= 3) return 2
  if (trackCount <= 5) return 3
  if (trackCount <= 8) return 4
  return 5
}

/**
 * Jenks natural breaks over the sorted ratings.
 *
 * Fixed percentile cuts ("top 20% is S") produce tiers nobody agrees with,
 * because a listener's real opinion is lumpy: three untouchable songs, a long
 * middle, one they skip. Minimising variance within each band puts the cuts
 * where the listener's own ratings already separated, so the tiers land on the
 * gaps they actually feel.
 */
export function naturalBreaks(values: number[], classes: number): number[] {
  const n = values.length

  // Never ask for more bands than there are distinct ratings. Mid-session most
  // tracks still share the starting score, and forcing five bands onto three
  // real values would cut straight through a tied run — putting two tracks with
  // identical ratings in different tiers, and reshuffling them on every duel.
  const distinct = new Set(values).size
  classes = Math.min(classes, distinct)

  if (classes <= 1 || n <= classes) {
    return Array.from({ length: Math.max(0, Math.min(classes, n) - 1) }, (_, i) => i + 1)
  }

  // cost[i][k] = minimum within-class variance for the first i values in k classes.
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(classes + 1).fill(Infinity))
  const split: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(classes + 1).fill(0))
  cost[0]![0] = 0

  // Prefix sums give the variance of any span in constant time.
  const sum = new Array<number>(n + 1).fill(0)
  const sumSq = new Array<number>(n + 1).fill(0)
  for (let i = 0; i < n; i++) {
    sum[i + 1] = sum[i]! + values[i]!
    sumSq[i + 1] = sumSq[i]! + values[i]! ** 2
  }
  const variance = (from: number, to: number) => {
    const count = to - from
    if (count <= 0) return 0
    const total = sum[to]! - sum[from]!
    return sumSq[to]! - sumSq[from]! - (total * total) / count
  }

  for (let k = 1; k <= classes; k++) {
    for (let i = k; i <= n; i++) {
      for (let j = k - 1; j < i; j++) {
        const candidate = cost[j]![k - 1]! + variance(j, i)
        if (candidate < cost[i]![k]!) {
          cost[i]![k] = candidate
          split[i]![k] = j
        }
      }
    }
  }

  const breaks: number[] = []
  let end = n
  for (let k = classes; k > 1; k--) {
    const start = split[end]![k]!
    breaks.unshift(start)
    end = start
  }
  return breaks
}

/**
 * Tier boundaries by proportion of the ranking.
 *
 * A sort learns the order and nothing about the distance between neighbours, so
 * there are no gaps for natural breaks to find. These proportions are the
 * honest fallback: a small untouchable top, a wide middle, a short tail — the
 * shape a tier list usually takes. It is a real cost of ranking in the minimum
 * number of questions, and the reason `naturalBreaks` is kept against any
 * future source of magnitude.
 */
const TIER_SHARE = [0.15, 0.2, 0.3, 0.2, 0.15]

export function proportionalCuts(length: number, tierCount = tierCountFor(length)): number[] {
  if (length <= 1 || tierCount <= 1) return []

  const bands = Math.min(tierCount, length)
  const shares = TIER_SHARE.slice(0, bands)
  const total = shares.reduce((sum, share) => sum + share, 0)

  const sizes = shares.map((share) => Math.max(1, Math.round((share / total) * length)))
  // Rounding rarely lands on the exact track count; settle up in the wider bands.
  let drift = sizes.reduce((sum, size) => sum + size, 0) - length
  let index = sizes.length - 1
  let guard = 0
  while (drift !== 0 && guard++ < 1000) {
    if (drift > 0 && sizes[index]! > 1) {
      sizes[index]!--
      drift--
    } else if (drift < 0) {
      sizes[index]!++
      drift++
    }
    index = index === 0 ? sizes.length - 1 : index - 1
  }

  const cuts: number[] = []
  let running = 0
  for (let i = 0; i < sizes.length - 1; i++) {
    running += sizes[i]!
    cuts.push(running)
  }
  return cuts
}

export interface TierAssignment {
  /** Rank index at which each tier after the first begins. */
  cuts: number[]
  /** Tier index per rank position. */
  tierOfRank: number[]
}

export function tierOfRankFromCuts(length: number, cuts: number[]): number[] {
  const out = new Array<number>(length).fill(0)
  let tier = 0
  for (let rank = 0; rank < length; rank++) {
    while (tier < cuts.length && rank >= cuts[tier]!) tier++
    out[rank] = tier
  }
  return out
}

/** Rank positions grouped into tiers, including tiers left empty by a manual edit. */
export function groupByTier(tierOfRank: number[], tierCount: number): number[][] {
  const groups: number[][] = Array.from({ length: tierCount }, () => [])
  tierOfRank.forEach((tier, rank) => {
    groups[Math.min(tier, tierCount - 1)]?.push(rank)
  })
  return groups
}
