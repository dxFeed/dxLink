/**
 * The market-data channel services: FEED and DOM.
 *
 * Importing this barrel pulls in both, and with them the candle chart. A host that wants only
 * one imports the subpaths instead — `/feed` and `/dom` — so the other's dependencies never
 * reach its bundle.
 */
export * from './feed'
export * from './dom'
export { marketDataLayer } from './layer'
