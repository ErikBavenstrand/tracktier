import { useEffect, useRef, useState, type ReactNode } from 'react'

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}

export type IconName = keyof typeof PATHS

const PATHS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />,
  pause: <><rect x="6.5" y="4.5" width="4" height="15" rx="1.4" fill="currentColor" stroke="none" /><rect x="13.5" y="4.5" width="4" height="15" rx="1.4" fill="currentColor" stroke="none" /></>,
  back: <path d="M15 5 8 12l7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  share: <><path d="M12 3v13" /><path d="m7.5 7.5 4.5-4.5 4.5 4.5" /><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5.5 15H5a1.8 1.8 0 0 1-1.8-1.8V5A1.8 1.8 0 0 1 5 3.2h8.2A1.8 1.8 0 0 1 15 5v.5" /></>,
  check: <path d="m5 13 4.5 4.5L19 7" />,
  undo: <><path d="M4 9h11a5 5 0 0 1 0 10h-3" /><path d="m8 5-4 4 4 4" /></>,
  trophy: <><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 5H4.5v1.5A3.5 3.5 0 0 0 8 10" /><path d="M17 5h2.5v1.5A3.5 3.5 0 0 1 16 10" /><path d="M12 14v3" /><path d="M8.5 20h7" /><path d="M10 17h4l.6 3h-5.2z" /></>,
  swap: <><path d="M4 8h13" /><path d="m14 5 3 3-3 3" /><path d="M20 16H7" /><path d="m10 13-3 3 3 3" /></>,
  sparkle: <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 10.9 10.1 9z" />,
  trash: <><path d="M4.5 7h15" /><path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" /><path d="M6.5 7 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5L17.5 7" /></>,
  link: <><path d="M10 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 1 0-5.7-5.7l-1.3 1.3" /><path d="M14 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 1 0 5.7 5.7l1.3-1.3" /></>,
  users: <><circle cx="9" cy="8" r="3.4" /><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" /><path d="M16.5 5.2a3.4 3.4 0 0 1 0 6.6" /><path d="M18 14.4a6.2 6.2 0 0 1 3.2 5.6" /></>,
  arrowRight: <><path d="M4 12h15" /><path d="m13.5 6.5 6 5.5-6 5.5" /></>,
  image: <><rect x="3.2" y="4.2" width="17.6" height="15.6" rx="2.5" /><circle cx="8.8" cy="9.6" r="1.6" /><path d="m4 17 4.8-4.6a2 2 0 0 1 2.7 0L20 20" /></>,
  music: <><circle cx="7" cy="18" r="2.8" /><circle cx="18" cy="16" r="2.8" /><path d="M9.8 18V7.2l11-2.2V16" /></>,
  // Drawn rather than typed: Inter's Google Fonts subset has no arrow glyphs.
  up: <path d="M12 6.5 5.5 15h13z" fill="currentColor" stroke="none" />,
  down: <path d="M12 17.5 5.5 9h13z" fill="currentColor" stroke="none" />,
} as const

/**
 * Album artwork that appears whole or not at all.
 *
 * Pointing an <img> straight at a URL lets the browser paint the JPEG as it
 * arrives, so covers wipe in top to bottom like a printer. Loading and decoding
 * off-DOM first means the element is only mounted once the full image is ready
 * to paint in a single frame — after which it fades in.
 */
export function Art({
  src,
  alt,
  className = '',
  size,
}: {
  src: string | null
  alt: string
  className?: string
  size?: number
}) {
  const [ready, setReady] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!src) {
      setFailed(true)
      return
    }
    let cancelled = false
    setFailed(false)

    const image = new Image()
    const show = () => !cancelled && setReady(src)

    image.onload = () => {
      // decode() rejects on some browsers for images that render fine, so a
      // failure here still means "loaded" — just without the decode guarantee.
      image.decode().then(show, show)
    }
    image.onerror = () => !cancelled && setFailed(true)
    image.src = src

    return () => {
      cancelled = true
    }
  }, [src])

  // Comparing against `src` rather than tracking a boolean means a changed src
  // falls back to the loading state on the very same render, so a stale cover
  // is never shown under a new album's title.
  const visible = ready === src && !failed
  const style = size ? { width: size, height: size } : undefined

  return (
    <div className={`art ${className}`} style={style}>
      {visible && ready && <img className="art-img" src={ready} alt={alt} />}
      {!visible &&
        (failed ? (
          <div className="art-placeholder">
            <Icon name="music" size={size ? Math.max(16, size / 3) : 22} />
          </div>
        ) : (
          <span className="art-loading sk" />
        ))}
    </div>
  )
}

/** Circular play control whose ring doubles as the 30-second preview position. */
export function PlayRing({
  playing,
  loading,
  progress,
  disabled,
  onClick,
  size = 54,
  label,
}: {
  playing: boolean
  loading: boolean
  progress: number
  disabled?: boolean
  onClick: () => void
  size?: number
  label: string
}) {
  const radius = size / 2 - 2
  const circumference = 2 * Math.PI * radius

  return (
    <button
      type="button"
      className={`play-ring ${playing ? 'is-playing' : ''}`}
      style={{ width: size, height: size }}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={disabled ? 'No preview available for this track' : label}
    >
      <svg className="play-ring-track" width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="play-ring-progress"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <span className={loading ? 'spin' : undefined}>
        <Icon name={loading ? 'sparkle' : playing ? 'pause' : 'play'} size={size * 0.38} />
      </span>
    </button>
  )
}

/** Copy-to-clipboard with inline confirmation, falling back to select-all. */
export function CopyButton({
  value,
  children,
  className = 'btn btn-ghost btn-sm',
}: {
  value: string
  children?: ReactNode
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number>()

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Clipboard access is denied in some contexts; the field stays selectable.
      return
    }
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <button type="button" className={className} onClick={copy}>
      <Icon name={copied ? 'check' : 'copy'} size={15} />
      {children ?? (copied ? 'Copied' : 'Copy')}
    </button>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="spinner-block" role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="muted">{label}</span>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: IconName
  title: string
  children?: ReactNode
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">
        <Icon name={icon} size={22} />
      </span>
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={action.onClick}>
          <Icon name="undo" size={15} />
          {action.label}
        </button>
      )}
    </div>
  )
}

export const formatDuration = (ms: number): string => {
  if (!ms) return '—'
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
