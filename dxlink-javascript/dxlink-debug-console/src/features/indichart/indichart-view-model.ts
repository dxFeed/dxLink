import { DXLinkChannelState, DXLinkIndiChart } from '@dxfeed/dxlink-api'
import type {
  DXLinkClient,
  DXLinkIndiChartCandle,
  DXLinkIndiChartIndicators,
  DXLinkIndiChartIndicatorsData,
  DXLinkIndiChartIndicatorsParameters,
  DXLinkIndiChartIndicatorsStates,
  DXLinkIndiChartIndicatorState,
} from '@dxfeed/dxlink-api'
import { createStore } from 'zustand/vanilla'

import { ChannelErrorTracker } from '../../shared/lib/channel-errors'
import type { ChannelErrorState } from '../../shared/lib/channel-errors'
import type { ViewModel } from '../../shared/view-model'

export type ChartDataType = 'candles' | 'indicators' | 'update'

/** Imperative chart sink (the view wires this to `chartRef.pushData`). */
export type IndiChartListener = (
  candles: DXLinkIndiChartCandle[],
  indicators: DXLinkIndiChartIndicatorsData[],
  dataType: ChartDataType
) => void

export type IndicatorOutputKind = 'output' | 'spline' | 'shape' | 'barColor' | 'backgroundColor'

/** A declared output of an indicator, taken from its (enabled) state with its meta. */
export interface IndicatorOutputMeta {
  kind: IndicatorOutputKind
  id?: number
  title?: string
  style?: string
  offset?: number
  overlay?: boolean
}

export interface IndiChartVMState extends ChannelErrorState {
  channelState: DXLinkChannelState
  /** Per-indicator states reported by the server (in/out params or script error). */
  indicatorStates: DXLinkIndiChartIndicatorsStates | null
  /** Per-indicator declared outputs (output/spline/shape/barColor/backgroundColor) from the state. */
  outputs: Record<string, IndicatorOutputMeta[]>
  subscription: { symbol: string; fromTime: number } | null
}

// The enabled indicator state carries one array per output kind (plural field names),
// which the TS type does not model — read them defensively from the raw object.
const OUTPUT_FIELDS: { field: string; kind: IndicatorOutputKind }[] = [
  { field: 'outputs', kind: 'output' },
  { field: 'splines', kind: 'spline' },
  { field: 'shapes', kind: 'shape' },
  { field: 'barColors', kind: 'barColor' },
  { field: 'backgroundColors', kind: 'backgroundColor' },
]

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)

const extractStateOutputs = (state: DXLinkIndiChartIndicatorState): IndicatorOutputMeta[] => {
  if (!state.enabled) return []
  const raw = state as unknown as Record<string, unknown>
  const outputs: IndicatorOutputMeta[] = []
  for (const { field, kind } of OUTPUT_FIELDS) {
    const series = raw[field]
    if (Array.isArray(series)) {
      for (const item of series) {
        const o = (item ?? {}) as Record<string, unknown>
        outputs.push({
          kind,
          id: num(o.id),
          title: str(o.title),
          style: str(o.style),
          offset: num(o.offset),
          overlay: bool(o.overlay),
        })
      }
    }
  }
  return outputs
}

/**
 * ViewModel for one IndiChart channel — wraps {@link DXLinkIndiChart} and ports
 * the legacy `chart-wrapper.ts` `ChartHolder` snapshot/update coordination.
 *
 * Construction is PURE (StrictMode-safe): the channel opens in {@link start} and
 * releases in {@link stop} via the view's `useEffect`. Indicator scripts are fixed
 * at construction (named "1".."N"); candle/indicator data is forwarded to the chart
 * through an imperative {@link IndiChartListener}, while channel + indicator states
 * go to the store.
 */
export class IndiChartViewModel implements ViewModel<IndiChartVMState> {
  readonly store = createStore<IndiChartVMState>(() => ({
    channelState: DXLinkChannelState.REQUESTED,
    indicatorStates: null,
    outputs: {},
    subscription: null,
    channelId: null,
    errors: [],
  }))

  private readonly channelErrors = new ChannelErrorTracker(this.store)
  private readonly client: DXLinkClient
  private readonly indicators: DXLinkIndiChartIndicators
  private chart: DXLinkIndiChart | null = null
  private chartListener: IndiChartListener | null = null

  // Snapshot/update coordination (ported from ChartHolder).
  private snapshot = false
  private pendingCandles: DXLinkIndiChartCandle[] = []
  private pendingIndicators: DXLinkIndiChartIndicatorsData[] = []
  private snapshotCandles: DXLinkIndiChartCandle[] = []
  private candlesSnapshotSent = false

  constructor(client: DXLinkClient, scripts: string[]) {
    this.client = client
    const indicators: Record<string, { lang: 'dxscript-js'; content: string }> = {}
    scripts.forEach((content, index) => {
      indicators[String(index + 1)] = { lang: 'dxscript-js', content }
    })
    this.indicators = indicators
  }

  /** Names of the indicators ("1".."N"), in order. */
  get indicatorNames(): string[] {
    return Object.keys(this.indicators)
  }

  setChartListener = (listener: IndiChartListener | null): void => {
    this.chartListener = listener
  }

  start = (): void => {
    if (this.chart !== null) return
    const chart = new DXLinkIndiChart(this.client, this.indicators)
    chart.addIndicatorsStateChangeListener(this.handleIndicatorStates)
    chart.addCandleSnapshotListener(this.handleCandleSnapshot)
    chart.addIndicatorsSnapshotListener(this.handleIndicatorsSnapshot)
    chart.addUpdateListener(this.handleUpdate)
    const channel = chart.getChannel()
    channel.addStateChangeListener(this.handleState)
    // withParameters: false — an INDICHART channel's parameters carry the full source of
    // every indicator, which the indicator panels already render from `config`.
    this.channelErrors.attach(channel, { withParameters: false })
    this.chart = chart
    this.store.setState({ channelState: chart.getState() })
    // Re-apply an existing subscription after a StrictMode restart.
    const { subscription } = this.store.getState()
    if (subscription !== null) {
      chart.setSubscription(subscription, {})
    }
  }

  stop = (): void => {
    const chart = this.chart
    if (chart === null) return
    this.chart = null
    chart.removeIndicatorsStateChangeListener(this.handleIndicatorStates)
    chart.removeCandleSnapshotListener(this.handleCandleSnapshot)
    chart.removeIndicatorsSnapshotListener(this.handleIndicatorsSnapshot)
    chart.removeUpdateListener(this.handleUpdate)
    const channel = chart.getChannel()
    channel.removeStateChangeListener(this.handleState)
    this.channelErrors.detach(channel)
    chart.close()
    this.resetCoordination()
  }

  /**
   * Apply the symbol/fromTime and all indicator parameters together.
   *
   * `outputs` is deliberately left alone. An indicator's declared outputs come from its
   * compiled state, which is scoped to the script — fixed for this channel's lifetime —
   * not to the subscription. The server reports indicator states once, when the scripts
   * compile, and does not repeat them for a re-subscribe; clearing the outputs here left
   * the panel showing "0 outputs" with the Outputs section gone, while the chart went on
   * drawing those very series.
   */
  apply = (
    symbol: string,
    fromTime: number,
    parameters: DXLinkIndiChartIndicatorsParameters
  ): void => {
    const subscription = { symbol, fromTime }
    this.resetCoordination()
    this.store.setState({ subscription })
    this.chart?.setSubscription(subscription, parameters)
  }

  /**
   * Push new indicator parameters without re-subscribing.
   *
   * The server keeps the current subscription and recomputes the indicators, so the
   * candles are not refetched and the chart is not reset — the difference between
   * tweaking a moving-average period and reloading the whole history.
   */
  applyParameters = (parameters: DXLinkIndiChartIndicatorsParameters): void => {
    this.chart?.updateIndicatorsParameters(parameters)
  }

  /**
   * Drop the subscription and all derived state, leaving a fresh channel ready for a new
   * one.
   *
   * The protocol has no way to cancel an INDICHART subscription short of replacing it, so
   * clearing local state alone would leave the server streaming into a chart the UI says
   * is empty. The channel is therefore closed and reopened — which is what
   * `ChartHolder.clear()` did in dxlink-docs. The channel id changes as a result.
   *
   * Errors are deliberately kept: they are a log of what this channel did, and the widget
   * has its own explicit Clear.
   */
  reset = (): void => {
    const wasStarted = this.chart !== null
    this.stop()
    this.store.setState({ subscription: null, outputs: {}, indicatorStates: null })
    if (wasStarted) {
      this.start()
    }
  }

  clearErrors = (): void => this.channelErrors.clear()

  close = (): void => {
    this.stop()
  }

  dispose = (): void => {
    this.stop()
  }

  private resetCoordination = (): void => {
    this.snapshot = false
    this.pendingCandles = []
    this.pendingIndicators = []
    this.snapshotCandles = []
    this.candlesSnapshotSent = false
  }

  private handleIndicatorStates = (states: DXLinkIndiChartIndicatorsStates): void => {
    const outputs: Record<string, IndicatorOutputMeta[]> = {}
    for (const [name, state] of Object.entries(states)) {
      outputs[name] = extractStateOutputs(state)
    }
    this.store.setState({ indicatorStates: states, outputs })
  }

  private handleState = (state: DXLinkChannelState): void => {
    this.store.setState({ channelState: state })
  }

  // --- ChartHolder snapshot/update coordination (ported verbatim in behaviour) ---

  private handleCandleSnapshot = (
    candles: DXLinkIndiChartCandle[],
    reset: boolean,
    pending: boolean
  ): void => {
    if (reset) {
      this.snapshot = true
      this.pendingCandles = []
      this.pendingIndicators = []
      this.snapshotCandles = []
      this.candlesSnapshotSent = false
    }

    this.pendingCandles.push(...candles)

    if (!pending && this.snapshot && !this.candlesSnapshotSent) {
      this.candlesSnapshotSent = true
      this.snapshotCandles = [...this.pendingCandles]
      if (this.pendingCandles.length > 0) {
        this.chartListener?.(this.pendingCandles, [], 'candles')
        this.pendingCandles = []
      }
    }
  }

  private handleIndicatorsSnapshot = (
    indicators: DXLinkIndiChartIndicatorsData,
    pending: boolean
  ): void => {
    this.pendingIndicators.push(indicators)

    if (!pending && this.snapshot && this.candlesSnapshotSent) {
      if (this.pendingIndicators.length > 0) {
        this.chartListener?.(this.snapshotCandles, this.pendingIndicators, 'indicators')
        this.pendingIndicators = []
        this.snapshot = false
        this.snapshotCandles = []
        this.candlesSnapshotSent = false
      }
    }
  }

  private handleUpdate = (
    candles: DXLinkIndiChartCandle[],
    indicators: DXLinkIndiChartIndicatorsData,
    pending: boolean
  ): void => {
    this.pendingCandles.push(...candles)
    this.pendingIndicators.push(indicators)

    if (pending) return

    if (this.pendingCandles.length > 0) {
      this.chartListener?.(this.pendingCandles, this.pendingIndicators, 'update')
      this.pendingCandles = []
      this.pendingIndicators = []
    }
  }
}
