import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAlbum } from '../hooks/useAlbum'
import { loadLibrary } from '../lib/storage'
import { absoluteUrl, hrefCompare, navigate } from '../lib/routes'
import { decodeRanking, ShareCodeError, type Ranking } from '../lib/sharecode'
import { DEFAULT_TIERS, naturalBreaks, tierCountFor, tierOfRankFromCuts } from '../lib/tiers'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
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

  useDocumentTitle(album ? `${album.title} consensus` : 'Compare rankings')

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

  const consensus = useMemo(() => {
    if (entries.length === 0) return null
    const trackCount = entries[0]!.ranking.order.length
    const positions = new Map<number, number[]>()

    for (const entry of entries) {
      if (entry.ranking.order.length !== trackCount) continue
      entry.ranking.order.forEach((trackIndex, rank) => {
        const list = positions.get(trackIndex) ?? []
        list.push(rank)
        positions.set(trackIndex, list)
      })
    }

    // Average rank is a Borda count: robust, and it reads as "where it landed".
    const rows = [...positions.entries()].map(([trackIndex, ranks]) => {
      const mean = ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length
      const spread =
        ranks.length > 1
          ? Math.sqrt(ranks.reduce((sum, rank) => sum + (rank - mean) ** 2, 0) / ranks.length)
          : 0
      return { trackIndex, mean, spread, ranks }
    })
    rows.sort((a, b) => a.mean - b.mean)

    const tierCount = tierCountFor(rows.length)
    // Natural breaks want higher-is-better, so invert the mean rank.
    const cuts = naturalBreaks(rows.map((row) => -row.mean), tierCount)
    return { rows, cuts, tierCount, trackCount }
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
  if (!album || !consensus) {
    return (
      <EmptyState icon="close" title="Could not load that album">
        The album behind these rankings is missing from the catalogue.
      </EmptyState>
    )
  }

  const tierOfRank = tierOfRankFromCuts(consensus.rows.length, consensus.cuts)
  const mostDivisive = [...consensus.rows].sort((a, b) => b.spread - a.spread)[0]
  const voters = entries.map((entry, index) => entry.ranking.label || `Listener ${index + 1}`)

  return (
    <div className="compare fade-in">
      <div className="result-hero">
        <Art src={album.cover} alt={`${album.title} cover`} className="result-art" />
        <div className="result-hero-text">
          <span className="section-title">Consensus</span>
          <h1 className="display">{album.title}</h1>
          <p className="muted">
            {album.artist} · {entries.length} ranking{entries.length === 1 ? '' : 's'} merged
          </p>
          <p className="row wrap compare-voters">
            {voters.map((name) => (
              <span key={name} className="pill">
                <Icon name="users" size={13} />
                {name}
              </span>
            ))}
          </p>
        </div>
      </div>

      {entries.length > 1 && mostDivisive && mostDivisive.spread > 0.9 && (
        <p className="compare-divisive card">
          <Icon name="swap" size={16} />
          <span>
            Biggest disagreement:{' '}
            <strong>{album.tracks[mostDivisive.trackIndex]?.title ?? 'a track'}</strong> — placed
            anywhere from #{Math.min(...mostDivisive.ranks) + 1} to #
            {Math.max(...mostDivisive.ranks) + 1}.
          </span>
        </p>
      )}

      <ol className="consensus">
        {consensus.rows.map((row, rank) => {
          const track = album.tracks[row.trackIndex]
          const tier = DEFAULT_TIERS[tierOfRank[rank] ?? 0] ?? DEFAULT_TIERS[0]!
          // A tight spread means everyone put it in much the same place.
          const agreement = entries.length > 1
            ? Math.max(0, 1 - row.spread / Math.max(1, consensus.rows.length / 3))
            : 1
          return (
            <li key={row.trackIndex} className="consensus-row">
              <span
                className="consensus-tier"
                style={{ '--tier-hue': tier.hue } as React.CSSProperties}
              >
                {tier.label}
              </span>
              <span className="consensus-rank tabular faint">{rank + 1}</span>
              <span className="truncate">{track?.title ?? 'Unknown track'}</span>
              <span className="consensus-agreement" title={`${Math.round(agreement * 100)}% agreement`}>
                <span style={{ width: `${Math.round(agreement * 100)}%` }} />
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
          <p className="muted">Paste a friend's link to fold their verdict into the consensus.</p>
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
