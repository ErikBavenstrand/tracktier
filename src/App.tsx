import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlbumScreen } from './components/AlbumScreen'
import { CompareScreen } from './components/CompareScreen'
import { DuelScreen } from './components/DuelScreen'
import { ResultScreen } from './components/ResultScreen'
import { SearchScreen } from './components/SearchScreen'
import { TractorLogo } from './components/TractorLogo'
import { Attribution } from './components/Attribution'
import { AlbumScreenSkeleton, DuelSkeleton, RankingSkeleton } from './components/Skeletons'
import { EmptyState, Icon } from './components/ui'
import { useAlbum } from './hooks/useAlbum'
import { useRankingSession } from './hooks/useRankingSession'
import {
  applyPalette,
  cachedPalette,
  DEFAULT_PALETTE,
  paletteFromImage,
  type Palette,
} from './lib/palette'
import {
  hrefAlbum,
  hrefCompare,
  hrefHome,
  hrefRank,
  hrefRanking,
  navigate,
  parseRoute,
  type Route,
} from './lib/routes'
import {
  decodeRanking,
  encodeRanking,
  rankingMatchesAlbum,
  ShareCodeError,
  stampToday,
} from './lib/sharecode'
import { startRefining } from './lib/sorter'
import type { ResultStatus } from './components/ResultScreen'
import {
  clearSession,
  hasSkipChoice,
  authorId,
  isOwnCode,
  libraryAlbum,
  loadLibrary,
  loadProfile,
  loadSkipped,
  markSkipChoiceMade,
  removeRanking,
  saveProfile,
  saveRanking,
  saveSession,
  saveSkipped,
  sessionFor,
  storageAvailable,
  tagSession,
  type LibraryAlbum,
} from './lib/storage'
import { findInterludes } from './lib/interludes'
import { proportionalCuts } from './lib/tiers'
import './styles/screens.css'

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))
  const [palette, setPalette] = useState<Palette>(DEFAULT_PALETTE)
  // Probing storage writes a key, so it must happen once — not on every render.
  const [canStore] = useState(storageAvailable)

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseRoute(window.location.hash))
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const onCover = useCallback((cover: string | null) => {
    // A colour already read is applied in the same tick the album arrives,
    // rather than after a round trip that can only produce the same answer.
    const known = cachedPalette(cover)
    if (known) {
      setPalette(known)
      applyPalette(known)
      return
    }
    void paletteFromImage(cover).then((next) => {
      setPalette(next)
      applyPalette(next)
    })
  }, [])

  // The home screen belongs to nobody's album, so it gets the house colour back.
  useEffect(() => {
    if (route.name === 'home') {
      setPalette(DEFAULT_PALETTE)
      applyPalette(DEFAULT_PALETTE)
    }
  }, [route.name])

  return (
    <div className="shell">
      <header className="topbar">
        <a className="wordmark" href={hrefHome()}>
          <TractorLogo />
          tracktour.
        </a>
        <span className="topbar-spacer" />
        {route.name !== 'home' && (
          <a className="btn btn-ghost btn-sm" href={hrefHome()}>
            <Icon name="search" size={15} />
            New album
          </a>
        )}
      </header>

      <main>
        {route.name === 'home' && <SearchScreen />}
        {route.name === 'compare' && <CompareScreen codes={route.codes} onCover={onCover} />}
        {(route.name === 'album' || route.name === 'rank') && (
          <AlbumRoute route={route} onCover={onCover} />
        )}
        {route.name === 'ranking' && (
          <RankingRoute code={route.code} palette={palette} onCover={onCover} />
        )}
      </main>

      {!canStore && (
        <p className="storage-warning pill">
          This browser is blocking site storage, so rankings will not be remembered here. Share
          links still work.
        </p>
      )}

      <footer className="site-footer">
        <Attribution />
        <a
          href="https://github.com/ErikBavenstrand/tracktour"
          target="_blank"
          rel="noreferrer noopener"
        >
          Source
        </a>
      </footer>
    </div>
  )
}

/** Album detail and the duel session share one album load. */
function AlbumRoute({
  route,
  onCover,
}: {
  route: Extract<Route, { name: 'album' | 'rank' }>
  onCover: (cover: string | null) => void
}) {
  const { album, loading, error, retry } = useAlbum(route.provider, route.id)

  /**
   * Which tracks are in the ranking.
   *
   * On a first visit the detected interludes start excluded — a suggestion, not
   * a filter, since no catalogue marks them and the guess misfires on records
   * of very short songs. Once a choice has been made it is remembered verbatim,
   * so an album deliberately kept whole does not re-propose the same cuts.
   */
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const skipKey = album ? `${album.provider}:${album.id}` : null
  const appliedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!album || !skipKey || appliedFor.current === skipKey) return
    appliedFor.current = skipKey
    setSkipped(
      new Set(
        hasSkipChoice(album.provider, album.id)
          ? loadSkipped(album.provider, album.id)
          : findInterludes(album.tracks).map((item) => item.id),
      ),
    )
  }, [album, skipKey])

  const trackIds = useMemo(
    () => album?.tracks.filter((track) => !skipped.has(track.id)).map((track) => track.id) ?? [],
    [album, skipped],
  )

  const session = useRankingSession(album, trackIds)

  const toggleTrack = useCallback(
    (trackId: string) => {
      if (!album) return
      setSkipped((current) => {
        const next = new Set(current)
        if (next.has(trackId)) next.delete(trackId)
        else next.add(trackId)
        saveSkipped(album.provider, album.id, [...next])
        markSkipChoiceMade(album.provider, album.id)
        return next
      })
    },
    [album],
  )

  useEffect(() => {
    if (album) onCover(album.cover)
  }, [album, onCover])

  const comparisons = session.progress.done

  /**
   * Write the ranking to the library as it stands.
   *
   * This runs from the first verdict onward, not only at the finish line: a
   * session abandoned halfway is still an opinion worth keeping, and it should
   * be waiting on the home screen rather than needing the exact album URL to
   * find again.
   */
  const persist = useCallback(
    (): string | null => {
      if (!album || session.order.length === 0) return null

      // A sort yields order, not magnitude, so bands come from proportion.
      const cuts = proportionalCuts(session.order.length)
      const indexOf = new Map(album.tracks.map((track, index) => [track.id, index]))
      const order = session.order.map((id) => indexOf.get(id) ?? 0)

      try {
        const code = encodeRanking(
          {
            provider: album.provider,
            albumId: album.id,
            order,
            trackCount: album.tracks.length,
            cuts,
            label: loadProfile().label || undefined,
          },
          album.title,
        )
        // The session store already holds the work in progress; the library
        // only takes rankings once they carry a name.
        tagSession(album.provider, album.id, code)
        return code
      } catch {
        // Only albums outside the shareable size range fail to encode.
        return null
      }
    },
    [album, session.order],
  )

  const finish = useCallback(() => {
    const code = persist()
    if (code) navigate(hrefRanking(code))
  }, [persist])

  if (loading) return route.name === 'rank' ? <DuelSkeleton /> : <AlbumScreenSkeleton />
  if (error || !album) {
    return (
      <EmptyState
        icon="close"
        title="Could not load that album"
        action={{ label: 'Try again', onClick: retry }}
      >
        {error ?? 'The album is missing from this catalogue.'}
      </EmptyState>
    )
  }

  if (route.name === 'rank') {
    return (
      <DuelScreen
        album={album}
        session={session}
        onFinish={finish}
        onExit={() => navigate(hrefAlbum(album.provider, album.id))}
      />
    )
  }

  const kept = libraryAlbum(album.provider, album.id)?.rankings ?? []

  return (
    <AlbumScreen
      album={album}
      skipped={skipped}
      onToggle={toggleTrack}
      locked={comparisons > 0}
      comparisonsSoFar={comparisons}
      rankings={kept}
      onCompare={() => navigate(hrefCompare(kept.map((entry) => entry.code)))}
      onStartOver={() => {
        session.reset()
        clearSession(album.provider, album.id)
      }}
      onBack={() => navigate(hrefHome())}
    />
  )
}

/**
 * A ranking decoded straight out of the URL.
 *
 * Three states, told apart before anything is written to storage:
 *
 *  - saved — this code is already in the library, under a name.
 *  - yours — this browser produced it, but it has not been kept yet.
 *  - imported — it arrived through someone else's link.
 *
 * The last is detected from the code alone, so a link works even when the
 * sender never signed it. Nothing is stored until the button is pressed:
 * saving on every keystroke of the name box produced a new ranking per letter.
 */
function RankingRoute({
  code,
  palette,
  onCover,
}: {
  code: string
  palette: Palette
  onCover: (cover: string | null) => void
}) {
  const decoded = useMemo(() => {
    try {
      return { ranking: decodeRanking(code), error: null as string | null }
    } catch (error) {
      return {
        ranking: null,
        error: error instanceof ShareCodeError ? error.message : 'That link could not be read',
      }
    }
  }, [code])

  const ranking = decoded.ranking
  const { album, loading, error, retry } = useAlbum(
    ranking?.provider ?? null,
    ranking?.albumId ?? null,
  )

  const [library, setLibrary] = useState<LibraryAlbum[]>(loadLibrary)
  const entry = useMemo(() => {
    if (!ranking) return null
    return (
      library
        .find((a) => a.provider === ranking.provider && a.albumId === ranking.albumId)
        ?.rankings.find((item) => item.code === code) ?? null
    )
  }, [code, library, ranking])

  const mine = useMemo(
    () => (ranking ? isOwnCode(ranking.provider, ranking.albumId, code, ranking.author) : false),
    [code, ranking],
  )

  const [name, setName] = useState('')
  useEffect(() => {
    // Prefer the name it is already filed under, then the sender's, then yours.
    setName(entry?.label ?? ranking?.label ?? (mine ? loadProfile().label : '') ?? '')
  }, [code, entry, mine, ranking])

  useEffect(() => {
    if (album) onCover(album.cover)
  }, [album, onCover])

  const order = ranking?.order ?? []
  const cuts = ranking?.cuts ?? []

  const session = ranking ? sessionFor(ranking.provider, ranking.albumId) : null
  const ownSession = session && session.code === code ? session : null

  /** The one place a ranking is written, and only when asked. */
  const keep = useCallback(() => {
    const trimmed = name.trim()
    if (!album || !ranking || !trimmed) return
    try {
      // Keeping something of your own stamps it with this browser's author id,
      // so a later re-rank replaces it instead of piling up beside it. An
      // import keeps whatever author it arrived with, or none at all.
      // Saving is the event a stamp dates, so keeping your own re-dates it and
      // an import keeps whatever day it arrived carrying.
      const stamp = mine ? stampToday() : ranking.stamp
      const signed = encodeRanking(
        {
          ...ranking,
          order,
          cuts,
          label: trimmed,
          author: mine ? authorId() : ranking.author,
          stamp,
        },
        album.title,
      )
      setLibrary(
        saveRanking(
          {
            provider: album.provider,
            albumId: album.id,
            title: album.title,
            artist: album.artist,
            cover: album.cover,
            trackCount: album.tracks.length,
            trackTitles: album.tracks.map((track) => track.title),
          },
          {
            label: trimmed,
            code: signed,
            order,
            cuts,
            savedAt: Date.now(),
            mine,
            // The saved entry, not authorId(): minting writes to storage, which must
        // not happen in a render. The share box only appears once saved, so the
        // entry is always there by the time this code is shown.
        author: entry?.author ?? ranking.author,
          },
        ),
      )
      if (mine) {
        // Merged, not replaced: the profile also holds the author id, and
        // dropping it would mint a fresh one on the next save — every re-rank
        // then looking like a different person.
        saveProfile({ ...loadProfile(), label: trimmed })
        // Signing changes the code, and the session is matched by it. Without
        // this the ranking loses track of its own sort, and Sharpen and Start
        // over disappear the moment it is saved.
        if (ownSession) tagSession(album.provider, album.id, signed)
      }
      // The URL now carries the signed code, so sharing it carries the name.
      // replaceState does not fire hashchange, so the route is told directly —
      // without it the page keeps rendering against the old, unsigned code and
      // never notices it has just been saved.
      if (signed !== code) {
        window.history.replaceState(null, '', hrefRanking(signed))
        window.dispatchEvent(new HashChangeEvent('hashchange'))
      }
    } catch {
      /* only albums outside the shareable size range fail to encode */
    }
  }, [album, cuts, code, mine, name, order, ownSession, ranking])

  const forget = useCallback(() => {
    if (!ranking || !entry) return
    setLibrary(removeRanking(ranking.provider, ranking.albumId, entry.label))
  }, [entry, ranking])

  if (decoded.error || !ranking) {
    return (
      <EmptyState icon="close" title="That ranking link is not readable">
        {decoded.error}
      </EmptyState>
    )
  }
  if (loading) return <RankingSkeleton />
  if (error || !album) {
    return (
      <EmptyState
        icon="close"
        title="Could not load that album"
        action={{ label: 'Try again', onClick: retry }}
      >
        {error ?? 'The album behind this ranking is missing from the catalogue.'}
      </EmptyState>
    )
  }

  const mismatch = !rankingMatchesAlbum({ ...ranking, order }, album)
  const orderedIds = order.map((index) => album.tracks[index]?.id ?? '').filter(Boolean)

  if (mismatch || orderedIds.length !== order.length) {
    return (
      <EmptyState icon="close" title="This ranking no longer fits the album">
        The catalogue now lists {album.tracks.length} tracks for {album.title}, but the link ranks{' '}
        {order.length}. The release was probably replaced with a different edition.
      </EmptyState>
    )
  }

  const albumEntry =
    library.find((a) => a.provider === ranking.provider && a.albumId === ranking.albumId) ?? null
  const others = albumEntry?.rankings ?? []

  const sort = ownSession?.sort
  const toRank = () => navigate(hrefRank(album.provider, album.id))
  let status: ResultStatus = null
  if (sort) {
    const ordered = sort.current === null && sort.queue.length === 0
    const startOver = () => {
      clearSession(album.provider, album.id)
      toRank()
    }
    if (!ordered) {
      status = {
        kind: 'partial',
        comparisons: sort.comparisons,
        placed: sort.placed.length,
        total: album.tracks.length,
        onContinue: toRank,
        onStartOver: startOver,
      }
    } else if (!sort.refined) {
      status = {
        kind: 'unrefined',
        comparisons: sort.comparisons,
        toCheck: Math.max(0, sort.placed.length - 1),
        onSharpen: () => {
          saveSession({ ...ownSession!, sort: startRefining(sort) })
          toRank()
        },
        onStartOver: startOver,
      }
    } else {
      status = { kind: 'refined', comparisons: sort.comparisons, onStartOver: startOver }
    }
  }

  return (
    <ResultScreen
      album={album}
      order={orderedIds}
      cuts={cuts}
      accent={palette.accent}
      status={status}
      keeping={{
        state: entry ? 'saved' : mine ? 'yours' : 'imported',
        name,
        onName: setName,
        onKeep: keep,
        onForget: forget,
        senderName: ranking.label ?? null,
        // The saved entry, not authorId(): minting writes to storage, which must
        // not happen in a render. The share box only appears once saved, so the
        // entry is always there by the time this code is shown.
        author: entry?.author ?? ranking.author,
        stamp: entry?.stamp ?? ranking.stamp,
      }}
      others={others.map((item) => ({ label: item.label, mine: item.mine, code: item.code }))}
      onCompare={() => navigate(hrefCompare(others.map((item) => item.code)))}
      onRerank={toRank}
      onBack={() => navigate(hrefHome())}
    />
  )
}

