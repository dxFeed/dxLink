import { Layer } from 'effect'

import { domLayer } from './dom'
import { feedLayer } from './feed'

/** The live state behind both plugins, for the runtime's `resources`. */
export const marketDataLayer = Layer.mergeAll(feedLayer, domLayer)
