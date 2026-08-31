/**
 * Default dxLink WebSocket endpoint used in development — the shared dev relay,
 * so the console connects to a real server out of the box (the page is served
 * from localhost in dev, which is not itself a dxLink endpoint).
 *
 * Deliberate: a dev build points at a shared server rather than `localhost:9959`,
 * which is what the legacy console defaulted to. This relay serves FEED and DOM
 * but **not** INDICHART — see CLAUDE.md for the endpoint per service.
 */
export const DEV_WS_URL = 'wss://dxlink-md-ws-dev.dxkube.com'

/** The subset of `Location` the URL derivation actually reads. */
export type LocationLike = Pick<Location, 'protocol' | 'host' | 'pathname'>

/**
 * Derive a dxLink WebSocket URL from a browser location, mirroring the legacy
 * console behaviour:
 *  - strip a trailing `/debug` path segment, so a console served under `/debug`
 *    resolves to the endpoint it is served alongside rather than to itself,
 *  - pick `wss://` when the page is served over https, `ws://` otherwise.
 */
export const deriveWsUrlFromLocation = (location: LocationLike): string => {
  const debugIndex = location.pathname.indexOf('/debug')
  const pathname = debugIndex !== -1 ? location.pathname.slice(0, debugIndex) : location.pathname
  const secure = location.protocol.startsWith('https')

  return `ws${secure ? 's' : ''}://${location.host}${pathname}`
}

/**
 * The URL the connection form starts with. Settled behaviour, not a placeholder:
 *  - production: auto-discovered from the URL the console was opened at, so a build
 *    served next to an endpoint finds it without configuration,
 *  - development: the shared dev relay (`DEV_WS_URL`).
 *
 * `location` and `isProduction` are injectable to keep this pure and testable;
 * callers pass `import.meta.env.PROD` for the latter.
 */
export const getDefaultWsUrl = (location: LocationLike, isProduction: boolean): string =>
  isProduction ? deriveWsUrlFromLocation(location) : DEV_WS_URL
