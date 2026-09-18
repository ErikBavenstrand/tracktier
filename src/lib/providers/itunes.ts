import { ProviderError, sortTracks, type Album, type AlbumSummary, type Provider, type Track } from './types'

const API = 'https://itunes.apple.com'

interface ItResult {
  wrapperType?: string
  collectionType?: string
  collectionId?: number
  trackId?: number
  artistName?: string
  collectionName?: string
  trackName?: string
  trackNumber?: number
  discNumber?: number
  trackCount?: number
  trackTimeMillis?: number
  previewUrl?: string
  artworkUrl100?: string
  collectionViewUrl?: string
  trackViewUrl?: string
  releaseDate?: string
  trackExplicitness?: string
}

/** Apple serves every artwork size from the same path; 100x100 is just the default. */
const artwork = (url: string | undefined, size: number): string | null =>
  url ? url.replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`) : null

const year = (date?: string) => (date && /^\d{4}/.test(date) ? date.slice(0, 4) : null)

async function json<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new ProviderError(`iTunes responded ${res.status}`, 'itunes')
  // The endpoint replies with `text/javascript`, but the body is plain JSON.
  return (await res.json()) as T
}

function toTrack(r: ItResult, albumArtist: string, index: number): Track {
  const artist = r.artistName
  return {
    id: String(r.trackId ?? `${r.collectionId}-${index}`),
    title: r.trackName ?? 'Untitled',
    artist: artist && artist !== albumArtist ? artist : undefined,
    durationMs: r.trackTimeMillis ?? 0,
    trackNumber: r.trackNumber ?? index + 1,
    discNumber: r.discNumber ?? 1,
    previewUrl: r.previewUrl ?? null,
    externalUrl: r.trackViewUrl ?? null,
    explicit: r.trackExplicitness === 'explicit',
  }
}

async function getAlbum(id: string, signal?: AbortSignal): Promise<Album> {
  const data = await json<{ results?: ItResult[] }>(
    `${API}/lookup?id=${encodeURIComponent(id)}&entity=song&limit=400`,
    signal,
  )
  const results = data.results ?? []
  const collection = results.find((r) => r.wrapperType === 'collection')
  const trackRows = results.filter((r) => r.wrapperType === 'track')
  if (!collection || trackRows.length === 0) {
    throw new ProviderError('Album not found on Apple Music', 'itunes')
  }

  const artist = collection.artistName ?? 'Unknown artist'
  return {
    provider: 'itunes',
    id: String(collection.collectionId),
    title: collection.collectionName ?? 'Untitled album',
    artist,
    year: year(collection.releaseDate),
    cover: artwork(collection.artworkUrl100, 1000),
    trackCount: trackRows.length,
    externalUrl: collection.collectionViewUrl ?? null,
    tracks: sortTracks(trackRows.map((r, i) => toTrack(r, artist, i))),
  }
}

async function search(query: string, signal?: AbortSignal): Promise<AlbumSummary[]> {
  const data = await json<{ results?: ItResult[] }>(
    `${API}/search?term=${encodeURIComponent(query)}&entity=album&limit=24`,
    signal,
  )
  return (data.results ?? []).map((a) => ({
    provider: 'itunes' as const,
    id: String(a.collectionId),
    title: a.collectionName ?? 'Untitled album',
    artist: a.artistName ?? 'Unknown artist',
    year: year(a.releaseDate),
    cover: artwork(a.artworkUrl100, 300),
    trackCount: a.trackCount ?? null,
  }))
}

function parseUrl(url: string): string | null {
  // https://music.apple.com/us/album/in-between-dreams/1440857781
  const m = url.match(/music\.apple\.com\/[^/]+\/album\/[^/]*\/?(\d+)/i)
  return m?.[1] ?? null
}

export const itunesProvider: Provider = {
  id: 'itunes',
  label: 'Apple Music',
  available: true,
  search,
  getAlbum,
  parseUrl,
}
