import type { Album, ProviderId } from './providers/types'
import { MAX_AUTHOR } from './sharecode'
import type { SortState } from './sorter'

/**
 * Everything persists in the browser. There is no server, no account and no
 * sync — a ranking exists in this browser and in whatever links you hand out.
 */

const PREFIX = 'tracktour:'
const KEY_LIBRARY = `${PREFIX}library`
/* One slot per album. It used to be a single global one, so starting a second
   album silently destroyed the first album's answers — no warning, no undo, and
   nothing in the UI ever suggested only one ranking could be in flight. */
const SESSION = `${PREFIX}session:`
const KEY_SESSION_LEGACY = `${PREFIX}session`
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
  /** Who made it, from the share code. Absent on rankings kept before v3. */
  author?: number
}

/**
 * Whether two rankings of an album came from the same person.
 *
 * Author ids settle it outright. Without them all there is to go on is the
 * name, which is a guess: it merges two people who share one, and it cannot
 * tell your own ranking from somebody else's copy of it. So when the guess
 * would overwrite something you made with something you imported, it is
 * treated as two different people and both are kept.
 */
function isSamePerson(existing: SavedRanking, incoming: SavedRanking): boolean {
  if (existing.author !== undefined && incoming.author !== undefined) {
    return existing.author === incoming.author
  }
  const sameName =
    existing.label.trim().toLowerCase() === incoming.label.trim().toLowerCase()
  return sameName && !(existing.mine && !incoming.mine)
}

/** Keeps namesakes apart in the list, since the name is all the UI shows. */
function distinctLabel(label: string, taken: SavedRanking[]): string {
  const used = new Set(taken.map((item) => item.label.trim().toLowerCase()))
  const base = label.trim()
  if (!used.has(base.toLowerCase())) return base
  for (let suffix = 2; suffix < 100; suffix++) {
    const candidate = `${base} (${suffix})`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
  return `${base} (${Date.now()})`
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

/** Adds one person's ranking of an album, replacing their previous one. */
export function saveRanking(album: AlbumFacts, ranking: SavedRanking): LibraryAlbum[] {
  if (!ranking.label.trim()) return loadLibrary()

  const library = loadLibrary()
  const existing = library.find(
    (entry) => entry.provider === album.provider && entry.albumId === album.albumId,
  )
  const held = existing?.rankings ?? []
  const kept = held.filter((item) => !isSamePerson(item, ranking))
  const rankings = [
    ...kept,
    { ...ranking, label: distinctLabel(ranking.label, kept) },
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
export function isOwnCode(
  provider: ProviderId,
  albumId: string,
  code: string,
  author?: number,
): boolean {
  // An author id answers this outright, and keeps answering it on a browser
  // whose library has been cleared. Reading the profile here rather than
  // minting one keeps this free of side effects during a render.
  const me = loadProfile().author
  if (author !== undefined && me !== undefined) return author === me

  const album = libraryAlbum(provider, albumId)
  if (album?.rankings.some((item) => item.code === code && item.mine)) return true
  return sessionFor(provider, albumId)?.code === code
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

const sessionKey = (provider: ProviderId, albumId: string) => `${SESSION}${provider}:${albumId}`

/** The in-progress sort for one album, whatever else has been ranked since. */
export function sessionFor(provider: ProviderId, albumId: string): StoredSession | null {
  const stored = readJson<StoredSession | null>(sessionKey(provider, albumId), null)
  if (stored) return stored

  // Whatever was in the old single slot belongs to whichever album it names.
  const legacy = readJson<StoredSession | null>(KEY_SESSION_LEGACY, null)
  if (legacy && legacy.provider === provider && legacy.albumId === albumId) {
    saveSession(legacy)
    safeRemove(KEY_SESSION_LEGACY)
    return legacy
  }
  return null
}

export function saveSession(session: StoredSession): void {
  safeSet(sessionKey(session.provider, session.albumId), JSON.stringify(session))
}

export const clearSession = (provider: ProviderId, albumId: string): void =>
  safeRemove(sessionKey(provider, albumId))

/** Record which share code an album's live session currently corresponds to. */
export function tagSession(provider: ProviderId, albumId: string, code: string): void {
  const session = sessionFor(provider, albumId)
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
  /** This browser's author id, minted once and then never changed. */
  author?: number
}

/** 24 bits: short enough to cost four characters in a link, wide enough that
 *  a collision inside one friend group is not a thing that happens. */
function mintAuthor(): number {
  try {
    const bytes = new Uint32Array(1)
    crypto.getRandomValues(bytes)
    return bytes[0]! % MAX_AUTHOR
  } catch {
    return Math.floor(Math.random() * MAX_AUTHOR)
  }
}

/** This browser's author id, created on first use. */
export function authorId(): number {
  const profile = loadProfile()
  if (profile.author !== undefined) return profile.author
  const author = mintAuthor()
  saveProfile({ ...profile, author })
  return author
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
