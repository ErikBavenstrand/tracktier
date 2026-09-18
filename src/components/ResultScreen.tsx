import { useCallback, useEffect, useMemo, useState } from 'react'
import { player } from '../lib/audio'
import { downloadBlob, renderTierImage } from '../lib/exportImage'
import type { Album } from '../lib/providers/types'
import { spotifySearchUrl } from '../lib/providers/spotify'
import { absoluteUrl, hrefRanking } from '../lib/routes'
import { encodeRanking } from '../lib/sharecode'
import { DEFAULT_TIERS, groupByTier, proportionalCuts, tierCountFor, tierOfRankFromCuts } from '../lib/tiers'
import { usePlayer } from '../hooks/usePlayer'
import { Art, CopyButton, Icon, formatDuration } from './ui'

/**
 * Where this browser's own ranking of the album has got to. `null` when the
 * page is showing somebody else's link, which has no local session behind it.
 */
export type ResultStatus =
  | {
      kind: 'partial'
      comparisons: number
      placed: number
      total: number
      onContinue: () => void
      onStartOver: () => void
    }
  | {
      kind: 'unrefined'
      comparisons: number
      toCheck: number
      onSharpen: () => void
      onStartOver: () => void
    }
  | { kind: 'refined'; comparisons: number; onStartOver: () => void }
  | null

interface Props {
  album: Album
  order: string[]
  cuts: number[]
  label: string
  accent: string
  readOnly?: boolean
  authorLabel?: string
  onLabelChange?: (label: string) => void
  status?: ResultStatus
  onRerank?: () => void
  onBack: () => void
}

export function ResultScreen({
  album,
  order,
  cuts,
  label,
  accent,
  readOnly = false,
  authorLabel,
  onLabelChange,
  status,
  onRerank,
  onBack,
}: Props) {
  const playerState = usePlayer()
  const [exporting, setExporting] = useState(false)

  // A half-finished sort has only placed a prefix of this list; the rest is
  // still in whatever order it was dealt, and must not be shown as a ranking.
  const partial = status?.kind === 'partial' ? status : null
  const rankedCount = partial ? Math.min(partial.placed, order.length) : order.length
  const rankedOrder = useMemo(() => order.slice(0, rankedCount), [order, rankedCount])
  const unplaced = useMemo(() => order.slice(rankedCount), [order, rankedCount])

  const effectiveCuts = useMemo(
    () => (partial ? proportionalCuts(rankedCount) : cuts),
    [cuts, partial, rankedCount],
  )
  const tierOfRank = useMemo(
    () => tierOfRankFromCuts(rankedCount, effectiveCuts),
    [effectiveCuts, rankedCount],
  )
  // Use the bands actually produced: a ranking with little separation gets
  // fewer than the full five, and empty rows would just look broken.
  const tierCount = Math.min(
    tierCountFor(rankedCount),
    Math.max(1, ...tierOfRank.map((tier) => tier + 1)),
  )
  const groups = useMemo(() => groupByTier(tierOfRank, tierCount), [tierCount, tierOfRank])

  const trackOf = useCallback(
    (id: string) => album.tracks.find((t) => t.id === id) ?? null,
    [album.tracks],
  )

  const shareCode = useMemo(() => {
    try {
      return encodeRanking(
        { provider: album.provider, albumId: album.id, order: orderToIndices(order, album), cuts, label: label || undefined },
        album.title,
      )
    } catch {
      return null
    }
  }, [album, cuts, label, order])

  const shareUrl = shareCode ? absoluteUrl(hrefRanking(shareCode)) : ''

  useEffect(() => () => player.stop(), [])

  const exportImage = async () => {
    setExporting(true)
    try {
      const blob = await renderTierImage({
        albumTitle: album.title,
        albumArtist: album.artist,
        albumCover: album.cover,
        tiers: groups.map((ranks) => ranks.map((rank) => trackOf(order[rank] ?? '')?.title ?? '')),
        label: label || authorLabel,
        accent,
        footer: 'Made with Tracktour',
      })
      if (blob) downloadBlob(blob, `${album.artist} - ${album.title} tier list.png`.replace(/[/\\:]/g, '-'))
    } finally {
      setExporting(false)
    }
  }

  const share = async () => {
    if (!shareUrl) return
    const text = `My ${album.title} tier list`
    if (navigator.share) {
      try {
        await navigator.share({ title: text, url: shareUrl })
        return
      } catch {
        // Cancelled or unsupported; the copy field is still right there.
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      /* the input below remains selectable */
    }
  }

  return (
    <div className="result fade-in">
      <header className="result-head">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <Icon name="back" size={15} />
          Back
        </button>
      </header>

      <div className="result-hero">
        <Art src={album.cover} alt={`${album.title} cover`} className="result-art" />
        <div className="result-hero-text">
          <span className="section-title">Tier list</span>
          <h1 className="display">{album.title}</h1>
          <p className="muted">
            {album.artist}
            {album.year && <> · {album.year}</>} · {album.tracks.length} tracks
          </p>

          {!readOnly && onLabelChange && (
            <label className="name-field">
              <span className="sr-only">Your name on this ranking</span>
              <Icon name="users" size={15} />
              <input
                type="text"
                value={label}
                placeholder="Sign it (optional)"
                maxLength={24}
                onChange={(event) => onLabelChange(event.target.value)}
              />
            </label>
          )}
          {readOnly && authorLabel && <p className="pill pill-accent">Ranked by {authorLabel}</p>}
        </div>
      </div>

      {status?.kind === 'partial' && (
        <div className="status-bar card">
          <div className="status-bar-text">
            <strong>
              Still ranking · {status.placed} of {status.total} placed
            </strong>
            <span className="muted">
              {status.comparisons} question{status.comparisons === 1 ? '' : 's'} in. The tracks
              below the line have not been ranked yet.
            </span>
          </div>
          <div className="row wrap">
            <button type="button" className="btn btn-primary btn-sm" onClick={status.onContinue}>
              <Icon name="arrowRight" size={15} />
              Continue
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={status.onStartOver}>
              <Icon name="undo" size={15} />
              Start over
            </button>
          </div>
        </div>
      )}

      {status?.kind === 'unrefined' && (
        <div className="status-bar card">
          <div className="status-bar-text">
            <strong>Ranked in {status.comparisons} questions</strong>
            <span className="muted">
              One slip early on can carry a track a few places off. Re-asking each neighbouring
              pair finds it.
            </span>
          </div>
          <div className="row wrap">
            <button type="button" className="btn btn-primary btn-sm" onClick={status.onSharpen}>
              <Icon name="sparkle" size={15} />
              Sharpen · {status.toCheck} questions
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={status.onStartOver}>
              <Icon name="undo" size={15} />
              Start over
            </button>
          </div>
        </div>
      )}

      <div className="tiers">
        {groups.map((ranks, tierIndex) => {
          const tier = DEFAULT_TIERS[tierIndex] ?? DEFAULT_TIERS[DEFAULT_TIERS.length - 1]!
          return (
            <div key={tier.key} className="tier-row">
              <div
                className="tier-badge"
                style={{ '--tier-hue': tier.hue } as React.CSSProperties}
              >
                {tier.label}
              </div>

              <div className="tier-items">
                {ranks.length === 0 && <span className="tier-empty faint">No tracks landed here</span>}
                {ranks.map((rank) => {
                  const trackId = rankedOrder[rank]
                  const track = trackId ? trackOf(trackId) : null
                  if (!track || !trackId) return null
                  const isCurrent = playerState.trackId === track.id
                  const playing = isCurrent && playerState.playing
                  return (
                    <button
                      key={trackId}
                      type="button"
                      className={`track-chip ${playing ? 'is-playing' : ''}`}
                      disabled={!track.previewUrl}
                      onClick={() => track.previewUrl && player.toggle(track.id, track.previewUrl)}
                      aria-label={playing ? `Pause ${track.title}` : `Preview ${track.title}`}
                    >
                      <span className="track-chip-play" aria-hidden="true">
                        <Icon name={playing ? 'pause' : 'play'} size={12} />
                      </span>
                      <span className="track-chip-rank tabular faint">{rank + 1}</span>
                      <span className="track-chip-title">{track.title}</span>
                      <span className="track-chip-time tabular faint">
                        {formatDuration(track.durationMs)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {unplaced.length > 0 && (
        <section className="unplaced">
          <h2 className="section-title">Not ranked yet</h2>
          <div className="unplaced-items">
            {unplaced.map((trackId) => {
              const track = trackOf(trackId)
              return track ? (
                <span key={trackId} className="track-chip is-unplaced">
                  <span className="track-chip-title">{track.title}</span>
                </span>
              ) : null
            })}
          </div>
        </section>
      )}


      {status?.kind === 'refined' && (
        <p className="pill pill-accent result-done">
          <Icon name="check" size={14} />
          Sorted and checked in {status.comparisons} questions
        </p>
      )}

      {status?.kind === 'partial' ? (
        <section className="share card">
          <div className="share-head">
            <h2>
              <Icon name="link" size={17} /> Sharing waits for the finish
            </h2>
            <p className="muted">
              {status.total - status.placed} track
              {status.total - status.placed === 1 ? ' has' : 's have'} no position yet, so a link
              now would hand someone a ranking that is partly the order the tracks happened to be
              dealt in.
            </p>
          </div>
          <div className="share-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={status.onContinue}>
              <Icon name="arrowRight" size={15} />
              Finish ranking
            </button>
          </div>
        </section>
      ) : (
      <section className="share card">
        <div className="share-head">
          <h2>
            <Icon name="link" size={17} /> Share this ranking
          </h2>
          <p className="muted">
            The whole tier list is packed into the link itself — {shareCode?.length ?? 0} characters,
            no account, nothing stored on a server.
          </p>
        </div>

        <div className="share-field">
          <input
            type="text"
            readOnly
            value={shareUrl}
            onFocus={(event) => event.target.select()}
            aria-label="Shareable link to this ranking"
          />
          <CopyButton value={shareUrl} className="btn btn-primary btn-sm">
            Copy link
          </CopyButton>
        </div>

        <div className="share-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={share}>
            <Icon name="share" size={15} />
            Share
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={exportImage}
            disabled={exporting}
          >
            <Icon name="image" size={15} />
            {exporting ? 'Rendering…' : 'Save as image'}
          </button>
          {onRerank && !status && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRerank}>
              <Icon name="swap" size={15} />
              Rank it yourself
            </button>
          )}
          <a
            className="btn btn-spotify btn-sm"
            href={spotifySearchUrl(album.artist, album.title)}
            target="_blank"
            rel="noreferrer noopener"
          >
            Play on Spotify
          </a>
        </div>
      </section>
      )}
    </div>
  )
}

/** Share codes carry album positions, not provider track ids. */
function orderToIndices(order: string[], album: Album): number[] {
  const indexOf = new Map(album.tracks.map((track, index) => [track.id, index]))
  return order.map((id) => indexOf.get(id) ?? 0)
}
