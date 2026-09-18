import type { Track } from './providers/types'

/**
 * Guessing which entries are not really songs.
 *
 * No catalogue says so. Deezer types every entry as "track", and the fields
 * that exist do not separate them — the 34-second "Intro" on The College
 * Dropout reports a perfectly ordinary 120.2 bpm, and popularity rank is no
 * help either: its skits score 320–404k against real tracks at 325–576k.
 *
 * So this is inference, and it is offered rather than applied. Two signals:
 *
 *  - The title says so. Precise when it hits, but it misses plenty — "Lil
 *    Jimmy Skit" announces itself, "I'll Fly Away" does not.
 *  - The track is short *for its own album*. An absolute cut cannot work:
 *    Napalm Death's Scum has a median length of 66 seconds and two thirds of it
 *    under 90, while "You Suffer" is 5 seconds of real song. Measuring against
 *    the album's own median adapts to a record of two-minute punk songs or one
 *    of eight-minute epics.
 *
 * Both still misfire — Abbey Road's "Her Majesty" is 25 seconds and entirely a
 * song — which is exactly why the listener gets the final say.
 */

const TITLE_HINT =
  /\b(skit|interlude|intro|outro|segue|prelude|intermission|announcement|commentary|voicemail|dialogue)\b/i

/**
 * Short enough, relative to the album's median, to look like filler.
 *
 * Tuned down from 0.4, which flagged Napalm Death's 23-second "The Kill" as a
 * skit. At a third of the median the real skits are still caught — most of them
 * announce themselves in the title anyway — and short songs survive.
 */
const SHORT_RATIO = 0.33
/** Never flag anything past this, however long the album's songs run. */
const ABSOLUTE_CEILING_MS = 105_000

export type InterludeReason = 'title' | 'length'

export interface Interlude {
  id: string
  reason: InterludeReason
}

function medianDuration(tracks: Track[]): number {
  const durations = tracks
    .map((track) => track.durationMs)
    .filter((ms) => ms > 0)
    .sort((a, b) => a - b)
  if (durations.length === 0) return 0
  const middle = Math.floor(durations.length / 2)
  return durations.length % 2 === 0
    ? ((durations[middle - 1] ?? 0) + (durations[middle] ?? 0)) / 2
    : (durations[middle] ?? 0)
}

export function findInterludes(tracks: Track[]): Interlude[] {
  if (tracks.length < 4) return []

  const median = medianDuration(tracks)
  const found: Interlude[] = []

  for (const track of tracks) {
    if (TITLE_HINT.test(track.title)) {
      found.push({ id: track.id, reason: 'title' })
      continue
    }
    const short =
      median > 0 &&
      track.durationMs > 0 &&
      track.durationMs < median * SHORT_RATIO &&
      track.durationMs < ABSOLUTE_CEILING_MS
    if (short) found.push({ id: track.id, reason: 'length' })
  }

  // Never propose gutting the record. If most of it looks like filler the
  // heuristic has misread the album, not found twelve skits.
  return found.length > tracks.length / 2 ? [] : found
}

export const reasonLabel = (reason: InterludeReason): string =>
  reason === 'title' ? 'title suggests an interlude' : 'much shorter than the rest'
