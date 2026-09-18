import type { Album, ProviderId } from './providers/types'
import type { SortState } from './sorter'
import type { Ranking } from './sharecode'

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

export interface SavedRanking extends Ranking {
  id: string
  /** The encoded ranking, kept so the library can link straight to it. */
  code: string
  albumTitle: string
  albumArtist: string
  albumCover: string | null
  trackTitles: string[]
  /** Duels behind this ranking; 0 for one arriving through someone's link. */
  duels: number
  /** False while the ranking is still being duelled out. */
  complete: boolean
  createdAt: number
  updatedAt: number
  /** Set when this came in through someone else's link rather than being ranked here. */
  importedFrom?: string
}

export const loadLibrary = (): SavedRanking[] => readJson<SavedRanking[]>(KEY_LIBRARY, [])

export function saveToLibrary(entry: SavedRanking): SavedRanking[] {
  const library = loadLibrary().filter((item) => item.id !== entry.id)
  const next = [entry, ...library].slice(0, 200)
  safeSet(KEY_LIBRARY, JSON.stringify(next))
  return next
}

export function removeFromLibrary(id: string): SavedRanking[] {
  const next = loadLibrary().filter((item) => item.id !== id)
  safeSet(KEY_LIBRARY, JSON.stringify(next))
  return next
}

export const rankingId = (provider: ProviderId, albumId: string, label?: string) =>
  `${provider}:${albumId}${label ? `:${label}` : ''}`

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
