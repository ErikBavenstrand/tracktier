import { useEffect } from 'react'

const SUFFIX = 'tracktier.'

/**
 * Keep the tab title in step with the route.
 *
 * Rankings are shared as links and reopened from history, where the title is
 * the only label the browser has to offer — "Nevermind tier list" is findable,
 * a dozen identical entries are not.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    const previous = document.title
    document.title = title ? `${title} — ${SUFFIX}` : `${SUFFIX} — rank every track on an album`
    return () => {
      document.title = previous
    }
  }, [title])
}
