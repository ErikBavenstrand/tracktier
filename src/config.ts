import type { ProviderId } from './lib/providers/types'

/**
 * The music catalogue the app runs on.
 *
 * One source supplies everything — album search, artwork, tracklists and the
 * 30-second preview clips — so swapping catalogues is this single constant, not
 * a refactor. Every source implements the same `Provider` interface in
 * `lib/providers/`, and nothing outside that folder knows which one is active.
 *
 *   'deezer'  Widest catalogue (19/20 canonical albums in testing), 1000px art,
 *             previews for everything. Reached over JSONP because the API sends
 *             no CORS headers, and its preview URLs expire after ~15 minutes.
 *   'itunes'  Plain CORS `fetch` and preview URLs that never expire, but it
 *             indexes the iTunes Store download catalogue rather than Apple
 *             Music, so streaming-era albums go missing (14/20 in testing).
 *   'all'     Query every source and merge the results. Broadest coverage, at
 *             the cost of a slower search and duplicate releases to sift.
 *
 * To add a catalogue: implement `Provider`, register it in
 * `lib/providers/index.ts`, and name it here.
 */
export type SourceMode = ProviderId | 'all'

export const DATA_SOURCE: SourceMode = 'deezer'

/**
 * Fall back to the other catalogue when the chosen one cannot be reached.
 * Off by default so the active source stays predictable — a JSONP block or a
 * dead network shows an error instead of silently changing where data is from.
 */
export const FALLBACK_WHEN_UNREACHABLE = false
