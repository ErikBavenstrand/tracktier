import { ProviderError, sortTracks, type Album, type Track } from './types'

/**
 * Spotify is an *integration*, not a data source.
 *
 * `api.spotify.com` answers 401 without an OAuth token, and the only token you
 * can mint without a user needs a client secret — which cannot live in a static
 * bundle. Two endpoints are open to us, though:
 *
 *  - `/oembed` sends `Access-Control-Allow-Origin: *` and returns the album
 *    title and cover. Enough to identify an album and hand it to Deezer/iTunes.
 *  - `/embed/album/<id>` inlines the entire tracklist *and* `p.scdn.co` preview
 *    URLs in its `__NEXT_DATA__`, with no auth at all — but sends no CORS
 *    headers, so a browser cannot read it. Set `VITE_SPOTIFY_PROXY` to a shim
 *    that adds the header (see `worker/spotify-cors-proxy.js`) to unlock it.
 */
const PROXY: string | undefined = import.meta.env.VITE_SPOTIFY_PROXY?.replace(/\/$/, '')

export const spotifyProxyConfigured = Boolean(PROXY)

export interface SpotifyRef {
  id: string
  url: string
}

export function parseSpotifyUrl(input: string): SpotifyRef | null {
  const trimmed = input.trim()
  const m =
    trimmed.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?album\/([A-Za-z0-9]{22})/) ??
    trimmed.match(/^spotify:album:([A-Za-z0-9]{22})$/)
  const id = m?.[1]
  return id ? { id, url: `https://open.spotify.com/album/${id}` } : null
}

export const spotifyAlbumUrl = (id: string) => `https://open.spotify.com/album/${id}`
export const spotifyEmbedUrl = (id: string) =>
  `https://open.spotify.com/embed/album/${id}?utm_source=oembed`
export const spotifySearchUrl = (artist: string, album: string) =>
  `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${album}`)}`

export interface OEmbedResult {
  title: string
  thumbnail: string | null
}

/** Works from any origin, no key. Gives us the album title and cover only. */
export async function fetchOEmbed(url: string, signal?: AbortSignal): Promise<OEmbedResult> {
  const res = await fetch(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
    { signal },
  )
  if (!res.ok) throw new ProviderError(`Spotify oEmbed responded ${res.status}`, 'spotify')
  const data = (await res.json()) as { title?: string; thumbnail_url?: string }
  if (!data.title) throw new ProviderError('Spotify did not recognise that link', 'spotify')
  return { title: data.title, thumbnail: data.thumbnail_url ?? null }
}

interface NextTrack {
  uid?: string
  uri?: string
  title?: string
  subtitle?: string
  duration?: number
  isExplicit?: boolean
  audioPreview?: { url?: string }
}

/** Only reachable when a CORS shim is configured. Returns the real Spotify tracklist. */
export async function fetchAlbumViaProxy(id: string, signal?: AbortSignal): Promise<Album> {
  if (!PROXY) throw new ProviderError('No Spotify proxy configured', 'spotify')

  const res = await fetch(`${PROXY}/embed/album/${encodeURIComponent(id)}`, { signal })
  if (!res.ok) throw new ProviderError(`Spotify proxy responded ${res.status}`, 'spotify')
  const html = await res.text()

  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/,
  )
  if (!match?.[1]) throw new ProviderError('Could not read the Spotify embed payload', 'spotify')

  let entity: {
    title?: string
    subtitle?: string
    trackList?: NextTrack[]
    visualIdentity?: { image?: { url?: string; maxWidth?: number }[] }
  }
  try {
    const parsed = JSON.parse(match[1]) as {
      props?: { pageProps?: { state?: { data?: { entity?: typeof entity } } } }
    }
    entity = parsed.props?.pageProps?.state?.data?.entity ?? {}
  } catch (cause) {
    throw new ProviderError('Spotify embed payload was not valid JSON', 'spotify', cause)
  }

  const rows = entity.trackList ?? []
  if (rows.length === 0) throw new ProviderError('That Spotify album had no tracks', 'spotify')

  const artist = entity.subtitle ?? 'Unknown artist'
  const cover = [...(entity.visualIdentity?.image ?? [])]
    .sort((a, b) => (b.maxWidth ?? 0) - (a.maxWidth ?? 0))[0]?.url

  // The embed payload lists tracks in album order but omits track numbers.
  const tracks: Track[] = rows.map((t, i) => {
    const trackId = t.uri?.split(':').pop() ?? t.uid ?? String(i)
    return {
      id: trackId,
      title: t.title ?? 'Untitled',
      artist: t.subtitle && t.subtitle !== artist ? t.subtitle : undefined,
      durationMs: t.duration ?? 0,
      trackNumber: i + 1,
      discNumber: 1,
      previewUrl: t.audioPreview?.url ?? null,
      externalUrl: `https://open.spotify.com/track/${trackId}`,
      explicit: Boolean(t.isExplicit),
    }
  })

  return {
    provider: 'spotify',
    id,
    title: entity.title ?? 'Untitled album',
    artist,
    year: null,
    cover: cover ?? null,
    trackCount: tracks.length,
    externalUrl: spotifyAlbumUrl(id),
    tracks: sortTracks(tracks),
  }
}
