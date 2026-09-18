import { describe, expect, it } from 'vitest'
import { ensureDistinctTitles } from '../providers/types'
import type { Track } from '../providers/types'

const track = (title: string, trackNumber: number, id = `t${trackNumber}`): Track => ({
  id, title, durationMs: 200_000, trackNumber, discNumber: 1,
  previewUrl: null, externalUrl: null, explicit: false,
})

describe('distinct track titles', () => {
  it('falls back to the fuller title when tidied ones collide', () => {
    // Real case: Get Rich Or Die Tryin' has the original and the Snoop remix,
    // and Deezer's title_short renders both as "P.I.M.P.".
    const full: Record<string, string> = {
      t11: 'P.I.M.P.',
      t20: 'P.I.M.P. (Snoop Dogg Remix)',
    }
    const out = ensureDistinctTitles(
      [track('P.I.M.P.', 11), track('P.I.M.P.', 20)],
      (t) => full[t.id],
    )
    expect(out.map((t) => t.title)).toEqual(['P.I.M.P.', 'P.I.M.P. (Snoop Dogg Remix)'])
  })

  it('leaves already-distinct titles untouched', () => {
    const input = [track('In Da Club', 5), track('Wanksta', 17)]
    expect(ensureDistinctTitles(input, () => 'ignored')).toEqual(input)
  })

  it('appends the position when even the full titles match', () => {
    const out = ensureDistinctTitles([track('Untitled', 3), track('Untitled', 9)])
    expect(out.map((t) => t.title)).toEqual(['Untitled (3)', 'Untitled (9)'])
  })

  it('handles three-way collisions', () => {
    const out = ensureDistinctTitles([track('Skit', 2), track('Skit', 6), track('Skit', 11)])
    expect(new Set(out.map((t) => t.title)).size).toBe(3)
  })

  it('ignores case and stray whitespace when deciding', () => {
    const out = ensureDistinctTitles([track('Heat', 7), track(' heat ', 12)])
    expect(new Set(out.map((t) => t.title.trim())).size).toBe(2)
  })
})
