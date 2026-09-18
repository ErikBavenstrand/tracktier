import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAlbum } from '../hooks/useAlbum'
import { isOwnCode, loadLibrary, saveRanking, type LibraryAlbum } from '../lib/storage'
import { absoluteUrl, hrefCompare, navigate } from '../lib/routes'
import { compareRankings } from '../lib/compare'
import { daysSince, decodeRanking, ShareCodeError, type Ranking } from '../lib/sharecode'
import { proportionalCuts, tierOfRankFromCuts } from '../lib/tiers'
import { RankingSkeleton } from './Skeletons'
import { GapChart } from './GapChart'
import { Art, CopyButton, EmptyState, Icon } from './ui'

interface Entry {
  code: string
  ranking: Ranking
}

/**
 * Merge several people's rankings of one album into a consensus.
 *
 * This is the whole multiplayer story: everyone's opinion arrives as a link, so
 * a group ranking needs no accounts, no lobby and no server — just the codes
 * concatenated in a URL of its own.
 */
export function CompareScreen({
  codes,
  onCover,
}: {
  codes: string[]
  onCover: (cover: string | null) => void
}) {
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [library, setLibrary] = useState<LibraryAlbum[]>(loadLibrary)

  const entries = useMemo(() => {
    const out: Entry[] = []
    for (const code of codes) {
      try {
        out.push({ code, ranking: decodeRanking(code) })
      } catch {
        // A single bad code should not blank the whole comparison — but it must
        // not vanish either. A five-person link runs to hundreds of characters
        // and chat clients truncate them, so the honest failure is a confident
        // screen missing three people with no hint anything is absent.
      }
    }
    return out
  }, [codes])
  const unreadable = codes.length - entries.length

  const first = entries[0]?.ranking ?? null
  const { album, loading } = useAlbum(first?.provider ?? null, first?.albumId ?? null)

  // The consensus belongs to the album too, so it wears the same colour.
  useEffect(() => {
    if (album) onCover(album.cover)
  }, [album, onCover])

  const add = useCallback(
    (raw: string) => {
      const value = raw.trim()
      if (!value) return

      // Two people each assembling half a comparison and then merging is the
      // natural group move, so a comparison link has to be pastable too. It
      // used to fall through to decodeRanking, where a URL is silently stripped
      // to garbage and rejected as "truncated or altered" — blaming the sender
      // for a problem that did not exist.
      const link = /#\/(r|c)\/([A-Za-z0-9_~-]+)/.exec(value)
      const incoming = link ? (link[2] ?? '').split('~') : [value]

      const added: string[] = []
      for (const code of incoming) {
        try {
          const ranking = decodeRanking(code)
          if (first && (ranking.provider !== first.provider || ranking.albumId !== first.albumId)) {
            setError('That ranking is for a different album.')
            return
          }
          // Same person, newer ranking: replace them rather than seating them
          // twice. Re-pasting somebody's updated link is how a group keeps a
          // comparison current, and it used to produce two of them.
          const replaces =
            ranking.author === undefined
              ? -1
              : [...codes, ...added].findIndex((held) => {
                  try {
                    return decodeRanking(held).author === ranking.author
                  } catch {
                    return false
                  }
                })
          if (replaces >= 0) {
            const next = [...codes, ...added]
            if (next[replaces] === code) continue
            next[replaces] = code
            setError(null)
            setInput('')
            navigate(hrefCompare(next))
            return
          }
          if (![...codes, ...added].includes(code)) added.push(code)
        } catch (caught) {
          if (incoming.length === 1) {
            setError(
              caught instanceof ShareCodeError ? caught.message : 'That code could not be read',
            )
            return
          }
        }
      }

      if (added.length === 0) {
        setError(
          link
            ? 'Everything in that link is already in this comparison.'
            : 'That does not look like a tracktour link — paste the whole link your friend sent.',
        )
        return
      }
      setError(null)
      setInput('')
      navigate(hrefCompare([...codes, ...added]))
    },
    [codes, first],
  )

  // Offer rankings already in the library for this album.
  const suggestions = useMemo(
    () =>
      library
        .filter((album) => !first || (album.provider === first.provider && album.albumId === first.albumId))
        .flatMap((album) =>
          album.rankings
            .filter((item) => !codes.includes(item.code))
            .map((item) => ({ key: `${album.albumId}:${item.label}`, label: item.label, code: item.code })),
        )
        .slice(0, 5),
    [codes, first, library],
  )

  // A shared comparison is how a group actually spreads, so it has to be
  // possible to keep what arrived in one — but only when asked, the same as
  // every other way a ranking gets written.
  const held = useMemo(
    () =>
      library.find(
        (entry) =>
          first && entry.provider === first.provider && entry.albumId === first.albumId,
      )?.rankings ?? [],
    [first, library],
  )
  const fresh = entries.filter((entry) => !held.some((item) => item.code === entry.code))

  /**
   * Anyone in this comparison whose ranking here is older than the one this
   * browser holds. A comparison is a snapshot, and the most ordinary thing a
   * group does — somebody re-ranks — silently makes every copy of that link
   * wrong. Until v4 carried a day stamp this was unanswerable.
   */
  const outdated = useMemo(
    () =>
      entries.flatMap((entry, index) => {
        const stamp = entry.ranking.stamp
        if (stamp === undefined || entry.ranking.author === undefined) return []
        const newer = held.find(
          (item) =>
            item.author === entry.ranking.author &&
            item.stamp !== undefined &&
            item.stamp > stamp &&
            item.code !== entry.code,
        )
        if (!newer) return []
        return [{ index, name: entry.ranking.label || `Listener ${index + 1}`, newer }]
      }),
    [entries, held],
  )

  const refresh = useCallback(() => {
    const next = [...codes]
    for (const stale of outdated) next[stale.index] = stale.newer.code
    navigate(hrefCompare(next))
  }, [codes, outdated])

  const keepAll = useCallback(() => {
    if (!album) return
    let next = library
    entries.forEach((entry, index) => {
      if (held.some((item) => item.code === entry.code)) return
      next = saveRanking(
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
          label: entry.ranking.label || `Listener ${index + 1}`,
          code: entry.code,
          order: entry.ranking.order,
          cuts: entry.ranking.cuts,
          savedAt: Date.now(),
          mine: isOwnCode(
            entry.ranking.provider,
            entry.ranking.albumId,
            entry.code,
            entry.ranking.author,
          ),
          author: entry.ranking.author,
        },
        false,
      )
    })
    setLibrary(next)
  }, [album, entries, held, library])

  const analysis = useMemo(() => {
    if (entries.length === 0) return null
    return compareRankings(
      entries.map((entry, index) => ({
        label: entry.ranking.label || `Listener ${index + 1}`,
        order: entry.ranking.order,
      })),
    )
  }, [entries])

  if (entries.length === 0) {
    return (
      <div className="compare fade-in">
        <h1 className="display">Compare rankings</h1>
        <p className="lede">
          Paste the links your friends sent you. Every ranking travels inside its own URL, so a
          group verdict needs nothing but the links themselves.
        </p>
        <CodeInput value={input} onChange={setInput} onSubmit={add} error={error} />
        {suggestions.length > 0 && (
          <div className="compare-suggestions">
            <span className="section-title">Already in your library</span>
            <div className="row wrap">
              {suggestions.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => add(entry.code)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (loading) return <RankingSkeleton />
  if (!album || !analysis) {
    return (
      <EmptyState icon="close" title="Could not load that album">
        The album behind these rankings is missing from the catalogue.
      </EmptyState>
    )
  }

  const names = entries.map((entry, index) => entry.ranking.label || `Listener ${index + 1}`)
  const tierOfRank = tierOfRankFromCuts(analysis.rows.length, proportionalCuts(analysis.rows.length))
  const titleOf = (index: number) => album.tracks[index]?.title ?? 'Unknown track'
  const agreementPct =
    analysis.agreement === null ? null : Math.round(((analysis.agreement + 1) / 2) * 100)

  return (
    <div className="compare fade-in">
      <div className="result-hero">
        <Art src={album.cover} alt={`${album.title} cover`} className="result-art" />
        <div className="result-hero-text">
          <span className="section-title">Compared</span>
          <h1 className="display">{album.title}</h1>
          <p className="muted">{album.artist}</p>
          <p className="row wrap compare-voters">
            {names.map((name) => (
              <span key={name} className="pill">
                <Icon name="users" size={13} />
                {name}
              </span>
            ))}
          </p>
        </div>
      </div>

      {outdated.length > 0 && (
        <p className="compare-warning card is-stale">
          <Icon name="undo" size={15} />
          <span>
            This comparison has{' '}
            {outdated.map((stale, i) => (
              <span key={stale.name}>
                {i > 0 && (i === outdated.length - 1 ? ' and ' : ', ')}
                <strong>{stale.name}</strong>&apos;s ranking from{' '}
                {daysSince(entries[stale.index]!.ranking.stamp)} days ago
              </span>
            ))}
            , and you have {outdated.length === 1 ? 'a newer one' : 'newer ones'}.
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={refresh}>
            Use the latest
          </button>
        </p>
      )}

      {unreadable > 0 && (
        <p className="compare-warning card">
          <Icon name="close" size={15} />
          {unreadable} of the {codes.length} rankings in this link could not be read — a long
          comparison link is easily cut short on its way through a chat. Ask whoever sent it to
          send it again.
        </p>
      )}

      {entries.length === 1 && (
        <p className="compare-warning card">
          <Icon name="users" size={15} />
          There is only one ranking here, so there is nothing to compare it against yet. Paste a
          friend&apos;s link below.
        </p>
      )}

      <section className="compare-keep card">
        <div>
          <h2>
            <Icon name="users" size={17} />{' '}
            {fresh.length === 0 ? 'In your library' : 'Keep these rankings'}
          </h2>
          <p className="muted">
            {fresh.length === 0
              ? 'Every ranking in this comparison is saved on this device.'
              : fresh.length === entries.length
                ? `Nothing here is on this device yet. Keep ${fresh.length === 1 ? 'it' : 'them'} and you can compare against ${fresh.length === 1 ? 'it' : 'them'} later, or re-read ${fresh.length === 1 ? 'it' : 'them'} without the link.`
                : `${entries.length - fresh.length} of these ${entries.length} are already here. Add the ${fresh.length === 1 ? 'other one' : `other ${fresh.length}`} to keep the whole comparison.`}
          </p>
        </div>
        {fresh.length > 0 && (
          <button type="button" className="btn btn-primary" onClick={keepAll}>
            <Icon name="check" size={15} />
            Add {fresh.length === 1 ? 'it' : `all ${fresh.length}`}
          </button>
        )}
      </section>

      {entries.length > 1 && agreementPct !== null && (
        <section className="agreement card">
          <div className="agreement-dial" style={{ '--pct': `${agreementPct}%` } as React.CSSProperties}>
            <strong className="tabular">{agreementPct}%</strong>
            <span className="faint">aligned</span>
          </div>
          <div className="agreement-text">
            <h2>
              {names.length === 2 ? `${names[0]} and ${names[1]}` : `All ${names.length} of you`}{' '}
              {agreementPct >= 80
                ? 'want the same record'
                : agreementPct >= 62
                  ? 'mostly agree'
                  : agreementPct >= 45
                    ? 'are about as close as strangers'
                    : agreementPct >= 30
                      ? 'are hearing different albums'
                      : 'could not disagree more'}
            </h2>
            <p className="muted">
              Of every possible pair of tracks, that is how often{' '}
              {names.length === 2 ? `${names[0]} and ${names[1]}` : 'two of you'} put them the same
              way round
              {names.length > 2 && `, averaged over all ${analysis.pairs.length} pairs of you`} —
              Kendall&apos;s tau, rescaled so 50% is what strangers would score.
            </p>
            {/* With three or more, who is closest to whom is the thing a group
                actually wants, and it is free once every pair is measured. */}
            {analysis.pairs.length > 1 && (
              <p className="compare-pairs faint">
                Closest: <strong>{names[analysis.pairs[0]!.a]}</strong> and{' '}
                <strong>{names[analysis.pairs[0]!.b]}</strong> at{' '}
                {Math.round(((analysis.pairs[0]!.tau + 1) / 2) * 100)}% · Furthest apart:{' '}
                <strong>{names[analysis.pairs[analysis.pairs.length - 1]!.a]}</strong> and{' '}
                <strong>{names[analysis.pairs[analysis.pairs.length - 1]!.b]}</strong> at{' '}
                {Math.round(((analysis.pairs[analysis.pairs.length - 1]!.tau + 1) / 2) * 100)}%
              </p>
            )}
          </div>
        </section>
      )}

      <div className="compare-columns">
        {entries.length > 1 && analysis.unanimous.length > 0 && (
          <section className="compare-panel card">
            <h2 className="section-title">Agreed on</h2>
            <ul>
              {analysis.unanimous.slice(0, 6).map((row) => (
                <li key={row.trackIndex}>
                  <span className="compare-pos tabular faint">
                    #{Math.round(row.mean) + 1}
                  </span>
                  <span>{titleOf(row.trackIndex)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {analysis.contested.length > 0 && (
          <section className="compare-panel card">
            <h2 className="section-title">Argued about</h2>
            <ul>
              {analysis.contested.slice(0, 6).map((row) => (
                <li key={row.trackIndex}>
                  <span className="compare-gap tabular">{row.spread}</span>
                  <span>
                    {titleOf(row.trackIndex)}
                    <span className="faint compare-detail">
                      {row.positions
                        .map((pos, i) => `${names[i]} #${pos === null ? '—' : pos + 1}`)
                        .join(' · ')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <h2 className="section-title compare-list-head">Together</h2>
      <GapChart
        names={names}
        rows={analysis.rows}
        titleOf={titleOf}
        tierOfRank={tierOfRank}
      />

      {/* The last step of the whole group flow used to be an unlabelled input
          under a heading about adding, which read as an echo of what you had
          just pasted. It is its own card now, and it says what it is for. */}
      <section className="share card">
        <div className="share-head">
          <h2>
            <Icon name="share" size={17} /> Send this back to the group
          </h2>
          <p className="muted">
            One link, all {entries.length} rankings. Everyone who opens it sees exactly this — and
            can add themselves to it.
          </p>
        </div>
        <div className="share-field">
          <input
            type="text"
            readOnly
            value={absoluteUrl(hrefCompare(codes))}
            onFocus={(event) => event.target.select()}
            aria-label="Link to this comparison"
          />
          <CopyButton value={absoluteUrl(hrefCompare(codes))} className="btn btn-primary btn-sm">
            Copy link
          </CopyButton>
        </div>
      </section>

      <section className="share card">
        <div className="share-head">
          <h2>
            <Icon name="users" size={17} /> Add another ranking
          </h2>
          <p className="muted">
            Paste a friend&apos;s link — or their whole comparison link — to fold them in. Pasting
            someone&apos;s newer ranking replaces the one already here.
          </p>
        </div>
        <CodeInput value={input} onChange={setInput} onSubmit={add} error={error} />
        {suggestions.length > 0 && (
          <div className="compare-suggestions">
            <span className="section-title">In your library, not in this comparison</span>
            <div className="row wrap">
              {suggestions.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => add(entry.code)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function CodeInput({
  value,
  onChange,
  onSubmit,
  error,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  error: string | null
}) {
  // Pasting a link should just work, without hunting for a button. Each value is
  // only auto-submitted once, or a rejected link would retry on every render.
  const attempted = useRef<string | null>(null)
  useEffect(() => {
    if (!value.includes('#/r/') || attempted.current === value) return
    attempted.current = value
    onSubmit(value)
  }, [onSubmit, value])

  return (
    <form
      className="code-input"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(value)
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Paste a ranking link"
        aria-label="Ranking link or code"
        aria-invalid={Boolean(error)}
      />
      <button type="submit" className="btn btn-primary btn-sm">
        <Icon name="arrowRight" size={15} />
        Add
      </button>
      {error && <p className="code-input-error">{error}</p>}
    </form>
  )
}
