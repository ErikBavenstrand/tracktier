import { useMemo } from 'react'
import { player } from '../lib/audio'
import { findInterludes, reasonLabel } from '../lib/interludes'
import type { Album } from '../lib/providers/types'
import { spotifySearchUrl } from '../lib/providers/spotify'
import { hrefRank, navigate } from '../lib/routes'
import { estimateTotal, theoreticalMinimum } from '../lib/sorter'
import { hrefRanking } from '../lib/routes'
import type { SavedRanking } from '../lib/storage'
import { usePlayer } from '../hooks/usePlayer'
import { Art, Icon, formatDuration } from './ui'

interface Props {
  album: Album
  skipped: Set<string>
  onToggle: (trackId: string) => void
  /** Editing the set mid-sort would invalidate the placements already made. */
  locked: boolean
  comparisonsSoFar: number
  /** Everyone whose ranking of this album is kept in this browser. */
  rankings: SavedRanking[]
  onCompare: () => void
  onBack: () => void
}

export function AlbumScreen({
  album,
  skipped,
  onToggle,
  locked,
  comparisonsSoFar,
  rankings,
  onCompare,
  onBack,
}: Props) {
  const playerState = usePlayer()

  const suggestions = useMemo(() => {
    const found = findInterludes(album.tracks)
    return new Map(found.map((item) => [item.id, item.reason]))
  }, [album.tracks])

  const ranking = album.tracks.filter((track) => !skipped.has(track.id))
  const expected = estimateTotal(ranking.length)
  const floor = theoreticalMinimum(ranking.length)
  const playable = ranking.filter((track) => track.previewUrl).length

  return (
    <div className="album fade-in">
      <header className="result-head">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <Icon name="back" size={15} />
          Search
        </button>
      </header>

      <div className="album-hero">
        <Art src={album.cover} alt={`${album.title} cover`} className="album-hero-art" />
        <div className="album-hero-text">
          <span className="section-title">Album</span>
          <h1 className="display">{album.title}</h1>
          <p className="muted">
            {album.artist}
            {album.year && <> · {album.year}</>} · {album.tracks.length} tracks
          </p>

          <div className="row wrap album-hero-actions">
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => navigate(hrefRank(album.provider, album.id))}
              disabled={ranking.length < 2}
            >
              <Icon name="trophy" size={17} />
              {comparisonsSoFar > 0 ? 'Continue ranking' : `Rank ${ranking.length} tracks`}
            </button>
            <a
              className="btn btn-spotify"
              href={spotifySearchUrl(album.artist, album.title)}
              target="_blank"
              rel="noreferrer noopener"
            >
              Play on Spotify
            </a>
          </div>

          <p className="faint album-hero-note">
            {comparisonsSoFar > 0
              ? `${comparisonsSoFar} question${comparisonsSoFar === 1 ? '' : 's'} in — picking up where you left off.`
              : ranking.length < 2
                ? 'Keep at least two tracks to rank them.'
                : `About ${expected} questions — near the ${floor} that ranking ${ranking.length} tracks needs at minimum.`}
            {playable < ranking.length && ranking.length >= 2 && (
              <> {ranking.length - playable} have no preview clip.</>
            )}
          </p>

          {suggestions.size > 0 && !locked && (
            <p className="faint album-hero-note">
              Interludes are left out by default — nothing in the data marks them, so it is a
              guess. Tap any track to put it back.
            </p>
          )}
          {locked && (
            <p className="faint album-hero-note">
              Start over on the ranking to change which tracks are included.
            </p>
          )}
        </div>
      </div>

      {rankings.length > 0 && (
        <section className="rankings">
          <div className="rankings-head">
            <h2 className="section-title">
              {rankings.length} ranking{rankings.length === 1 ? '' : 's'} of this album
            </h2>
            {rankings.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onCompare}>
                <Icon name="users" size={15} />
                Compare all
              </button>
            )}
          </div>
          <ul className="rankings-list">
            {rankings.map((entry) => (
              <li key={entry.label}>
                <a className="rankings-row" href={hrefRanking(entry.code)}>
                  <span className={`rankings-who ${entry.mine ? 'is-mine' : ''}`}>
                    {entry.label}
                  </span>
                  <span className="faint">{entry.mine ? 'ranked here' : 'from a link'}</span>
                  <Icon name="arrowRight" size={15} />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ol className="tracklist">
        {album.tracks.map((track) => {
          const isCurrent = playerState.trackId === track.id
          const playing = isCurrent && playerState.playing
          const out = skipped.has(track.id)
          const reason = suggestions.get(track.id)

          return (
            <li key={track.id} className={`tracklist-row ${playing ? 'is-playing' : ''} ${out ? 'is-out' : ''}`}>
              <button
                type="button"
                className="tracklist-play"
                disabled={!track.previewUrl}
                onClick={() => track.previewUrl && player.toggle(track.id, track.previewUrl)}
                aria-label={playing ? `Pause ${track.title}` : `Preview ${track.title}`}
              >
                <span className="tracklist-number tabular">
                  {String(track.trackNumber).padStart(2, '0')}
                </span>
                <span className="tracklist-icon">
                  <Icon name={playing ? 'pause' : 'play'} size={13} />
                </span>
              </button>

              <span className="col tracklist-title">
                <span>{track.title}</span>
                {track.artist && <span className="faint truncate">{track.artist}</span>}
              </span>

              {out && reason && <span className="tracklist-reason faint">{reasonLabel(reason)}</span>}
              {track.explicit && <span className="explicit" title="Explicit">E</span>}
              <span className="faint tabular">{formatDuration(track.durationMs)}</span>

              <button
                type="button"
                className={`tracklist-toggle ${out ? 'is-out' : ''}`}
                onClick={() => onToggle(track.id)}
                disabled={locked}
                aria-pressed={!out}
                title={locked ? 'Start over to change which tracks are included' : undefined}
                aria-label={out ? `Include ${track.title}` : `Leave out ${track.title}`}
              >
                <Icon name={out ? 'close' : 'check'} size={14} />
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
