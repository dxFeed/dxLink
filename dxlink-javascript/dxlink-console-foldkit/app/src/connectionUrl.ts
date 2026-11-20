/**
 * Default dxLink WebSocket endpoint used in development — the shared dev relay, so the
 * console connects to a real server out of the box (the page is served from localhost in
 * dev, which is not itself a dxLink endpoint). The relay serves FEED and DOM.
 */
export const DEV_WS_URL = 'wss://dxlink-md-ws-dev.dxkube.com'

/** The subset of `Location` the URL derivation actually reads. */
export type LocationLike = Pick<Location, 'protocol' | 'host' | 'pathname'>

/**
 * Derive a dxLink WebSocket URL from a browser location:
 *  - strip a trailing `/debug` path segment, so a console served under `/debug` resolves to
 *    the endpoint it is served alongside rather than to itself,
 *  - pick `wss://` when the page is served over https, `ws://` otherwise.
 */
export const deriveWsUrlFromLocation = (location: LocationLike): string => {
  const debugIndex = location.pathname.indexOf('/debug')
  const pathname = debugIndex === -1 ? location.pathname : location.pathname.slice(0, debugIndex)
  const scheme = location.protocol.startsWith('https') ? 'wss' : 'ws'

  return `${scheme}://${location.host}${pathname}`
}

/**
 * The URL the connection form starts with:
 *  - production: derived from the URL the console was opened at, so a build served next to
 *    an endpoint finds it without configuration,
 *  - development: the shared dev relay ({@link DEV_WS_URL}).
 */
export const getDefaultWsUrl = (location: LocationLike, isProduction: boolean): string =>
  isProduction ? deriveWsUrlFromLocation(location) : DEV_WS_URL
