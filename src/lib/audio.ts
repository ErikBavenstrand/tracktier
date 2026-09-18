/**
 * One shared <audio> element for 30s previews.
 *
 * A single element is the right shape here: a duel only ever plays one side at
 * a time, and reusing one element keeps mobile autoplay permission alive once
 * the listener's first tap has granted it.
 */

export interface PlayerState {
  trackId: string | null
  playing: boolean
  loading: boolean
  /** 0–1 through the clip. */
  progress: number
  error: string | null
}

type Listener = (state: PlayerState) => void

const SILENT: PlayerState = {
  trackId: null,
  playing: false,
  loading: false,
  progress: 0,
  error: null,
}

class PreviewPlayer {
  private element: HTMLAudioElement | null = null
  private prefetch: HTMLAudioElement | null = null
  private listeners = new Set<Listener>()
  private state: PlayerState = SILENT
  /** Called when a clip fails, so a caller can refresh expiring preview URLs. */
  onStale: ((trackId: string) => void) | null = null

  private audio(): HTMLAudioElement {
    if (this.element) return this.element
    const audio = new Audio()
    audio.preload = 'auto'
    // No crossOrigin: nothing here reads the samples, and requesting CORS would
    // make playback fail outright against any CDN that omits the header.

    audio.addEventListener('timeupdate', () => {
      const duration = audio.duration || 30
      this.patch({ progress: Math.min(1, audio.currentTime / duration) })
    })
    audio.addEventListener('ended', () => this.patch({ playing: false, progress: 1 }))
    audio.addEventListener('waiting', () => this.patch({ loading: true }))
    audio.addEventListener('playing', () => this.patch({ loading: false, playing: true, error: null }))
    audio.addEventListener('pause', () => this.patch({ playing: false }))
    audio.addEventListener('error', () => {
      const trackId = this.state.trackId
      this.patch({ playing: false, loading: false, error: 'This preview could not be played' })
      if (trackId) this.onStale?.(trackId)
    })

    this.element = audio
    return audio
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  getState(): PlayerState {
    return this.state
  }

  private patch(partial: Partial<PlayerState>) {
    this.state = { ...this.state, ...partial }
    for (const listener of this.listeners) listener(this.state)
  }

  async play(trackId: string, url: string): Promise<void> {
    const audio = this.audio()
    if (this.state.trackId !== trackId || audio.src !== url) {
      audio.src = url
      audio.currentTime = 0
      this.patch({ trackId, progress: 0, loading: true, error: null })
    }
    try {
      await audio.play()
      this.patch({ playing: true, loading: false })
    } catch (error) {
      // An AbortError just means a newer play() superseded this one.
      if ((error as DOMException)?.name === 'AbortError') return
      this.patch({ playing: false, loading: false, error: 'Playback was blocked' })
    }
  }

  pause(): void {
    this.element?.pause()
    this.patch({ playing: false })
  }

  stop(): void {
    if (this.element) {
      this.element.pause()
      this.element.removeAttribute('src')
      this.element.load()
    }
    this.state = SILENT
    for (const listener of this.listeners) listener(this.state)
  }

  toggle(trackId: string, url: string): void {
    if (this.state.trackId === trackId && this.state.playing) this.pause()
    else void this.play(trackId, url)
  }

  /** Warm the next clip so a duel does not stall on the first tap. */
  warm(url: string | null): void {
    if (!url) return
    this.prefetch ??= new Audio()
    this.prefetch.preload = 'auto'
    if (this.prefetch.src !== url) this.prefetch.src = url
  }
}

export const player = new PreviewPlayer()
