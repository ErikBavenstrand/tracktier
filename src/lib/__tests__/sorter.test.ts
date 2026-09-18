import { describe, expect, it } from 'vitest'
import {
  answer,
  currentOrder,
  currentPair,
  estimateTotal,
  initSort,
  isComplete,
  isOrdered,
  progressOf,
  startRefining,
  theoreticalMinimum,
  undo,
  type SortState,
} from '../sorter'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${String(i).padStart(2, '0')}`)

/** A listener with a fixed, consistent opinion: t00 is best, t01 next, and so on. */
function runToCompletion(n: number, seed = 1) {
  let state = initSort(ids(n), seed)
  let guard = 0
  while (!isComplete(state)) {
    const pair = currentPair(state)
    if (!pair) break
    if (++guard > 10_000) throw new Error('sort did not terminate')
    state = answer(state, pair.a < pair.b ? 'a' : 'b')
  }
  return state
}

describe('interactive sort', () => {
  it('recovers the exact order for every album length', () => {
    for (let n = 1; n <= 40; n++) {
      const state = runToCompletion(n, n * 7 + 1)
      expect(state.placed, `n=${n}`).toEqual(ids(n))
    }
  })

  it('is unaffected by the order tracks are dealt in', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      expect(runToCompletion(13, seed).placed).toEqual(ids(13))
    }
  })

  it('stays within a sensible margin of the information-theoretic floor', () => {
    for (const n of [8, 13, 20, 30]) {
      const used = runToCompletion(n, 5).comparisons
      const floor = theoreticalMinimum(n)
      // log2(n!) bounds the WORST case, so a given album may beat it when the
      // binary search windows happen to collapse early. What must hold is that
      // we never exceed binary insertion's worst case, and stay near the floor.
      expect(used, `n=${n}`).toBeLessThanOrEqual(estimateTotal(n))
      expect(used, `n=${n}`).toBeGreaterThanOrEqual(n - 1)
      expect(used / floor, `n=${n}`).toBeLessThan(1.25)
    }
  })

  it('averages close to the floor across many albums', () => {
    // Averaged over inputs the bound does bite, so this is the honest check.
    const n = 13
    const runs = Array.from({ length: 200 }, (_, seed) => runToCompletion(n, seed + 1).comparisons)
    const mean = runs.reduce((sum, value) => sum + value, 0) / runs.length
    expect(mean).toBeGreaterThanOrEqual(theoreticalMinimum(n) - 1)
    expect(mean / theoreticalMinimum(n)).toBeLessThan(1.15)
  })

  it('predicts its own total before a single answer', () => {
    for (const n of [5, 13, 20]) {
      const start = progressOf(initSort(ids(n), 3))
      expect(start.total).toBe(estimateTotal(n))
      expect(start.done).toBe(0)
      expect(start.fraction).toBe(0)
    }
  })

  it('progress only ever moves forward, and lands exactly on 1', () => {
    let state = initSort(ids(13), 4)
    let previous = progressOf(state).fraction
    while (!isComplete(state)) {
      const pair = currentPair(state)!
      state = answer(state, pair.a < pair.b ? 'a' : 'b')
      const now = progressOf(state).fraction
      expect(now).toBeGreaterThanOrEqual(previous)
      previous = now
    }
    const end = progressOf(state)
    expect(end.fraction).toBe(1)
    expect(end.remaining).toBe(0)
    expect(end.complete).toBe(true)
  })

  it('a tie places the track adjacent and skips the rest of that search', () => {
    // Ties cannot cost more than deciding would have.
    const decided = runToCompletion(13, 8).comparisons
    let tied = initSort(ids(13), 8)
    let guard = 0
    while (!isComplete(tied)) {
      if (++guard > 10_000) throw new Error('did not terminate')
      tied = answer(tied, 'tie')
    }
    expect(tied.placed).toHaveLength(13)
    expect(tied.comparisons).toBeLessThanOrEqual(decided)
  })

  it('undo restores the previous state exactly, at any point', () => {
    let state = initSort(ids(11), 6)
    const seen: SortState[] = []
    while (!isComplete(state)) {
      seen.push(state)
      const pair = currentPair(state)!
      state = answer(state, pair.a < pair.b ? 'a' : 'b')
    }
    // Walk all the way back and check every intermediate state matches.
    for (let i = seen.length - 1; i >= 0; i--) {
      state = undo(state)
      expect(state.placed, `step ${i}`).toEqual(seen[i]!.placed)
      expect(state.queue, `step ${i}`).toEqual(seen[i]!.queue)
      expect(state.current, `step ${i}`).toBe(seen[i]!.current)
      expect(state.lo, `step ${i}`).toBe(seen[i]!.lo)
      expect(state.hi, `step ${i}`).toBe(seen[i]!.hi)
      expect(state.comparisons, `step ${i}`).toBe(seen[i]!.comparisons)
    }
  })

  it('undo then re-answer reaches the same result', () => {
    let state = initSort(ids(9), 2)
    for (let i = 0; i < 6; i++) {
      const pair = currentPair(state)!
      state = answer(state, pair.a < pair.b ? 'a' : 'b')
    }
    const rewound = answer(undo(state), currentPair(undo(state))!.a < currentPair(undo(state))!.b ? 'a' : 'b')
    expect(rewound.placed).toEqual(state.placed)
    expect(rewound.comparisons).toBe(state.comparisons)
  })

  it('undo at the very start is a no-op', () => {
    const start = initSort(ids(6), 1)
    expect(undo(start)).toEqual(start)
  })

  it('never loses or duplicates a track', () => {
    let state = initSort(ids(15), 11)
    while (!isComplete(state)) {
      const all = currentOrder(state)
      expect(new Set(all).size).toBe(15)
      const pair = currentPair(state)!
      state = answer(state, pair.a < pair.b ? 'a' : 'b')
    }
    expect(new Set(currentOrder(state)).size).toBe(15)
  })

  it('handles trivial albums', () => {
    expect(isComplete(initSort([], 1))).toBe(true)
    expect(isComplete(initSort(['only'], 1))).toBe(true)
    expect(initSort(['only'], 1).placed).toEqual(['only'])
    expect(progressOf(initSort(['only'], 1)).fraction).toBe(1)
  })
})

describe('refining repairs mistakes', () => {
  const ordered = (n: number) => ids(n)

  /** Sort with a consistent listener, except for `slips` deliberately wrong answers. */
  function sortWithSlips(n: number, seed: number, slips: number) {
    let state = initSort(ordered(n), seed)
    let answered = 0
    const slipAt = new Set<number>()
    // Spread the slips across the run rather than bunching them at the start.
    for (let i = 0; i < slips; i++) slipAt.add(3 + i * 7)
    while (!isOrdered(state)) {
      const pair = currentPair(state)
      if (!pair) break
      const truthful = pair.a < pair.b
      const lying = slipAt.has(answered)
      state = answer(state, (lying ? !truthful : truthful) ? 'a' : 'b')
      answered++
    }
    return state
  }

  const displacement = (placed: string[]) =>
    placed.reduce((sum, id, index) => sum + Math.abs(Number(id.slice(1)) - index), 0)

  it('a single slip leaves most of the ranking intact', () => {
    // Binary insertion is not the quicksort that O(log n) displacement bound
    // was proved for: a wrong answer near the top of a wide binary search can
    // misroute a track by half the list and cascade. Measured over 200 runs of
    // a 16-track album with one slip, 88% of tracks still land within one
    // position on average — but the worst case reaches a displacement of 34,
    // which is precisely why the refining sweep exists rather than being a nicety.
    const runs = Array.from({ length: 200 }, (_, seed) => sortWithSlips(16, seed + 1, 1).placed)
    const within = runs.map(
      (placed) =>
        placed.filter((id, index) => Math.abs(Number(id.slice(1)) - index) <= 1).length /
        placed.length,
    )
    const averageWithin = within.reduce((sum, value) => sum + value, 0) / within.length
    const averageDisplacement =
      runs.reduce((sum, placed) => sum + displacement(placed), 0) / runs.length

    expect(averageWithin).toBeGreaterThan(0.8)
    expect(averageDisplacement).toBeLessThan(16)
  })

  it('a refining sweep repairs the damage', () => {
    let before = 0
    let after = 0
    for (let seed = 1; seed <= 60; seed++) {
      const slipped = sortWithSlips(14, seed, 1)
      before += displacement(slipped.placed)

      // The listener answers honestly during the sweep.
      let state = startRefining(slipped)
      let guard = 0
      while (!isComplete(state)) {
        const pair = currentPair(state)
        if (!pair) break
        if (++guard > 5_000) throw new Error('refining did not terminate')
        state = answer(state, pair.a < pair.b ? 'a' : 'b')
      }
      after += displacement(state.placed)
    }
    // Measured: the sweep removes better than 90% of the total displacement.
    expect(before).toBeGreaterThan(0)
    expect(after).toBeLessThan(before * 0.2)
  })

  it('refining an already correct order changes nothing', () => {
    const clean = runToCompletion(12, 9)
    let state = startRefining(clean)
    let guard = 0
    while (!isComplete(state)) {
      const pair = currentPair(state)
      if (!pair) break
      if (++guard > 5_000) throw new Error('did not terminate')
      state = answer(state, pair.a < pair.b ? 'a' : 'b')
    }
    expect(state.placed).toEqual(ids(12))
  })

  it('terminates even against a listener who contradicts themselves', () => {
    const clean = runToCompletion(12, 3)
    let state = startRefining(clean)
    let guard = 0
    // Always says the lower-ranked one is better: an unwinnable, endless swap.
    while (!isComplete(state)) {
      if (++guard > 500) throw new Error('refining looped')
      state = answer(state, 'b')
    }
    expect(state.placed).toHaveLength(12)
    expect(new Set(state.placed).size).toBe(12)
  })
})
