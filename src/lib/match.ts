/**
 * Cross-catalogue matching. Used when a Spotify link has to be played back
 * through Deezer or Apple, and to fold duplicate search hits together.
 */

const EDITION_NOISE =
  /\s*[([][^)\]]*(remaster|deluxe|expanded|edition|version|anniversary|reissue|bonus|explicit|mono|stereo|live at|special)[^)\]]*[)\]]/gi

export function normalizeTitle(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(EDITION_NOISE, ' ')
    .replace(/\s*-\s*(single|ep|remastered.*|deluxe.*|\d{4}\s*remaster.*)$/i, ' ')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function bigrams(value: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (let i = 0; i < value.length - 1; i++) {
    const gram = value.slice(i, i + 2)
    counts.set(gram, (counts.get(gram) ?? 0) + 1)
  }
  return counts
}

/** Sørensen–Dice coefficient over character bigrams, in [0, 1]. */
export function similarity(a: string, b: string): number {
  const left = normalizeTitle(a)
  const right = normalizeTitle(b)
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0

  const gramsA = bigrams(left)
  const gramsB = bigrams(right)
  let shared = 0
  let totalA = 0
  let totalB = 0
  for (const n of gramsA.values()) totalA += n
  for (const [gram, n] of gramsB) {
    totalB += n
    shared += Math.min(n, gramsA.get(gram) ?? 0)
  }
  return (2 * shared) / (totalA + totalB)
}

export interface MatchTarget {
  title: string
  artist?: string | null
  trackCount?: number | null
}

export interface Scored<T> {
  item: T
  score: number
}

/**
 * Rank candidates against a target album. Title dominates; artist and track
 * count act as tie-breakers because editions of the same record differ there.
 */
export function rankMatches<T extends MatchTarget>(target: MatchTarget, candidates: T[]): Scored<T>[] {
  return candidates
    .map((item) => {
      const title = similarity(target.title, item.title)
      const artist =
        target.artist && item.artist ? similarity(target.artist, item.artist) : null
      const counts =
        target.trackCount && item.trackCount
          ? 1 - Math.min(1, Math.abs(target.trackCount - item.trackCount) / target.trackCount)
          : null

      // Redistribute the weight of whatever signals we do not have.
      let score = title * 0.65
      let weight = 0.65
      if (artist !== null) {
        score += artist * 0.25
        weight += 0.25
      }
      if (counts !== null) {
        score += counts * 0.1
        weight += 0.1
      }
      return { item, score: score / weight }
    })
    .sort((a, b) => b.score - a.score)
}

/** True when the top hit is both strong and clearly ahead of the runner-up. */
export function isConfident<T>(ranked: Scored<T>[]): boolean {
  const best = ranked[0]
  if (!best || best.score < 0.82) return false
  const runnerUp = ranked[1]
  return !runnerUp || best.score - runnerUp.score > 0.12
}
