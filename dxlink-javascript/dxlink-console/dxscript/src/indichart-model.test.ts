import type {
  DXLinkClient,
  DXLinkIndiChartCandle,
  DXLinkIndiChartIndicatorsData,
} from '@dxfeed/dxlink-api'
import * as AtomRegistry from 'effect/reactivity/AtomRegistry'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ChartCoordinator, makeIndiChartModel } from './indichart-model'
import type { ChartDataType, IndiChartModel } from './indichart-model'

// `vi.mock` is hoisted above the imports, so the fake it installs has to be hoisted with it.
const { FakeIndiChart } = vi.hoisted(() => {
  type Listener = (...args: never[]) => void

  /** Stand-in for `DXLinkIndiChart`: one listener set per kind, and a record of calls. */
  class FakeIndiChart {
    static readonly instances: FakeIndiChart[] = []
    readonly indicators: unknown
    readonly listeners = new Map<string, Set<Listener>>()
    readonly subscriptions: unknown[] = []
    readonly parameterUpdates: unknown[] = []
    closed = false
    readonly channel = {
      id: 7,
      parameters: { indicators: 'source' },
      getState: () => 'REQUESTED',
      addStateChangeListener: (l: Listener) => this.add('StateChange', l),
      removeStateChangeListener: (l: Listener) => this.remove('StateChange', l),
      addErrorListener: (l: Listener) => this.add('Error', l),
      removeErrorListener: (l: Listener) => this.remove('Error', l),
    }

    constructor(_client: unknown, indicators: unknown) {
      this.indicators = indicators
      FakeIndiChart.instances.push(this)
    }

    add(kind: string, l: Listener) {
      const set = this.listeners.get(kind) ?? new Set()
      set.add(l)
      this.listeners.set(kind, set)
    }
    remove(kind: string, l: Listener) {
      this.listeners.get(kind)?.delete(l)
    }
    emit(kind: string, ...args: unknown[]) {
      for (const l of this.listeners.get(kind) ?? []) (l as (...a: unknown[]) => void)(...args)
    }
    get listenerCount() {
      return [...this.listeners.values()].reduce((n, set) => n + set.size, 0)
    }

    getChannel = () => this.channel
    getState = () => this.channel.getState()
    addIndicatorsStateChangeListener = (l: Listener) => this.add('IndicatorsStateChange', l)
    removeIndicatorsStateChangeListener = (l: Listener) => this.remove('IndicatorsStateChange', l)
    addCandleSnapshotListener = (l: Listener) => this.add('CandleSnapshot', l)
    removeCandleSnapshotListener = (l: Listener) => this.remove('CandleSnapshot', l)
    addIndicatorsSnapshotListener = (l: Listener) => this.add('IndicatorsSnapshot', l)
    removeIndicatorsSnapshotListener = (l: Listener) => this.remove('IndicatorsSnapshot', l)
    addUpdateListener = (l: Listener) => this.add('Update', l)
    removeUpdateListener = (l: Listener) => this.remove('Update', l)
    setSubscription = (subscription: unknown, parameters: unknown) => {
      this.subscriptions.push([subscription, parameters])
    }
    updateIndicatorsParameters = (parameters: unknown) => {
      this.parameterUpdates.push(parameters)
    }
    close = () => {
      this.closed = true
    }
  }

  return { FakeIndiChart }
})

vi.mock('@dxfeed/dxlink-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dxfeed/dxlink-api')>()),
  DXLinkIndiChart: FakeIndiChart,
}))

const candle = (index: number) => ({ index }) as unknown as DXLinkIndiChartCandle
const indicators = (tag: string) => ({ [tag]: {} }) as unknown as DXLinkIndiChartIndicatorsData

type Push = [candles: number[], indicators: number, dataType: ChartDataType]
const record =
  (pushes: Push[]) =>
  (
    candles: DXLinkIndiChartCandle[],
    data: DXLinkIndiChartIndicatorsData[],
    dataType: ChartDataType
  ) => {
    pushes.push([candles.map((c) => c.index), data.length, dataType])
  }

describe('ChartCoordinator', () => {
  it('sends the snapshot candles once complete, then the indicators against them, then updates', () => {
    const pushes: Push[] = []
    const coordinator = new ChartCoordinator(record(pushes))

    coordinator.candleSnapshot([candle(1)], true, true)
    coordinator.candleSnapshot([candle(2)], false, false)
    coordinator.indicatorsSnapshot(indicators('a'), true)
    coordinator.indicatorsSnapshot(indicators('b'), false)
    coordinator.update([candle(3)], indicators('c'), true)
    coordinator.update([candle(4)], indicators('d'), false)

    expect(pushes).toEqual([
      [[1, 2], 0, 'candles'],
      [[1, 2], 2, 'indicators'],
      [[3, 4], 2, 'update'],
    ])
  })

  it('holds indicators that arrive before the candles they belong to', () => {
    const pushes: Push[] = []
    const coordinator = new ChartCoordinator(record(pushes))

    coordinator.candleSnapshot([candle(1)], true, true)
    coordinator.indicatorsSnapshot(indicators('a'), false)
    expect(pushes).toEqual([])

    coordinator.candleSnapshot([], false, false)
    expect(pushes).toEqual([[[1], 0, 'candles']])
  })
})

let registry: AtomRegistry.AtomRegistry
let release: () => void
let model: IndiChartModel
let pushes: Push[]

const openChart = () => {
  release = registry.mount(model.session.atom)
  const chart = FakeIndiChart.instances[FakeIndiChart.instances.length - 1]
  if (chart === undefined) throw new Error('no chart opened')
  return chart
}

beforeEach(() => {
  FakeIndiChart.instances.length = 0
  pushes = []
  registry = AtomRegistry.make()
  model = makeIndiChartModel({} as DXLinkClient, ['spline(close)', 'spline(open)'], record(pushes))
  release = () => undefined
})

afterEach(() => {
  release()
  registry.dispose()
})

describe('IndiChart model session', () => {
  it('names the indicators 1..N and records the channel without its parameters', () => {
    const chart = openChart()

    expect(model.indicatorNames).toEqual(['1', '2'])
    expect(chart.indicators).toEqual({
      '1': { lang: 'dxscript-js', content: 'spline(close)' },
      '2': { lang: 'dxscript-js', content: 'spline(open)' },
    })
    expect(registry.get(model.channel.id)).toBe(7)
    expect(registry.get(model.channel.parameters)).toBeNull()
  })

  it('keeps the declared outputs through a re-subscribe', () => {
    const chart = openChart()
    chart.emit('IndicatorsStateChange', {
      '1': { enabled: true, inParameters: [], splines: [{ id: 1, title: 'close' }] },
    })

    registry.set(model.apply, { symbol: 'AAPL{=d}', fromTime: 0, parameters: {} })

    expect(chart.subscriptions).toEqual([[{ symbol: 'AAPL{=d}', fromTime: 0 }, {}]])
    expect(registry.get(model.outputs)['1']).toMatchObject([{ kind: 'spline', title: 'close' }])
  })

  it('pushes chart data through the coordinator', () => {
    const chart = openChart()

    chart.emit('CandleSnapshot', [candle(1)], true, false)

    expect(pushes).toEqual([[[1], 0, 'candles']])
  })

  it('updates parameters without re-subscribing', () => {
    const chart = openChart()

    registry.set(model.applyParameters, { '1': { length: 5 } })

    expect(chart.parameterUpdates).toEqual([{ '1': { length: 5 } }])
    expect(chart.subscriptions).toEqual([])
  })

  it('closes the chart, and stops pushing, when the user closes the channel', () => {
    const chart = openChart()

    registry.set(model.channel.close, undefined)
    chart.emit('CandleSnapshot', [candle(1)], true, false)

    expect(chart.closed).toBe(true)
    expect(chart.listenerCount).toBe(0)
    expect(pushes).toEqual([])
  })
})
