/**
 * The market-data channel services: FEED and DOM.
 *
 * Importing this barrel pulls in both, and with them the data grid and the candle chart. A
 * host that wants only one should import the subpaths instead —
 * `@dxfeed/dxlink-console-market-data/feed` and `/dom` — so the other's dependencies never
 * reach the bundle. That granularity is the reason the subpaths exist.
 *
 * The INDICHART service lives in `@dxfeed/dxlink-console-dxscript`: it needs the dxScript
 * editor and the dxScript-aware chart, and nothing here should make a host install those.
 */
export * from './feed'
export * from './dom'
