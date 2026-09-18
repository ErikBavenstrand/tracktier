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
import { applyPalette, DEFAULT_PALETTE, paletteFromImage, type Palette } from './lib/palette'
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
import { decodeRanking, encodeRanking, rankingMatchesAlbum, ShareCodeError } from './lib/sharecode'
import { startRefining } from './lib/sorter'
import type { ResultStatus } from './components/ResultScreen'
import {
  clearSession,
  hasSkipChoice,
  loadLibrary,
  loadProfile,
  loadAlbumRankings,
  loadSkipped,
  markSkipChoiceMade,
  saveAlbumRanking,
  rankingId,
  saveProfile,
  saveSession,
  saveSkipped,
  saveToLibrary,
  sessionFor,
  storageAvailable,
  tagSession,
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
    (complete: boolean): string | null => {
      if (!album || session.order.length === 0) return null

      // A sort yields order, not magnitude, so bands come from proportion.
      const cuts = proportionalCuts(session.order.length)
      const indexOf = new Map(album.tracks.map((track, index) => [track.id, index]))
      const order = session.order.map((id) => indexOf.get(id) ?? 0)
      const label = loadProfile().label || undefined
      const id = rankingId(album.provider, album.id)

      try {
        const code = encodeRanking(
          {
            provider: album.provider,
            albumId: album.id,
            order,
            trackCount: album.tracks.length,
            cuts,
            label,
          },
          album.title,
        )
        tagSession(code)
        saveToLibrary({
          id,
          code,
          provider: album.provider,
          albumId: album.id,
          order,
          cuts,
          label,
          albumTitle: album.title,
          albumArtist: album.artist,
          albumCover: album.cover,
          trackTitles: album.tracks.map((track) => track.title),
          duels: comparisons,
          complete,
          // Keep the moment it was started, not the moment it was last touched.
          createdAt: loadLibrary().find((entry) => entry.id === id)?.createdAt ?? Date.now(),
          updatedAt: Date.now(),
        })
        return code
      } catch {
        // Only albums outside the shareable size range fail to encode.
        return null
      }
    },
    [album, comparisons, session.order],
  )

  useEffect(() => {
    if (comparisons > 0) persist(session.ordered)
  }, [comparisons, persist, session.ordered])

  const finish = useCallback(() => {
    const code = persist(true)
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

  return (
    <AlbumScreen
      album={album}
      skipped={skipped}
      onToggle={toggleTrack}
      locked={comparisons > 0}
      comparisonsSoFar={comparisons}
      onBack={() => navigate(hrefHome())}
    />
  )
}

/** A ranking decoded straight out of the URL — yours or somebody else's. */
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

  const [label, setLabel] = useState(() => loadProfile().label)

  // A ranking opened from the album's roster already has a name on it.
  useEffect(() => {
    if (!ranking) return
    const mine = loadAlbumRankings(ranking.provider, ranking.albumId).find(
      (entry) => entry.code === code,
    )
    if (mine) setLabel(mine.label)
    else if (ranking.label) setLabel((current) => current || ranking.label!)
  }, [code, ranking])
  // A link already in the library needs no prompt; anything else is someone
  // else's ranking, signed or not, and should be savable.
  const [saved, setSaved] = useState(() => loadLibrary().some((entry) => entry.code === code))

  useEffect(() => {
    if (album) onCover(album.cover)
  }, [album, onCover])

  useEffect(() => {
    setSaved(loadLibrary().some((entry) => entry.code === code))
  }, [code])

  const order = ranking?.order ?? []
  const cuts = ranking?.cuts ?? []

  // Only this browser's own unfinished session may be resumed from this page.
  // Someone else's shared link must never take over your ratings.
  const session = ranking ? sessionFor(ranking.provider, ranking.albumId) : null
  const ownSession = session && session.code === code ? session : null

  // Bumped whenever a ranking is written, so the roster below re-reads storage.
  const [savedAt, setSavedAt] = useState(0)

  // Re-read after the name lands, since signing the ranking is what puts it on
  // the album's roster in the first place.
  const roster = useMemo(
    () => (ranking ? loadAlbumRankings(ranking.provider, ranking.albumId) : []),
    [code, label, ranking, savedAt],
  )

  // A named ranking joins the album's roster, so it can be found and compared
  // later without anyone having to keep the original link.
  useEffect(() => {
    if (!album || !ranking || !label.trim() || ownSession === null) return
    try {
      // Store the code with the name encoded into it. The roster knows whose is
      // whose, but a comparison is built from the codes alone — and a code
      // without a name compares as "Listener 2".
      const signed = encodeRanking(
        { ...ranking, order, cuts, label: label.trim() },
        album.title,
      )
      saveAlbumRanking(album.provider, album.id, {
        label: label.trim(),
        code: signed,
        order,
        cuts,
        savedAt: Date.now(),
        mine: true,
      })
      setSavedAt(Date.now())
    } catch {
      // Only albums outside the shareable size range fail to encode.
    }
  }, [album, code, cuts, label, order, ownSession, ranking])

  const save = useCallback(() => {
    if (!album || !ranking) return
    const nextCode = encodeRanking({ ...ranking, order, cuts, label: label || undefined }, album.title)
    saveProfile({ label })
    saveToLibrary({
      id: rankingId(album.provider, album.id, ranking.label),
      code: nextCode,
      provider: album.provider,
      albumId: album.id,
      order,
      cuts,
      label: label || undefined,
      albumTitle: album.title,
      albumArtist: album.artist,
      albumCover: album.cover,
      trackTitles: album.tracks.map((track) => track.title),
      // Someone else's ranking arrives finished; none of the duels were ours.
      duels: 0,
      complete: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      importedFrom: ranking.label ?? 'a shared link',
    })
    if (ranking.label) {
      saveAlbumRanking(album.provider, album.id, {
        label: ranking.label,
        code: nextCode,
        order,
        cuts,
        savedAt: Date.now(),
        mine: false,
      })
    }
    setSaved(true)
  }, [album, cuts, label, order, ranking])

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

  /**
   * What this page is actually looking at.
   *
   * A ranking is not simply open or closed: it can be half-placed, fully
   * ordered but unchecked, or sorted and checked. Each wants a different thing
   * said and a different next step offered, and a half-placed one must not
   * present its unplaced tracks as though they had been ranked.
   */
  const sort = ownSession?.sort
  const toRank = () => navigate(hrefRank(album.provider, album.id))
  const startOver = () => {
    clearSession()
    toRank()
  }

  let status: ResultStatus = null
  if (sort) {
    const ordered = sort.current === null && sort.queue.length === 0
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
          // Hand the stored sort straight into its checking pass, so returning
          // to the duel screen resumes mid-sweep rather than at the start.
          saveSession({ ...ownSession!, sort: startRefining(sort) })
          toRank()
        },
        onStartOver: startOver,
      }
    } else {
      status = { kind: 'refined', comparisons: sort.comparisons, onStartOver: startOver }
    }
  }

  if (mismatch || orderedIds.length !== order.length) {
    return (
      <EmptyState icon="close" title="This ranking no longer fits the album">
        The catalogue now lists {album.tracks.length} tracks for {album.title}, but the link ranks{' '}
        {order.length}. The release was probably replaced with a different edition.
      </EmptyState>
    )
  }

  return (
    <>
      {!saved && (
        <div className="import-banner card">
          <div>
            <strong>{ranking.label ? `${ranking.label}’s ranking` : 'A shared ranking'}</strong>
            <p className="muted">
              Nothing is saved until you say so. Keep a copy in this browser, or rank the album
              yourself and compare the two.
            </p>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={save}>
            <Icon name="check" size={15} />
            Save to my library
          </button>
        </div>
      )}
      {saved && (
        <p className="pill pill-accent import-saved">
          <Icon name="check" size={14} /> Saved to this browser
        </p>
      )}

      <ResultScreen
        album={album}
        order={orderedIds}
        cuts={cuts}
        label={label}
        accent={palette.accent}
        authorLabel={ranking.label}
        onLabelChange={setLabel}
        status={status}
        saved={roster.map((entry) => ({ label: entry.label, mine: entry.mine }))}
        onCompare={() => navigate(hrefCompare(roster.map((entry) => entry.code)))}
        onRerank={() => navigate(hrefRank(album.provider, album.id))}
        onBack={() => navigate(hrefHome())}
      />
    </>
  )
}
