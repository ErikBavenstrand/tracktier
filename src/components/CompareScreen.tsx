import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAlbum } from '../hooks/useAlbum'
import { loadLibrary } from '../lib/storage'
import { absoluteUrl, hrefCompare, navigate } from '../lib/routes'
import { compareRankings } from '../lib/compare'
import { decodeRanking, ShareCodeError, type Ranking } from '../lib/sharecode'
import { DEFAULT_TIERS, proportionalCuts, tierOfRankFromCuts } from '../lib/tiers'
import { RankingSkeleton } from './Skeletons'
import { Art, CopyButton, EmptyState, Icon } from './ui'

interface Entry {
  code: string
  ranking: Ranking
}

/**
 * Merge several people's rankings of one album into a consensus.
 *
 * This is the whole multiplayer story: everyone's opinion arrives as a link, so
 * a group ranking needs no accounts, no lobby and no server — just the codes
 * concatenated in a URL of its own.
 */
export function CompareScreen({
  codes,
  onCover,
}: {
  codes: string[]
  onCover: (cover: string | null) => void
}) {
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const entries = useMemo(() => {
    const out: Entry[] = []
    for (const code of codes) {
      try {
        out.push({ code, ranking: decodeRanking(code) })
      } catch {
        // A single bad code should not blank the whole comparison.
      }
    }
    return out
  }, [codes])

  const first = entries[0]?.ranking ?? null
  const { album, loading } = useAlbum(first?.provider ?? null, first?.albumId ?? null)

  // The consensus belongs to the album too, so it wears the same colour.
  useEffect(() => {
    if (album) onCover(album.cover)
  }, [album, onCover])

  const add = useCallback(
    (raw: string) => {
      const value = raw.trim()
      if (!value) return
      const code = value.includes('#/r/') ? (value.split('#/r/')[1] ?? '') : value
      try {
        const ranking = decodeRanking(code)
        if (first && (ranking.provider !== first.provider || ranking.albumId !== first.albumId)) {
          setError('That ranking is for a different album.')
          return
        }
        if (codes.includes(code)) {
          setError('That ranking is already in the comparison.')
          return
        }
        setError(null)
        setInput('')
        navigate(hrefCompare([...codes, code]))
      } catch (caught) {
        setError(caught instanceof ShareCodeError ? caught.message : 'That code could not be read')
      }
    },
    [codes, first],
  )

  // Offer the current browser's own rankings as one-click additions.
  const suggestions = useMemo(() => {
    const library = loadLibrary()
    return library
      .filter((entry) => entry.code && !codes.includes(entry.code))
      .filter((entry) => !first || (entry.provider === first.provider && entry.albumId === first.albumId))
      .slice(0, 4)
  }, [codes, first])

  const analysis = useMemo(() => {
    if (entries.length === 0) return null
    return compareRankings(
      entries.map((entry, index) => ({
        label: entry.ranking.label || `Listener ${index + 1}`,
        order: entry.ranking.order,
      })),
    )
  }, [entries])

  if (entries.length === 0) {
    return (
      <div className="compare fade-in">
        <h1 className="display">Compare rankings</h1>
        <p className="lede">
          Paste the links your friends sent you. Every ranking travels inside its own URL, so a
          group verdict needs nothing but the links themselves.
        </p>
        <CodeInput value={input} onChange={setInput} onSubmit={add} error={error} />
        {suggestions.length > 0 && (
          <div className="compare-suggestions">
            <span className="section-title">Start from yours</span>
            <div className="row wrap">
              {suggestions.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => add(entry.code)}
                >
                  {entry.albumTitle}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (loading) return <RankingSkeleton />
  if (!album || !analysis) {
    return (
      <EmptyState icon="close" title="Could not load that album">
        The album behind these rankings is missing from the catalogue.
      </EmptyState>
    )
  }

  const names = entries.map((entry, index) => entry.ranking.label || `Listener ${index + 1}`)
  const tierOfRank = tierOfRankFromCuts(analysis.rows.length, proportionalCuts(analysis.rows.length))
  const titleOf = (index: number) => album.tracks[index]?.title ?? 'Unknown track'
  const agreementPct =
    analysis.agreement === null ? null : Math.round(((analysis.agreement + 1) / 2) * 100)

  return (
    <div className="compare fade-in">
      <div className="result-hero">
        <Art src={album.cover} alt={`${album.title} cover`} className="result-art" />
        <div className="result-hero-text">
          <span className="section-title">Compared</span>
          <h1 className="display">{album.title}</h1>
          <p className="muted">{album.artist}</p>
          <p className="row wrap compare-voters">
            {names.map((name) => (
              <span key={name} className="pill">
                <Icon name="users" size={13} />
                {name}
              </span>
            ))}
          </p>
        </div>
      </div>

      {agreementPct !== null && (
        <section className="agreement card">
          <div className="agreement-dial" style={{ '--pct': `${agreementPct}%` } as React.CSSProperties}>
            <strong className="tabular">{agreementPct}%</strong>
            <span className="faint">aligned</span>
          </div>
          <div className="agreement-text">
            <h2>
              {names[0]} and {names[1]}{' '}
              {agreementPct >= 80
                ? 'want the same record'
                : agreementPct >= 60
                  ? 'mostly agree'
                  : agreementPct >= 40
                    ? 'are hearing different albums'
                    : 'could not disagree more'}
            </h2>
            <p className="muted">
              Of every possible pair of tracks, that is how often you both put them the same way
              round — Kendall&apos;s tau, rescaled so 50% means no relationship at all.
            </p>
          </div>
        </section>
      )}

      <div className="compare-columns">
        {analysis.unanimous.length > 0 && (
          <section className="compare-panel card">
            <h2 className="section-title">Agreed on</h2>
            <ul>
              {analysis.unanimous.slice(0, 6).map((row) => (
                <li key={row.trackIndex}>
                  <span className="compare-pos tabular faint">
                    #{Math.round(row.mean) + 1}
                  </span>
                  <span>{titleOf(row.trackIndex)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {analysis.contested.length > 0 && (
          <section className="compare-panel card">
            <h2 className="section-title">Argued about</h2>
            <ul>
              {analysis.contested.slice(0, 6).map((row) => (
                <li key={row.trackIndex}>
                  <span className="compare-gap tabular">{row.spread}</span>
                  <span>
                    {titleOf(row.trackIndex)}
                    <span className="faint compare-detail">
                      {row.positions
                        .map((pos, i) => `${names[i]} #${pos === null ? '—' : pos + 1}`)
                        .join(' · ')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <h2 className="section-title compare-list-head">Together</h2>
      <ol className="consensus">
        {analysis.rows.map((row, rank) => {
          const tier = DEFAULT_TIERS[tierOfRank[rank] ?? 0] ?? DEFAULT_TIERS[0]!
          return (
            <li key={row.trackIndex} className="consensus-row">
              <span
                className="consensus-tier"
                style={{ '--tier-hue': tier.hue } as React.CSSProperties}
              >
                {tier.label}
              </span>
              <span className="consensus-rank tabular faint">{rank + 1}</span>
              <span className="consensus-title">{titleOf(row.trackIndex)}</span>
              <span className="consensus-positions faint tabular">
                {row.positions.map((pos, i) => (
                  <span key={names[i]} title={names[i]}>
                    {pos === null ? '—' : pos + 1}
                  </span>
                ))}
              </span>
            </li>
          )
        })}
      </ol>

      <section className="share card">
        <div className="share-head">
          <h2>
            <Icon name="users" size={17} /> Add another ranking
          </h2>
          <p className="muted">Paste a friend&apos;s link to fold their verdict in.</p>
        </div>
        <CodeInput value={input} onChange={setInput} onSubmit={add} error={error} />
        <div className="share-field">
          <input
            type="text"
            readOnly
            value={absoluteUrl(hrefCompare(codes))}
            onFocus={(event) => event.target.select()}
            aria-label="Link to this comparison"
          />
          <CopyButton value={absoluteUrl(hrefCompare(codes))} className="btn btn-primary btn-sm">
            Copy
          </CopyButton>
        </div>
      </section>
    </div>
  )
}

function CodeInput({
  value,
  onChange,
  onSubmit,
  error,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  error: string | null
}) {
  // Pasting a link should just work, without hunting for a button. Each value is
  // only auto-submitted once, or a rejected link would retry on every render.
  const attempted = useRef<string | null>(null)
  useEffect(() => {
    if (!value.includes('#/r/') || attempted.current === value) return
    attempted.current = value
    onSubmit(value)
  }, [onSubmit, value])

  return (
    <form
      className="code-input"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(value)
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Paste a ranking link"
        aria-label="Ranking link or code"
        aria-invalid={Boolean(error)}
      />
      <button type="submit" className="btn btn-primary btn-sm">
        <Icon name="arrowRight" size={15} />
        Add
      </button>
      {error && <p className="code-input-error">{error}</p>}
    </form>
  )
}
