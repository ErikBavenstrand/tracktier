# tracktier.

Rank every track on an album by duelling them head to head, then share the
result as a link. No account, no backend, no database — it deploys to GitHub
Pages as static files.

```bash
npm install
npm run dev
```

## How it works

**Ranking is a sort, not a rating.** Two tracks at a time, "which is better?",
with a 30-second preview on each side. A listener's favourite does not get
better while they answer, so their order is a fixed unknown — which makes this a
sorting problem, and sorting has a floor: log2(n!) comparisons, about 33 for a
13-track album.

That floor is why the engine is not Elo. Rating systems exist to track drifting
strength from noisy results, so they keep re-asking what transitivity has
already settled. Simulated against consistent answers, Glicko needed roughly 45
duels for a 13-track album and still left pairs out of order; binary insertion
finishes it in 32. The published comparisons agree — merge-sort ranking beats
Elo on accuracy while cutting comparisons by up to 70%, and
["the Elo rating system does not perform well even in noiseless cases"](https://link.springer.com/chapter/10.1007/978-3-031-70378-2_15).

**Progress is exact, because the work is finite.** The bar shows comparisons
done against comparisons needed, and reaches 100% when the sort terminates — not
a confidence heuristic that stalls in the eighties. An earlier version derived
confidence from whether the order had stopped changing, which sagged precisely
when the ranking was being refined best, because the matchmaker deliberately
paired the two closest tracks.

**Mistakes are expected, so there is a second pass.** A sort takes every answer
as true, and one slip during a wide binary search can carry a track several
places off. Measured over 200 runs of a 16-track album with a single wrong
answer, 88% of tracks still land within one position — but the worst case
reaches a displacement of 34. Re-asking each neighbouring pair costs n-1
questions and is exactly where a displaced track surfaces: on a 20-track album
that took total displacement from 11.8 to 0.8. It is offered once the order
exists, never forced.

**Tiers come from proportion, and that is a real cost.** A sort learns order and
nothing about the distance between neighbours, so there are no gaps for natural
breaks to find, and the bands are shares of the list — a small top, a wide
middle, a short tail. Jenks natural breaks is kept in `lib/tiers.ts` against any
future source of magnitude, because cuts placed at real gaps are better when
there are real gaps to place them at.

**Sharing is the URL.** A ranking encodes to a bit-packed permutation plus tier
boundaries and an album reference — a 13-track album fits in 24 characters. The
recipient's browser refetches the album itself, so nothing but positions travels.
The code lives in the URL *fragment*, which browsers never transmit, so on
GitHub Pages a shared ranking is not merely unstored, it is unobservable by the
host. A checksum catches links truncated by chat clients.

**The results page says where you actually are.** A ranking is not simply open
or closed, so it is not described as though it were: half-placed shows how many
tracks have a position and lists the rest below a line unranked, with sharing
withheld — a link then would hand someone an order that is partly just the order
the tracks were dealt in. A finished but unchecked ranking offers the sharpening
pass. A sorted and checked one says so once and gets out of the way.

**Nothing needs saving.** A ranking joins your library on the first answer, not
at the finish line, and updates as you go — an abandoned session is still an
opinion, and it should be on the home screen rather than needing the album's URL
to find again.

Paste several links into `#/c/<code>~<code>` and they merge into a consensus by
average rank, with the most divisive track called out. That is the whole
multiplayer story: no accounts, no lobby, no server.

### Sources

- Maystre & Grossglauser, [*Just Sort It! A Simple and Effective Approach to Active Preference Learning*](https://arxiv.org/abs/1502.05556) — sorting selects informative comparisons even when answers are noisy, matching Bayesian information-gain methods at a fraction of the cost.
- Li et al., [*A Merge Sort Based Ranking System for the Evaluation of LLMs*](https://link.springer.com/chapter/10.1007/978-3-031-70378-2_15) — sort-based ranking against Elo, on both accuracy and comparison budget.
- Glickman, [the Glicko rating system](https://en.wikipedia.org/wiki/Glicko_rating_system) — the rating deviation that a pure Elo implementation lacks.

## Keyboard

The duel screen is built to be played without a mouse; every shortcut is printed
on the control it drives and summarised under the actions.

| | |
|---|---|
| `←` `→` | pick a side |
| `1` `2` | hear each side |
| `↓` `space` | too close to call |
| `Z` | undo |
| `enter` | finish |

`space` is left alone whenever a button has focus, so tabbing to a control and
pressing space still activates it rather than skipping the pair.

## Data source

One catalogue supplies everything — search, artwork, tracklists and preview
clips. Swap it in [`src/config.ts`](src/config.ts):

```ts
export const DATA_SOURCE: SourceMode = 'deezer'  // 'deezer' | 'itunes' | 'all'
```

| Source | Coverage¹ | Previews | Transport |
|---|---|---|---|
| **Deezer** (default) | 19/20 | 30s, URLs expire after ~15 min | JSONP — the API sends no CORS headers |
| Apple / iTunes | 14/20 | 30s, URLs never expire | plain `fetch` |

¹ Canonical albums found by an artist+title search, measured across 20 records.

iTunes' gaps are structural, not random: `itunes.apple.com/search` indexes the
iTunes Store *download* catalogue, not Apple Music's streaming catalogue, so
streaming-era releases go missing — *Blonde* and *Nevermind* return tribute
albums and piano covers instead of the records themselves. It is kept as a
drop-in alternative because its preview URLs never expire and it needs no JSONP.

To add a catalogue, implement `Provider` in `src/lib/providers/`, register it in
`providers/index.ts`, and name it in the config. Nothing outside that folder
knows which source is active.

### Why not Spotify?

`api.spotify.com` returns 401 without an OAuth token, and the only token
obtainable without a user requires a client *secret*, which cannot ship in a
public bundle. Since late 2024 it also returns `preview_url: null` for new apps,
so previews would not work even with a token.

Spotify is still integrated where it can be: paste a Spotify album link and it
resolves through the public, CORS-enabled `/oembed` endpoint, then cross-matches
to the active catalogue for playable audio. "Open in Spotify" links work
everywhere.

One unauthenticated Spotify endpoint *does* carry the full tracklist and real
`p.scdn.co` preview URLs — the `__NEXT_DATA__` blob inside
`open.spotify.com/embed/album/<id>`. It just sends no `Access-Control-Allow-Origin`,
so a browser cannot read it. [`worker/spotify-cors-proxy.js`](worker/spotify-cors-proxy.js)
is a ~40-line Cloudflare Worker that adds that one header; set
`VITE_SPOTIFY_PROXY` to use it. Entirely optional — the app never needs it.

## Deploying

Live at **[bavenstrand.se/tracktier](https://bavenstrand.se/tracktier/)**.

Push to `main`. The workflow typechecks, runs the tests, builds, copies
`index.html` to `404.html` so deep links survive a refresh, and publishes to
GitHub Pages. Pages is set to "GitHub Actions" as its source.

The build sets `VITE_BASE` to `/<repo>/` because this is a project page served
from a subpath — without it every asset URL resolves against the domain root and
the page loads nothing. Moving the site to a domain of its own would mean
dropping that and adding a `public/CNAME`.

## Notes for maintainers

Deezer is reached over JSONP, which has one sharp edge worth knowing about: an
abandoned request cannot be cancelled, only ignored. `lib/providers/jsonp.ts`
therefore leaves a self-removing no-op behind instead of deleting the callback,
because a late response is literally `callback({...})` and would otherwise throw
a ReferenceError from a cross-origin script — surfacing only as the opaque
"Script error." with no file or line.

## Storage

Everything lives in `localStorage`: your rankings, an album cache, and the
in-progress duel session (written after every verdict, so a refresh loses
nothing). Deezer's signed preview URLs expire after ~15 minutes, so its cache
entries are short-lived and refreshed behind a stale tracklist rather than
blocking on it. Every read and write is wrapped — a browser blocking site
storage degrades to share links still working.

## Commands

| | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build to `dist/` |
| `npm test` | share-codec and ranking-engine tests |
| `npm run typecheck` | types only |
