import { DATA_SOURCE, FALLBACK_WHEN_UNREACHABLE } from '../../config'
import { deezerProvider } from './deezer'
import { itunesProvider } from './itunes'
import { normalizeTitle, rankMatches } from '../match'
import {
  albumKey,
  type Album,
  type AlbumSummary,
  type Provider,
  type ProviderId,
} from './types'

export * from './types'
export { deezerProvider } from './deezer'
export { itunesProvider } from './itunes'
export * from './spotify'

/** Every catalogue the app knows how to read. Register new ones here. */
export const allProviders: Provider[] = [deezerProvider, itunesProvider]

const byId = new Map<ProviderId, Provider>(allProviders.map((p) => [p.id, p]))

/**
 * The catalogues actually in play, chosen by `DATA_SOURCE`. Normally this is a
 * single provider supplying search, artwork, tracks and previews alike.
 */
export const providers: Provider[] =
  DATA_SOURCE === 'all'
    ? allProviders
    : [byId.get(DATA_SOURCE) ?? allProviders[0]!]

/** Sources tried only if the active one fails outright. */
const fallbacks: Provider[] =
  FALLBACK_WHEN_UNREACHABLE && DATA_SOURCE !== 'all'
    ? allProviders.filter((p) => p.id !== DATA_SOURCE)
    : []

export const isSingleSource = providers.length === 1

export function getProvider(id: ProviderId): Provider {
  const provider = byId.get(id)
  if (!provider) throw new Error(`Unknown provider: ${id}`)
  return provider
}

export interface MergedResult extends AlbumSummary {
  /** The same record as found in the other catalogue, when both have it. */
  alternates: AlbumSummary[]
}

const groupKey = (a: AlbumSummary) => `${normalizeTitle(a.artist)}|${normalizeTitle(a.title)}`

/**
 * Search the active catalogue. With several in play their hits are interleaved
 * and duplicate releases folded together; a source that throws is skipped
 * rather than failing the whole search.
 */
export async function searchAlbums(
  query: string,
  signal?: AbortSignal,
): Promise<{ results: MergedResult[]; errors: { provider: ProviderId; error: unknown }[] }> {
  const active = providers
  const settled = await Promise.allSettled(
    active.map((p) => p.search(query, signal).then((results) => ({ provider: p.id, results }))),
  )

  const errors: { provider: ProviderId; error: unknown }[] = []
  const perProvider = new Map<ProviderId, AlbumSummary[]>()
  settled.forEach((outcome, i) => {
    const provider = active[i]!.id
    if (outcome.status === 'fulfilled') perProvider.set(provider, outcome.value.results)
    else errors.push({ provider, error: outcome.reason })
  })

  // Only reach for another catalogue when the chosen one produced nothing at all.
  if (perProvider.size === 0 && fallbacks.length > 0) {
    for (const provider of fallbacks) {
      try {
        perProvider.set(provider.id, await provider.search(query, signal))
        break
      } catch (error) {
        errors.push({ provider: provider.id, error })
      }
    }
  }

  // Interleave so neither catalogue dominates the top of the list purely by
  // being first, then collapse albums that appear in both.
  const interleaved: AlbumSummary[] = []
  const lists = [...perProvider.values()]
  const longest = Math.max(0, ...lists.map((l) => l.length))
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const entry = list[i]
      if (entry) interleaved.push(entry)
    }
  }

  const groups = new Map<string, MergedResult>()
  for (const summary of interleaved) {
    const key = groupKey(summary)
    const existing = groups.get(key)
    if (existing) {
      // Keep the richer artwork, but never lose the alternate source.
      existing.alternates.push(summary)
      if (!existing.cover && summary.cover) existing.cover = summary.cover
      if (!existing.year && summary.year) existing.year = summary.year
    } else {
      groups.set(key, { ...summary, alternates: [] })
    }
  }

  return { results: [...groups.values()], errors }
}

export function loadAlbum(
  provider: ProviderId,
  id: string,
  signal?: AbortSignal,
): Promise<Album> {
  return getProvider(provider).getAlbum(id, signal)
}

/** Human-readable name of whatever is supplying data, for the UI. */
export const activeSourceLabel = providers.map((p) => p.label).join(' + ')

/** Recognise a pasted link from any catalogue we can read directly. */
export function parseAlbumUrl(url: string): { provider: ProviderId; id: string } | null {
  // Any catalogue's link is recognised, even one that is not currently active.
  for (const provider of allProviders) {
    const id = provider.parseUrl(url)
    if (id) return { provider: provider.id, id }
  }
  return null
}

/**
 * Find an album in our catalogues given only what Spotify's oEmbed tells us.
 * Returns every candidate so the UI can ask when the match is not obvious.
 */
export async function findAcrossProviders(
  target: { title: string; artist?: string | null; trackCount?: number | null },
  signal?: AbortSignal,
): Promise<{ item: MergedResult; score: number }[]> {
  const query = [target.artist, target.title].filter(Boolean).join(' ')
  const { results } = await searchAlbums(query, signal)
  return rankMatches(target, results)
}

export { albumKey }
