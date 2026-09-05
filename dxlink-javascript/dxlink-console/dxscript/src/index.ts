/**
 * The INDICHART channel service: run dxScript indicators against a chart.
 *
 * Split out of `@dxfeed/dxlink-console-market-data` because of what it brings with it — the
 * dxScript editor and the dxScript-aware build of dxcharts-lite. Both are peer dependencies,
 * so a host that registers this plugin opts into them explicitly and one that does not never
 * installs them.
 */
export { indiChartChannelPlugin } from './plugin'
export type { IndiChartConfig, IndiChartRequest, IndiChartRequestEntry } from './types'
