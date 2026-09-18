import { describe, expect, it } from 'vitest'
import { compareRankings, kendallTau } from '../compare'

describe('agreement between two rankings', () => {
  it('is 1 for identical taste and -1 for exact opposites', () => {
    expect(kendallTau([0, 1, 2, 3], [0, 1, 2, 3])).toBe(1)
    expect(kendallTau([0, 1, 2, 3], [3, 2, 1, 0])).toBe(-1)
  })

  it('sits between for a single swap', () => {
    // One adjacent swap out of six pairs: five agree, one does not.
    const tau = kendallTau([0, 1, 2, 3], [1, 0, 2, 3])!
    expect(tau).toBeCloseTo((5 - 1) / 6, 5)
  })

  it('only counts tracks both people ranked', () => {
    // The second person skipped track 3 entirely.
    expect(kendallTau([0, 1, 2, 3], [0, 1, 2])).toBe(1)
  })

  it('gives up rather than inventing a number', () => {
    expect(kendallTau([0], [0])).toBeNull()
    expect(kendallTau([0, 1], [2, 3])).toBeNull()
  })
})

describe('comparing rankings', () => {
  const entries = [
    { label: 'Erik', order: [0, 1, 2, 3, 4] },
    { label: 'Sam', order: [0, 2, 1, 4, 3] },
  ]

  it('orders the consensus by mean position', () => {
    const { rows } = compareRankings(entries)
    expect(rows[0]!.trackIndex).toBe(0)
    expect(rows[0]!.positions).toEqual([0, 0])
  })

  it('finds what everyone agrees on', () => {
    const { unanimous } = compareRankings(entries)
    expect(unanimous.map((r) => r.trackIndex)).toContain(0)
  })

  it('finds what is contested, worst first', () => {
    const wide = [
      { label: 'A', order: [0, 1, 2, 3, 4] },
      { label: 'B', order: [4, 3, 2, 1, 0] },
    ]
    const { contested } = compareRankings(wide)
    expect(contested[0]!.spread).toBe(4)
    expect([0, 4]).toContain(contested[0]!.trackIndex)
  })

  it('marks a track one person never ranked', () => {
    const { rows } = compareRankings([
      { label: 'A', order: [0, 1, 2] },
      { label: 'B', order: [0, 1] },
    ])
    const missing = rows.find((r) => r.trackIndex === 2)!
    expect(missing.positions).toEqual([2, null])
    expect(missing.spread).toBe(0)
  })

  it('handles more than two people', () => {
    const { rows, agreement, pairs } = compareRankings([
      { label: 'A', order: [0, 1, 2] },
      { label: 'B', order: [1, 0, 2] },
      { label: 'C', order: [0, 2, 1] },
    ])
    expect(rows).toHaveLength(3)
    // Tau is pairwise, but three people are three pairs, so a group still gets
    // a number — the mean over all of them.
    expect(pairs).toHaveLength(3)
    expect(agreement).toBeCloseTo((pairs[0]!.tau + pairs[1]!.tau + pairs[2]!.tau) / 3)
  })

  it('agrees with plain tau when there are only two people', () => {
    const a = [0, 1, 2, 3]
    const b = [1, 0, 3, 2]
    const { agreement } = compareRankings([
      { label: 'A', order: a },
      { label: 'B', order: b },
    ])
    expect(agreement).toBeCloseTo(kendallTau(a, b)!)
  })

  it('ranks the pairs so the closest and furthest can be named', () => {
    const { pairs } = compareRankings([
      { label: 'A', order: [0, 1, 2, 3] },
      { label: 'B', order: [0, 1, 2, 3] },
      { label: 'C', order: [3, 2, 1, 0] },
    ])
    expect(pairs[0]).toMatchObject({ a: 0, b: 1, tau: 1 })
    expect(pairs[pairs.length - 1]!.tau).toBe(-1)
  })

  it('lets the agreed-on bar grow with the album', () => {
    // On a 25-track album a two-place gap is agreement, not an argument; the
    // old fixed bar of one place made the panel empty out for groups.
    const order = Array.from({ length: 25 }, (_, i) => i)
    const nudged = [...order]
    ;[nudged[10], nudged[12]] = [nudged[12]!, nudged[10]!]
    const { unanimous } = compareRankings([
      { label: 'A', order },
      { label: 'B', order: nudged },
    ])
    expect(unanimous).toHaveLength(25)
  })
})
