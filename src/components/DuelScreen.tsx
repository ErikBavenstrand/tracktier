import { useCallback, useEffect, useRef, useState } from 'react'
import { player } from '../lib/audio'
import type { Album, Track } from '../lib/providers/types'
import type { Verdict } from '../lib/sorter'
import { usePlayer } from '../hooks/usePlayer'
import type { RankingSession } from '../hooks/useRankingSession'
import { LiveStandings } from './LiveStandings'
import { Icon, PlayRing, formatDuration } from './ui'

interface Props {
  album: Album
  session: RankingSession
  onFinish: () => void
  onExit: () => void
}

export function DuelScreen({ album, session, onFinish, onExit }: Props) {
  const { pair, progress, placed, order, canUndo, refined, choose, undo, refine } = session
  const playerState = usePlayer()
  const [autoplay, setAutoplay] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const verdictTimer = useRef<number>()

  const trackOf = useCallback(
    (id: string | undefined) => album.tracks.find((t) => t.id === id) ?? null,
    [album.tracks],
  )
  const left = trackOf(pair?.a)
  const right = trackOf(pair?.b)

  const play = useCallback((track: Track | null) => {
    if (!track?.previewUrl) return
    player.toggle(track.id, track.previewUrl)
  }, [])

  // Settle the choice animation before the next pair swaps in.
  const decide = useCallback(
    (next: Verdict) => {
      if (!pair || verdict) return
      setVerdict(next)
      player.pause()
      verdictTimer.current = window.setTimeout(() => {
        choose(next)
        setVerdict(null)
      }, 190)
    },
    [choose, pair, verdict],
  )

  useEffect(() => {
    if (!autoplay || !left?.previewUrl) return
    void player.play(left.id, left.previewUrl)
  }, [autoplay, left])

  useEffect(() => {
    player.warm(right?.previewUrl ?? null)
  }, [right])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return
      // Space activates whatever button has focus; hijacking it would break
      // keyboard navigation of the controls below.
      if (event.key === ' ' && target && /^(BUTTON|A)$/.test(target.tagName)) return

      switch (event.key.toLowerCase()) {
        case 'arrowleft':
        case 'a':
          event.preventDefault()
          decide('a')
          break
        case 'arrowright':
        case 'd':
          event.preventDefault()
          decide('b')
          break
        case 'arrowdown':
        case 't':
        case ' ':
          event.preventDefault()
          decide('tie')
          break
        case '1':
          event.preventDefault()
          play(left)
          break
        case '2':
          event.preventDefault()
          play(right)
          break
        case 'z':
        case 'backspace':
          event.preventDefault()
          undo()
          break
        case 'enter':
          if (progress.complete) {
            event.preventDefault()
            onFinish()
          }
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [decide, left, onFinish, play, progress.complete, right, undo])

  useEffect(
    () => () => {
      window.clearTimeout(verdictTimer.current)
      player.stop()
    },
    [],
  )

  const refining = progress.phase === 'refining'
  const percent = Math.round(progress.fraction * 100)

  return (
    <div className="duel fade-in">
      <header className="duel-head">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onExit}>
          <Icon name="back" size={15} />
          Album
        </button>

        <div className="duel-meta truncate">
          <strong className="truncate">{album.title}</strong>
          <span className="faint truncate">{album.artist}</span>
        </div>

        <label className="toggle" title="Play the left track automatically on each new pair">
          <input
            type="checkbox"
            checked={autoplay}
            onChange={(event) => setAutoplay(event.target.checked)}
          />
          <span className="toggle-track" aria-hidden="true"><span className="toggle-thumb" /></span>
          <span className="toggle-label">Autoplay</span>
        </label>
      </header>

      <div className="duel-progress">
        <div
          className="duel-progress-bar"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={refining ? 'Checking neighbours' : 'Ranking progress'}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <div className="duel-progress-legend">
          <span className="tabular">
            {progress.done} of {progress.total} question{progress.total === 1 ? '' : 's'}
          </span>
          <span className="faint">
            {refining
              ? `checking neighbours · ${progress.remaining} to go`
              : `${placed.length} of ${progress.totalCount} placed`}
          </span>
        </div>
      </div>

      {/* `ordered` stays true through refining — only the phase says we are done. */}
      {progress.complete ? (
        <div className="duel-done card">
          <div>
            <h2>
              {refined ? 'Checked and settled' : `Ranked in ${progress.done} questions`}
            </h2>
            <p className="muted">
              {refined
                ? 'Every neighbouring pair has been confirmed.'
                : `A mistake early on can carry a track a few places off. Re-asking each neighbouring pair catches it — ${Math.max(0, order.length - 1)} quick questions.`}
            </p>
          </div>
          <div className="row wrap">
            {!refined && (
              <button type="button" className="btn btn-ghost" onClick={refine}>
                <Icon name="sparkle" size={16} />
                Sharpen · {Math.max(0, order.length - 1)} questions
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={onFinish}>
              <Icon name="trophy" size={16} />
              See the tier list
              <kbd>enter</kbd>
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="duel-question">
            {refining ? 'Still in the right order?' : 'Which one is better?'}
          </p>

          <div className="duel-layout">
            <div className="duel-main">
              <div className={`duel-grid ${verdict ? `verdict-${verdict}` : ''}`}>
                <DuelCard
                  track={left}
                  album={album}
                  side="a"
                  state={playerState}
                  chosen={verdict === 'a'}
                  rejected={verdict === 'b'}
                  onPlay={() => play(left)}
                  onChoose={() => decide('a')}
                />

                <div className="duel-versus">
                  <span className="duel-versus-line" aria-hidden="true" />
                  <span className="duel-versus-badge">VS</span>
                  <span className="duel-versus-line" aria-hidden="true" />
                </div>

                <DuelCard
                  track={right}
                  album={album}
                  side="b"
                  state={playerState}
                  chosen={verdict === 'b'}
                  rejected={verdict === 'a'}
                  onPlay={() => play(right)}
                  onChoose={() => decide('b')}
                />
              </div>

              <div className="duel-actions">
                <button type="button" className="btn btn-ghost" onClick={() => decide('tie')}>
                  <Icon name="swap" size={16} />
                  Too close to call
                  <kbd>space</kbd>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={undo}
                  disabled={!canUndo}
                >
                  <Icon name="undo" size={16} />
                  Undo
                  <kbd>Z</kbd>
                </button>
              </div>

              <dl className="duel-hints faint">
                {[
                  { keys: ['←', '→'], label: 'pick a side' },
                  { keys: ['1', '2'], label: 'hear it' },
                  { keys: ['space'], label: 'too close' },
                  { keys: ['Z'], label: 'undo' },
                ].map(({ keys, label }) => (
                  <div key={label}>
                    <dt>
                      {keys.map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </dt>
                    <dd>{label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <LiveStandings
              album={album}
              placed={placed}
              pending={order.slice(placed.length)}
              duelling={pair ? [pair.a, pair.b] : null}
              showTiers={placed.length >= 3}
            />
          </div>
        </>
      )}
    </div>
  )
}

function DuelCard({
  track,
  album,
  side,
  state,
  chosen,
  rejected,
  onPlay,
  onChoose,
}: {
  track: Track | null
  album: Album
  side: 'a' | 'b'
  state: ReturnType<typeof usePlayer>
  chosen: boolean
  rejected: boolean
  onPlay: () => void
  onChoose: () => void
}) {
  if (!track) return <div className="duel-card is-empty" />

  const isCurrent = state.trackId === track.id
  const playing = isCurrent && state.playing

  return (
    <div
      className={`duel-card ${chosen ? 'is-chosen' : ''} ${rejected ? 'is-rejected' : ''} ${
        playing ? 'is-playing' : ''
      }`}
    >
      {/* Every track shares one sleeve, so the art is texture here, not information. */}
      {album.cover && (
        <div
          className="duel-card-wash"
          style={{ backgroundImage: `url(${album.cover})` }}
          aria-hidden="true"
        />
      )}

      <button
        type="button"
        className="duel-card-hit"
        onClick={onChoose}
        aria-label={`Choose ${track.title}`}
      >
        <span className="duel-track-number tabular">
          {String(track.trackNumber).padStart(2, '0')}
        </span>
        <span className="duel-title">{track.title}</span>
        <span className="duel-sub faint tabular">
          {formatDuration(track.durationMs)}
          {track.artist && <> · {track.artist}</>}
          {track.explicit && <span className="explicit" title="Explicit">E</span>}
        </span>
      </button>

      <div className="duel-card-foot">
        <PlayRing
          playing={playing}
          loading={isCurrent && state.loading}
          progress={isCurrent ? state.progress : 0}
          disabled={!track.previewUrl}
          onClick={onPlay}
          size={64}
          label={playing ? `Pause ${track.title}` : `Preview ${track.title}`}
        />
        <button type="button" className="btn btn-primary duel-pick" onClick={onChoose}>
          Pick this
          <kbd className="duel-pick-key">{side === 'a' ? '←' : '→'}</kbd>
        </button>
      </div>
    </div>
  )
}
