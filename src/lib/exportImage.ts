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
  trackCount: number
  label?: string
  accent: string
  /** Where to find the app, since a picture cannot be clicked. */
  home: string
}

const WIDTH = 1080
const PADDING = 56
const ROW_GAP = 14
const BADGE = 92
const CHIP_H = 52
const CHIP_GAP = 10
const CHIP_PAD = 18

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

interface Chip {
  /** Overall position in the ranking, not within the tier. */
  rank: number
  text: string
  width: number
}

/**
 * Lay out chips into rows, returning the height the tier needs.
 *
 * Each line records its slack so the draw pass can share it out between the
 * chips on it. Left-packed rows left a ragged gutter down the right of the
 * whole image — three chips in the S tier and half the width empty — which
 * read as an unfinished layout rather than a short tier.
 */
function layoutChips(
  ctx: CanvasRenderingContext2D,
  titles: string[],
  firstRank: number,
  maxWidth: number,
): { lines: { chips: Chip[]; slack: number }[]; height: number } {
  const lines: { chips: Chip[]; slack: number }[] = [{ chips: [], slack: 0 }]
  let used = 0

  titles.forEach((title, index) => {
    const rank = firstRank + index
    ctx.font = font(21, 800)
    const numberWidth = ctx.measureText(String(rank)).width + 12
    ctx.font = font(23, 600)

    let text = title
    const widthOf = (value: string) =>
      ctx.measureText(value).width + numberWidth + CHIP_PAD * 2
    let width = widthOf(text)
    // Clip a title that could never fit on a line of its own.
    while (width > maxWidth && text.length > 4) {
      text = `${text.slice(0, -2).trimEnd()}…`
      width = widthOf(text)
    }
    if (used > 0 && used + width > maxWidth) {
      lines[lines.length - 1]!.slack = maxWidth - (used - CHIP_GAP)
      lines.push({ chips: [], slack: 0 })
      used = 0
    }
    lines[lines.length - 1]!.chips.push({ rank, text, width })
    used += width + CHIP_GAP
  })

  const last = lines[lines.length - 1]!
  last.slack = last.chips.length > 0 ? maxWidth - (used - CHIP_GAP) : 0

  const rows = Math.max(1, lines.filter((line) => line.chips.length > 0).length)
  return { lines, height: Math.max(BADGE, rows * CHIP_H + (rows - 1) * CHIP_GAP + 20) }
}

export async function renderTierImage(input: ExportInput): Promise<Blob | null> {
  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) return null

  const contentWidth = WIDTH - PADDING * 2
  const chipArea = contentWidth - BADGE - 18

  // Measure first so the canvas is exactly as tall as the content needs.
  let counted = 0
  const layouts = input.tiers.map((titles) => {
    const layout = layoutChips(probe, titles, counted + 1, chipArea)
    counted += titles.length
    return layout
  })
  const headerHeight = 296
  const footerHeight = 116
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

  const cover = input.albumCover ? await loadImage(input.albumCover) : null

  // The sleeve, blurred, as the backdrop. A flat accent glow gave every album
  // the same picture; this one is recognisably the record it belongs to.
  if (cover) {
    // Clipped to the band the fade covers. Unclipped, a 64px blur of a
    // 1188px square reached most of the way down the picture and hazed the
    // edges of every tier row below the header.
    const band = headerHeight + 150
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, WIDTH, band)
    ctx.clip()
    ctx.filter = 'blur(64px)'
    ctx.globalAlpha = 0.5
    const spread = WIDTH * 1.1
    ctx.drawImage(cover, (WIDTH - spread) / 2, -spread * 0.3, spread, spread)
    ctx.restore()

    // Opaque before the clip edge, so the cut never shows as a seam.
    const fade = ctx.createLinearGradient(0, 0, 0, band)
    fade.addColorStop(0, 'rgba(8,8,10,0.45)')
    fade.addColorStop(0.92, '#08080a')
    fade.addColorStop(1, '#08080a')
    ctx.fillStyle = fade
    ctx.fillRect(0, 0, WIDTH, band)
  } else {
    const glow = ctx.createRadialGradient(WIDTH / 2, 0, 0, WIDTH / 2, 0, WIDTH * 0.8)
    glow.addColorStop(0, `hsl(${input.accent} / 26%)`)
    glow.addColorStop(1, 'transparent')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, WIDTH, height * 0.6)
  }

  // ------------------------------------------------------------- header
  const artSize = 184
  if (cover) {
    ctx.save()
    roundRect(ctx, PADDING, PADDING, artSize, artSize, 16)
    ctx.clip()
    ctx.drawImage(cover, PADDING, PADDING, artSize, artSize)
    ctx.restore()
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1
    roundRect(ctx, PADDING, PADDING, artSize, artSize, 16)
    ctx.stroke()
  }

  const textX = PADDING + (cover ? artSize + 32 : 0)
  ctx.fillStyle = `hsl(${input.accent})`
  ctx.font = font(19, 800)
  ctx.fillText('TIER LIST', textX, PADDING + 26)

  ctx.fillStyle = '#f3f3f4'
  ctx.font = font(52, 900)
  let title = input.albumTitle
  while (ctx.measureText(title).width > WIDTH - textX - PADDING && title.length > 6) {
    title = `${title.slice(0, -2).trimEnd()}…`
  }
  ctx.fillText(title, textX, PADDING + 86)

  ctx.fillStyle = '#a7a7b0'
  ctx.font = font(26, 500)
  ctx.fillText(`${input.albumArtist} · ${input.trackCount} tracks`, textX, PADDING + 126)

  // Whose opinion this is deserves better than dim grey at the bottom of the
  // header: it is the one thing on the picture nobody else could have made.
  if (input.label) {
    ctx.font = font(22, 700)
    const name = `${input.label}'s ranking`
    const pillW = ctx.measureText(name).width + 34
    ctx.fillStyle = `hsl(${input.accent} / 18%)`
    roundRect(ctx, textX, PADDING + 150, pillW, 42, 21)
    ctx.fill()
    ctx.strokeStyle = `hsl(${input.accent} / 45%)`
    ctx.lineWidth = 1
    roundRect(ctx, textX, PADDING + 150, pillW, 42, 21)
    ctx.stroke()
    ctx.fillStyle = `hsl(${input.accent})`
    ctx.fillText(name, textX + 17, PADDING + 178)
  }

  // -------------------------------------------------------------- tiers
  const [hue, sat, lum] = input.accent.split(' ')
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
    const badgeHue = (Number.parseFloat(hue ?? '0') + tier.hue) % 360
    ctx.fillStyle = `hsl(${badgeHue} ${sat ?? '70%'} ${lum ?? '50%'})`
    roundRect(ctx, PADDING + 8, y + 8, BADGE - 16, rowHeight - 16, 10)
    ctx.fill()

    ctx.fillStyle = '#08080a'
    ctx.font = font(40, 900)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(tier.label, PADDING + BADGE / 2, y + rowHeight / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    const filled = layout.lines.filter((line) => line.chips.length > 0)
    let chipY = y + 10
    filled.forEach((line, lineIndex) => {
      // Share the line's leftover space out so each row reaches the edge —
      // except a last line under a full one, the same reason typesetters do
      // not justify a closing line. Stretching it blew a single leftover
      // track up to the width of the whole picture.
      const ragged = filled.length > 1 && lineIndex === filled.length - 1
      const stretch = ragged ? 0 : Math.max(0, line.slack) / line.chips.length
      let chipX = PADDING + BADGE + 10
      for (const chip of line.chips) {
        const width = chip.width + stretch
        const top = chip.rank === 1

        // Their number one is the whole point of showing anyone the picture.
        ctx.fillStyle = top ? `hsl(${input.accent})` : '#1f1f26'
        roundRect(ctx, chipX, chipY, width, CHIP_H, 11)
        ctx.fill()

        ctx.font = font(21, 800)
        ctx.fillStyle = top ? 'rgba(8,8,10,0.62)' : `hsl(${input.accent})`
        ctx.fillText(String(chip.rank), chipX + CHIP_PAD, chipY + 34)
        const numberWidth = ctx.measureText(String(chip.rank)).width + 12

        ctx.font = font(23, 600)
        ctx.fillStyle = top ? '#08080a' : '#f3f3f4'
        ctx.fillText(chip.text, chipX + CHIP_PAD + numberWidth, chipY + 34)

        chipX += width + CHIP_GAP
      }
      chipY += CHIP_H + CHIP_GAP
    })

    y += rowHeight + ROW_GAP
  })

  // ------------------------------------------------------------- footer
  // A picture cannot be clicked, so the address has to be readable. Without it
  // the one artefact built to travel was the one with no way back.
  const footY = height - footerHeight + 40
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PADDING, footY - 18)
  ctx.lineTo(WIDTH - PADDING, footY - 18)
  ctx.stroke()

  ctx.fillStyle = '#f3f3f4'
  ctx.font = font(26, 900)
  ctx.fillText('tracktour.', PADDING, footY + 22)

  ctx.fillStyle = '#84848f'
  ctx.font = font(21, 500)
  ctx.textAlign = 'right'
  ctx.fillText(input.home, WIDTH - PADDING, footY + 22)
  ctx.textAlign = 'left'

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
