import { useState } from 'react'

export interface SlopeRow {
  trackIndex: number
  /** Position per person, in the order they were given. Null if unranked. */
  positions: (number | null)[]
  /** Widest gap in position between any two people. */
  spread: number
}

/**
 * A slopegraph of everybody's ranking, one column per person.
 *
 * Each track is a line drawn between the places it was given. Lines that stay
 * level are tracks you agree about; lines that dive across the chart are the
 * arguments. Crossings are the point of the whole picture, so quiet lines are
 * dimmed and contested ones burn hotter and sit on top.
 */
export function SlopeChart({
  names,
  rows,
  titleOf,
}: {
  names: string[]
  rows: SlopeRow[]
  titleOf: (trackIndex: number) => string
}) {
  const [hover, setHover] = useState<number | null>(null)

  const people = names.length
  let depth = 1
  for (const row of rows) {
    for (const at of row.positions) if (at !== null) depth = Math.max(depth, at + 1)
  }

  // Long albums get tighter rows so the chart stays one screenful-ish.
  const rowHeight = depth > 26 ? 20 : depth > 18 ? 23 : 27
  const height = depth * rowHeight
  const xOf = (index: number) => (people === 1 ? 50 : (index / (people - 1)) * 100)
  const yOf = (position: number) => (position + 0.5) * rowHeight

  // How far a track must move before it reads as a real disagreement. Six
  // places is a chasm on a 12-track record and a shrug on a 40-track one, so
  // the scale follows the album rather than a fixed number of places.
  const scale = Math.max(3, depth / 2)
  const heatOf = (spread: number) => Math.min(1, spread / scale)

  // Green straight to red passes through khaki, which looks like a mistake
  // rather than a middle. Going by way of amber makes every stage of the ramp
  // read as a temperature.
  const inkOf = (heat: number) =>
    heat < 0.5
      ? `color-mix(in oklab, var(--accent), var(--slope-warm) ${heat * 200}%)`
      : `color-mix(in oklab, var(--slope-warm), var(--slope-hot) ${(heat - 0.5) * 200}%)`

  // Which track each person put in each place. Pre-filled rather than grown by
  // index, so a ranking with a gap in it leaves a blank row instead of a hole
  // that would silently shunt every label below it up a place.
  const orderOf = (person: number) => {
    const seen = rows.filter((row) => row.positions[person] !== null)
    const byPosition: number[] = new Array(seen.length).fill(-1)
    for (const row of seen) {
      const at = row.positions[person]!
      if (at < byPosition.length) byPosition[at] = row.trackIndex
    }
    return byPosition
  }

  // Quiet lines first so the contested ones are never buried under them.
  const painted = [...rows].sort((a, b) => a.spread - b.spread)

  return (
    <figure
      className={`slope${hover === null ? '' : ' is-hovering'}`}
      style={{ '--slope-row': `${rowHeight}px` } as React.CSSProperties}
      onMouseLeave={() => setHover(null)}
    >
      <div className="slope-grid">
        <Labels
          order={orderOf(0)}
          titleOf={titleOf}
          hover={hover}
          onHover={setHover}
          side="left"
        />

        <div className="slope-plot">
          <div className="slope-heads">
            {names.map((name, index) => (
              <span
                key={name}
                className="slope-head"
                style={{ left: `${xOf(index)}%` }}
                data-edge={index === 0 ? 'start' : index === people - 1 ? 'end' : 'mid'}
              >
                {name}
              </span>
            ))}
          </div>

          <div className="slope-canvas" style={{ height: `${height}px` }}>
            <svg
              className="slope-svg"
              viewBox={`0 0 100 ${height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {painted.map((row) => {
                const heat = heatOf(row.spread)
                const on = hover === row.trackIndex
                const points = row.positions
                  .map((at, index) => (at === null ? null : { index, at }))
                  .filter((point): point is { index: number; at: number } => point !== null)
                return (
                  <g
                    key={row.trackIndex}
                    className={`slope-line${on ? ' is-on' : ''}`}
                    style={{ '--heat': heat, '--slope-ink': inkOf(heat) } as React.CSSProperties}
                    onMouseEnter={() => setHover(row.trackIndex)}
                  >
                    {points.slice(1).map((point, i) => {
                      const from = points[i]!
                      return (
                        <line
                          key={point.index}
                          x1={xOf(from.index)}
                          y1={yOf(from.at)}
                          x2={xOf(point.index)}
                          y2={yOf(point.at)}
                          vectorEffect="non-scaling-stroke"
                          // A dash means somebody in between left it out.
                          strokeDasharray={point.index - from.index > 1 ? '3 4' : undefined}
                        />
                      )
                    })}
                  </g>
                )
              })}
            </svg>

            {painted.map((row) =>
              row.positions.map((at, index) =>
                at === null ? null : (
                  <span
                    key={`${row.trackIndex}:${index}`}
                    className={`slope-dot${hover === row.trackIndex ? ' is-on' : ''}`}
                    style={
                      {
                        left: `${xOf(index)}%`,
                        top: `${yOf(at)}px`,
                        '--heat': heatOf(row.spread),
                        '--slope-ink': inkOf(heatOf(row.spread)),
                      } as React.CSSProperties
                    }
                    onMouseEnter={() => setHover(row.trackIndex)}
                    title={`${titleOf(row.trackIndex)} — ${names[index]} #${at + 1}`}
                  />
                ),
              ),
            )}
          </div>
        </div>

        {people > 1 && (
          <Labels
            order={orderOf(people - 1)}
            titleOf={titleOf}
            hover={hover}
            onHover={setHover}
            side="right"
          />
        )}
      </div>

      <figcaption className="slope-key faint">
        <span className="slope-key-swatch" data-heat="cool" /> agreed
        <span className="slope-key-swatch" data-heat="hot" /> argued about
      </figcaption>
    </figure>
  )
}

function Labels({
  order,
  titleOf,
  hover,
  onHover,
  side,
}: {
  order: number[]
  titleOf: (trackIndex: number) => string
  hover: number | null
  onHover: (trackIndex: number | null) => void
  side: 'left' | 'right'
}) {
  return (
    <ol className={`slope-labels is-${side}`}>
      {order.map((trackIndex, rank) => (
        <li
          key={trackIndex === -1 ? `blank-${rank}` : trackIndex}
          className={`slope-label${hover === trackIndex ? ' is-on' : ''}`}
          onMouseEnter={() => onHover(trackIndex === -1 ? null : trackIndex)}
        >
          <span className="slope-label-rank tabular faint">{rank + 1}</span>
          <span className="slope-label-title">
            {trackIndex === -1 ? '' : titleOf(trackIndex)}
          </span>
        </li>
      ))}
    </ol>
  )
}
