import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Album } from '../lib/providers/types'
import { DEFAULT_TIERS, proportionalCuts, tierCountFor, tierOfRankFromCuts } from '../lib/tiers'
import { Icon } from './ui'

interface Props {
  album: Album
  /** Tracks whose order is settled. */
  placed: string[]
  /** Tracks not yet reached, shown greyed with no position. */
  pending: string[]
  /** The two tracks on screen, highlighted in the list. */
  duelling: [string, string] | null
  /** Bands are meaningless until a few tracks have been placed. */
  showTiers: boolean
}

/** How long a promotion or demotion stays flagged. */
const FLAG_MS = 1700

/**
 * The standings as they stand, updating after every verdict.
 *
 * Seeing a track climb is the point: it turns a long series of isolated
 * either/or questions into visible progress, and it makes a wrong answer
 * obvious immediately rather than at the end.
 */
export function LiveStandings({ album, placed, pending, duelling, showTiers }: Props) {
  const order = placed

  const tierOfRank = useMemo(() => {
    if (!showTiers || order.length === 0) return null
    // Bands are drawn over what is placed so far; as more tracks arrive the
    // proportions redistribute, which is the honest picture of a list forming.
    const tierCount = tierCountFor(order.length)
    return tierOfRankFromCuts(order.length, proportionalCuts(order.length, tierCount))
  }, [order, showTiers])

  const titleOf = useMemo(() => {
    const map = new Map(album.tracks.map((track) => [track.id, track.title]))
    return (id: string) => map.get(id) ?? 'Unknown track'
  }, [album.tracks])

  const nodes = useRef(new Map<string, HTMLLIElement>())
  const offsets = useRef(new Map<string, number>())
  const previousOrder = useRef<string[]>(order)
  const [moves, setMoves] = useState<Record<string, number>>({})

  /**
   * Flag a track that genuinely changed places.
   *
   * Inserting a track pushes everything below it down one, which is not a
   * verdict about those tracks and should not light them up. Only movement
   * relative to the newly placed list counts, so an insertion flags the
   * arriving track and a refining swap flags the pair that swapped.
   */
  useEffect(() => {
    const before = previousOrder.current
    previousOrder.current = order
    if (before === order) return

    const wasAt = new Map(before.map((id, index) => [id, index]))
    const arrived = order.filter((id) => !wasAt.has(id))
    const changed: Record<string, number> = {}

    if (arrived.length > 0) {
      // A new track landing somewhere: only it moved.
      for (const id of arrived) changed[id] = 0
    } else {
      const shift = order.length - before.length
      order.forEach((id, index) => {
        const previous = wasAt.get(id)
        if (previous !== undefined && previous !== index - shift) {
          changed[id] = previous - index
        }
      })
    }
    if (Object.keys(changed).length === 0) return

    setMoves(changed)
    const timer = window.setTimeout(() => setMoves({}), FLAG_MS)
    return () => window.clearTimeout(timer)
  }, [order])

  /**
   * FLIP: measure after paint, then animate each row in from where it was.
   *
   * Positions are read from `offsetTop`, never `getBoundingClientRect`. A rect
   * reflects any transform currently animating on the element, so measuring
   * mid-flight stored a moving position as the baseline — the next render then
   * computed a delta against it and animated again, and the list drifted on its
   * own long after the listener had stopped answering. `offsetTop` is layout
   * position and ignores transforms, so a render that changed nothing measures
   * as changing nothing.
   */
  useLayoutEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    for (const [id, node] of nodes.current) {
      const next = node.offsetTop
      const previous = offsets.current.get(id)
      offsets.current.set(id, next)
      if (previous === undefined || reduced) continue

      const shift = previous - next
      if (Math.abs(shift) < 1) continue

      // Replace any in-flight slide rather than stacking a second one on top.
      for (const animation of node.getAnimations()) animation.cancel()
      node.animate(
        [{ transform: `translateY(${shift}px)` }, { transform: 'translateY(0)' }],
        { duration: 460, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
      )
    }
  })

  // Screen readers get the outcome in words; the list itself is too chatty to
  // announce, since a single verdict shifts a dozen rows.
  const announcement = Object.entries(moves)
    .map(([id, delta]) => {
      const place = order.indexOf(id) + 1
      return `${titleOf(id)} ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} to ${place}`
    })
    .join(', ')

  return (
    <aside className="standings" aria-label="Live standings">
      <header className="standings-head">
        <h2 className="section-title">Standings</h2>
        {pending.length > 0 && (
          <span className="faint standings-hint tabular">{pending.length} to place</span>
        )}
      </header>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <ol className="standings-list">
        {order.map((id, rank) => {
          const tier = tierOfRank ? DEFAULT_TIERS[tierOfRank[rank] ?? 0] : null
          // Only the first row of a band carries its letter.
          const startsTier = Boolean(tier) && (rank === 0 || tierOfRank?.[rank - 1] !== tierOfRank?.[rank])
          const move = moves[id] ?? 0
          const inDuel = duelling?.includes(id)

          return (
            <li
              key={id}
              ref={(node) => {
                if (node) nodes.current.set(id, node)
                else nodes.current.delete(id)
              }}
              className={`standing ${inDuel ? 'is-duelling' : ''} ${
                move > 0 ? 'is-up' : move < 0 ? 'is-down' : ''
              } ${startsTier ? 'starts-tier' : ''}`}
            >
              <span
                className="standing-tier"
                style={tier ? ({ '--tier-hue': tier.hue } as React.CSSProperties) : undefined}
              >
                {startsTier && tier ? tier.label : ''}
              </span>
              <span className="standing-rank tabular faint">{rank + 1}</span>
              <span className="standing-title truncate">{titleOf(id)}</span>
              {id in moves && (
                move === 0 ? (
                  <span className="standing-move placed">placed</span>
                ) : (
                  <span className={`standing-move ${move > 0 ? 'up' : 'down'}`}>
                    <Icon name={move > 0 ? 'up' : 'down'} size={11} />
                    {Math.abs(move)}
                  </span>
                )
              )}
            </li>
          )
        })}
        {pending.map((id) => (
          <li key={id} className="standing is-pending">
            <span className="standing-tier" />
            <span className="standing-rank faint">·</span>
            <span className="standing-title truncate">{titleOf(id)}</span>
          </li>
        ))}
      </ol>
    </aside>
  )
}
