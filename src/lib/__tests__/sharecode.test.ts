import { describe, expect, it } from 'vitest'
import { BitWriter, bitsFor, checksum, toBase64Url } from '../bits'
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

describe('rankings that skip tracks', () => {
  it('round-trips a subset of a longer album', () => {
    // Nine of a 21-track album, the skits left out.
    const order = [1, 3, 5, 6, 7, 8, 11, 17, 20]
    const decoded = decodeRanking(
      encodeRanking({ provider: 'deezer', albumId: '119606', order, trackCount: 21, cuts: [2, 5] }),
    )
    expect(decoded.order).toEqual(order)
    expect(decoded.trackCount).toBe(21)
  })

  it('keeps indices that run past the ranked count', () => {
    // The whole point: position 20 has to survive in a ranking of nine.
    const decoded = decodeRanking(
      encodeRanking({ provider: 'deezer', albumId: '1', order: [20, 0], trackCount: 21, cuts: [] }),
    )
    expect(decoded.order).toEqual([20, 0])
  })

  it('refuses a position that is not on the album', () => {
    expect(() =>
      encodeRanking({ provider: 'deezer', albumId: '1', order: [0, 25], trackCount: 21, cuts: [] }),
    ).toThrow(ShareCodeError)
  })

  it('still reads codes written before subsets existed', () => {
    // A v1 code, built by hand exactly as the old encoder wrote them.
    const order = [2, 0, 3, 1]
    const writer = new BitWriter()
    writer.write(1, 4)           // version
    writer.write(0, 3)           // deezer
    writer.write(1, 1)           // numeric id
    writer.write(0, 1)           // no label
    writer.write(order.length, 6)
    writer.write(1, 3)           // one cut
    writer.write(0, 8)           // no title hash
    writer.write(0, 20)
    writer.write(51001312 % 2 ** 20, 20)
    for (const index of order) writer.write(index, bitsFor(order.length - 1))
    writer.write(2, bitsFor(order.length))
    const body = writer.finish()
    const full = new Uint8Array(body.length + 1)
    full.set(body)
    full[body.length] = checksum(body)

    const decoded = decodeRanking(toBase64Url(full))
    expect(decoded.order).toEqual(order)
    expect(decoded.trackCount).toBe(4)
    expect(decoded.cuts).toEqual([2])
  })

  it('a subset code stays short enough to paste', () => {
    const code = encodeRanking({
      provider: 'deezer', albumId: '119606',
      order: [0, 2, 4, 6, 8, 10, 12, 14], trackCount: 21, cuts: [2, 5],
    })
    expect(code.length).toBeLessThan(40)
  })
})
