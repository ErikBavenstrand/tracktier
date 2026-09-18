import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Album } from '../lib/providers/types'
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
  undo as undoStep,
  type SortProgress,
  type SortState,
  type Verdict,
} from '../lib/sorter'
import { clearSession, saveSession, sessionFor } from '../lib/storage'

export interface RankingSession {
  state: SortState
  pair: { a: string; b: string } | null
  progress: SortProgress
  /** Best-known order: placed tracks first, then whatever is unreached. */
  order: string[]
  placed: string[]
  /** How many questions the whole album is expected to take. */
  expected: number
  /** The information-theoretic floor, for honest copy. */
  floor: number
  canUndo: boolean
  /** True once a full order exists, refined or not. */
  ordered: boolean
  /** True once the neighbour sweep has been offered and taken. */
  refined: boolean
  choose: (verdict: Verdict) => void
  undo: () => void
  reset: () => void
  refine: () => void
}

/** Undo depth kept in storage; deeper than anyone reaches, small enough to store. */
const HISTORY_LIMIT = 40

/**
 * @param trackIds Which of the album's tracks to rank. Leaving skits out
 * changes the set, so a stored session for a different set is discarded rather
 * than resumed into a sort that no longer matches.
 */
export function useRankingSession(album: Album | null, trackIds?: string[]): RankingSession {
  const ids = useMemo(
    () => trackIds ?? album?.tracks.map((track) => track.id) ?? [],
    [album, trackIds],
  )
  const albumRef = album ? `${album.provider}:${album.id}` : null
  const setRef = albumRef ? `${albumRef}#${ids.join(',')}` : null

  const [state, setState] = useState<SortState>(() => initSort([]))
  const restoredFor = useRef<string | null>(null)

  useEffect(() => {
    if (!album || ids.length === 0 || restoredFor.current === setRef) return
    restoredFor.current = setRef

    const stored = sessionFor(album.provider, album.id)
    const storedIds = stored?.sort
      ? [...stored.sort.placed, ...stored.sort.queue, stored.sort.current].filter(
          (id): id is string => Boolean(id),
        )
      : []
    const usable =
      stored?.sort &&
      // The saved sort has to cover exactly this set — no more, no fewer —
      // or its placements describe a different ranking than the one on screen.
      storedIds.length === ids.length &&
      storedIds.every((id) => ids.includes(id))

    setState(usable ? stored.sort! : initSort(ids, hash(albumRef ?? '')))
  }, [album, ids, setRef])

  const persist = useCallback(
    (next: SortState) => {
      if (!album) return
      saveSession({
        provider: album.provider,
        albumId: album.id,
        sort: { ...next, history: next.history.slice(-HISTORY_LIMIT) },
        comparisons: next.comparisons,
        updatedAt: Date.now(),
        // Carried so the home screen can list this without refetching.
        title: album.title,
        artist: album.artist,
        cover: album.cover,
      })
    },
    [album],
  )

  const choose = useCallback(
    (verdict: Verdict) => {
      setState((current) => {
        const next = answer(current, verdict)
        persist(next)
        return next
      })
    },
    [persist],
  )

  const undo = useCallback(() => {
    setState((current) => {
      const next = undoStep(current)
      persist(next)
      return next
    })
  }, [persist])

  const refine = useCallback(() => {
    setState((current) => {
      const next = startRefining(current)
      persist(next)
      return next
    })
  }, [persist])

  const reset = useCallback(() => {
    const fresh = initSort(ids, hash(albumRef ?? '') + 1)
    setState(fresh)
    if (album) clearSession(album.provider, album.id)
  }, [album, albumRef, ids])

  return {
    state,
    pair: currentPair(state),
    progress: progressOf(state),
    order: currentOrder(state),
    placed: state.placed,
    expected: estimateTotal(ids.length),
    floor: theoreticalMinimum(ids.length),
    canUndo: state.history.length > 0,
    ordered: isOrdered(state) || isComplete(state),
    refined: state.refined,
    choose,
    undo,
    reset,
    refine,
  }
}

/** Seeds the shuffle per album, so reopening deals the same running order. */
function hash(value: string): number {
  let out = 2166136261
  for (let i = 0; i < value.length; i++) {
    out ^= value.charCodeAt(i)
    out = Math.imul(out, 16777619) >>> 0
  }
  return out || 1
}
