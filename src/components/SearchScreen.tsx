import { useCallback, useEffect, useRef, useState } from 'react'
import {
  activeSourceLabel,
  findAcrossProviders,
  isSingleSource,
  parseAlbumUrl,
  searchAlbums,
  type MergedResult,
} from '../lib/providers'
import { fetchOEmbed, parseSpotifyUrl } from '../lib/providers/spotify'
import { hrefAlbum, hrefRanking, navigate } from '../lib/routes'
import { loadLibrary, removeFromLibrary, type SavedRanking } from '../lib/storage'
import { AlbumGridSkeleton } from './Skeletons'
import { Art, EmptyState, Icon, Spinner } from './ui'

type Status =
  | { kind: 'idle' }
  | { kind: 'loading'; note?: string }
  | { kind: 'results'; results: MergedResult[]; note?: string }
  | { kind: 'error'; message: string }

export function SearchScreen() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [library, setLibrary] = useState<SavedRanking[]>(() => loadLibrary())
  const controller = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const run = useCallback(async (raw: string) => {
    const trimmed = raw.trim()
    controller.current?.abort()
    if (trimmed.length < 2) {
      setStatus({ kind: 'idle' })
      return
    }

    const next = new AbortController()
    controller.current = next

    // A pasted link from a catalogue we read directly skips searching entirely.
    const direct = parseAlbumUrl(trimmed)
    if (direct) {
      navigate(hrefAlbum(direct.provider, direct.id))
      return
    }

    const spotify = parseSpotifyUrl(trimmed)
    if (spotify) {
      setStatus({ kind: 'loading', note: 'Looking up that Spotify album…' })
      try {
        const oembed = await fetchOEmbed(spotify.url, next.signal)
        const ranked = await findAcrossProviders({ title: oembed.title }, next.signal)
        if (next.signal.aborted) return
        if (ranked.length === 0) {
          setStatus({
            kind: 'error',
            message: `Spotify calls that album “${oembed.title}”, but ${activeSourceLabel} has no copy with playable previews.`,
          })
          return
        }
        setStatus({
          kind: 'results',
          results: ranked.map((entry) => entry.item),
          note: `Spotify calls it “${oembed.title}” — pick the matching release to rank it with previews.`,
        })
      } catch (error) {
        if (next.signal.aborted) return
        setStatus({
          kind: 'error',
          message: error instanceof Error ? error.message : 'That Spotify link could not be read',
        })
      }
      return
    }

    setStatus({ kind: 'loading' })
    try {
      const { results, errors } = await searchAlbums(trimmed, next.signal)
      if (next.signal.aborted) return
      if (results.length === 0 && errors.length > 0) {
        setStatus({
          kind: 'error',
          message: `${activeSourceLabel} ${isSingleSource ? 'is' : 'are'} unreachable right now.`,
        })
        return
      }
      setStatus({
        kind: 'results',
        results,
        note:
          errors.length > 0
            ? 'A catalogue did not answer, so these results may be thin.'
            : undefined,
      })
    } catch (error) {
      if (next.signal.aborted) return
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Search failed',
      })
    }
  }, [])

  // Debounced so a fast typist does not fire a request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => void run(query), 320)
    return () => window.clearTimeout(timer)
  }, [query, run])

  return (
    <div className="home fade-in">
      <section className="hero">
        <h1 className="display">
          Settle the album.<br />
          <span className="hero-accent">One track at a time.</span>
        </h1>
      </section>

      <div className="search">
        <span className="search-icon">
          <Icon name="search" size={19} />
        </span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search an album, or paste a Spotify / Deezer / Apple Music link"
          aria-label="Search for an album"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {status.kind === 'loading' &&
        // A pasted Spotify link is a lookup with a message worth reading; a
        // plain search is about to fill this grid, so hold its shape instead.
        (status.note ? <Spinner label={status.note} /> : <AlbumGridSkeleton />)}

      {status.kind === 'error' && (
        <EmptyState icon="close" title="That did not work">
          {status.message}
        </EmptyState>
      )}

      {status.kind === 'results' && (
        <>
          {status.note && <p className="search-note pill">{status.note}</p>}
          {status.results.length === 0 ? (
            <EmptyState icon="search" title="No albums matched">
              Try the artist name together with the album title.
            </EmptyState>
          ) : (
            <div className="album-grid">
              {status.results.map((album) => {
                // Deezer's search payload carries no release date, so the year
                // is simply absent rather than unknown — printing a placeholder
                // for it put a stray dash on every card.
                const meta = [album.year, album.trackCount && `${album.trackCount} tracks`]
                  .filter(Boolean)
                  .join(' · ')
                return (
                <a
                  key={`${album.provider}:${album.id}`}
                  className="album-card"
                  href={hrefAlbum(album.provider, album.id)}
                >
                  <Art src={album.cover} alt={`${album.title} cover`} />
                  <div className="album-card-text">
                    <strong className="clamp-2">{album.title}</strong>
                    <span className="faint truncate">{album.artist}</span>
                    {meta && <span className="faint tabular album-card-meta">{meta}</span>}
                  </div>
                </a>
                )
              })}
            </div>
          )}
        </>
      )}

      {status.kind === 'idle' && (
        <section className="library">
          <div className="library-head">
            <h2 className="section-title">Your rankings</h2>
            {library.length > 1 && (
              <a className="btn btn-ghost btn-sm" href="#/c/">
                <Icon name="users" size={15} />
                Compare
              </a>
            )}
          </div>

          {library.length === 0 ? (
            <EmptyState icon="trophy" title="Nothing ranked yet">
              Find an album above and start duelling its tracks. Everything you rank is kept in this
              browser only.
            </EmptyState>
          ) : (
            <ul className="library-list">
              {library.map((entry) => (
                <li key={entry.id} className="library-item">
                  <a className="library-link" href={hrefRanking(entry.code)}>
                    <Art src={entry.albumCover} alt="" size={52} />
                    <span className="col truncate">
                      <strong className="truncate">{entry.albumTitle}</strong>
                      <span className="faint truncate">
                        {entry.albumArtist}
                        {entry.importedFrom && ' · imported'}
                      </span>
                    </span>
                    {!entry.complete && (
                      <span className="pill pill-accent library-progress">
                        {entry.duels} question{entry.duels === 1 ? '' : 's'} in
                      </span>
                    )}
                  </a>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove ${entry.albumTitle}`}
                    onClick={() => setLibrary(removeFromLibrary(entry.id))}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
