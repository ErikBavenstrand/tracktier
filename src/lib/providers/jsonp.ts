/**
 * Deezer's public API answers any origin but never sends
 * `Access-Control-Allow-Origin`, so `fetch` from a browser is blocked. It does
 * support JSONP, which is the documented escape hatch and the only way to read
 * it from a static site.
 *
 * JSONP executes whatever the host returns, so this is deliberately limited to
 * the one origin below — never call it with a URL derived from user input.
 */
const ALLOWED_ORIGIN = 'https://api.deezer.com'

let seq = 0

/** How long an abandoned callback stays behind waiting for a late response. */
const STUB_TTL_MS = 60_000

const globals = () => window as unknown as Record<string, unknown>

export function jsonp<T>(url: string, signal?: AbortSignal, timeoutMs = 12_000): Promise<T> {
  const parsed = new URL(url)
  if (parsed.origin !== ALLOWED_ORIGIN) {
    throw new Error(`jsonp refused for origin ${parsed.origin}`)
  }

  return new Promise<T>((resolve, reject) => {
    const name = `__tw_jsonp_${Date.now().toString(36)}_${seq++}`
    parsed.searchParams.set('output', 'jsonp')
    parsed.searchParams.set('callback', name)

    const script = document.createElement('script')
    let timer: number | undefined

    /**
     * `settled` means the response already ran, so the callback can go.
     *
     * Anything else — abort, timeout, load failure — may still have a request
     * in flight, and JSONP responses are literally `callback({...})`. Deleting
     * the callback first makes that late script throw a ReferenceError from a
     * cross-origin origin, which no handler can catch and which the browser
     * reports only as the useless "Script error.". Leaving a self-removing
     * no-op behind gives the straggler something harmless to call.
     */
    const cleanup = (settled: boolean) => {
      window.clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      script.remove()

      if (settled) {
        delete globals()[name]
        return
      }
      globals()[name] = () => {
        delete globals()[name]
      }
      window.setTimeout(() => {
        delete globals()[name]
      }, STUB_TTL_MS)
    }

    const onAbort = () => {
      cleanup(false)
      reject(new DOMException('Aborted', 'AbortError'))
    }

    if (signal?.aborted) return onAbort()
    signal?.addEventListener('abort', onAbort)

    globals()[name] = (data: T) => {
      cleanup(true)
      resolve(data)
    }

    timer = window.setTimeout(() => {
      cleanup(false)
      reject(new Error(`JSONP request timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    script.src = parsed.toString()
    script.async = true
    script.onerror = () => {
      cleanup(false)
      reject(new Error('JSONP request failed to load'))
    }
    document.head.append(script)
  })
}
