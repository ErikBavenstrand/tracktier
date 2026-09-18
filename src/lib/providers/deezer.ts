import { jsonp } from './jsonp'
import {
  ensureDistinctTitles,
  ProviderError,
  sortTracks,
  type Album,
  type AlbumSummary,
  type Provider,
  type Track,
} from './types'

const API = 'https://api.deezer.com'

interface DzArtist { name?: string }
interface DzTrack {
  id: number
  title: string
  title_short?: string
  duration: number
  track_position?: number
  disk_number?: number
  preview?: string
  link?: string
  explicit_lyrics?: boolean
  artist?: DzArtist
}
interface DzAlbum {
  id: number
  title: string
  artist?: DzArtist
  cover_xl?: string
  cover_big?: string
  cover_medium?: string
  release_date?: string
  nb_tracks?: number
  link?: string
  record_type?: string
  tracks?: { data: DzTrack[] }
  error?: { message?: string; type?: string }
}
interface DzSearch { data?: DzAlbum[]; error?: { message?: string } }

const year = (date?: string) => (date && /^\d{4}/.test(date) ? date.slice(0, 4) : null)

function toTrack(t: DzTrack, albumArtist: string, index: number): Track {
  const artist = t.artist?.name
  return {
    id: String(t.id),
    title: t.title_short || t.title,
    artist: artist && artist !== albumArtist ? artist : undefined,
    durationMs: (t.duration ?? 0) * 1000,
    trackNumber: t.track_position ?? index + 1,
    discNumber: t.disk_number ?? 1,
    previewUrl: t.preview || null,
    externalUrl: t.link ?? null,
    explicit: Boolean(t.explicit_lyrics),
  }
}

async function getAlbum(id: string, signal?: AbortSignal): Promise<Album> {
  const raw = await jsonp<DzAlbum>(`${API}/album/${encodeURIComponent(id)}`, signal)
  if (raw.error) throw new ProviderError(raw.error.message ?? 'Album not found on Deezer', 'deezer')

  const artist = raw.artist?.name ?? 'Unknown artist'
  let tracks = raw.tracks?.data ?? []

  // The album payload inlines only the first page; box sets need the full list.
  if (raw.nb_tracks && tracks.length < raw.nb_tracks) {
    const page = await jsonp<{ data?: DzTrack[] }>(
      `${API}/album/${encodeURIComponent(id)}/tracks?limit=500`,
      signal,
    )
    if (page.data?.length) tracks = page.data
  }

  return {
    provider: 'deezer',
    id: String(raw.id),
    title: raw.title,
    artist,
    year: year(raw.release_date),
    cover: raw.cover_xl ?? raw.cover_big ?? null,
    trackCount: tracks.length,
    externalUrl: raw.link ?? `https://www.deezer.com/album/${raw.id}`,
    // `title_short` is the clean one, but it drops the version in brackets, so
    // the full title is held in reserve for tracks that would otherwise clash.
    tracks: sortTracks(
      ensureDistinctTitles(
        tracks.map((t, i) => toTrack(t, artist, i)),
        (track) => tracks.find((t) => String(t.id) === track.id)?.title,
      ),
    ),
  }
}

async function search(query: string, signal?: AbortSignal): Promise<AlbumSummary[]> {
  const res = await jsonp<DzSearch>(
    `${API}/search/album?q=${encodeURIComponent(query)}&limit=24`,
    signal,
  )
  if (res.error) throw new ProviderError(res.error.message ?? 'Deezer search failed', 'deezer')
  return (res.data ?? []).map((a) => ({
    provider: 'deezer' as const,
    id: String(a.id),
    title: a.title,
    artist: a.artist?.name ?? 'Unknown artist',
    year: year(a.release_date),
    // Search cards render at ~150px; 500px art just costs a slower decode.
    cover: a.cover_medium ?? a.cover_big ?? null,
    trackCount: a.nb_tracks ?? null,
  }))
}

function parseUrl(url: string): string | null {
  const m = url.match(/deezer\.com\/(?:[a-z]{2}\/)?album\/(\d+)/i)
  return m?.[1] ?? null
}

export const deezerProvider: Provider = {
  id: 'deezer',
  label: 'Deezer',
  available: true,
  search,
  getAlbum,
  parseUrl,
}

/** Deezer signs preview URLs with a short expiry, so cached albums go stale fast. */
export const DEEZER_PREVIEW_TTL_MS = 10 * 60 * 1000
