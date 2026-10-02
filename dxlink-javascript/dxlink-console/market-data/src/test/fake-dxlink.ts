import type {
  DepthOfMarketAcceptConfig,
  DepthOfMarketConfig,
  DepthOfMarketOrder,
  DXLinkChannelState,
  DXLinkError,
  FeedAcceptConfig,
  FeedConfig,
  FeedEventData,
} from '@dxfeed/dxlink-api'

/**
 * Stand-ins for the dxLink objects the market-data models open, for `vi.mock`.
 *
 * Type imports only: a test mocks `@dxfeed/dxlink-api` with these, so importing its runtime
 * from here would import the mock being built. Enum values are written as their literals.
 */

/** One listener kind: what the real objects keep behind each `add…Listener` pair. */
class Listeners<Args extends unknown[]> {
  readonly set = new Set<(...args: Args) => void>()
  readonly add = (listener: (...args: Args) => void) => {
    this.set.add(listener)
  }
  readonly remove = (listener: (...args: Args) => void) => {
    this.set.delete(listener)
  }
  readonly emit = (...args: Args) => {
    for (const listener of this.set) listener(...args)
  }
}

export class FakeChannel {
  readonly id: number
  readonly parameters: Record<string, unknown>
  state = 'REQUESTED' as DXLinkChannelState
  readonly stateListeners = new Listeners<[DXLinkChannelState, DXLinkChannelState]>()
  readonly errorListeners = new Listeners<[DXLinkError]>()
  readonly addStateChangeListener = this.stateListeners.add
  readonly removeStateChangeListener = this.stateListeners.remove
  readonly addErrorListener = this.errorListeners.add
  readonly removeErrorListener = this.errorListeners.remove

  constructor(id: number, parameters: Record<string, unknown>) {
    this.id = id
    this.parameters = parameters
  }

  getState = () => this.state

  setState(state: DXLinkChannelState) {
    const previous = this.state
    this.state = state
    this.stateListeners.emit(state, previous)
  }

  get listenerCount() {
    return this.stateListeners.set.size + this.errorListeners.set.size
  }
}

let lastChannelId = 0

/** The channel side shared by both fakes. */
class FakeChannelObject {
  readonly channel: FakeChannel
  closed = false

  constructor(parameters: Record<string, unknown>) {
    lastChannelId += 1
    this.channel = new FakeChannel(lastChannelId, parameters)
  }

  getChannel = () => this.channel
  getState = () => this.channel.state
  addStateChangeListener = (l: (state: DXLinkChannelState, prev: DXLinkChannelState) => void) =>
    this.channel.addStateChangeListener(l)
  removeStateChangeListener = (l: (state: DXLinkChannelState, prev: DXLinkChannelState) => void) =>
    this.channel.removeStateChangeListener(l)
  close = () => {
    this.closed = true
  }
}

export class FakeFeed extends FakeChannelObject {
  static readonly instances: FakeFeed[] = []

  readonly options: unknown
  readonly added: unknown[] = []
  readonly removed: unknown[] = []
  clears = 0
  readonly accepted: FeedAcceptConfig[] = []
  readonly configListeners = new Listeners<[FeedConfig]>()
  readonly eventListeners = new Listeners<[FeedEventData[]]>()
  readonly addConfigChangeListener = this.configListeners.add
  readonly removeConfigChangeListener = this.configListeners.remove
  readonly addEventListener = this.eventListeners.add
  readonly removeEventListener = this.eventListeners.remove

  constructor(_client: unknown, contract: string, options: unknown) {
    super({ contract })
    this.options = options
    FakeFeed.instances.push(this)
  }

  addSubscriptions = (subscriptions: unknown) => {
    this.added.push(...(Array.isArray(subscriptions) ? subscriptions : [subscriptions]))
  }
  removeSubscriptions = (subscriptions: unknown[]) => {
    this.removed.push(...subscriptions)
  }
  clearSubscriptions = () => {
    this.clears += 1
  }
  configure = (accept: FeedAcceptConfig) => {
    this.accepted.push(accept)
  }

  get listenerCount() {
    return this.channel.listenerCount + this.configListeners.set.size + this.eventListeners.set.size
  }
}

export class FakeDom extends FakeChannelObject {
  static readonly instances: FakeDom[] = []

  readonly accepted: DepthOfMarketAcceptConfig[] = []
  readonly configListeners = new Listeners<[DepthOfMarketConfig]>()
  readonly snapshotListeners = new Listeners<[number, DepthOfMarketOrder[], DepthOfMarketOrder[]]>()
  readonly addConfigChangeListener = this.configListeners.add
  readonly removeConfigChangeListener = this.configListeners.remove
  readonly addSnapshotListener = this.snapshotListeners.add
  readonly removeSnapshotListener = this.snapshotListeners.remove
  config: DepthOfMarketConfig = {
    aggregationPeriod: NaN,
    depthLimit: 0,
    dataFormat: 'FULL' as DepthOfMarketConfig['dataFormat'],
    orderFields: [],
  }

  constructor(_client: unknown, subscription: { symbol: string; sources: string[] }) {
    super({ symbol: subscription.symbol, sources: subscription.sources })
    FakeDom.instances.push(this)
  }

  getConfig = () => this.config
  configure = (accept: DepthOfMarketAcceptConfig) => {
    this.accepted.push(accept)
  }
}
