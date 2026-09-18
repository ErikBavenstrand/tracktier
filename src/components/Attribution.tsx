import deezerLogo from '../assets/deezer-logo.svg'
import { providers } from '../lib/providers'

/**
 * Credit for whichever catalogue is supplying the data.
 *
 * This is a licence condition rather than a courtesy. Deezer's API terms
 * require every application using it to show a clearly visible Deezer logo,
 * and Apple requires song previews to carry a "provided courtesy of iTunes"
 * credit. Which one appears follows `DATA_SOURCE`, so switching catalogues
 * cannot quietly leave the wrong credit — or none — on the page.
 *
 * https://developers.deezer.com/guidelines/logo
 */
export function Attribution() {
  const active = new Set(providers.map((provider) => provider.id))

  return (
    <span className="attribution">
      {active.has('deezer') && (
        <a
          className="attribution-deezer"
          href="https://www.deezer.com"
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Albums and previews from Deezer"
        >
          <span className="attribution-label">Albums and previews from</span>
          {/* Deezer's own mark, unmodified and large enough to actually read,
              which is what their guidelines mean by "clearly visible". */}
          <img src={deezerLogo} alt="Deezer" height={26} />
        </a>
      )}

      {active.has('itunes') && (
        <a
          href="https://music.apple.com"
          target="_blank"
          rel="noreferrer noopener"
          className="faint"
        >
          Song previews provided courtesy of iTunes
        </a>
      )}
    </span>
  )
}
