import { describe, expect, it } from 'vitest'
import { thumbnailOf } from '../palette'

describe('asking a CDN for a smaller sleeve', () => {
  it('rewrites a Deezer cover', () => {
    expect(
      thumbnailOf(
        'https://cdn-images.dzcdn.net/images/cover/ec3c8ed/1000x1000-000000-80-0-0.jpg',
      ),
    ).toBe('https://cdn-images.dzcdn.net/images/cover/ec3c8ed/64x64-000000-80-0-0.jpg')
  })

  it('rewrites an Apple artwork url', () => {
    expect(thumbnailOf('https://is1-ssl.mzstatic.com/image/thumb/x/1000x1000bb.jpg')).toBe(
      'https://is1-ssl.mzstatic.com/image/thumb/x/64x64bb.jpg',
    )
  })

  it('leaves a url it does not recognise alone', () => {
    const odd = 'https://example.com/cover.png'
    expect(thumbnailOf(odd)).toBe(odd)
  })

  it('does not touch a size that is already small', () => {
    // Nothing is gained by rewriting, but nothing may break either.
    const small = 'https://cdn-images.dzcdn.net/images/cover/x/56x56-000000-80-0-0.jpg'
    expect(thumbnailOf(small)).toBe(
      'https://cdn-images.dzcdn.net/images/cover/x/64x64-000000-80-0-0.jpg',
    )
  })

  it('rewrites only the size segment, not a number in the hash', () => {
    const url = 'https://cdn-images.dzcdn.net/images/cover/100x100abc/500x500-000000-80-0-0.jpg'
    expect(thumbnailOf(url)).toBe(
      'https://cdn-images.dzcdn.net/images/cover/100x100abc/64x64-000000-80-0-0.jpg',
    )
  })
})
