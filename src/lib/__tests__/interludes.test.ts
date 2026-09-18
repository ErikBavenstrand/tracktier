import { describe, expect, it } from 'vitest'
import { findInterludes } from '../interludes'
import type { Track } from '../providers/types'

const track = (title: string, seconds: number, id = title): Track => ({
  id,
  title,
  durationMs: seconds * 1000,
  trackNumber: 1,
  discNumber: 1,
  previewUrl: null,
  externalUrl: null,
  explicit: false,
})

/** Real durations from Kanye West — The College Dropout. */
const collegeDropout = [
  track('Intro', 19), track("We Don't Care", 239), track('Graduation Day', 81),
  track('All Falls Down', 223), track("I'll Fly Away", 69), track('Spaceship', 324),
  track('Jesus Walks', 193), track('Never Let Me Down', 324), track('Get Em High', 289),
  track('Workout Plan', 46), track('The New Workout Plan', 322), track('Slow Jamz', 316),
  track('Breathe In Breathe Out', 246), track('School Spirit Skit 1', 78),
  track('School Spirit', 182), track('School Spirit Skit 2', 43),
  track('Lil Jimmy Skit', 53), track('Two Words', 266), track('Through The Wire', 221),
  track('Family Business', 278), track('Last Call', 761),
]

/** Real durations from Napalm Death — Scum, where short songs are the point. */
const scum = [
  track('Multinational Corporations', 62), track('Instinct of Survival', 111),
  track('The Kill', 23), track('Scum', 95), track('Caught in a Dream', 82),
  track('Polluted Minds', 71), track('Sacrificed', 47), track('Siege of Power', 245),
  track('Control', 91), track('Born on Your Knees', 87), track('Human Garbage', 65),
  track('You Suffer', 5), track('Life?', 44), track('Prison Without Walls', 38),
]

describe('spotting interludes', () => {
  it('finds the skits on an album that has them', () => {
    const flagged = findInterludes(collegeDropout).map((i) => i.id)
    expect(flagged).toContain('Intro')
    expect(flagged).toContain('School Spirit Skit 1')
    expect(flagged).toContain('School Spirit Skit 2')
    expect(flagged).toContain('Lil Jimmy Skit')
    expect(flagged).toContain('Workout Plan')
  })

  it('leaves the actual songs alone', () => {
    const flagged = findInterludes(collegeDropout).map((i) => i.id)
    for (const keep of ['Slow Jamz', 'Jesus Walks', 'Through The Wire', 'School Spirit']) {
      expect(flagged, keep).not.toContain(keep)
    }
  })

  it('does not gut an album of genuinely short songs', () => {
    // Median here is ~68s, so an absolute cut would flag most of the record.
    const flagged = findInterludes(scum).map((i) => i.id)
    expect(flagged.length).toBeLessThan(3)
    expect(flagged).not.toContain('The Kill')
    expect(flagged).not.toContain('Polluted Minds')
    // "You Suffer" is 5 seconds and genuinely a song, so it does get flagged.
    // Nothing in the data can separate it from a 5-second skit, which is the
    // reason these are proposals the listener overrules rather than a filter.
    expect(flagged).toContain('You Suffer')
  })

  it('flags nothing on an album with none', () => {
    const discovery = [
      track('One More Time', 320), track('Aerodynamic', 212), track('Digital Love', 301),
      track('Harder Better Faster Stronger', 224), track('Crescendolls', 211),
      track('Nightvision', 104), track('Superheroes', 237), track('High Life', 201),
      track('Something About Us', 231), track('Voyager', 227), track('Veridis Quo', 344),
      track('Short Circuit', 206), track('Face to Face', 240), track('Too Long', 600),
    ]
    expect(findInterludes(discovery)).toHaveLength(0)
  })

  it('gives up rather than proposing to remove most of the album', () => {
    const allShort = Array.from({ length: 10 }, (_, i) => track(`Skit ${i}`, 30, `s${i}`))
    expect(findInterludes(allShort)).toHaveLength(0)
  })

  it('ignores albums too small to have a meaningful median', () => {
    expect(findInterludes([track('A', 200), track('Intro', 10)])).toHaveLength(0)
  })
})
