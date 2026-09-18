/**
 * Loading skeletons.
 *
 * Each one mirrors the layout it stands in for, so nothing jumps when the real
 * content arrives — the point is to hold the shape, not to decorate the wait.
 * A spinner would say "something is happening"; these say what is about to be
 * there and where it will sit.
 */

const Bar = ({ w, h = 13 }: { w: string | number; h?: number }) => (
  <span className="sk sk-bar" style={{ width: typeof w === 'number' ? `${w}px` : w, height: h }} />
)

/** Deterministic width jitter, so rows look like text instead of a grid. */
const widths = ['82%', '64%', '73%', '55%', '88%', '60%', '77%', '68%']

export function AlbumGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="album-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="album-card is-skeleton">
          <span className="sk sk-art" />
          <div className="album-card-text">
            <Bar w={widths[i % widths.length]!} />
            <Bar w={i % 3 === 0 ? '45%' : '58%'} h={11} />
            <Bar w="38%" h={10} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function AlbumScreenSkeleton() {
  return (
    <div className="fade-in" aria-hidden="true">
      <div className="album-hero">
        <span className="sk sk-art album-hero-art" />
        <div className="album-hero-text">
          <Bar w={68} h={11} />
          <Bar w="min(420px, 70vw)" h={44} />
          <Bar w={190} h={15} />
          <div className="row wrap album-hero-actions">
            <span className="sk sk-pill" style={{ width: 168, height: 46 }} />
            <span className="sk sk-pill" style={{ width: 138, height: 42 }} />
          </div>
        </div>
      </div>

      <ol className="tracklist">
        {Array.from({ length: 10 }, (_, i) => (
          <li key={i} className="tracklist-row">
            <Bar w={22} h={13} />
            <Bar w={widths[i % widths.length]!} />
          </li>
        ))}
      </ol>
    </div>
  )
}

export function RankingSkeleton() {
  return (
    <div className="fade-in" aria-hidden="true">
      <div className="result-hero">
        <span className="sk sk-art result-art" />
        <div className="result-hero-text">
          <Bar w={72} h={11} />
          <Bar w="min(460px, 72vw)" h={44} />
          <Bar w={210} h={15} />
        </div>
      </div>

      <div className="tiers">
        {[2, 4, 3, 5, 1].map((chips, tier) => (
          <div key={tier} className="tier-row">
            <span className="sk sk-badge" />
            <div className="tier-items">
              {Array.from({ length: chips }, (_, i) => (
                <span
                  key={i}
                  className="sk sk-chip"
                  style={{ width: 96 + ((i * 37) % 84) }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DuelSkeleton() {
  return (
    <div className="duel fade-in" aria-hidden="true">
      <div className="duel-progress">
        <div className="duel-progress-bar" />
      </div>
      <div className="duel-layout">
        <div className="duel-main">
          <div className="duel-grid">
            <div className="duel-card is-skeleton">
              <Bar w={26} h={10} />
              <Bar w="70%" h={30} />
              <span className="sk sk-pill" style={{ height: 44 }} />
            </div>
            <div className="duel-versus">
              <span className="duel-versus-line" />
              <span className="duel-versus-badge">VS</span>
              <span className="duel-versus-line" />
            </div>
            <div className="duel-card is-skeleton">
              <Bar w={26} h={10} />
              <Bar w="62%" h={30} />
              <span className="sk sk-pill" style={{ height: 44 }} />
            </div>
          </div>
        </div>
        <aside className="standings">
          <div className="standings-head">
            <Bar w={78} h={11} />
          </div>
          <ol className="standings-list">
            {Array.from({ length: 9 }, (_, i) => (
              <li key={i} className="standing">
                <span />
                <Bar w={12} h={10} />
                <Bar w={widths[i % widths.length]!} h={11} />
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  )
}
