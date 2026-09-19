import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  authorId,
  isOwnCode,
  loadLibrary,
  saveRanking,
  unfinishedSessions,
  type LibraryAlbum,
  type SavedRanking,
  type StoredSession,
} from '../storage'

// storage.ts talks to localStorage directly; a Map is all it needs from one.
beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
})

const ALBUM = {
  provider: 'deezer' as const,
  albumId: '103248',
  title: 'The Eminem Show',
  artist: 'Eminem',
  cover: null,
  trackCount: 3,
  trackTitles: [],
}

const ranking = (over: Partial<SavedRanking> = {}): SavedRanking => ({
  label: 'Isak',
  code: 'code-a',
  order: [0, 1, 2],
  cuts: [1],
  savedAt: 1,
  mine: false,
  ...over,
})

const rankingsOf = () => loadLibrary()[0]?.rankings ?? []

describe('who a ranking belongs to', () => {
  it('replaces a person’s earlier ranking of the same album', () => {
    saveRanking(ALBUM, ranking({ author: 7, mine: true, order: [0, 1, 2] }))
    saveRanking(ALBUM, ranking({ author: 7, mine: true, code: 'code-b', order: [2, 1, 0] }))

    expect(rankingsOf()).toHaveLength(1)
    expect(rankingsOf()[0]!.order).toEqual([2, 1, 0])
  })

  it('keeps two different people who share a name apart', () => {
    saveRanking(ALBUM, ranking({ author: 7, mine: true }))
    saveRanking(ALBUM, ranking({ author: 99, code: 'code-b' }))

    expect(rankingsOf().map((item) => item.label)).toEqual(['Isak', 'Isak (2)'])
    expect(rankingsOf().map((item) => item.author)).toEqual([7, 99])
  })

  it('never lets an import overwrite a ranking you made', () => {
    saveRanking(ALBUM, ranking({ mine: true, order: [0, 1, 2] }))
    saveRanking(ALBUM, ranking({ mine: false, code: 'code-b', order: [2, 1, 0] }))

    const mine = rankingsOf().find((item) => item.mine)
    expect(rankingsOf()).toHaveLength(2)
    expect(mine?.order).toEqual([0, 1, 2])
  })

  it('still updates your own ranking in place without an author id', () => {
    saveRanking(ALBUM, ranking({ mine: true, order: [0, 1, 2] }))
    saveRanking(ALBUM, ranking({ mine: true, code: 'code-b', order: [2, 1, 0] }))

    expect(rankingsOf()).toHaveLength(1)
    expect(rankingsOf()[0]!.order).toEqual([2, 1, 0])
  })

  it('numbers a third namesake rather than reusing the second', () => {
    saveRanking(ALBUM, ranking({ author: 1, mine: true }))
    saveRanking(ALBUM, ranking({ author: 2, code: 'b' }))
    saveRanking(ALBUM, ranking({ author: 3, code: 'c' }))

    expect(rankingsOf().map((item) => item.label)).toEqual(['Isak', 'Isak (2)', 'Isak (3)'])
  })

  it('ignores a ranking with no name', () => {
    saveRanking(ALBUM, ranking({ label: '   ' }))
    expect(loadLibrary()).toHaveLength(0)
  })
})

describe('recognising your own link', () => {
  it('knows your own code by its author, with an empty library', () => {
    const me = authorId()
    expect(isOwnCode('deezer', '103248', 'any-code', me)).toBe(true)
    expect(isOwnCode('deezer', '103248', 'any-code', me + 1)).toBe(false)
  })

  it('mints one author id and then keeps it', () => {
    expect(authorId()).toBe(authorId())
  })

  it('falls back to the library for links made before authors existed', () => {
    authorId()
    saveRanking(ALBUM, ranking({ mine: true, code: 'mine-code' }))
    expect(isOwnCode('deezer', '103248', 'mine-code')).toBe(true)
    expect(isOwnCode('deezer', '103248', 'someone-elses')).toBe(false)
  })
})

describe('bulk imports from a comparison link', () => {
  it('will not swap a newer ranking for the copy inside somebody else’s link', () => {
    saveRanking(ALBUM, ranking({ author: 7, mine: true, code: 'fresh', order: [2, 1, 0] }))
    // The same author, but the older code a week-old compare link still carries.
    saveRanking(ALBUM, ranking({ author: 7, code: 'stale', order: [0, 1, 2] }), false)

    expect(rankingsOf()).toHaveLength(1)
    expect(rankingsOf()[0]!.code).toBe('fresh')
  })

  it('still adds people it has never seen', () => {
    saveRanking(ALBUM, ranking({ author: 7, mine: true }))
    saveRanking(ALBUM, ranking({ label: 'Maja', author: 8, code: 'b' }), false)

    expect(rankingsOf().map((item) => item.label)).toEqual(['Isak', 'Maja'])
  })

  it('is a no-op when the exact ranking is already held', () => {
    saveRanking(ALBUM, ranking({ author: 7, code: 'same' }))
    saveRanking(ALBUM, ranking({ author: 7, code: 'same' }), false)

    expect(rankingsOf()).toHaveLength(1)
  })
})

describe('which of two codes from one person wins', () => {
  it('refuses an older dated ranking even on a direct import', () => {
    saveRanking(ALBUM, ranking({ author: 7, code: 'fresh', stamp: 500, order: [2, 1, 0] }))
    saveRanking(ALBUM, ranking({ author: 7, code: 'stale', stamp: 494, order: [0, 1, 2] }))

    expect(rankingsOf()).toHaveLength(1)
    expect(rankingsOf()[0]!.code).toBe('fresh')
  })

  it('takes a newer dated ranking even in a bulk import', () => {
    saveRanking(ALBUM, ranking({ author: 7, code: 'old', stamp: 494 }))
    saveRanking(ALBUM, ranking({ author: 7, code: 'new', stamp: 500 }), false)

    expect(rankingsOf()).toHaveLength(1)
    expect(rankingsOf()[0]!.code).toBe('new')
  })

  it('keeps the same-day ranking that arrived last', () => {
    saveRanking(ALBUM, ranking({ author: 7, code: 'morning', stamp: 500, order: [0, 1, 2] }))
    saveRanking(ALBUM, ranking({ author: 7, code: 'evening', stamp: 500, order: [2, 1, 0] }))

    expect(rankingsOf()).toHaveLength(1)
    expect(rankingsOf()[0]!.code).toBe('evening')
  })

  it('still will not guess when only one side is dated', () => {
    saveRanking(ALBUM, ranking({ author: 7, code: 'undated', mine: true }))
    saveRanking(ALBUM, ranking({ author: 7, code: 'dated', stamp: 500 }), false)

    // Nothing here establishes an order, so the bulk import defers.
    expect(rankingsOf()[0]!.code).toBe('undated')
  })
})

describe('what still needs finishing', () => {
  const session = (over: Partial<StoredSession> = {}): StoredSession => ({
    provider: 'deezer',
    albumId: '103248',
    code: 'a-code',
    comparisons: 19,
    updatedAt: 1,
    sort: {
      phase: 'placing',
      placed: ['a', 'b'],
      queue: ['c'],
      current: 'd',
      lo: 0,
      hi: 0,
      cursor: 0,
      bubble: 0,
      refineBudget: 0,
      refined: false,
      comparisons: 19,
      history: [],
    },
    ...over,
  })

  const shelf = (codes: string[]): LibraryAlbum[] => [
    {
      provider: 'deezer',
      albumId: '103248',
      title: 'The Eminem Show',
      artist: 'Eminem',
      cover: null,
      trackCount: 3,
      trackTitles: [],
      updatedAt: 1,
      rankings: codes.map((code) => ({
        label: 'Isak',
        code,
        order: [0],
        cuts: [],
        savedAt: 1,
        mine: true,
      })),
    },
  ]

  const finished = { ...session().sort!, current: null, queue: [] }

  it('drops a session whose ranking has been kept', () => {
    // The bug: finishing and naming a ranking left its session behind, so the
    // album showed up twice — once named, once as "Continue ranking".
    expect(unfinishedSessions([session({ code: 'kept' })], shelf(['kept']))).toEqual([])
  })

  it('keeps one still mid-sort even when other rankings are saved', () => {
    const rows = unfinishedSessions([session({ code: 'live' })], shelf(['something-else']))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.done).toBe(false)
  })

  it('keeps a finished ranking that was never named, and says so', () => {
    const rows = unfinishedSessions([session({ code: 'unnamed', sort: finished })], shelf([]))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.done).toBe(true)
  })

  it('shows a re-rank that supersedes what is saved', () => {
    // Sharpening produces a new code; the library still holds the old one.
    const rows = unfinishedSessions([session({ code: 'sharpened' })], shelf(['original']))
    expect(rows).toHaveLength(1)
  })

  it('ignores a session with no sort in it', () => {
    expect(unfinishedSessions([session({ sort: undefined })], shelf([]))).toEqual([])
  })
})
