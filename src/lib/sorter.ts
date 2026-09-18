/**
 * Interactive binary-insertion sort.
 *
 * A listener's favourite track does not get better while they answer, so their
 * order is a fixed unknown, not a drifting skill. That makes this a sorting
 * problem, and sorting has a floor: log2(n!) comparisons — 33 for a 13-track
 * album. A rating system cannot approach it, because it re-asks what
 * transitivity already settled; simulated against consistent answers, Glicko
 * needed ~45 duels for that album and still left pairs out of order.
 *
 * Binary insertion spends ceil(log2(k+1)) comparisons placing the (k+1)th
 * track, totalling 37 for 13 tracks against the bound of 33 — within 14% of
 * optimal, and unlike Ford-Johnson it is simple enough to make undoable and
 * resumable, which matters more than the last four questions.
 *
 * Listeners do slip, and a sort takes every answer as true. The saving grace is
 * that the damage is bounded: Maystre & Grossglauser show a mistaken comparison
 * displaces an item by only O(log n) positions, so errors stay local rather
 * than scrambling the order. That is what the refining pass afterwards is for —
 * re-asking each neighbouring pair costs n-1 comparisons and is exactly where a
 * displaced track will be found. https://arxiv.org/abs/1502.05556
 */

export type Verdict = 'a' | 'b' | 'tie'

export type Phase = 'placing' | 'refining' | 'done'

export interface SortState {
  phase: Phase
  /** Placed tracks, best first. */
  placed: string[]
  /** Tracks still waiting to be placed. */
  queue: string[]
  /** The track being placed right now. */
  current: string | null
  /** Binary search window within `placed`. */
  lo: number
  hi: number
  /** While refining: the neighbouring pair under review. */
  cursor: number
  /** Guards the refining pass against an indecisive listener looping forever. */
  refineBudget: number
  /** Whether the neighbour sweep has been run, so it is only offered once. */
  refined: boolean
  comparisons: number
  history: Step[]
}

interface Step {
  phase: Phase
  verdict: Verdict
  current: string | null
  lo: number
  hi: number
  cursor: number
  refineBudget: number
  placed: string[]
  queueLength: number
}

/** Deterministic shuffle, so the running order is fair but reproducible. */
function shuffled(ids: string[], seed: number): string[] {
  const out = [...ids]
  let state = seed >>> 0 || 1
  for (let i = out.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const j = state % (i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export function initSort(ids: string[], seed = 1): SortState {
  // Album order would ask about track 1 first every time and leave the closing
  // run to a tired listener; a fixed shuffle spreads that around.
  const order = shuffled(ids, seed)
  const [first, ...rest] = order
  const state: SortState = {
    phase: 'placing',
    placed: first ? [first] : [],
    queue: rest,
    current: null,
    lo: 0,
    hi: 0,
    cursor: 0,
    // Two sweeps' worth: enough to carry a displaced track back where it
    // belongs, not enough to loop on a listener who keeps changing their mind.
    refineBudget: Math.max(0, (ids.length - 1) * 2),
    refined: false,
    comparisons: 0,
    history: [],
  }
  return beginNext(state)
}

/** Take the next track off the queue and open a full-width search window. */
function beginNext(state: SortState): SortState {
  if (state.current !== null) return state
  const [next, ...rest] = state.queue
  // Placing is done; a full order now exists and only needs checking.
  if (!next) return { ...state, current: null, phase: 'done' }
  return { ...state, current: next, queue: rest, lo: 0, hi: state.placed.length }
}

export const isComplete = (state: SortState): boolean => state.phase === 'done'

/** Placing is finished and a full order exists, refined or not. */
export const isOrdered = (state: SortState): boolean =>
  state.current === null && state.queue.length === 0

/**
 * Begin re-asking each neighbouring pair.
 *
 * Only neighbours are worth revisiting: a slip during placement moves a track a
 * few positions at most, so the evidence of it is always between adjacent
 * entries — and n-1 questions is a cheap insurance policy against one misclick.
 */
export function startRefining(state: SortState): SortState {
  if (!isOrdered(state) || state.placed.length < 2) return state
  return { ...state, phase: 'refining', cursor: 0, refined: true }
}

/** The two tracks to put in front of the listener, or null when finished. */
export function currentPair(state: SortState): { a: string; b: string } | null {
  if (state.phase === 'refining') {
    // `a` is always the one currently ranked higher, so a win for `b` is a swap.
    const a = state.placed[state.cursor]
    const b = state.placed[state.cursor + 1]
    return a && b ? { a, b } : null
  }
  if (state.current === null || state.lo >= state.hi) return null
  const pivot = state.placed[Math.floor((state.lo + state.hi) / 2)]
  return pivot ? { a: state.current, b: pivot } : null
}

export function answer(state: SortState, verdict: Verdict): SortState {
  const pair = currentPair(state)
  if (!pair) return state

  const step: Step = {
    phase: state.phase,
    verdict,
    current: state.current,
    lo: state.lo,
    hi: state.hi,
    cursor: state.cursor,
    refineBudget: state.refineBudget,
    placed: state.placed,
    queueLength: state.queue.length,
  }

  if (state.phase === 'refining') return refine(state, verdict, step)

  const inserting = state.current
  if (inserting === null) return state

  const mid = Math.floor((state.lo + state.hi) / 2)

  let lo = state.lo
  let hi = state.hi
  if (verdict === 'a') {
    // The new track wins, so it belongs somewhere above the pivot.
    hi = mid
  } else if (verdict === 'b') {
    lo = mid + 1
  } else {
    // A tie needs no further narrowing: sitting directly below the track it
    // ties with is as true as any other placement, and it saves the rest of
    // this binary search.
    lo = mid + 1
    hi = mid + 1
  }

  const next: SortState = {
    ...state,
    lo,
    hi,
    comparisons: state.comparisons + 1,
    history: [...state.history, step],
  }

  if (lo < hi) return next

  const placed = [...next.placed.slice(0, lo), inserting, ...next.placed.slice(lo)]
  return beginNext({ ...next, placed, current: null, lo: 0, hi: 0 })
}

/**
 * One step of the neighbour sweep.
 *
 * A swap steps the cursor back one place, so a track that was sitting too low
 * keeps rising until it meets someone it loses to — the same motion as an
 * insertion sort, driven by the listener.
 */
function refine(state: SortState, verdict: Verdict, step: Step): SortState {
  const next: SortState = {
    ...state,
    comparisons: state.comparisons + 1,
    refineBudget: state.refineBudget - 1,
    history: [...state.history, step],
  }

  let placed = state.placed
  let cursor = state.cursor

  if (verdict === 'b') {
    placed = [...state.placed]
    const upper = placed[cursor]!
    placed[cursor] = placed[cursor + 1]!
    placed[cursor + 1] = upper
    cursor = Math.max(0, cursor - 1)
  } else {
    cursor = cursor + 1
  }

  const finished = cursor >= placed.length - 1 || next.refineBudget <= 0
  return { ...next, placed, cursor, phase: finished ? 'done' : 'refining' }
}

export function undo(state: SortState): SortState {
  const step = state.history[state.history.length - 1]
  if (!step) return state

  // The placed list is snapshotted per step, so rewinding a swap or an
  // insertion is the same operation either way.
  if (step.phase === 'refining') {
    return {
      ...state,
      phase: 'refining',
      placed: step.placed,
      cursor: step.cursor,
      refineBudget: step.refineBudget,
      comparisons: state.comparisons - 1,
      history: state.history.slice(0, -1),
    }
  }

  let queue = state.queue
  // If that answer finished an insertion, return whatever was taken off the
  // queue to replace it.
  if (state.placed.length > step.placed.length && state.current !== null) {
    queue = [state.current, ...queue]
  }

  return {
    ...state,
    phase: 'placing',
    placed: step.placed,
    queue,
    current: step.current,
    lo: step.lo,
    hi: step.hi,
    cursor: step.cursor,
    refineBudget: step.refineBudget,
    comparisons: state.comparisons - 1,
    history: state.history.slice(0, -1),
  }
}

/** Comparisons binary insertion needs to place one track into `size` placed ones. */
const costToInsert = (size: number): number => (size <= 0 ? 0 : Math.ceil(Math.log2(size + 1)))

export interface SortProgress {
  phase: Phase
  done: number
  /** Comparisons still expected in this phase, before any ties shorten it. */
  remaining: number
  total: number
  /** 0–1 within the current phase. It reaches exactly 1, because the work ends. */
  fraction: number
  complete: boolean
  placedCount: number
  totalCount: number
}

export function progressOf(state: SortState): SortProgress {
  const totalCount = state.placed.length + state.queue.length + (state.current ? 1 : 0)

  if (state.phase === 'refining') {
    const total = Math.max(1, state.placed.length - 1)
    const done = Math.min(state.cursor, total)
    return {
      phase: state.phase,
      done,
      remaining: total - done,
      total,
      fraction: done / total,
      complete: false,
      placedCount: state.placed.length,
      totalCount,
    }
  }

  // What is left for the track in hand, plus what each queued track will cost.
  let remaining = state.lo < state.hi ? costToInsert(state.hi - state.lo - 1) + 1 : 0
  let size = state.placed.length + (state.current === null ? 0 : 1)
  for (let i = 0; i < state.queue.length; i++) {
    remaining += costToInsert(size)
    size++
  }

  const done = state.comparisons
  const total = done + remaining
  return {
    phase: state.phase,
    done,
    remaining,
    total,
    fraction: total === 0 ? 1 : done / total,
    complete: isComplete(state),
    placedCount: state.placed.length,
    totalCount,
  }
}

/** Comparisons a whole album is expected to take, for up-front copy. */
export function estimateTotal(trackCount: number): number {
  let total = 0
  for (let size = 1; size < trackCount; size++) total += costToInsert(size)
  return total
}

/** The information-theoretic floor, for honesty about how close we get. */
export function theoreticalMinimum(trackCount: number): number {
  let logFactorial = 0
  for (let i = 2; i <= trackCount; i++) logFactorial += Math.log2(i)
  return Math.ceil(logFactorial)
}

/** Placed tracks first, then whatever has not been reached yet. */
export const currentOrder = (state: SortState): string[] => [
  ...state.placed,
  ...(state.current ? [state.current] : []),
  ...state.queue,
]
