/** A music catalogue we can pull an album tracklist out of without any login. */
export type ProviderId = 'spotify' | 'deezer' | 'itunes'

export interface Track {
  /** Provider-native track id. Stable enough to cache against, never shared in URLs. */
  id: string
  title: string
  /** Only set when it differs from the album artist (features, splits, compilations). */
  artist?: string
  durationMs: number
  trackNumber: number
  discNumber: number
  /** 30s clip. Every provider here serves these with permissive CORS. */
  previewUrl: string | null
  externalUrl: string | null
  explicit: boolean
}

export interface AlbumSummary {
  provider: ProviderId
  id: string
  title: string
  artist: string
  year: string | null
  cover: string | null
  trackCount: number | null
}

export interface Album extends AlbumSummary {
  cover: string | null
  externalUrl: string | null
  tracks: Track[]
  /** Set when the album was matched across catalogues, e.g. a Spotify link played via Deezer. */
  matchedFrom?: { provider: ProviderId; id: string; url: string }
}

export interface Provider {
  id: ProviderId
  label: string
  /** False when the provider needs configuration this build does not have. */
  available: boolean
  /** Why it is unavailable, shown in the UI. */
  unavailableReason?: string
  search(query: string, signal?: AbortSignal): Promise<AlbumSummary[]>
  getAlbum(id: string, signal?: AbortSignal): Promise<Album>
  /** Extract an album id from a pasted link, or null if the link is not ours. */
  parseUrl(url: string): string | null
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderId,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

export const albumKey = (provider: ProviderId, id: string) => `${provider}:${id}`

/**
 * Make sure no two tracks on a record read the same.
 *
 * Catalogues hand back tidied titles that drop the version in brackets, so
 * "P.I.M.P." and "P.I.M.P. (Snoop Dogg Remix)" arrive as the same string — two
 * different songs, indistinguishable in a ranking, and a duel asking which of
 * P.I.M.P. and P.I.M.P. is better. Anything still colliding after the fuller
 * title is tried gets its position appended, because a label that cannot tell
 * two tracks apart is worse than an ugly one.
 */
export function ensureDistinctTitles(
  tracks: Track[],
  fullTitleOf?: (track: Track) => string | undefined,
): Track[] {
  const count = (list: Track[]) => {
    const seen = new Map<string, number>()
    for (const track of list) {
      const key = track.title.trim().toLowerCase()
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    return seen
  }

  let out = tracks
  if (fullTitleOf) {
    const collisions = count(out)
    out = out.map((track) => {
      if ((collisions.get(track.title.trim().toLowerCase()) ?? 0) < 2) return track
      const full = fullTitleOf(track)?.trim()
      return full && full !== track.title ? { ...track, title: full } : track
    })
  }

  const remaining = count(out)
  return out.map((track) =>
    (remaining.get(track.title.trim().toLowerCase()) ?? 0) < 2
      ? track
      : { ...track, title: `${track.title} (${track.trackNumber})` },
  )
}

/** Sort by disc then track number; providers are not reliably ordered. */
export function sortTracks(tracks: Track[]): Track[] {
  return [...tracks].sort(
    (a, b) => a.discNumber - b.discNumber || a.trackNumber - b.trackNumber,
  )
}
