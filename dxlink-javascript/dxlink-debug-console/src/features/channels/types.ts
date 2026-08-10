export type ChannelKind = 'feed' | 'dom' | 'indichart'

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

export type ChannelConfig = FeedConfig | DomConfig | IndiChartConfig

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

let lastIndicatorId = 0

/** A draft indicator with an identity stable across reorders and removals. */
export const createIndicatorEntry = (code = ''): IndiChartRequestEntry => {
  lastIndicatorId += 1

  return { id: `indicator-${lastIndicatorId}`, code }
}

export const MAX_INDICATORS = 10
