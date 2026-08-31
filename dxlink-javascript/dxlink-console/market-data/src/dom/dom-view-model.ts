import { DXLinkChannelState, DXLinkDepthOfMarket, DXLinkLogLevel } from '@dxfeed/dxlink-api'
import type {
  DepthOfMarketAcceptConfig,
  DepthOfMarketConfig,
  DepthOfMarketOrder,
  DXLinkClient,
} from '@dxfeed/dxlink-api'
import { ChannelErrorTracker, initialChannelErrorState } from '@dxfeed/dxlink-console-core'
import type { ChannelErrorState } from '@dxfeed/dxlink-console-core'
import type { ViewModel } from '@dxfeed/dxlink-console-core'
import { createStore } from 'zustand/vanilla'

export interface DomSnapshot {
  time: number
  bids: DepthOfMarketOrder[]
  asks: DepthOfMarketOrder[]
}

export interface DomVMState extends ChannelErrorState {
  channelState: DXLinkChannelState
  config: DepthOfMarketConfig | null
  snapshot: DomSnapshot | null
}

// Coalesce snapshots to the latest one within this window (~10fps).
const FLUSH_INTERVAL_MS = 100

/**
 * ViewModel for one DOM (Depth of Market) channel — wraps {@link DXLinkDepthOfMarket}.
 *
 * Construction is PURE (StrictMode-safe); the channel is opened in {@link start}
 * and released in {@link stop}, driven by the view's `useEffect`. Snapshots are
 * full replacements coalesced to the latest within a frame.
 */
export class DomViewModel implements ViewModel<DomVMState> {
  readonly store = createStore<DomVMState>(() => ({
    channelState: DXLinkChannelState.REQUESTED,
    config: null,
    snapshot: null,
    ...initialChannelErrorState(),
  }))

  private readonly channelErrors = new ChannelErrorTracker(this.store)
  private readonly client: DXLinkClient
  private readonly params: { symbol: string; sources: string[]; feed?: string; space?: string }
  private dom: DXLinkDepthOfMarket | null = null
  private pendingSnapshot: DomSnapshot | null = null
  private flushHandle: ReturnType<typeof setTimeout> | null = null

  constructor(
    client: DXLinkClient,
    params: { symbol: string; sources: string[]; feed?: string; space?: string }
  ) {
    this.client = client
    this.params = params
  }

  start = (): void => {
    if (this.dom !== null) return
    const dom = new DXLinkDepthOfMarket(
      this.client,
      {
        symbol: this.params.symbol,
        sources: this.params.sources,
      },
      {
        feed: this.params.feed,
        space: this.params.space,
        // A debug console wants the protocol traffic in the browser log.
        logLevel: DXLinkLogLevel.DEBUG,
      }
    )
    dom.addSnapshotListener(this.handleSnapshot)
    dom.addConfigChangeListener(this.handleConfig)
    dom.addStateChangeListener(this.handleState)
    this.channelErrors.attach(dom.getChannel())
    this.dom = dom
    this.store.setState({ channelState: dom.getState(), config: dom.getConfig() })
  }

  stop = (): void => {
    const dom = this.dom
    if (dom === null) return
    this.dom = null
    if (this.flushHandle !== null) {
      clearTimeout(this.flushHandle)
      this.flushHandle = null
    }
    this.pendingSnapshot = null
    dom.removeSnapshotListener(this.handleSnapshot)
    dom.removeConfigChangeListener(this.handleConfig)
    dom.removeStateChangeListener(this.handleState)
    this.channelErrors.detach(dom.getChannel())
    dom.close()
  }

  configure = (accept: DepthOfMarketAcceptConfig): void => {
    this.dom?.configure(accept)
  }

  clearErrors = (): void => this.channelErrors.clear()

  close = (): void => {
    this.stop()
  }

  dispose = (): void => {
    this.stop()
  }

  private handleSnapshot = (
    time: number,
    bids: DepthOfMarketOrder[],
    asks: DepthOfMarketOrder[]
  ): void => {
    if (this.dom === null) return
    this.pendingSnapshot = { time, bids, asks }
    if (this.flushHandle === null) {
      this.flushHandle = setTimeout(this.flush, FLUSH_INTERVAL_MS)
    }
  }

  private flush = (): void => {
    this.flushHandle = null
    if (this.dom === null || this.pendingSnapshot === null) return
    this.store.setState({ snapshot: this.pendingSnapshot })
    this.pendingSnapshot = null
  }

  private handleConfig = (config: DepthOfMarketConfig): void => {
    this.store.setState({ config })
  }

  private handleState = (state: DXLinkChannelState): void => {
    this.store.setState({ channelState: state })
  }
}
