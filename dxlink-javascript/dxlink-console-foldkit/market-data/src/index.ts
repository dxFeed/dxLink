/**
 * The market-data channel services: FEED and DOM.
 *
 * Importing this barrel pulls in both, and with them the candle chart. A host that wants only
 * one imports the subpaths instead — `/feed` and `/dom` — so the other's dependencies never
 * reach its bundle.
 */
import { Layer } from 'effect'

import { domLayer } from './dom'
import { feedLayer } from './feed'

export * from './feed'
export * from './dom'

/** The live state behind both plugins, for the runtime's `resources`. */
export const marketDataLayer = Layer.mergeAll(feedLayer, domLayer)
