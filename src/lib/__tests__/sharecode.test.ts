import { describe, expect, it } from 'vitest'
import { decodeRanking, encodeRanking, ShareCodeError, type Ranking } from '../sharecode'

const shuffled = (n: number, seed = 7) => {
  const order = Array.from({ length: n }, (_, i) => i)
  let state = seed
  for (let i = n - 1; i > 0; i--) {
    state = (state * 1103515245 + 12345) % 2 ** 31
    const j = state % (i + 1)
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  return order
}

describe('share codes', () => {
  it('round-trips a ranking', () => {
    const ranking: Ranking = {
      provider: 'deezer',
      albumId: '51001312',
      order: shuffled(8),
      cuts: [2, 4, 6],
      label: 'Erik',
    }
    const decoded = decodeRanking(encodeRanking(ranking, 'Master Of Puppets'))
    expect(decoded.provider).toBe('deezer')
    expect(decoded.albumId).toBe('51001312')
    expect(decoded.order).toEqual(ranking.order)
    expect(decoded.cuts).toEqual(ranking.cuts)
    expect(decoded.label).toBe('Erik')
  })

  it('handles the largest numeric ids and a full-length album', () => {
    const ranking: Ranking = {
      provider: 'itunes',
      albumId: '1440857781',
      order: shuffled(63, 99),
      cuts: [5, 15, 30, 45],
    }
    const decoded = decodeRanking(encodeRanking(ranking))
    expect(decoded.albumId).toBe('1440857781')
    expect(decoded.order).toEqual(ranking.order)
  })

  it('carries non-numeric Spotify ids', () => {
    const ranking: Ranking = {
      provider: 'spotify',
      albumId: '2Lq2qX3hYhiuPckC8Flj21',
      order: [2, 0, 1],
      cuts: [1],
    }
    expect(decodeRanking(encodeRanking(ranking)).albumId).toBe('2Lq2qX3hYhiuPckC8Flj21')
  })

  it('keeps a 20-track code short enough to paste', () => {
    const code = encodeRanking(
      { provider: 'deezer', albumId: '51001312', order: shuffled(20), cuts: [2, 6, 12, 16] },
      'Some Album',
    )
    expect(code.length).toBeLessThan(45)
  })

  it('preserves unicode labels', () => {
    const code = encodeRanking({
      provider: 'deezer', albumId: '123', order: [0, 1], cuts: [1], label: 'Åsa 🎧',
    })
    expect(decodeRanking(code).label).toBe('Åsa 🎧')
  })

  it('rejects a truncated link', () => {
    const code = encodeRanking({ provider: 'deezer', albumId: '51001312', order: shuffled(12), cuts: [3, 7] })
    expect(() => decodeRanking(code.slice(0, -2))).toThrow(ShareCodeError)
  })

  it('rejects an altered link', () => {
    const code = encodeRanking({ provider: 'deezer', albumId: '51001312', order: shuffled(12), cuts: [3, 7] })
    const tampered = code.slice(0, 3) + (code[3] === 'A' ? 'B' : 'A') + code.slice(4)
    expect(() => decodeRanking(tampered)).toThrow(ShareCodeError)
  })

  it('rejects junk', () => {
    expect(() => decodeRanking('not-a-code')).toThrow(ShareCodeError)
    expect(() => decodeRanking('')).toThrow(ShareCodeError)
  })

  it('survives every album length we allow', () => {
    for (let n = 1; n <= 63; n++) {
      const order = shuffled(n, n)
      const code = encodeRanking({ provider: 'deezer', albumId: '51001312', order, cuts: [] })
      expect(decodeRanking(code).order, `n=${n}`).toEqual(order)
    }
  })
})
