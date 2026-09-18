import { DEFAULT_TIERS } from './tiers'

/**
 * Render the tier list to a PNG on a canvas.
 *
 * A link is the real sharing primitive here, but links die in screenshots-only
 * places. This gives the ranking a form that survives Instagram and group
 * chats, and it is drawn rather than screenshotted so the output is crisp.
 */

export interface ExportInput {
  albumTitle: string
  albumArtist: string
  albumCover: string | null
  /** Track titles per tier, best tier first. */
  tiers: string[][]
  label?: string
  accent: string
  footer: string
}

const WIDTH = 1080
const PADDING = 56
const ROW_GAP = 14
const BADGE = 92

const font = (size: number, weight = 700) =>
  `${weight} ${size}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

const loadImage = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })

/** Lay out chips into rows, returning the height the tier needs. */
function layoutChips(
  ctx: CanvasRenderingContext2D,
  titles: string[],
  maxWidth: number,
): { lines: { text: string; width: number }[][]; height: number } {
  ctx.font = font(23, 600)
  const chipPadding = 17
  const chipHeight = 46
  const gap = 9
  const lines: { text: string; width: number }[][] = [[]]
  let used = 0

  for (const title of titles) {
    let text = title
    let width = ctx.measureText(text).width + chipPadding * 2
    // Clip a title that could never fit on a line of its own.
    while (width > maxWidth && text.length > 4) {
      text = `${text.slice(0, -2).trimEnd()}…`
      width = ctx.measureText(text).width + chipPadding * 2
    }
    if (used > 0 && used + width > maxWidth) {
      lines.push([])
      used = 0
    }
    lines[lines.length - 1]!.push({ text, width })
    used += width + gap
  }

  const rows = Math.max(1, lines.filter((line) => line.length > 0).length)
  return { lines, height: Math.max(BADGE, rows * chipHeight + (rows - 1) * gap + 20) }
}

export async function renderTierImage(input: ExportInput): Promise<Blob | null> {
  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) return null

  const contentWidth = WIDTH - PADDING * 2
  const chipArea = contentWidth - BADGE - 18

  // Measure first so the canvas is exactly as tall as the content needs.
  const layouts = input.tiers.map((titles) => layoutChips(probe, titles, chipArea))
  const headerHeight = 232
  const footerHeight = 92
  const bodyHeight = layouts.reduce((sum, l) => sum + l.height + ROW_GAP, 0)
  const height = headerHeight + bodyHeight + footerHeight

  const canvas = document.createElement('canvas')
  const scale = 2
  canvas.width = WIDTH * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(scale, scale)

  ctx.fillStyle = '#08080a'
  ctx.fillRect(0, 0, WIDTH, height)

  const glow = ctx.createRadialGradient(WIDTH / 2, 0, 0, WIDTH / 2, 0, WIDTH * 0.8)
  glow.addColorStop(0, `hsl(${input.accent} / 26%)`)
  glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, WIDTH, height * 0.6)

  // ------------------------------------------------------------- header
  const cover = input.albumCover ? await loadImage(input.albumCover) : null
  const artSize = 148
  if (cover) {
    ctx.save()
    roundRect(ctx, PADDING, PADDING, artSize, artSize, 12)
    ctx.clip()
    ctx.drawImage(cover, PADDING, PADDING, artSize, artSize)
    ctx.restore()
  }

  const textX = PADDING + (cover ? artSize + 28 : 0)
  ctx.fillStyle = `hsl(${input.accent})`
  ctx.font = font(19, 800)
  ctx.fillText('TIER LIST', textX, PADDING + 24)

  ctx.fillStyle = '#f3f3f4'
  ctx.font = font(46, 900)
  let title = input.albumTitle
  while (ctx.measureText(title).width > WIDTH - textX - PADDING && title.length > 6) {
    title = `${title.slice(0, -2).trimEnd()}…`
  }
  ctx.fillText(title, textX, PADDING + 78)

  ctx.fillStyle = '#a7a7b0'
  ctx.font = font(26, 500)
  ctx.fillText(input.albumArtist, textX, PADDING + 116)

  if (input.label) {
    ctx.fillStyle = '#6e6e78'
    ctx.font = font(21, 600)
    ctx.fillText(`ranked by ${input.label}`, textX, PADDING + 150)
  }

  // -------------------------------------------------------------- tiers
  let y = headerHeight
  input.tiers.forEach((_titles, index) => {
    const layout = layouts[index]!
    const tier = DEFAULT_TIERS[index] ?? DEFAULT_TIERS[DEFAULT_TIERS.length - 1]!
    const rowHeight = layout.height

    ctx.fillStyle = '#121215'
    roundRect(ctx, PADDING, y, contentWidth, rowHeight, 14)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Tier badge, hue-shifted off the album's own accent.
    const [h, s, l] = input.accent.split(' ')
    const badgeHue = (Number.parseFloat(h ?? '0') + tier.hue) % 360
    ctx.fillStyle = `hsl(${badgeHue} ${s ?? '70%'} ${l ?? '50%'})`
    roundRect(ctx, PADDING + 8, y + 8, BADGE - 16, rowHeight - 16, 10)
    ctx.fill()

    ctx.fillStyle = '#08080a'
    ctx.font = font(40, 900)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(tier.label, PADDING + BADGE / 2, y + rowHeight / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    let chipY = y + 10
    for (const line of layout.lines) {
      if (line.length === 0) continue
      let chipX = PADDING + BADGE + 10
      for (const chip of line) {
        ctx.fillStyle = '#1f1f26'
        roundRect(ctx, chipX, chipY, chip.width, 46, 10)
        ctx.fill()
        ctx.fillStyle = '#f3f3f4'
        ctx.font = font(23, 600)
        ctx.fillText(chip.text, chipX + 17, chipY + 30)
        chipX += chip.width + 9
      }
      chipY += 55
    }

    y += rowHeight + ROW_GAP
  })

  // ------------------------------------------------------------- footer
  ctx.fillStyle = '#6e6e78'
  ctx.font = font(20, 600)
  ctx.fillText(input.footer, PADDING, height - 44)

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
