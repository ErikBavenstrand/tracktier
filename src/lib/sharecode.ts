import { BitReader, BitWriter, bitsFor, checksum, fromBase64Url, hashString, toBase64Url } from './bits'
import { normalizeTitle } from './match'
import type { ProviderId } from './providers/types'

/**
 * A ranking, packed small enough to paste into a chat message.
 *
 * Nothing is stored anywhere: the share code *is* the ranking. It carries the
 * album reference plus the listener's ordering, and the recipient's browser
 * refetches the album itself — so a 20-track ranking costs ~24 bytes instead of
 * a payload full of track titles.
 *
 * The code lives in the URL fragment, which browsers never send to a server.
 * On GitHub Pages that means a shared ranking is not merely unstored, it is
 * unobservable by the host.
 */

const VERSION = 2
const MAX_TRACKS = 63
const MAX_LABEL_BYTES = 40

const PROVIDER_CODES: ProviderId[] = ['deezer', 'itunes', 'spotify']

export interface Ranking {
  provider: ProviderId
  albumId: string
  /** Original album track indices, best first. May be a subset of the album. */
  order: number[]
  /**
   * Tracks on the album, which is not always how many were ranked: skipping
   * skits means the indices above run past `order.length`, so their bit width
   * has to be derived from the album instead. Absent on v1 codes, where every
   * track was always ranked.
   */
  trackCount?: number
  /** Rank index where each tier after the first begins. */
  cuts: number[]
  /** Optional display name for whoever made the ranking. */
  label?: string
  /** Guards against the album's tracklist changing under a shared link. */
  titleHash?: number
}

export class ShareCodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShareCodeError'
  }
}

const isNumericId = (id: string) => /^\d{1,12}$/.test(id)

export function encodeRanking(ranking: Ranking, albumTitle?: string): string {
  const { provider, albumId, order, cuts, label } = ranking
  const n = order.length

  if (n === 0 || n > MAX_TRACKS) {
    throw new ShareCodeError(`Cannot share an album with ${n} tracks`)
  }
  const providerCode = PROVIDER_CODES.indexOf(provider)
  if (providerCode < 0) throw new ShareCodeError(`Unknown provider: ${provider}`)

  const trackCount = Math.max(ranking.trackCount ?? n, n)
  if (trackCount > MAX_TRACKS) {
    throw new ShareCodeError(`Cannot share an album with ${trackCount} tracks`)
  }

  const labelBytes = label
    ? new TextEncoder().encode(label).slice(0, MAX_LABEL_BYTES)
    : new Uint8Array(0)
  const numeric = isNumericId(albumId)
  const idBytes = numeric ? new Uint8Array(0) : new TextEncoder().encode(albumId)
  if (!numeric && idBytes.length > 255) throw new ShareCodeError('Album id is too long to share')

  const titleHash = albumTitle ? hashString(normalizeTitle(albumTitle)) : (ranking.titleHash ?? 0)

  const writer = new BitWriter()
  writer.write(VERSION, 4)
  writer.write(providerCode, 3)
  writer.write(numeric ? 1 : 0, 1)
  writer.write(labelBytes.length > 0 ? 1 : 0, 1)
  writer.write(n, 6)
  writer.write(trackCount, 6)
  writer.write(cuts.length, 3)
  writer.write(titleHash, 8)

  if (numeric) {
    const value = Number(albumId)
    writer.write(Math.floor(value / 2 ** 20), 20)
    writer.write(value % 2 ** 20, 20)
  } else {
    writer.write(idBytes.length, 8)
    writer.writeBytes(idBytes)
  }

  // Track indices at each rank, then the tier boundaries over those ranks.
  const indexWidth = bitsFor(trackCount - 1)
  for (const index of order) {
    if (index < 0 || index >= trackCount) {
      throw new ShareCodeError('Ranking references a track outside the album')
    }
    writer.write(index, indexWidth)
  }
  const cutWidth = bitsFor(n)
  for (const cut of cuts) {
    if (cut < 0 || cut > n) throw new ShareCodeError('Tier boundary falls outside the ranking')
    writer.write(cut, cutWidth)
  }

  if (labelBytes.length > 0) {
    writer.write(labelBytes.length, 6)
    writer.writeBytes(labelBytes)
  }

  const body = writer.finish()
  const full = new Uint8Array(body.length + 1)
  full.set(body)
  full[body.length] = checksum(body)
  return toBase64Url(full)
}

export function decodeRanking(code: string): Ranking {
  let bytes: Uint8Array
  try {
    bytes = fromBase64Url(code)
  } catch {
    throw new ShareCodeError('That does not look like a ranking code')
  }
  if (bytes.length < 6) throw new ShareCodeError('That ranking code is too short to be valid')

  const body = bytes.slice(0, -1)
  if (checksum(body) !== bytes[bytes.length - 1]) {
    throw new ShareCodeError('That ranking link looks truncated or altered')
  }

  const reader = new BitReader(body)
  try {
    const version = reader.read(4)
    if (version < 1 || version > VERSION) {
      throw new ShareCodeError(`This link was made by a newer version (v${version})`)
    }
    const provider = PROVIDER_CODES[reader.read(3)]
    if (!provider) throw new ShareCodeError('Unknown music source in that link')

    const numeric = reader.read(1) === 1
    const hasLabel = reader.read(1) === 1
    const n = reader.read(6)
    // v1 predates skipping tracks, so every album track was in the ranking.
    const trackCount = version >= 2 ? reader.read(6) : n
    const cutCount = reader.read(3)
    const titleHash = reader.read(8)
    if (n === 0) throw new ShareCodeError('That ranking has no tracks')
    if (trackCount < n) throw new ShareCodeError('That ranking code is corrupt')

    const albumId = numeric
      ? String(reader.read(20) * 2 ** 20 + reader.read(20))
      : new TextDecoder().decode(reader.readBytes(reader.read(8)))

    const indexWidth = bitsFor(trackCount - 1)
    const order: number[] = []
    for (let i = 0; i < n; i++) order.push(reader.read(indexWidth))

    const cutWidth = bitsFor(n)
    const cuts: number[] = []
    for (let i = 0; i < cutCount; i++) cuts.push(reader.read(cutWidth))

    const label = hasLabel
      ? new TextDecoder().decode(reader.readBytes(reader.read(6)))
      : undefined

    // Positions must be distinct and inside the album, though not all of them
    // need to appear: a ranking that skipped the skits is a subset.
    const seen = new Set(order)
    if (seen.size !== n || order.some((i) => i >= trackCount)) {
      throw new ShareCodeError('That ranking code is corrupt')
    }

    return { provider, albumId, order, trackCount, cuts, label, titleHash }
  } catch (error) {
    if (error instanceof ShareCodeError) throw error
    throw new ShareCodeError('That ranking code could not be read')
  }
}

/** True when a shared ranking no longer lines up with the album we fetched. */
export function rankingMatchesAlbum(
  ranking: Ranking,
  album: { title: string; tracks: unknown[] },
): boolean {
  // The ranking may cover a subset, so it is the album's own length that has to
  // match — and every position in it must still exist on the record.
  const trackCount = ranking.trackCount ?? ranking.order.length
  if (trackCount !== album.tracks.length) return false
  if (ranking.order.some((index) => index >= album.tracks.length)) return false
  if (!ranking.titleHash) return true
  return ranking.titleHash === hashString(normalizeTitle(album.title))
}
