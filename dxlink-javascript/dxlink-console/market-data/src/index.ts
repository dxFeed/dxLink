/**
 * The market-data channel services: FEED, DOM and INDICHART.
 *
 * Importing this barrel pulls in all three, and with them dxcharts-lite, the dxScript editor
 * and the data grid. A host that wants only some of them should import the subpaths instead —
 * `@dxfeed/dxlink-console-market-data/feed` and friends — so the others' dependencies never
 * reach the bundle. That granularity is the reason the subpaths exist.
 */
export * from './feed'
export * from './dom'
export * from './indichart'
