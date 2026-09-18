/**
 * Pull an accent colour out of the cover art so every album themes itself.
 *
 * Both Deezer's and Apple's image CDNs send `Access-Control-Allow-Origin: *`,
 * so the canvas stays untainted and the pixels are readable. Anything that goes
 * wrong falls back to the house colour rather than surfacing an error.
 */

export interface Palette {
  /** `H S% L%` triples, ready to drop into a CSS colour function. */
  accent: string
  accentSoft: string
  glow: string
}

export const DEFAULT_PALETTE: Palette = {
  accent: '162 73% 46%',
  accentSoft: '162 40% 22%',
  glow: '162 73% 46%',
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  if (max === min) return [0, 0, lightness * 100]

  const delta = max - min
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let hue: number
  if (max === red) hue = ((green - blue) / delta + (green < blue ? 6 : 0)) / 6
  else if (max === green) hue = ((blue - red) / delta + 2) / 6
  else hue = ((red - green) / delta + 4) / 6

  return [hue * 360, saturation * 100, lightness * 100]
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load ${src}`))
    image.src = src
  })

export async function paletteFromImage(src: string | null): Promise<Palette> {
  if (!src) return DEFAULT_PALETTE
  try {
    const image = await loadImage(src)
    const size = 32
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return DEFAULT_PALETTE
    context.drawImage(image, 0, 0, size, size)
    const { data } = context.getImageData(0, 0, size, size)

    // Bucket by hue and keep the most saturated, weighting by how much of the
    // sleeve it covers. Near-greys are skipped: a mostly-black cover should not
    // theme the page black.
    const buckets = new Map<number, { count: number; h: number; s: number; l: number }>()
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i + 3] ?? 0) < 128) continue
      const [h, s, l] = rgbToHsl(data[i]!, data[i + 1]!, data[i + 2]!)
      if (s < 18 || l < 12 || l > 92) continue
      const key = Math.round(h / 15)
      const bucket = buckets.get(key) ?? { count: 0, h: 0, s: 0, l: 0 }
      bucket.count++
      bucket.h += h
      bucket.s += s
      bucket.l += l
      buckets.set(key, bucket)
    }

    let best: { score: number; h: number; s: number; l: number } | null = null
    for (const bucket of buckets.values()) {
      const h = bucket.h / bucket.count
      const s = bucket.s / bucket.count
      const l = bucket.l / bucket.count
      // Favour colours that are both common and vivid.
      const score = bucket.count * (0.4 + s / 100)
      if (!best || score > best.score) best = { score, h, s, l }
    }
    if (!best) return DEFAULT_PALETTE

    // Force the accent into a range that stays legible on a near-black page.
    const hue = Math.round(best.h)
    const saturation = Math.round(Math.min(85, Math.max(45, best.s)))
    const lightness = Math.round(Math.min(62, Math.max(46, best.l)))

    return {
      accent: `${hue} ${saturation}% ${lightness}%`,
      accentSoft: `${hue} ${Math.round(saturation * 0.6)}% 20%`,
      glow: `${hue} ${saturation}% ${Math.min(70, lightness + 8)}%`,
    }
  } catch {
    return DEFAULT_PALETTE
  }
}

export function applyPalette(palette: Palette): void {
  const root = document.documentElement
  root.style.setProperty('--accent-hsl', palette.accent)
  root.style.setProperty('--accent-soft-hsl', palette.accentSoft)
  root.style.setProperty('--glow-hsl', palette.glow)
}
