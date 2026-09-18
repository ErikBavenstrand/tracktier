import type { Album, ProviderId } from './providers/types'
import type { SortState } from './sorter'

/**
 * Everything persists in the browser. There is no server, no account and no
 * sync — a ranking exists in this browser and in whatever links you hand out.
 */

const PREFIX = 'tracktour:'
const KEY_LIBRARY = `${PREFIX}library`
const KEY_SESSION = `${PREFIX}session`
const KEY_PROFILE = `${PREFIX}profile`
const ALBUM_CACHE = `${PREFIX}album:`

/** Deezer signs preview URLs for ~15 minutes, so its cache entries expire fast. */
const ALBUM_TTL_MS: Record<ProviderId, number> = {
  deezer: 10 * 60 * 1000,
  itunes: 7 * 24 * 60 * 60 * 1000,
  spotify: 7 * 24 * 60 * 60 * 1000,
}

/** Private mode and blocked site data both make storage throw rather than return null. */
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function safeRemove(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* nothing we can do, and nothing that should break the app */
  }
}

function readJson<T>(key: string, fallback: T): T {
  const raw = safeGet(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

// ---------------------------------------------------------------- album cache

interface CachedAlbum {
  album: Album
  storedAt: number
}

export function cacheAlbum(album: Album): void {
  safeSet(
    `${ALBUM_CACHE}${album.provider}:${album.id}`,
    JSON.stringify({ album, storedAt: Date.now() } satisfies CachedAlbum),
  )
}

export function readCachedAlbum(provider: ProviderId, id: string): Album | null {
  const entry = readJson<CachedAlbum | null>(`${ALBUM_CACHE}${provider}:${id}`, null)
  if (!entry) return null
  if (Date.now() - entry.storedAt > ALBUM_TTL_MS[provider]) {
    safeRemove(`${ALBUM_CACHE}${provider}:${id}`)
    return null
  }
  return entry.album
}

/**
 * Metadata stays usable long after the audio links rot, so a stale entry can
 * still render the tracklist while fresh preview URLs are fetched behind it.
 */
export function readStaleAlbum(provider: ProviderId, id: string): Album | null {
  return readJson<CachedAlbum | null>(`${ALBUM_CACHE}${provider}:${id}`, null)?.album ?? null
}

// -------------------------------------------------------------------- library

/**
 * One person's ranking of one album.
 *
 * `label` is required: a ranking nobody can name is one nobody can compare.
 * `mine` separates what was ranked in this browser from what arrived through
 * someone else's link, which is the distinction the import flow turns on.
 */
export interface SavedRanking {
  label: string
  code: string
  order: number[]
  cuts: number[]
  savedAt: number
  mine: boolean
}

/**
 * An album, with every ranking of it this browser holds.
 *
 * Albums are the unit rather than rankings because that is how they are read:
 * you want to know who has ranked Nevermind, not to scroll a flat list where
 * your copy and a friend's sit apart. It also removes the second store this
 * replaced, where the same ranking lived in two places under two shapes.
 */
export interface LibraryAlbum {
  provider: ProviderId
  albumId: string
  title: string
  artist: string
  cover: string | null
  trackCount: number
  trackTitles: string[]
  updatedAt: number
  rankings: SavedRanking[]
}

export const loadLibrary = (): LibraryAlbum[] =>
  readJson<LibraryAlbum[]>(KEY_LIBRARY, []).filter((entry) => entry?.rankings?.length)

export function libraryAlbum(provider: ProviderId, albumId: string): LibraryAlbum | null {
  return (
    loadLibrary().find(
      (entry) => entry.provider === provider && entry.albumId === albumId,
    ) ?? null
  )
}

export interface AlbumFacts {
  provider: ProviderId
  albumId: string
  title: string
  artist: string
  cover: string | null
  trackCount: number
  trackTitles: string[]
}

/** Adds or replaces one person's ranking of an album, keyed by their name. */
export function saveRanking(album: AlbumFacts, ranking: SavedRanking): LibraryAlbum[] {
  const name = ranking.label.trim().toLowerCase()
  if (!name) return loadLibrary()

  const library = loadLibrary()
  const existing = library.find(
    (entry) => entry.provider === album.provider && entry.albumId === album.albumId,
  )
  const rankings = [
    ...(existing?.rankings ?? []).filter((item) => item.label.trim().toLowerCase() !== name),
    ranking,
  ].sort((a, b) => a.savedAt - b.savedAt)

  const updated: LibraryAlbum = { ...album, updatedAt: Date.now(), rankings }
  const next = [
    updated,
    ...library.filter(
      (entry) => !(entry.provider === album.provider && entry.albumId === album.albumId),
    ),
  ].slice(0, 60)

  safeSet(KEY_LIBRARY, JSON.stringify(next))
  return next
}

export function removeRanking(
  provider: ProviderId,
  albumId: string,
  label: string,
): LibraryAlbum[] {
  const name = label.trim().toLowerCase()
  const next = loadLibrary()
    .map((entry) =>
      entry.provider === provider && entry.albumId === albumId
        ? {
            ...entry,
            rankings: entry.rankings.filter(
              (item) => item.label.trim().toLowerCase() !== name,
            ),
          }
        : entry,
    )
    .filter((entry) => entry.rankings.length > 0)
  safeSet(KEY_LIBRARY, JSON.stringify(next))
  return next
}

export function removeAlbum(provider: ProviderId, albumId: string): LibraryAlbum[] {
  const next = loadLibrary().filter(
    (entry) => !(entry.provider === provider && entry.albumId === albumId),
  )
  safeSet(KEY_LIBRARY, JSON.stringify(next))
  return next
}

/**
 * Whether this browser produced a given ranking.
 *
 * This is what tells an imported link from your own, and it works without a
 * name on it: a code either matches something ranked here or it came from
 * outside. Anything external is offered for import rather than silently kept.
 */
export function isOwnCode(provider: ProviderId, albumId: string, code: string): boolean {
  const album = libraryAlbum(provider, albumId)
  if (album?.rankings.some((item) => item.code === code && item.mine)) return true
  const session = loadSession()
  return Boolean(
    session &&
      session.provider === provider &&
      session.albumId === albumId &&
      session.code === code,
  )
}

// ------------------------------------------------------------ in-flight session

export interface StoredSession {
  provider: ProviderId
  albumId: string
  /** The share code this session last produced, so a results page can tell
      whether it is showing this browser's own ranking or somebody else's. */
  code?: string
  /** The interactive sort, mid-flight. Absent on sessions from older builds. */
  sort?: SortState
  comparisons: number
  updatedAt: number
}

export const loadSession = (): StoredSession | null => readJson<StoredSession | null>(KEY_SESSION, null)

/** The in-progress session for one album, if that is the one being ranked. */
export function sessionFor(provider: ProviderId, albumId: string): StoredSession | null {
  const session = loadSession()
  return session && session.provider === provider && session.albumId === albumId ? session : null
}

export function saveSession(session: StoredSession): void {
  safeSet(KEY_SESSION, JSON.stringify(session))
}

export const clearSession = (): void => safeRemove(KEY_SESSION)

/** Record which share code the live session currently corresponds to. */
export function tagSession(code: string): void {
  const session = loadSession()
  if (session) saveSession({ ...session, code })
}

// ------------------------------------------------------------ skipped tracks

const SKIPPED = `${PREFIX}skipped:`

/** Track ids the listener chose to leave out of an album's ranking. */
export function loadSkipped(provider: ProviderId, albumId: string): string[] {
  return readJson<string[]>(`${SKIPPED}${provider}:${albumId}`, [])
}

export function saveSkipped(provider: ProviderId, albumId: string, ids: string[]): void {
  if (ids.length === 0) {
    safeRemove(`${SKIPPED}${provider}:${albumId}`)
    return
  }
  safeSet(`${SKIPPED}${provider}:${albumId}`, JSON.stringify(ids))
}

/** Distinguishes "chose to keep everything" from "never opened this album". */
export function hasSkipChoice(provider: ProviderId, albumId: string): boolean {
  return safeGet(`${SKIPPED}${provider}:${albumId}`) !== null ||
    safeGet(`${SKIPPED}${provider}:${albumId}:none`) !== null
}

export function markSkipChoiceMade(provider: ProviderId, albumId: string): void {
  safeSet(`${SKIPPED}${provider}:${albumId}:none`, '1')
}

// -------------------------------------------------------------------- profile

export interface Profile {
  label: string
}

export const loadProfile = (): Profile => readJson<Profile>(KEY_PROFILE, { label: '' })
export function saveProfile(profile: Profile): void {
  safeSet(KEY_PROFILE, JSON.stringify(profile))
}

/** True when we can actually persist; the UI warns instead of silently losing work. */
export function storageAvailable(): boolean {
  const probe = `${PREFIX}probe`
  if (!safeSet(probe, '1')) return false
  safeRemove(probe)
  return true
}
