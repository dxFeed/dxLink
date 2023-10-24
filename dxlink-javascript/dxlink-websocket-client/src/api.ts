import { DXLinkWebSocketClient } from './dxlink'
import { DXLinkWebSocketClientImpl, DXLinkWebSocketClientOptions } from './client'
import { DXLinkFeed, DXLinkFeedImpl, DXLinkFeedOptions } from './feed'
import { DXLinkLogLevel } from '@dxfeed/dxlink-core'
import { FeedContract } from './feed-messages'

/**
 * The options to use for the {@link DXLink}.
 */
export interface DXLinkOptions {
  logLevel?: DXLinkLogLevel
  /**
   * The options for the {@link DXLinkWebSocketClient}.
   */
  client?: Partial<DXLinkWebSocketClientOptions>
  /**
   * The options for the {@link DXLinkFeed}.
   */
  feed?: Partial<DXLinkFeedOptions>
}

/**
 * The main entry point for the DXLink API.
 * This class provides access to dxFeed services with a single dxLink connection.
 * It is recommended to use a single instance of this class per application.
 * @example <caption>Creating a new instance of {@link DXLink} with default options.</caption>
 * ```typescript
 * const dxlink = new DXLink()
 * ```
 * @example <caption>Connecting to the server.</caption>
 * ```typescript
 * dxlink.connect('wss://demo.dxfeed.com/dxlink-ws')
 * ```
 * @example <caption>Creating a new instance of {@link DXLinkFeed}.</caption>
 * ```typescript
 * const feed = dxlink.createFeed(FeedContract.TICKER)
 * ````
 * @example <caption>Subscribing to feed events.</caption>
 * ```typescript
 * feed.addSubscription({ type: 'Quote', symbol: 'AAPL' })
 * feed.addEventListener((events) => console.log(events))
 * ```
 */
export class DXLink {
  /**
   * A singleton instance of {@link DXLink} that is created on the first use of {@link DXLink.getInstance}.
   */
  private static instance: DXLink | undefined

  /**
   * Returns a default application-wide singleton instance of {@link DXLink}.
   * Most applications use only a single data-source and should rely on this method to get one.
   * This method creates an endpoint on the first use with a default configuration.
   */
  static getInstance(): DXLink {
    DXLink.instance = DXLink.instance ?? new DXLink()
    return DXLink.instance
  }

  private readonly client: DXLinkWebSocketClient

  /**
   * Creates a new instance of {@link DXLink} with the specified options.
   * @param options - The options to use for the instance.
   */
  constructor(private readonly options?: DXLinkOptions) {
    this.client = new DXLinkWebSocketClientImpl({
      logLevel: options?.logLevel,
      ...options?.client,
    })
  }

  /**
   * Connects to the server.
   * @see {DXLinkWebSocketClient.connect} for more details.
   */
  connect(url: string) {
    this.client.connect(url)
  }

  /**
   * Reconnects to the server.
   * @see {DXLinkWebSocketClient.reconnect} for more details.
   */
  reconnect() {
    this.client.reconnect()
  }

  /**
   * Disconnects from the server.
   * @see {DXLinkWebSocketClient.disconnect} for more details.
   */
  disconnect() {
    this.client.disconnect()
  }

  /**
   * Returns the {@link DXLinkWebSocketClient} instance.
   */
  getClient(): DXLinkWebSocketClient {
    return this.client
  }

  /**
   * Creates a new feed for the specified contract.
   * @see {DXLinkFeed} for more details.
   */
  createFeed<Contract extends FeedContract>(contract: Contract): DXLinkFeed<Contract> {
    return new DXLinkFeedImpl(this.client, contract, {
      logLevel: this.options?.logLevel,
      ...this.options?.feed,
    })
  }

  /**
   * Closes the client and releases all resources.
   */
  close() {
    this.client.close()
  }
}
