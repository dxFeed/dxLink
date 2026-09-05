export type FeedView = 'subscriptions' | 'chart'

/** Config a FEED channel is opened with. */
export interface FeedConfig {
  view: FeedView
  /** Feed qualification — omitted from the protocol when empty. */
  feed: string
  /** Feed space — omitted from the protocol when empty. */
  space: string
}

/**
 * FEED channel-request parameters — the values entered in the request form. Preserved
 * between dialog opens so the user can quickly open several channels of the same kind.
 */
export interface FeedRequest {
  view: FeedView
  feed: string
  space: string
}
