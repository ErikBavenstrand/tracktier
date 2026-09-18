import { DEFAULT_TIERS } from '../lib/tiers'

export interface GapRow {
  trackIndex: number
  /** Position per person, in the order they were given. Null if unranked. */
  positions: (number | null)[]
  /** Widest gap in position between any two people. */
  spread: number
}

/**
 * People need colours that survive any album. The accent is pulled from the
 * cover, so on a red sleeve every warm scale collapses into one shade — these
 * are fixed, spaced around the wheel, and used only inside the chart.
 */
/**
 * Hues are generated rather than listed so the sixth person to join does not
 * get the first person's colour — and on the second lap around the wheel they
 * come back lighter, so a wrap is still tellable apart at nine pixels.
 */
const inkOf = (person: number, people: number) => {
  const spread = Math.max(5, people)
  const hue = (162 + person * (360 / spread)) % 360
  const lap = Math.floor(person / spread)
  return `hsl(${hue} 68% ${60 + lap * 14}%)`
}

/**
 * Shortest initials that tell everybody apart. Colour alone means looking back
 * up at the legend on every row, which is most of what made the placings hard
 * to read; a letter in the dot answers "who rates this higher" on the spot.
 */
function initialsFor(names: string[]): string[] {
  const first = names.map((name) => (name.trim()[0] ?? '?').toUpperCase())
  const shared = new Set(first.filter((letter, i) => first.indexOf(letter) !== i))
  return first.map((letter, i) =>
    shared.has(letter) ? names[i]!.trim().slice(0, 2).toUpperCase() : letter,
  )
}

/**
 * Every track on one row, with each person's placing marked along a shared
 * #1-to-last axis and a bar joining them.
 *
 * The obvious chart here is a slopegraph, one line per track between two
 * columns. It is unreadable the moment people actually disagree: twenty lines
 * crossing in one box, and no way to follow any of them. Giving each track its
 * own row means nothing ever overlaps, the bar's length *is* the size of the
 * argument, and the rows stay sorted into the group's ranking — so this doubles
 * as the consensus list rather than sitting next to one.
 */
export function GapChart({
  names,
  rows,
  titleOf,
  tierOfRank,
}: {
  names: string[]
  rows: GapRow[]
  titleOf: (trackIndex: number) => string
  tierOfRank: number[]
}) {
  let depth = 1
  for (const row of rows) {
    for (const at of row.positions) if (at !== null) depth = Math.max(depth, at + 1)
  }
  const pct = (position: number) => (depth > 1 ? (position / (depth - 1)) * 100 : 50)
  const initials = initialsFor(names)

  // A gap of six places is a chasm on a twelve-track record and a shrug on a
  // forty-track one, so how loudly the badge shouts is scaled to the album.
  const heatOf = (spread: number) => Math.min(1, spread / Math.max(3, depth / 2))

  return (
    <div className="gapchart">
      {/* The axis rides with the names rather than sitting under twenty rows,
          where it would be off-screen by the time anyone needed it. */}
      <div className="gapchart-head">
        <div className="gapchart-legend">
          {names.map((name, person) => (
            <span key={name} className="gapchart-who">
              <span className="gapchart-swatch" style={{ background: inkOf(person, names.length) }}>
                {initials[person]}
              </span>
              {name}
            </span>
          ))}
        </div>
        <span className="gapchart-axis-plot faint">
          <span>#1</span>
          <span>best to worst</span>
          <span>#{depth}</span>
        </span>
        <span className="gapchart-axis-gap faint">gap</span>
      </div>

      <ol className="gapchart-rows">
        {rows.map((row, rank) => {
          const tier = DEFAULT_TIERS[tierOfRank[rank] ?? 0] ?? DEFAULT_TIERS[0]!
          const placed = row.positions
            .map((at, person) => (at === null ? null : { person, at }))
            .filter((point): point is { person: number; at: number } => point !== null)
          const missing = names.filter((_, person) => row.positions[person] === null)
          const low = placed.reduce((min, p) => (p.at < min.at ? p : min), placed[0]!)
          const high = placed.reduce((max, p) => (p.at > max.at ? p : max), placed[0]!)
          const shared = new Map<number, number[]>()
          for (const point of placed) {
            shared.set(point.at, [...(shared.get(point.at) ?? []), point.person])
          }
          const title = titleOf(row.trackIndex)

          return (
            <li
              key={row.trackIndex}
              className="gapchart-row"
              title={`${title} — ${placed
                .map((point) => `${names[point.person]} #${point.at + 1}`)
                .join(' · ')}`}
            >
              <span
                className="gapchart-tier"
                style={{ '--tier-hue': tier.hue } as React.CSSProperties}
              >
                {tier.label}
              </span>
              <span className="gapchart-rank tabular faint">{rank + 1}</span>
              <span className="gapchart-name">
                <span className="gapchart-title">{title}</span>
                {missing.length > 0 && missing.length < names.length && (
                  <small className="faint">
                    {missing.join(' and ')} did not rank this
                  </small>
                )}
                {/* A phone gives each place about 6px of axis, too little to
                    letter and barely enough to separate two dots. The placings
                    are spelled out there instead; the legend maps the initials. */}
                <small className="gapchart-where faint">
                  {placed
                    .map((point) => `${initials[point.person]} #${point.at + 1}`)
                    .join(' · ')}
                </small>
              </span>

              <span className="gapchart-plot">
                <span className="gapchart-track">
                  {placed.length > 1 && (
                    <span
                      className="gapchart-bar"
                      style={{
                        left: `${pct(low.at)}%`,
                        width: `${pct(high.at) - pct(low.at)}%`,
                        background: `linear-gradient(90deg, ${inkOf(low.person, names.length)}, ${inkOf(high.person, names.length)})`,
                      }}
                    />
                  )}
                  {[...shared].map(([at, people]) => (
                    <span
                      key={at}
                      className="gapchart-dot"
                      style={{ left: `${pct(at)}%` }}
                      title={`${people.map((who) => names[who]).join(' and ')} — #${at + 1}`}
                    >
                      {/* People who landed on the same place share one dot, so
                          two markers never hide under each other. */}
                      {people.map((person) => (
                        <span
                          key={person}
                          className="gapchart-wedge"
                          style={{ background: inkOf(person, names.length) }}
                        >
                          {initials[person]}
                        </span>
                      ))}
                    </span>
                  ))}
                </span>
              </span>

              <span
                className={`gapchart-gap tabular${row.spread > 1 ? '' : ' is-quiet'}`}
                style={{ '--gap-heat': heatOf(row.spread) } as React.CSSProperties}
              >
                {placed.length > 1 ? row.spread : '—'}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
