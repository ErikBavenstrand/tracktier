/** Minimal MSB-first bit packer. Share codes live or die on how tight this is. */

export class BitWriter {
  private bytes: number[] = []
  private current = 0
  private used = 0

  write(value: number, width: number): this {
    if (width < 0 || width > 32) throw new RangeError(`width ${width} out of range`)
    if (value < 0 || value >= 2 ** width) {
      throw new RangeError(`value ${value} does not fit in ${width} bits`)
    }
    for (let i = width - 1; i >= 0; i--) {
      this.current = (this.current << 1) | ((value >>> i) & 1)
      if (++this.used === 8) {
        this.bytes.push(this.current)
        this.current = 0
        this.used = 0
      }
    }
    return this
  }

  writeBytes(values: ArrayLike<number>): this {
    for (let i = 0; i < values.length; i++) this.write(values[i]!, 8)
    return this
  }

  finish(): Uint8Array {
    const out = [...this.bytes]
    if (this.used > 0) out.push(this.current << (8 - this.used))
    return Uint8Array.from(out)
  }
}

export class BitReader {
  private index = 0

  constructor(private readonly data: Uint8Array) {}

  read(width: number): number {
    let value = 0
    for (let i = 0; i < width; i++) {
      const byte = this.data[this.index >>> 3]
      if (byte === undefined) throw new RangeError('Share code ended unexpectedly')
      value = (value * 2) + ((byte >>> (7 - (this.index & 7))) & 1)
      this.index++
    }
    return value
  }

  readBytes(count: number): Uint8Array {
    const out = new Uint8Array(count)
    for (let i = 0; i < count; i++) out[i] = this.read(8)
    return out
  }
}

/** Smallest width that can hold every value in 0..max. */
export function bitsFor(max: number): number {
  let width = 1
  while (2 ** width <= max) width++
  return width
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function toBase64Url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    out += B64URL[a >>> 2]
    out += B64URL[((a & 3) << 4) | ((b ?? 0) >>> 4)]
    if (b === undefined) break
    out += B64URL[((b & 15) << 2) | ((c ?? 0) >>> 6)]
    if (c === undefined) break
    out += B64URL[c & 63]
  }
  return out
}

export function fromBase64Url(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9_-]/g, '')
  const out: number[] = []
  let buffer = 0
  let bits = 0
  for (const char of clean) {
    const value = B64URL.indexOf(char)
    if (value < 0) throw new Error('Share code contains invalid characters')
    buffer = (buffer << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((buffer >>> bits) & 0xff)
    }
  }
  return Uint8Array.from(out)
}

/** FNV-1a, truncated to a byte. Catches links truncated by chat clients. */
export function checksum(bytes: Uint8Array): number {
  let hash = 0x811c9dc5
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return (hash ^ (hash >>> 16) ^ (hash >>> 8)) & 0xff
}

export function hashString(value: string): number {
  return checksum(new TextEncoder().encode(value))
}
