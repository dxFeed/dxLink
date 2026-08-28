import type { DescMethod, DescService, FileRegistry, Message } from '@bufbuild/protobuf'

export type ChannelKind = 'feed' | 'dom' | 'indichart' | 'rpc'

export type FeedView = 'subscriptions' | 'chart'

export interface FeedConfig {
  kind: 'feed'
  view: FeedView
  /** Feed qualification — omitted from the protocol when empty. */
  feed: string
  /** Feed space — omitted from the protocol when empty. */
  space: string
}

export interface DomConfig {
  kind: 'dom'
  symbol: string
  source: string
  /** Feed qualification — omitted from the protocol when empty. */
  feed: string
  /** Feed space — omitted from the protocol when empty. */
  space: string
}

export interface IndiChartConfig {
  kind: 'indichart'
  /** Indicator scripts; the protocol names them 1..N by position. */
  indicators: string[]
}

export interface RpcConfig {
  kind: 'rpc'
  service: DescService
  method: DescMethod
  /**
   * The request to open the channel with, already parsed against `method.input`.
   *
   * Parsing happens in the request form, where a malformed request can still be corrected;
   * by the time a channel is opened the message is known to be valid.
   */
  request: Message
}

export type ChannelConfig = FeedConfig | DomConfig | IndiChartConfig | RpcConfig

export interface DraftChannel {
  id: string
  config: ChannelConfig
}

// Channel-request parameters — the values entered in each service's request
// form. Preserved between dialog opens so the user can quickly open several
// channels of the same kind.
export interface FeedRequest {
  view: FeedView
  feed: string
  space: string
}

export interface DomRequest {
  symbol: string
  source: string
  feed: string
  space: string
}

/**
 * One indicator being drafted in the request form.
 *
 * The `id` is what React keys the editor card on. It cannot be the array index: the
 * dxScript editor is uncontrolled, so an index key lets React reuse a mounted editor for
 * a different entry after a removal, leaving the visible script and the request state
 * pointing at different indicators.
 */
export interface IndiChartRequestEntry {
  id: string
  code: string
}

export interface IndiChartRequest {
  indicators: IndiChartRequestEntry[]
}

/**
 * RPC channel-request parameters.
 *
 * The registry is held here rather than re-fetched per dialog open, so a descriptor set is
 * loaded once and several channels can be opened against it.
 */
export interface RpcRequest {
  /** Descriptor-set endpoint, kept between opens. */
  url: string
  /** Registry built from the loaded descriptor set; null until one is loaded. */
  registry: FileRegistry | null
  /** Where the loaded registry came from — a URL or a file name. */
  source: string | null
  /** Fully qualified name of the selected service. */
  serviceName: string
  /** ECMAScript name of the selected method, as `DescService.method` keys it. */
  methodName: string
  /** The request message being edited, as protobuf-JSON. */
  json: string
}

let lastIndicatorId = 0

/** A draft indicator with an identity stable across reorders and removals. */
export const createIndicatorEntry = (code = ''): IndiChartRequestEntry => {
  lastIndicatorId += 1

  return { id: `indicator-${lastIndicatorId}`, code }
}

export const MAX_INDICATORS = 10
