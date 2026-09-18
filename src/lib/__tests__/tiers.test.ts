import { describe, expect, it } from 'vitest'
import { naturalBreaks, proportionalCuts, tierCountFor, tierOfRankFromCuts } from '../tiers'

describe('tiers', () => {
  it('cuts at the natural gaps rather than at fixed percentiles', () => {
    // Three clear clusters: percentile cuts would split them evenly instead.
    const values = [100, 99, 98, 60, 59, 58, 10, 9]
    expect(naturalBreaks(values, 3)).toEqual([3, 6])
  })

  it('never returns more cuts than it can fill', () => {
    expect(naturalBreaks([5, 4], 5)).toHaveLength(1)
  })

  it('never splits a run of identical ratings', () => {
    // One duel in: a winner, a loser, and everything else still tied.
    const values = [1032, 1000, 1000, 1000, 1000, 1000, 968]
    const cuts = naturalBreaks(values, 5)
    expect(cuts).toEqual([1, 6])
    // Which is to say: three bands, with the tied block whole in the middle.
    const tiers = tierOfRankFromCuts(values.length, cuts)
    expect(tiers).toEqual([0, 1, 1, 1, 1, 1, 2])
  })

  it('gives every track one band when nothing has separated yet', () => {
    expect(naturalBreaks([1000, 1000, 1000, 1000], 5)).toEqual([])
  })

  it('grows to the full band count once ratings spread', () => {
    const values = [1200, 1140, 1050, 1000, 940, 880, 800]
    expect(naturalBreaks(values, 5)).toHaveLength(4)
  })

  it('splits a sorted list into proportional bands', () => {
    // A sort gives order and nothing about distance, so bands come from shares.
    const cuts = proportionalCuts(13, 5)
    const tiers = tierOfRankFromCuts(13, cuts)
    const sizes = tiers.reduce<number[]>((acc, tier) => {
      acc[tier] = (acc[tier] ?? 0) + 1
      return acc
    }, [])
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(13)
    expect(sizes).toHaveLength(5)
    // A small top, a wide middle, a short tail.
    expect(sizes[0]!).toBeLessThan(sizes[2]!)
    expect(sizes[4]!).toBeLessThan(sizes[2]!)
  })

  it('never leaves a band empty, at any album length', () => {
    for (let n = 2; n <= 40; n++) {
      const tierCount = tierCountFor(n)
      const tiers = tierOfRankFromCuts(n, proportionalCuts(n, tierCount))
      expect(new Set(tiers).size, `n=${n}`).toBe(tierCount)
      expect(tiers, `n=${n}`).toHaveLength(n)
    }
  })

  it('maps cuts onto per-rank tiers', () => {
    expect(tierOfRankFromCuts(6, [2, 4])).toEqual([0, 0, 1, 1, 2, 2])
  })

})
