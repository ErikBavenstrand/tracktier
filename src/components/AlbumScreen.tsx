import { useMemo } from 'react'
import { player } from '../lib/audio'
import type { Album } from '../lib/providers/types'
import { spotifySearchUrl } from '../lib/providers/spotify'
import { hrefRank, navigate } from '../lib/routes'
import { estimateTotal, theoreticalMinimum } from '../lib/sorter'
import { sessionFor } from '../lib/storage'
import { usePlayer } from '../hooks/usePlayer'
import { Art, Icon, formatDuration } from './ui'

export function AlbumScreen({ album, onBack }: { album: Album; onBack: () => void }) {
  const playerState = usePlayer()
  const playable = useMemo(() => album.tracks.filter((t) => t.previewUrl).length, [album.tracks])

  // An unfinished session for this album is picked up rather than discarded.
  const openSession = useMemo(
    () => sessionFor(album.provider, album.id),
    [album.provider, album.id],
  )
  const duelsSoFar = openSession?.comparisons ?? 0

  // Binary insertion's cost is known before a single question is asked.
  const expectedDuels = estimateTotal(album.tracks.length)
  const floor = theoreticalMinimum(album.tracks.length)

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
            >
              <Icon name="trophy" size={17} />
              {duelsSoFar > 0 ? 'Continue ranking' : 'Start ranking'}
            </button>
            <a
              className="btn btn-spotify"
              href={spotifySearchUrl(album.artist, album.title)}
              target="_blank"
              rel="noreferrer noopener"
            >
              Open in Spotify
            </a>
          </div>

          <p className="faint album-hero-note">
            {duelsSoFar > 0
              ? `${duelsSoFar} question${duelsSoFar === 1 ? '' : 's'} in — picking up where you left off.`
              : `About ${expectedDuels} questions — near the ${floor} that ranking ${album.tracks.length} tracks needs at minimum.`}
            {playable < album.tracks.length && (
              <> {album.tracks.length - playable} of these tracks have no preview clip.</>
            )}
          </p>
        </div>
      </div>

      <ol className="tracklist">
        {album.tracks.map((track) => {
          const isCurrent = playerState.trackId === track.id
          const playing = isCurrent && playerState.playing
          return (
            <li key={track.id} className={`tracklist-row ${playing ? 'is-playing' : ''}`}>
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

              <span className="col truncate">
                <span className="truncate">{track.title}</span>
                {track.artist && <span className="faint truncate">{track.artist}</span>}
              </span>

              {track.explicit && <span className="explicit" title="Explicit">E</span>}
              <span className="faint tabular">{formatDuration(track.durationMs)}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
