import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authorId, isOwnCode, loadLibrary, saveRanking, type SavedRanking } from '../storage'

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
