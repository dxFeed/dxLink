import { DXLinkIndiChart } from '@dxfeed/dxlink-api'
import type {
  DXLinkClient,
  DXLinkIndiChartCandle,
  DXLinkIndiChartIndicators,
  DXLinkIndiChartIndicatorsData,
  DXLinkIndiChartIndicatorsParameters,
  DXLinkIndiChartIndicatorsStates,
  DXLinkIndiChartIndicatorState,
} from '@dxfeed/dxlink-api'
import {
  channelStateAtoms,
  command,
  makeChannelAtoms,
  on,
  session,
  trackChannel,
} from '@dxfeed/dxlink-console-core'
import type { ChannelAtoms, Session } from '@dxfeed/dxlink-console-core'
import { Effect } from 'effect'
import * as Atom from 'effect/reactivity/Atom'
import { AtomRegistry } from 'effect/reactivity/AtomRegistry'

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

export interface IndiChartSubscription {
  symbol: string
  fromTime: number
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
 * Coordinates the chart's snapshot and update pushes — ported verbatim in behaviour from the
 * legacy `chart-wrapper.ts` `ChartHolder`.
 *
 * A snapshot arrives as candles first, then indicators, each possibly over several pending
 * frames; the chart wants the candles once complete, then the indicators against those same
 * candles, and only then updates.
 */
export class ChartCoordinator {
  private snapshot = false
  private pendingCandles: DXLinkIndiChartCandle[] = []
  private pendingIndicators: DXLinkIndiChartIndicatorsData[] = []
  private snapshotCandles: DXLinkIndiChartCandle[] = []
  private candlesSnapshotSent = false

  constructor(private readonly push: IndiChartListener) {}

  reset = (): void => {
    this.snapshot = false
    this.pendingCandles = []
    this.pendingIndicators = []
    this.snapshotCandles = []
    this.candlesSnapshotSent = false
  }

  candleSnapshot = (candles: DXLinkIndiChartCandle[], reset: boolean, pending: boolean): void => {
    if (reset) {
      this.reset()
      this.snapshot = true
    }

    this.pendingCandles.push(...candles)

    if (!pending && this.snapshot && !this.candlesSnapshotSent) {
      this.candlesSnapshotSent = true
      this.snapshotCandles = [...this.pendingCandles]
      if (this.pendingCandles.length > 0) {
        this.push(this.pendingCandles, [], 'candles')
        this.pendingCandles = []
      }
    }
  }

  indicatorsSnapshot = (indicators: DXLinkIndiChartIndicatorsData, pending: boolean): void => {
    this.pendingIndicators.push(indicators)

    if (!pending && this.snapshot && this.candlesSnapshotSent) {
      if (this.pendingIndicators.length > 0) {
        this.push(this.snapshotCandles, this.pendingIndicators, 'indicators')
        this.pendingIndicators = []
        this.snapshot = false
        this.snapshotCandles = []
        this.candlesSnapshotSent = false
      }
    }
  }

  update = (
    candles: DXLinkIndiChartCandle[],
    indicators: DXLinkIndiChartIndicatorsData,
    pending: boolean
  ): void => {
    this.pendingCandles.push(...candles)
    this.pendingIndicators.push(indicators)

    if (pending) return

    if (this.pendingCandles.length > 0) {
      this.push(this.pendingCandles, this.pendingIndicators, 'update')
      this.pendingCandles = []
      this.pendingIndicators = []
    }
  }
}

/** One IndiChart channel — wraps {@link DXLinkIndiChart}. */
export interface IndiChartModel {
  readonly channel: ChannelAtoms
  readonly session: Session<DXLinkIndiChart | null>
  /** Names of the indicators ("1".."N"), in order. */
  readonly indicatorNames: readonly string[]
  /** Per-indicator states reported by the server (in/out params or script error). */
  readonly indicatorStates: Atom.Atom<DXLinkIndiChartIndicatorsStates | null>
  /** Per-indicator declared outputs (output/spline/shape/barColor/backgroundColor) from the state. */
  readonly outputs: Atom.Atom<Record<string, IndicatorOutputMeta[]>>
  readonly subscription: Atom.Atom<IndiChartSubscription | null>
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
  readonly apply: Atom.Writable<
    void,
    IndiChartSubscription & { parameters: DXLinkIndiChartIndicatorsParameters }
  >
  /**
   * Push new indicator parameters without re-subscribing.
   *
   * The server keeps the current subscription and recomputes the indicators, so the
   * candles are not refetched and the chart is not reset — the difference between
   * tweaking a moving-average period and reloading the whole history.
   */
  readonly applyParameters: Atom.Writable<void, DXLinkIndiChartIndicatorsParameters>
}

/**
 * The model for one IndiChart channel. Indicator scripts are fixed at creation (named
 * "1".."N"); candle and indicator data go to `onData` — the chart consumes them through a ref,
 * in order — while channel and indicator states go to atoms.
 */
export const makeIndiChartModel = (
  client: DXLinkClient,
  scripts: readonly string[],
  onData: IndiChartListener
): IndiChartModel => {
  const indicators: DXLinkIndiChartIndicators = Object.fromEntries(
    scripts.map((content, index) => [String(index + 1), { lang: 'dxscript-js', content } as const])
  )

  const channel = makeChannelAtoms()
  const indicatorStates = Atom.make<DXLinkIndiChartIndicatorsStates | null>(null)
  const outputs = Atom.make<Record<string, IndicatorOutputMeta[]>>({})
  const subscription = Atom.make<IndiChartSubscription | null>(null)
  const coordinator = new ChartCoordinator(onData)

  const chartSession = session({
    state: [...channelStateAtoms(channel), indicatorStates, outputs, subscription],
    open: (get) => {
      if (get(channel.closed)) {
        return Effect.succeed(null)
      }

      return Effect.gen(function* () {
        const registry = yield* AtomRegistry
        const chart = yield* Effect.acquireRelease(
          Effect.sync(() => new DXLinkIndiChart(client, indicators)),
          (chart) =>
            Effect.sync(() => {
              chart.close()
              coordinator.reset()
            })
        )
        // withParameters: false — an INDICHART channel's parameters carry the full source of
        // every indicator, which the indicator panels already render.
        yield* trackChannel(channel, chart.getChannel(), { withParameters: false })
        yield* on(chart, 'IndicatorsStateChange', (states) => {
          const declared: Record<string, IndicatorOutputMeta[]> = {}
          for (const [name, state] of Object.entries(states)) {
            declared[name] = extractStateOutputs(state)
          }
          registry.set(indicatorStates, states)
          registry.set(outputs, declared)
        })
        yield* on(chart, 'CandleSnapshot', coordinator.candleSnapshot)
        yield* on(chart, 'IndicatorsSnapshot', coordinator.indicatorsSnapshot)
        yield* on(chart, 'Update', coordinator.update)

        const current = registry.get(subscription)
        if (current !== null) {
          chart.setSubscription(current, {})
        }

        return chart
      })
    },
  })

  return {
    channel,
    session: chartSession,
    indicatorNames: Object.keys(indicators),
    indicatorStates,
    outputs,
    subscription,
    apply: command(
      (
        ctx,
        {
          symbol,
          fromTime,
          parameters,
        }: IndiChartSubscription & { parameters: DXLinkIndiChartIndicatorsParameters }
      ) => {
        const next = { symbol, fromTime }
        coordinator.reset()
        ctx.set(subscription, next)
        chartSession.current()?.setSubscription(next, parameters)
      }
    ),
    applyParameters: command((_ctx, parameters: DXLinkIndiChartIndicatorsParameters) => {
      chartSession.current()?.updateIndicatorsParameters(parameters)
    }),
  }
}
