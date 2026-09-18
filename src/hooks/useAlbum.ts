import { useCallback, useEffect, useRef, useState } from 'react'
import { loadAlbum, type Album, type ProviderId } from '../lib/providers'
import { cacheAlbum, readCachedAlbum, readStaleAlbum } from '../lib/storage'

export interface AlbumState {
  album: Album | null
  loading: boolean
  error: string | null
  /** True while fresh data replaces a cached copy whose previews may have expired. */
  refreshing: boolean
  /** Retry after a failure — a blocked JSONP tag or a dropped network usually
      succeeds on a second attempt, and re-entering the URL is a poor substitute. */
  retry: () => void
}

/**
 * Loads an album, preferring cache. Deezer's preview URLs expire after ~15
 * minutes, so a stale entry is shown immediately for its metadata while fresh
 * audio links are fetched behind it — the tracklist never flickers.
 */
export function useAlbum(provider: ProviderId | null, id: string | null): AlbumState {
  const [state, setState] = useState<AlbumState>(() => ({
    album: null,
    loading: Boolean(provider && id),
    error: null,
    refreshing: false,
    retry: () => {},
  }))
  const requestRef = useRef(0)
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  useEffect(() => {
    if (!provider || !id) {
      setState({ album: null, loading: false, error: null, refreshing: false, retry })
      return
    }

    const token = ++requestRef.current
    const controller = new AbortController()

    // A retry must go past the cache, or it would just replay the same miss.
    const fresh = attempt === 0 ? readCachedAlbum(provider, id) : null
    if (fresh) {
      setState({ album: fresh, loading: false, error: null, refreshing: false, retry })
      return () => controller.abort()
    }

    const stale = readStaleAlbum(provider, id)
    setState({
      album: stale,
      loading: !stale,
      error: null,
      refreshing: Boolean(stale),
      retry,
    })

    loadAlbum(provider, id, controller.signal)
      .then((album) => {
        if (token !== requestRef.current) return
        cacheAlbum(album)
        setState({ album, loading: false, error: null, refreshing: false, retry })
      })
      .catch((error: unknown) => {
        if (token !== requestRef.current || controller.signal.aborted) return
        const message = error instanceof Error ? error.message : 'Could not load that album'
        // A stale copy still beats an error screen; only its previews are dead.
        setState((prev) =>
          prev.album
            ? { ...prev, refreshing: false, error: null }
            : { album: null, loading: false, error: message, refreshing: false, retry },
        )
      })

    return () => controller.abort()
  }, [provider, id, attempt, retry])

  return state
}
