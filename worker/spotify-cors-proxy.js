/**
 * Optional Cloudflare Worker: adds the one HTTP header Spotify leaves off.
 *
 * `open.spotify.com/embed/album/<id>` is unauthenticated and already contains
 * the full tracklist plus `p.scdn.co` preview URLs in its `__NEXT_DATA__`. The
 * page simply sends no `Access-Control-Allow-Origin`, so a browser on GitHub
 * Pages cannot read it. This forwards the request and adds that header.
 *
 * Tracktour does NOT need this. It runs entirely on Deezer, which supplies
 * search, artwork, tracklists and previews on its own. Deploy this only if you
 * want rankings keyed to real Spotify album ids, then set
 * `VITE_SPOTIFY_PROXY=https://<your-worker>.workers.dev` at build time.
 *
 *   npx wrangler deploy worker/spotify-cors-proxy.js --name spotify-cors
 *
 * Set ALLOWED_ORIGINS to your own site before deploying, or you are running an
 * open proxy for anyone who finds the URL.
 */

const ALLOWED_ORIGINS = [
  'http://localhost:5178',
  // 'https://<your-username>.github.io',
]

const UPSTREAM = 'https://open.spotify.com'

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') ?? ''
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]

    const cors = {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin',
    }

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors })
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return new Response('Origin not allowed', { status: 403, headers: cors })
    }

    // Only ever proxy embed pages — never turn this into a general web proxy.
    const { pathname } = new URL(request.url)
    if (!/^\/embed\/(album|track)\/[A-Za-z0-9]{22}$/.test(pathname)) {
      return new Response('Not found', { status: 404, headers: cors })
    }

    const upstream = await fetch(`${UPSTREAM}${pathname}`, {
      headers: {
        // Spotify serves the data-bearing page only to a browser-like client.
        'User-Agent': 'Mozilla/5.0 (compatible; Tracktour/1.0)',
        'Accept-Language': 'en',
      },
      cf: { cacheTtl: 3600, cacheEverything: true },
    })

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...cors,
        'Content-Type': upstream.headers.get('Content-Type') ?? 'text/html',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  },
}
