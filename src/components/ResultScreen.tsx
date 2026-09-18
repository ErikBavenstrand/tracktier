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

/** How this ranking stands in relation to the library. */
export interface Keeping {
  state: 'saved' | 'yours' | 'imported'
  name: string
  onName: (name: string) => void
  onKeep: () => void
  onForget: () => void
  /** The name the sender signed it with, if any. */
  senderName: string | null
  /**
   * Who the ranking belongs to. It has to reach the share code, or the link in
   * the copy box is a different link from the one in the address bar — and the
   * app then greets its own unsigned code as a stranger's.
   */
  author?: number
  /** Likewise — a code that omits it is a different code. */
  stamp?: number
}

interface Props {
  album: Album
  order: string[]
  cuts: number[]
  accent: string
  status?: ResultStatus
  keeping: Keeping
  /** Everyone whose ranking of this album is kept in this browser. */
  others?: { label: string; mine: boolean; code: string }[]
  onCompare?: () => void
  onRerank?: () => void
  onBack: () => void
}

export function ResultScreen({
  album,
  order,
  cuts,
  accent,
  status,
  keeping,
  others = [],
  onCompare,
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
        {
          provider: album.provider,
          albumId: album.id,
          order: orderToIndices(order, album),
          trackCount: album.tracks.length,
          cuts,
          label: keeping.name.trim() || undefined,
          author: keeping.author,
          stamp: keeping.stamp,
        },
        album.title,
      )
    } catch {
      return null
    }
  }, [album, cuts, keeping.author, keeping.name, keeping.stamp, order])

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
        label: keeping.name.trim() || undefined,
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

          {keeping.state === 'yours' && status?.kind !== 'partial' && (
            <p className="pill pill-warn">
              Not kept yet — name it below to keep it and get a link
            </p>
          )}
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

      {others.length > 1 && onCompare && (
        <button type="button" className="roster-bar card" onClick={onCompare}>
          <span className="roster-names">
            <Icon name="users" size={16} />
            {others.map((entry) => entry.label).join(' · ')}
          </span>
          <span className="roster-cta">
            Compare {others.length} rankings
            <Icon name="arrowRight" size={15} />
          </span>
        </button>
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


      {keeping.state === 'saved' && (
        <p className="saved-line">
          <span className="pill pill-accent">
            <Icon name="check" size={13} /> Saved as {keeping.name}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={keeping.onForget}>
            <Icon name="trash" size={14} />
            Remove
          </button>
        </p>
      )}

      {status?.kind === 'refined' && (
        <p className="pill pill-accent result-done">
          <Icon name="check" size={14} />
          Sorted and checked in {status.comparisons} questions
        </p>
      )}

      {keeping.state !== 'saved' && status?.kind !== 'partial' ? (
        <section className="keep card">
          <div className="share-head">
            <h2>
              <Icon name={keeping.state === 'imported' ? 'link' : 'users'} size={17} />
              {keeping.state === 'imported' ? 'A ranking from a link' : 'Name it, then share it'}
            </h2>
            <p className="muted">
              {keeping.state === 'imported'
                ? keeping.senderName
                  ? `${keeping.senderName} shared this. Keep it here and you can compare it against your own ranking later, without the link.`
                  : 'Whoever sent this did not sign it. Name them, and you can keep it here and compare it against your own ranking later.'
                : 'Your link carries this name, so whoever opens it knows whose ranking it is. It is also how the ranking is kept in this browser.'}
            </p>
          </div>
          <form
            className="keep-form"
            onSubmit={(event) => {
              event.preventDefault()
              keeping.onKeep()
            }}
          >
            <input
              type="text"
              value={keeping.name}
              placeholder={keeping.state === 'imported' ? 'Whose ranking is this?' : 'Your name'}
              maxLength={24}
              autoComplete="name"
              aria-label="Name for this ranking"
              onChange={(event) => keeping.onName(event.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!keeping.name.trim()}>
              <Icon name="check" size={15} />
              {keeping.state === 'imported' ? 'Import' : 'Save and get the link'}
            </button>
          </form>
        </section>
      ) : null}

      {keeping.state === 'imported' && status?.kind !== 'partial' ? (
        /* Before this, the only thing a stranger on somebody's link could do was
           type a name into a box — every other action lived in a branch that
           could not be reached until after importing, which is a decision they
           have no basis to make yet. */
        <section className="share card">
          <div className="share-head">
            <h2>
              <Icon name="swap" size={17} /> Your turn
            </h2>
            <p className="muted">
              Answer the same head-to-heads yourself, then put the two side by side and see,
              track by track, where you and {keeping.senderName ?? 'whoever sent this'} split.
            </p>
          </div>
          <div className="share-actions">
            {onRerank && (
              <button type="button" className="btn btn-primary btn-sm" onClick={onRerank}>
                <Icon name="swap" size={15} />
                Rank this album yourself
              </button>
            )}
            <CopyButton value={shareUrl} className="btn btn-ghost btn-sm">
              Copy this link
            </CopyButton>
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
      ) : status?.kind === 'partial' ? (
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
      ) : keeping.state === 'saved' ? (
      /* Only once it is named: an unnamed link hands somebody a tier list with
         nobody's name on it, which is the whole reason naming gates sharing. */
      <section className="share card">
        <div className="share-head">
          <h2>
            <Icon name="link" size={17} /> Share this ranking
          </h2>
          <p className="muted">
            The ranking is not stored anywhere. It is encoded into the{' '}
            <code>#</code> part of this link, all {shareCode?.length ?? 0} characters of it — and
            browsers never send that part to a server, so this site never sees your tier list.
            Anyone with the link can open it; nobody else can.
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
      ) : null}
    </div>
  )
}

/** Share codes carry album positions, not provider track ids. */
function orderToIndices(order: string[], album: Album): number[] {
  const indexOf = new Map(album.tracks.map((track, index) => [track.id, index]))
  return order.map((id) => indexOf.get(id) ?? 0)
}
