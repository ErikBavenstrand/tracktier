import type { ProviderId } from './providers/types'

/**
 * Hash routing, chosen deliberately rather than for convenience.
 *
 * GitHub Pages has no rewrite rules, so a path-based route 404s on refresh.
 * More importantly, browsers never transmit the fragment to the server: a
 * shared ranking is not just unstored, it is never seen by the host at all.
 */

export type Route =
  | { name: 'home' }
  | { name: 'album'; provider: ProviderId; id: string }
  | { name: 'rank'; provider: ProviderId; id: string }
  | { name: 'ranking'; code: string }
  | { name: 'compare'; codes: string[] }

const PROVIDERS: ProviderId[] = ['deezer', 'itunes', 'spotify']

const parseRef = (value: string): { provider: ProviderId; id: string } | null => {
  const [provider, ...rest] = value.split(':')
  const id = rest.join(':')
  return provider && id && PROVIDERS.includes(provider as ProviderId)
    ? { provider: provider as ProviderId, id }
    : null
}

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '')
  const [head, ...tail] = path.split('/')
  const rest = tail.join('/')

  switch (head) {
    case 'album': {
      const ref = parseRef(decodeURIComponent(rest))
      return ref ? { name: 'album', ...ref } : { name: 'home' }
    }
    case 'rank': {
      const ref = parseRef(decodeURIComponent(rest))
      return ref ? { name: 'rank', ...ref } : { name: 'home' }
    }
    case 'r':
      return rest ? { name: 'ranking', code: rest } : { name: 'home' }
    case 'c':
      // An empty list is valid: it is the screen that asks for the first link.
      return { name: 'compare', codes: rest.split('~').filter(Boolean) }
    default:
      return { name: 'home' }
  }
}

export const hrefHome = () => '#/'
export const hrefAlbum = (provider: ProviderId, id: string) => `#/album/${provider}:${id}`
export const hrefRank = (provider: ProviderId, id: string) => `#/rank/${provider}:${id}`
export const hrefRanking = (code: string) => `#/r/${code}`
export const hrefCompare = (codes: string[]) => `#/c/${codes.join('~')}`

export function navigate(href: string): void {
  if (window.location.hash === href) return
  window.location.hash = href
}

/** Absolute URL for sharing, with the fragment preserved. */
export function absoluteUrl(href: string): string {
  const { origin, pathname, search } = window.location
  return `${origin}${pathname}${search}${href.startsWith('#') ? href : `#${href}`}`
}
